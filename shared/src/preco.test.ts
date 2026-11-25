import { describe, expect, it } from 'vitest';
import {
  cardEstimate,
  cardImage,
  cardPrice,
  formatBRL,
  itemEstimate,
  missingGroups,
  pricePerUnit,
  weightRange,
  withoutPrices,
} from './preco';
import { group, option, product } from './test-utils';


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

describe('estimativa no card do produto por quilo (RN49)', () => {
  const tamanho = group({
    id: 30,
    name: 'Tamanho',
    options: [
      option({ id: 300, name: 'Pequena', weightMinKg: 1.2, weightMaxKg: 1.5 }),
      option({ id: 301, name: 'Grande', weightMinKg: 2.5, weightMaxKg: 3 }),
    ],
  });
  const torta = product({ saleUnit: 'KG', basePrice: 80, groups: [tamanho] });
  const coxinha = product({ basePrice: 1.6, minQuantity: 25 });

  it('não aparece antes de escolher o tamanho', () => {
    expect(cardEstimate(torta, {}, 1)).toBeNull();
  });

  it('aparece com o tamanho escolhido, multiplicada pela quantidade do card', () => {
    expect(cardEstimate(torta, { 30: [300] }, 1)).toEqual({ min: 96, max: 120 });
    expect(cardEstimate(torta, { 30: [301] }, 2)).toEqual({ min: 400, max: 480 });
  });

  it('não aparece em produto por unidade', () => {
    expect(cardEstimate(coxinha, {}, 25)).toBeNull();
  });

  it('com preços ocultos não é calculada (nada de NaN): o card não mostra a linha', () => {
    const [semPreco] = withoutPrices({ produtos: [torta] }).produtos;
    expect(cardEstimate(semPreco!, { 30: [300] }, 1)).toBeNull();
  });
});

describe('preço por unidade com adicionais que somam', () => {
  const recheio = group({
    id: 40,
    name: 'Recheio extra',
    minSelect: 0,
    maxSelect: 3,
    options: [
      option({ id: 400, name: 'Nutella', priceMode: 'add', price: 2.5 }),
      option({ id: 401, name: 'Morango', priceMode: 'add', price: 1.25 }),
      option({ id: 402, name: 'Granulado', priceMode: 'add', price: null }),
      option({ id: 403, name: 'Coco', priceMode: 'add', price: 0.2 }),
    ],
  });
  const bolo = product({ basePrice: 10, groups: [recheio] });

  it('soma ao preço base o valor de cada adicional escolhido', () => {
    expect(pricePerUnit(bolo, { 40: [400] })).toBe(12.5);
    expect(pricePerUnit(bolo, { 40: [400, 401] })).toBe(13.75);
  });

  it('adicional sem preço soma zero', () => {
    expect(pricePerUnit(bolo, { 40: [402] })).toBe(10);
    expect(pricePerUnit(bolo, { 40: [401, 402] })).toBe(11.25);
  });

  it('arredonda a soma em centavos (sem resto de ponto flutuante)', () => {
    const barato = product({ basePrice: 0.1, groups: [recheio] });
    expect(pricePerUnit(barato, { 40: [403] })).toBe(0.3);
  });

  it('ignora escolha com id que não existe no grupo', () => {
    expect(pricePerUnit(bolo, { 40: [999] })).toBe(10);
    expect(pricePerUnit(bolo, { 40: [999, 400] })).toBe(12.5);
  });

  it('sem preço base nem opção que troca, não há preço', () => {
    expect(pricePerUnit(product({ groups: [recheio] }), { 40: [400] })).toBeNull();
    expect(itemEstimate(product({ groups: [recheio] }), { 40: [400] }, 3)).toBeNull();
  });

  it('opção que troca define a base e os adicionais somam a ela', () => {
    const tamanho = group({
      id: 41,
      name: 'Tamanho',
      options: [option({ id: 410, name: 'Grande', priceMode: 'replace', price: 20 })],
    });
    const p = product({ basePrice: 10, groups: [tamanho, recheio] });
    expect(pricePerUnit(p, { 41: [410], 40: [400] })).toBe(22.5);
    expect(pricePerUnit(p, { 40: [400] })).toBe(12.5);
  });
});

