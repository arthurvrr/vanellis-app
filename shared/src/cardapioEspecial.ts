// Cardápios especiais (etapa 6: RF16–RF19, RN16–RN19, RN28–RN30; cenários C70–C76).
// Um cardápio especial é uma categoria marcada como especial: aparece no site a partir do
// início, se não estiver oculto, e enquanto alguma data de retirada dele aceitar pedidos
// (RN63); seus produtos só podem ser retirados nas datas dele. O fim não é cadastrado: vem do
// prazo de cada data (RF60, RN62). O painel, o servidor e a versão de teste usam estas regras.

import { availableDays, pickupTimes, periodsOn, specialClosing, untilMs, type AgendaInput, type Until } from './agenda';
import type { CategoryDTO, ProductDTO } from './catalogo';
import { dateMs, dayAt, MINUTE, shortDate, toMinutes, toTime } from './datas';

/** Configuração de um cardápio especial, como o painel edita. Datas 'AAAA-MM-DD'. */
export interface SpecialMenu {
  visibleFrom: string;
  hidden: boolean;
  pickupDates: string[];
}

/** O que o site recebe de um cardápio especial visível. */
export interface PublicSpecialMenu {
  /** Datas de retirada que ainda aceitam pedidos (RN19, RN62). */
  pickupDates: string[];
  /** "Retirada em 24/12 (encomendas até 22/12) e 31/12 (encomendas até 29/12)" (RN62). */
  announcement: string;
  /** Itens cuja antecedência não alcança mais nenhuma data aberta: "Prazo encerrado" (RN67). */
  closedProducts: number[];
}

/** Uma data de retirada do cardápio e se ela ainda aceita pedidos. */
export interface MenuPickup {
  date: string;
  /** É data especial (o prazo dela vale para todos os itens, RN57). */
  special: boolean;
  open: boolean;
  /** Prazo efetivo da data especial (RN58, RN59), ou o último momento de uma data normal. */
  until: Until | null;
}

export type SpecialMenuState = 'oculto' | 'em-breve' | 'visivel' | 'encerrado';

/**
 * As datas de retirada de um cardápio, em ordem, e se cada uma ainda aceita pedidos agora
 * ('AAAA-MM-DDTHH:MM'). `leads` são as antecedências dos itens disponíveis do cardápio (só eles
 * contam, C122). Data especial: vale o prazo dela (RN58, RN59) e o bloqueio (RN60). Data normal:
 * vale enquanto algum item ainda chega nela pela antecedência normal (RN63).
 */
/**
 * Datas de retirada de um cardápio especial. `leads` são as antecedências cadastradas nos itens
 * disponíveis dele (`null` = a padrão da loja, RF70).
 */
export function menuPickups(input: AgendaInput, now: string, pickupDates: string[], leads: (number | null)[]): MenuPickup[] {
  return [...pickupDates].sort().map((date) => {
    const special = input.specialDates.find((s) => s.date === date);
    if (special) {
      const open = availableDays(input, now, null, [date]).length > 0;
      return { date, special: true, open, until: specialClosing(input, special) };
    }
    const open = leads.some((lead) => availableDays(input, now, lead, [date]).length > 0);
    return { date, special: false, open, until: normalUntil(input, date, leads) };
  });
}

/** Último momento para pedir numa data normal: o último horário dela menos a menor antecedência. */
function normalUntil(input: AgendaInput, date: string, leads: (number | null)[]): Until | null {
  const { weekday } = dayAt(dateMs(date));
  const closed = input.closedPeriods.filter((c) => c.date === date);
  const last = pickupTimes(periodsOn(input.schedules, date, weekday), input.restrictions, closed).at(-1);
  // Sem horário no dia, ou sem nenhum item disponível no cardápio, não há até quando pedir.
  if (!last || !leads.length) return null;
  const lead = Math.min(...leads.map((l) => l ?? input.minLeadHours));
  const ms = dateMs(date, toMinutes(last)) - lead * 60 * MINUTE;
  return { date: dayAt(ms).date, time: toTime(Math.round((ms - dateMs(dayAt(ms).date)) / MINUTE)) };
}

/** Situação do cardápio: só 'visivel' aparece no site (RN17, RN18, RN63). */
export function specialMenuState(
  menu: Pick<SpecialMenu, 'visibleFrom' | 'hidden'>,
  pickups: MenuPickup[],
  today: string,
): SpecialMenuState {
  if (menu.hidden) return 'oculto';
  if (today < menu.visibleFrom) return 'em-breve';
  return pickups.some((p) => p.open) ? 'visivel' : 'encerrado';
}

/** O prazo da última data de retirada: até quando o cardápio fica no site (RF60, C113). */
export function menuEnd(pickups: MenuPickup[]): Until | null {
  const untils = pickups.map((p) => p.until).filter((u): u is Until => u !== null);
  // Stryker disable next-line EqualityOperator: equivalente, no empate os dois prazos são o mesmo instante
  return untils.reduce<Until | null>((max, u) => (max && untilMs(max) >= untilMs(u) ? max : u), null);
}

