import fs from 'fs';
import os from 'os';
import path from 'path';
import { NFE_GerarDanfe, CTE_GerarDacte } from './index.js';
import { MDFE_GerarDamdfe } from './MDFEGerarDamdfe.js';
import { dataHoraDoXml } from './utils/dataHoraDoXml.js';
import { textoDoPdf as extrair } from '../../test-support/pdfTexto';

// Correção do Vanir: o impresso mostra a data e a hora que o XML diz (hora de Brasília, com o offset ao lado), não a
// hora do fuso do processo. O container do Vanir roda em UTC: sem a correção, a nota emitida às 23:58 de 15/10
// saía com 02:58 de 16/10. Todos os dados abaixo são fictícios.
//
// O fuso do processo é fixado em UTC antes de qualquer data ser lida, para o teste reprovar também em máquina
// que roda em Brasília.
process.env.TZ = 'UTC';

const CHAVE_NFE = '52261011222333000181550010000000011123456780';
const CHAVE_CTE = '52261011222333000181570010000000011123456780';
const CHAVE_MDFE = '52261011222333000181580010000000011123456780';

const EMISSAO = '2026-10-15T23:58:10-03:00';
const AUTORIZACAO = '2026-10-16T00:03:58-03:00';
const SAIDA = '2026-10-15T23:59:00-03:00';

describe('dataHoraDoXml', () => {
    it('imprime os dígitos do XML, sem passar pelo fuso do processo', () => {
        expect(new Date().getTimezoneOffset()).toBe(0);
        expect(dataHoraDoXml(EMISSAO)).toBe('15/10/2026 23:58:10');
        expect(dataHoraDoXml(AUTORIZACAO)).toBe('16/10/2026 00:03:58');
        expect(dataHoraDoXml(EMISSAO, 'data')).toBe('15/10/2026');
        expect(dataHoraDoXml(EMISSAO, 'data', '-')).toBe('15-10-2026');
        expect(dataHoraDoXml(EMISSAO, 'hora')).toBe('23:58');
    });

    it('não depende do offset escrito: o impresso é a hora local do emitente', () => {
        expect(dataHoraDoXml('2026-10-15T23:58:10-04:00')).toBe('15/10/2026 23:58:10');
        expect(dataHoraDoXml('2026-10-15T23:58:10+00:00')).toBe('15/10/2026 23:58:10');
    });

    it('data sem hora (dEmi) não ganha 00:00:00; vazio fica vazio; texto estranho passa como veio', () => {
        expect(dataHoraDoXml('2026-10-15')).toBe('15/10/2026');
        expect(dataHoraDoXml('2026-10-15', 'dataHora')).toBe('15/10/2026');
        expect(dataHoraDoXml('2026-10-15', 'hora')).toBe('');
        expect(dataHoraDoXml(undefined)).toBe('');
        expect(dataHoraDoXml('')).toBe('');
        expect(dataHoraDoXml('sem data')).toBe('sem data');
    });
});

