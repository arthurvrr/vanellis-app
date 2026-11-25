// Cenário C3, em unidade (sem servidor nem banco): 5 erros seguidos no mesmo usuário bloqueiam
// por 15 minutos. Os testes de API (acesso.test.ts) conferem o mesmo pela rota de login.
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCK_MINUTES, MAX_FAILURES, lockedMinutes, registerFailure, registerSuccess, resetAttempts } from './tentativas';

const MIN = 60_000;
const T0 = 1_800_000_000_000;

function errar(usuario: string, vezes: number, now = T0) {
  for (let i = 0; i < vezes; i++) registerFailure(usuario, now);
}

beforeEach(() => resetAttempts());

describe('bloqueio por tentativas (C3)', () => {
  it('são 5 erros e 15 minutos', () => {
    expect(MAX_FAILURES).toBe(5);
    expect(LOCK_MINUTES).toBe(15);
  });

  it('usuário sem erros pode tentar', () => {
    expect(lockedMinutes('padaria', T0)).toBe(0);
  });

  it('4 erros ainda deixam tentar; o 5º bloqueia por 15 minutos', () => {
    errar('padaria', 4);
    expect(lockedMinutes('padaria', T0)).toBe(0);
    registerFailure('padaria', T0);
    expect(lockedMinutes('padaria', T0)).toBe(15);
  });

  it('conta os minutos que faltam arredondando para cima, e libera no instante exato', () => {
    errar('padaria', 5);
    expect(lockedMinutes('padaria', T0 + 1)).toBe(15);
    expect(lockedMinutes('padaria', T0 + 14 * MIN)).toBe(1);
    expect(lockedMinutes('padaria', T0 + 14 * MIN + 1)).toBe(1);
    expect(lockedMinutes('padaria', T0 + 15 * MIN - 1)).toBe(1);
    expect(lockedMinutes('padaria', T0 + 15 * MIN)).toBe(0);
  });

  it('depois do bloqueio, a contagem recomeça do zero', () => {
    errar('padaria', 5);
    const depois = T0 + 15 * MIN;
    errar('padaria', 4, depois);
    expect(lockedMinutes('padaria', depois)).toBe(0);
    registerFailure('padaria', depois);
    expect(lockedMinutes('padaria', depois)).toBe(15);
  });

  it('um erro durante o bloqueio não libera nem estende o bloqueio', () => {
    errar('padaria', 5);
    registerFailure('padaria', T0 + 5 * MIN);
    expect(lockedMinutes('padaria', T0 + 5 * MIN)).toBe(10);
  });

  it('um acerto zera os erros acumulados', () => {
    errar('padaria', 4);
    registerSuccess('padaria');
    errar('padaria', 4);
    expect(lockedMinutes('padaria', T0)).toBe(0);
  });

  it('cada usuário tem a sua contagem', () => {
    errar('padaria', 5);
    expect(lockedMinutes('arthur', T0)).toBe(0);
    errar('arthur', 4);
    expect(lockedMinutes('arthur', T0)).toBe(0);
  });

  it('resetAttempts libera todo mundo', () => {
    errar('padaria', 5);
    resetAttempts();
    expect(lockedMinutes('padaria', T0)).toBe(0);
  });
});
