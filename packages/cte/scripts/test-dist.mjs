// Prova o pacote construído (`dist/index.cjs` e `dist/index.mjs`), que o jest não alcança porque troca
// `import.meta` por um stub. Roda de um diretório de trabalho FORA do pacote: se os XSD fossem procurados
// por `process.cwd()` (como no código original do fork), a validação falharia com CTE_SCHEMA_NAO_ENCONTRADO.
// Uso: `pnpm --filter @nfewizard/cte build && pnpm --filter @nfewizard/cte test:dist`
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pacote = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwdForaDoPacote = mkdtempSync(path.join(tmpdir(), 'cte-dist-'));

// o que os dois formatos precisam responder igual
const corpo = `
const xml = '<CTe xmlns="http://www.portalfiscal.inf.br/cte"/>';
const schemas = ['cte_v4.00.xsd', 'cteOS_v4.00.xsd', 'GTVe_v4.00.xsd', 'cteSimp_v4.00.xsd', 'eventoCTe_v4.00.xsd'];
const saida = { schemas: {}, dhEvento: m.agoraComOffsetBrasilia(new Date('2026-10-11T02:30:00.123Z')) };
for (const nome of schemas) {
  try { await m.validarXmlCte(xml, nome); saida.schemas[nome] = 'aceitou'; }
  catch (erro) { saida.schemas[nome] = String(erro.message).split(':')[0]; }
}
console.log(JSON.stringify(saida));
`;

function rodar(formato) {
    const arquivo = path.join(pacote, 'dist', `index.${formato === 'cjs' ? 'cjs' : 'mjs'}`);
    const carga = formato === 'cjs'
        ? `const m = require(${JSON.stringify(arquivo)});`
        : `import * as m from ${JSON.stringify(pathToFileURL(arquivo).href)};`;
    const codigo = formato === 'cjs' ? `(async () => { ${carga} ${corpo} })();` : `${carga}\n${corpo}`;
    const argumentos = formato === 'cjs' ? ['-e', codigo] : ['--input-type=module', '-e', codigo];
    return JSON.parse(execFileSync(process.execPath, argumentos, { cwd: cwdForaDoPacote, encoding: 'utf8' }).trim().split('\n').pop());
}

const cjs = rodar('cjs');
const mjs = rodar('mjs');
let falhou = false;
const falha = (mensagem) => { console.error('FALHOU: ' + mensagem); falhou = true; };

for (const [formato, resultado] of [['cjs', cjs], ['mjs', mjs]]) {
    for (const [schema, resposta] of Object.entries(resultado.schemas)) {
        // XML vazio tem de ser recusado PELO XSD; "NAO_ENCONTRADO" ou "VALIDACAO_FALHOU" é o schema não ter carregado
        if (resposta !== 'CTE_SCHEMA_INVALIDO') falha(`${formato}: ${schema} respondeu ${resposta}`);
    }
    if (resultado.dhEvento !== '2026-10-10T23:30:00-03:00') falha(`${formato}: dhEvento ${resultado.dhEvento}`);
}
if (JSON.stringify(cjs) !== JSON.stringify(mjs)) falha('.mjs e .cjs respondem diferente');

if (falhou) process.exit(1);
console.log(`test:dist ok (cwd ${cwdForaDoPacote}): ${Object.keys(cjs.schemas).length} XSD carregados em .cjs e .mjs, respostas iguais`);
