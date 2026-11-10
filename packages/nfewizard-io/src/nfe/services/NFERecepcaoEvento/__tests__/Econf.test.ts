/*
 * Conciliação financeira (ECONF, 110750) e seu cancelamento (110751) da NF-e (modelo 55): o evento vai à SVRS
 * (Ambiente Nacional, cOrgao 92) em qualquer UF, em SOAP 1.2, e o XML passa pelo XSD da NT 2024.002 antes de sair.
 * Utility e GerarConsulta são os de verdade; só o axios é falso. Certificado: par de chaves gerado na hora.
 */
import { generateKeyPairSync } from 'crypto';
import { Utility, XmlBuilder, GerarConsulta, NFE_SchemaValidate } from '@nfewizard/shared';

const { NFERecepcaoEventoService } = require('../NFERecepcaoEventoService');

// Chave fictícia de GO (cUF 52), modelo 55, série 1, tpEmis 1.
const CHAVE = '52261111222333000181550010000000011123456789';
const SVRS_HOMOLOGACAO = 'https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx';
const SVRS_PRODUCAO = 'https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx';

const RET_EVENTO = (tpEvento: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cOrgao>92</cOrgao><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cOrgao>92</cOrgao><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${CHAVE}</chNFe><tpEvento>${tpEvento}</tpEvento></infEvento></retEvento></retEnvEvento></nfeResultMsg></soap:Body></soap:Envelope>`;

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/** O par de chaves do teste não é certificado: o KeyInfo sai vazio e o XSD exige um X509Certificate. */
function paraXsd(xml: string) {
    return xml.replace(/<KeyInfo\/>|<KeyInfo>[\s\S]*?<\/KeyInfo>/, '<KeyInfo><X509Data><X509Certificate>AAAA</X509Certificate></X509Data></KeyInfo>');
}

type Chamada = { url: string; corpo: string; headers: Record<string, string> };

function montar(UF: string, ambiente: 1 | 2, tpEvento = '110750') {
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
        getCert: () => publicKey,
        getCertKey: () => privateKey,
    };
    const utility = new Utility(environment);
    utility.salvaConsulta = () => undefined;
    utility.salvaRetorno = () => undefined;
    const xmlBuilder = new XmlBuilder(environment);
    const assinar = xmlBuilder.assinarXML.bind(xmlBuilder);
    (xmlBuilder as any).assinarXML = (xml: string, tag: string) => paraXsd(assinar(xml, tag));
    const gerarConsulta = new GerarConsulta(environment, utility, xmlBuilder);
    const axios: any = {
        post: async (url: string, corpo: string, opcoes: any) => {
            chamadas.push({ url, corpo, headers: opcoes?.headers ?? {} });
            return { data: RET_EVENTO(tpEvento) };
        },
    };
    const saveFiles: any = { salvaArquivos: () => undefined };
    const servico = new NFERecepcaoEventoService(environment, utility, xmlBuilder, axios, saveFiles, gerarConsulta);
    return { servico, chamadas, ambiente };
}

const PIX = { indPag: 0, tPag: '17', vPag: '50.00', dPag: '2026-10-13' };
const BOLETO = { indPag: 1, tPag: '15', vPag: '30.00', dPag: '2026-10-20' };
const CARTAO = {
    indPag: 0, tPag: '03', vPag: '20.00', dPag: '2026-10-13',
    CNPJPag: '11222333000181', UFPag: 'GO', CNPJIF: '33444555000166', tBand: '01', cAut: 'A1B2C3',
};

function econf(ambiente: number, detPag: unknown[] = [PIX, BOLETO, CARTAO], extra: Record<string, unknown> = {}) {
    return {
        cOrgao: 52,
        tpAmb: ambiente,
        CNPJ: '11222333000181',
        chNFe: CHAVE,
        dhEvento: '2026-10-13T10:30:00-03:00',
        tpEvento: '110750',
        nSeqEvento: 1,
        verEvento: '1.00',
        detEvento: { verAplic: 'Vanir 1.0', detPag },
        ...extra,
    };
}

function cancelamento(ambiente: number, extra: Record<string, unknown> = {}) {
    return {
        cOrgao: 52,
        tpAmb: ambiente,
        CNPJ: '11222333000181',
        chNFe: CHAVE,
        dhEvento: '2026-10-13T11:00:00-03:00',
        tpEvento: '110751',
        nSeqEvento: 1,
        verEvento: '1.00',
        detEvento: { verAplic: 'Vanir 1.0', nProtEvento: '152260000000002' },
        ...extra,
    };
}

describe('ECONF (110750) da NF-e', () => {
    it('o XML do lote passa no XSD do ECONF com três detPag (Pix, boleto e cartão)', async () => {
        const { servico } = montar('GO', 2);
        const xml = (servico as any).gerarXmlRecepcaoEvento([econf(2)], 1, false) as string;
        expect(xml.match(/<detPag>/g)).toHaveLength(3);
        expect(xml).toContain('<descEvento>ECONF</descEvento>');
        const r = await NFE_SchemaValidate(xml, 'NFEEventoEConf');
        expect(r.errors).toEqual([]);
        expect(r.success).toBe(true);
    });

    it('vai à SVRS com cOrgao 92, em SOAP 1.2, mesmo para o emitente de GO (homologação)', async () => {
        const { servico, chamadas } = montar('GO', 2);
        const ret = await servico.Exec({ idLote: 1, modelo: '55', evento: [econf(2)] });
        expect(chamadas).toHaveLength(1);
        expect(chamadas[0].url).toBe(SVRS_HOMOLOGACAO);
        expect(chamadas[0].headers['Content-Type']).toMatch(/^application\/soap\+xml/);
        expect(chamadas[0].corpo).toContain('<cOrgao>92</cOrgao>');
        expect(chamadas[0].corpo).not.toContain('<cOrgao>52</cOrgao>');
        expect(chamadas[0].corpo.match(/<detPag>/g)).toHaveLength(3);
        expect(ret.xMotivos[0]).toMatchObject({ cStat: '135', tipoEvento: 'ECONF' });
    });

    it.each([
        ['SP', 1, SVRS_PRODUCAO],
        ['SP', 2, SVRS_HOMOLOGACAO],
        ['MG', 1, SVRS_PRODUCAO],
    ] as const)('emitente de %s, ambiente %s → SVRS', async (UF, ambiente, url) => {
        const { servico, chamadas } = montar(UF, ambiente);
        await servico.Exec({ idLote: 1, modelo: '55', evento: [econf(ambiente)] });
        expect(chamadas[0].url).toBe(url);
    });

    it('não envia XML que o XSD recusa (tPag malformado)', async () => {
        const { servico, chamadas } = montar('GO', 2);
        await expect(servico.Exec({ idLote: 1, modelo: '55', evento: [econf(2, [{ ...PIX, tPag: '1' }])] }))
            .rejects.toThrow(/ECONF não passa no XSD/);
        expect(chamadas).toHaveLength(0);
    });

    it('o 110111 de uma nota normal segue na SEFAZ da UF, não na SVRS', async () => {
        const { servico, chamadas } = montar('GO', 2, '110111');
        const cancela = {
            cOrgao: 52, tpAmb: 2, CNPJ: '11222333000181', chNFe: CHAVE, dhEvento: '2026-10-13T10:30:00-03:00',
            tpEvento: '110111', nSeqEvento: 1, verEvento: '1.00',
            detEvento: { descEvento: 'Cancelamento', nProt: '152260000000001', xJust: 'Cancelamento de teste da nota' },
        };
        await servico.Exec({ idLote: 1, modelo: '55', evento: [cancela] }).catch(() => undefined);
        expect(chamadas[0].url).toContain('homolog.sefaz.go.gov.br');
    });

    it('recusa lote vazio e com mais de 20 eventos, antes da rede', async () => {
        const { servico, chamadas } = montar('GO', 2);
        await expect(servico.Exec({ idLote: 1, modelo: '55', evento: [] })).rejects.toThrow(/ao menos um evento/);
        const vinte1 = Array.from({ length: 21 }, (_, i) => econf(2, [PIX], { nSeqEvento: (i % 99) + 1 }));
        await expect(servico.Exec({ idLote: 1, modelo: '55', evento: vinte1 })).rejects.toThrow(/máximo é 20/);
        expect(chamadas).toHaveLength(0);
    });

    it('aceita 20 eventos no lote', async () => {
        const { servico, chamadas } = montar('GO', 2);
        const vinte = Array.from({ length: 20 }, (_, i) => econf(2, [PIX], { nSeqEvento: i + 1 }));
        await servico.Exec({ idLote: 1, modelo: '55', evento: vinte });
        expect(chamadas).toHaveLength(1);
        expect(chamadas[0].corpo.match(/<evento /g)).toHaveLength(20);
    });

    it('recusa lote que mistura o ECONF com o seu cancelamento, sem ir à rede', async () => {
        const { servico, chamadas } = montar('GO', 2);
        await expect(servico.Exec({ idLote: 1, modelo: '55', evento: [econf(2), cancelamento(2)] })).rejects.toThrow(/mistura/);
        expect(chamadas).toHaveLength(0);
    });
});

describe('cancelamento do ECONF (110751) da NF-e', () => {
    it('o XML do lote passa no XSD do cancelamento do ECONF', async () => {
        const { servico } = montar('GO', 2, '110751');
        const xml = (servico as any).gerarXmlRecepcaoEvento([cancelamento(2)], 1, false) as string;
        expect(xml).toContain('<descEvento>Cancelamento Conciliação Financeira</descEvento>');
        const r = await NFE_SchemaValidate(xml, 'NFEEventoCancEConf');
        expect(r.errors).toEqual([]);
        expect(r.success).toBe(true);
    });

    it('vai à SVRS com cOrgao 92 e o retorno ganha o nome do evento', async () => {
        const { servico, chamadas } = montar('GO', 2, '110751');
        const ret = await servico.Exec({ idLote: 1, modelo: '55', evento: [cancelamento(2)] });
        expect(chamadas[0].url).toBe(SVRS_HOMOLOGACAO);
        expect(chamadas[0].corpo).toContain('<cOrgao>92</cOrgao>');
        expect(ret.xMotivos[0]).toMatchObject({ cStat: '135', tipoEvento: 'Cancelamento ECONF' });
    });

    it('não envia protocolo que não tem 15 dígitos', async () => {
        const { servico, chamadas } = montar('GO', 2, '110751');
        await expect(servico.Exec({ idLote: 1, modelo: '55', evento: [cancelamento(2, { detEvento: { verAplic: 'Vanir 1.0', nProtEvento: '123' } })] }))
            .rejects.toThrow(/não passa no XSD/);
        expect(chamadas).toHaveLength(0);
    });
});
