// Cardápios especiais (etapa 6: RF16–RF19, RN16–RN19, RN28–RN30; cenários C70–C76).
// Um cardápio especial é uma categoria marcada como especial: aparece no site só dentro do
// período e se não estiver oculta, e seus produtos só podem ser retirados nas datas dela.
// O painel, o servidor e a versão de teste usam estas mesmas regras.

import type { CategoryDTO, ProductDTO } from './catalogo';

/** Configuração de um cardápio especial, como o painel edita. Datas 'AAAA-MM-DD'. */
export interface SpecialMenu {
  visibleFrom: string;
  visibleUntil: string;
  hidden: boolean;
  pickupDates: string[];
}

/** O que o site recebe de um cardápio especial visível. */
export interface PublicSpecialMenu {
  /** Último dia em que o cardápio aparece (ex: encomendas até 22/12). */
  visibleUntil: string;
  /** Únicas datas de retirada dos seus produtos (RN19). */
  pickupDates: string[];
}

export type SpecialMenuState = 'oculto' | 'em-breve' | 'visivel' | 'encerrado';

/** Situação do cardápio hoje: só 'visivel' aparece no site (RN17, RN18). */
export function specialMenuState(menu: SpecialMenu, today: string): SpecialMenuState {
  if (menu.hidden) return 'oculto';
  if (today < menu.visibleFrom) return 'em-breve';
  if (today > menu.visibleUntil) return 'encerrado';
  return 'visivel';
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Problema na configuração, ou null (C72). */
export function specialMenuProblem(menu: Omit<SpecialMenu, 'hidden'>): string | null {
  if (!DATE.test(menu.visibleFrom) || !DATE.test(menu.visibleUntil)) return 'Informe o início e o fim do período';
  if (menu.visibleUntil < menu.visibleFrom) return 'O fim do período precisa ser depois do início';
  if (!menu.pickupDates.length) return 'Informe ao menos uma data de retirada';
  if (menu.pickupDates.some((d) => !DATE.test(d))) return 'Data de retirada inválida';
  if (menu.pickupDates.some((d) => d < menu.visibleFrom))
    return 'As datas de retirada precisam ser a partir do início do período';
  return null;
}

/** '2026-12-24' → '24/12' */
export const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** ['2026-12-24'] → '24/12'; três datas → '24/12, 25/12 e 31/12'. */
export function formatDates(dates: string[]): string {
  const list = [...dates].sort().map(shortDate);
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} e ${list.at(-1)}`;
}

/** "Retirada em 24/12" ou "Retirada em 24/12 e 25/12". */
export const pickupLabel = (menu: PublicSpecialMenu) => `Retirada em ${formatDates(menu.pickupDates)}`;

export interface PickupRule {
  /** Cardápios especiais presentes no carrinho, com as datas de cada um. */
  menus: { name: string; pickupDates: string[] }[];
  /** Datas permitidas para o pedido todo; null = sem restrição (só cardápio regular, C76). */
  dates: string[] | null;
  /** Cardápios sem nenhuma data em comum: pedidos separados (RN30, C75). */
  conflict: boolean;
}

/**
 * Datas de retirada permitidas para os produtos do carrinho: com itens de cardápio especial,
 * só as datas comuns a todos eles; os itens regulares acompanham (RN28, RN29).
 */
export function pickupRule(
  catalogo: { categorias: CategoryDTO[]; produtos: Pick<ProductDTO, 'id' | 'categoryId'>[] },
  productIds: number[],
): PickupRule {
  const ids = new Set(productIds);
  const catIds = new Set(catalogo.produtos.filter((p) => ids.has(p.id)).map((p) => p.categoryId));
  const menus = catalogo.categorias
    .filter((c) => catIds.has(c.id) && c.special)
    .map((c) => ({ name: c.name, pickupDates: [...c.special!.pickupDates].sort() }));
  if (!menus.length) return { menus, dates: null, conflict: false };
  const dates = menus.reduce<string[]>(
    (acc, m) => acc.filter((d) => m.pickupDates.includes(d)),
    menus[0]!.pickupDates,
  );
  return { menus, dates, conflict: dates.length === 0 };
}
