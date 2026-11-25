// Datas 'AAAA-MM-DD', horas 'HH:MM' e dias da semana: o único lugar dessas contas e textos.
// As contas usam uma linha do tempo "de parede", sem fuso (Date.UTC só como calendário): o dia
// e a hora são os do relógio da padaria, e o horário de verão não desloca nada.

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

/** '07:30' → 450 minutos desde a meia-noite. */
export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
};

/** 450 → '07:30'. */
export const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Data (e minutos do dia) como milissegundos na linha do tempo de parede. */
export function dateMs(date: string, minutes = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d) + minutes * MINUTE;
}

/** Milissegundos da linha do tempo de parede → 'AAAA-MM-DD'. */
export const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A data e o dia da semana (0 = domingo) de um instante da linha do tempo de parede. */
export const dayAt = (ms: number) => ({ date: isoDate(ms), weekday: new Date(ms).getUTCDay() });

/** '2026-12-30' + 3 → '2027-01-02'. */
export const addDays = (date: string, days: number) => isoDate(dateMs(date) + days * DAY);

/** Dias de `from` até `to` (negativo se `to` vem antes). */
export const daysBetween = (from: string, to: string) => Math.round((dateMs(to) - dateMs(from)) / DAY);

/** '2026-12-24' → '24/12'. */
export const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

const WEEKDAYS: { name: string; short: string; on: string }[] = [
  { name: 'domingo', short: 'Dom', on: 'No' },
  { name: 'segunda', short: 'Seg', on: 'Na' },
  { name: 'terça', short: 'Ter', on: 'Na' },
  { name: 'quarta', short: 'Qua', on: 'Na' },
  { name: 'quinta', short: 'Qui', on: 'Na' },
  { name: 'sexta', short: 'Sex', on: 'Na' },
  { name: 'sábado', short: 'Sáb', on: 'No' },
];

/** 0 → 'domingo'. */
export const weekdayName = (weekday: number) => WEEKDAYS[weekday]!.name;

/** 0 → 'Dom'. */
export const weekdayShort = (weekday: number) => WEEKDAYS[weekday]!.short;

/** 0 → 'No domingo'; 1 → 'Na segunda'. */
export const onWeekday = (weekday: number) => `${WEEKDAYS[weekday]!.on} ${WEEKDAYS[weekday]!.name}`;
