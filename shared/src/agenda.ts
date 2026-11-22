// Agenda de retirada (RN12–RN15, RN20, RN31, RN32, RN51, RN52): quais dias e horários o
// cliente pode escolher. Datas em 'AAAA-MM-DD' e horas em 'HH:MM', no horário de Brasília.

/** Intervalo entre os horários oferecidos ao cliente (RN51). */
export const PICKUP_STEP_MINUTES = 30;

/** Horário de funcionamento num dia da semana (0 = domingo). */
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
}

export interface AvailableDay {
  date: string;
  weekday: number;
  /** Nome da data especial; nela não há escolha de horário (RN20). */
  special: string | null;
  /** Horários de retirada livres, 'HH:MM', de 30 em 30 minutos. */
  times: string[];
}

export interface AgendaDTO {
  /** Recebimento de pedidos pausado pelo operador (RN11). */
  paused: boolean;
  leadHours: number;
  days: AvailableDay[];
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
  return Date.UTC(y!, m! - 1, d!) + minutes * MINUTE;
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
 * Horários de retirada de um dia, sem considerar a antecedência: de 30 em 30 minutos, da
 * abertura até 30 minutos antes do fechamento (RN51), fora das restrições (RN52) e dos
 * períodos fechados por lotação (RN15). Abertura fora do passo (ex: 7h15) começa no seguinte.
 */
export function pickupTimes(
  hours: OpeningHours,
  restrictions: PickupRestriction[],
  closed: { start: string; end: string }[],
): string[] {
  const blocked = [
    ...restrictions.filter((r) => r.weekday === null || r.weekday === hours.weekday),
    ...closed,
  ].map((b) => [toMinutes(b.start), toMinutes(b.end)] as const);

  const first = Math.ceil(toMinutes(hours.open) / PICKUP_STEP_MINUTES) * PICKUP_STEP_MINUTES;
  const last = toMinutes(hours.close) - PICKUP_STEP_MINUTES;
  const times: string[] = [];
  for (let t = first; t <= last; t += PICKUP_STEP_MINUTES) {
    if (!blocked.some(([start, end]) => t >= start && t < end)) times.push(toTime(t));
  }
  return times;
}

/**
 * Dias e horários disponíveis a partir de `now` ('AAAA-MM-DDTHH:MM', horário de Brasília).
 * A antecedência é a maior entre a padrão e a exigida pelos itens do carrinho (RN13, RN14):
 * um horário só aparece se é depois de `now` + antecedência. Data especial conta a partir
 * da meia-noite do dia, já que o horário é combinado depois.
 */
export function availableDays(input: AgendaInput, now: string, itemsLeadHours = 0): AvailableDay[] {
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

    const special = input.specialDates.find((s) => s.date === date);
    if (special) {
      if (dayMs >= earliest) days.push({ date, weekday, special: special.name, times: [] });
      continue;
    }

    const hours = scheduleFor(input.schedules, date)?.hours.find((h) => h.weekday === weekday);
    if (!hours) continue;
    const closed = input.closedPeriods.filter((c) => c.date === date);
    const times = pickupTimes(hours, input.restrictions, closed).filter(
      (t) => wallMs(date, toMinutes(t)) >= earliest,
    );
    if (times.length) days.push({ date, weekday, special: null, times });
  }
  return days;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Sáb 28/11" */
export function formatDay(day: Pick<AvailableDay, 'date' | 'weekday'>): string {
  const [, m, d] = day.date.split('-');
  return `${WEEKDAYS[day.weekday]} ${d}/${m}`;
}
