import fs from 'fs';
import os from 'os';
import path from 'path';
import { NFSeGerarDanfe } from './index.js';
import { textoDoPdf } from '../../test-support/pdfTexto';

// DANFSe com retenções federais, dedução da base e benefício municipal, nos dois leiautes da DPS:
// o 1.01 (vigente) e o da NT 009 SE/CGNFS-e, release 1. Todos os dados são fictícios.
// DANFSE_AMOSTRAS=<pasta> guarda os PDFs para olhar o desenho.

const CHAVE_NFSE = '31702062211222333000181000000000023426114829173818';
const CHAVE_NFE = '52261011222333000181550010000000011123456788';
const CHAVE_NFSE_DED = '31702062211222333000181000000000011026105555555555';
const NBM = '31702060200001';

type Leiaute = '1.01' | 'nt009-r1';

type Opcoes = {
    leiaute?: Leiaute;
    /** tpRetPisCofins da DPS; `null` omite o grupo piscofins. */
    tpRetPisCofins?: string | null;
    retencoes?: boolean;
    deducao?: 'nenhuma' | 'valor' | 'percentual' | 'documentos';
    bm?: 'nenhum' | 'percentual' | 'valor';
};

function dedRed101(deducao: NonNullable<Opcoes['deducao']>): string {
    if (deducao === 'nenhuma') return '';
    if (deducao === 'valor') return '<vDedRed><vDR>1000.00</vDR></vDedRed>';
    if (deducao === 'percentual') return '<vDedRed><pDR>10.00</pDR></vDedRed>';
    return (
        '<vDedRed><documentos>' +
        `<docDedRed><chNFe>${CHAVE_NFE}</chNFe><tpDedRed>7</tpDedRed><dtEmiDoc>2026-10-05</dtEmiDoc><vDedutivelRedutivel>1500.00</vDedutivelRedutivel><vDeducaoReducao>1200.00</vDeducaoReducao></docDedRed>` +
        `<docDedRed><chNFSe>${CHAVE_NFSE_DED}</chNFSe><tpDedRed>99</tpDedRed><xDescOutDed>Locacao de equipamento</xDescOutDed><dtEmiDoc>2026-10-07</dtEmiDoc><vDedutivelRedutivel>400.00</vDedutivelRedutivel><vDeducaoReducao>300.00</vDeducaoReducao></docDedRed>` +
        '</documentos></vDedRed>'
    );
}

function ajusteBc(deducao: NonNullable<Opcoes['deducao']>): string {
    if (deducao === 'nenhuma') return '';
    if (deducao === 'valor') return '<vAjusteBC><vAjusteBCISSQN>1000.00</vAjusteBCISSQN></vAjusteBC>';
    if (deducao === 'percentual') return '<vAjusteBC><pAjusteBCISSQN>10.00</pAjusteBCISSQN></vAjusteBC>';
    return (
        '<vAjusteBC><documentos>' +
        `<docAjusteBC><tpAjusteBC>7</tpAjusteBC><vTotDoc>1500.00</vTotDoc><vAjusteAplic>1200.00</vAjusteAplic><dtEmiDoc>2026-10-05</dtEmiDoc><dFeNacional><tipoChaveDFe>1</tipoChaveDFe><chaveDFe>${CHAVE_NFE}</chaveDFe></dFeNacional></docAjusteBC>` +
        '<docAjusteBC><tpAjusteBC>99</tpAjusteBC><xTpAjusteBC>Locacao de equipamento</xTpAjusteBC><vTotDoc>400.00</vTotDoc><vAjusteAplic>300.00</vAjusteAplic><dtEmiDoc>2026-10-07</dtEmiDoc><docOutro><nDoc>RC-77</nDoc><xDoc>Recibo de locacao</xDoc></docOutro></docAjusteBC>' +
        '</documentos></vAjusteBC>'
    );
}

