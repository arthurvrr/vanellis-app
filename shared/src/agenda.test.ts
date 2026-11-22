import { describe, expect, it } from 'vitest';
import { availableDays, formatDay, type AgendaInput, type WeeklySchedule } from './agenda';

// Segunda a sábado, três faixas; domingo fechado.
const semana: WeeklySchedule = {
  validFrom: '2026-01-01',
  validUntil: null,
  slots: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, start: '08:00', end: '10:00' },
    { weekday, start: '10:00', end: '12:00' },
    { weekday, start: '14:00', end: '16:00' },
  ]),
};

const base: AgendaInput = {
  schedules: [semana],
  blockedDates: [],
  closedSlots: [],
  specialDates: [],
  minLeadHours: 2,
  windowDays: 2,
};

const resumo = (days: ReturnType<typeof availableDays>) =>
  days.map((d) => `${d.date} ${d.special ?? d.slots.map((s) => s.start).join(',')}`);

describe('availableDays', () => {
  it('só mostra faixas que começam depois da antecedência mínima (RN13)', () => {
    // Segunda 23/11, 9h30 + 2h = 11h30: sobra só a faixa das 14h na segunda.
    expect(resumo(availableDays(base, '2026-11-23T09:30'))).toEqual([
      '2026-11-23 14:00',
      '2026-11-24 08:00,10:00,14:00',
      '2026-11-25 08:00,10:00,14:00',
    ]);
  });

  it('usa a antecedência maior exigida pelos itens do carrinho (RN14)', () => {
    // 48h a partir de segunda 9h30 = quarta 9h30.
    const days = availableDays({ ...base, windowDays: 3 }, '2026-11-23T09:30', 48);
    expect(resumo(days)).toEqual(['2026-11-25 10:00,14:00', '2026-11-26 08:00,10:00,14:00']);
  });

  it('tira datas bloqueadas, faixas fechadas por lotação e dias sem faixas (RN15, RN32)', () => {
    const input: AgendaInput = {
      ...base,
      windowDays: 6,
      blockedDates: ['2026-11-25'],
      closedSlots: [{ date: '2026-11-24', start: '10:00' }],
    };
    const days = availableDays(input, '2026-11-23T07:00');
    expect(days.map((d) => d.date)).toEqual(['2026-11-23', '2026-11-24', '2026-11-26', '2026-11-27', '2026-11-28']);
    expect(days[1]?.slots.map((s) => s.start)).toEqual(['08:00', '14:00']);
  });

  it('aplica a mudança programada de horário só no período dela (RN31)', () => {
    const terçaCurta: WeeklySchedule = {
      validFrom: '2026-11-24',
      validUntil: '2026-11-24',
      slots: [{ weekday: 2, start: '08:00', end: '10:00' }],
    };
    const days = availableDays({ ...base, schedules: [semana, terçaCurta] }, '2026-11-23T07:00');
    expect(resumo(days)).toEqual([
      '2026-11-23 10:00,14:00',
      '2026-11-24 08:00',
      '2026-11-25 08:00,10:00,14:00',
    ]);
  });

  it('data especial aparece sem faixas, se der tempo até o início do dia (RN20)', () => {
    const input: AgendaInput = { ...base, specialDates: [{ date: '2026-12-24', name: 'Véspera de Natal' }] };
    expect(resumo(availableDays(input, '2026-12-22T10:00')).at(-1)).toBe('2026-12-24 Véspera de Natal');
    expect(resumo(availableDays(input, '2026-12-22T10:00', 48))).not.toContain('2026-12-24 Véspera de Natal');
  });
});

describe('formatDay', () => {
  it('mostra dia da semana e data', () => {
    expect(formatDay({ date: '2026-11-28', weekday: 6 })).toBe('Sáb 28/11');
  });
});
