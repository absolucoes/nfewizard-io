import zlib from 'zlib';

/**
 * Extrai o texto de um PDF gerado pelo pdfkit com as fontes padrão (Times, Helvetica), sem depender de
 * um leitor de PDF.
 *
 * Por que não o `pdf-parse`: a versão 1.1.1 (pdf.js 1.10) recusa com "bad XRef entry" os PDFs de uma
 * página só que o pdfkit 0.15 produz, embora a tabela xref esteja correta. Fontes TrueType embutidas
 * (Arial) gravam índices de glifo, não texto, e por isso não aparecem aqui.
 */
export function textoDoPdf(pdf: Buffer): { text: string; numpages: number } {
    const bruto = pdf.toString('latin1');
    const paginas = (bruto.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;

    const conteudos: string[] = [];
    const reStream = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m: RegExpExecArray | null;
    while ((m = reStream.exec(bruto))) {
        try {
            conteudos.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'));
        } catch {
            // stream sem Flate (o DAMDFE grava o conteúdo sem compressão): o texto já está legível
            conteudos.push(m[1]);
        }
    }

    const linhas: string[] = [];
    for (const c of conteudos) {
        const reTexto = /\[((?:<[0-9a-fA-F]*>|[-\d.\s])*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g;
        let t: RegExpExecArray | null;
        while ((t = reTexto.exec(c))) {
            const hexes = t[1] !== undefined ? (t[1].match(/<([0-9a-fA-F]*)>/g) || []).map((h) => h.slice(1, -1)) : [t[2]];
            linhas.push(hexes.map((h) => Buffer.from(h, 'hex').toString('latin1')).join(''));
        }
    }
    return { text: linhas.join('\n'), numpages: paginas };
}
