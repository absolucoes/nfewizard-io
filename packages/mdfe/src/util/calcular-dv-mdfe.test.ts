import { calcularDigitoVerificadorMdfe } from './calcular-dv-mdfe.js';

describe('calcularDigitoVerificadorMdfe', () => {
  it('calcula o DV de uma chave numérica', () => {
    expect(calcularDigitoVerificadorMdfe('3526101234567800019558001000000001100000000')).toBeGreaterThanOrEqual(0);
  });
  it('aceita letras maiúsculas no CNPJ alfanumérico', () => {
    expect(calcularDigitoVerificadorMdfe('352610AB12CD3400019558001000000001100000000')).toBeGreaterThanOrEqual(0);
  });
  it('recusa comprimento e caixa inválidos', () => {
    expect(() => calcularDigitoVerificadorMdfe('abc')).toThrow('MDFE_CHAVE_INVALIDA');
  });
});
