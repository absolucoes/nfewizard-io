/**
    * @description      : DANFE NFC-e (DANFCE), cupom em coluna única de 80 mm (ou 56 mm).
    * @author           : Marco Aurélio Silva Lima
    * @group            :
    * @created          :
    *
    * MODIFICATION LOG
    * - Version         : 1.0.0
    * - Date            : 3/7/2025
    * - Author          : Cassio Seffrin
    * - Modification    : Vanir (fork): reescrito segundo o Manual do DANFE NFC-e v6.0, ver CHANGELOG-VANIR.md
**/
/*
 * This file is part of NFeWizard-io.
 *
 * NFeWizard-io is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * NFeWizard-io is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with NFeWizard-io. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Fork Vanir. O gerador original desenhava com alturas fixas e tinha lacunas que o spike da NFC-e (fase 9)
 * apontou: sem faixa de homologação, "Protocolo 123" inventado quando a nota ainda não tinha protocolo, data
 * de autorização inventada (new Date()), data de emissão no fuso do processo, chave sem os blocos de 4,
 * descrição de item cortada, "NaN" nos tributos quando vTotTrib não vem, troco lido do lugar errado.
 *
 * O desenho agora corre numa coluna só, em duas passadas: a primeira mede a altura total num documento
 * descartável, a segunda cria a página com a altura exata (cupom contínuo, sem página em branco no fim).
 *
 * Ordem das divisões: I cabeçalho (logo, emitente, título); mensagem fiscal logo abaixo, para a marca de
 * homologação, contingência ou cancelamento ser a primeira coisa lida; II detalhe da venda; III totais e
 * pagamento; IV consulta pela chave; V QR Code (lado de no mínimo 25 mm); VI consumidor; VII identificação da
 * NFC-e e protocolo (ou "Pendente de autorização"); IX informações de interesse do contribuinte. A via do
 * estabelecimento acrescenta o título e a linha de assinatura do consumidor.
 */
import path from 'path';
import { diretorioDoModulo } from './utils/DiretorioDoModulo.js';
import fs from 'fs';
import { DetProd, Ide, Dest, Emit, Total, Transp, InfAdic, ProtNFe, Pag, InfNFeSupl, NFEGerarDanfeProps } from '@nfewizard/types/nfe';
import { format, parseISO } from 'date-fns';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { ValidaCPFCNPJ, getDesTipoPag } from '@nfewizard/shared';

// Suporte para módulos ES
const dirDoModulo = diretorioDoModulo;

// Caminho das fontes relativo ao pacote instalado
// Rollup faz bundle em dist/index.mjs, então dist/ -> ../resources/
const fontDir = path.resolve(dirDoModulo, '../resources/fonts/ARIAL.TTF');
const fontDirBold = path.resolve(dirDoModulo, '../resources/fonts/ARIALBD.TTF');

/** 1 mm em pontos do PDF. */
const MM = 72 / 25.4;
/** Largura padrão do cupom, 80 mm. */
const LARGURA_80MM = 80 * MM;
/** Lado mínimo do QR Code no papel, 25 mm (Manual do DANFE NFC-e). */
const QR_MINIMO = 25 * MM;
/** Tamanho mínimo de letra: abaixo disso o cupom de 56 mm deixa de ser legível na térmica. */
const FONTE_MINIMA = 5;

const TEXTO_HOMOLOGACAO = 'EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL';

/** 1234.5 -> "1.234,50", sem depender dos dados de locale do Node. */
function numero(valor: unknown, minDec = 2, maxDec = 2): string {
    const n = Number(valor);
    const fixo = (Number.isFinite(n) ? n : 0).toFixed(maxDec);
    let [inteiro, dec = ''] = fixo.split('.');
    while (dec.length > minDec && dec.endsWith('0')) dec = dec.slice(0, -1);
    inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec ? `${inteiro},${dec}` : inteiro;
}

/**
 * "2026-10-13T22:30:00-03:00" -> "13/10/2026 22:30:00", lendo o texto e não o fuso do processo
 * (em UTC, `new Date().getHours()` daria 01:30 do dia 14).
 */
