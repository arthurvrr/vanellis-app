// Preço oculto por produto (RF69, RN76–RN79; cenários C146–C150). O preço de um produto marcado
// não sai do servidor; o carrinho soma só os itens com preço e avisa quais ficaram de fora.
import { describe, expect, it } from 'vitest';
import { resolveCart } from './carrinho';
import { applyHiddenPrices, cartTotal, HIDDEN_PRICE_LABEL, hiddenPriceNotice, totalText } from './precoOculto';
import { group, line, option, product } from './test-utils';

const vulcao = product({
  id: 1,
  name: 'Bolo Vulcão',
  basePrice: 120,
  priceHidden: true,
  groups: [
    group({
      id: 10,
      name: 'Tamanho',
      minSelect: 0,
      options: [option({ id: 100, name: 'Grande', priceMode: 'add', price: 30 })],
    }),
  ],
});
const coxinha = product({ id: 2, name: 'Coxinha', basePrice: 1.6, minQuantity: 10 });
const torta = product({
  id: 3,
  name: 'Torta',
  saleUnit: 'KG',
  basePrice: 80,
  weightMinKg: 1,
  weightMaxKg: 1.5,
});
const brigadeiro = product({ id: 4, name: 'Brigadeiro', basePrice: 2, priceHidden: true });

describe('applyHiddenPrices', () => {
  it('C146: o produto marcado sai sem preço, nem o das opções; os outros não mudam', () => {
    const { produtos } = applyHiddenPrices({ pricesHidden: false, produtos: [vulcao, coxinha] });
    expect(produtos[0]).toEqual({
      ...vulcao,
      basePrice: null,
      priceHidden: true,
      groups: [{ ...vulcao.groups[0], options: [{ ...vulcao.groups[0]!.options[0], price: null }] }],
    });
    expect(produtos[1]).toEqual(coxinha);
  });

  it('o produto que não está marcado sai sem a marca', () => {
    const { produtos } = applyHiddenPrices({ pricesHidden: false, produtos: [{ ...coxinha, priceHidden: false }] });
    expect(produtos[0]).toEqual(coxinha);
    expect(produtos[0]).not.toHaveProperty('priceHidden');
  });

  it('C150: com todos os preços ocultos (RF39), tudo sai sem preço e nenhum fica marcado', () => {
    const catalogo = applyHiddenPrices({ pricesHidden: true, produtos: [vulcao, coxinha] });
    expect(catalogo.pricesHidden).toBe(true);
    for (const p of catalogo.produtos) {
      expect(p.basePrice).toBeNull();
      expect(p).not.toHaveProperty('priceHidden');
      for (const g of p.groups) for (const o of g.options) expect(o.price).toBeNull();
    }
  });
});

const site = applyHiddenPrices({ pricesHidden: false, produtos: [vulcao, coxinha, torta, brigadeiro] }).produtos;
const resolver = (...linhas: ReturnType<typeof line>[]) => resolveCart(linhas, site).valid;

describe('cartTotal', () => {
  it('C147: soma só os itens com preço e diz quais ficaram de fora', () => {
    expect(cartTotal(resolver(line(1, {}, 1), line(2, {}, 10)))).toEqual({
      total: { min: 16, max: 16 },
      estimated: false,
      hidden: ['Bolo Vulcão'],
    });
  });

  it('C148: só itens de preço oculto → sem total, com os nomes', () => {
    expect(cartTotal(resolver(line(1, {}, 1), line(4, {}, 3)))).toEqual({
      total: null,
      estimated: false,
      hidden: ['Bolo Vulcão', 'Brigadeiro'],
    });
  });

  it('o mesmo produto em duas linhas aparece uma vez só', () => {
    expect(cartTotal(resolver(line(1, {}, 1), line(1, { 10: [100] }, 1))).hidden).toEqual(['Bolo Vulcão']);
  });

  it('é estimado só por item por quilo com preço visível', () => {
    expect(cartTotal(resolver(line(3, {}, 1))).estimated).toBe(true);
    const tortaOculta = applyHiddenPrices({ pricesHidden: false, produtos: [{ ...torta, priceHidden: true }, coxinha] });
    const linhas = resolveCart([line(3, {}, 1), line(2, {}, 10)], tortaOculta.produtos).valid;
    expect(cartTotal(linhas)).toEqual({ total: { min: 16, max: 16 }, estimated: false, hidden: ['Torta'] });
  });

  it('sem nenhum item de preço oculto, é a soma de sempre', () => {
    expect(cartTotal(resolver(line(2, {}, 10), line(3, {}, 1)))).toEqual({
      total: { min: 96, max: 136 },
      estimated: true,
      hidden: [],
    });
  });

  it('C150: com todos os preços ocultos, nenhum total e nenhum item listado', () => {
    const tudo = applyHiddenPrices({ pricesHidden: true, produtos: [vulcao, coxinha] }).produtos;
    expect(cartTotal(resolveCart([line(1, {}, 1), line(2, {}, 10)], tudo).valid)).toEqual({
      total: null,
      estimated: false,
      hidden: [],
    });
  });

  it('carrinho vazio: nenhum total', () => {
    expect(cartTotal([])).toEqual({ total: null, estimated: false, hidden: [] });
  });
});

describe('HIDDEN_PRICE_LABEL', () => {
  it('RN76: o texto no lugar do preço', () => {
    expect(HIDDEN_PRICE_LABEL).toBe('Preço informado pelo WhatsApp');
  });
});

describe('hiddenPriceNotice', () => {
  it('C147: com os nomes dos itens', () => {
    expect(hiddenPriceNotice(['Bolo Vulcão'])).toBe('O valor de Bolo Vulcão não entra no total; a padaria informa pelo WhatsApp');
    expect(hiddenPriceNotice(['Bolo Vulcão', 'Brigadeiro'])).toBe(
      'O valor de Bolo Vulcão e Brigadeiro não entra no total; a padaria informa pelo WhatsApp',
    );
    expect(hiddenPriceNotice(['A', 'B', 'C'])).toBe('O valor de A, B e C não entra no total; a padaria informa pelo WhatsApp');
  });

  it('sem item de preço oculto, nenhum aviso', () => {
    expect(hiddenPriceNotice([])).toBeNull();
  });
});

describe('totalText', () => {
  it('total, total estimado, total informado pelo WhatsApp (C148) ou nada', () => {
    expect(totalText({ total: { min: 16, max: 16 }, estimated: false, hidden: ['Bolo Vulcão'] })).toBe('Total: R$ 16,00');
    expect(totalText({ total: { min: 96, max: 136 }, estimated: true, hidden: [] })).toBe(
      'Total estimado: R$ 96,00 a R$ 136,00',
    );
    expect(totalText({ total: null, estimated: false, hidden: ['Bolo Vulcão'] })).toBe('Total informado pelo WhatsApp');
    expect(totalText({ total: null, estimated: false, hidden: [] })).toBeNull();
  });
});
