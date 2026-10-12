import { gunzipSync } from 'node:zlib';
import { analisarRespostaXmlMdfe, compactarXmlMdfe, interpretarRetornoAutorizacaoMdfe, montarEnvelopeSoapMdfe } from './MDFeTransmissao.js';

describe('fluxo de recepção síncrona MDF-e', () => {
  it('compacta o XML para GZip em Base64', () => {
    const xml = '<MDFe>teste</MDFe>';
    expect(gunzipSync(Buffer.from(compactarXmlMdfe(xml), 'base64')).toString()).toBe(xml);
  });

  it('coloca o payload Base64 na operação SOAP de autorização', () => {
    const envelope = montarEnvelopeSoapMdfe('H4sI-test==', 'MDFeRecepcaoSinc');
    expect(envelope).toContain('<MDFeRecepcaoSinc ');
    expect(envelope).toContain('<mdfeDadosMsg>H4sI-test==</mdfeDadosMsg>');
  });

  it('monta mdfeProc quando a resposta simulada contém cStat 100', async () => {
    const xmlRetorno = '<retEnviMDFe><cStat>100</cStat><xMotivo>Autorizado</xMotivo><protMDFe><infProt><nProt>123</nProt></infProt></protMDFe></retEnviMDFe>';
    const resultado = await interpretarRetornoAutorizacaoMdfe(xmlRetorno, '<MDFe/>');
    expect(resultado).toMatchObject({ success: true, cStat: '100', xMotivo: 'Autorizado', nProt: '123' });
    expect(resultado.xmlProcessado).toContain('<mdfeProc');
  });

  it('interpreta evento simulado 135 mesmo com retorno de lote 128', async () => {
    const xml = '<retEnvEvento><cStat>128</cStat><retEventoMDFe><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo></infEvento></retEventoMDFe></retEnvEvento>';
    await expect(analisarRespostaXmlMdfe(xml)).resolves.toMatchObject({ cStat: '135', xMotivo: 'Evento registrado' });
  });

  it.each([
    ['<retEnviMDFe><cStat>204</cStat><xMotivo>Rejeitado</xMotivo></retEnviMDFe>', '204'],
    ['<retEnviMDFe><xMotivo>Resposta incompleta</xMotivo></retEnviMDFe>', undefined]
  ])('mantém rejeição e ausência de cStat identificáveis', async (xml, cStat) => {
    const resultado = await interpretarRetornoAutorizacaoMdfe(xml, '<MDFe/>');
    expect(resultado.success).toBe(false);
    expect(resultado.cStat).toBe(cStat);
    expect(resultado.xMotivo).toBeTruthy();
  });
});
