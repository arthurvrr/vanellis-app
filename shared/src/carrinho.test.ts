import { describe, expect, it } from 'vitest';
import { cannotAdd, clampQuantity, lineKey, resolveCart, sumRanges, type CartLine } from './carrinho';
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
