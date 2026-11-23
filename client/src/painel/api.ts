import type {
  PrecoCategoriaDTO,
  PrecosPatch,
  ProductForm,
  SpecialMenu,
  SpecialMenuState,
  TemplateDTO,
} from '@vanellis/shared';
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
  /** Produtos sem código PDV (RN41). */
  pdvMissing?: number;
}
export interface CategoriaPainel {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  productCount: number;
  /** Cardápio especial (RF16–RF19); `null` = categoria regular. */
  special: SpecialMenu | null;
  specialState: SpecialMenuState | null;
}
export interface ProdutoLista {
  id: number;
  categoryId: number;
  name: string;
  pdvCode: string | null;
  missingPdv: boolean;
  available: boolean;
  imageUrl: string | null;
  saleUnit: string;
}
export type CategoriaForm = {
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  /** Período e datas do cardápio especial; `null` = regular. */
  special: Omit<SpecialMenu, 'hidden'> | null;
};

/** Erro com a mensagem do servidor; `status` 401 = sessão encerrada. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Todos os problemas, quando o servidor recusa um cadastro. */
    readonly errors: string[] = [message],
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
  const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[] };
  if (!res.ok) throw new ApiError(data.error ?? `Erro ${res.status}`, res.status, data.errors);
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
  categorias: () => call<CategoriaPainel[]>('GET', '/painel/catalogo/categorias'),
  criaCategoria: (c: CategoriaForm) => call<CategoriaPainel[]>('POST', '/painel/catalogo/categorias', c),
  editaCategoria: (id: number, c: Partial<CategoriaForm>) =>
    call<CategoriaPainel[]>('PUT', `/painel/catalogo/categorias/${id}`, c),
  ocultaCategoria: (id: number, hidden: boolean) =>
    call<CategoriaPainel[]>('PUT', `/painel/catalogo/categorias/${id}/oculto`, { hidden }),
  moveCategoria: (id: number, direcao: 'subir' | 'descer') =>
    call<CategoriaPainel[]>('POST', `/painel/catalogo/categorias/${id}/mover`, { direcao }),
  excluiCategoria: (id: number) => call<CategoriaPainel[]>('DELETE', `/painel/catalogo/categorias/${id}`, {}),
  produtos: () => call<ProdutoLista[]>('GET', '/painel/catalogo/produtos'),
  disponivel: (id: number, available: boolean) =>
    call<ProdutoLista[]>('PUT', `/painel/catalogo/produtos/${id}/disponivel`, { available }),
  moveProduto: (id: number, direcao: 'subir' | 'descer') =>
    call<ProdutoLista[]>('POST', `/painel/catalogo/produtos/${id}/mover`, { direcao }),
  excluiProduto: (id: number) => call<ProdutoLista[]>('DELETE', `/painel/catalogo/produtos/${id}`, {}),
  modelos: () => call<TemplateDTO[]>('GET', '/painel/catalogo/modelos'),
  cadastro: (id: number) => call<ProductForm>('GET', `/painel/catalogo/produtos/${id}/cadastro`),
  criaProduto: (f: ProductForm) => call<{ id: number; warnings: string[] }>('POST', '/painel/catalogo/produtos', f),
  salvaProduto: (id: number, f: ProductForm) =>
    call<{ id: number; warnings: string[] }>('PUT', `/painel/catalogo/produtos/${id}`, f),
  precos: () => call<PrecoCategoriaDTO[]>('GET', '/painel/precos'),
  salvaPrecos: (patch: PrecosPatch) => call<PrecoCategoriaDTO[]>('PUT', '/painel/precos', patch),
  duplicaProduto: (id: number) => call<{ id: number }>('POST', `/painel/catalogo/produtos/${id}/duplicar`, {}),
  senhaOperador: (senha: string) => call<{ usuario: string }>('PUT', '/auth/operador/senha', { senha }),
};

/** Envia uma foto (JPG, PNG ou WebP); o servidor reduz, converte e devolve a URL (RN56). */
export async function enviaFoto(file: File): Promise<{ url: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ApiError('Envie uma foto em JPG, PNG ou WebP', 400);
  }
  if (file.size > 10 * 1024 * 1024) throw new ApiError('A foto pode ter até 10 MB', 400);
  const res = await fetch('/api/painel/imagens', {
    method: 'POST',
    headers: { 'content-type': file.type },
    body: file,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Erro ${res.status}`, res.status);
  return { url: data.url! };
}
