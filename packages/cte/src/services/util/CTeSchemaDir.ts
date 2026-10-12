/*
 * This file is part of NFeWizard-io.
 * 
 * NFeWizard-io is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * NFeWizard-io is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with NFeWizard-io. If not, see <https://www.gnu.org/licenses/>.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Diretório do arquivo em execução (`dist/` no pacote publicado, `src/services/util/` no código-fonte).
 *
 * Fica num arquivo próprio porque `import.meta` não compila no ts-jest em CommonJS: o teste troca este
 * módulo (ver `jest.config.cjs`) e o build de verdade (rollup, `.mjs` e `.cjs`) é coberto por `test:dist`.
 */
export const diretorioDoModulo = path.dirname(fileURLToPath(import.meta.url));
