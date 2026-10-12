// Envelopes SOAP e retornos do MDF-e na SVRS. Só dados fictícios, no formato dos exemplos públicos do
// leiaute (MOC 3.00) e do WSDL: nenhuma resposta ou emissão real entra aqui.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepararIdentificacaoMdfe } from '../MDFeWizard.js';
import { diretoriosSchemaMdfe, validarXmlMdfe } from './MDFeSchema.js';
import { actionSoapMdfe, analisarRespostaXmlMdfe, montarEnvelopeSoapMdfe, OPERACOES_MDFE, OperacaoMdfe } from './MDFeTransmissao.js';

const NS_MDFE = 'xmlns="http://www.portalfiscal.inf.br/mdfe"';
const CH1 = '52261012345678000195580010000000011000000019';
const CH2 = '52261012345678000195580010000000021000000024';

const MENSAGENS: Record<OperacaoMdfe, string> = {
  MDFeRecepcaoSinc: 'H4sIAAAAAAAAA0tOzSvJSM0DAKMq1HEJAAAA',
  MDFeRecepcaoEvento: `<?xml version="1.0" encoding="UTF-8"?><eventoMDFe ${NS_MDFE} versao="3.00"><infEvento Id="ID1101115226101234567800019558001000000001100000001901"><cOrgao>52</cOrgao></infEvento></eventoMDFe>`,
  MDFeConsulta: `<consSitMDFe ${NS_MDFE} versao="3.00"><tpAmb>2</tpAmb><xServ>CONSULTAR</xServ><chMDFe>${CH1}</chMDFe></consSitMDFe>`,
  MDFeStatusServico: `<consStatServMDFe ${NS_MDFE} versao="3.00"><tpAmb>2</tpAmb><xServ>STATUS</xServ></consStatServMDFe>`,
  MDFeConsNaoEnc: `<consMDFeNaoEnc ${NS_MDFE} versao="3.00"><tpAmb>2</tpAmb><xServ>CONSULTAR NÃO ENCERRADOS</xServ><CNPJ>12345678000195</CNPJ></consMDFeNaoEnc>`
};

describe('envelope SOAP 1.2 do MDF-e, uma operação por vez', () => {
  const operacoes = Object.keys(OPERACOES_MDFE) as OperacaoMdfe[];

  it.each(operacoes)('%s: mdfeCabecMsg no Header com cUF e versaoDados, mdfeDadosMsg direto no Body', (operacao) => {
    const ns = 'http://www.portalfiscal.inf.br/mdfe/wsdl/' + operacao;
    const envelope = montarEnvelopeSoapMdfe(MENSAGENS[operacao], operacao, '52');
    expect(envelope).toContain(`<soap12:Header><mdfeCabecMsg xmlns="${ns}"><cUF>52</cUF><versaoDados>3.00</versaoDados></mdfeCabecMsg></soap12:Header>`);
    // sem elemento com o nome da operação em volta do mdfeDadosMsg
    expect(envelope).toContain(`<soap12:Body><mdfeDadosMsg xmlns="${ns}">`);
    expect(envelope).not.toMatch(new RegExp('<' + operacao + '[ >]'));
    expect(envelope.endsWith('</mdfeDadosMsg></soap12:Body></soap12:Envelope>')).toBe(true);
  });

  it.each(operacoes.filter((operacao) => operacao !== 'MDFeRecepcaoSinc'))('%s: o XML da mensagem entra como nó, não escapado', (operacao) => {
    const envelope = montarEnvelopeSoapMdfe(MENSAGENS[operacao], operacao, '52');
    expect(envelope).not.toContain('&lt;');
    expect(envelope).not.toMatch(/<\?xml[^>]*\?>[^]*<\?xml/); // só a declaração do envelope; a da mensagem sai
    expect(envelope).toContain(MENSAGENS[operacao].replace(/^<\?xml[^>]*\?>/, ''));
  });

  it('MDFeRecepcaoSinc leva o Base64 compactado como texto', () => {
    const envelope = montarEnvelopeSoapMdfe(MENSAGENS.MDFeRecepcaoSinc, 'MDFeRecepcaoSinc', 52);
    expect(envelope).toContain('>' + MENSAGENS.MDFeRecepcaoSinc + '</mdfeDadosMsg>');
  });

  it('o action carrega o método da operação, não só o namespace', () => {
    expect(operacoes.map((operacao) => actionSoapMdfe(operacao))).toEqual([
      'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoSinc/mdfeRecepcao',
      'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento/mdfeRecepcaoEvento',
      'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeConsulta/mdfeConsultaMDF',
      'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeStatusServico/mdfeStatusServicoMDF',
      'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeConsNaoEnc/mdfeConsNaoEnc'
    ]);
  });
});

function soap(corpo: string): string {
  return '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><mdfeResultMsg xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/X">' + corpo + '</mdfeResultMsg></soap:Body></soap:Envelope>';
}

