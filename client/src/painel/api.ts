import type {
  AvisosDTO,
  MenuSection,
  PrecoCategoriaDTO,
  PrecosPatch,
  ProductForm,
  ReminderKind,
  ReminderWithStatus,
  SpecialMenu,
  SpecialMenuState,
  TemplateDTO,
  Until,
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
  /** Modelo da mensagem do pedido (RF23); `null` = o padrão. */
  messageTemplate: string | null;
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
  /** Com o prazo (RF55), até quando vai a encomenda e os avisos ao operador (RF61). */
  specialDates: {
    date: string;
    name: string;
    deadline: string | null;
    /** RF56: o cliente escolhe o horário; falso = a combinar. */
    chooseTime: boolean;
    /** RF57: intervalo próprio, ou null (horário normal do dia). */
    window: { start: string; end: string } | null;
    closing: string;
    warnings: string[];
  }[];
  closedPeriods: { id: number; date: string; start: string; end: string }[];
  config: { minLeadHours: number; windowMonths: number };
  /** Tele-entrega (RF44). */
  delivery: { enabled: boolean; allDays: boolean; dates: string[] };
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
  /** Os produtos do cardápio, na ordem dele (RF64). */
  productIds: number[];
  /** As seções do cardápio, na ordem do operador, com os produtos de cada uma (RF71). */
  sections: MenuSection[];
  /** Quantos só estão neste cardápio: ao excluí-lo, ficam sem cardápio (RN70). */
  exclusiveCount: number;
  /** Cardápio especial (RF16–RF19); `null` = categoria regular. */
  special: SpecialMenu | null;
  /** Agendado (em-breve), No site (visivel), Oculto ou Encerrado (RN63). */
  specialState: SpecialMenuState | null;
  /** Fim calculado: o prazo da última data de retirada (RF60). */
  specialEnd: Until | null;
  /** O anúncio que o site mostra agora (RN62). */
  specialAnnouncement: string | null;
  /** Avisos do cadastro (RF61). */
  specialWarnings: string[];
}
export interface ProdutoLista {
  id: number;
  /** Todos os cardápios do produto (RF64); vazio = fora do site. */
  categoryIds: number[];
  /** Posição em cada cardápio, pelo id do cardápio. */
  posicoes: Record<number, number>;
  /** Seção em cada cardápio, pelo id do cardápio; ausente = sem seção (RF74). */
  secoes: Record<number, number>;
  name: string;
  pdvCode: string | null;
  missingPdv: boolean;
  available: boolean;
  /** Preço oculto no site (RF69). */
  priceHidden: boolean;
  imageUrl: string | null;
  saleUnit: string;
}
export type CategoriaForm = {
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  /** Início e datas do cardápio especial; `null` = regular. O fim vem do prazo das datas (RF60). */
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
  setConfiguracoes: (patch: Partial<Record<keyof Configuracoes, string | null>>) =>
    call<Configuracoes>('PUT', '/painel/configuracoes', patch),
  lembretes: () => call<ReminderWithStatus[]>('GET', '/painel/configuracoes/lembretes'),
  setLembretes: (patch: Partial<Record<ReminderKind, number>>) =>
    call<ReminderWithStatus[]>('PUT', '/painel/configuracoes/lembretes', patch),
  /** Marca a revisão como feita hoje (RF36). */
  revisado: (kind: ReminderKind) =>
    call<ReminderWithStatus[]>('POST', `/painel/configuracoes/lembretes/${kind}/revisado`, {}),
  /** Central de avisos: Agora, Histórico e o número do sino (RF66–RF68). */
  avisos: () => call<AvisosDTO>('GET', '/painel/avisos'),
  /** O admin marca que viu um aviso vermelho (RN72). */
  ciente: (id: number) => call<AvisosDTO>('POST', `/painel/avisos/${id}/ciente`, {}),
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
  // Seções do cardápio (RF71).
  criaSecao: (categoryId: number, name: string) =>
    call<CategoriaPainel[]>('POST', `/painel/catalogo/categorias/${categoryId}/secoes`, { name }),
  renomeiaSecao: (id: number, name: string) => call<CategoriaPainel[]>('PUT', `/painel/catalogo/secoes/${id}`, { name }),
  moveSecao: (id: number, direcao: 'subir' | 'descer') =>
    call<CategoriaPainel[]>('POST', `/painel/catalogo/secoes/${id}/mover`, { direcao }),
  excluiSecao: (id: number) => call<CategoriaPainel[]>('DELETE', `/painel/catalogo/secoes/${id}`, {}),
  produtos: () => call<ProdutoLista[]>('GET', '/painel/catalogo/produtos'),
  disponivel: (id: number, available: boolean) =>
    call<ProdutoLista[]>('PUT', `/painel/catalogo/produtos/${id}/disponivel`, { available }),
  /** Sobe ou desce o produto num cardápio dele; cada cardápio tem a sua ordem (C134). */
  moveProduto: (id: number, direcao: 'subir' | 'descer', categoryId: number) =>
    call<ProdutoLista[]>('POST', `/painel/catalogo/produtos/${id}/mover`, { direcao, categoryId }),
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
/**
 * Lado maior da foto enviada. O servidor reduz para 1200 px; mandar a foto original do celular
 * (vários MB) só faz o envio demorar, ainda mais pela internet da padaria.
 */
const LADO_ENVIO = 1600;

/**
 * Reduz a foto no navegador antes de enviar: no máximo LADO_ENVIO px, em JPEG, respeitando a
 * orientação da câmera. Fundo branco (o JPEG não tem transparência). Se o navegador não
 * conseguir, ou o resultado ficar maior, vai a foto original.
 */
async function reduzirFoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, LADO_ENVIO / Math.max(bmp.width, bmp.height));
    if (escala === 1 && file.size <= 1_500_000) {
      bmp.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function enviaFoto(file: File): Promise<{ url: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ApiError('Envie uma foto em JPG, PNG ou WebP', 400);
  }
  // O limite vale para o que vai pela rede: uma foto grande do celular, reduzida, passa.
  const foto = await reduzirFoto(file);
  if (foto.size > 10 * 1024 * 1024) throw new ApiError('A foto pode ter até 10 MB', 400);
  const res = await fetch('/api/painel/imagens', {
    method: 'POST',
    headers: { 'content-type': foto.type },
    body: foto,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Erro ${res.status}`, res.status);
  return { url: data.url! };
}
