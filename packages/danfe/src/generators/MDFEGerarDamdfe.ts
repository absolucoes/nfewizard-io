import bwipjs from 'bwip-js';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { parseStringPromise } from 'xml2js';
import { dataHoraDoXml } from './utils/dataHoraDoXml.js';

type NodeXml = Record<string, any>;
/**
 * `logo` (Buffer PNG/JPEG) e `faixaAmbiente` são correção do Vanir, iguais às do DANFE e do DACTE: o logo ocupa um
 * quadro à esquerda do emitente, e a faixa substitui o texto padrão da marca de homologação (que só sai com tpAmb 2).
 */
export type MDFEGerarDamdfeProps = { data: string; outputPath: string; logo?: Buffer | null; faixaAmbiente?: string | null };
const FAIXA_HOMOLOGACAO_PADRAO = 'EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL';
/** Lado do quadro do logo, à esquerda do emitente. */
const LOGO_LADO = 50;
/** Uma linha da lista de documentos: o título de um município de descarga ou um documento dele. */
type LinhaDoc = { tipo: 'municipio'; texto: string } | { tipo: 'documento'; especie: string; chave: string };
type Municipio = { codigo: string; nome: string; docs: { type: string; key: string }[] };
const MM = 72 / 25.4;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 22;
const LINHA_DOC = 18;

