import path from 'node:path';
import libxmljs from 'libxmljs2';
import xsdAssembler from 'xsd-assembler';

// Correção do Vanir (NT 2025.002-RTC, leiaute 1.51): CNPJ alfanumérico na chave e nos tipos,
// e tpNFCredito 04 a 06. Sem a correção, o XSD empacotado recusa XML válido da SEFAZ.
const dirSchemas = path.resolve(__dirname, '../../../resources/schemas');

async function validar(arquivoXsd: string, xml: string): Promise<{ valido: boolean; erros: string[] }> {
    const xsd = await xsdAssembler.assemble(path.join(dirSchemas, arquivoXsd));
    const xsdDoc = libxmljs.parseXml(xsd, { baseUrl: `${dirSchemas}/` });
    const xmlDoc = libxmljs.parseXml(xml);
    const valido = xmlDoc.validate(xsdDoc);
    return { valido, erros: xmlDoc.validationErrors.map((e) => e.message) };
}

// 6 dígitos (cUF + AAMM) + CNPJ alfanumérico (12 posições + 2 DV numéricos) + 26 dígitos
const chaveAlfa = '522610' + '12ABC34501DE35' + '57' + '0010000000011' + '1' + '23456787';
const chaveNumerica = '52261011222333000181570010000000011123456787';

const consSit = (chave: string) =>
    `<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chave}</chNFe></consSitNFe>`;

// Esquema de apoio que expõe os tipos simples do leiaute para teste direto
const envoltorio = (tipo: string, valor: string) => {
    const xsd = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:n="http://www.portalfiscal.inf.br/nfe" targetNamespace="http://www.portalfiscal.inf.br/nfe" elementFormDefault="qualified"><xs:include schemaLocation="leiauteNFe_v4.00.xsd"/><xs:element name="v" type="n:${tipo}"/></xs:schema>`;
    const xsdDoc = libxmljs.parseXml(xsd, { baseUrl: `${dirSchemas}/` });
    const xmlDoc = libxmljs.parseXml(`<v xmlns="http://www.portalfiscal.inf.br/nfe">${valor}</v>`);
    return xmlDoc.validate(xsdDoc);
};

describe('XSD da NF-e empacotado com a NT 2025.002-RTC', () => {
    it('a chave de teste tem 44 posições', () => {
        expect(chaveAlfa).toHaveLength(44);
        expect(chaveNumerica).toHaveLength(44);
    });

    it('continua aceitando chave numérica', async () => {
        const r = await validar('consSitNFe_v4.00.xsd', consSit(chaveNumerica));
        expect(r.erros).toEqual([]);
        expect(r.valido).toBe(true);
    });

    it('aceita chave com CNPJ alfanumérico', async () => {
        const r = await validar('consSitNFe_v4.00.xsd', consSit(chaveAlfa));
        expect(r.erros).toEqual([]);
        expect(r.valido).toBe(true);
    });

    it('recusa letra fora da posição do CNPJ na chave', async () => {
        const ruim = 'A' + chaveNumerica.slice(1);
        expect((await validar('consSitNFe_v4.00.xsd', consSit(ruim))).valido).toBe(false);
    });

    it('aceita CNPJ alfanumérico no tipo TCnpj, recusa minúscula e DV com letra', () => {
        expect(envoltorio('TCnpj', '12ABC34501DE35')).toBe(true);
        expect(envoltorio('TCnpj', '11222333000181')).toBe(true);
        expect(envoltorio('TCnpj', '12abc34501de35')).toBe(false);
        expect(envoltorio('TCnpj', '12ABC34501DE3A')).toBe(false);
    });

    it('aceita tpNFCredito 04, 05 e 06 e recusa 07', () => {
        for (const v of ['01', '02', '03', '04', '05', '06']) expect(envoltorio('TTpNFCredito', v)).toBe(true);
        expect(envoltorio('TTpNFCredito', '07')).toBe(false);
    });
});
