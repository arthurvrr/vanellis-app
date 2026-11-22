import type { AgendaDTO, CatalogoDTO } from '@vanellis/shared';

async function getJSON<T>(url: string, what: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Falha ao carregar ${what} (${res.status})`);
  return res.json() as Promise<T>;
}

export function fetchCatalogo(): Promise<CatalogoDTO> {
  return getJSON('/api/catalogo', 'o cardápio');
}

/** Dias e faixas de retirada para os produtos do carrinho (RF05). */
export function fetchDisponibilidade(productIds: number[], signal?: AbortSignal): Promise<AgendaDTO> {
  const ids = [...new Set(productIds)].sort((a, b) => a - b).join(',');
  return getJSON(`/api/agenda/disponibilidade?produtos=${ids}`, 'os horários de retirada', signal);
}