function nfse(o: Opcoes = {}): string {
    const { leiaute = '1.01', tpRetPisCofins = '1', retencoes = true, deducao = 'nenhuma', bm = 'nenhum' } = o;
    const nt009 = leiaute === 'nt009-r1';
    const calculadoDeducao = deducao === 'nenhuma' ? 0 : deducao === 'documentos' ? 1500 : 1000;
    const calculadoBm = bm === 'nenhum' ? 0 : bm === 'percentual' ? 450 : 500;
    const vBC = 10000 - calculadoDeducao - calculadoBm;
    const vISS = vBC * 0.03;
    const totalRet = retencoes ? 650 + 150 + 100 + 65 + 300 : 0;

    const calcDeducao = deducao === 'nenhuma'
        ? ''
        : nt009
            ? `<vCalcAjusteBCISSQN>${calculadoDeducao.toFixed(2)}</vCalcAjusteBCISSQN>`
            : `<vCalcDR>${calculadoDeducao.toFixed(2)}</vCalcDR>`;
    const calcBm = bm === 'nenhum'
        ? ''
        : `<tpBM>${bm === 'percentual' ? 2 : 3}</tpBM><vCalcBM>${calculadoBm.toFixed(2)}</vCalcBM>`;
    const bmDps = bm === 'nenhum'
        ? ''
        : `<BM><nBM>${NBM}</nBM>${bm === 'percentual' ? '<pRedBCBM>5.00</pRedBCBM>' : '<vRedBCBM>500.00</vRedBCBM>'}</BM>`;

    const pis = tpRetPisCofins === null
        ? ''
        : `<piscofins><CST>01</CST><vBCPisCofins>10000.00</vBCPisCofins><pAliqPis>0.65</pAliqPis><pAliqCofins>3.00</pAliqCofins><vPis>65.00</vPis><vCofins>300.00</vCofins><tpRetPisCofins>${tpRetPisCofins}</tpRetPisCofins></piscofins>`;
    const tribFed = retencoes || pis
        ? `<tribFed>${pis}${retencoes ? '<vRetCP>650.00</vRetCP><vRetIRRF>150.00</vRetIRRF><vRetCSLL>100.00</vRetCSLL>' : ''}</tribFed>`
        : '';

    return (
        `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="${nt009 ? '1.01' : '1.01'}"><infNFSe Id="NFS${CHAVE_NFSE}">` +
        '<xLocEmi>Uberlandia</xLocEmi><xLocPrestacao>Uberlandia</xLocPrestacao><nNFSe>234</nNFSe><cLocIncid>3170206</cLocIncid><xLocIncid>Uberlandia</xLocIncid>' +
        '<xTribNac>Assessoria ou consultoria</xTribNac><verAplic>teste</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>100</cStat><dhProc>2026-11-05T14:03:12-03:00</dhProc><nDFSe>1</nDFSe>' +
        '<emit><CNPJ>11222333000181</CNPJ><IM>0412087</IM><xNome>Transportes Demonstracao Ltda</xNome><enderNac><xLgr>Rua Um</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>3170206</cMun><UF>MG</UF><CEP>38400000</CEP></enderNac></emit>' +
        `<valores>${calcDeducao}${calcBm}<vBC>${vBC.toFixed(2)}</vBC><pAliqAplic>3.00</pAliqAplic><vISSQN>${vISS.toFixed(2)}</vISSQN><vTotalRet>${totalRet.toFixed(2)}</vTotalRet><vLiq>${(10000 - totalRet).toFixed(2)}</vLiq></valores>` +
        `<DPS versao="1.01"><infDPS Id="DPS317020621122233300018100001000000000000234"><tpAmb>2</tpAmb><dhEmi>2026-11-05T14:03:00-03:00</dhEmi><verAplic>teste</verAplic><serie>1</serie><nDPS>234</nDPS><dCompet>2026-10-31</dCompet><tpEmit>1</tpEmit><cLocEmi>3170206</cLocEmi>` +
        (nt009 ? '<finNFSe>0</finNFSe>' : '') +
        '<prest><CNPJ>11222333000181</CNPJ><IM>0412087</IM><fone>3430000000</fone><regTrib><opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>' +
        '<toma><CNPJ>00111222000144</CNPJ><xNome>Autarquia Municipal de Abastecimento</xNome></toma>' +
        '<serv><locPrest><cLocPrestacao>3170206</cLocPrestacao></locPrest><cServ><cTribNac>170101</cTribNac><xDescServ>Gestao de estoque terceirizada, 10/2026</xDescServ></cServ></serv>' +
        `<valores><vServPrest><vServ>10000.00</vServ></vServPrest>${nt009 ? ajusteBc(deducao) : dedRed101(deducao)}` +
        `<trib><tribMun><tribISSQN>1</tribISSQN>${bmDps}<tpRetISSQN>1</tpRetISSQN><pAliq>3.00</pAliq></tribMun>${tribFed}</trib></valores>` +
        '</infDPS></DPS></infNFSe></NFSe>'
    );
}

