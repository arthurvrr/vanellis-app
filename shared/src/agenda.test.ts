import { describe, expect, it } from 'vitest';
import {
  availableDays,
  statusLabel,
  storeStatus,
  weekSummary,
  lastBookableDate,
  formatDay,
  pickupTimes,
  type AgendaInput,
  type PickupRestriction,
  type WeeklySchedule,
} from './agenda';

// Segunda a sábado das 7h30 às 19h; domingo fechado.
const semana: WeeklySchedule = {
  validFrom: '2026-01-01',
  validUntil: null,
  hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:30', close: '19:00' })),
};

// Os dois exemplos da padaria: retirada só a partir das 8h30 e sem retirada no almoço.
const restricoes: PickupRestriction[] = [
  { weekday: null, start: '00:00', end: '08:30' },
  { weekday: null, start: '12:00', end: '14:00' },
];

const base: AgendaInput = {
  schedules: [semana],
  restrictions: [],
  blockedDates: [],
  closedPeriods: [],
  specialDates: [],
  minLeadHours: 2,
  windowMonths: 4,
};

describe('pickupTimes', () => {
  const dia = { weekday: 1, open: '07:30', close: '19:00' };

  it('vai da abertura a 30 minutos antes do fechamento, de 30 em 30 (RN51)', () => {
    const times = pickupTimes(dia, [], []);
    expect(times[0]).toBe('07:30');
    expect(times.at(-1)).toBe('18:30');
    expect(times).toHaveLength(23);
  });

  it('segue o fechamento definido pelo operador', () => {
    expect(pickupTimes({ ...dia, close: '17:00' }, [], []).at(-1)).toBe('16:30');
  });

  it('aplica "retirada a partir de" e intervalo sem retirada (RN52)', () => {
    const times = pickupTimes(dia, restricoes, []);
    expect(times.slice(0, 2)).toEqual(['08:30', '09:00']);
    expect(times).toContain('11:30');
    expect(times).not.toContain('12:00');
    expect(times).not.toContain('13:30');
    expect(times).toContain('14:00');
  });

  it('restrição de um dia da semana não afeta os outros', () => {
    const sabado: PickupRestriction = { weekday: 6, start: '15:00', end: '19:00' };
    expect(pickupTimes({ ...dia, weekday: 6 }, [sabado], []).at(-1)).toBe('14:30');
    expect(pickupTimes(dia, [sabado], []).at(-1)).toBe('18:30');
  });

  it('tira o período fechado por lotação, de um horário ou de vários (RN15)', () => {
    const times = pickupTimes(dia, [], [
      { start: '09:30', end: '10:00' },
      { start: '15:00', end: '16:30' },
    ]);
    expect(times).toContain('09:00');
    expect(times).not.toContain('09:30');
    expect(times).toContain('10:00');
    expect(times.filter((t) => t >= '15:00' && t < '16:30')).toEqual([]);
    expect(times).toContain('16:30');
  });

  it('abertura fora do passo começa no próximo horário cheio ou meia', () => {
    expect(pickupTimes({ ...dia, open: '07:15' }, [], [])[0]).toBe('07:30');
  });
});

