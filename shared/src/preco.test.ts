import { describe, expect, it } from 'vitest';
import type { OptionDTO, OptionGroupDTO, ProductDTO } from './catalogo';
import { cardImage, cardPrice, itemEstimate, missingGroups, pricePerUnit } from './preco';

const option = (o: Partial<OptionDTO> & Pick<OptionDTO, 'id' | 'name'>): OptionDTO => ({
  pdvCode: null,
  description: null,
  imageUrl: null,
  priceMode: null,
  price: null,
  weightMinKg: null,
  weightMaxKg: null,
  available: true,
  ...o,
});

const group = (g: Partial<OptionGroupDTO> & Pick<OptionGroupDTO, 'id' | 'name' | 'options'>): OptionGroupDTO => ({
  minSelect: 1,
  maxSelect: 1,
  controlsImage: false,
  ...g,
});

const product = (p: Partial<ProductDTO>): ProductDTO => ({
  id: 1,
  categoryId: 1,
  pdvCode: null,
  name: 'Produto',
  description: null,
  imageUrl: '/p.jpg',
  imageAlt: null,
  saleUnit: 'UN',
  basePrice: null,
  weightMinKg: null,
  weightMaxKg: null,
  minQuantity: 1,
  leadTimeHours: null,
  available: true,
  groups: [],
  ...p,
});

describe('produto por unidade sem variações (Coxinha)', () => {
  const coxinha = product({ basePrice: 1.6, minQuantity: 25 });

  it('mostra o preço fixo e multiplica pela quantidade', () => {
    expect(cardPrice(coxinha, {})).toEqual({ fromPrice: false, value: 1.6, unit: 'un' });
    expect(itemEstimate(coxinha, {}, 25)).toEqual({ min: 40, max: 40 });
  });
});

describe('tamanho troca preço e foto (Cupcake)', () => {
  const tamanho = group({
    id: 10,
    name: 'Tamanho',
    controlsImage: true,
    options: [
      option({ id: 100, name: 'Mini', priceMode: 'replace', price: 4.9, imageUrl: '/mini.webp' }),
      option({ id: 101, name: 'Tradicional', priceMode: 'replace', price: 8, imageUrl: '/trad.png' }),
    ],
  });
  const sabor = group({ id: 11, name: 'Sabor', options: [option({ id: 110, name: 'Chocolate' })] });
  const cupcake = product({ groups: [tamanho, sabor] });

  it('mostra "a partir de" o menor preço até escolher o tamanho (RN49)', () => {
    expect(cardPrice(cupcake, {})).toEqual({ fromPrice: true, value: 4.9, unit: 'un' });
    expect(cardPrice(cupcake, { 10: [101] })).toEqual({ fromPrice: false, value: 8, unit: 'un' });
  });

  it('troca a foto pelo tamanho escolhido', () => {
    expect(cardImage(cupcake, {})).toBe('/p.jpg');
    expect(cardImage(cupcake, { 10: [100] })).toBe('/mini.webp');
  });

  it('exige tamanho e sabor antes de adicionar (RN27)', () => {
    expect(missingGroups(cupcake, { 10: [100] })).toEqual([11]);
    expect(missingGroups(cupcake, { 10: [100], 11: [110] })).toEqual([]);
  });
});

describe('sabor define o preço do kg e tamanho define o peso (Torta Fria)', () => {
  const sabor = group({
    id: 20,
    name: 'Sabor',
    options: [
      option({ id: 200, name: 'Frango', priceMode: 'replace', price: 88 }),
      option({ id: 201, name: 'Atum', priceMode: 'replace', price: 98 }),
    ],
  });
  const tamanho = group({
    id: 21,
    name: 'Tamanho',
    options: [option({ id: 210, name: 'Inteira', weightMinKg: 1.4, weightMaxKg: 1.6 })],
  });
  const tortaFria = product({ saleUnit: 'KG', groups: [sabor, tamanho] });

  it('mostra o preço do kg no card, "a partir de" até escolher o sabor', () => {
    expect(cardPrice(tortaFria, {})).toEqual({ fromPrice: true, value: 88, unit: 'kg' });
    expect(cardPrice(tortaFria, { 20: [201] })).toEqual({ fromPrice: false, value: 98, unit: 'kg' });
  });

  it('estima a faixa de preço pelo peso do tamanho (RN23)', () => {
    expect(itemEstimate(tortaFria, { 20: [201], 21: [210] }, 1)).toEqual({ min: 137.2, max: 156.8 });
  });

  it('não estima sem as escolhas que definem preço e peso', () => {
    expect(itemEstimate(tortaFria, { 21: [210] }, 1)).toBeNull();
  });
});

describe('adicional sem custo não muda o preço (Torta Brigadeiro)', () => {
  const adicional = group({
    id: 30,
    name: 'Adicional',
    minSelect: 0,
    options: [option({ id: 300, name: 'Morangos' })],
  });
  const torta = product({ saleUnit: 'KG', basePrice: 89.9, groups: [adicional] });

  it('mantém o preço do kg com ou sem o adicional', () => {
    expect(pricePerUnit(torta, {})).toBe(89.9);
    expect(pricePerUnit(torta, { 30: [300] })).toBe(89.9);
    expect(missingGroups(torta, {})).toEqual([]);
  });
});
