import fs from 'fs';
import os from 'os';
import path from 'path';
import { NFE_GerarDanfe, CTE_GerarDacte } from './index.js';
import { textoDoPdf as extrair } from '../../test-support/pdfTexto';

// Correções do Vanir: logo opcional do emitente, texto da faixa de ambiente e item sem ICMS.
// Todos os dados abaixo são fictícios.

const CHAVE_NFE = '52261011222333000181550010000000011123456780';
const CHAVE_CTE = '52261011222333000181570010000000011123456780';

// PNG 1x1 válido (vermelho)
const LOGO = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
);

const nfeProc = (icms: string, tpAmb = 2) =>
    '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
    `<infNFe Id="NFe${CHAVE_NFE}" versao="4.00">` +
    `<ide><cUF>52</cUF><cNF>12345678</cNF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>1</nNF><dhEmi>2026-10-09T12:00:00-03:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>5208707</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>0</cDV><tpAmb>${tpAmb}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>teste</verProc></ide>` +
    '<emit><CNPJ>11222333000181</CNPJ><xNome>Empresa Ficticia de Teste Ltda</xNome><xFant>Fantasia Teste</xFant><enderEmit><xLgr>Rua de Teste</xLgr><nro>10</nro><xBairro>Centro</xBairro><cMun>5208707</cMun><xMun>Goiania</xMun><UF>GO</UF><CEP>74000000</CEP><cPais>1058</cPais><xPais>Brasil</xPais><fone>6233334444</fone></enderEmit><IE>123456789</IE><CRT>3</CRT></emit>' +
    '<dest><CNPJ>99888777000166</CNPJ><xNome>Cliente Ficticio Ltda</xNome><enderDest><xLgr>Rua do Cliente</xLgr><nro>20</nro><xBairro>Bairro</xBairro><cMun>5208707</cMun><xMun>Goiania</xMun><UF>GO</UF><CEP>74000111</CEP><cPais>1058</cPais><xPais>Brasil</xPais></enderDest><indIEDest>9</indIEDest></dest>' +
    `<det nItem="1"><prod><cProd>P1</cProd><cEAN>SEM GTIN</cEAN><xProd>Produto de teste</xProd><NCM>23099090</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>100.0000</vUnCom><vProd>100.00</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>1.0000</qTrib><vUnTrib>100.0000</vUnTrib><indTot>1</indTot></prod><imposto>${icms}</imposto></det>` +
    '<total><ICMSTot><vBC>100.00</vBC><vICMS>12.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>100.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>100.00</vNF></ICMSTot></total>' +
    '<transp><modFrete>9</modFrete></transp><pag><detPag><tPag>01</tPag><vPag>100.00</vPag></detPag></pag>' +
    '<infAdic><infCpl>Informacao complementar de teste</infCpl></infAdic></infNFe></NFe>' +
    `<protNFe versao="4.00"><infProt><tpAmb>${tpAmb}</tpAmb><verAplic>teste</verAplic><chNFe>${CHAVE_NFE}</chNFe><dhRecbto>2026-10-09T12:01:00-03:00</dhRecbto><nProt>152260000000001</nProt><digVal>AA==</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;

const ICMS_00 = '<ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>100.00</vBC><pICMS>12.00</pICMS><vICMS>12.00</vICMS></ICMS00></ICMS>';

jest.setTimeout(30000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'danfe-vanir-'));
// O gerador devolve antes de a gravação terminar: espera o PDF fechar (%%EOF) antes de ler.
async function lerPdf(arquivo: string): Promise<Buffer> {
    for (let i = 0; i < 100; i++) {
        if (fs.existsSync(arquivo)) {
            const buf = fs.readFileSync(arquivo);
            if (buf.subarray(-20).toString('latin1').includes('%%EOF')) return buf;
        }
        await new Promise((r) => setTimeout(r, 50));
    }
    const info = fs.existsSync(arquivo) ? fs.statSync(arquivo).size + ' bytes, final: ' + JSON.stringify(fs.readFileSync(arquivo).subarray(-30).toString('latin1')) : 'inexistente';
    throw new Error('PDF não foi gravado: ' + arquivo + ' (' + info + ')');
}
const textoDoPdf = async (arquivo: string) => extrair(await lerPdf(arquivo)).text;
// Quantidade de imagens embutidas no PDF (o código de barras já é uma; a logo soma outra)
const imagensNoPdf = async (arquivo: string) =>
    ((await lerPdf(arquivo)).toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;

describe('DANFE (NF-e) com a identidade visual do Vanir', () => {
    it('com logo, embute a imagem a mais; sem logo, o desenho original', async () => {
        const sem = path.join(dir, 'nfe-sem-logo.pdf');
        const com = path.join(dir, 'nfe-com-logo.pdf');
        await NFE_GerarDanfe({ data: nfeProc(ICMS_00), outputPath: sem });
        await NFE_GerarDanfe({ data: nfeProc(ICMS_00), outputPath: com, logo: LOGO });
        expect(await imagensNoPdf(com)).toBeGreaterThan(await imagensNoPdf(sem));
        expect(await textoDoPdf(com)).toContain('Empresa Ficticia de Teste Ltda');
    });

    it('troca o texto da faixa de homologação quando informado', async () => {
        const arq = path.join(dir, 'nfe-faixa.pdf');
        await NFE_GerarDanfe({ data: nfeProc(ICMS_00), outputPath: arq, faixaAmbiente: 'FAIXA PERSONALIZADA DO VANIR' });
        const texto = await textoDoPdf(arq);
        expect(texto).toContain('FAIXA PERSONALIZADA DO VANIR');
        expect(texto).not.toContain('AMBIENTE DE HOMOLOGAÇÃO - NF-E SEM VALOR FISCAL');
    });

    it('sem faixaAmbiente mantém o texto original da lib', async () => {
        const arq = path.join(dir, 'nfe-faixa-original.pdf');
        await NFE_GerarDanfe({ data: nfeProc(ICMS_00), outputPath: arq });
        expect(await textoDoPdf(arq)).toContain('AMBIENTE DE HOMOLOGAÇÃO - NF-E SEM VALOR FISCAL');
    });

    it('gera o DANFE de um item autorizado sem grupo de ICMS', async () => {
        const arq = path.join(dir, 'nfe-sem-icms.pdf');
        const resultado = await NFE_GerarDanfe({ data: nfeProc(''), outputPath: arq });
        expect(resultado.success).toBe(true);
        expect(await textoDoPdf(arq)).toContain('Produto de teste');
    });
});

const cteProc = (tpAmb = 2) =>
    '<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe xmlns="http://www.portalfiscal.inf.br/cte">' +
    `<infCte Id="CTe${CHAVE_CTE}" versao="4.00">` +
    `<ide><cUF>52</cUF><cCT>12345678</cCT><CFOP>5353</CFOP><natOp>Prestacao de servico de transporte</natOp><mod>57</mod><serie>1</serie><nCT>1</nCT><dhEmi>2026-10-09T12:00:00-03:00</dhEmi><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>0</cDV><tpAmb>${tpAmb}</tpAmb><tpCTe>0</tpCTe><procEmi>0</procEmi><verProc>teste</verProc><cMunEnv>5208707</cMunEnv><xMunEnv>Goiania</xMunEnv><UFEnv>GO</UFEnv><modal>01</modal><tpServ>0</tpServ><cMunIni>5208707</cMunIni><xMunIni>Goiania</xMunIni><UFIni>GO</UFIni><cMunFim>3550308</cMunFim><xMunFim>Sao Paulo</xMunFim><UFFim>SP</UFFim><retira>1</retira><indIEToma>9</indIEToma><toma3><toma>0</toma></toma3></ide>` +
    '<emit><CNPJ>11222333000181</CNPJ><IE>123456789</IE><xNome>Transportadora Ficticia de Teste Ltda</xNome><xFant>Fantasia</xFant><enderEmit><xLgr>Rua de Teste</xLgr><nro>10</nro><xBairro>Centro</xBairro><cMun>5208707</cMun><xMun>Goiania</xMun><CEP>74000000</CEP><UF>GO</UF></enderEmit></emit>' +
    '<rem><CNPJ>99888777000166</CNPJ><IE>987654321</IE><xNome>Remetente Ficticio</xNome><enderReme><xLgr>Rua do Remetente</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>5208707</cMun><xMun>Goiania</xMun><CEP>74000111</CEP><UF>GO</UF></enderReme></rem>' +
    '<dest><CNPJ>55444333000122</CNPJ><IE>111222333</IE><xNome>Destinatario Ficticio</xNome><enderDest><xLgr>Rua do Destino</xLgr><nro>2</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><xMun>Sao Paulo</xMun><CEP>01000000</CEP><UF>SP</UF></enderDest></dest>' +
    '<vPrest><vTPrest>500.00</vTPrest><vRec>500.00</vRec><Comp><xNome>Frete</xNome><vComp>500.00</vComp></Comp></vPrest>' +
    '<imp><ICMS><ICMS00><CST>00</CST><vBC>500.00</vBC><pICMS>12.00</pICMS><vICMS>60.00</vICMS></ICMS00></ICMS></imp>' +
    '<infCTeNorm><infCarga><vCarga>1000.00</vCarga><proPred>Racao</proPred><infQ><cUnid>01</cUnid><tpMed>PESO</tpMed><qCarga>10.0000</qCarga></infQ></infCarga><infDoc><infNFe><chave>' + CHAVE_NFE + '</chave></infNFe></infDoc><infModal versaoModal="4.00"><rodo><RNTRC>12345678</RNTRC></rodo></infModal></infCTeNorm>' +
    '</infCte></CTe>' +
    `<protCTe versao="4.00"><infProt><tpAmb>${tpAmb}</tpAmb><verAplic>teste</verAplic><chCTe>${CHAVE_CTE}</chCTe><dhRecbto>2026-10-09T12:01:00-03:00</dhRecbto><nProt>152260000000002</nProt><digVal>AA==</digVal><cStat>100</cStat><xMotivo>Autorizado o uso do CT-e</xMotivo></infProt></protCTe></cteProc>`;

describe('DACTE (CT-e) com a identidade visual do Vanir', () => {
    it('com logo, embute a imagem a mais; sem logo, o desenho original', async () => {
        const sem = path.join(dir, 'cte-sem-logo.pdf');
        const com = path.join(dir, 'cte-com-logo.pdf');
        await CTE_GerarDacte({ data: cteProc(), outputPath: sem });
        await CTE_GerarDacte({ data: cteProc(), outputPath: com, logo: LOGO });
        expect(await imagensNoPdf(com)).toBeGreaterThan(await imagensNoPdf(sem));
    });

    it('troca o texto da faixa de homologação quando informado', async () => {
        const arq = path.join(dir, 'cte-faixa.pdf');
        await CTE_GerarDacte({ data: cteProc(), outputPath: arq, faixaAmbiente: 'FAIXA DO CTE DO VANIR' });
        const texto = await textoDoPdf(arq);
        expect(texto).toContain('FAIXA DO CTE DO VANIR');
        expect(texto).not.toContain('AMBIENTE DE HOMOLOGAÇÃO - CT-E SEM VALOR FISCAL');
    });

    it('sem faixaAmbiente mantém o texto original da lib', async () => {
        const arq = path.join(dir, 'cte-faixa-original.pdf');
        await CTE_GerarDacte({ data: cteProc(), outputPath: arq });
        expect(await textoDoPdf(arq)).toContain('AMBIENTE DE HOMOLOGAÇÃO - CT-E SEM VALOR FISCAL');
    });
});
