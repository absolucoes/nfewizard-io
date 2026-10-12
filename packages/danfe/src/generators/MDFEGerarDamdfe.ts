import bwipjs from 'bwip-js';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { parseStringPromise } from 'xml2js';

type NodeXml = Record<string, any>;
export type MDFEGerarDamdfeProps = { data: string; outputPath: string };
const MM = 72 / 25.4;
const PAGE_W = 595.28;
const MARGIN = 22;

function value(node: NodeXml | undefined, key: string): string {
    const v = node?.[key];
    if (v === undefined || v === null) return '';
    return typeof v === 'object' && '_' in v ? String(v._) : String(v);
}
function list<T>(v: T | T[] | undefined): T[] { return v === undefined ? [] : Array.isArray(v) ? v : [v]; }
function formatDate(value: string): string {
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?/.exec(value);
    return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] + ':' + (m[6] || '00') : value;
}
function field(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, h: number, label: string, content: string, align: 'left' | 'center' | 'right' = 'left') {
    doc.rect(x, y, w, h).stroke();
    doc.font('Helvetica').fontSize(6).text(label.toUpperCase(), x + 3, y + 2, { width: w - 6 });
    doc.font('Helvetica').fontSize(8).text(content || ' ', x + 3, y + 11, { width: w - 6, height: h - 13, align, ellipsis: true });
}
function header(doc: InstanceType<typeof PDFDocument>, emit: NodeXml, ide: NodeXml, key: string, page: number, pages: number, qr: Buffer, bar: Buffer, prot: NodeXml, w: number, tpAmb: string) {
    const x = MARGIN, q = 25 * MM;
    const end = emit.enderEmit || {};
    const address = [value(end, 'xLgr'), value(end, 'nro'), value(end, 'xBairro'), value(end, 'xMun'), value(end, 'UF'), value(end, 'CEP')].filter(Boolean).join(' - ');
    const cnpjLabel = value(emit, 'CNPJ') ? 'CNPJ' : 'CPF';
    const cnpj = value(emit, 'CNPJ') || value(emit, 'CPF');
    doc.font('Helvetica-Bold').fontSize(11).text(value(emit, 'xNome'), x, 24, { width: w - q - 10, ellipsis: true });
    doc.font('Helvetica').fontSize(8).text(address + '\n' + cnpjLabel + ': ' + cnpj + '  IE: ' + value(emit, 'IE') + '  RNTRC: ' + value(emit, 'RNTRC'), x, 40, { width: w - q - 10, height: 38 });
    doc.image(qr, x + w - q, 24, { width: q, height: q });
    doc.font('Helvetica-Bold').fontSize(12).text('DAMDFE - Documento Auxiliar do Manifesto Eletrônico de Documentos Fiscais', x, 91, { width: w, align: 'center' });
    const cols = [38, 38, 54, 36, 170, 60, w - 396];
    const vals = [['Modelo', value(ide, 'mod')], ['Série', value(ide, 'serie')], ['Número', value(ide, 'nMDF')], ['Folha', page + '/' + pages], ['Data e hora de emissão', formatDate(value(ide, 'dhEmi'))], ['UF carreg.', value(ide, 'UFIni')], ['UF descarreg.', value(ide, 'UFFim')]];
    let cx = x;
    vals.forEach((v, i) => { field(doc, cx, 111, cols[i], 28, v[0], v[1], 'center'); cx += cols[i]; });
    const bw = 90 * MM, bh = 30 * MM;
    doc.image(bar, x + (w - bw) / 2, 145, { fit: [bw, bh], align: 'center', valign: 'center' });
    doc.font('Helvetica').fontSize(7).text(key.replace(/(.{4})/g, '$1 ').trim(), x, 233, { width: w, align: 'center', characterSpacing: 0.3 });
    const auth = value(prot, 'nProt') ? 'Protocolo de autorização: ' + value(prot, 'nProt') + '  Recebido em: ' + value(prot, 'dhRecbto') : 'EMISSÃO EM CONTINGÊNCIA';
    doc.font('Helvetica-Bold').fontSize(8).text(auth, x, 247, { width: w, align: 'center' });
    if (tpAmb === '2') doc.font('Helvetica-Bold').fontSize(10).text('EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL', x, 263, { width: w, align: 'center' });
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
    const docs: { type: string; key: string }[] = [];
    list(inf.infDoc?.infMunDescarga).forEach((m: NodeXml) => {
        list(m.infCTe).forEach((d: NodeXml) => docs.push({ type: 'CT-e', key: value(d, 'chCTe') }));
        list(m.infNFe).forEach((d: NodeXml) => docs.push({ type: 'NF-e', key: value(d, 'chNFe') }));
        list(m.infMDFeTransp).forEach((d: NodeXml) => docs.push({ type: 'MDF-e', key: value(d, 'chMDFe') }));
    });
    const pages = Math.max(1, Math.ceil(Math.max(docs.length, 1) / 18));
    const qr = await QRCode.toBuffer(qrText, { width: 240, margin: 4 });
    const bar = await bwipjs.toBuffer({ bcid: 'code128', text: key, scaleX: 2, height: 20, includetext: false, paddingwidth: 10, paddingheight: 8 });
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margins: { top: 22, right: MARGIN, bottom: 22, left: MARGIN }, bufferPages: false, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const ended = new Promise<void>((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
    const w = PAGE_W - MARGIN * 2, unload = list(inf.infDoc?.infMunDescarga);
    const cteCount = unload.reduce((n: number, m: NodeXml) => n + list(m.infCTe).length, 0);
    const nfeCount = unload.reduce((n: number, m: NodeXml) => n + list(m.infNFe).length, 0);
    const total = inf.tot || {}, vehicle = inf.infModal?.rodo?.veicTracao || {};
    const countCargo = value(total, 'qCarga') + ' ' + value(total, 'cUnid');
    const totalValue = Number(value(total, 'vCarga') || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const drivers = list(vehicle.condutor).map((d: NodeXml) => value(d, 'xNome') + ' - CPF ' + value(d, 'CPF')).join(' | ');
    const insurance = list(inf.seg).map((s: NodeXml) => [value(s, 'xSeg'), value(s, 'CNPJ') || value(s, 'CPF'), value(s, 'nApol')].filter(Boolean).join(' / ')).join(' | ');
    let start = 0;
    for (let page = 1; page <= pages; page++) {
        if (page > 1) doc.addPage();
        header(doc, inf.emit || {}, inf.ide || {}, key, page, pages, qr, bar, prot, w, tpAmb);
        let y = 311;
        field(doc, MARGIN, y, w / 4, 30, 'Qtd. CT-e', String(cteCount), 'center');
        field(doc, MARGIN + w / 4, y, w / 4, 30, 'Qtd. NF-e', String(nfeCount), 'center');
        field(doc, MARGIN + w / 2, y, w / 4, 30, 'Peso total', countCargo, 'center');
        field(doc, MARGIN + w * 3 / 4, y, w / 4, 30, 'Valor da carga', 'R$ ' + totalValue, 'center');
        y += 35;
        const plate = [value(vehicle, 'placa'), value(vehicle, 'UF'), value(vehicle, 'RNTRC')].filter(Boolean).join(' / ');
        field(doc, MARGIN, y, w / 2, 28, 'Veículo de tração (placa / UF / RNTRC)', plate);
        field(doc, MARGIN + w / 2, y, w / 2, 28, 'Produto predominante', [value(inf.prodPred, 'tpCarga'), value(inf.prodPred, 'xProd')].filter(Boolean).join(' - '));
        y += 28;
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
        field(doc, MARGIN, y, 52, 18, 'Tipo', '');
        field(doc, MARGIN + 52, y, w - 52, 18, 'Chave de acesso', '');
        y += 18;
        docs.slice(start, start + 18).forEach((d) => {
            field(doc, MARGIN, y, 52, 18, '', d.type);
            field(doc, MARGIN + 52, y, w - 52, 18, '', d.key);
            y += 18;
        });
        if (!docs.length) field(doc, MARGIN, y, w, 18, '', 'Sem documentos fiscais vinculados');
        start += 18;
    }
    doc.end();
    await ended;
    await fs.promises.writeFile(props.outputPath, Buffer.concat(chunks));
    return { success: true, outputPath: props.outputPath, key, totalPaginas: pages };
}
