import urls from '../config/MDFeQrCodeUrl.json' with { type: 'json' };

export function montarUrlQrCodeMdfe(chave: string, tpAmb: number | string, tpEmis: number | string, uf: string): string {
  if (!/^[0-9A-Z]{44}$/.test(chave)) throw new Error('MDFE_CHAVE_INVALIDA: chave deve conter 44 caracteres alfanuméricos maiúsculos');
  if (tpAmb !== 1 && tpAmb !== 2 && tpAmb !== '1' && tpAmb !== '2') throw new Error('MDFE_AMBIENTE_INVALIDO');
  if (tpEmis !== 1 && tpEmis !== '1') throw new Error('MDFE_QRCODE_CONTINGENCIA_NAO_IMPLEMENTADO');
  const url = urls[uf.toUpperCase() as keyof typeof urls];
  if (!url) throw new Error('MDFE_UF_QRCODE_NAO_SUPORTADA: ' + uf);
  return url + '?chMDFe=' + encodeURIComponent(chave) + '&tpAmb=' + encodeURIComponent(String(tpAmb));
}
