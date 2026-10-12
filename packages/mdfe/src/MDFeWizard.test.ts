import { prepararIdentificacaoMdfe } from './MDFeWizard.js';

describe('prepararIdentificacaoMdfe', () => {
  const base = {
    infMDFe: {
      ide: { cUF: '35', dhEmi: '2026-10-09T12:00:00-03:00', serie: 1, nMDF: 123, tpAmb: 2, tpEmis: 1 },
      emit: { CNPJ: 'AB12CD34000195' }
    }
  };

  it('monta chave de 44 posições e grava campos calculados', () => {
    const payload = structuredClone(base);
    const chave = prepararIdentificacaoMdfe(payload, '12345678');
    expect(chave).toMatch(/^[0-9A-Z]{44}$/);
    expect(payload.infMDFe.ide.mod).toBe(58);
    expect(payload.infMDFe.ide.cDV).toBe(Number(chave.at(-1)));
  });

  it('recusa CNPJ fora do formato alfanumérico de 14 posições', () => {
    const payload = structuredClone(base);
    payload.infMDFe.emit.CNPJ = '123';
    expect(() => prepararIdentificacaoMdfe(payload, '12345678')).toThrow('MDFE_CNPJ_INVALIDO');
  });
});
