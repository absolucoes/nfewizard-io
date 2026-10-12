import { montarUrlQrCodeMdfe } from './MDFeQrCode.js';

describe('montarUrlQrCodeMdfe', () => {
  const chave = '35261012345678000195580010000000011000000001';
  it('monta QR para produção e homologação via SVRS', () => {
    expect(montarUrlQrCodeMdfe(chave, 1, 1, 'GO')).toContain('tpAmb=1');
    expect(montarUrlQrCodeMdfe(chave, 2, 1, 'RS')).toContain('tpAmb=2');
  });
  it('recusa emissão em contingência sem suporte ao sign', () => {
    expect(() => montarUrlQrCodeMdfe(chave, 2, 2, 'GO')).toThrow('MDFE_QRCODE_CONTINGENCIA_NAO_IMPLEMENTADO');
  });
});
