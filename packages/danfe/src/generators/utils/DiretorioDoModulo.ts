import { dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Diretório do arquivo em execução (`dist/` no pacote publicado). As fontes ficam em `../resources`
 * a partir dele.
 *
 * Fica num arquivo próprio porque `import.meta` não compila no ts-jest em CommonJS: o teste troca
 * este módulo (ver `jest.config.cjs`) e o build de verdade (rollup, `.mjs` e `.cjs`) é coberto
 * pelo `test:dist` do pacote.
 */
export const diretorioDoModulo = dirname(fileURLToPath(import.meta.url));
