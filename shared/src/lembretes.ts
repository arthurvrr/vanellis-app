// Lembretes de revisão (RN34–RN36): o painel lembra o operador de revisar o que não tem
// integração com o PDV. Etapa 5 configura a frequência de cada um (RF37, C88); a etapa 7
// mostra os vencidos ao entrar (RF36).

export type ReminderKind = 'cardapio' | 'horario' | 'precos';

export const REMINDERS: { kind: ReminderKind; label: string; help: string; defaultDays: number }[] = [
  {
    kind: 'cardapio',
    label: 'Produtos do cardápio',
    help: 'Conferir o que entrou e saiu de linha e a disponibilidade.',
    defaultDays: 7,
  },
  { kind: 'horario', label: 'Horário de funcionamento', help: 'Conferir horários, folgas e feriados.', defaultDays: 15 },
  { kind: 'precos', label: 'Preços', help: 'Conferir se os preços batem com o PDV.', defaultDays: 30 },
];

export interface ReminderDTO {
  kind: ReminderKind;
  everyDays: number;
  /** Data da última revisão ('AAAA-MM-DD'); `null` = nunca revisado. */
  lastReviewed: string | null;
}

export const REMINDER_MIN_DAYS = 1;
export const REMINDER_MAX_DAYS = 365;

/** Problema na frequência, ou null (C88). */
export function reminderDaysProblem(days: number): string | null {
  if (!Number.isInteger(days) || days < REMINDER_MIN_DAYS || days > REMINDER_MAX_DAYS)
    return `Use de ${REMINDER_MIN_DAYS} a ${REMINDER_MAX_DAYS} dias`;
  return null;
}
