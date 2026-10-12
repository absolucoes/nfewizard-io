import path from 'node:path';

// Substituto de src/generators/utils/DiretorioDoModulo.ts no jest (import.meta não compila em CommonJS).
// Imita o dist/ do pacote publicado: as fontes ficam em ../resources a partir dele.
export const diretorioDoModulo = path.resolve(__dirname, '../dist');
