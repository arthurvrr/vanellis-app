// Agenda de retirada (RN12–RN15, RN20, RN31, RN32, RN51, RN52): quais dias e horários o
// cliente pode escolher. Datas em 'AAAA-MM-DD' e horas em 'HH:MM', no horário de Brasília.

import { pickupRule, type PickupRule } from './cardapioEspecial';
import type { CatalogoDTO } from './catalogo';

/** Intervalo entre os horários oferecidos ao cliente (RN51). */
export const PICKUP_STEP_MINUTES = 30;

/**
 * Um período de funcionamento num dia da semana (0 = domingo). Um dia pode ter vários, como
 * 7h30–12h e 14h–18h30 com intervalo de almoço (C67).
 */
export interface OpeningHours {
  weekday: number;
  open: string;
  close: string;
}

/** Horário semanal em vigor a partir de uma data e, opcionalmente, até outra (RN31). */
export interface WeeklySchedule {
  validFrom: string;
  validUntil: string | null;
  /** Dia sem horário de funcionamento = loja fechada (RN32). */
  hours: OpeningHours[];
}

/** Períodos de um dia da semana, em ordem de abertura. */
export function dayPeriods(hours: OpeningHours[], weekday: number): OpeningHours[] {
  return hours.filter((h) => h.weekday === weekday).sort((a, b) => a.open.localeCompare(b.open));
}

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Problema no horário de uma semana, ou null: fechamento antes da abertura, ou dois períodos
 * do mesmo dia que se sobrepõem (C29, C68). O painel e o servidor usam a mesma regra.
 */
export function weekHoursProblem(hours: OpeningHours[]): string | null {
  for (const h of hours) if (h.close <= h.open) return 'O fechamento precisa ser depois da abertura';
  for (let wd = 0; wd < 7; wd++) {
    const ps = dayPeriods(hours, wd);
    for (let i = 1; i < ps.length; i++)
      if (ps[i]!.open < ps[i - 1]!.close)
        return `Na ${WEEKDAY_NAMES[wd]}, os períodos se sobrepõem: o seguinte precisa começar depois que o anterior termina`;
  }
  return null;
}

/**
 * Intervalo sem retirada, para um dia da semana ou todos (`weekday: null`) (RN52).
 * "Retirada só a partir das 8h30" = intervalo de 00:00 a 08:30.
 */
export interface PickupRestriction {
  weekday: number | null;
  start: string;
  end: string;
}

export interface AgendaInput {
  schedules: WeeklySchedule[];
  restrictions: PickupRestriction[];
  /** Datas sem retirada (feriados, folgas). */
  blockedDates: string[];
  /** Períodos fechados num dia específico, por lotação (RN15). */
  closedPeriods: { date: string; start: string; end: string }[];
  /** Datas especiais: só o dia, horário combinado pelo operador (RN20). */
  specialDates: { date: string; name: string }[];
  /** Antecedência mínima padrão em horas (RN13). */
  minLeadHours: number;
  /** Até quantos meses à frente o cliente pode agendar (RN53). */
  windowMonths: number;
  /** Tele-entrega (RN43, RN44); ausente = desligada. */
  delivery?: DeliveryConfig;
}

/** Tele-entrega: ligada ou não, e se vale em todos os dias com retirada ou só em datas. */
export interface DeliveryConfig {
  enabled: boolean;
  allDays: boolean;
  /** Datas com entrega, quando `allDays` é falso. */
  dates: string[];
}

/** Problema na configuração da entrega, ou null (C83). */
export function deliveryProblem(d: DeliveryConfig): string | null {
  if (d.enabled && !d.allDays && !d.dates.length) return 'Marque ao menos uma data com entrega';
  if (d.dates.some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x))) return 'Data inválida';
  return null;
}

/** Se a entrega vale numa data (RN43, RN44). */
export const deliveryOn = (d: DeliveryConfig | undefined, date: string) =>
  !!d?.enabled && (d.allDays || d.dates.includes(date));

