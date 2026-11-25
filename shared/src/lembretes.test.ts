// Cenários C89–C91 (etapa 7): lembretes de revisão vencidos.
import { describe, expect, it } from 'vitest';
import { REMINDERS, overdueText, reminderDaysProblem, reminderStatus } from './lembretes';

const precos = (lastReviewed: string | null) => ({ kind: 'precos' as const, everyDays: 30, lastReviewed });

describe('reminderStatus', () => {
  it('C89: revisado há 31 dias com frequência 30 está vencido há 1 dia', () => {
    const s = reminderStatus(precos('2026-10-23'), '2026-11-23');
    expect(s).toEqual({ kind: 'precos', dueDate: '2026-11-22', due: true, days: 1 });
    expect(overdueText(s)).toBe('vencida há 1 dia');
  });
  it('vence no dia exato', () => {
    const s = reminderStatus(precos('2026-10-24'), '2026-11-23');
    expect(s.due).toBe(true);
    expect(overdueText(s)).toBe('vence hoje');
  });
  it('C90, C91: revisado hoje, vence daqui a 30 dias', () => {
    const s = reminderStatus(precos('2026-11-23'), '2026-11-23');
    expect(s).toEqual({ kind: 'precos', dueDate: '2026-12-23', due: false, days: 30 });
    expect(overdueText(s)).toBe('vence em 30 dias');
    expect(overdueText(reminderStatus(precos('2026-10-25'), '2026-11-23'))).toBe('vence amanhã');
  });
  it('nunca revisado vence hoje', () => {
    expect(reminderStatus(precos(null), '2026-11-23')).toMatchObject({ due: true, dueDate: '2026-11-23' });
  });
  it('atravessa meses e o horário de verão sem errar o dia', () => {
    expect(reminderStatus({ kind: 'horario', everyDays: 15, lastReviewed: '2026-02-20' }, '2026-03-07').due).toBe(true);
    expect(reminderStatus({ kind: 'horario', everyDays: 15, lastReviewed: '2026-02-20' }, '2026-03-06').due).toBe(false);
  });
});

describe('reminderDaysProblem (C88)', () => {
  it('aceita de 1 a 365 dias, inteiros', () => {
    for (const d of [1, 2, 30, 364, 365]) expect(reminderDaysProblem(d)).toBeNull();
  });
  it('recusa fora da faixa, fração e vazio, com a faixa na mensagem', () => {
    for (const d of [0, -1, 366, 1.5, Number.NaN]) expect(reminderDaysProblem(d)).toBe('Use de 1 a 365 dias');
  });
});

describe('overdueText', () => {
  it('plural do atraso', () => {
    expect(overdueText({ kind: 'precos', dueDate: '2026-11-20', due: true, days: 3 })).toBe('vencida há 3 dias');
  });
});

describe('REMINDERS', () => {
  it('cada lembrete leva para a tela da revisão, com a frequência padrão (RF36, RN35)', () => {
    expect(REMINDERS.map(({ kind, defaultDays, href }) => ({ kind, defaultDays, href }))).toEqual([
      { kind: 'cardapio', defaultDays: 7, href: '#produtos' },
      { kind: 'horario', defaultDays: 15, href: '#agenda/horario' },
      { kind: 'precos', defaultDays: 30, href: '#precos' },
    ]);
  });
});