jest.setTimeout(30000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'danfse-vanir-'));
let contador = 0;

async function gerar(o: Opcoes = {}) {
    const arquivo = path.join(dir, `danfse-${++contador}.pdf`);
    const resultado = await NFSeGerarDanfe({ data: nfse(o), outputPath: arquivo, exibirMarcaDaguaDanfe: false });
    expect(resultado.success).toBe(true);
    const pdf = fs.readFileSync(arquivo);
    if (process.env.DANFSE_AMOSTRAS) {
        fs.mkdirSync(process.env.DANFSE_AMOSTRAS, { recursive: true });
        fs.copyFileSync(arquivo, path.join(process.env.DANFSE_AMOSTRAS, `danfse-${o.leiaute ?? '1.01'}-${contador}.pdf`));
    }
    const { text, numpages } = textoDoPdf(pdf);
    // linhas quebradas pelo desenho voltam coladas: cada asserção compara sem espaços
    return { numpages, texto: text.replace(/\s+/g, ''), bruto: text };
}

const sem = (texto: string) => texto.replace(/\s+/g, '');

describe('DANFSe: retenções federais (tpRetPisCofins)', () => {
    it('1.01: imprime os valores retidos, o total e a descrição de 1 retido', async () => {
        const { texto, numpages } = await gerar({ leiaute: '1.01', tpRetPisCofins: '1' });
        expect(numpages).toBe(1);
        expect(texto).toContain(sem('TRIBUTAÇÃO FEDERAL (RETENÇÕES)'));
        expect(texto).toContain(sem('PIS/COFINS RETIDOS'));
        expect(texto).not.toContain(sem('NÃO RETIDOS'));
        for (const valor of ['65,00', '300,00', '150,00', '100,00', '650,00', '1.265,00']) {
            expect(texto).toContain(valor);
        }
        expect(texto).toContain(sem('CST PIS/COFINS'));
        expect(texto).toContain(sem('Retenção PIS/COFINS/CSLL'.toUpperCase()));
    });

    it('1.01: 2 é PIS/COFINS não retidos', async () => {
        const { texto } = await gerar({ leiaute: '1.01', tpRetPisCofins: '2', retencoes: false });
        expect(texto).toContain(sem('PIS/COFINS NÃO RETIDOS'));
    });

    it('1.01: código fora do domínio do leiaute sai só como código, sem inventar descrição', async () => {
        const { texto } = await gerar({ leiaute: '1.01', tpRetPisCofins: '3' });
        expect(texto).not.toContain(sem('CSLL RETIDOS'));
        expect(texto).not.toContain(sem('PIS/COFINS/CSLL RETIDOS'));
    });

    const NT009: [string, string][] = [
        ['0', 'PIS/COFINS/CSLL NÃO RETIDOS'],
        ['1', 'PIS/COFINS RETIDOS'],
        ['2', 'PIS/COFINS NÃO RETIDOS'],
        ['3', 'PIS/COFINS/CSLL RETIDOS'],
        ['4', 'PIS/COFINS RETIDOS, CSLL NÃO RETIDO'],
        ['5', 'PIS RETIDO, COFINS/CSLL NÃO RETIDOS'],
        ['6', 'COFINS RETIDO, PIS/CSLL NÃO RETIDOS'],
        ['7', 'PIS NÃO RETIDO, COFINS/CSLL RETIDOS'],
        ['8', 'PIS/COFINS NÃO RETIDOS, CSLL RETIDO'],
        ['9', 'COFINS NÃO RETIDO, PIS/CSLL RETIDOS'],
    ];
    it.each(NT009)('nt009-r1: tpRetPisCofins %s -> %s', async (codigo, descricao) => {
        const { texto } = await gerar({ leiaute: 'nt009-r1', tpRetPisCofins: codigo });
        expect(texto).toContain(sem(`${codigo} - ${descricao}`));
    });

    it('sem o grupo piscofins, imprime as retenções federais restantes e nenhuma linha de PIS/COFINS', async () => {
        const { texto } = await gerar({ leiaute: '1.01', tpRetPisCofins: null });
        expect(texto).toContain('650,00');
        expect(texto).not.toContain(sem('CST PIS/COFINS'));
        expect(texto).not.toContain(sem('RETENÇÃO PIS/COFINS/CSLL'));
    });
});

