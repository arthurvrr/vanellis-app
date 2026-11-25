// Conversões entre o banco e a aplicação (conversao.ts), em unidade.
import { describe, expect, it } from 'vitest';
import { hm, kg, money, num } from './conversao';

describe('conversões do banco', () => {
  it('numeric do banco vira número; null continua null', () => {
    expect(num('12.50')).toBe(12.5);
    expect(num('0')).toBe(0);
    expect(num(null)).toBeNull();
  });

  it('reais com 2 casas e kg com 3; sem valor vira null', () => {
    expect(money(12.5)).toBe('12.50');
    expect(money(0)).toBe('0.00');
    expect(money(null)).toBeNull();
    expect(money(undefined)).toBeNull();
    expect(kg(1.25)).toBe('1.250');
    expect(kg(0)).toBe('0.000');
    expect(kg(null)).toBeNull();
    expect(kg(undefined)).toBeNull();
  });

  it('time do banco vira HH:MM', () => {
    expect(hm('07:30:00')).toBe('07:30');
    expect(hm('19:00')).toBe('19:00');
  });
});