describe('availableDays', () => {
  it('só mostra horários depois da antecedência mínima (RN13)', () => {
    // Segunda 23/11, 9h10 + 2h = 11h10: o primeiro horário é 11h30.
    const [segunda] = availableDays({ ...base, restrictions: restricoes }, '2026-11-23T09:10');
    expect(segunda?.date).toBe('2026-11-23');
    expect(segunda?.times[0]).toBe('11:30');
    expect(segunda?.times[1]).toBe('14:00');
  });

  it('usa a antecedência maior exigida pelos itens (RN14) e pula o domingo fechado (RN32)', () => {
    // Sábado 28/11 às 18h + 24h = domingo 18h: domingo fechado, segunda inteira.
    const days = availableDays(base, '2026-11-28T18:00', 24);
    expect(days[0]?.date).toBe('2026-11-30');
    expect(days[0]?.times[0]).toBe('07:30');
  });

  it('tira datas bloqueadas e aplica a mudança programada só no período dela (RN31)', () => {
    const terçaCurta: WeeklySchedule = {
      validFrom: '2026-11-24',
      validUntil: '2026-11-24',
      hours: [{ weekday: 2, open: '08:00', close: '12:00' }],
    };
    const days = availableDays(
      { ...base, schedules: [semana, terçaCurta], blockedDates: ['2026-11-25'] },
      '2026-11-23T07:00',
    );
    expect(days.slice(0, 3).map((d) => d.date)).toEqual(['2026-11-23', '2026-11-24', '2026-11-26']);
    expect(days[1]?.times.at(-1)).toBe('11:30');
  });

  it('data especial aparece sem horários, se der tempo até o início do dia (RN20)', () => {
    const input: AgendaInput = { ...base, specialDates: [{ date: '2026-12-24', name: 'Véspera de Natal' }] };
    expect(availableDays(input, '2026-12-22T10:00').find((d) => d.date === '2026-12-24')).toEqual({
      date: '2026-12-24',
      weekday: 4,
      special: 'Véspera de Natal',
      times: [],
    });
    expect(availableDays(input, '2026-12-22T10:00', 48).map((d) => d.date)).not.toContain('2026-12-24');
  });

  it('vai até 4 meses a partir de hoje, inclusive (RN53)', () => {
    const days = availableDays(base, '2026-11-23T07:00');
    expect(days.at(-1)?.date).toBe('2027-03-23');
    expect(days.map((d) => d.date)).toContain('2026-12-24');
  });
});

describe('lastBookableDate', () => {
  it('soma meses de calendário (RN53)', () => {
    expect(lastBookableDate('2026-11-22', 4)).toBe('2027-03-22');
    expect(lastBookableDate('2026-01-15', 1)).toBe('2026-02-15');
  });

  it('usa o último dia do mês quando o dia não existe nele', () => {
    expect(lastBookableDate('2026-10-31', 4)).toBe('2027-02-28');
    expect(lastBookableDate('2027-10-31', 4)).toBe('2028-02-29');
  });
});

describe('formatDay', () => {
  it('mostra dia da semana e data', () => {
    expect(formatDay({ date: '2026-11-28', weekday: 6 })).toBe('Sáb 28/11');
  });
});

describe('situação da loja na entrada', () => {
  const semana = {
    validFrom: '2026-01-01',
    validUntil: null,
    hours: [
      { weekday: 0, open: '07:30', close: '12:00' },
      ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:30', close: '19:00' })),
    ],
  };
  const input = { schedules: [semana], blockedDates: ['2026-11-25'] };

  it('aberta: mostra até quando', () => {
    const s = storeStatus(input, '2026-11-23T10:00');
    expect(s).toEqual({ open: true, closesAt: '19:00', nextOpen: null });
    expect(statusLabel(s, '2026-11-23')).toBe('Aberto agora · fecha às 19h');
  });

  it('antes de abrir: abre hoje', () => {
    expect(statusLabel(storeStatus(input, '2026-11-23T06:00'), '2026-11-23')).toBe('Fechado · abre hoje às 7h30');
  });

  it('depois de fechar: abre amanhã', () => {
    expect(statusLabel(storeStatus(input, '2026-11-23T19:00'), '2026-11-23')).toBe('Fechado · abre amanhã às 7h30');
  });

  it('pula data bloqueada', () => {
    // Terça 24 à noite: quarta 25 está bloqueada, abre quinta.
    expect(statusLabel(storeStatus(input, '2026-11-24T20:00'), '2026-11-24')).toBe('Fechado · abre qui às 7h30');
  });

  it('resume a semana juntando dias iguais', () => {
    expect(weekSummary(semana.hours)).toBe('Seg a sáb 7h30–19h · Dom 7h30–12h');
    expect(weekSummary(semana.hours.filter((h) => h.weekday !== 0))).toBe('Seg a sáb 7h30–19h');
    expect(weekSummary([{ weekday: 6, open: '08:00', close: '13:00' }, { weekday: 0, open: '08:00', close: '13:00' }])).toBe(
      'Sáb e dom 8h–13h',
    );
  });
});