describe('DANFSe: dedução/redução da base', () => {
    it('1.01 por valor (vDR)', async () => {
        const { texto } = await gerar({ leiaute: '1.01', deducao: 'valor' });
        expect(texto).toContain('1.000,00');
        expect(texto).not.toContain(sem('DOCUMENTOS DE DEDUÇÃO'));
    });

    it('1.01 por percentual (pDR) mostra o percentual e o valor calculado pela Sefin', async () => {
        const { texto } = await gerar({ leiaute: '1.01', deducao: 'percentual' });
        expect(texto).toContain(sem('DEDUÇÃO / REDUÇÃO (%)'));
        expect(texto).toContain('10,00');
        expect(texto).toContain('1.000,00');
    });

    it('1.01 por documentos: tipo, chave, emissão, valor do documento e valor deduzido, com a soma nas deduções', async () => {
        const { texto, numpages } = await gerar({ leiaute: '1.01', deducao: 'documentos' });
        expect(numpages).toBe(1);
        expect(texto).toContain(sem('DOCUMENTOS DE DEDUÇÃO / REDUÇÃO DA BASE'));
        expect(texto).toContain(sem('7 - SERVIÇOS'));
        expect(texto).toContain(sem(`NF-e ${CHAVE_NFE}`));
        expect(texto).toContain('05/10/2026');
        expect(texto).toContain('1.500,00');
        expect(texto).toContain('1.200,00');
        expect(texto).toContain(sem('99 - OUTRAS DEDUÇÕES - Locacao de equipamento'));
        expect(texto).toContain(sem(`NFS-e ${CHAVE_NFSE_DED}`));
        expect(texto).toContain('07/10/2026');
        expect(texto).toContain('400,00');
        expect(texto).toContain('300,00');
        // Descontos e deduções do quadro de valores = soma dos documentos
        expect(texto).toContain(sem('R$ 1.500,00'));
    });

    it('nt009-r1 por valor (vAjusteBCISSQN)', async () => {
        const { texto } = await gerar({ leiaute: 'nt009-r1', deducao: 'valor' });
        expect(texto).toContain('1.000,00');
    });

    it('nt009-r1 por percentual (pAjusteBCISSQN)', async () => {
        const { texto } = await gerar({ leiaute: 'nt009-r1', deducao: 'percentual' });
        expect(texto).toContain(sem('DEDUÇÃO / REDUÇÃO (%)'));
        expect(texto).toContain('1.000,00');
    });

    it('nt009-r1 por documentos (docAjusteBC): DF-e nacional e documento não fiscal', async () => {
        const { texto, numpages } = await gerar({ leiaute: 'nt009-r1', deducao: 'documentos' });
        expect(numpages).toBe(1);
        expect(texto).toContain(sem('DOCUMENTOS DE DEDUÇÃO / REDUÇÃO DA BASE'));
        expect(texto).toContain(sem('7 - SERVIÇOS'));
        expect(texto).toContain(sem(`DF-e ${CHAVE_NFE}`));
        expect(texto).toContain('1.200,00');
        expect(texto).toContain(sem('99 - OUTRAS DEDUÇÕES EXCLUSIVAS DO ISSQN - Locacao de equipamento'));
        expect(texto).toContain(sem('Recibo de locacao nº RC-77'));
        expect(texto).toContain('300,00');
        expect(texto).toContain(sem('R$ 1.500,00'));
    });

    it('um documento só (o parser devolve objeto, não vetor) também sai', async () => {
        const xml = nfse({ leiaute: '1.01', deducao: 'documentos' }).replace(
            /<docDedRed><chNFSe>[\s\S]*?<\/docDedRed>/,
            '',
        );
        const arquivo = path.join(dir, `danfse-um-${++contador}.pdf`);
        const r = await NFSeGerarDanfe({ data: xml, outputPath: arquivo, exibirMarcaDaguaDanfe: false });
        expect(r.success).toBe(true);
        const texto = sem(textoDoPdf(fs.readFileSync(arquivo)).text);
        expect(texto).toContain(sem(`NF-e ${CHAVE_NFE}`));
        expect(texto).not.toContain(sem(CHAVE_NFSE_DED));
    });

    it('sem dedução, a seção de documentos não aparece e as deduções saem zeradas', async () => {
        for (const leiaute of ['1.01', 'nt009-r1'] as Leiaute[]) {
            const { texto } = await gerar({ leiaute, deducao: 'nenhuma' });
            expect(texto).not.toContain(sem('DOCUMENTOS DE DEDUÇÃO'));
            expect(texto).not.toContain(sem('DEDUÇÃO / REDUÇÃO (%)'));
        }
    });
});

