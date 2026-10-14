import fs from 'fs';
import os from 'os';
import path from 'path';
import { NFCE_GerarDanfe } from './index.js';
import { imagensDoPdf, tamanhoDaPagina, tamanhosDeFonte, textoDoPdf } from '../../test-support/pdfTexto';

// DANFCE conforme o Manual do DANFE NFC-e v6.0. Todos os dados abaixo são fictícios.
// Rodar também com TZ=UTC: as datas saem do texto do XML e não podem mudar com o fuso do processo.

const CHAVE = '52261011222333000181658800000000011123456788';
const BLOCOS_DA_CHAVE = (CHAVE.match(/.{4}/g) as string[]).join(' ');
const URL_QR = 'https://qr.exemplo.invalid/nfce/qrcode';
const MM = 72 / 25.4;

type Opcoes = {
    tpAmb?: number;
    tpEmis?: number;
    dest?: string;
    protocolo?: 'real' | 'fake' | 'nenhum';
    itens?: number;
    descricao?: string;
    vTotTrib?: string | null;
    infCpl?: string | null;
    desconto?: string;
    troco?: string;
    pagamentos?: { tPag: string; vPag: string }[];
};

function nfce(o: Opcoes = {}): string {
    const { tpAmb = 1, tpEmis = 1, dest = '', protocolo = 'real', itens = 1, descricao = 'Racao para bovinos 25kg', vTotTrib = '3.25', infCpl = null, desconto = '0.00', troco = '0.00', pagamentos = [{ tPag: '01', vPag: String(10 * itens) }] } = o;
    const dets = Array.from({ length: itens }, (_, i) =>
        `<det nItem="${i + 1}"><prod><cProd>P${i + 1}</cProd><cEAN>SEM GTIN</cEAN><xProd>${i === 0 ? descricao : `Item ${i + 1}`}</xProd><NCM>23099090</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>10.0000</vUnCom><vProd>10.00</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>1.0000</qTrib><vUnTrib>10.0000</vUnTrib><indTot>1</indTot></prod><imposto></imposto></det>`).join('');
    const vProd = (10 * itens).toFixed(2);
    const vNF = (10 * itens - Number(desconto)).toFixed(2);
    const nfe =
        `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${CHAVE}" versao="4.00">` +
        `<ide><cUF>52</cUF><cNF>12345678</cNF><natOp>VENDA</natOp><mod>65</mod><serie>880</serie><nNF>1</nNF><dhEmi>2026-10-13T22:30:00-03:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>5208707</cMunFG><tpImp>4</tpImp><tpEmis>${tpEmis}</tpEmis><cDV>8</cDV><tpAmb>${tpAmb}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>teste</verProc></ide>` +
        '<emit><CNPJ>11222333000181</CNPJ><xNome>EMITENTE FICTICIO LTDA</xNome><enderEmit><xLgr>RUA UM</xLgr><nro>1</nro><xBairro>CENTRO</xBairro><cMun>5208707</cMun><xMun>GOIANIA</xMun><UF>GO</UF><CEP>74000000</CEP></enderEmit><IE>102959438</IE><CRT>3</CRT></emit>' +
        dest + dets +
        `<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${vProd}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${desconto}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${vNF}</vNF>${vTotTrib ? `<vTotTrib>${vTotTrib}</vTotTrib>` : ''}</ICMSTot></total>` +
        `<transp><modFrete>9</modFrete></transp><pag>${pagamentos.map((p) => `<detPag><tPag>${p.tPag}</tPag><vPag>${p.vPag}</vPag></detPag>`).join('')}${troco !== '0.00' ? `<vTroco>${troco}</vTroco>` : ''}</pag>` +
        (infCpl ? `<infAdic><infCpl>${infCpl}</infCpl></infAdic>` : '') +
        `</infNFe><infNFeSupl><qrCode>${URL_QR}?p=${CHAVE}|3|${tpAmb}</qrCode><urlChave>https://consulta.exemplo.invalid/nfce</urlChave></infNFeSupl></NFe>`;
    if (protocolo === 'nenhum') return nfe;
    const prot = protocolo === 'real'
        ? `<protNFe versao="4.00"><infProt><tpAmb>${tpAmb}</tpAmb><verAplic>teste</verAplic><chNFe>${CHAVE}</chNFe><dhRecbto>2026-10-13T22:31:00-03:00</dhRecbto><nProt>152260000000001</nProt><digVal>AA==</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`
        : `<protNFe versao="4.00"><infProt><tpAmb>${tpAmb}</tpAmb><verAplic>contingencia</verAplic><chNFe>${CHAVE}</chNFe><dhRecbto>2026-10-13T22:31:00-03:00</dhRecbto><nProt>CONTINGENCIA</nProt><digVal>AA==</digVal><cStat>000</cStat><xMotivo>Contingencia sem transmissao</xMotivo></infProt></protNFe>`;
    return `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${nfe}${prot}</nfeProc>`;
}

