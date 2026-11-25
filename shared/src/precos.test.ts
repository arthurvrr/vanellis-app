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

describe('parsePreco: formatos aceitos', () => {
  it('aceita "R$" em minúsculas, sem espaço ou com vários espaços', () => {
    expect(parsePreco('r$5')).toBe(5);
    expect(parsePreco('R$   7,25')).toBe(7.25);
    expect(parsePreco(' R$ ')).toBeNull();
  });
  it('aceita número terminado em ponto ou vírgula e só centavos', () => {
    expect(parsePreco('3,')).toBe(3);
    expect(parsePreco(',55')).toBe(0.55);
    expect(parsePreco('12,345')).toBe(12.345);
  });
  it('recusa notação científica, sinais e texto em volta do número', () => {
    expect(parsePreco('1e3')).toBeNaN();
    expect(parsePreco('.5e2')).toBeNaN();
    expect(parsePreco('-,5')).toBeNaN();
    expect(parsePreco('+2')).toBeNaN();
    expect(parsePreco('12 reais')).toBeNaN();
    expect(parsePreco('5 R$')).toBeNaN();
    expect(parsePreco('12R$')).toBeNaN();
    expect(parsePreco('1 2')).toBeNaN();
  });
});

describe('C64: problemaPreco, mensagens e limites', () => {
  it('mostra a mensagem certa para cada problema', () => {
    expect(problemaPreco(NaN)).toBe('Use só números, ex: 12,90');
    expect(problemaPreco(Infinity)).toBe('Use só números, ex: 12,90');
    expect(problemaPreco(-1)).toBe('O preço não pode ser negativo');
    expect(problemaPreco(-1, 'add')).toBe('O preço não pode ser negativo');
    expect(problemaPreco(0)).toBe('O preço precisa ser maior que zero');
    expect(problemaPreco(100000)).toBe('Preço alto demais');
    expect(problemaPreco(1.805)).toBe('Use no máximo dois dígitos após a vírgula');
  });
  it('aceita o máximo de R$ 99.999 e recusa um centavo acima', () => {
    expect(problemaPreco(99999)).toBeNull();
    expect(problemaPreco(99999.01)).toBe('Preço alto demais');
  });
  it('aceita centavos que o ponto flutuante não representa exatamente', () => {
    // 1,15 × 100 = 114.99999999999999 e 0,29 × 100 = 28.999999999999996.
    expect(problemaPreco(1.15)).toBeNull();
    expect(problemaPreco(0.29)).toBeNull();
    expect(problemaPreco(0.01)).toBeNull();
    expect(problemaPreco(0.001, 'add')).toBe('Use no máximo dois dígitos após a vírgula');
  });
});

describe('C66: casaBusca com espaços e acentos na busca', () => {
  it('ignora espaços em volta e acentos do que foi digitado', () => {
    expect(casaBusca('Torta de Nozes', '  torta ')).toBe(true);
    expect(casaBusca('Paes de Queijo', 'pães')).toBe(true);
    expect(casaBusca('Torta de Nozes', 'Nozes de')).toBe(false);
  });
});

it('mostrarPreco sempre com dois dígitos após a vírgula', () => {
  expect(mostrarPreco(2)).toBe('2,00');
  expect(mostrarPreco(12.5)).toBe('12,50');
  expect(mostrarPreco(1234.56)).toBe('1234,56');
});
