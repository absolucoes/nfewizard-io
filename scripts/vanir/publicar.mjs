// Publicação do fork Vanir no GitHub Packages (usado por .github/workflows/publicar-vanir.yml).
//
//   node scripts/vanir/publicar.mjs <N> --verificar        recusa se algum dos sete pacotes já existe no registro
//   node scripts/vanir/publicar.mjs <N> --empacotar <dir>  reescreve os package.json e gera os .tgz em <dir> (ensaio)
//   node scripts/vanir/publicar.mjs <N> --publicar         reescreve os package.json e publica, na ordem das dependências
//
// Cada pacote sai como `@absolucoes/nfewizard-<nome>@<versão do upstream>-vanir.<N>`, com o mesmo N em todos.
// As dependências `workspace:*` viram aliases `npm:@absolucoes/nfewizard-<nome>@<versão>`, e a chave da dependência
// continua `@nfewizard/<nome>`: o `require('@nfewizard/shared')` do código compilado resolve para o pacote do fork
// e nada de `@nfewizard/*` do npmjs entra na instalação.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REGISTRO = 'https://npm.pkg.github.com';
// ordem de publicação: cada pacote depois das suas dependências
const PACOTES = [
  { dir: 'types', alvo: '@absolucoes/nfewizard-types' },
  { dir: 'shared', alvo: '@absolucoes/nfewizard-shared' },
  { dir: 'danfe', alvo: '@absolucoes/nfewizard-danfe' },
  { dir: 'nfce', alvo: '@absolucoes/nfewizard-nfce' },
  { dir: 'cte', alvo: '@absolucoes/nfewizard-cte' },
  { dir: 'mdfe', alvo: '@absolucoes/nfewizard-mdfe' },
  { dir: 'nfewizard-io', alvo: '@absolucoes/nfewizard-io' }
];
const CAMPOS_DEPENDENCIA = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const [, , numero, modo, destino] = process.argv;
if (!/^[1-9][0-9]*$/.test(numero ?? '')) fim(`N inválido: "${numero}". Use um inteiro positivo (a tag é vanir-v<N>).`);
if (!['--verificar', '--empacotar', '--publicar'].includes(modo)) fim('Modo: --verificar | --empacotar <dir> | --publicar');

function fim(mensagem) {
  console.error('ERRO: ' + mensagem);
  process.exit(1);
}

function lerPacote(dir) {
  const arquivo = path.join(raiz, 'packages', dir, 'package.json');
  return { arquivo, manifesto: JSON.parse(readFileSync(arquivo, 'utf8')) };
}

// versões e nomes de cada pacote, lidos antes de reescrever qualquer um
const plano = PACOTES.map((pacote) => {
  const { arquivo, manifesto } = lerPacote(pacote.dir);
  const base = String(manifesto.version).replace(/-vanir\.\d+$/, '');
  return { ...pacote, arquivo, manifesto, original: manifesto.name, versao: `${base}-vanir.${numero}` };
});
const porNome = new Map(plano.map((item) => [item.original, item]));

function reescrever(item) {
  const manifesto = structuredClone(item.manifesto);
  manifesto.name = item.alvo;
  manifesto.version = item.versao;
  for (const campo of CAMPOS_DEPENDENCIA) {
    for (const [nome, especificacao] of Object.entries(manifesto[campo] ?? {})) {
      if (!String(especificacao).startsWith('workspace:')) continue;
      const dependencia = porNome.get(nome);
      if (!dependencia) fim(`${item.original} depende de ${nome} (${especificacao}), que não está entre os sete pacotes publicados.`);
      manifesto[campo][nome] = `npm:${dependencia.alvo}@${dependencia.versao}`;
    }
  }
  // o registro é privado: a publicação é restrita em qualquer caso, mesmo com publishConfig.access herdado
  manifesto.publishConfig = { ...(manifesto.publishConfig ?? {}), access: 'restricted', registry: REGISTRO };
  writeFileSync(item.arquivo, JSON.stringify(manifesto, null, 2) + '\n');
}

function existeNoRegistro(item) {
  const resultado = spawnSync('npm', ['view', `${item.alvo}@${item.versao}`, 'version', '--registry', REGISTRO], { encoding: 'utf8' });
  if (resultado.status === 0 && resultado.stdout.trim()) return true;
  if (/E404|404 Not Found/i.test(resultado.stderr + resultado.stdout)) return false;
  // qualquer outra falha (autenticação, rede) não pode virar "não existe"
  fim(`não foi possível consultar ${item.alvo}@${item.versao} no registro:\n${resultado.stderr || resultado.stdout}`);
}

if (modo === '--verificar') {
  const existentes = plano.filter(existeNoRegistro).map((item) => `${item.alvo}@${item.versao}`);
  if (existentes.length) fim(`o N=${numero} já foi usado no registro: ${existentes.join(', ')}. Use o próximo número.`);
  console.log(`N=${numero} livre nos sete pacotes: ${plano.map((item) => item.versao).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`);
} else {
  plano.forEach(reescrever);
  for (const item of plano) {
    const cwd = path.join(raiz, 'packages', item.dir);
    if (modo === '--empacotar') {
      if (!destino) fim('--empacotar pede o diretório de destino');
      mkdirSync(destino, { recursive: true });
      execFileSync('pnpm', ['pack', '--pack-destination', path.resolve(destino)], { cwd, stdio: 'inherit' });
    } else {
      execFileSync('pnpm', ['publish', '--registry', REGISTRO, '--no-git-checks', '--access', 'restricted', '--tag', 'vanir'], { cwd, stdio: 'inherit' });
    }
    console.log(`${modo === '--empacotar' ? 'empacotado' : 'publicado'}: ${item.alvo}@${item.versao}`);
  }
}