describe('estimativa do item por unidade', () => {
  it('multiplica pela quantidade e arredonda em centavos', () => {
    // 1,60 × 3 dá 4.800000000000001 em ponto flutuante.
    expect(itemEstimate(product({ basePrice: 1.6 }), {}, 3)).toEqual({ min: 4.8, max: 4.8 });
    expect(itemEstimate(product({ basePrice: 0.1 }), {}, 3)).toEqual({ min: 0.3, max: 0.3 });
  });

  it('ignora faixa de peso em produto por unidade', () => {
    const p = product({ basePrice: 5, weightMinKg: 1, weightMaxKg: 2 });
    expect(itemEstimate(p, {}, 2)).toEqual({ min: 10, max: 10 });
  });
});

describe('estimativa do item por quilo', () => {
  it('usa o peso do próprio produto quando não há opção com peso', () => {
    const p = product({ saleUnit: 'KG', basePrice: 50, weightMinKg: 0.8, weightMaxKg: 1.2 });
    expect(weightRange(p, {})).toEqual({ min: 0.8, max: 1.2 });
    expect(itemEstimate(p, {}, 2)).toEqual({ min: 80, max: 120 });
    expect(cardEstimate(p, {}, 1)).toEqual({ min: 40, max: 60 });
  });

  it('arredonda mínimo e máximo em centavos', () => {
    // 33,33 × 1,1 = 36.663 e 33,33 × 1,3 = 43.329.
    const p = product({ saleUnit: 'KG', basePrice: 33.33, weightMinKg: 1.1, weightMaxKg: 1.3 });
    expect(itemEstimate(p, {}, 1)).toEqual({ min: 36.66, max: 43.33 });
  });

  it('sem peso nenhum não estima', () => {
    const p = product({ saleUnit: 'KG', basePrice: 50 });
    expect(weightRange(p, {})).toBeNull();
    expect(itemEstimate(p, {}, 1)).toBeNull();
  });

  it('peso pela metade (só mínimo ou só máximo) não vale como faixa', () => {
    expect(weightRange(product({ weightMinKg: 1, weightMaxKg: null }), {})).toBeNull();
    expect(weightRange(product({ weightMinKg: null, weightMaxKg: 1 }), {})).toBeNull();
    const tamanho = group({
      id: 50,
      name: 'Tamanho',
      options: [
        option({ id: 500, name: 'Só mínimo', weightMinKg: 2, weightMaxKg: null }),
        option({ id: 501, name: 'Só máximo', weightMinKg: null, weightMaxKg: 3 }),
      ],
    });
    const p = product({ saleUnit: 'KG', basePrice: 10, weightMinKg: 1, weightMaxKg: 1.5, groups: [tamanho] });
    expect(weightRange(p, { 50: [500] })).toEqual({ min: 1, max: 1.5 });
    expect(weightRange(p, { 50: [501] })).toEqual({ min: 1, max: 1.5 });
  });

  it('o peso da opção escolhida vale mais que o do produto', () => {
    const tamanho = group({
      id: 51,
      name: 'Tamanho',
      options: [option({ id: 510, name: 'Grande', weightMinKg: 2, weightMaxKg: 2.5 })],
    });
    const p = product({ saleUnit: 'KG', basePrice: 10, weightMinKg: 1, weightMaxKg: 1.5, groups: [tamanho] });
    expect(weightRange(p, { 51: [510] })).toEqual({ min: 2, max: 2.5 });
    expect(itemEstimate(p, { 51: [510] }, 1)).toEqual({ min: 20, max: 25 });
  });
});

describe('grupos obrigatórios com mínimo maior que um', () => {
  const sabores = group({
    id: 60,
    name: 'Sabores',
    minSelect: 2,
    maxSelect: 3,
    options: [option({ id: 600, name: 'A' }), option({ id: 601, name: 'B' })],
  });
  const p = product({ basePrice: 5, groups: [sabores] });

  it('falta enquanto não tem a quantidade mínima de escolhas', () => {
    expect(missingGroups(p, {})).toEqual([60]);
    expect(missingGroups(p, { 60: [600] })).toEqual([60]);
    expect(missingGroups(p, { 60: [600, 601] })).toEqual([]);
  });
});