describe('DANFSe: benefício municipal (BM)', () => {
    for (const leiaute of ['1.01', 'nt009-r1'] as Leiaute[]) {
        it(`${leiaute}: redução por percentual (pRedBCBM) com o valor calculado`, async () => {
            const { texto } = await gerar({ leiaute, bm: 'percentual' });
            expect(texto).toContain(sem('BENEFÍCIO MUNICIPAL (Nº)'));
            expect(texto).toContain(NBM);
            expect(texto).toContain(sem('2 - REDUÇÃO DA BC EM PERCENTUAL'));
            expect(texto).toContain(sem('REDUÇÃO DA BASE INFORMADA (%)'));
            expect(texto).toContain('5,00');
            expect(texto).toContain('450,00');
        });

        it(`${leiaute}: redução por valor (vRedBCBM) com o valor calculado`, async () => {
            const { texto } = await gerar({ leiaute, bm: 'valor' });
            expect(texto).toContain(NBM);
            expect(texto).toContain(sem('3 - REDUÇÃO DA BC EM VALOR'));
            expect(texto).toContain(sem('REDUÇÃO DA BASE INFORMADA (R$)'));
            expect(texto).toContain('500,00');
        });

        it(`${leiaute}: sem benefício, nenhuma linha de benefício`, async () => {
            const { texto } = await gerar({ leiaute, bm: 'nenhum' });
            expect(texto).not.toContain(sem('BENEFÍCIO MUNICIPAL'));
        });
    }
});

describe('DANFSe: retenção + dedução + benefício na mesma nota', () => {
    for (const leiaute of ['1.01', 'nt009-r1'] as Leiaute[]) {
        it(`${leiaute}: cabe numa página e mostra os três quadros`, async () => {
            const { texto, numpages } = await gerar({ leiaute, tpRetPisCofins: leiaute === '1.01' ? '1' : '4', deducao: 'documentos', bm: 'percentual' });
            expect(numpages).toBe(1);
            expect(texto).toContain(sem('TRIBUTAÇÃO MUNICIPAL (ISSQN)'));
            expect(texto).toContain(sem('DOCUMENTOS DE DEDUÇÃO / REDUÇÃO DA BASE'));
            expect(texto).toContain(sem('BENEFÍCIO MUNICIPAL (Nº)'));
            expect(texto).toContain(sem('TRIBUTAÇÃO FEDERAL (RETENÇÕES)'));
        });
    }
});
