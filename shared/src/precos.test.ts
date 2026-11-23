// Cenários C64 e C66 (etapa 4): validação do preço digitado e busca na lista.
import { describe, expect, it } from 'vitest';
import { casaBusca, mostrarPreco, parsePreco, problemaPreco } from './precos';

describe('parsePreco', () => {
  it('aceita vírgula, ponto e "R$"', () => {
    expect(parsePreco('1,80')).toBe(1.8);
    expect(parsePreco('1.8')).toBe(1.8);
    expect(parsePreco(' R$ 12 ')).toBe(12);
    expect(parsePreco(',5')).toBe(0.5);
  });
  it('vazio é null e texto é NaN', () => {
    expect(parsePreco('  ')).toBeNull();
    expect(parsePreco('abc')).toBeNaN();
    expect(parsePreco('1,2,3')).toBeNaN();
    expect(parsePreco('-2')).toBeNaN();
  });
});

describe('C64: problemaPreco', () => {
  it('preço certo', () => {
    expect(problemaPreco(1.8)).toBeNull();
    expect(problemaPreco(159)).toBeNull();
  });
  it('vazio, texto, zero e excesso de casas', () => {
    expect(problemaPreco(null)).toBe('Informe o preço');
    expect(problemaPreco(NaN)).toMatch(/números/);
    expect(problemaPreco(0)).toMatch(/maior que zero/);
    expect(problemaPreco(0, 'replace')).toMatch(/maior que zero/);
    expect(problemaPreco(1.805)).toMatch(/dois dígitos/);
    expect(problemaPreco(100000)).toMatch(/alto/);
  });
  it('adicional que soma pode ser zero', () => {
    expect(problemaPreco(0, 'add')).toBeNull();
  });
});

describe('C66: casaBusca', () => {
  it('ignora acentos e maiúsculas', () => {
    expect(casaBusca('Torta de Nozes', 'torta')).toBe(true);
    expect(casaBusca('Pães de Queijo', 'PAES')).toBe(true);
    expect(casaBusca('Coxinha', 'torta')).toBe(false);
    expect(casaBusca('Coxinha', '  ')).toBe(true);
  });
});

it('mostrarPreco', () => {
  expect(mostrarPreco(1.8)).toBe('1,80');
});
