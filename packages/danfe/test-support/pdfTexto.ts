import zlib from 'zlib';

/**
 * Extrai o texto de um PDF gerado pelo pdfkit, sem depender de um leitor de PDF.
 *
 * Por que não o `pdf-parse`: a versão 1.1.1 (pdf.js 1.10) recusa com "bad XRef entry" os PDFs de uma
 * página só que o pdfkit 0.15 produz, embora a tabela xref esteja correta.
 *
 * Fontes padrão (Times, Helvetica) gravam o texto em latin1. Fontes TrueType embutidas (Arial, usada no
 * DANFCE) gravam índices de glifo de 2 bytes; o texto volta pelo CMap `ToUnicode` da própria fonte, que o
 * pdfkit sempre escreve. Cada operador `/Fn tamanho Tf` troca a fonte corrente.
 */

type Objeto = { dict: string; stream: string | null };

function lerObjetos(bruto: string): Map<number, Objeto> {
    const objetos = new Map<number, Objeto>();
    const re = /(\d+) 0 obj\r?\n([\s\S]*?)\r?\nendobj/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bruto))) {
        const corpo = m[2];
        const s = corpo.match(/^([\s\S]*?)\r?\nstream\r?\n([\s\S]*)\r?\nendstream\s*$/);
        if (s) {
            let conteudo: string;
            try {
                conteudo = zlib.inflateSync(Buffer.from(s[2], 'latin1')).toString('latin1');
            } catch {
                // stream sem Flate (o DAMDFE grava o conteúdo sem compressão): o texto já está legível
                conteudo = s[2];
            }
            objetos.set(Number(m[1]), { dict: s[1], stream: conteudo });
        } else {
            objetos.set(Number(m[1]), { dict: corpo, stream: null });
        }
    }
    return objetos;
}

/** Lê o CMap ToUnicode (bfchar e bfrange, códigos de 2 bytes) para um mapa código -> texto. */
function lerCMap(cmap: string): Map<number, string> {
    const mapa = new Map<number, string>();
    const utf16 = (hex: string) => Buffer.from(hex, 'hex').swap16().toString('utf16le');
    for (const bloco of cmap.match(/beginbfchar[\s\S]*?endbfchar/g) || []) {
        const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(bloco))) mapa.set(parseInt(m[1], 16), utf16(m[2]));
    }
    for (const bloco of cmap.match(/beginbfrange[\s\S]*?endbfrange/g) || []) {
        const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(bloco))) {
            const ini = parseInt(m[1], 16);
            const fim = parseInt(m[2], 16);
            if (m[3] !== undefined) {
                const base = parseInt(m[3], 16);
                for (let c = ini; c <= fim; c++) {
                    mapa.set(c, String.fromCharCode(base + (c - ini)));
                }
            } else {
                const destinos = (m[4].match(/<([0-9a-fA-F]+)>/g) || []).map((h) => h.slice(1, -1));
                destinos.forEach((d, i) => mapa.set(ini + i, utf16(d)));
            }
        }
    }
    return mapa;
}

/** Nome do recurso (/F1) -> CMap da fonte, quando a fonte tem ToUnicode. */
function mapasDasFontes(objetos: Map<number, Objeto>): Map<string, Map<number, string>> {
    const porNome = new Map<string, Map<number, string>>();
    for (const { dict } of objetos.values()) {
        const recursos = dict.match(/\/Font\s*<<([^>]*)>>/);
        if (!recursos) continue;
        const re = /\/(F\d+)\s+(\d+)\s+0\s+R/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(recursos[1]))) {
            const fonte = objetos.get(Number(m[2]));
            const tu = fonte?.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
            const cmap = tu ? objetos.get(Number(tu[1]))?.stream : null;
            if (cmap) porNome.set(m[1], lerCMap(cmap));
        }
    }
    return porNome;
}

export function textoDoPdf(pdf: Buffer): { text: string; numpages: number } {
    const bruto = pdf.toString('latin1');
    const paginas = (bruto.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
    const objetos = lerObjetos(bruto);
    const fontes = mapasDasFontes(objetos);

    const linhas: string[] = [];
    const reOperador = /\/(F\d+)\s+[-\d.]+\s+Tf|\[((?:<[0-9a-fA-F]*>|[-\d.\s])*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g;
    for (const { stream } of objetos.values()) {
        if (!stream) continue;
        let cmap: Map<number, string> | undefined;
        let t: RegExpExecArray | null;
        reOperador.lastIndex = 0;
        while ((t = reOperador.exec(stream))) {
            if (t[1] !== undefined) {
                cmap = fontes.get(t[1]);
                continue;
            }
            const hexes = t[2] !== undefined ? (t[2].match(/<([0-9a-fA-F]*)>/g) || []).map((h) => h.slice(1, -1)) : [t[3]];
            linhas.push(
                hexes
                    .map((h) => {
                        if (!cmap) return Buffer.from(h, 'hex').toString('latin1');
                        let texto = '';
                        for (let i = 0; i + 4 <= h.length; i += 4) {
                            texto += cmap.get(parseInt(h.slice(i, i + 4), 16)) ?? '?';
                        }
                        return texto;
                    })
                    .join(''),
            );
        }
    }
    return { text: linhas.join('\n'), numpages: paginas };
}

/** Largura e altura da primeira página, em pontos (MediaBox). */
export function tamanhoDaPagina(pdf: Buffer): { largura: number; altura: number } {
    const m = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
    if (!m) throw new Error('MediaBox não encontrada no PDF');
    return { largura: Number(m[3]) - Number(m[1]), altura: Number(m[4]) - Number(m[2]) };
}

/** Imagens desenhadas nos streams de conteúdo (`w 0 0 -h x y cm /Im Do`), em pontos. */
export function imagensDoPdf(pdf: Buffer): { largura: number; altura: number; x: number }[] {
    const imagens: { largura: number; altura: number; x: number }[] = [];
    for (const { stream } of lerObjetos(pdf.toString('latin1')).values()) {
        if (!stream) continue;
        const re = /([-\d.]+)\s+0\s+0\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm\s*\/I\w+\s+Do/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(stream))) {
            imagens.push({ largura: Math.abs(Number(m[1])), altura: Math.abs(Number(m[2])), x: Number(m[3]) });
        }
    }
    return imagens;
}

/** Tamanhos de letra usados (operadores Tf). */
export function tamanhosDeFonte(pdf: Buffer): number[] {
    const tamanhos = new Set<number>();
    for (const { stream } of lerObjetos(pdf.toString('latin1')).values()) {
        if (!stream) continue;
        const re = /\/F\d+\s+([-\d.]+)\s+Tf/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(stream))) tamanhos.add(Number(m[1]));
    }
    return [...tamanhos].sort((a, b) => a - b);
}
