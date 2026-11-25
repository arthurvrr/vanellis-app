import { describe, expect, it } from 'vitest';
import { cannotAdd, clampQuantity, lineKey, resolveCart, sumRanges, validSelection, type CartLine } from './carrinho';
import { group, option, product } from './test-utils';

const tamanho = group({
  id: 10,
  name: 'Tamanho',
  options: [
    option({ id: 100, name: 'Mini', priceMode: 'replace', price: 4.9 }),
    option({ id: 101, name: 'Tradicional', priceMode: 'replace', price: 8 }),
  ],
});
const sabor = group({
  id: 11,
  name: 'Sabor',
  options: [option({ id: 110, name: 'Chocolate' }), option({ id: 111, name: 'Cenoura', available: false })],
});
const cupcake = product({ id: 5, minQuantity: 10, groups: [tamanho, sabor] });
const torta = product({
  id: 6,
  saleUnit: 'KG',
  basePrice: 80,
  groups: [group({ id: 20, name: 'Tamanho', options: [option({ id: 200, name: 'Mini', weightMinKg: 1.2, weightMaxKg: 1.5 })] })],
});

describe('lineKey', () => {
  it('é a mesma para as mesmas escolhas em qualquer ordem', () => {
    expect(lineKey(5, { 11: [110], 10: [100] })).toBe(lineKey(5, { 10: [100], 11: [110] }));
  });

  it('muda quando muda a escolha', () => {
    expect(lineKey(5, { 10: [100] })).not.toBe(lineKey(5, { 10: [101] }));
  });

  it('ignora grupos sem escolha', () => {
    expect(lineKey(5, { 10: [100], 12: [] })).toBe(lineKey(5, { 10: [100] }));
  });
});

describe('clampQuantity', () => {
  it('respeita a quantidade mínima do produto (RN39) e o máximo de 999', () => {
    expect(clampQuantity(cupcake, 3)).toBe(10);
    expect(clampQuantity(cupcake, 12.7)).toBe(12);
    expect(clampQuantity(cupcake, 5000)).toBe(999);
    expect(clampQuantity(cupcake, Number.NaN)).toBe(10);
  });
});

describe('cannotAdd', () => {
  it('diz quais escolhas obrigatórias faltam (RN27)', () => {
    expect(cannotAdd(cupcake, {})).toBe('Escolha: Tamanho, Sabor');
    expect(cannotAdd(cupcake, { 10: [100] })).toBe('Escolha: Sabor');
    expect(cannotAdd(cupcake, { 10: [100], 11: [110] })).toBeNull();
  });

  it('bloqueia produto indisponível (RN10)', () => {
    expect(cannotAdd({ ...cupcake, available: false }, { 10: [100], 11: [110] })).toBe('Indisponível no momento');
  });
});

describe('resolveCart', () => {
  const line = (productId: number, selection: CartLine['selection'], quantity: number): CartLine => ({
    key: lineKey(productId, selection),
    productId,
    selection,
    quantity,
  });

  it('calcula o valor de cada item e soma em faixa quando há produto por quilo (RF27)', () => {
    const { valid, invalid } = resolveCart(
      [line(5, { 10: [101], 11: [110] }, 10), line(6, { 20: [200] }, 1)],
      [cupcake, torta],
    );
    expect(invalid).toEqual([]);
    expect(valid.map((v) => v.estimate)).toEqual([{ min: 80, max: 80 }, { min: 96, max: 120 }]);
    expect(sumRanges(valid.map((v) => v.estimate))).toEqual({ min: 176, max: 200 });
  });

  it('separa itens que não valem mais: produto removido, indisponível ou opção indisponível', () => {
    const { valid, invalid } = resolveCart(
      [line(99, {}, 1), line(5, { 10: [100], 11: [111] }, 10), line(6, { 20: [200] }, 1)],
      [cupcake, { ...torta, available: false }],
    );
    expect(valid).toEqual([]);
    expect(invalid.map((l) => l.productId)).toEqual([99, 5, 6]);
  });

  it('corrige quantidade guardada abaixo do mínimo', () => {
    const { valid } = resolveCart([line(5, { 10: [100], 11: [110] }, 2)], [cupcake]);
    expect(valid[0]?.line.quantity).toBe(10);
  });
});

