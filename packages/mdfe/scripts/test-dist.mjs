// Prova o pacote construído (dist/src), que o jest não alcança porque troca `import.meta` por um stub.
// Roda de um diretório FORA do pacote: se os XSD fossem procurados por `process.cwd()` (como no código
// original do fork), a validação falharia com MDFE_SCHEMA_NAO_ENCONTRADO.
// Uso: `pnpm --filter @nfewizard/mdfe build && pnpm --filter @nfewizard/mdfe test:dist`
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pacote = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwdForaDoPacote = mkdtempSync(path.join(tmpdir(), 'mdfe-dist-'));
process.chdir(cwdForaDoPacote);

const m = await import(pathToFileURL(path.join(pacote, 'dist', 'src', 'index.js')).href);
const xml = '<MDFe xmlns="http://www.portalfiscal.inf.br/mdfe"/>';
const schemas = ['mdfe_v3.00.xsd', 'eventoMDFe_v3.00.xsd', 'consSitMDFe_v3.00.xsd', 'consStatServMDFe_v3.00.xsd', 'consMDFeNaoEnc_v3.00.xsd'];
let falhou = false;
for (const schema of schemas) {
  let resposta;
  try { await m.validarXmlMdfe(xml, schema); resposta = 'aceitou'; }
  catch (erro) { resposta = String(erro.message).split(':')[0]; }
  // o XML vazio tem de ser recusado PELO XSD; qualquer outra resposta é o schema não ter carregado
  if (resposta !== 'MDFE_SCHEMA_INVALIDO') { console.error(`FALHOU: ${schema} respondeu ${resposta}`); falhou = true; }
}
const envelope = m.montarEnvelopeSoapMdfe('<consStatServMDFe/>', 'MDFeStatusServico', '52');
if (!envelope.includes('<mdfeCabecMsg ') || envelope.includes('<MDFeStatusServico')) { console.error('FALHOU: envelope do dist'); falhou = true; }
if (falhou) process.exit(1);
console.log(`test:dist ok (cwd ${cwdForaDoPacote}): ${schemas.length} XSD carregados no dist`);
