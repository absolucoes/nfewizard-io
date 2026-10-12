import path from 'node:path';

// Substituto de src/util/MDFeSchemaDir.ts no jest (import.meta não compila em CommonJS).
export const diretorioDoModulo = path.resolve(__dirname, '../src/util');
