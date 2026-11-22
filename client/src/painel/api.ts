// Chamadas do painel. O cookie de sessão vai sozinho (mesmo site); mudanças vão como JSON,
// que o servidor exige (proteção contra CSRF).

export type Papel = 'operador' | 'admin';
export interface Sessao {
  usuario: string;
  papel: Papel;
}
export interface Configuracoes {
  whatsappNumber: string;
  instagramUrl: string | null;
  contactPhone: string | null;
  address: string | null;
  mapsUrl: string | null;
}
export interface Horario {
  weekday: number;
  open: string;
  close: string;
}
export interface HorarioSemanal {
  id: number;
  validFrom: string;
  validUntil: string | null;
  hours: Horario[];
}
export interface AgendaPainel {
  today: string;
  current: HorarioSemanal | null;
  upcoming: HorarioSemanal[];
  restrictions: { id: number; weekday: number | null; start: string; end: string; label: string | null }[];
  blockedDates: { date: string; reason: string | null }[];
  specialDates: { date: string; name: string }[];
  closedPeriods: { id: number; date: string; start: string; end: string }[];
  config: { minLeadHours: number; windowMonths: number };
}
export interface Status {
  ordersPaused: boolean;
  pricesHidden: boolean;
}

/** Erro com a mensagem do servidor; `status` 401 = sessão encerrada. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    cache: 'no-store',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Erro ${res.status}`, res.status);
  return data as T;
}

export const api = {
  sessao: () => call<Sessao>('GET', '/auth/sessao'),
  login: (usuario: string, senha: string) => call<Sessao>('POST', '/auth/login', { usuario, senha }),
  logout: () => call<void>('POST', '/auth/logout', {}),
  status: () => call<Status>('GET', '/painel/status'),
  setStatus: (patch: Partial<Status>) => call<Status>('PUT', '/painel/status', patch),
  configuracoes: () => call<Configuracoes>('GET', '/painel/configuracoes'),
  setConfiguracoes: (patch: Partial<Record<keyof Configuracoes, string>>) =>
    call<Configuracoes>('PUT', '/painel/configuracoes', patch),
  agenda: () => call<AgendaPainel>('GET', '/painel/agenda'),
  /** Qualquer mudança na agenda; a resposta é a agenda inteira atualizada. */
  agendaMuda: (method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown = {}) =>
    call<AgendaPainel>(method, `/painel/agenda${path}`, body),
  senhaOperador: (senha: string) => call<{ usuario: string }>('PUT', '/auth/operador/senha', { senha }),
};