describe('retornos do MDF-e', () => {
  it('consulta de situação: vale o cStat da consulta, não o do evento que ela carrega', async () => {
    const retorno = soap(`<retConsSitMDFe ${NS_MDFE} versao="3.00"><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cStat>132</cStat><xMotivo>Encerramento de MDF-e homologado</xMotivo><cUF>52</cUF><chMDFe>${CH1}</chMDFe>` +
      `<procEventoMDFe versao="3.00"><eventoMDFe versao="3.00"><infEvento><tpEvento>110112</tpEvento></infEvento></eventoMDFe><retEventoMDFe versao="3.00"><infEvento><tpAmb>2</tpAmb><cStat>135</cStat><xMotivo>Evento registrado e vinculado a MDF-e</xMotivo></infEvento></retEventoMDFe></procEventoMDFe></retConsSitMDFe>`);
    await expect(analisarRespostaXmlMdfe(retorno)).resolves.toMatchObject({ cStat: '132', xMotivo: 'Encerramento de MDF-e homologado' });
  });

  it('consulta de situação autorizada (100)', async () => {
    const retorno = soap(`<retConsSitMDFe ${NS_MDFE} versao="3.00"><cStat>100</cStat><xMotivo>Autorizado o uso do MDF-e</xMotivo><protMDFe versao="3.00"><infProt><nProt>152260000000001</nProt></infProt></protMDFe></retConsSitMDFe>`);
    await expect(analisarRespostaXmlMdfe(retorno)).resolves.toMatchObject({ cStat: '100', xMotivo: 'Autorizado o uso do MDF-e' });
  });

  it('evento sozinho: vale o cStat do infEvento', async () => {
    const retorno = soap(`<retEventoMDFe ${NS_MDFE} versao="3.00"><infEvento><tpAmb>2</tpAmb><cStat>135</cStat><xMotivo>Evento registrado e vinculado a MDF-e</xMotivo></infEvento></retEventoMDFe>`);
    await expect(analisarRespostaXmlMdfe(retorno)).resolves.toMatchObject({ cStat: '135' });
  });

  it('status do serviço', async () => {
    const retorno = soap(`<retConsStatServMDFe ${NS_MDFE} versao="3.00"><tpAmb>2</tpAmb><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo></retConsStatServMDFe>`);
    await expect(analisarRespostaXmlMdfe(retorno)).resolves.toMatchObject({ cStat: '107', xMotivo: 'Servico em Operacao' });
  });

  it('não encerrados: devolve as chaves de cada MDF-e da lista', async () => {
    const retorno = soap(`<retConsMDFeNaoEnc ${NS_MDFE} versao="3.00"><tpAmb>2</tpAmb><cStat>111</cStat><xMotivo>Consulta realizada com sucesso</xMotivo>` +
      `<infMDFe><chMDFe>${CH1}</chMDFe><nProt>152260000000001</nProt></infMDFe><infMDFe><chMDFe>${CH2}</chMDFe><nProt>152260000000002</nProt></infMDFe></retConsMDFeNaoEnc>`);
    const resultado = await analisarRespostaXmlMdfe(retorno);
    expect(resultado.cStat).toBe('111');
    expect(resultado.chaves).toEqual([CH1, CH2]);
    expect(resultado.naoEncerrados).toEqual([
      { chMDFe: CH1, nProt: '152260000000001' },
      { chMDFe: CH2, nProt: '152260000000002' }
    ]);
  });

  it('não encerrados: um único MDF-e também vira lista, e a lista vazia (112) vira vazia', async () => {
    const um = soap(`<retConsMDFeNaoEnc ${NS_MDFE} versao="3.00"><cStat>111</cStat><xMotivo>Consulta realizada com sucesso</xMotivo><infMDFe><chMDFe>${CH1}</chMDFe><nProt>152260000000001</nProt></infMDFe></retConsMDFeNaoEnc>`);
    expect((await analisarRespostaXmlMdfe(um)).chaves).toEqual([CH1]);
    const nenhum = soap(`<retConsMDFeNaoEnc ${NS_MDFE} versao="3.00"><cStat>112</cStat><xMotivo>Nenhum documento localizado</xMotivo></retConsMDFeNaoEnc>`);
    const resultado = await analisarRespostaXmlMdfe(nenhum);
    expect(resultado).toMatchObject({ cStat: '112', chaves: [] });
  });
});

describe('ordem de ide', () => {
  it('sai na sequência do XSD, qualquer que seja a ordem em que o payload chegou', () => {
    const payload: any = {
      infMDFe: {
        ide: { UFFim: 'SP', verProc: 'Vanir', procEmi: '0', dhEmi: '2026-10-09T12:00:00-03:00', modal: '1', nMDF: 5, serie: 1, tpEmit: 2, tpAmb: 2, UFIni: 'GO', cUF: '52', tpEmis: 1 },
        emit: { CNPJ: '12345678000195' }
      }
    };
    prepararIdentificacaoMdfe(payload, '12345678');
    expect(Object.keys(payload.infMDFe.ide)).toEqual([
      'cUF', 'tpAmb', 'tpEmit', 'mod', 'serie', 'nMDF', 'cMDF', 'cDV', 'modal', 'dhEmi', 'tpEmis', 'procEmi', 'verProc', 'UFIni', 'UFFim'
    ]);
  });
});

describe('caminho dos XSD', () => {
  it('não depende do diretório de trabalho', async () => {
    const original = process.cwd();
    try {
      process.chdir(mkdtempSync(path.join(tmpdir(), 'mdfe-cwd-')));
      // recusado PELO XSD: "NAO_ENCONTRADO" seria o caminho por cwd falhando
      await expect(validarXmlMdfe('<MDFe ' + NS_MDFE + '/>')).rejects.toThrow('MDFE_SCHEMA_INVALIDO');
    } finally {
      process.chdir(original);
    }
  });

  it('procura a partir do módulo, no código-fonte e no pacote construído', () => {
    expect(diretoriosSchemaMdfe('/pacote/dist/src/util')).toEqual(['/pacote/dist/resources/schemas', '/pacote/resources/schemas']);
  });
});
