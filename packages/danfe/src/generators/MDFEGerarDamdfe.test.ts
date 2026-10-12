import fs from 'fs';
// @ts-expect-error pdf-parse@1.1.1 does not publish its own typings
import pdfParse from 'pdf-parse';
import { MDFE_GerarDamdfe } from './MDFEGerarDamdfe.js';

const CHAVE = '35261012345678000195580010000000011123456780';
const XML = '<mdfeProc xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">' +
'<MDFe><infMDFe Id="MDFe' + CHAVE + '" versao="3.00">' +
'<ide><mod>58</mod><serie>1</serie><nMDF>1</nMDF><dhEmi>2026-10-09T12:00:00-03:00</dhEmi><UFIni>GO</UFIni><UFFim>SP</UFFim></ide>' +
'<emit><CNPJ>12345678000195</CNPJ><IE>123456789</IE><xNome>Transportadora Fictícia de Teste</xNome><RNTRC>12345678</RNTRC><enderEmit><xLgr>Rua de Teste</xLgr><nro>10</nro><xBairro>Centro</xBairro><xMun>Goiânia</xMun><UF>GO</UF><CEP>74000000</CEP></enderEmit></emit>' +
'<infModal versaoModal="3.00"><rodo><veicTracao><placa>ABC1D23</placa><UF>GO</UF><RNTRC>12345678</RNTRC><condutor><xNome>Motorista Fictício</xNome><CPF>12345678909</CPF></condutor></veicTracao></rodo></infModal>' +
'<infDoc><infMunDescarga><cMunDescarga>3550308</cMunDescarga><xMunDescarga>São Paulo</xMunDescarga><infNFe><chNFe>35261012345678000195550010000000011000000001</chNFe></infNFe></infMunDescarga></infDoc>' +
'<prodPred><tpCarga>05</tpCarga><xProd>Mercadoria de teste</xProd></prodPred><seg><xSeg>Seguradora Fictícia</xSeg><nApol>123</nApol></seg>' +
'<tot><qNFe>1</qNFe><vCarga>100.00</vCarga><cUnid>01</cUnid><qCarga>10.0000</qCarga></tot>' +
'</infMDFe><infMDFeSupl><qrCodMDFe>https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=' + CHAVE + '&amp;tpAmb=2</qrCodMDFe></infMDFeSupl></MDFe>' +
'<protMDFe><infProt><tpAmb>2</tpAmb><cStat>100</cStat><xMotivo>Autorizado o uso do MDF-e</xMotivo><chMDFe>' + CHAVE + '</chMDFe>' +
'<dhRecbto>2026-10-09T12:01:00-03:00</dhRecbto><nProt>135260000000001</nProt></infProt></protMDFe></mdfeProc>';

describe('MDFE_GerarDamdfe', () => {
  it('gera PDF legível com a chave, protocolo e aviso de homologação', async () => {
    const outputPath = process.env.DAMDFE_TEST_OUTPUT || '/tmp/mdfe-damdfe-teste.pdf';
    const result = await MDFE_GerarDamdfe({ data: XML, outputPath });
    const parsed = await pdfParse(await fs.promises.readFile(outputPath));
    expect(result.totalPaginas).toBe(1);
    expect(parsed.text.replaceAll(' ', '')).toContain(CHAVE);
    expect(parsed.text).toContain('135260000000001');
    expect(parsed.text).toContain('EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO');
    expect(parsed.text).toContain('Motorista Fictício');
    expect(parsed.text).toContain('100,00');
  });

  it('não imprime a marca de homologação para ambiente de produção', async () => {
    const producao = XML.replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>');
    const outputPath = '/tmp/mdfe-damdfe-producao.pdf';
    await MDFE_GerarDamdfe({ data: producao, outputPath });
    const parsed = await pdfParse(await fs.promises.readFile(outputPath));
    expect(parsed.text).not.toContain('EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO');
    expect(parsed.text).toContain('Protocolo de autorização');
  });

  it('continua a lista de documentos em páginas adicionais', async () => {
    const grupo = '<infNFe><chNFe>35261012345678000195550010000000011000000001</chNFe></infNFe>';
    const muitos = XML.replace(grupo, Array(19).fill(grupo).join(''));
    const outputPath = '/tmp/mdfe-damdfe-varias-paginas.pdf';
    const result = await MDFE_GerarDamdfe({ data: muitos, outputPath });
    const parsed = await pdfParse(await fs.promises.readFile(outputPath));
    expect(result.totalPaginas).toBe(2);
    expect(parsed.numpages).toBe(2);
    expect(parsed.text).toContain('2/2');
  });

  it('recusa XML sem protocolo de autorização', async () => {
    const semProtocolo = XML.replace(/<protMDFe>[\s\S]*<\/protMDFe>/, '');
    await expect(MDFE_GerarDamdfe({ data: semProtocolo, outputPath: '/tmp/mdfe-sem-protocolo.pdf' }))
      .rejects.toThrow('DAMDFE_EXIGE_MDFE_AUTORIZADO');
  });
});
