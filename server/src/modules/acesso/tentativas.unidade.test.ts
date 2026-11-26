// Cenário C3 e item G07, em unidade (sem servidor nem banco). Os testes de API (acesso.test.ts)
// conferem o mesmo pela rota de login.
//   - 5 erros em 15 minutos no mesmo usuário, vindos do mesmo IP, bloqueiam esse usuário nesse IP
//     por 15 minutos (outro IP não bloqueia o dono da conta);
//   - 20 erros em 15 minutos de um IP, em qualquer usuário, bloqueiam o IP por 15 minutos;
//   - entradas vencidas saem da memória.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LOCK_MINUTES,
  MAX_FAILURES,
  MAX_IP_FAILURES,
  lockedMinutes,
  registerFailure,
  registerSuccess,
  resetAttempts,
  trackedEntries,
} from './tentativas';

const MIN = 60_000;
const T0 = 1_800_000_000_000;
const IP = '203.0.113.7';
const OUTRO_IP = '198.51.100.9';

function errar(usuario: string, vezes: number, now = T0, ip = IP) {
  for (let i = 0; i < vezes; i++) registerFailure(ip, usuario, now);
}

beforeEach(() => resetAttempts());

describe('bloqueio do usuário (C3)', () => {
  it('são 5 erros, 20 por IP e 15 minutos', () => {
    expect(MAX_FAILURES).toBe(5);
    expect(MAX_IP_FAILURES).toBe(20);
    expect(LOCK_MINUTES).toBe(15);
  });

  it('usuário sem erros pode tentar', () => {
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(0);
  });

  it('4 erros ainda deixam tentar; o 5º bloqueia por 15 minutos', () => {
    errar('padaria', 4);
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(0);
    registerFailure(IP, 'padaria', T0);
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(15);
  });

  it('conta os minutos que faltam arredondando para cima, e libera no instante exato', () => {
    errar('padaria', 5);
    expect(lockedMinutes(IP, 'padaria', T0 + 1)).toBe(15);
    expect(lockedMinutes(IP, 'padaria', T0 + 14 * MIN)).toBe(1);
    expect(lockedMinutes(IP, 'padaria', T0 + 14 * MIN + 1)).toBe(1);
    expect(lockedMinutes(IP, 'padaria', T0 + 15 * MIN - 1)).toBe(1);
    expect(lockedMinutes(IP, 'padaria', T0 + 15 * MIN)).toBe(0);
  });

  it('depois do bloqueio, a contagem recomeça do zero', () => {
    errar('padaria', 5);
    const depois = T0 + 15 * MIN;
    errar('padaria', 4, depois);
    expect(lockedMinutes(IP, 'padaria', depois)).toBe(0);
    registerFailure(IP, 'padaria', depois);
    expect(lockedMinutes(IP, 'padaria', depois)).toBe(15);
  });

  it('um erro durante o bloqueio não libera nem estende o bloqueio', () => {
    errar('padaria', 5);
    registerFailure(IP, 'padaria', T0 + 5 * MIN);
    expect(lockedMinutes(IP, 'padaria', T0 + 5 * MIN)).toBe(10);
    // Nem conta para o próximo: logo depois do fim, 4 erros ainda deixam tentar.
    errar('padaria', 4, T0 + 15 * MIN);
    expect(lockedMinutes(IP, 'padaria', T0 + 15 * MIN)).toBe(0);
  });

  it('erros com mais de 15 minutos não se somam aos novos', () => {
    errar('padaria', 4);
    errar('padaria', 1, T0 + 15 * MIN);
    expect(lockedMinutes(IP, 'padaria', T0 + 15 * MIN)).toBe(0);
  });

  it('erros dentro dos 15 minutos se somam, até o último instante', () => {
    errar('padaria', 4);
    errar('padaria', 1, T0 + 15 * MIN - 1);
    expect(lockedMinutes(IP, 'padaria', T0 + 15 * MIN - 1)).toBe(15);
  });

  it('um acerto zera os erros acumulados', () => {
    errar('padaria', 4);
    registerSuccess(IP, 'padaria');
    errar('padaria', 4);
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(0);
  });

  it('o acerto só zera aquele usuário naquele IP', () => {
    errar('padaria', 4);
    errar('padaria', 4, T0, OUTRO_IP);
    registerSuccess(OUTRO_IP, 'padaria');
    registerFailure(IP, 'padaria', T0);
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(15);
  });

  it('cada usuário tem a sua contagem', () => {
    errar('padaria', 5);
    expect(lockedMinutes(IP, 'arthur', T0)).toBe(0);
    errar('arthur', 4);
    expect(lockedMinutes(IP, 'arthur', T0)).toBe(0);
  });

  it('G07: 5 erros de um IP não bloqueiam o mesmo usuário vindo de outro IP', () => {
    errar('padaria', 5);
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(15);
    expect(lockedMinutes(OUTRO_IP, 'padaria', T0)).toBe(0);
  });

  it('o separador entre IP e usuário não junta contagens diferentes', () => {
    errar('b', 4, T0, 'a');
    errar('', 1, T0, 'a\nb');
    errar('', 1, T0, '["a","b"]');
    expect(lockedMinutes('a', 'b', T0)).toBe(0);
  });

  it('resetAttempts libera todo mundo', () => {
    errar('padaria', 5);
    resetAttempts();
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(0);
  });
});

