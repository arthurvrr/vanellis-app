import type { CatalogoDTO } from '@vanellis/shared';

export async function fetchCatalogo(): Promise<CatalogoDTO> {
  const res = await fetch('/api/catalogo');
  if (!res.ok) throw new Error(`Falha ao carregar o cardápio (${res.status})`);
  return res.json() as Promise<CatalogoDTO>;
}