export interface AvailableDay {
  date: string;
  weekday: number;
  /** Nome da data especial; nela não há escolha de horário (RN20). */
  special: string | null;
  /** Horários de retirada livres, 'HH:MM', de 30 em 30 minutos. */
  times: string[];
  /** Tele-entrega vale nesta data, nos mesmos horários (RN44). */
  delivery: boolean;
}

export interface AgendaDTO {
  /** Recebimento de pedidos pausado pelo operador (RN11). */
  paused: boolean;
  leadHours: number;
  days: AvailableDay[];
  /** Cardápios especiais no carrinho e as datas que eles permitem (RN19, RN29, RN30). */
  rule?: PickupRule;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
};
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Data e hora de parede como milissegundos numa linha do tempo sem fuso. */
function wallMs(date: string, minutes = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d) + minutes * MINUTE;
}

/**
 * Última data que o cliente pode agendar: hoje + N meses de calendário (RN53).
 * Se o dia não existe no mês final (31/10 + 4 meses), vale o último dia desse mês.
 */
export function lastBookableDate(today: string, months: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const lastDayOfTarget = new Date(Date.UTC(y!, m! - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y!, m! - 1 + months, Math.min(d!, lastDayOfTarget))).toISOString().slice(0, 10);
}

/** Horário semanal que vale numa data: o de início mais recente entre os vigentes. */
export function scheduleFor(schedules: WeeklySchedule[], date: string): WeeklySchedule | null {
  return (
    schedules
      .filter((s) => s.validFrom <= date && (s.validUntil === null || s.validUntil >= date))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null
  );
}

/**
 * Horários de retirada de um dia, sem considerar a antecedência: de 30 em 30 minutos, em cada
 * período, da abertura até 30 minutos antes do fechamento (RN51, C67), fora das restrições
 * (RN52) e dos períodos fechados por lotação (RN15). Abertura fora do passo (ex: 7h15)
 * começa no seguinte. Recebe os períodos de um mesmo dia da semana.
 */
export function pickupTimes(
  periods: OpeningHours | OpeningHours[],
  restrictions: PickupRestriction[],
  closed: { start: string; end: string }[],
): string[] {
  const list = Array.isArray(periods) ? periods : [periods];
  if (!list.length) return [];
  const weekday = list[0]!.weekday;
  const blocked = [...restrictions.filter((r) => r.weekday === null || r.weekday === weekday), ...closed].map(
    (b) => [toMinutes(b.start), toMinutes(b.end)] as const,
  );

  const times = new Set<number>();
  for (const p of list) {
    const first = Math.ceil(toMinutes(p.open) / PICKUP_STEP_MINUTES) * PICKUP_STEP_MINUTES;
    const last = toMinutes(p.close) - PICKUP_STEP_MINUTES;
    for (let t = first; t <= last; t += PICKUP_STEP_MINUTES) {
      if (!blocked.some(([start, end]) => t >= start && t < end)) times.add(t);
    }
  }
  return [...times].sort((a, b) => a - b).map(toTime);
}

/**
 * Dias e horários disponíveis a partir de `now` ('AAAA-MM-DDTHH:MM', horário de Brasília).
 * A antecedência é a maior entre a padrão e a exigida pelos itens do carrinho (RN13, RN14):
 * um horário só aparece se é depois de `now` + antecedência. Data especial conta a partir
 * da meia-noite do dia, já que o horário é combinado depois.
 */