function dataHora(iso?: string): string {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
    try {
        return format(parseISO(String(iso)), 'dd/MM/yyyy HH:mm:ss');
    } catch {
        return String(iso);
    }
}

class NFCeGerarDanfe {
    data: NFEGerarDanfeProps['data'];
    chave: string;
    enviada: boolean;
    outputPath: string
    qrcodePath: string;
    documento: ValidaCPFCNPJ;
    protNFe: ProtNFe | undefined;
    det: DetProd | DetProd[];
    ide: Ide;
    dest: Dest | undefined;
    emit: Emit;
    total: Total;
    transp: Transp;
    pag: Pag;
    infAdic: InfAdic | undefined;
    infNFeSupl: InfNFeSupl | undefined
    exibirMarcaDaguaDanfe?: boolean;
    fontSize: number;
    larguraPadrao: number;
    documentWidth: number;
    itemHeight: number;
    doc!: InstanceType<typeof PDFDocument>;

    private logo: Buffer | null;
    private faixaAmbiente: string | null;
    private viaEstabelecimento: boolean;
    private cancelada: boolean;
    private margem = 5.67;
    private y = 0;
    private qr: { buffer: Buffer; lado: number } | null = null;

    constructor(props: NFEGerarDanfeProps) {
        const { data, chave, outputPath, pageWidth, logo, faixaAmbiente, viaEstabelecimento, cancelada } = props;

        this.data = data;
        // a chave pode chegar como "NFe4126..." ou com espaços: só os 44 dígitos valem
        this.chave = String(chave || '').replace(/\D/g, '');
        this.outputPath = outputPath;
        this.enviada = false; // Valor padrão
        this.qrcodePath = outputPath; // Caminho padrão
        this.documento = new ValidaCPFCNPJ(); // Inicialização correta
        this.protNFe = data.protNFe;
        this.logo = logo || null;
        this.faixaAmbiente = faixaAmbiente || null;
        this.viaEstabelecimento = !!viaEstabelecimento;
        this.cancelada = !!cancelada;

        const nfeData = Array.isArray(data.NFe) ? data.NFe[0] : data.NFe;
        const { det, ide, emit, dest, total, transp, pag, infAdic } = nfeData.infNFe;
        const infNFeSupl = nfeData.infNFeSupl;

        this.det = det;
        this.ide = ide;
        this.emit = emit;
        this.total = total;
        this.transp = transp;
        this.pag = pag;
        this.infAdic = infAdic;
        this.infNFeSupl = infNFeSupl;
        if (dest) this.dest = dest;

        this.enviada = this.temProtocolo();

        this.larguraPadrao = LARGURA_80MM;
        this.documentWidth = pageWidth || LARGURA_80MM; // 56 mm = 158.74
        // 7 pt em 80 mm; encolhe junto com a largura, mas nunca abaixo de 5 pt
        this.fontSize = Math.max(FONTE_MINIMA, (7 * this.documentWidth) / this.larguraPadrao);
        this.itemHeight = this.fontSize * 1.116;
    }

    /**
     * Só protocolo de verdade conta. Na contingência sem transmissão o serviço devolve um protNFe de mentira
     * (nProt "CONTINGENCIA", cStat 000): isso é "pendente de autorização", não uma nota autorizada.
     */
    private temProtocolo(): boolean {
        const prot = this.protNFe?.infProt;
        if (!prot?.nProt) return false;
        if (String(prot.nProt).toUpperCase() === 'CONTINGENCIA') return false;
        const cStat = prot.cStat === undefined || prot.cStat === null ? '' : String(prot.cStat);
        return cStat === '' || cStat === '100' || cStat === '150';
    }

    private get itens(): DetProd[] {
        return Array.isArray(this.det) ? this.det : [this.det];
    }

    private get larguraUtil(): number {
        return this.documentWidth - 2 * this.margem;
    }

    private get emContingencia(): boolean {
        return [4, 9].includes(Number(this.ide.tpEmis));
    }

    private get emHomologacao(): boolean {
        return Number(this.ide.tpAmb) === 2;
    }

