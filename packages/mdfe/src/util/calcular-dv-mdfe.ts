const PESOS = [2, 3, 4, 5, 6, 7, 8, 9];

export function calcularDigitoVerificadorMdfe(chaveSemDv: string): number {
  if (!/^[0-9A-Z]{43}$/.test(chaveSemDv)) {
    throw new Error('MDFE_CHAVE_INVALIDA: a chave sem DV deve conter 43 caracteres alfanuméricos maiúsculos');
  }
  let soma = 0;
  for (let i = chaveSemDv.length - 1, peso = 0; i >= 0; i--, peso++) {
    soma += (chaveSemDv.charCodeAt(i) - 48) * PESOS[peso % PESOS.length];
  }
  const resto = soma % 11;
  return resto === 0 || resto === 1 ? 0 : 11 - resto;
}
