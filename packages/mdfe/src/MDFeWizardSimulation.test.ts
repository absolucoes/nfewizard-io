import { gunzipSync } from 'node:zlib';
import { MDFeWizard, MDFePayload } from './MDFeWizard.js';

const SOAP_AUTORIZADO = '<retEnviMDFe><cStat>100</cStat><xMotivo>Autorizado em simulação</xMotivo><protMDFe><infProt><nProt>123</nProt></infProt></protMDFe></retEnviMDFe>';
const SOAP_EVENTO = '<retEnvEvento><cStat>128</cStat><retEventoMDFe><infEvento><cStat>135</cStat><xMotivo>Evento registrado em simulação</xMotivo></infEvento></retEventoMDFe></retEnvEvento>';

jest.mock('@nfewizard/shared', () => ({
  Environment: class {
    async loadEnvironment() {
      return { axios: { post: jest.fn().mockImplementation((url: string) => Promise.resolve({ data: url.includes('MDFeRecepcaoEvento') ? SOAP_EVENTO : SOAP_AUTORIZADO })) } };
    }
    getConfig() { return { dfe: { UF: 'GO' } }; }
  },
  XmlBuilder: class {
    gerarXml() { return '<MDFe><infMDFe></infMDFe></MDFe>'; }
    assinarXML(xml: string) { return xml.replace('</MDFe>', '<Signature>ASSINATURA-DE-TESTE</Signature></MDFe>'); }
  }
}));

jest.mock('./util/MDFeSchema.js', () => ({
  validarXmlMdfe: jest.fn().mockResolvedValue(undefined)
}));

describe('MDFeWizard — simulação interna', () => {
  it('monta, assina com assinatura fictícia, compacta e interpreta resposta cStat 100 controlada', async () => {
    const wizard = new MDFeWizard();
    await wizard.MDFe_LoadEnvironment({ config: {} as any });
    const payload: MDFePayload = {
      infMDFe: {
        ide: { cUF: '35', dhEmi: '2026-10-09T12:00:00-03:00', serie: 1, nMDF: 1, tpAmb: 2, tpEmis: 1 },
        emit: { CNPJ: 'AB12CD34000195' }
      }
    };

    const resultado = await wizard.MDFe_Autorizacao(payload);
    const transporte = (wizard as any).axios;
    const [url, envelope, options] = transporte.post.mock.calls[0];
    const mensagem = envelope.match(/<mdfeDadosMsg>([^<]+)<\/mdfeDadosMsg>/)?.[1];
    const xmlEnviado = gunzipSync(Buffer.from(mensagem, 'base64')).toString('utf8');
    expect(url).toContain('mdfe-homologacao.svrs.rs.gov.br');
    expect(envelope).toContain('<MDFeRecepcaoSinc ');
    expect(options.headers['Content-Type']).toContain('application/soap+xml');
    expect(xmlEnviado).toContain('<infMDFeSupl>');
    expect(xmlEnviado).toContain('/mdfe/qrCode?');
    expect(resultado).toMatchObject({ success: true, cStat: '100', xMotivo: 'Autorizado em simulação', nProt: '123' });
  });

  it('simula status, consulta e lista de MDF-e não encerrados', async () => {
    const wizard = new MDFeWizard();
    await wizard.MDFe_LoadEnvironment({ config: {} as any });
    const status = await wizard.MDFe_ConsultaStatusServico(2);
    const consulta = await wizard.MDFe_Consulta('352610AB12CD34000195580010000000011000000001', 2);
    const naoEncerrados = await wizard.MDFe_ConsNaoEncerrados('AB12CD34000195', 2);
    expect(status).toMatchObject({ cStat: '100', xMotivo: 'Autorizado em simulação' });
    expect(consulta).toMatchObject({ cStat: '100' });
    expect(naoEncerrados).toMatchObject({ cStat: '100' });
    expect((wizard as any).axios.post).toHaveBeenCalledTimes(3);
  });

  it('simula cancelamento, encerramento e inclusão de condutor com cStat 135', async () => {
    const wizard = new MDFeWizard();
    await wizard.MDFe_LoadEnvironment({ config: {} as any });
    const base = {
      cOrgao: '35' as const,
      tpAmb: 2 as const,
      cnpj: 'AB12CD34000195',
      chave: '352610AB12CD34000195580010000000011000000001',
      dhEvento: '2026-10-09T12:00:00-03:00',
      nProt: '123'
    };
    const eventos: any[] = [
      { ...base, tpEvento: '110111', xJust: 'Cancelamento fictício' },
      { ...base, tpEvento: '110112', dtEnc: '2026-10-09', cUF: '35', cMun: '3550308' },
      { ...base, tpEvento: '110114', xNome: 'Motorista de Teste', cpf: '12345678909' }
    ];
    for (const evento of eventos) {
      const resultado = await wizard.MDFe_RecepcaoEvento(evento);
      expect(resultado).toMatchObject({ cStat: '135', xMotivo: 'Evento registrado em simulação' });
    }
    expect((wizard as any).axios.post).toHaveBeenCalledTimes(3);
  });
});
