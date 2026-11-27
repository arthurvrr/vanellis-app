// Regras de preço do catálogo (RN23, RN25, RN27, RN49).
// Funções puras: o site usa para exibir, o servidor poderá usar para validar.

import type { OptionDTO, ProductDTO, Selection } from './catalogo';

export interface Range {
  min: number;
  max: number;
}

/** Arredonda para centavos: 0.1 + 0.2 → 0.3. O único lugar dessa conta. */
export const cents = (n: number) => Math.round(n * 100) / 100;

function chosenOptions(product: ProductDTO, selection: Selection): OptionDTO[] {
  return product.groups.flatMap((g) =>
    // Stryker disable next-line ArrayDeclaration: equivalente, nenhum id de opção casa com o texto inserido
    (selection[g.id] ?? [])
      .map((id) => g.options.find((o) => o.id === id))
      .filter((o): o is OptionDTO => o !== undefined),
  );
}

/** Grupos obrigatórios ainda sem a quantidade mínima de escolhas (RN27). */
export function missingGroups(product: ProductDTO, selection: Selection): number[] {
  return product.groups
    .filter((g) => (selection[g.id]?.length ?? 0) < g.minSelect)
    .map((g) => g.id);
}

/**
 * Preço por unidade (UN) ou por kg (KG) das escolhas feitas:
 * o preço da opção `replace` escolhida, ou o preço base, mais as opções `add`.
 * `null` enquanto o preço depende de uma escolha ainda não feita.
 */
export function pricePerUnit(product: ProductDTO, selection: Selection): number | null {
  const chosen = chosenOptions(product, selection);
  const replace = chosen.find((o) => o.priceMode === 'replace');
  const base = replace?.price ?? product.basePrice;
  if (base === null) return null;
  const extras = chosen
    .filter((o) => o.priceMode === 'add')
    .reduce((sum, o) => sum + (o.price ?? 0), 0);
  return cents(base + extras);
}

/** Faixa de peso das escolhas (opção com peso) ou do próprio produto. */
export function weightRange(product: ProductDTO, selection: Selection): Range | null {
  const withWeight = chosenOptions(product, selection).find(
    (o) => o.weightMinKg !== null && o.weightMaxKg !== null,
  );
  if (withWeight) return { min: withWeight.weightMinKg!, max: withWeight.weightMaxKg! };
  if (product.weightMinKg !== null && product.weightMaxKg !== null) {
    return { min: product.weightMinKg, max: product.weightMaxKg };
  }
  return null;
}

/**
 * Valor estimado de um item do carrinho (RN23, RN25).
 * UN: preço × quantidade (mínimo = máximo). KG: preço/kg × faixa de peso × quantidade.
 */
export function itemEstimate(
  product: ProductDTO,
  selection: Selection,
  quantity: number,
): Range | null {
  const price = pricePerUnit(product, selection);
  if (price === null) return null;
  if (product.saleUnit === 'UN') {
    const total = cents(price * quantity);
    return { min: total, max: total };
  }
  const weight = weightRange(product, selection);
  if (weight === null) return null;
  return { min: cents(price * weight.min * quantity), max: cents(price * weight.max * quantity) };
}

export interface CardPrice {
  /** "a partir de" enquanto a escolha que define o preço não foi feita (RN49). */
  fromPrice: boolean;
  value: number | null;
  unit: 'un' | 'kg';
}

/**
 * Preço mostrado no card (RN49): produto por quilo mostra sempre o preço do kg;
 * produto com opção `replace` mostra "a partir de" o menor valor até a escolha.
 */
export function cardPrice(product: ProductDTO, selection: Selection): CardPrice {
  const unit = product.saleUnit === 'KG' ? 'kg' : 'un';
  const current = pricePerUnit(product, selection);
  const replaceGroup = product.groups.find((g) =>
    g.options.some((o) => o.priceMode === 'replace'),
  );
  const replaceChosen =
    replaceGroup !== undefined && (selection[replaceGroup.id]?.length ?? 0) > 0;

  if (replaceGroup && !replaceChosen) {
    const prices = replaceGroup.options
      .filter((o) => o.available && o.price !== null)
      .map((o) => o.price!);
    return { fromPrice: true, value: prices.length ? Math.min(...prices) : null, unit };
  }
  return { fromPrice: false, value: current, unit };
}

/** Foto do card: a da opção escolhida no grupo que controla a foto, senão a do produto. */
export function cardImage(product: ProductDTO, selection: Selection): string | null {
  const group = product.groups.find((g) => g.controlsImage);
  if (group) {
    const id = selection[group.id]?.[0];
    const option = group.options.find((o) => o.id === id);
    if (option?.imageUrl) return option.imageUrl;
  }
  return product.imageUrl;
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Faixa em reais: "R$ 16,00" ou "R$ 96,00 a R$ 136,00". */
export function formatRange(r: Range): string {
  return r.min === r.max ? formatBRL(r.min) : `${formatBRL(r.min)} a ${formatBRL(r.max)}`;
}

/**
 * Cardápio sem nenhum valor, para quando o operador oculta os preços (RF39). Sem preço, o
 * card, o carrinho, a tela de retirada e a mensagem do pedido deixam de mostrar valores
 * (cenário C13); faixas de peso e o resto continuam.
 */
export function withoutPrices<T extends { produtos: ProductDTO[] }>(catalogo: T): T {
  return {
    ...catalogo,
    produtos: catalogo.produtos.map((p) => ({
      ...p,
      basePrice: null,
      groups: p.groups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, price: null })) })),
    })),
  };
}

/**
 * Estimativa no card de produto por quilo (RN49): aparece quando o peso já está definido
 * (tamanho escolhido, ou peso do próprio produto), para a quantidade do card. `null` em
 * produto por unidade, sem tamanho escolhido ou com preços ocultos (RF39), e o card não
 * mostra nada.
 */
export function cardEstimate(product: ProductDTO, selection: Selection, quantity: number): Range | null {
  if (product.saleUnit !== 'KG') return null;
  return itemEstimate(product, selection, quantity);
}
