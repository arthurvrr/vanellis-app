// Lembretes de revisão (RN34–RN36): o painel lembra o operador de revisar o que não tem
// integração com o PDV. Etapa 5 configura a frequência de cada um (RF37, C88); a etapa 7
// mostra os vencidos ao entrar (RF36).

export type ReminderKind = 'cardapio' | 'horario' | 'precos';

export const REMINDERS: {
  kind: ReminderKind;
  label: string;
  help: string;
  defaultDays: number;
  /** Tela do painel onde se faz a revisão (RF36). */
  href: string;
  screen: string;
}[] = [
  {
    kind: 'cardapio',
    label: 'Produtos do cardápio',
    help: 'Conferir o que entrou e saiu de linha e a disponibilidade.',
    defaultDays: 7,
    href: '#produtos',
    screen: 'Lista de produtos',
  },
  {
    kind: 'horario',
    label: 'Horário de funcionamento',
    help: 'Conferir horários, folgas e feriados.',
    defaultDays: 15,
    href: '#agenda/horario',
    screen: 'Agenda',
  },
  {
    kind: 'precos',
    label: 'Preços',
    help: 'Conferir se os preços batem com o PDV.',
    defaultDays: 30,
    href: '#precos',
    screen: 'Preços',
  },
];

export interface ReminderDTO {
  kind: ReminderKind;
  everyDays: number;
  /** Data da última revisão ('AAAA-MM-DD'); `null` = nunca revisado. */
  lastReviewed: string | null;
}

/** O que o painel recebe: o lembrete e a situação dele hoje. */
export interface ReminderWithStatus extends ReminderDTO {
  status: ReminderStatus;
}

export const REMINDER_MIN_DAYS = 1;
export const REMINDER_MAX_DAYS = 365;

/** Problema na frequência, ou null (C88). */
export function reminderDaysProblem(days: number): string | null {
  if (!Number.isInteger(days) || days < REMINDER_MIN_DAYS || days > REMINDER_MAX_DAYS)
    return `Use de ${REMINDER_MIN_DAYS} a ${REMINDER_MAX_DAYS} dias`;
  return null;
}

const DAY_MS = 86_400_000;
const dayMs = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface ReminderStatus {
  kind: ReminderKind;
  /** Data em que a revisão vence ('AAAA-MM-DD'); nunca revisado = hoje. */
  dueDate: string;
  /** Venceu (hoje ou antes): aparece no Início (RF36, C89). */
  due: boolean;
  /** Dias de atraso (0 = vence hoje) ou dias que faltam, conforme `due`. */
  days: number;
}

/** Situação de um lembrete hoje (RN35): vence `everyDays` depois da última revisão. */
export function reminderStatus(r: ReminderDTO, today: string): ReminderStatus {
  const dueDate = r.lastReviewed ? toDate(dayMs(r.lastReviewed) + r.everyDays * DAY_MS) : today;
  const diff = Math.round((dayMs(dueDate) - dayMs(today)) / DAY_MS);
  return { kind: r.kind, dueDate, due: diff <= 0, days: Math.abs(diff) };
}

/** "vence hoje", "vencida há 1 dia", "vencida há 3 dias". */
export function overdueText(s: ReminderStatus): string {
  if (!s.due) return s.days === 1 ? 'vence amanhã' : `vence em ${s.days} dias`;
  if (s.days === 0) return 'vence hoje';
  return s.days === 1 ? 'vencida há 1 dia' : `vencida há ${s.days} dias`;
}
