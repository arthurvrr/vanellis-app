// Regras do carrinho (RF03, RF27, RN39): identidade dos itens, limites e total estimado.

import type { ProductDTO, Selection } from './catalogo';
import { cents, itemEstimate, missingGroups, type Range } from './preco';

/** Limites herdados do protótipo: 999 por item e 100 itens diferentes. */
export const MAX_QUANTITY = 999;
export const MAX_LINES = 100;

export interface CartLine {
  /** Produto + escolhas: o mesmo produto com as mesmas escolhas soma na mesma linha. */
  key: string;
  productId: number;
  selection: Selection;
  quantity: number;
}

/** Chave estável de uma combinação, independente da ordem das escolhas. */
export function lineKey(productId: number, selection: Selection): string {
  // Object.entries já devolve as chaves inteiras (ids dos grupos) em ordem crescente.
  const parts = Object.entries(selection)
    .filter(([, ids]) => ids.length > 0)
    .map(([group, ids]) => `${group}:${[...ids].sort((a, b) => a - b).join(',')}`);
  return [productId, ...parts].join('|');
}

/** Quantidade dentro do mínimo do produto (RN39) e do máximo por item. */
export function clampQuantity(product: Pick<ProductDTO, 'minQuantity'>, quantity: number): number {
  if (!Number.isFinite(quantity)) return product.minQuantity;
  return Math.min(MAX_QUANTITY, Math.max(product.minQuantity, Math.floor(quantity)));
}

/** Por que um item não pode entrar no carrinho, ou `null` se pode. */
export function cannotAdd(product: ProductDTO, selection: Selection): string | null {
  if (!product.available) return 'Indisponível no momento';
  if (product.orderClosed) return 'Prazo encerrado para este item';
  const missing = missingGroups(product, selection);
  if (missing.length) {
    const names = product.groups.filter((g) => missing.includes(g.id)).map((g) => g.name);
    return `Escolha: ${names.join(', ')}`;
  }
  return null;
}

/** Remove escolhas que deixaram de existir ou ficaram indisponíveis no catálogo. */
export function validSelection(product: ProductDTO, selection: Selection): Selection | null {
  const result: Selection = {};
  for (const [groupId, ids] of Object.entries(selection)) {
    const group = product.groups.find((g) => g.id === Number(groupId));
    if (!group) return null;
    const valid = ids.filter((id) => group.options.some((o) => o.id === id && o.available));
    if (valid.length !== ids.length) return null;
    result[group.id] = valid;
  }
  return missingGroups(product, result).length ? null : result;
}

/** Soma de faixas; `null` se algum item ainda não tem valor calculável. */
export function sumRanges(ranges: (Range | null)[]): Range | null {
  let min = 0;
  let max = 0;
  for (const r of ranges) {
    if (r === null) return null;
    min += r.min;
    max += r.max;
  }
  return { min: cents(min), max: cents(max) };
}

export interface ResolvedLine {
  line: CartLine;
  product: ProductDTO;
  estimate: Range | null;
}

/**
 * Liga as linhas guardadas ao catálogo atual. Linhas cujo produto sumiu, ficou indisponível
 * ou cujas escolhas não valem mais vão para `invalid` (RN10).
 */
export function resolveCart(
  lines: CartLine[],
  produtos: ProductDTO[],
): { valid: ResolvedLine[]; invalid: CartLine[] } {
  const valid: ResolvedLine[] = [];
  const invalid: CartLine[] = [];
  for (const line of lines) {
    const product = produtos.find((p) => p.id === line.productId);
    const selection = product && product.available ? validSelection(product, line.selection) : null;
    if (!product || !selection) {
      invalid.push(line);
      continue;
    }
    const quantity = clampQuantity(product, line.quantity);
    valid.push({ line: { ...line, quantity }, product, estimate: itemEstimate(product, selection, quantity) });
  }
  return { valid, invalid };
}
