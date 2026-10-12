import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Diretório do arquivo em execução (`dist/src/util/` no pacote publicado, `src/util/` no código-fonte).
 *
 * Fica num arquivo próprio porque `import.meta` não compila no ts-jest em CommonJS: o teste troca este
 * módulo (ver `jest.config.cjs`) e o pacote construído é coberto por `pnpm test:dist`.
 */
export const diretorioDoModulo = path.dirname(fileURLToPath(import.meta.url));
