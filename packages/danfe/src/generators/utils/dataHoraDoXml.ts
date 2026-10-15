/**
 * Máscaras de `dataHoraDoXml`: `data` (dd/MM/yyyy), `dataHora` (dd/MM/yyyy HH:mm:ss) e `hora` (HH:mm).
 */
export type MascaraDataHoraDoXml = 'data' | 'dataHora' | 'hora';

const DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * Data e hora de um campo `TDateTimeUTC` do XML fiscal (`AAAA-MM-DDThh:mm:ss±hh:mm`), impressas como estão no
 * documento, sem passar pelo fuso do processo.
 *
 * O XSD manda a hora local do emitente com o offset ao lado (`2026-10-15T23:58:10-03:00`). Converter esse texto com
 * `new Date(...)` e `format(...)` imprime a hora no fuso de quem gera o PDF: num container em UTC a nota emitida
 * às 23:58 de Brasília saía com 02:58 do dia seguinte. O impresso deve mostrar o que o XML diz, então a leitura é
 * pelos dígitos, como já fazia o DANFCE.
 *
 * @param valor texto do XML (`dhEmi`, `dhSaiEnt`, `dhRecbto`, `dEmi`...)
 * @param mascara o que imprimir (padrão `dataHora`)
 * @param separadorDeData `/` (padrão) ou `-` (o DANFE imprime a emissão como dd-MM-yyyy)
 * @returns o texto formatado; `''` quando o valor está vazio; o próprio valor quando não tem a forma de uma data do
 *          XML (o impresso não inventa nem esconde o que recebeu)
 */
export function dataHoraDoXml(
    valor: unknown,
    mascara: MascaraDataHoraDoXml = 'dataHora',
    separadorDeData: '/' | '-' = '/',
): string {
    if (valor === undefined || valor === null || valor === '') return '';
    const texto = String(valor).trim();
    const m = DATA_HORA.exec(texto);
    if (!m) return texto;
    const [, ano, mes, dia, hora, minuto, segundo] = m;
    const data = [dia, mes, ano].join(separadorDeData);
    if (mascara === 'data') return data;
    // Data sem hora (`dEmi`): a hora não existe e não vira 00:00:00.
    if (hora === undefined) return mascara === 'hora' ? '' : data;
    if (mascara === 'hora') return `${hora}:${minuto}`;
    return `${data} ${hora}:${minuto}:${segundo ?? '00'}`;
}
