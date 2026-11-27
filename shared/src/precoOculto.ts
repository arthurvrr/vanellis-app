// Preço oculto por produto (RF69, RN76–RN79; cenários C146–C150). O operador marca um produto e o
// preço dele (e o das opções) não sai do servidor; o cliente pede normalmente, o total soma só os
// itens com preço e a padaria informa o resto pelo WhatsApp.

import type { ResolvedLine } from './carrinho';
import { sumRanges } from './carrinho';
import type { ProductDTO } from './catalogo';
import { formatRange, withoutPrices, type Range } from './preco';

/** Texto no lugar do preço do item (RN76). */
export const HIDDEN_PRICE_LABEL = 'Preço informado pelo WhatsApp';

/**
 * O cardápio como sai para o site. Com todos os preços ocultos (RF39), nenhum valor sai e nenhum
 * produto fica marcado: vale o RF39 para todos (RN79). Senão, só os produtos marcados saem sem preço.
 */
export function applyHiddenPrices<T extends { pricesHidden: boolean; produtos: ProductDTO[] }>(catalogo: T): T {
  const semMarca = { ...catalogo, produtos: catalogo.produtos.map(({ priceHidden: _, ...p }) => p) };
  if (catalogo.pricesHidden) return withoutPrices(semMarca);
  return {
    ...catalogo,
    produtos: catalogo.produtos.map((p, i) => {
      const limpo = semMarca.produtos[i]!;
      return p.priceHidden ? { ...withoutPrices({ produtos: [limpo] }).produtos[0]!, priceHidden: true } : limpo;
    }),
  };
}

export interface CartTotal {
  /** Soma dos itens com preço; `null` sem item com preço, ou com algum ainda sem valor. */
  total: Range | null;
  /** Algum item com preço é vendido por quilo: o total é estimado. */
  estimated: boolean;
  /** Os produtos de preço oculto do carrinho, sem repetir (RN77). */
  hidden: string[];
}

/** Total do carrinho, do checkout e da mensagem: só os itens com preço entram (RN77). */
export function cartTotal(lines: ResolvedLine[]): CartTotal {
  const visiveis = lines.filter((l) => !l.product.priceHidden);
  return {
    total: visiveis.length ? sumRanges(visiveis.map((l) => l.estimate)) : null,
    estimated: visiveis.some((l) => l.product.saleUnit === 'KG'),
    hidden: [...new Set(lines.filter((l) => l.product.priceHidden).map((l) => l.product.name))],
  };
}

/** "A", "A e B", "A, B e C". */
export function juntarNomes(nomes: string[]): string {
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0]!;
}

/** O aviso do checkout com os nomes dos itens (RN77); `null` sem item de preço oculto. */
export function hiddenPriceNotice(hidden: string[]): string | null {
  if (!hidden.length) return null;
  return `O valor de ${juntarNomes(hidden)} não entra no total; a padaria informa pelo WhatsApp`;
}

/** A linha do total no carrinho e no checkout; só itens de preço oculto → informado pelo WhatsApp (C148). */
export function totalText({ total, estimated, hidden }: CartTotal): string | null {
  if (total) return `${estimated ? 'Total estimado' : 'Total'}: ${formatRange(total)}`;
  return hidden.length ? 'Total informado pelo WhatsApp' : null;
}