const nfeProc = (dhRecbto: string) =>
    '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
    `<infNFe Id="NFe${CHAVE_NFE}" versao="4.00">` +
    `<ide><cUF>52</cUF><cNF>12345678</cNF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>1</nNF><dhEmi>${EMISSAO}</dhEmi><dhSaiEnt>${SAIDA}</dhSaiEnt><tpNF>1</tpNF><idDest>1</idDest><cMunFG>5208707</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>0</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>teste</verProc></ide>` +
    '<emit><CNPJ>11222333000181</CNPJ><xNome>Empresa Ficticia de Teste Ltda</xNome><xFant>Fantasia Teste</xFant><enderEmit><xLgr>Rua de Teste</xLgr><nro>10</nro><xBairro>Centro</xBairro><cMun>5208707</cMun><xMun>Goiania</xMun><UF>GO</UF><CEP>74000000</CEP><cPais>1058</cPais><xPais>Brasil</xPais><fone>6233334444</fone></enderEmit><IE>123456789</IE><CRT>3</CRT></emit>' +
    '<dest><CNPJ>99888777000166</CNPJ><xNome>Cliente Ficticio Ltda</xNome><enderDest><xLgr>Rua do Cliente</xLgr><nro>20</nro><xBairro>Bairro</xBairro><cMun>5208707</cMun><xMun>Goiania</xMun><UF>GO</UF><CEP>74000111</CEP><cPais>1058</cPais><xPais>Brasil</xPais></enderDest><indIEDest>9</indIEDest></dest>' +
    '<det nItem="1"><prod><cProd>P1</cProd><cEAN>SEM GTIN</cEAN><xProd>Produto de teste</xProd><NCM>23099090</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>100.0000</vUnCom><vProd>100.00</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>1.0000</qTrib><vUnTrib>100.0000</vUnTrib><indTot>1</indTot></prod><imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>100.00</vBC><pICMS>12.00</pICMS><vICMS>12.00</vICMS></ICMS00></ICMS></imposto></det>' +
    '<total><ICMSTot><vBC>100.00</vBC><vICMS>12.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>100.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>100.00</vNF></ICMSTot></total>' +
    '<transp><modFrete>9</modFrete></transp><pag><detPag><tPag>01</tPag><vPag>100.00</vPag></detPag></pag>' +
    '<infAdic><infCpl>Informacao complementar de teste</infCpl></infAdic></infNFe></NFe>' +
    `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>teste</verAplic><chNFe>${CHAVE_NFE}</chNFe><dhRecbto>${dhRecbto}</dhRecbto><nProt>152260000000001</nProt><digVal>AA==</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;

const cteProc = (dhRecbto: string) =>
    '<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe xmlns="http://www.portalfiscal.inf.br/cte">' +
    `<infCte Id="CTe${CHAVE_CTE}" versao="4.00">` +
    `<ide><cUF>52</cUF><cCT>12345678</cCT><CFOP>5353</CFOP><natOp>Prestacao de servico de transporte</natOp><mod>57</mod><serie>1</serie><nCT>1</nCT><dhEmi>${EMISSAO}</dhEmi><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>0</cDV><tpAmb>2</tpAmb><tpCTe>0</tpCTe><procEmi>0</procEmi><verProc>teste</verProc><cMunEnv>5208707</cMunEnv><xMunEnv>Goiania</xMunEnv><UFEnv>GO</UFEnv><modal>01</modal><tpServ>0</tpServ><cMunIni>5208707</cMunIni><xMunIni>Goiania</xMunIni><UFIni>GO</UFIni><cMunFim>3550308</cMunFim><xMunFim>Sao Paulo</xMunFim><UFFim>SP</UFFim><retira>1</retira><indIEToma>9</indIEToma><toma3><toma>0</toma></toma3></ide>` +
    '<emit><CNPJ>11222333000181</CNPJ><IE>123456789</IE><xNome>Transportadora Ficticia de Teste Ltda</xNome><xFant>Fantasia</xFant><enderEmit><xLgr>Rua de Teste</xLgr><nro>10</nro><xBairro>Centro</xBairro><cMun>5208707</cMun><xMun>Goiania</xMun><CEP>74000000</CEP><UF>GO</UF></enderEmit></emit>' +
    '<rem><CNPJ>99888777000166</CNPJ><IE>987654321</IE><xNome>Remetente Ficticio</xNome><enderReme><xLgr>Rua do Remetente</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>5208707</cMun><xMun>Goiania</xMun><CEP>74000111</CEP><UF>GO</UF></enderReme></rem>' +
    '<dest><CNPJ>55444333000122</CNPJ><IE>111222333</IE><xNome>Destinatario Ficticio</xNome><enderDest><xLgr>Rua do Destino</xLgr><nro>2</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><xMun>Sao Paulo</xMun><CEP>01000000</CEP><UF>SP</UF></enderDest></dest>' +
    '<vPrest><vTPrest>500.00</vTPrest><vRec>500.00</vRec><Comp><xNome>Frete</xNome><vComp>500.00</vComp></Comp></vPrest>' +
    '<imp><ICMS><ICMS00><CST>00</CST><vBC>500.00</vBC><pICMS>12.00</pICMS><vICMS>60.00</vICMS></ICMS00></ICMS></imp>' +
    '<infCTeNorm><infCarga><vCarga>1000.00</vCarga><proPred>Racao</proPred><infQ><cUnid>01</cUnid><tpMed>PESO</tpMed><qCarga>10.0000</qCarga></infQ></infCarga><infDoc><infNFe><chave>' + CHAVE_NFE + '</chave></infNFe></infDoc><infModal versaoModal="4.00"><rodo><RNTRC>12345678</RNTRC></rodo></infModal></infCTeNorm>' +
    '</infCte></CTe>' +
    `<protCTe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>teste</verAplic><chCTe>${CHAVE_CTE}</chCTe><dhRecbto>${dhRecbto}</dhRecbto><nProt>152260000000002</nProt><digVal>AA==</digVal><cStat>100</cStat><xMotivo>Autorizado o uso do CT-e</xMotivo></infProt></protCTe></cteProc>`;

const mdfeProc = (dhRecbto: string) =>
    '<mdfeProc xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00"><MDFe xmlns="http://www.portalfiscal.inf.br/mdfe">' +
    `<infMDFe Id="MDFe${CHAVE_MDFE}" versao="3.00">` +
    `<ide><cUF>52</cUF><tpAmb>2</tpAmb><tpEmit>1</tpEmit><mod>58</mod><serie>1</serie><nMDF>1</nMDF><cMDF>12345678</cMDF><cDV>0</cDV><modal>1</modal><dhEmi>${EMISSAO}</dhEmi><tpEmis>1</tpEmis><procEmi>0</procEmi><verProc>teste</verProc><UFIni>GO</UFIni><UFFim>SP</UFFim><infMunCarrega><cMunCarrega>5208707</cMunCarrega><xMunCarrega>Goiania</xMunCarrega></infMunCarrega></ide>` +
    '<emit><CNPJ>11222333000181</CNPJ><IE>123456789</IE><xNome>Transportadora Ficticia de Teste Ltda</xNome><enderEmit><xLgr>Rua de Teste</xLgr><nro>10</nro><xBairro>Centro</xBairro><cMun>5208707</cMun><xMun>Goiania</xMun><CEP>74000000</CEP><UF>GO</UF></enderEmit></emit>' +
    '<infModal versaoModal="3.00"><rodo><infANTT><RNTRC>12345678</RNTRC></infANTT><veicTracao><placa>ABC1D23</placa><tara>8000</tara><capKG>20000</capKG><condutor><xNome>Condutor Ficticio</xNome><CPF>12345678909</CPF></condutor><tpRod>06</tpRod><tpCar>02</tpCar><UF>GO</UF></veicTracao></rodo></infModal>' +
    `<infDoc><infMunDescarga><cMunDescarga>3550308</cMunDescarga><xMunDescarga>Sao Paulo</xMunDescarga><infCTe><chCTe>${CHAVE_CTE}</chCTe></infCTe></infMunDescarga></infDoc>` +
    '<tot><qCTe>1</qCTe><vCarga>1000.00</vCarga><cUnid>01</cUnid><qCarga>10.0000</qCarga></tot>' +
    `</infMDFe><infMDFeSupl><qrCodMDFe>https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${CHAVE_MDFE}&amp;tpAmb=2</qrCodMDFe></infMDFeSupl></MDFe>` +
    `<protMDFe versao="3.00"><infProt><tpAmb>2</tpAmb><verAplic>teste</verAplic><chMDFe>${CHAVE_MDFE}</chMDFe><dhRecbto>${dhRecbto}</dhRecbto><nProt>152260000000003</nProt><digVal>AA==</digVal><cStat>100</cStat><xMotivo>Autorizado o uso do MDF-e</xMotivo></infProt></protMDFe></mdfeProc>`;

jest.setTimeout(30000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'danfe-brasilia-'));
async function lerPdf(arquivo: string): Promise<Buffer> {
    for (let i = 0; i < 100; i++) {
        if (fs.existsSync(arquivo)) {
            const buf = fs.readFileSync(arquivo);
            if (buf.subarray(-20).toString('latin1').includes('%%EOF')) return buf;
        }
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('PDF não foi gravado: ' + arquivo);
}
const textoDoPdf = async (arquivo: string) => extrair(await lerPdf(arquivo)).text;

describe('impressos com a hora do XML, no fuso UTC do processo (nota emitida às 23:58 de Brasília)', () => {
    it('DANFE: emissão, saída e autorização saem como no XML', async () => {
        const arq = path.join(dir, 'nfe.pdf');
        await NFE_GerarDanfe({ data: nfeProc(AUTORIZACAO), outputPath: arq });
        const texto = await textoDoPdf(arq);
        expect(texto).toContain('15-10-2026');
        expect(texto).toContain('23:59');
        expect(texto).toContain('16/10/2026 00:03:58');
        // o dia seguinte da emissão só existiria se o horário fosse convertido para UTC
        expect(texto).not.toContain('16-10-2026');
        expect(texto).not.toContain('02:58');
    });

    it('DANFE: dhRecbto no formato antigo da API (UTC com Z) não é o que o impresso deve receber', async () => {
        // Documenta a metade do defeito que está na API: um instante em UTC vira outra hora no papel. A API passa a
        // montar o proc com o offset de Brasília (briefs/fiscal/45), e este teste trava o que o gerador faz com cada forma.
        expect(dataHoraDoXml('2026-10-16T03:03:58.000Z')).toBe('16/10/2026 03:03:58');
    });

    it('DACTE: emissão e autorização saem como no XML', async () => {
        const arq = path.join(dir, 'cte.pdf');
        await CTE_GerarDacte({ data: cteProc(AUTORIZACAO), outputPath: arq });
        const texto = await textoDoPdf(arq);
        expect(texto).toContain('15/10/2026 23:58:10');
        expect(texto).toContain('16/10/2026 00:03:58');
        expect(texto).not.toContain('16/10/2026 02:58');
    });

    it('DAMDFE: emissão e autorização saem como no XML', async () => {
        const arq = path.join(dir, 'mdfe.pdf');
        await MDFE_GerarDamdfe({ data: mdfeProc(AUTORIZACAO), outputPath: arq });
        const texto = await textoDoPdf(arq);
        expect(texto).toContain('15/10/2026 23:58:10');
        expect(texto).toContain('16/10/2026 00:03:58');
        // antes da correção o DAMDFE imprimia o dhRecbto cru, com o T e o offset
        expect(texto).not.toContain('2026-10-16T00:03:58-03:00');
    });
});