    saveQRCode = async (text: string) => {
        try {
            await QRCode.toFile(`${this.qrcodePath}/qrcode.png`, text, {
                color: {
                    dark: '#000000', // Cor do código
                    light: '#FFFFFF', // Cor de fundo
                },
                width: 300, // Largura da imagem
            });
        } catch (error: any) {
            console.error('Erro ao gerar o QR code:', error);
            console.error(error.stack);
        }
    };

    getQRCodeBuffer = async (text: string) => {
        try {
            const buffer = await QRCode.toBuffer(text, {
                color: {
                    dark: '#000000', // Cor do código
                    light: '#FFFFFF', // Cor de fundo
                },
                width: 300, // Largura da imagem
            });
            return buffer;
        } catch (error: any) {
            console.error('Erro ao gerar o QR code:', error);
            console.error(error.stack);
            throw new Error(`Erro ao gerar o QR code: ${error.message}`);
        }
    };

    createDir(path: string) {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path, { recursive: true });
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Infraestrutura de desenho
    // ---------------------------------------------------------------------------------------------

    private novoDocumento(altura: number) {
        const doc = new PDFDocument({
            // margem de baixo zero: a altura já é exata, e o pdfkit não pode abrir página nova por arredondamento
            margins: { top: this.margem, right: this.margem, bottom: 0, left: this.margem },
            size: [this.documentWidth, altura],
            layout: 'portrait',
        });
        doc.registerFont('Arial', fontDir);
        doc.registerFont('Arial-bold', fontDirBold);
        return doc;
    }

    private fonte(negrito = false, tamanho = this.fontSize) {
        this.doc.font(negrito ? 'Arial-bold' : 'Arial').fontSize(tamanho);
    }

    /** Parágrafo na largura útil; avança o cursor pela altura que o texto de fato ocupa. */
    private bloco(
        texto: string,
        opcoes: { negrito?: boolean; tamanho?: number; align?: 'left' | 'center' | 'right'; depois?: number } = {},
    ): number {
        const { negrito = false, tamanho = this.fontSize, align = 'left', depois = 0 } = opcoes;
        this.fonte(negrito, tamanho);
        const largura = this.larguraUtil;
        const altura = this.doc.heightOfString(texto, { width: largura, align });
        this.doc.text(texto, this.margem, this.y, { width: largura, align });
        this.y += altura + depois;
        return altura;
    }

    /** Rótulo à esquerda e valor à direita na mesma linha. */
    private linhaPar(esquerda: string, direita: string, negrito = false) {
        this.fonte(negrito);
        const altura = this.doc.currentLineHeight(true);
        this.doc.text(esquerda, this.margem, this.y, { width: this.larguraUtil, lineBreak: false });
        this.doc.text(direita, this.margem, this.y, { width: this.larguraUtil, align: 'right', lineBreak: false });
        this.y += altura;
    }

    private separador() {
        this.y += 1.5;
        this.doc
            .lineWidth(0.5)
            .dash(1, { space: 1 })
            .moveTo(this.margem, this.y)
            .lineTo(this.margem + this.larguraUtil, this.y)
            .stroke()
            .undash();
        this.y += 2.5;
    }

    // ---------------------------------------------------------------------------------------------
    // Divisões
    // ---------------------------------------------------------------------------------------------