describe('preço do card com opções indisponíveis ou sem preço', () => {
  const tamanho = group({
    id: 70,
    name: 'Tamanho',
    options: [
      option({ id: 700, name: 'Mini', priceMode: 'replace', price: 3, available: false }),
      option({ id: 701, name: 'Média', priceMode: 'replace', price: null }),
      option({ id: 702, name: 'Grande', priceMode: 'replace', price: 9 }),
      option({ id: 703, name: 'Família', priceMode: 'replace', price: 12 }),
    ],
  });

  it('"a partir de" ignora opção indisponível e opção sem preço', () => {
    expect(cardPrice(product({ groups: [tamanho] }), {})).toEqual({ fromPrice: true, value: 9, unit: 'un' });
  });

  it('lista de escolhas vazia ainda é "a partir de"', () => {
    expect(cardPrice(product({ groups: [tamanho] }), { 70: [] })).toEqual({ fromPrice: true, value: 9, unit: 'un' });
  });

  it('sem nenhuma opção com preço disponível, "a partir de" sem valor', () => {
    const semPreco = group({
      id: 71,
      name: 'Tamanho',
      options: [
        option({ id: 710, name: 'Mini', priceMode: 'replace', price: 3, available: false }),
        option({ id: 711, name: 'Média', priceMode: 'replace', price: null }),
      ],
    });
    expect(cardPrice(product({ groups: [semPreco] }), {})).toEqual({ fromPrice: true, value: null, unit: 'un' });
  });

  it('grupo com só algumas opções que trocam o preço também é "a partir de"', () => {
    const misto = group({
      id: 73,
      name: 'Tamanho',
      options: [
        option({ id: 730, name: 'Padrão' }),
        option({ id: 731, name: 'Grande', priceMode: 'replace', price: 15 }),
      ],
    });
    const p = product({ basePrice: 10, groups: [misto] });
    expect(cardPrice(p, {})).toEqual({ fromPrice: true, value: 15, unit: 'un' });
    expect(cardPrice(p, { 73: [731] })).toEqual({ fromPrice: false, value: 15, unit: 'un' });
  });

  it('produto sem opção que troca mostra o preço atual, com adicionais', () => {
    const extra = group({
      id: 72,
      name: 'Extra',
      minSelect: 0,
      options: [option({ id: 720, name: 'Queijo', priceMode: 'add', price: 2 })],
    });
    const p = product({ saleUnit: 'KG', basePrice: 40, groups: [extra] });
    expect(cardPrice(p, {})).toEqual({ fromPrice: false, value: 40, unit: 'kg' });
    expect(cardPrice(p, { 72: [720] })).toEqual({ fromPrice: false, value: 42, unit: 'kg' });
  });
});

describe('foto do card', () => {
  const cor = group({
    id: 80,
    name: 'Cor',
    controlsImage: true,
    options: [
      option({ id: 800, name: 'Rosa', imageUrl: '/rosa.jpg' }),
      option({ id: 801, name: 'Branca', imageUrl: null }),
    ],
  });

  it('opção escolhida sem foto mantém a foto do produto', () => {
    expect(cardImage(product({ groups: [cor] }), { 80: [801] })).toBe('/p.jpg');
  });

  it('grupo que não controla a foto não troca a foto', () => {
    const naoControla = { ...cor, controlsImage: false };
    expect(cardImage(product({ groups: [naoControla] }), { 80: [800] })).toBe('/p.jpg');
  });

  it('usa o grupo que controla a foto mesmo que não seja o primeiro', () => {
    const outro = group({ id: 81, name: 'Sabor', options: [option({ id: 810, name: 'X', imageUrl: '/x.jpg' })] });
    expect(cardImage(product({ groups: [outro, cor] }), { 81: [810], 80: [800] })).toBe('/rosa.jpg');
  });
});

describe('formatBRL', () => {
  it('formata em reais com separador de milhar e centavos', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatBRL(1.6)).toBe('R$ 1,60');
  });
});

describe('withoutPrices (RF39)', () => {
  it('tira todos os preços e mantém o resto (pesos, nomes, outros campos)', () => {
    const tamanho = group({
      id: 90,
      name: 'Tamanho',
      options: [option({ id: 900, name: 'P', priceMode: 'replace', price: 30, weightMinKg: 1, weightMaxKg: 1.2 })],
    });
    const p = product({ saleUnit: 'KG', basePrice: 50, weightMinKg: 1, weightMaxKg: 2, groups: [tamanho] });
    const r = withoutPrices({ produtos: [p], pricesHidden: true });
    expect(r.pricesHidden).toBe(true);
    expect(r.produtos).toEqual([
      {
        ...p,
        basePrice: null,
        groups: [{ ...tamanho, options: [{ ...tamanho.options[0]!, price: null }] }],
      },
    ]);
    // Não altera o catálogo original.
    expect(p.basePrice).toBe(50);
    expect(tamanho.options[0]!.price).toBe(30);
  });
});