describe('limite por IP (G07)', () => {
  const nomes = (n: number) => Array.from({ length: n }, (_, i) => `inventado${i}`);

  it('19 erros em usuários diferentes ainda deixam tentar; o 20º bloqueia o IP inteiro por 15 minutos', () => {
    for (const nome of nomes(19)) registerFailure(IP, nome, T0);
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(0);
    registerFailure(IP, 'mais-um', T0);
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(15);
    expect(lockedMinutes(IP, 'padaria', T0 + 15 * MIN)).toBe(0);
  });

  it('o bloqueio do IP não atinge outro IP', () => {
    for (const nome of nomes(20)) registerFailure(IP, nome, T0);
    expect(lockedMinutes(OUTRO_IP, 'padaria', T0)).toBe(0);
  });

  it('um acerto não zera a contagem do IP', () => {
    for (const nome of nomes(19)) registerFailure(IP, nome, T0);
    registerSuccess(IP, 'inventado0');
    registerFailure(IP, 'mais-um', T0);
    expect(lockedMinutes(IP, 'padaria', T0)).toBe(15);
  });

  it('vale o bloqueio mais longo entre o do usuário e o do IP', () => {
    errar('padaria', 5, T0);
    for (const nome of nomes(15)) registerFailure(IP, nome, T0 + 10 * MIN);
    expect(lockedMinutes(IP, 'padaria', T0 + 10 * MIN)).toBe(15);
    expect(lockedMinutes(IP, 'outro', T0 + 10 * MIN)).toBe(15);
    expect(lockedMinutes(IP, 'padaria', T0 + 16 * MIN)).toBe(9);
  });
});

describe('limpeza da memória (G07)', () => {
  it('entradas de nomes inventados saem depois de 15 minutos sem erro', () => {
    errar('fulano', 1);
    errar('beltrano', 1);
    expect(trackedEntries()).toBe(3); // dois usuários e o IP
    errar('outro', 1, T0 + 15 * MIN - 1);
    expect(trackedEntries()).toBe(4);
    errar('outro', 1, T0 + 15 * MIN);
    // fulano e beltrano venceram; o IP e "outro" seguem (erros recentes).
    expect(trackedEntries()).toBe(2);
  });

  it('um bloqueio em andamento não sai da memória, mesmo com o primeiro erro antigo', () => {
    errar('padaria', 4, T0);
    errar('padaria', 1, T0 + 14 * MIN);
    registerFailure(IP, 'outro', T0 + 20 * MIN);
    expect(lockedMinutes(IP, 'padaria', T0 + 20 * MIN)).toBe(9);
  });

  it('o bloqueio sai da memória no instante em que termina', () => {
    errar('padaria', 5, T0);
    registerFailure(OUTRO_IP, 'x', T0 + 15 * MIN - 1);
    expect(trackedEntries()).toBe(4);
    registerFailure(OUTRO_IP, 'x', T0 + 15 * MIN);
    expect(trackedEntries()).toBe(2);
  });
});