    /** I. Cabeçalho: logo opcional, emitente, título. */
    private cabecalho() {
        if (this.viaEstabelecimento) {
            this.bloco('VIA DO ESTABELECIMENTO', { negrito: true, tamanho: this.fontSize + 1, align: 'center', depois: 2 });
        }

        if (this.logo) {
            const imagem = (this.doc as any).openImage(this.logo);
            const escala = Math.min((this.larguraUtil * 0.5) / imagem.width, (36 * this.fontSize / 7) / imagem.height);
            const largura = imagem.width * escala;
            const altura = imagem.height * escala;
            this.doc.image(this.logo, this.margem + (this.larguraUtil - largura) / 2, this.y, { width: largura, height: altura });
            this.y += altura + 3;
        }

        const documento = this.documento.mascaraCnpjCpf(
            String(this.emit.CNPJCPF || this.emit.CNPJ || this.emit.CPF || ''),
        );
        const e = this.emit.enderEmit;
        const endereco = [
            [e.xLgr, e.nro, (e as any).xCpl, e.xBairro].filter(Boolean).join(', '),
            [e.xMun, e.UF].filter(Boolean).join(' - '),
            e.CEP ? `CEP ${String(e.CEP).replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : '',
        ].filter(Boolean).join(', ');

        this.bloco(`CNPJ: ${documento}`, { align: 'center' });
        this.bloco(String(this.emit.xNome || ''), { negrito: true, align: 'center' });
        this.bloco(endereco, { align: 'center', depois: 2 });
        this.bloco('DANFE NFC-e', { negrito: true, align: 'center' });
        this.bloco('Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica', { align: 'center' });
        this.bloco('Não permite aproveitamento de crédito de ICMS', { align: 'center' });
    }

    /** Mensagem fiscal: homologação, contingência e cancelamento ficam em caixa, logo abaixo do cabeçalho. */
    private mensagemFiscal() {
        const mensagens: string[] = [];
        if (this.emHomologacao) mensagens.push(this.faixaAmbiente || TEXTO_HOMOLOGACAO);
        if (this.emContingencia) mensagens.push('EMITIDA EM CONTINGÊNCIA');
        if (this.cancelada) mensagens.push('NFC-e CANCELADA');
        if (!mensagens.length) return;

        this.y += 2;
        const tamanho = this.fontSize + 1;
        const interna = this.larguraUtil - 6;
        this.fonte(true, tamanho);
        const alturas = mensagens.map((m) => this.doc.heightOfString(m, { width: interna, align: 'center' }));
        const caixa = alturas.reduce((a, b) => a + b, 0) + 4 + (mensagens.length - 1) * 2;

        this.doc.lineWidth(0.8).rect(this.margem, this.y, this.larguraUtil, caixa).stroke();
        let topo = this.y + 2;
        mensagens.forEach((m, i) => {
            this.fonte(true, tamanho);
            this.doc.text(m, this.margem + 3, topo, { width: interna, align: 'center' });
            topo += alturas[i] + 2;
        });
        this.y += caixa + 2;
    }

    /** II. Detalhe da venda: código, descrição completa (quebra de linha), quantidade, unitário e total. */
    private detalhe() {
        const util = this.larguraUtil;
        const col = {
            codigo: util * 0.17,
            descricao: util * 0.33,
            qtde: util * 0.17,
            unit: util * 0.15,
            total: util * 0.18,
        };
        const linha = (
            celulas: [string, number, 'left' | 'right'][],
            negrito: boolean,
        ) => {
            this.fonte(negrito);
            const altura = Math.max(...celulas.map(([texto, largura, align]) => this.doc.heightOfString(texto, { width: largura, align })));
            let x = this.margem;
            for (const [texto, largura, align] of celulas) {
                this.doc.text(texto, x, this.y, { width: largura, align });
                x += largura;
            }
            this.y += altura + 1;
        };

        linha([
            ['Código', col.codigo, 'left'],
            ['Descrição', col.descricao, 'left'],
            ['Qtde UN', col.qtde, 'right'],
            ['Vl Unit', col.unit, 'right'],
            ['Vl Total', col.total, 'right'],
        ], true);

        for (const item of this.itens) {
            const p = item.prod;
            linha([
                [String(p.cProd ?? ''), col.codigo, 'left'],
                [String(p.xProd ?? ''), col.descricao, 'left'],
                [`${numero(p.qCom || p.qTrib, 2, 4)} ${p.uCom ?? ''}`.trim(), col.qtde, 'right'],
                [numero(p.vUnCom || p.vUnTrib, 2, 4), col.unit, 'right'],
                [numero(p.vProd), col.total, 'right'],
            ], false);
        }
    }

    /** III. Totais e informações de pagamento. */
    private totais() {
        const t: any = this.total?.ICMSTot ?? {};
        const soma = (campo: 'vProd' | 'vDesc' | 'vFrete' | 'vSeg' | 'vOutro') =>
            this.itens.reduce((s, i) => s + Number((i.prod as any)[campo] || 0), 0);

        const valorTotal = t.vProd !== undefined ? Number(t.vProd) : soma('vProd');
        const desconto = t.vDesc !== undefined ? Number(t.vDesc) : soma('vDesc');
        const acrescimos = t.vFrete !== undefined || t.vSeg !== undefined || t.vOutro !== undefined
            ? Number(t.vFrete || 0) + Number(t.vSeg || 0) + Number(t.vOutro || 0)
            : soma('vFrete') + soma('vSeg') + soma('vOutro');
        const valorAPagar = t.vNF !== undefined ? Number(t.vNF) : valorTotal + acrescimos - desconto;

        this.linhaPar('Qtd. total de itens', String(this.itens.length));
        this.linhaPar('Valor total R$', numero(valorTotal));
        if (desconto > 0) this.linhaPar('Desconto R$', numero(desconto));
        if (acrescimos > 0) this.linhaPar('Acréscimos R$', numero(acrescimos));
        this.linhaPar('Valor a Pagar R$', numero(valorAPagar), true);

        this.y += 2;
        this.linhaPar('FORMA DE PAGAMENTO', 'VALOR PAGO R$', true);
        const pagamentos: any[] = Array.isArray(this.pag.detPag) ? this.pag.detPag : [this.pag.detPag];
        for (const pagto of pagamentos) {
            this.linhaPar(String(pagto.xPag || getDesTipoPag(pagto.tPag) || 'Não informado'), numero(pagto.vPag));
        }

        // vTroco é do grupo pag (NT 2016/002); só na falta dele soma o que vier nos detPag
        const troco = this.pag.vTroco !== undefined && this.pag.vTroco !== null
            ? Number(this.pag.vTroco)
            : pagamentos.reduce((s, p) => s + Number(p.vTroco || 0), 0);
        this.linhaPar('Troco R$', numero(troco));
    }

    /** IV. Consulta pela chave de acesso, a chave em onze blocos de quatro dígitos. */
    private consulta() {
        this.bloco('Consulte pela Chave de Acesso em', { negrito: true, align: 'center' });
        if (this.infNFeSupl?.urlChave) this.bloco(String(this.infNFeSupl.urlChave), { align: 'center' });

        const blocos = (this.chave.match(/.{1,4}/g) || []).join(' ');
        if (blocos) {
            // numa linha só: encolhe a letra até caber, sem passar de fontSize nem baixar de FONTE_MINIMA
            this.fonte(false, 10);
            const largura10 = this.doc.widthOfString(blocos);
            const tamanho = Math.max(FONTE_MINIMA, Math.min(this.fontSize, (this.larguraUtil / largura10) * 10));
            this.bloco(blocos, { tamanho, align: 'center' });
        }
    }

    /** V. QR Code, centralizado, com lado de no mínimo 25 mm. */
    private qrCode() {
        if (!this.qr) return;
        this.bloco('Consulta via leitor de QR Code', { negrito: true, align: 'center', depois: 1 });
        const { buffer, lado } = this.qr;
        this.doc.image(buffer, this.margem + (this.larguraUtil - lado) / 2, this.y, { width: lado, height: lado });
        this.y += lado + 3;
    }

    /** VI. Consumidor. */
    private consumidor() {
        const d: any = this.dest;
        const cnpjcpf = String(d?.CNPJCPF || d?.CNPJ || d?.CPF || '').replace(/\D/g, '');
        const estrangeiro = d?.idEstrangeiro ? String(d.idEstrangeiro) : '';

        if (!cnpjcpf && !estrangeiro) {
            this.bloco('CONSUMIDOR NÃO IDENTIFICADO', { negrito: true, align: 'center' });
            return;
        }
        const rotulo = cnpjcpf ? (cnpjcpf.length === 14 ? 'CNPJ' : 'CPF') : 'ID ESTRANGEIRO';
        const id = cnpjcpf ? this.documento.mascaraCnpjCpf(cnpjcpf) : estrangeiro;
        this.bloco(`CONSUMIDOR - ${rotulo} ${id}`, { negrito: true, align: 'center' });
        if (d?.xNome) this.bloco(String(d.xNome), { align: 'center' });

        const e = d?.enderDest;
        const endereco = e
            ? [e.xLgr, e.nro, e.xBairro && `bairro: ${e.xBairro}`, e.xMun, e.UF].filter(Boolean).join(', ')
            : '';
        if (endereco) this.bloco(endereco, { align: 'center' });
    }

    /** VII. Identificação da NFC-e e protocolo; sem protocolo, "Pendente de autorização". */
    private identificacao() {
        const via = this.viaEstabelecimento ? 'Via Estabelecimento' : 'Via Consumidor';
        this.bloco(
            `NFC-e nº ${this.ide.nNF} Série ${this.ide.serie} ${dataHora(this.ide.dhEmi)} - ${via}`,
            { negrito: true, align: 'center' },
        );
        const prot = this.protNFe?.infProt;
        if (this.enviada && prot) {
            this.bloco(`Protocolo de autorização: ${prot.nProt}`, { align: 'center' });
            this.bloco(`Data de autorização ${dataHora(prot.dhRecbto)}`, { align: 'center' });
        } else {
            this.bloco('Pendente de autorização', { negrito: true, align: 'center' });
        }
    }

    /** IX. Informações de interesse do contribuinte e tributos totais (Lei 12.741/2012). */
    private interesseDoContribuinte() {
        const vTotTrib = (this.total?.ICMSTot as any)?.vTotTrib;
        if (vTotTrib !== undefined && vTotTrib !== null && vTotTrib !== '') {
            this.bloco(`Tributos Totais Incidentes (Lei Federal 12.741/2012): R$ ${numero(vTotTrib)}`, { align: 'center' });
        }
        if (this.infAdic?.infCpl) this.bloco(String(this.infAdic.infCpl), { align: 'center' });
    }

    /** Via do estabelecimento: espaço e linha para a assinatura do consumidor. */
    private assinaturaDoConsumidor() {
        this.y += 16;
        this.doc.lineWidth(0.5).moveTo(this.margem + 10, this.y).lineTo(this.margem + this.larguraUtil - 10, this.y).stroke();
        this.y += 2;
        this.bloco('Assinatura do consumidor', { align: 'center' });
    }

    /** Desenha tudo em `this.doc` e devolve o y em que terminou. */
    private construir(): number {
        this.y = this.margem;
        this.cabecalho();
        this.mensagemFiscal();
        this.separador();
        this.detalhe();
        this.separador();
        this.totais();
        this.separador();
        this.consulta();
        this.separador();
        this.qrCode();
        this.consumidor();
        this.separador();
        this.identificacao();
        this.separador();
        this.interesseDoContribuinte();
        if (this.viaEstabelecimento) this.assinaturaDoConsumidor();
        return this.y;
    }

    private async prepararQRCode() {
        const texto = this.infNFeSupl?.qrCode;
        if (!texto) throw new Error('NFC-e sem infNFeSupl.qrCode: o DANFCE não pode ser gerado sem o QR Code');
        const modulos = (QRCode.create(texto, {}) as any).modules.size as number;
        // 0,35 mm por módulo é o que a leitura em térmica pede; e nunca menos de 25 mm de lado
        const lado = Math.max(QR_MINIMO, modulos * 0.35 * MM);
        const buffer = await QRCode.toBuffer(texto, {
            margin: 0,
            scale: 8,
            color: { dark: '#000000', light: '#FFFFFF' },
        });
        this.qr = { buffer, lado };
    }

    async generatePDF(exibirMarcaDaguaDanfe?: boolean) {
        try {
            this.exibirMarcaDaguaDanfe = exibirMarcaDaguaDanfe ?? true;
            await this.prepararQRCode();

            // 1ª passada: mede a altura num documento descartável, alto o bastante para nada quebrar página
            this.doc = this.novoDocumento(30000);
            const fim = this.construir();
            this.doc.end();

            // 2ª passada: a página com a altura exata
            this.doc = this.novoDocumento(Math.ceil((fim + this.margem) * 100) / 100);
            const saida = fs.createWriteStream(this.outputPath);
            const gravado = new Promise<void>((resolve, reject) => {
                saida.on('finish', () => resolve());
                saida.on('error', reject);
            });
            this.doc.pipe(saida);
            this.construir();
            this.doc.end();
            await gravado;

            return {
                message: `  DANFE Gerada em '${this.outputPath}'`,
                success: true,
            };
        } catch (error: any) {
            throw new Error(`Erro ao gerar DANFE: ${error.message}`);
        }
    }
}

export { NFCeGerarDanfe };