const CPF = '<dest><CPF>11144477735</CPF><xNome>CONSUMIDOR FICTICIO</xNome><indIEDest>9</indIEDest></dest>';

jest.setTimeout(30000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'danfce-vanir-'));
let contador = 0;

async function gerar(xml: string, extra: Record<string, unknown> = {}) {
    const arquivo = path.join(dir, `nfce-${++contador}.pdf`);
    const resultado = await NFCE_GerarDanfe({ data: xml, outputPath: arquivo, ...extra } as any);
    expect(resultado.success).toBe(true);
    const pdf = fs.readFileSync(arquivo);
    // DANFCE_AMOSTRAS=<pasta> guarda os PDFs para olhar o desenho; sem ela, o teste não grava nada fora do tmp
    if (process.env.DANFCE_AMOSTRAS) {
        fs.mkdirSync(process.env.DANFCE_AMOSTRAS, { recursive: true });
        fs.copyFileSync(arquivo, path.join(process.env.DANFCE_AMOSTRAS, `nfce-${contador}.pdf`));
    }
    expect(pdf.subarray(-20).toString('latin1')).toContain('%%EOF');
    const { text, numpages } = textoDoPdf(pdf);
    return { pdf, texto: text.replace(/\s+/g, ' '), numpages };
}

describe('DANFCE (NFC-e), largura de 80 mm', () => {
    it('nota normal autorizada: divisões, protocolo, chave em blocos de 4 e QR de no mínimo 25 mm', async () => {
        const { pdf, texto, numpages } = await gerar(nfce({ infCpl: 'Obrigado pela preferencia' }));

        expect(numpages).toBe(1);
        // I cabeçalho
        expect(texto).toContain('CNPJ: 11.222.333/0001-81');
        expect(texto).toContain('EMITENTE FICTICIO LTDA');
        expect(texto).toContain('GOIANIA - GO');
        expect(texto).toContain('Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica');
        expect(texto).toContain('Não permite aproveitamento de crédito de ICMS');
        // II detalhe, III totais e pagamento
        expect(texto).toContain('Racao para bovinos 25kg');
        expect(texto).toContain('Qtd. total de itens 1');
        expect(texto).toContain('Valor total R$ 10,00');
        expect(texto).toContain('Valor a Pagar R$ 10,00');
        expect(texto).toContain('FORMA DE PAGAMENTO');
        expect(texto).toContain('Troco R$ 0,00');
        // IV consulta, a chave em onze blocos de quatro
        expect(texto).toContain('Consulte pela Chave de Acesso em');
        expect(texto).toContain('https://consulta.exemplo.invalid/nfce');
        expect(texto).toContain(BLOCOS_DA_CHAVE);
        expect(BLOCOS_DA_CHAVE.split(' ')).toHaveLength(11);
        // VI consumidor e VII identificação: a hora sai do texto do XML (22:30), não do fuso do processo
        expect(texto).toContain('CONSUMIDOR NÃO IDENTIFICADO');
        expect(texto).toContain('NFC-e nº 1 Série 880 13/10/2026 22:30:00 - Via Consumidor');
        expect(texto).toContain('Protocolo de autorização: 152260000000001');
        expect(texto).toContain('Data de autorização 13/10/2026 22:31:00');
        // IX
        expect(texto).toContain('Tributos Totais Incidentes (Lei Federal 12.741/2012): R$ 3,25');
        expect(texto).toContain('Obrigado pela preferencia');
        // nenhuma marca que não cabe numa nota normal
        expect(texto).not.toContain('HOMOLOGAÇÃO');
        expect(texto).not.toContain('CONTINGÊNCIA');
        expect(texto).not.toContain('Pendente de autorização');
        expect(texto).not.toContain('VIA DO ESTABELECIMENTO');
        expect(texto).not.toContain('CANCELADA');

        // largura de 80 mm e QR de 25 mm ou mais
        expect(tamanhoDaPagina(pdf).largura).toBeCloseTo(80 * MM, 1);
        const qr = imagensDoPdf(pdf);
        expect(qr).toHaveLength(1);
        expect(qr[0].largura).toBeGreaterThanOrEqual(25 * MM - 0.01);
        expect(qr[0].altura).toBeCloseTo(qr[0].largura, 2);
        expect(Math.min(...tamanhosDeFonte(pdf))).toBeGreaterThanOrEqual(5);
    });

    it('com CPF do consumidor, mostra o CPF mascarado e o nome', async () => {
        const { texto } = await gerar(nfce({ dest: CPF }));
        expect(texto).toContain('CONSUMIDOR - CPF 111.444.777-35');
        expect(texto).toContain('CONSUMIDOR FICTICIO');
        expect(texto).not.toContain('CONSUMIDOR NÃO IDENTIFICADO');
    });

    it('com CNPJ do consumidor, rotula CNPJ', async () => {
        const { texto } = await gerar(nfce({ dest: '<dest><CNPJ>99888777000166</CNPJ><xNome>EMPRESA CLIENTE</xNome><indIEDest>9</indIEDest></dest>' }));
        expect(texto).toContain('CONSUMIDOR - CNPJ 99.888.777/0001-66');
    });

    it('homologação: faixa "SEM VALOR FISCAL" no topo', async () => {
        const { texto } = await gerar(nfce({ tpAmb: 2 }));
        expect(texto).toContain('EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL');
        // a faixa vem antes do detalhe da venda
        expect(texto.indexOf('SEM VALOR FISCAL')).toBeLessThan(texto.indexOf('Racao para bovinos'));
    });

    it('homologação com faixaAmbiente informada troca o texto da faixa', async () => {
        const { texto } = await gerar(nfce({ tpAmb: 2 }), { faixaAmbiente: 'FAIXA PERSONALIZADA DO VANIR' });
        expect(texto).toContain('FAIXA PERSONALIZADA DO VANIR');
        expect(texto).not.toContain('SEM VALOR FISCAL');
    });

    it('faixaAmbiente não aparece em produção', async () => {
        const { texto } = await gerar(nfce({ tpAmb: 1 }), { faixaAmbiente: 'FAIXA PERSONALIZADA DO VANIR' });
        expect(texto).not.toContain('FAIXA PERSONALIZADA DO VANIR');
    });

    it('contingência (tpEmis 9) sem protocolo: "EMITIDA EM CONTINGÊNCIA" e "Pendente de autorização"', async () => {
        const { texto } = await gerar(nfce({ tpEmis: 9, protocolo: 'nenhum' }));
        expect(texto).toContain('EMITIDA EM CONTINGÊNCIA');
        expect(texto).toContain('Pendente de autorização');
        expect(texto).not.toContain('Protocolo de autorização');
        expect(texto).not.toContain('Data de autorização');
        // o gerador original inventava "Protocolo 123" e a data de agora: nenhum dos dois pode voltar
        expect(texto).not.toContain('Protocolo');
    });

    it('contingência com o protNFe de mentira do serviço (nProt CONTINGENCIA, cStat 000) também é pendente', async () => {
        const { texto } = await gerar(nfce({ tpEmis: 9, protocolo: 'fake' }));
        expect(texto).toContain('EMITIDA EM CONTINGÊNCIA');
        expect(texto).toContain('Pendente de autorização');
        expect(texto).not.toContain('Protocolo de autorização');
        expect(texto).not.toContain('CONTINGENCIA');
    });

    it('contingência já transmitida e autorizada mostra o protocolo, e não "Pendente"', async () => {
        const { texto } = await gerar(nfce({ tpEmis: 9, protocolo: 'real' }));
        expect(texto).toContain('EMITIDA EM CONTINGÊNCIA');
        expect(texto).toContain('Protocolo de autorização: 152260000000001');
        expect(texto).not.toContain('Pendente de autorização');
    });

    it('via do estabelecimento: título, "Via Estabelecimento" e linha de assinatura do consumidor', async () => {
        const { texto, numpages } = await gerar(nfce({ tpEmis: 9, protocolo: 'nenhum' }), { viaEstabelecimento: true });
        expect(numpages).toBe(1);
        expect(texto).toContain('VIA DO ESTABELECIMENTO');
        expect(texto).toContain('- Via Estabelecimento');
        expect(texto).toContain('Assinatura do consumidor');
        expect(texto).not.toContain('Via Consumidor');
    });

    it('nota cancelada leva a marca "NFC-e CANCELADA"', async () => {
        const { texto } = await gerar(nfce(), { cancelada: true });
        expect(texto).toContain('NFC-e CANCELADA');
    });

    it('vários itens, desconto, dois pagamentos e troco', async () => {
        const { texto } = await gerar(nfce({
            itens: 3,
            desconto: '5.00',
            pagamentos: [{ tPag: '01', vPag: '20.00' }, { tPag: '17', vPag: '10.00' }],
            troco: '5.00',
        }));
        expect(texto).toContain('Qtd. total de itens 3');
        expect(texto).toContain('Valor total R$ 30,00');
        expect(texto).toContain('Desconto R$ 5,00');
        expect(texto).toContain('Valor a Pagar R$ 25,00');
        expect(texto).toContain('Troco R$ 5,00');
        expect(texto).toContain('Item 3');
    });

    it('a descrição longa quebra em linhas e não é cortada', async () => {
        const descricao = 'Racao completa para bovinos de corte em confinamento com nucleo mineral e proteico saco de 25 quilos lote 2026';
        const { texto } = await gerar(nfce({ descricao }));
        expect(texto).toContain('2026');
        for (const palavra of descricao.split(' ')) expect(texto).toContain(palavra);
    });

    it('sem vTotTrib no XML, não imprime "NaN" nem a linha de tributos', async () => {
        const { texto } = await gerar(nfce({ vTotTrib: null }));
        expect(texto).not.toContain('NaN');
        expect(texto).not.toContain('Tributos Totais');
    });

    it('logo opcional entra como imagem a mais, ao lado do QR', async () => {
        const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
        const { pdf } = await gerar(nfce(), { logo: PNG });
        expect(imagensDoPdf(pdf)).toHaveLength(2);
    });
});

describe('DANFCE (NFC-e), largura de 56 mm', () => {
    it('página de 56 mm, chave numa linha só, letra de no mínimo 5 pt e QR de no mínimo 25 mm', async () => {
        const { pdf, texto, numpages } = await gerar(nfce({ dest: CPF }), { pageWidth: 56 * MM });
        expect(numpages).toBe(1);
        expect(tamanhoDaPagina(pdf).largura).toBeCloseTo(56 * MM, 1);
        expect(texto).toContain(BLOCOS_DA_CHAVE);
        expect(texto).toContain('Protocolo de autorização: 152260000000001');
        expect(texto).toContain('CONSUMIDOR - CPF 111.444.777-35');
        expect(Math.min(...tamanhosDeFonte(pdf))).toBeGreaterThanOrEqual(5);
        const qr = imagensDoPdf(pdf);
        expect(qr[0].largura).toBeGreaterThanOrEqual(25 * MM - 0.01);
        // o QR cabe dentro da página
        expect(qr[0].largura).toBeLessThanOrEqual(tamanhoDaPagina(pdf).largura);
    });
});
