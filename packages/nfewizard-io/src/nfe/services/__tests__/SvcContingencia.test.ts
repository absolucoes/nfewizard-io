/*
 * Contingência SVC da NF-e (modelo 55): status, autorização, consulta e evento regional vão ao webservice da
 * SVC-AN (tpEmis 6) ou da SVC-RS (tpEmis 7), não ao da UF. Utility e GerarConsulta são os de verdade; só o axios
 * é falso, para ler a URL, o Content-Type e o XML enviados. Nenhum certificado: o evento não é assinado e o XSD não
 * é validado, porque o que se prova aqui é o roteamento.
 */
import { Utility, XmlBuilder, GerarConsulta, modeloSvcPorTpEmis, modeloSvcPorChave } from '@nfewizard/shared';

const { NFEStatusServicoService } = require('../NFEStatusServico/NFEStatusServicoService');
const { NFEconsultaProtocoloService } = require('../NFEConsultaProtocolo/NFEconsultaProtocoloService');
const { NFERecepcaoEventoService } = require('../NFERecepcaoEvento/NFERecepcaoEventoService');
const NFEAutorizacaoService = require('../NFEAutorizacao/NFEAutorizacaoService').default;

const RET_STATUS = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4"><retConsStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><verAplic>SVRS202611</verAplic><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo><cUF>52</cUF></retConsStatServ></nfeResultMsg></soap:Body></soap:Envelope>`;
const RET_CONSULTA = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"><retConsSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><verAplic>SVRS202611</verAplic><cStat>217</cStat><xMotivo>Rejeicao: NF-e nao consta na base de dados da SEFAZ</xMotivo><cUF>52</cUF></retConsSitNFe></nfeResultMsg></soap:Body></soap:Envelope>`;
const RET_EVENTO = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb><verAplic>SVC</verAplic><cOrgao>52</cOrgao><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><verAplic>SVC</verAplic><cOrgao>52</cOrgao><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>CHAVE</chNFe><tpEvento>110111</tpEvento></infEvento></retEvento></retEnvEvento></nfeResultMsg></soap:Body></soap:Envelope>`;

// Chaves fictícias de GO (cUF 52), modelo 55, série 1; a posição 35 é o tpEmis.
const chave = (tpEmis: string) => `5226111234567800019555001000000001${tpEmis}12345678` + '9';

type Chamada = { url: string; corpo: string; headers: Record<string, string> };

function montar(UF: string, ambiente: 1 | 2, retorno: string) {
    const chamadas: Chamada[] = [];
    const config: any = {
        dfe: { ambiente, UF, baixarXMLDistribuicao: false },
        nfe: { ambiente, versaoDF: '4.00' },
        lib: { useForSchemaValidation: 'validateSchemaJsBased' },
    };
    const environment: any = {
        config,
        getConfig: () => config,
        getHttpAgent: () => ({}),
        getCert: () => '',
        getCertKey: () => '',
    };
    const utility = new Utility(environment);
    utility.salvaConsulta = () => undefined;
    utility.salvaRetorno = () => undefined;
    // Sem certificado não há assinatura, e o XSD do evento exige uma; o que se prova aqui é o roteamento.
    (utility as any).validateSchemaJsBased = async () => undefined;
    const xmlBuilder = new XmlBuilder(environment);
    (xmlBuilder as any).assinarXML = (xml: string) => xml;
    const gerarConsulta = new GerarConsulta(environment, utility, xmlBuilder);
    jest.spyOn(gerarConsulta as any, 'gerarConsulta');
    const axios: any = {
        post: async (url: string, corpo: string, opcoes: any) => {
            chamadas.push({ url, corpo, headers: opcoes?.headers ?? {} });
            return { data: retorno.replace('CHAVE', chave('6')) };
        },
    };
    const saveFiles: any = { salvaArquivos: () => undefined };
    return { environment, utility, xmlBuilder, axios, saveFiles, gerarConsulta, chamadas };
}

describe('tpEmis e chave → SVC', () => {
    it('tpEmis 6 é SVC-AN, 7 é SVC-RS, o resto segue a autorizadora normal', () => {
        expect(modeloSvcPorTpEmis(6)).toBe('NFeSVC-AN');
        expect(modeloSvcPorTpEmis('7')).toBe('NFeSVC-RS');
        for (const t of [1, 4, 5, 9, '', undefined]) expect(modeloSvcPorTpEmis(t as any)).toBeUndefined();
    });

    it('lê o tpEmis da posição 35 da chave', () => {
        expect(chave('7')).toHaveLength(44);
        expect(modeloSvcPorChave(chave('6'))).toBe('NFeSVC-AN');
        expect(modeloSvcPorChave(chave('7'))).toBe('NFeSVC-RS');
        expect(modeloSvcPorChave(chave('1'))).toBeUndefined();
        expect(modeloSvcPorChave('123')).toBeUndefined();
    });
});

describe('status do serviço com autorizadora', () => {
    const casos: [string, 1 | 2, string | undefined, string][] = [
        ['GO', 2, 'SVC-RS', 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx'],
        ['GO', 1, 'SVC-RS', 'https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx'],
        ['SP', 2, 'SVC-AN', 'https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx'],
        ['SP', 1, 'SVC-AN', 'https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx'],
        ['GO', 2, 'SVRS', 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx'],
    ];
    it.each(casos)('%s, ambiente %s, %s → %s', async (UF, ambiente, autorizadora, url) => {
        const m = montar(UF, ambiente, RET_STATUS);
        const s = new NFEStatusServicoService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        const r = await s.Exec({ autorizadora });
        expect(m.chamadas).toHaveLength(1);
        expect(m.chamadas[0].url).toBe(url);
        expect(r.cStat).toBe('107');
    });

    it('sem autorizadora consulta a SEFAZ da UF (GO), como antes', async () => {
        const m = montar('GO', 2, RET_STATUS);
        const s = new NFEStatusServicoService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        await s.Exec();
        expect(m.chamadas[0].url).toContain('homolog.sefaz.go.gov.br');
    });

    it('a SVC-AN recebe SOAP 1.2 mesmo quando a UF é SP (que usa text/xml no próprio webservice)', async () => {
        const m = montar('SP', 2, RET_STATUS);
        const s = new NFEStatusServicoService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        await s.Exec({ autorizadora: 'SVC-AN' });
        expect(m.chamadas[0].headers['Content-Type']).toMatch(/^application\/soap\+xml/);
        expect(m.chamadas[0].corpo).toContain('<cUF>35</cUF>');
    });

    it('o cUF do consStatServ continua o da UF do emitente', async () => {
        const m = montar('GO', 2, RET_STATUS);
        const s = new NFEStatusServicoService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        await s.Exec({ autorizadora: 'SVC-RS' });
        expect(m.chamadas[0].corpo).toContain('<cUF>52</cUF>');
    });

    it('recusa autorizadora desconhecida sem ir à rede', async () => {
        const m = montar('GO', 2, RET_STATUS);
        const s = new NFEStatusServicoService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        await expect(s.Exec({ autorizadora: 'SVC-XX' })).rejects.toThrow(/Autorizadora desconhecida/);
        expect(m.chamadas).toHaveLength(0);
    });
});

describe('autorização em SVC', () => {
    const nota = (tpEmis: number) => ({ infNFe: { ide: { tpEmis }, emit: { IE: '101010101' } } });

    it.each([
        [6, 'NFeSVC-AN'],
        [7, 'NFeSVC-RS'],
        [1, 'NFe'],
    ])('tpEmis %s escolhe o modelo %s', (tpEmis, modelo) => {
        const s = new NFEAutorizacaoService();
        s.modelo = 'NFe';
        expect(s['getModelo']({ NFe: [nota(tpEmis)] })).toBe(modelo);
    });

    it('recusa lote que mistura SVC com emissão normal', () => {
        const s = new NFEAutorizacaoService();
        s.modelo = 'NFe';
        expect(() => s['getModelo']({ NFe: [nota(7), nota(1)] })).toThrow(/mistura/);
    });

    it('SVC tem prioridade sobre o emitente sem IE (SVRS)', () => {
        const s = new NFEAutorizacaoService();
        s.modelo = 'NFe';
        expect(s['getModelo']({ NFe: { infNFe: { ide: { tpEmis: 7 }, emit: {} } } })).toBe('NFeSVC-RS');
    });

    it.each([
        ['NFeSVC-RS', 2, 'NFEAutorizacao', 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx'],
        ['NFeSVC-RS', 2, 'NFERetAutorizacao', 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx'],
        ['NFeSVC-AN', 2, 'NFEAutorizacao', 'https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx'],
        ['NFeSVC-AN', 2, 'NFERetAutorizacao', 'https://hom.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx'],
        ['NFeSVC-RS', 1, 'NFEAutorizacao', 'https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx'],
        ['NFeSVC-AN', 1, 'NFEAutorizacao', 'https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx'],
    ])('%s, ambiente %s, %s → %s', (modelo, ambiente, metodo, url) => {
        const m = montar('GO', ambiente as 1 | 2, RET_STATUS);
        expect(m.utility.getWebServiceUrl(metodo as string, false, '', modelo as string)).toBe(url);
    });
});

describe('consulta de protocolo de nota em SVC', () => {
    it.each([
        ['7', 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx'],
        ['6', 'https://hom.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx'],
    ])('chave com tpEmis %s → %s', async (tpEmis, url) => {
        const m = montar('GO', 2, RET_CONSULTA);
        const s = new NFEconsultaProtocoloService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        await s.Exec(chave(tpEmis)).catch(() => undefined);
        expect(m.chamadas[0].url).toBe(url);
    });

    it('chave de emissão normal continua na SEFAZ da UF', async () => {
        const m = montar('GO', 2, RET_CONSULTA);
        const s = new NFEconsultaProtocoloService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        await s.Exec(chave('1')).catch(() => undefined);
        expect(m.chamadas[0].url).toContain('homolog.sefaz.go.gov.br');
    });
});

describe('evento regional de nota em SVC', () => {
    const cancelamento = (ch: string) => ({
        cOrgao: 52,
        tpEvento: '110111',
        chNFe: ch,
        nSeqEvento: 1,
        CNPJ: '12345678000195',
        dhEvento: '2026-11-10T10:00:00-03:00',
        verEvento: '1.00',
        detEvento: { descEvento: 'Cancelamento', nProt: '152260000000001', xJust: 'Cancelamento de teste da contingencia SVC' },
    });

    it.each([
        ['6', 'https://hom.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx'],
        ['7', 'https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx'],
    ])('cancelamento de nota com tpEmis %s → %s', async (tpEmis, url) => {
        const m = montar('GO', 2, RET_EVENTO);
        const s = new NFERecepcaoEventoService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        await s.Exec({ idLote: 1, evento: [cancelamento(chave(tpEmis))] }).catch(() => undefined);
        expect(m.chamadas).toHaveLength(1);
        expect(m.chamadas[0].url).toBe(url);
        expect(m.chamadas[0].headers['Content-Type']).toMatch(/^application\/soap\+xml/);
    });

    it('cancelamento de nota normal continua na SEFAZ da UF', async () => {
        const m = montar('GO', 2, RET_EVENTO);
        const s = new NFERecepcaoEventoService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        await s.Exec({ idLote: 1, evento: [cancelamento(chave('1'))] }).catch(() => undefined);
        expect(m.chamadas[0].url).toContain('homolog.sefaz.go.gov.br');
    });

    it('recusa lote regional que mistura nota da SVC com nota normal, sem ir à rede', async () => {
        const m = montar('GO', 2, RET_EVENTO);
        const s = new NFERecepcaoEventoService(m.environment, m.utility, m.xmlBuilder, m.axios, m.saveFiles, m.gerarConsulta);
        await expect(s.Exec({ idLote: 1, evento: [cancelamento(chave('7')), cancelamento(chave('1'))] })).rejects.toThrow(/mistura/);
        expect(m.chamadas).toHaveLength(0);
    });
});
