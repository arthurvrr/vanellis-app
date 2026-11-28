// Agenda de retirada (RN12–RN15, RN20, RN31, RN32, RN51, RN52): quais dias e horários o
// cliente pode escolher. Datas em 'AAAA-MM-DD' e horas em 'HH:MM', no horário de Brasília.

import { formatDates, pickupRule, type PickupRule } from './cardapioEspecial';
import { addDays, dateMs, DAY, dayAt, isoDate, onWeekday, shortDate, toMinutes, toTime, weekdayShort } from './datas';
import type { CatalogoDTO, ProductDTO } from './catalogo';

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

/**
 * Problema no horário de uma semana, ou null: fechamento antes da abertura, ou dois períodos
 * do mesmo dia que se sobrepõem (C29, C68). O painel e o servidor usam a mesma regra.
 */
export function weekHoursProblem(hours: OpeningHours[]): string | null {
  for (const h of hours) if (h.close <= h.open) return 'O fechamento precisa ser depois da abertura';
  // Stryker disable next-line EqualityOperator: equivalente, o dia 7 não existe e não tem períodos
  for (let wd = 0; wd < 7; wd++) {
    const ps = dayPeriods(hours, wd);
    for (let i = 1; i < ps.length; i++)
      if (ps[i]!.open < ps[i - 1]!.close)
        return `${onWeekday(wd)}, os períodos se sobrepõem: o seguinte precisa começar depois que o anterior termina`;
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

/**
 * Data especial (RN20, RF55): o cliente escolhe só o dia. `deadline` é o último dia para
 * encomendar, até o fechamento da loja (RN58); sem ele, vale a véspera (RN59).
 */
export interface SpecialDate {
  date: string;
  name: string;
  deadline: string | null;
  /**
   * Modo de horário (RF56): `false` = "horário a combinar com a padaria" (o padrão, RN20);
   * `true` = o cliente escolhe o horário.
   */
  chooseTime: boolean;
  /**
   * Intervalo próprio, quando o cliente escolhe o horário (RF57, RN66): dentro dele as
   * restrições gerais não valem. `null` = o horário de funcionamento normal daquele dia.
   */
  window: { start: string; end: string } | null;
}

/** Problema no intervalo próprio de uma data especial, ou null. O painel e o servidor usam a mesma regra. */
export function specialWindowProblem(w: { start: string; end: string }): string | null {
  return w.end > w.start ? null : 'O fim do intervalo precisa ser depois do início';
}

/**
 * Horários de uma data especial em que o cliente escolhe o horário (RN66): com intervalo
 * próprio, só os horários lotados valem; sem ele, o horário e as restrições normais do dia.
 */
function specialTimes(
  input: AgendaInput,
  special: SpecialDate,
  date: string,
  weekday: number,
): string[] {
  const closed = input.closedPeriods.filter((c) => c.date === date);
  if (special.window) {
    // Stryker disable next-line ArrayDeclaration: equivalente, pickupTimes só usa restrições com weekday null ou igual ao do dia
    return pickupTimes({ weekday, open: special.window.start, close: special.window.end }, [], closed);
  }
  return pickupTimes(periodsOn(input.schedules, date, weekday), input.restrictions, closed);
}

export interface AgendaInput {
  schedules: WeeklySchedule[];
  restrictions: PickupRestriction[];
  /** Datas sem retirada (feriados, folgas). */
  blockedDates: string[];
  /** Períodos fechados num dia específico, por lotação (RN15). */
  closedPeriods: { date: string; start: string; end: string }[];
  /** Datas especiais: só o dia, horário combinado pelo operador (RN20). */
  specialDates: SpecialDate[];
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
  /**
   * Itens do carrinho que não estão mais no cardápio visível ou estão indisponíveis (RN64):
   * enquanto houver algum, nenhum dia é oferecido e o site pede para tirá-los do carrinho.
   */
  unavailable: number[];
  /** Os outros dias da janela e o motivo de cada um (RF59, RF62). */
  blocked: BlockedDay[];
  /** Horários indisponíveis dentro dos dias disponíveis, com o motivo (RF59). */
  blockedTimes: BlockedTime[];
  /** O item que limita as datas e a primeira retirada (C106); null sem item acima da antecedência da loja. */
  limit: { name: string; hours: number; from: FirstPickup } | null;
}

/**
 * Última data que o cliente pode agendar: hoje + N meses de calendário (RN53).
 * Se o dia não existe no mês final (31/10 + 4 meses), vale o último dia desse mês.
 */
export function lastBookableDate(today: string, months: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const lastDayOfTarget = new Date(Date.UTC(y!, m! - 1 + months + 1, 0)).getUTCDate();
  return isoDate(Date.UTC(y!, m! - 1 + months, Math.min(d!, lastDayOfTarget)));
}

/** Horário semanal que vale numa data: o de início mais recente entre os vigentes. */
export function scheduleFor(schedules: WeeklySchedule[], date: string): WeeklySchedule | null {
  return (
    schedules
      .filter((s) => s.validFrom <= date && (s.validUntil === null || s.validUntil >= date))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null
  );
}

/** Períodos de funcionamento numa data, pelo horário semanal que vale nela; sem horário, nenhum. */
export function periodsOn(schedules: WeeklySchedule[], date: string, weekday: number): OpeningHours[] {
  // Stryker disable next-line ArrayDeclaration: equivalente, dayPeriods filtra por dia da semana e descarta qualquer item sem weekday
  return dayPeriods(scheduleFor(schedules, date)?.hours ?? [], weekday);
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

/** Até quantos dias antes do prazo se procura um dia aberto (RN58). */
const CLOSING_SEARCH_DAYS = 60;

/**
 * Até quando uma data especial aceita pedidos (RN58, RN59): no fechamento da loja no dia do
 * prazo, ou na véspera, sem prazo. Se a loja não abre nesse dia (sem horário ou data
 * bloqueada), vale o último dia aberto antes dele; no dia, vale o fim do último período (depois
 * do almoço). Sem nenhum dia aberto antes, vale o fim do dia do prazo (`time: null`).
 */
export function specialClosing(
  input: Pick<AgendaInput, 'schedules' | 'blockedDates'>,
  special: Pick<SpecialDate, 'date' | 'deadline'>,
): Until {
  const base = special.deadline ?? addDays(special.date, -1);
  const blocked = new Set(input.blockedDates);
  for (let i = 0; i <= CLOSING_SEARCH_DAYS; i++) {
    const { date, weekday } = dayAt(dateMs(base) - i * DAY);
    if (blocked.has(date)) continue;
    const last = periodsOn(input.schedules, date, weekday).at(-1);
    if (last) return { date, time: last.close };
  }
  return { date: base, time: null };
}

/** Até quando se pode pedir: dia e hora, ou o fim do dia (`time: null`). */
export interface Until {
  date: string;
  time: string | null;
}

/** O instante (ms) de um prazo: a hora no dia, ou o fim do dia. */
export function untilMs(c: Until): number {
  return c.time === null ? dateMs(c.date) + DAY : dateMs(c.date, toMinutes(c.time));
}

/** "ter 22/12" */
function dayLabel(date: string): string {
  return `${weekdayShort(dayAt(dateMs(date)).weekday).toLowerCase()} ${shortDate(date)}`;
}

/** "ter 22/12 às 19h" ou "o fim de ter 22/12". */
function describeClosing(c: Until): string {
  return c.time === null ? `o fim de ${dayLabel(c.date)}` : `${dayLabel(c.date)} às ${formatHour(c.time)}`;
}

/**
 * O que o painel mostra de uma data especial (RF61): até quando vai a encomenda, já com o
 * recuo para o último dia aberto, e os avisos ao operador.
 */
export function specialDateNotes(
  input: Pick<AgendaInput, 'schedules' | 'blockedDates'>,
  special: Pick<SpecialDate, 'date' | 'deadline' | 'chooseTime' | 'window'>,
): { closing: string; warnings: string[] } {
  const c = specialClosing(input, special);
  const base = special.deadline ?? addDays(special.date, -1);
  const when = describeClosing(c);
  const warnings: string[] = [];
  // O recuo devolve outro dia, ou o fim do próprio dia quando não há dia aberto antes.
  if (c.date !== base || c.time === null) warnings.push(`A loja não abre em ${dayLabel(base)}: o prazo recua para ${when}.`);
  if (special.deadline === null)
    warnings.push(
      'Sem prazo, qualquer produto do site, inclusive os de antecedência longa, poderá ser pedido até a véspera, no fechamento da loja.',
    );
  // C104: o cliente escolheria o horário num dia em que a loja não abre, sem intervalo próprio.
  const weekday = dayAt(dateMs(special.date)).weekday;
  if (special.chooseTime && !special.window && !periodsOn(input.schedules, special.date, weekday).length)
    warnings.push(
      `A loja não abre em ${dayLabel(special.date)}: sem intervalo próprio, não haverá horário para escolher. Cadastre um intervalo.`,
    );
  return { closing: `Encomendas até ${when}${special.deadline === null ? ' (véspera)' : ''}`, warnings };
}

/** Um dia que não pode ser escolhido e por quê (RF59, RF62). */
export interface BlockedDay {
  date: string;
  weekday: number;
  reason: string;
}

/** Um horário que não pode ser escolhido num dia disponível, e por quê (RF59). */
export interface BlockedTime {
  date: string;
  time: string;
  reason: string;
}

/** O que os motivos precisam saber do carrinho. */
export interface ScanContext {
  /** O item de maior antecedência, quando ela passa a da loja (para dizer qual item limita). */
  leadItem: { name: string; hours: number } | null;
  /** Cardápios especiais do carrinho (para "fora das datas de retirada de ..."). */
  menus: { name: string; pickupDates: string[] }[];
}

/**
 * Dias e horários a partir de `now` ('AAAA-MM-DDTHH:MM', horário de Brasília): os disponíveis e,
 * para os outros dias da janela, o motivo (RF62). Uma busca só, para as duas listas nunca
 * discordarem.
 *
 * A antecedência é a do carrinho (`leadHours`, ver agendaForCart; `null` = a padrão da loja, RN13): um
 * horário só aparece se é depois de `now` + antecedência. Ela pode ser menor que a padrão (RF70). Na data especial, quem controla é o
 * prazo dela (RN57–RN59), não a antecedência dos itens, e a janela de agendamento não vale
 * (RN65).
 */
export function scanDays(
  input: AgendaInput,
  now: string,
  leadHours: number | null = null,
  /** Só estas datas, quando o carrinho tem cardápio especial (RN19); null = todas. */
  allowedDates: string[] | null = null,
  // Stryker disable next-line ArrayDeclaration: equivalente, sem contexto o chamador (availableDays) descarta os motivos
  why: ScanContext = { leadItem: null, menus: [] },
): { days: AvailableDay[]; blocked: BlockedDay[]; blockedTimes: BlockedTime[] } {
  const allowed = allowedDates ? new Set(allowedDates) : null;
  const [today, time] = now.split('T') as [string, string];
  const lead = leadHours ?? input.minLeadHours;
  const leadMinutes = lead * 60;
  const earliest = dateMs(today, toMinutes(time) + leadMinutes);
  const nowMs = dateMs(today, toMinutes(time));
  const closedDates = new Set(input.blockedDates);
  const lastMs = dateMs(lastBookableDate(today, input.windowMonths));
  const lastSpecialMs = Math.max(lastMs, ...input.specialDates.map((s) => dateMs(s.date)));
  const leadReason = why.leadItem
    ? `${why.leadItem.name} precisa de ${why.leadItem.hours}h de antecedência`
    : `é preciso encomendar com ${lead}h de antecedência`;
  const days: AvailableDay[] = [];
  const blocked: BlockedDay[] = [];
  const blockedTimes: BlockedTime[] = [];

  for (let dayMs = dateMs(today); dayMs <= lastSpecialMs; dayMs += DAY) {
    const { date, weekday } = dayAt(dayMs);
    const special = input.specialDates.find((s) => s.date === date);
    // Além da janela, só as datas especiais contam (RN65).
    if (!special && dayMs > lastMs) continue;
    const fora = (reason: string) => blocked.push({ date, weekday, reason });

    if (allowed && !allowed.has(date)) {
      fora(`fora das datas de retirada de ${why.menus.map((m) => m.name).join(' e ')} (${formatDates(allowedDates!)})`);
      continue;
    }
    if (closedDates.has(date)) {
      fora('a padaria não abre neste dia');
      continue;
    }
    const closed = input.closedPeriods.filter((c) => c.date === date);
    const busy = (t: string) => closed.some((c) => t >= c.start && t < c.end);

    if (special) {
      const until = specialClosing(input, special);
      if (nowMs >= untilMs(until)) {
        fora(`as encomendas para ${shortDate(date)} se encerraram em ${shortDate(until.date)}`);
        continue;
      }
      // A antecedência dos itens não vale aqui (RN57): os pedidos fecham antes do dia.
      const times = special.chooseTime ? specialTimes(input, special, date, weekday) : [];
      // No modo "cliente escolhe", um dia sem nenhum horário não é oferecido (C104).
      if (special.chooseTime && !times.length) {
        fora('não há horário para escolher neste dia');
        continue;
      }
      days.push({ date, weekday, special: special.name, times, delivery: deliveryOn(input.delivery, date) });
      if (special.chooseTime) {
        const slots = special.window
          ? // Stryker disable next-line ArrayDeclaration: equivalente, pickupTimes só usa restrições com weekday null ou igual ao do dia
            pickupTimes({ weekday, open: special.window.start, close: special.window.end }, [], [])
          : // Stryker disable next-line ArrayDeclaration: equivalente, como acima
            pickupTimes(periodsOn(input.schedules, date, weekday), [], []);
        for (const t of slots)
          if (!times.includes(t)) blockedTimes.push({ date, time: t, reason: busy(t) ? 'horário lotado' : 'sem retirada neste horário' });
      }
      continue;
    }

    const periods = periodsOn(input.schedules, date, weekday);
    if (!periods.length) {
      fora('a padaria está fechada');
      continue;
    }
    const grid = pickupTimes(periods, input.restrictions, closed);
    if (!grid.length) {
      fora(pickupTimes(periods, input.restrictions, []).length ? 'os horários deste dia estão lotados' : 'não há retirada neste dia');
      continue;
    }
    const times = grid.filter((t) => dateMs(date, toMinutes(t)) >= earliest);
    if (!times.length) {
      fora(leadReason);
      continue;
    }
    days.push({ date, weekday, special: null, times, delivery: deliveryOn(input.delivery, date) });
    // Stryker disable next-line ArrayDeclaration: equivalente, pickupTimes só usa restrições com weekday null ou igual ao do dia
    for (const t of pickupTimes(periods, [], [])) {
      if (times.includes(t)) continue;
      const reason = busy(t) ? 'horário lotado' : grid.includes(t) ? leadReason : 'sem retirada neste horário';
      blockedTimes.push({ date, time: t, reason });
    }
  }
  return { days, blocked, blockedTimes };
}

/** Só os dias disponíveis (ver scanDays). */
export function availableDays(
  input: AgendaInput,
  now: string,
  leadHours: number | null = null,
  allowedDates: string[] | null = null,
): AvailableDay[] {
  return scanDays(input, now, leadHours, allowedDates).days;
}

/**
 * Antecedência de um produto: a cadastrada nele vale no lugar da padrão da loja, para mais
 * (RN14) ou para menos (RF70); vazia = a padrão (RN13).
 */
export function productLeadHours(input: Pick<AgendaInput, 'minLeadHours'>, p: Pick<ProductDTO, 'leadTimeHours'>): number {
  return p.leadTimeHours ?? input.minLeadHours;
}

/** A primeira retirada possível: dia e o primeiro horário dele (ou só o dia, numa data especial sem horário). */
export interface FirstPickup {
  date: string;
  weekday: number;
  time: string | null;
}

/** "sex 27/11, 10h" ou "qui 24/12" */
function describeFirst(f: FirstPickup): string {
  return `${weekdayShort(f.weekday).toLowerCase()} ${shortDate(f.date)}${f.time ? `, ${formatHour(f.time)}` : ''}`;
}

/** Linha fixa acima do calendário (C106): qual item limita e desde quando dá para retirar. */
export function limitText(limit: { name: string; hours: number; from: FirstPickup }): string {
  return `${limit.name} precisa de ${limit.hours}h de antecedência: a retirada é a partir de ${describeFirst(limit.from)}`;
}

/**
 * Card do produto (RF58, C105, C154): só para produto com antecedência própria diferente da da loja
 * (o servidor só manda `firstPickup` nesse caso).
 */
export function leadNotice(product: Pick<ProductDTO, 'leadTimeHours' | 'firstPickup'>): string | null {
  if (!product.firstPickup || product.leadTimeHours === null) return null;
  const desde = `retirada a partir de ${describeFirst(product.firstPickup)}`;
  if (product.leadTimeHours === 0) return `Sem antecedência: ${desde}`;
  return `Encomende com ${product.leadTimeHours}h de antecedência: ${desde}`;
}

/** Sem data em comum entre os cardápios do carrinho (C108): quais e o que fazer. */
export function conflictText(rule: Pick<PickupRule, 'menus'>): string {
  const parts = rule.menus.map((m, i) => `${m.name}${i === 0 ? ' é retirada' : ''} em ${formatDates(m.pickupDates)}`);
  const pedidos = rule.menus.length === 2 ? 'faça dois pedidos' : 'faça pedidos separados';
  return `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}: ${pedidos}`;
}

/** "Sáb 28/11" */
export function formatDay(day: Pick<AvailableDay, 'date' | 'weekday'>): string {
  return `${weekdayShort(day.weekday)} ${shortDate(day.date)}`;
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
  const diaDe = (dayMs: number) => {
    const { date, weekday } = dayAt(dayMs);
    if (blocked.has(date)) return { date, weekday, periods: [] };
    return { date, weekday, periods: periodsOn(input.schedules, date, weekday) };
  };

  const todayMs = dateMs(today);
  const t = diaDe(todayMs);
  const current = t.periods.find((p) => minutes >= toMinutes(p.open) && minutes < toMinutes(p.close));
  if (current) return { open: true, closesAt: current.close, nextOpen: null };
  // Antes de abrir, ou no intervalo entre dois períodos (C67): abre hoje.
  // Stryker disable next-line EqualityOperator: equivalente, no minuto exato da abertura o período já é o atual
  const later = t.periods.find((p) => minutes < toMinutes(p.open));
  if (later) return { open: false, closesAt: null, nextOpen: { date: t.date, weekday: t.weekday, time: later.open } };
  for (let i = 1; i <= 14; i++) {
    const d = diaDe(todayMs + i * DAY);
    if (d.periods.length)
      return { open: false, closesAt: null, nextOpen: { date: d.date, weekday: d.weekday, time: d.periods[0]!.open } };
  }
  return { open: false, closesAt: null, nextOpen: null };
}

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
    // Stryker disable next-line ConditionalExpression: equivalente, sem dia anterior também não há grupo (last), e a junção exige last
    const consecutive = prevDay !== undefined && order.indexOf(wd) === order.indexOf(prevDay) + 1;
    // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalente, dia fechado tem texto '' (nunca igual ao de um grupo) e consecutive já implica last
    if (periods.length && last && consecutive && last.text === text) last.days.push(wd);
    else if (periods.length) groups.push({ days: [wd], text });
  }
  const parts = groups.map((g) => {
    const first = weekdayShort(g.days[0]!).toLowerCase();
    const lastDay = weekdayShort(g.days.at(-1)!).toLowerCase();
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
      : s.nextOpen.date === addDays(today, 1)
        ? 'amanhã'
        : weekdayShort(s.nextOpen.weekday).toLowerCase();
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
 * Dias de retirada para os produtos do carrinho: a maior antecedência entre os itens, cada um com
 * a sua ou a padrão (RN14, RF70); carrinho vazio = a padrão. Com
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
  const itens = catalogo.produtos.filter((p) => ids.has(p.id));
  const lead = itens.length ? Math.max(...itens.map((p) => productLeadHours(input, p))) : input.minLeadHours;
  const rule = pickupRule(catalogo, productIds);
  // Um item que saiu do cardápio (cardápio encerrado ou oculto, produto excluído) não pode virar
  // item regular, liberado para qualquer dia (G36): ele bloqueia a retirada até sair do carrinho.
  const visivel = new Map(catalogo.produtos.map((p) => [p.id, p]));
  const unavailable = [...ids].filter((id) => !visivel.get(id)?.available).sort((a, b) => a - b);
  // O item que limita, quando a antecedência dele passa a da loja (C106, C107).
  const limitante = lead > input.minLeadHours ? itens.find((p) => p.leadTimeHours === lead)! : null;
  const leadItem = limitante ? { name: limitante.name, hours: lead } : null;
  const nada = { days: [], blocked: [], blockedTimes: [] };
  const scan =
    paused || rule.conflict || unavailable.length
      ? nada
      : scanDays(input, now, lead, rule.dates, { leadItem, menus: rule.menus });
  const primeiro = scan.days.find((d) => !d.special);
  return {
    paused,
    leadHours: lead,
    days: scan.days,
    rule,
    unavailable,
    blocked: scan.blocked,
    blockedTimes: scan.blockedTimes,
    limit:
      leadItem && primeiro
        ? { ...leadItem, from: { date: primeiro.date, weekday: primeiro.weekday, time: primeiro.times[0]! } }
        : null,
  };
}
