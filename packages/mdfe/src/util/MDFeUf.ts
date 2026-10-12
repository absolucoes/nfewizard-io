const CODIGO_UF: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24',
  PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42',
  RS: '43', MS: '50', MT: '51', GO: '52', DF: '53'
};

/** Código IBGE da UF (`cUF` do cabeçalho SOAP) a partir da sigla ou do próprio código. */
export function codigoUfMdfe(uf: string | number): string {
  const valor = String(uf).trim().toUpperCase();
  if (/^\d{2}$/.test(valor)) return valor;
  const codigo = CODIGO_UF[valor];
  if (!codigo) throw new Error('MDFE_UF_INVALIDA: ' + String(uf));
  return codigo;
}