function value(node: NodeXml | undefined, key: string): string {
    const v = node?.[key];
    if (v === undefined || v === null) return '';
    return typeof v === 'object' && '_' in v ? String(v._) : String(v);
}
function list<T>(v: T | T[] | undefined): T[] { return v === undefined ? [] : Array.isArray(v) ? v : [v]; }
function formatDate(value: string): string {
    // Os dígitos do XML, como no DANFE e no DACTE (brief fiscal/45).
    return dataHoraDoXml(value, 'dataHora');
}
function field(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, h: number, label: string, content: string, align: 'left' | 'center' | 'right' = 'left') {
    doc.rect(x, y, w, h).stroke();
    doc.font('Helvetica').fontSize(6).text(label.toUpperCase(), x + 3, y + 2, { width: w - 6 });
    doc.font('Helvetica').fontSize(8).text(content || ' ', x + 3, y + 11, { width: w - 6, height: h - 13, align, ellipsis: true });
}
/** Altura de um campo com uma linha por item (limite de 6 linhas), para não cortar o que foi informado. */
function alturaAuto(doc: InstanceType<typeof PDFDocument>, w: number, linhas: string[]): number {
    doc.font('Helvetica').fontSize(8);
    const h = doc.heightOfString(linhas.join('\n') || ' ', { width: w - 6 });
    return Math.min(h, 6 * 9.5) + 15;
}
function fieldAuto(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, h: number, label: string, linhas: string[]) {
    doc.rect(x, y, w, h).stroke();
    doc.font('Helvetica').fontSize(6).text(label.toUpperCase(), x + 3, y + 2, { width: w - 6 });
    doc.font('Helvetica').fontSize(8).text(linhas.join('\n') || ' ', x + 3, y + 11, { width: w - 6, height: h - 13, ellipsis: true });
}
function decimal(valor: string, casas = 2): string {
    return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
/** Uma linha de reboque: placa / UF, RENAVAM, tara e capacidade. */
function descricaoReboque(v: NodeXml): string {
    const partes = [[value(v, 'placa'), value(v, 'UF')].filter(Boolean).join(' / ')];
    if (value(v, 'RENAVAM')) partes.push('RENAVAM ' + value(v, 'RENAVAM'));
    if (value(v, 'tara')) partes.push('tara ' + value(v, 'tara') + ' kg');
    if (value(v, 'capKG')) partes.push('cap. ' + value(v, 'capKG') + ' kg');
    if (value(v, 'capM3')) partes.push(value(v, 'capM3') + ' m³');
    return partes.filter(Boolean).join(' · ');
}
/** Título de um município de descarga: nome, código IBGE e quantos documentos ele recebe. */
function tituloMunicipio(m: Municipio): string {
    const nome = [m.nome, m.codigo ? '(' + m.codigo + ')' : ''].filter(Boolean).join(' ') || 'Município não informado';
    return 'MUNICÍPIO DE DESCARGA: ' + nome + ' · ' + m.docs.length + (m.docs.length === 1 ? ' documento' : ' documentos');
}
/**
 * Distribui as linhas pelas folhas. Um título de município nunca fica sozinho no fim da folha, e o município que
 * continua na folha seguinte repete o título com "(continuação)", para a chave nunca aparecer sem o seu município.
 */
function paginarDocumentos(municipios: Municipio[], porFolha: number): LinhaDoc[][] {
    const folhas: LinhaDoc[][] = [[]];
    const atual = () => folhas[folhas.length - 1];
    const novaFolha = () => { folhas.push([]); };
    for (const m of municipios) {
        // O título precisa de pelo menos um documento embaixo; sem documento, de um lugar só para ele.
        if (atual().length > 0 && atual().length + Math.min(2, 1 + m.docs.length) > porFolha) novaFolha();
        atual().push({ tipo: 'municipio', texto: tituloMunicipio(m) });
        m.docs.forEach((d) => {
            if (atual().length >= porFolha) {
                novaFolha();
                atual().push({ tipo: 'municipio', texto: tituloMunicipio(m) + ' (continuação)' });
            }
            atual().push({ tipo: 'documento', especie: d.type, chave: d.key });
        });
    }
    return folhas;
}
function header(doc: InstanceType<typeof PDFDocument>, emit: NodeXml, ide: NodeXml, key: string, page: number, pages: number, qr: Buffer, bar: Buffer, prot: NodeXml, w: number, tpAmb: string, rntrc: string, logo: Buffer | null, faixaAmbiente: string | null) {
    const x = MARGIN, q = 25 * MM;
    // Com logo, o quadro ocupa a esquerda e o texto do emitente desloca; sem logo o leiaute original permanece.
    const deslocamento = logo ? LOGO_LADO + 6 : 0;
    if (logo) doc.image(logo, x, 24, { fit: [LOGO_LADO, LOGO_LADO], align: 'center', valign: 'center' });
    const end = emit.enderEmit || {};
    const address = [value(end, 'xLgr'), value(end, 'nro'), value(end, 'xBairro'), value(end, 'xMun'), value(end, 'UF'), value(end, 'CEP')].filter(Boolean).join(' - ');
    const cnpjLabel = value(emit, 'CNPJ') ? 'CNPJ' : 'CPF';
    const cnpj = value(emit, 'CNPJ') || value(emit, 'CPF');
    doc.font('Helvetica-Bold').fontSize(11).text(value(emit, 'xNome'), x + deslocamento, 24, { width: w - q - 10 - deslocamento, ellipsis: true });
    doc.font('Helvetica').fontSize(8).text(address + '\n' + cnpjLabel + ': ' + cnpj + '  IE: ' + value(emit, 'IE') + '  RNTRC: ' + rntrc, x + deslocamento, 40, { width: w - q - 10 - deslocamento, height: 38 });
    doc.image(qr, x + w - q, 24, { width: q, height: q });
    doc.font('Helvetica-Bold').fontSize(12).text('DAMDFE - Documento Auxiliar do Manifesto Eletrônico de Documentos Fiscais', x, 91, { width: w, align: 'center' });
    const cols = [38, 38, 54, 36, 170, 60, w - 396];
    const vals = [['Modelo', value(ide, 'mod')], ['Série', value(ide, 'serie')], ['Número', value(ide, 'nMDF')], ['Folha', page + '/' + pages], ['Data e hora de emissão', formatDate(value(ide, 'dhEmi'))], ['UF carreg.', value(ide, 'UFIni')], ['UF descarreg.', value(ide, 'UFFim')]];
    let cx = x;
    vals.forEach((v, i) => { field(doc, cx, 111, cols[i], 28, v[0], v[1], 'center'); cx += cols[i]; });
    const bw = 90 * MM, bh = 30 * MM;
    doc.image(bar, x + (w - bw) / 2, 145, { fit: [bw, bh], align: 'center', valign: 'center' });
    doc.font('Helvetica').fontSize(7).text(key.replace(/(.{4})/g, '$1 ').trim(), x, 233, { width: w, align: 'center', characterSpacing: 0.3 });
    const auth = value(prot, 'nProt') ? 'Protocolo de autorização: ' + value(prot, 'nProt') + '  Recebido em: ' + formatDate(value(prot, 'dhRecbto')) : 'EMISSÃO EM CONTINGÊNCIA';
    doc.font('Helvetica-Bold').fontSize(8).text(auth, x, 247, { width: w, align: 'center' });
    // A faixa que o chamador passa substitui o texto padrão; como no DANFE e no DACTE, só sai em homologação (tpAmb 2).
    if (tpAmb === '2') doc.font('Helvetica-Bold').fontSize(10).text(faixaAmbiente || FAIXA_HOMOLOGACAO_PADRAO, x, 263, { width: w, align: 'center' });
    field(doc, x, 282, w, 24, 'Modal', 'Rodoviário de Cargas');
}
export async function MDFE_GerarDamdfe(props: MDFEGerarDamdfeProps) {
    const parsed = await parseStringPromise(props.data, { explicitArray: false, attrkey: '$', charkey: '_', trim: true });
    const proc = parsed?.mdfeProc, mdfe = proc?.MDFe, inf = mdfe?.infMDFe, prot = proc?.protMDFe?.infProt;
    if (!inf || !prot?.nProt || value(prot, 'cStat') !== '100') throw new Error('DAMDFE_EXIGE_MDFE_AUTORIZADO');
    const key = value(prot, 'chMDFe') || String(inf?.$?.Id || '').replace(/^MDFe/, '');
    if (!/^\d{44}$/.test(key)) throw new Error('DAMDFE_CHAVE_INVALIDA');
    const tpAmb = value(prot, 'tpAmb');
    if (tpAmb !== '1' && tpAmb !== '2') throw new Error('DAMDFE_AMBIENTE_INVALIDO');
    const qrText = value(mdfe.infMDFeSupl, 'qrCodMDFe');
    if (!qrText) throw new Error('DAMDFE_QRCODE_AUSENTE');
    // Os documentos ficam agrupados pelo município de descarga a que pertencem (Anexo II do MOC do MDF-e).
    const municipios: Municipio[] = list(inf.infDoc?.infMunDescarga).map((m: NodeXml) => {
        const docsDoMunicipio: Municipio['docs'] = [];
        list(m.infCTe).forEach((d: NodeXml) => docsDoMunicipio.push({ type: 'CT-e', key: value(d, 'chCTe') }));
        list(m.infNFe).forEach((d: NodeXml) => docsDoMunicipio.push({ type: 'NF-e', key: value(d, 'chNFe') }));
        list(m.infMDFeTransp).forEach((d: NodeXml) => docsDoMunicipio.push({ type: 'MDF-e', key: value(d, 'chMDFe') }));
        return { codigo: value(m, 'cMunDescarga'), nome: value(m, 'xMunDescarga'), docs: docsDoMunicipio };
    });
    const totalDocs = municipios.reduce((n, m) => n + m.docs.length, 0);
    const qr = await QRCode.toBuffer(qrText, { width: 240, margin: 4 });
    const bar = await bwipjs.toBuffer({ bcid: 'code128', text: key, scaleX: 2, height: 20, includetext: false, paddingwidth: 10, paddingheight: 8 });
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margins: { top: 22, right: MARGIN, bottom: 22, left: MARGIN }, bufferPages: false, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const ended = new Promise<void>((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
    const w = PAGE_W - MARGIN * 2, unload = list(inf.infDoc?.infMunDescarga);
    const cteCount = unload.reduce((n: number, m: NodeXml) => n + list(m.infCTe).length, 0);
    const nfeCount = unload.reduce((n: number, m: NodeXml) => n + list(m.infNFe).length, 0);
    const rodo = inf.infModal?.rodo || {};
    const total = inf.tot || {}, vehicle = rodo.veicTracao || {};
    // O XSD do MDF-e 3.00 põe o RNTRC em `rodo/infANTT/RNTRC`. `emit/RNTRC` e `veicTracao/RNTRC` não existem no
    // leiaute, mas continuam valendo como recurso para o XML de quem os preencheu assim.
    const rntrc = value(rodo.infANTT, 'RNTRC') || value(inf.emit, 'RNTRC') || value(vehicle, 'RNTRC');
    const countCargo = value(total, 'qCarga') + ' ' + value(total, 'cUnid');
    const totalValue = Number(value(total, 'vCarga') || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const drivers = list(vehicle.condutor).map((d: NodeXml) => value(d, 'xNome') + ' - CPF ' + value(d, 'CPF')).join(' | ');
    const insurance = list(inf.seg).map((s: NodeXml) => [value(s, 'xSeg'), value(s, 'CNPJ') || value(s, 'CPF'), value(s, 'nApol')].filter(Boolean).join(' / ')).join(' | ');
    const reboques = list(rodo.veicReboque).map((v: NodeXml, i: number) => 'Reboque ' + (i + 1) + ': ' + descricaoReboque(v));
    const valePedagio = list(rodo.infANTT?.valePed?.disp).map((d: NodeXml) => [
        'Fornecedora ' + value(d, 'CNPJForn'),
        value(d, 'CNPJPg') ? 'Responsável CNPJ ' + value(d, 'CNPJPg') : value(d, 'CPFPg') ? 'Responsável CPF ' + value(d, 'CPFPg') : '',
        value(d, 'nCompra') ? 'Comprovante ' + value(d, 'nCompra') : '',
        'R$ ' + decimal(value(d, 'vValePed')),
    ].filter(Boolean).join(' · '));
    const lacres = [...list(rodo.lacRodo), ...list(inf.lacres)].map((l: NodeXml) => value(l, 'nLacre')).filter(Boolean);
    const linhasLacres = lacres.length ? [lacres.join(', ')] : [];
    // Reboque, vale-pedágio e lacres só ocupam lugar quando o XML os traz.
    const hReboques = reboques.length ? alturaAuto(doc, w, reboques) : 0;
    const hVale = valePedagio.length ? alturaAuto(doc, w, valePedagio) : 0;
    const hLacres = lacres.length ? alturaAuto(doc, w, linhasLacres) : 0;
    // A lista de documentos ocupa o que sobra da folha depois do cabeçalho e dos campos de cima. O cabeçalho repete
    // em toda folha, então a conta vale para todas; a soma é a mesma das linhas desenhadas no laço abaixo.
    const yDocs = 311 + 35 + 28 + 28 + 24 + 31 + 26 + 13 + LINHA_DOC + hReboques + hVale + hLacres;
    const porFolha = Math.max(1, Math.floor((PAGE_H - 22 - yDocs) / LINHA_DOC));
    const folhas: LinhaDoc[][] = totalDocs ? paginarDocumentos(municipios, porFolha) : [[]];
    const pages = folhas.length;
    const logo = props.logo || null, faixaAmbiente = props.faixaAmbiente || null;
    for (let page = 1; page <= pages; page++) {
        if (page > 1) doc.addPage();
        header(doc, inf.emit || {}, inf.ide || {}, key, page, pages, qr, bar, prot, w, tpAmb, rntrc, logo, faixaAmbiente);
        let y = 311;
        field(doc, MARGIN, y, w / 4, 30, 'Qtd. CT-e', String(cteCount), 'center');
        field(doc, MARGIN + w / 4, y, w / 4, 30, 'Qtd. NF-e', String(nfeCount), 'center');
        field(doc, MARGIN + w / 2, y, w / 4, 30, 'Peso total', countCargo, 'center');
        field(doc, MARGIN + w * 3 / 4, y, w / 4, 30, 'Valor da carga', 'R$ ' + totalValue, 'center');
        y += 35;
        const plate = [value(vehicle, 'placa'), value(vehicle, 'UF'), rntrc].filter(Boolean).join(' / ');
        field(doc, MARGIN, y, w / 2, 28, 'Veículo de tração (placa / UF / RNTRC)', plate);
        field(doc, MARGIN + w / 2, y, w / 2, 28, 'Produto predominante', [value(inf.prodPred, 'tpCarga'), value(inf.prodPred, 'xProd')].filter(Boolean).join(' - '));
        y += 28;
        field(doc, MARGIN, y, w / 2, 28, 'RENAVAM do veículo de tração', value(vehicle, 'RENAVAM'));
        field(doc, MARGIN + w / 2, y, w / 2, 28, 'Tara do veículo de tração (kg)', value(vehicle, 'tara'));
        y += 28;
        if (hReboques) { fieldAuto(doc, MARGIN, y, w, hReboques, 'Veículos reboque (placa / UF, RENAVAM, tara, capacidade)', reboques); y += hReboques; }
        if (hVale) { fieldAuto(doc, MARGIN, y, w, hVale, 'Vale-pedágio (fornecedora, responsável pelo pagamento, comprovante, valor)', valePedagio); y += hVale; }
        if (hLacres) { fieldAuto(doc, MARGIN, y, w, hLacres, 'Lacres', linhasLacres); y += hLacres; }
        field(doc, MARGIN, y, w / 2, 24, 'Seguro / seguradora', insurance);
        const route = list(inf.percurso?.UFPer).map((u: NodeXml) => value(u, 'UFPer') || String(u)).join(' - ') || value(inf.ide, 'UFIni') + ' - ' + value(inf.ide, 'UFFim');
        field(doc, MARGIN + w / 2, y, w / 2, 24, 'Percurso', route);
        y += 24;
        field(doc, MARGIN, y, w, 26, 'Condutor(es)', drivers);
        y += 31;
        field(doc, MARGIN, y, w, 22, 'Observações', value(inf.infAdic, 'infCpl'));
        y += 26;
        doc.font('Helvetica-Bold').fontSize(8).text('DOCUMENTOS FISCAIS VINCULADOS', MARGIN, y);
        y += 13;
        field(doc, MARGIN, y, 52, LINHA_DOC, 'Tipo', '');
        field(doc, MARGIN + 52, y, w - 52, LINHA_DOC, 'Chave de acesso', '');
        y += LINHA_DOC;
        folhas[page - 1].forEach((linha) => {
            if (linha.tipo === 'municipio') {
                // Título do município: faixa cinza de largura inteira, para separar os grupos de chaves.
                doc.rect(MARGIN, y, w, LINHA_DOC).fillAndStroke('#e6e6e6', 'black');
                doc.fillColor('black').font('Helvetica-Bold').fontSize(8).text(linha.texto, MARGIN + 3, y + 5, { width: w - 6, height: LINHA_DOC - 6, ellipsis: true });
            } else {
                field(doc, MARGIN, y, 52, LINHA_DOC, '', linha.especie);
                field(doc, MARGIN + 52, y, w - 52, LINHA_DOC, '', linha.chave);
            }
            y += LINHA_DOC;
        });
        if (!totalDocs) field(doc, MARGIN, y, w, LINHA_DOC, '', 'Sem documentos fiscais vinculados');
    }
    doc.end();
    await ended;
    await fs.promises.writeFile(props.outputPath, Buffer.concat(chunks));
    return { success: true, outputPath: props.outputPath, key, totalPaginas: pages };
}
