// Bloqueio por tentativas erradas (cenário C3): 5 erros seguidos no mesmo usuário
// bloqueiam novas tentativas por 15 minutos. Fica na memória do processo: um servidor só
// (RNF14) e, se ele reiniciar, o pior caso é liberar as tentativas antes da hora.

export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

interface Entry {
  failures: number;
  lockedUntil: number;
}

const entries = new Map<string, Entry>();

/** Minutos que faltam de bloqueio (arredondado para cima), ou 0 se pode tentar. */
export function lockedMinutes(username: string, now = Date.now()): number {
  const e = entries.get(username);
  if (!e || e.lockedUntil <= now) return 0;
  return Math.ceil((e.lockedUntil - now) / 60_000);
}

export function registerFailure(username: string, now = Date.now()): void {
  const e = entries.get(username) ?? { failures: 0, lockedUntil: 0 };
  if (e.lockedUntil && e.lockedUntil <= now) e.lockedUntil = 0;
  e.failures += 1;
  if (e.failures >= MAX_FAILURES) {
    e.failures = 0;
    e.lockedUntil = now + LOCK_MINUTES * 60_000;
  }
  entries.set(username, e);
}

export function registerSuccess(username: string): void {
  entries.delete(username);
}

/** Só para testes. */
export function resetAttempts(): void {
  entries.clear();
}