describe('lineKey: formato da chave', () => {
  it('junta produto, grupos e opções em ordem numérica', () => {
    expect(lineKey(5, { 11: [111, 110], 10: [100] })).toBe('5|10:100|11:110,111');
    // Ordem numérica, não alfabética: 9 antes de 10.
    expect(lineKey(5, { 10: [10, 9] })).toBe('5|10:9,10');
  });

  it('produto sem escolhas é só o id', () => {
    expect(lineKey(7, {})).toBe('7');
    expect(lineKey(7, { 10: [] })).toBe('7');
  });

  it('não altera a seleção guardada ao ordenar', () => {
    const selection = { 10: [101, 100] };
    lineKey(5, selection);
    expect(selection[10]).toEqual([101, 100]);
  });
});

describe('clampQuantity: limites exatos', () => {
  it('aceita exatamente o mínimo e o máximo', () => {
    expect(clampQuantity(cupcake, 10)).toBe(10);
    expect(clampQuantity(cupcake, 999)).toBe(999);
    expect(clampQuantity(cupcake, 1000)).toBe(999);
    expect(clampQuantity(cupcake, 999.9)).toBe(999);
  });

  it('quantidade infinita volta ao mínimo', () => {
    expect(clampQuantity(cupcake, Infinity)).toBe(10);
    expect(clampQuantity(cupcake, -Infinity)).toBe(10);
  });
});

describe('cannotAdd: nomes dos grupos que faltam', () => {
  it('lista só os grupos que faltam, na ordem do produto', () => {
    expect(cannotAdd(cupcake, { 11: [110] })).toBe('Escolha: Tamanho');
  });
});

describe('validSelection', () => {
  it('devolve as escolhas quando todas valem', () => {
    expect(validSelection(cupcake, { 10: [100], 11: [110] })).toEqual({ 10: [100], 11: [110] });
  });

  it('recusa grupo que não existe mais no produto', () => {
    expect(validSelection(cupcake, { 10: [100], 11: [110], 99: [1] })).toBeNull();
  });

  it('recusa opção que sumiu ou ficou indisponível', () => {
    expect(validSelection(cupcake, { 10: [100], 11: [999] })).toBeNull();
    expect(validSelection(cupcake, { 10: [100], 11: [111] })).toBeNull();
    expect(validSelection(cupcake, { 10: [100], 11: [110, 111] })).toBeNull();
  });

  it('recusa quando falta escolha obrigatória', () => {
    expect(validSelection(cupcake, { 10: [100] })).toBeNull();
  });
});

describe('sumRanges', () => {
  it('soma mínimos e máximos e arredonda em centavos', () => {
    expect(sumRanges([{ min: 0.1, max: 0.1 }, { min: 0.2, max: 1.2 }])).toEqual({ min: 0.3, max: 1.3 });
    expect(sumRanges([{ min: 10, max: 15 }, { min: 2.5, max: 2.5 }])).toEqual({ min: 12.5, max: 17.5 });
  });

  it('carrinho vazio soma zero', () => {
    expect(sumRanges([])).toEqual({ min: 0, max: 0 });
  });

  it('um item sem valor calculável deixa o total sem valor', () => {
    expect(sumRanges([{ min: 10, max: 10 }, null])).toBeNull();
    expect(sumRanges([null, { min: 10, max: 10 }])).toBeNull();
  });
});

describe('resolveCart: quantidade e dados da linha', () => {
  it('limita a quantidade guardada ao máximo e recalcula o valor', () => {
    const selection = { 10: [101], 11: [110] };
    const linha: CartLine = { key: lineKey(5, selection), productId: 5, selection, quantity: 5000 };
    const { valid } = resolveCart([linha], [cupcake]);
    expect(valid).toEqual([
      { line: { ...linha, quantity: 999 }, product: cupcake, estimate: { min: 7992, max: 7992 } },
    ]);
  });
});
