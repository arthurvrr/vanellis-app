import { type StoreInfoDTO, type AgendaDTO, type CatalogoDTO, type PublicSettingsDTO } from '@vanellis/shared';

async function getJSON<T>(url: string, what: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Falha ao carregar ${what} (${res.status})`);
  return res.json() as Promise<T>;
}


export function fetchCatalogo(): Promise<CatalogoDTO> {
  return getJSON('/api/catalogo', 'o cardápio');
}

/** Dias e faixas de retirada para os produtos do carrinho (RF05). */
export async function fetchDisponibilidade(productIds: number[], signal?: AbortSignal): Promise<AgendaDTO> {
  const ids = [...new Set(productIds)].sort((a, b) => a - b).join(',');
  return getJSON(`/api/agenda/disponibilidade?produtos=${ids}`, 'os horários de retirada', signal);
}

/** Configurações carregadas uma vez por visita: cabeçalho, rodapé e envio usam as mesmas. */
let settingsOnce: Promise<PublicSettingsDTO> | null = null;
export function loadSettings(): Promise<PublicSettingsDTO> {
  settingsOnce ??= fetchConfiguracoes().catch((e: unknown) => {
    settingsOnce = null; // tenta de novo na próxima vez
    throw e;
  });
  return settingsOnce;
}

/** WhatsApp que recebe os pedidos e atalhos de contato (RF23, RF34). */
export function fetchConfiguracoes(signal?: AbortSignal): Promise<PublicSettingsDTO> {
  return getJSON('/api/configuracoes/publicas', 'as configurações da loja', signal);
}

/** Situação da loja e horário da semana (entrada e rodapé). */
export async function fetchLoja(): Promise<StoreInfoDTO> {
  return getJSON('/api/agenda/loja', 'o horário da loja');
}
