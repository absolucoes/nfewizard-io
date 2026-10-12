import path from 'node:path';

// Substituto de src/services/util/CTeSchemaDir.ts no jest (import.meta não compila em CommonJS).
// Aponta para o mesmo diretório que o módulo real ocupa no código-fonte.
export const diretorioDoModulo = path.resolve(__dirname, '../src/services/util');