export function availableDays(
  input: AgendaInput,
  now: string,
  itemsLeadHours = 0,
  /** Só estas datas, quando o carrinho tem cardápio especial (RN19); null = todas. */
  allowedDates: string[] | null = null,
): AvailableDay[] {
  const allowed = allowedDates ? new Set(allowedDates) : null;
  const [today, time] = now.split('T') as [string, string];
  const leadMinutes = Math.max(input.minLeadHours, itemsLeadHours) * 60;
  const earliest = wallMs(today, toMinutes(time) + leadMinutes);
  const blocked = new Set(input.blockedDates);
  const lastMs = wallMs(lastBookableDate(today, input.windowMonths));
  const days: AvailableDay[] = [];

  for (let dayMs = wallMs(today); dayMs <= lastMs; dayMs += DAY) {
    const date = new Date(dayMs).toISOString().slice(0, 10);
    const weekday = new Date(dayMs).getUTCDay();
    if (blocked.has(date)) continue;
    if (allowed && !allowed.has(date)) continue;

    const special = input.specialDates.find((s) => s.date === date);
    if (special) {
      if (dayMs >= earliest)
        days.push({ date, weekday, special: special.name, times: [], delivery: deliveryOn(input.delivery, date) });
      continue;
    }

    const periods = dayPeriods(scheduleFor(input.schedules, date)?.hours ?? [], weekday);
    if (!periods.length) continue;
    const closed = input.closedPeriods.filter((c) => c.date === date);
    const times = pickupTimes(periods, input.restrictions, closed).filter(
      (t) => wallMs(date, toMinutes(t)) >= earliest,
    );
    if (times.length) days.push({ date, weekday, special: null, times, delivery: deliveryOn(input.delivery, date) });
  }
  return days;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Sáb 28/11" */
export function formatDay(day: Pick<AvailableDay, 'date' | 'weekday'>): string {
  const [, m, d] = day.date.split('-');
  return `${WEEKDAYS[day.weekday]} ${d}/${m}`;
}

/** Data e hora de agora no horário de Brasília, como 'AAAA-MM-DDTHH:MM'. */
export function nowInBrasilia(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return parts.replace(' ', 'T');
}

// ---------- Situação da loja (tela de entrada) ----------

export interface StoreStatus {
  open: boolean;
  /** 'HH:MM' de fechamento hoje, quando aberta. */
  closesAt: string | null;
  /** Próxima abertura, quando fechada (até 14 dias à frente). */
  nextOpen: { date: string; weekday: number; time: string } | null;
}

/**
 * Se a loja está aberta agora ('AAAA-MM-DDTHH:MM', Brasília), pelo horário semanal em vigor e
 * pelas datas bloqueadas. É informação de vitrine: o que vale para pedido é `availableDays`.
 */
export function storeStatus(
  input: Pick<AgendaInput, 'schedules' | 'blockedDates'>,
  now: string,
): StoreStatus {
  const [today, time] = now.split('T') as [string, string];
  const minutes = toMinutes(time);
  const blocked = new Set(input.blockedDates);
  const periodsOn = (dayMs: number) => {
    const date = new Date(dayMs).toISOString().slice(0, 10);
    const weekday = new Date(dayMs).getUTCDay();
    if (blocked.has(date)) return { date, weekday, periods: [] };
    return { date, weekday, periods: dayPeriods(scheduleFor(input.schedules, date)?.hours ?? [], weekday) };
  };

  const todayMs = wallMs(today);
  const t = periodsOn(todayMs);
  const current = t.periods.find((p) => minutes >= toMinutes(p.open) && minutes < toMinutes(p.close));
  if (current) return { open: true, closesAt: current.close, nextOpen: null };
  // Antes de abrir, ou no intervalo entre dois períodos (C67): abre hoje.
  const later = t.periods.find((p) => minutes < toMinutes(p.open));
  if (later) return { open: false, closesAt: null, nextOpen: { date: t.date, weekday: t.weekday, time: later.open } };
  for (let i = 1; i <= 14; i++) {
    const d = periodsOn(todayMs + i * DAY);
    if (d.periods.length)
      return { open: false, closesAt: null, nextOpen: { date: d.date, weekday: d.weekday, time: d.periods[0]!.open } };
  }
  return { open: false, closesAt: null, nextOpen: null };
}

const WEEKDAYS_LOWER = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** '07:30' → '7h30'; '19:00' → '19h'. */
export function formatHour(time: string): string {
  const [h, m] = time.split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
}

/** "7h30–12h e 14h–18h30" */
export function formatPeriods(periods: OpeningHours[]): string {
  return periods.map((p) => `${formatHour(p.open)}–${formatHour(p.close)}`).join(' e ');
}

/**
 * Horário da semana em uma linha, juntando dias seguidos com o mesmo horário, de segunda a
 * domingo: "Seg a sáb 7h30–19h · Dom 7h30–12h", ou com intervalo, "Seg a sex 7h30–12h e
 * 14h–18h30" (C67). Dias fechados não aparecem.
 */
export function weekSummary(hours: OpeningHours[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: { days: number[]; text: string }[] = [];
  for (const wd of order) {
    const periods = dayPeriods(hours, wd);
    const text = formatPeriods(periods);
    const last = groups.at(-1);
    const prevDay = last?.days.at(-1);
    const consecutive = prevDay !== undefined && order.indexOf(wd) === order.indexOf(prevDay) + 1;
    if (periods.length && last && consecutive && last.text === text) last.days.push(wd);
    else if (periods.length) groups.push({ days: [wd], text });
  }
  const parts = groups.map((g) => {
    const first = WEEKDAYS_LOWER[g.days[0]!]!;
    const lastDay = WEEKDAYS_LOWER[g.days.at(-1)!]!;
    const days = g.days.length === 1 ? first : g.days.length === 2 ? `${first} e ${lastDay}` : `${first} a ${lastDay}`;
    return `${days} ${g.text}`;
  });
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' · ');
}

/**
 * Texto do selo da entrada: "Aberto agora · fecha às 19h" ou "Fechado · abre amanhã às 7h30".
 * Sem nenhum dia aberto nas próximas duas semanas (todos os dias fechados no horário, ou um
 * período longo bloqueado): "Temporariamente fechado".
 */
export function statusLabel(s: StoreStatus, today: string): string {
  if (s.open) return `Aberto agora · fecha às ${formatHour(s.closesAt!)}`;
  if (!s.nextOpen) return 'Temporariamente fechado';
  const when =
    s.nextOpen.date === today
      ? 'hoje'
      : s.nextOpen.date === new Date(wallMs(today) + DAY).toISOString().slice(0, 10)
        ? 'amanhã'
        : WEEKDAYS_LOWER[s.nextOpen.weekday];
  return `Fechado · abre ${when} às ${formatHour(s.nextOpen.time)}`;
}

/** Dados da loja para a entrada e o rodapé do site. */
export interface StoreInfoDTO {
  today: string;
  paused: boolean;
  minLeadHours: number;
  status: StoreStatus;
  /** Horário semanal em vigor hoje. */
  week: OpeningHours[];
}

export function storeInfo(input: AgendaInput, paused: boolean, now: string): StoreInfoDTO {
  const today = now.slice(0, 10);
  return {
    today,
    paused,
    minLeadHours: input.minLeadHours,
    status: storeStatus(input, now),
    week: scheduleFor(input.schedules, today)?.hours ?? [],
  };
}

/**
 * Dias de retirada para os produtos do carrinho: antecedência dos itens (RN14) e, com
 * cardápio especial, só as datas dele (RN19, RN29); sem data em comum, nenhuma (RN30).
 * Usada pelo servidor e pela versão de teste.
 */
export function agendaForCart(
  input: AgendaInput,
  paused: boolean,
  now: string,
  catalogo: Pick<CatalogoDTO, 'categorias' | 'produtos'>,
  productIds: number[],
): AgendaDTO {
  const ids = new Set(productIds);
  const lead = Math.max(0, ...catalogo.produtos.filter((p) => ids.has(p.id)).map((p) => p.leadTimeHours ?? 0));
  const rule = pickupRule(catalogo, productIds);
  return {
    paused,
    leadHours: Math.max(input.minLeadHours, lead),
    days: paused || rule.conflict ? [] : availableDays(input, now, lead, rule.dates),
    rule,
  };
}
