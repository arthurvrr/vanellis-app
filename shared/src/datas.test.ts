// Datas, horas e dias da semana (datas.ts): o único lugar dessas contas e textos.
import { describe, expect, it } from 'vitest';
import {
  addDays,
  DAY,
  dateMs,
  dayAt,
  daysBetween,
  isoDate,
  MINUTE,
  onWeekday,
  shortDate,
  toMinutes,
  toTime,
  weekdayName,
  weekdayShort,
} from './datas';

describe('horas', () => {
  it('toMinutes e toTime são inversas', () => {
    expect(toMinutes('07:30')).toBe(450);
    expect(toMinutes('00:00')).toBe(0);
    expect(toTime(450)).toBe('07:30');
    expect(toTime(1439)).toBe('23:59');
    expect(toTime(toMinutes('19:05'))).toBe('19:05');
  });
});

describe('datas na linha do tempo de parede', () => {
  it('dateMs conta dia e minutos, sem fuso', () => {
    expect(MINUTE).toBe(60_000);
    expect(DAY).toBe(86_400_000);
    expect(dateMs('2026-11-24')).toBe(Date.UTC(2026, 10, 24));
    expect(dateMs('2026-11-24', 90)).toBe(Date.UTC(2026, 10, 24, 1, 30));
  });

  it('isoDate e dayAt voltam para a data e o dia da semana', () => {
    expect(isoDate(dateMs('2026-11-24', 23 * 60 + 59))).toBe('2026-11-24');
    expect(dayAt(dateMs('2026-11-29'))).toEqual({ date: '2026-11-29', weekday: 0 });
    expect(dayAt(dateMs('2026-11-28'))).toEqual({ date: '2026-11-28', weekday: 6 });
  });

  it('addDays atravessa mês, ano e o horário de verão', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2018-11-03', 1)).toBe('2018-11-04');
    expect(addDays('2026-11-24', 0)).toBe('2026-11-24');
  });

  it('daysBetween conta para frente e para trás', () => {
    expect(daysBetween('2026-11-24', '2026-12-24')).toBe(30);
    expect(daysBetween('2026-12-24', '2026-11-24')).toBe(-30);
    expect(daysBetween('2026-11-24', '2026-11-24')).toBe(0);
  });

  it('shortDate mostra dia/mês', () => {
    expect(shortDate('2027-01-02')).toBe('02/01');
    expect(shortDate('2026-12-24')).toBe('24/12');
  });
});

describe('dias da semana', () => {
  it.each([
    [0, 'domingo', 'Dom', 'No domingo'],
    [1, 'segunda', 'Seg', 'Na segunda'],
    [2, 'terça', 'Ter', 'Na terça'],
    [3, 'quarta', 'Qua', 'Na quarta'],
    [4, 'quinta', 'Qui', 'Na quinta'],
    [5, 'sexta', 'Sex', 'Na sexta'],
    [6, 'sábado', 'Sáb', 'No sábado'],
  ])('dia %i: %s, %s, %s', (wd, nome, curto, comArtigo) => {
    expect(weekdayName(wd)).toBe(nome);
    expect(weekdayShort(wd)).toBe(curto);
    expect(onWeekday(wd)).toBe(comArtigo);
  });
});
