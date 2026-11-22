// Agenda de retirada (RN12–RN15, RN20, RN31, RN32): quais dias e faixas o cliente pode escolher.
// Datas em 'AAAA-MM-DD' e horas em 'HH:MM', sempre no horário de Brasília (sem horário de verão).

export interface PickupSlot {
  start: string;
  end: string;
}

/** Horário semanal em vigor a partir de uma data e, opcionalmente, até uma data (RN31). */
export interface WeeklySchedule {
  validFrom: string;
  validUntil: string | null;
  /** weekday: 0 = domingo … 6 = sábado. Dia sem faixas = loja fechada (RN32). */
  slots: (PickupSlot & { weekday: number })[];
}

export interface AgendaInput {
  schedules: WeeklySchedule[];
  /** Datas sem retirada (feriados, folgas). */
  blockedDates: string[];
  /** Faixas fechadas num dia específico, por lotação (RN15). */
  closedSlots: { date: string; start: string }[];
  /** Datas especiais: só o dia, horário combinado pelo operador (RN20). */
  specialDates: { date: string; name: string }[];
  /** Antecedência mínima padrão em horas (RN13). */
  minLeadHours: number;
  /** Quantos dias à frente o cliente pode escolher. */
  windowDays: number;
}

export interface AvailableDay {
  date: string;
  weekday: number;
  /** Nome da data especial; nela não há escolha de horário (RN20). */
  special: string | null;
  slots: PickupSlot[];
}

export interface AgendaDTO {
  /** Recebimento de pedidos pausado pelo operador (RN11). */
  paused: boolean;
  leadHours: number;
  days: AvailableDay[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Data e hora de parede como milissegundos numa linha do tempo sem fuso. */
function wallMs(date: string, time = '00:00'): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return Date.UTC(y!, m! - 1, d!, h!, min!);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
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
 * Dias e faixas disponíveis a partir de `now` ('AAAA-MM-DDTHH:MM', horário de Brasília).
 * A antecedência é a maior entre a padrão e a exigida pelos itens do carrinho (RN13, RN14):
 * uma faixa só aparece se começa depois de `now` + antecedência. Data especial conta a partir
 * da meia-noite do dia, já que o horário é combinado depois.
 */
export function availableDays(input: AgendaInput, now: string, itemsLeadHours = 0): AvailableDay[] {
  const [today, time] = now.split('T') as [string, string];
  const earliest = wallMs(today, time) + Math.max(input.minLeadHours, itemsLeadHours) * HOUR;
  const blocked = new Set(input.blockedDates);
  const days: AvailableDay[] = [];

  for (let i = 0; i <= input.windowDays; i++) {
    const dayMs = wallMs(today) + i * DAY;
    const date = isoDate(dayMs);
    const weekday = new Date(dayMs).getUTCDay();
    if (blocked.has(date)) continue;

    const special = input.specialDates.find((s) => s.date === date);
    if (special) {
      if (dayMs >= earliest) days.push({ date, weekday, special: special.name, slots: [] });
      continue;
    }

    const schedule = scheduleFor(input.schedules, date);
    const slots = (schedule?.slots ?? [])
      .filter((s) => s.weekday === weekday)
      .filter((s) => !input.closedSlots.some((c) => c.date === date && c.start === s.start))
      .filter((s) => wallMs(date, s.start) >= earliest)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(({ start, end }) => ({ start, end }));
    if (slots.length) days.push({ date, weekday, special: null, slots });
  }
  return days;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Sáb 28/11" */
export function formatDay(day: Pick<AvailableDay, 'date' | 'weekday'>): string {
  const [, m, d] = day.date.split('-');
  return `${WEEKDAYS[day.weekday]} ${d}/${m}`;
}

/** "08:00–10:00" */
export function formatSlot(slot: PickupSlot): string {
  return `${slot.start}–${slot.end}`;
}
