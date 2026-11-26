// Bloqueio por tentativas erradas (cenário C3, item G07). Duas contagens, cada uma numa janela de
// 15 minutos a partir do primeiro erro:
//   - IP + usuário: 5 erros bloqueiam aquele usuário vindo daquele IP por 15 minutos. Quem erra
//     de outro lugar não impede o dono da conta de entrar;
//   - só o IP: 20 erros, em qualquer usuário, bloqueiam o IP por 15 minutos. A rota confere o
//     bloqueio antes de verificar a senha, então um IP bloqueado não ocupa a CPU com o scrypt.
// Fica na memória do processo: um servidor só (RNF14) e, se ele reiniciar, o pior caso é liberar
// as tentativas antes da hora. As entradas vencidas saem a cada erro novo, então nomes inventados
// não acumulam.

export const MAX_FAILURES = 5;
export const MAX_IP_FAILURES = 20;
export const LOCK_MINUTES = 15;
const WINDOW = LOCK_MINUTES * 60_000;

interface Entry {
  failures: number;
  /** Instante do primeiro erro da janela. */
  since: number;
  lockedUntil: number;
}

const entries = new Map<string, Entry>();

// JSON: nenhum IP ou nome de usuário consegue formar a chave de outra contagem.
const userKey = (ip: string, username: string) => JSON.stringify([ip, username]);
const ipKey = (ip: string) => JSON.stringify([ip]);

function remaining(e: Entry | undefined, now: number): number {
  // Stryker disable next-line EqualityOperator: no instante exato do fim, ">=" daria ceil(0) = 0 também.
  return e && e.lockedUntil > now ? Math.ceil((e.lockedUntil - now) / 60_000) : 0;
}

/** Minutos que faltam de bloqueio (arredondado para cima), ou 0 se pode tentar. */
export function lockedMinutes(ip: string, username: string, now = Date.now()): number {
  return Math.max(remaining(entries.get(userKey(ip, username)), now), remaining(entries.get(ipKey(ip)), now));
}

// Roda depois de sweep(): uma entrada que sobrou ou está bloqueada ou teve o primeiro erro há
// menos de 15 minutos, então os erros dela ainda se somam.
function count(key: string, max: number, now: number): void {
  const e = entries.get(key) ?? { failures: 0, since: now, lockedUntil: 0 };
  // Durante o bloqueio, um erro não estende nem conta.
  // Stryker disable next-line EqualityOperator: com lockedUntil igual a now, a entrada já saiu no sweep().
  if (e.lockedUntil > now) return;
  e.failures += 1;
  if (e.failures >= max) e.lockedUntil = now + WINDOW;
  entries.set(key, e);
}

/** Apaga as entradas sem bloqueio e com o primeiro erro de 15 minutos atrás ou mais. */
function sweep(now: number): void {
  for (const [key, e] of entries) {
    if (e.lockedUntil <= now && now - e.since >= WINDOW) entries.delete(key);
  }
}

export function registerFailure(ip: string, username: string, now = Date.now()): void {
  sweep(now);
  count(userKey(ip, username), MAX_FAILURES, now);
  count(ipKey(ip), MAX_IP_FAILURES, now);
}

/** Um acerto zera os erros daquele usuário naquele IP; a contagem do IP continua. */
export function registerSuccess(ip: string, username: string): void {
  entries.delete(userKey(ip, username));
}

/** Só para testes. */
export function trackedEntries(): number {
  return entries.size;
}

/** Só para testes. */
export function resetAttempts(): void {
  entries.clear();
}