/** "24/12, 25/12 e 31/12" */
function joinList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

/**
 * Anúncio do cardápio no site, só com as datas que ainda aceitam pedidos (RN62): "Retirada em
 * 24/12 (encomendas até 22/12) e 31/12 (encomendas até 29/12)"; com uma data especial só,
 * "Retirada em 31/12. Encomendas até 29/12". Data normal sai só com o dia, porque o prazo
 * varia por item (RN67).
 */
export function menuAnnouncement(pickups: MenuPickup[]): string {
  const open = pickups.filter((p) => p.open);
  if (!open.length) return '';
  const [only] = open;
  if (open.length === 1 && only!.special) return `Retirada em ${shortDate(only!.date)}. Encomendas até ${shortDate(only!.until!.date)}`;
  return `Retirada em ${joinList(
    open.map((p) => (p.special ? `${shortDate(p.date)} (encomendas até ${shortDate(p.until!.date)})` : shortDate(p.date))),
  )}`;
}

/**
 * Itens do cardápio com "Prazo encerrado para este item" (RN67): disponíveis, mas cuja
 * antecedência não alcança nenhuma data aberta. Numa data especial aberta todos chegam (RN57).
 */
export function closedMenuProducts(
  input: AgendaInput,
  now: string,
  pickups: MenuPickup[],
  products: Pick<ProductDTO, 'id' | 'leadTimeHours' | 'available'>[],
): number[] {
  return products
    .filter((p) => p.available)
    .filter(
      (p) =>
        !pickups.some(
          (pk) => pk.open && (pk.special || availableDays(input, now, p.leadTimeHours, [pk.date]).length > 0),
        ),
    )
    .map((p) => p.id);
}

/** Avisos do cadastro (RF61, C125): o cardápio começaria no site já encerrado. */
export function specialMenuWarnings(menu: Pick<SpecialMenu, 'visibleFrom'>, pickups: MenuPickup[]): string[] {
  const end = menuEnd(pickups);
  if (end && end.date < menu.visibleFrom)
    return [
      `O cardápio começaria no site já encerrado: o último prazo (${shortDate(end.date)}) é antes do início (${shortDate(menu.visibleFrom)}).`,
    ];
  return [];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Problema na configuração, ou null (C72). */
export function specialMenuProblem(menu: Omit<SpecialMenu, 'hidden'>): string | null {
  if (!DATE.test(menu.visibleFrom)) return 'Informe o início';
  if (!menu.pickupDates.length) return 'Informe ao menos uma data de retirada';
  if (menu.pickupDates.some((d) => !DATE.test(d))) return 'Data de retirada inválida';
  if (menu.pickupDates.some((d) => d < menu.visibleFrom))
    return 'As datas de retirada precisam ser a partir do início do período';
  return null;
}

/** ['2026-12-24'] → '24/12'; três datas → '24/12, 25/12 e 31/12'. */
export function formatDates(dates: string[]): string {
  return joinList([...dates].sort().map(shortDate));
}

export interface PickupRule {
  /** Cardápios especiais presentes no carrinho, com as datas de cada um. */
  menus: { name: string; pickupDates: string[] }[];
  /** Datas permitidas para o pedido todo; null = sem restrição (só cardápio regular, C76). */
  dates: string[] | null;
  /** Cardápios sem nenhuma data em comum: pedidos separados (RN30, C75). */
  conflict: boolean;
}

/**
 * Datas de retirada permitidas para os produtos do carrinho (RN28, RN29, RN68). Um produto que
 * está em algum cardápio regular visível segue a retirada normal: o especial só dá destaque.
 * Um produto que está só em cardápios especiais pode ser retirado nas datas de qualquer um
 * deles. O pedido fica com as datas comuns a todos esses produtos; os outros acompanham.
 */
export function pickupRule(
  catalogo: { categorias: CategoryDTO[]; produtos: Pick<ProductDTO, 'id' | 'categoryIds'>[] },
  productIds: number[],
): PickupRule {
  const ids = new Set(productIds);
  const byId = new Map(catalogo.categorias.map((c) => [c.id, c]));
  // Para cada produto preso a cardápios especiais: as datas de qualquer um deles.
  const presos = catalogo.produtos
    .filter((p) => ids.has(p.id))
    .map((p) => p.categoryIds.map((id) => byId.get(id)).filter((c): c is CategoryDTO => c !== undefined))
    .filter((cats) => cats.length > 0 && cats.every((c) => c.special));
  const usados = new Set(presos.flat().map((c) => c.id));
  const menus = catalogo.categorias
    .filter((c) => usados.has(c.id))
    .map((c) => ({ name: c.name, pickupDates: [...c.special!.pickupDates].sort() }));
  if (!presos.length) return { menus, dates: null, conflict: false };
  const datasDe = (cats: CategoryDTO[]) => new Set(cats.flatMap((c) => c.special!.pickupDates));
  const todas = [...datasDe(presos.flat())].sort();
  const dates = presos.reduce((acc, cats) => acc.filter((d) => datasDe(cats).has(d)), todas);
  return { menus, dates, conflict: dates.length === 0 };
}
