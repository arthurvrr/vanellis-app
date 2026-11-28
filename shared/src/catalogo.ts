// Tipos do catálogo trafegados entre servidor e site.
// Espelham o esquema proposto no doc de requisitos (Modelo de produtos e banco de dados).

import type { PublicSpecialMenu } from './cardapioEspecial';
import type { MenuSection } from './secoes';

export type SaleUnit = 'UN' | 'KG';
export type PriceMode = 'replace' | 'add';

export interface CategoryDTO {
  id: number;
  name: string;
  slug: string;
  /** Frase curta da categoria (RF52); `null` = sem frase. */
  description: string | null;
  /** Foto de capa do cartão da entrada; `null` = foto do primeiro produto. */
  coverImageUrl: string | null;
  /** Cardápio especial visível hoje (RF02, RN19); `null` = categoria regular. */
  special: PublicSpecialMenu | null;
  /** Os produtos do cardápio, na ordem dele (RF64); ausente = a ordem do catálogo. */
  productIds?: number[];
  /** As seções do cardápio, na ordem do operador (RF73); ausente ou vazio = sem seções. */
  sections?: MenuSection[];
}

export interface OptionDTO {
  id: number;
  name: string;
  pdvCode: string | null;
  description: string | null;
  imageUrl: string | null;
  /** `replace` substitui o preço base, `add` soma, `null` não mexe no preço. */
  priceMode: PriceMode | null;
  price: number | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  available: boolean;
}

export interface OptionGroupDTO {
  id: number;
  name: string;
  /** 0 = opcional; 1 ou mais = obrigatório (RN27). */
  minSelect: number;
  /** Máximo de escolhas no grupo (RN40). */
  maxSelect: number;
  /** A opção escolhida neste grupo define a foto do card. */
  controlsImage: boolean;
  options: OptionDTO[];
}

export interface ProductDTO {
  id: number;
  /** Os cardápios visíveis em que o produto está (RF64); a ordem de cada um vem em productIds. */
  categoryIds: number[];
  pdvCode: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  saleUnit: SaleUnit;
  /** Preço por unidade ou por kg; nulo quando vem de uma opção `replace`. */
  basePrice: number | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  minQuantity: number;
  leadTimeHours: number | null;
  available: boolean;
  /**
   * Num cardápio especial, a antecedência do item não alcança mais nenhuma data aberta:
   * "Prazo encerrado para este item" (RN67). Ausente = falso.
   */
  orderClosed?: boolean;
  /**
   * Primeira retirada possível, só para produto com antecedência própria maior que a da loja:
   * "Encomende com 72h de antecedência: retirada a partir de sex 27/11, 10h" (RF58).
   */
  firstPickup?: { date: string; weekday: number; time: string | null };
  /**
   * Preço oculto só deste produto (RF69): o preço e o das opções não vêm, e o site mostra "Preço
   * informado pelo WhatsApp". Ausente = preço visível; nunca vem com os preços do site ocultos (RN79).
   */
  priceHidden?: boolean;
  groups: OptionGroupDTO[];
}

export interface CatalogoDTO {
  categorias: CategoryDTO[];
  produtos: ProductDTO[];
  /** Preços ocultos pelo operador (RF39): o site não mostra valores. */
  pricesHidden: boolean;
}

/** Opções escolhidas pelo cliente, por id de grupo. */
export type Selection = Record<number, number[]>;

/** Configurações da loja usadas pelo site público (RF23, RF34). */
export interface PublicSettingsDTO {
  whatsappNumber: string;
  instagramUrl: string | null;
  contactPhone: string | null;
  /** Endereço da loja (atalho de localização). */
  address: string | null;
  /** Link do Google Maps; `null` = buscar pelo endereço. */
  mapsUrl: string | null;
  /** Modelo da mensagem do pedido (RF23); `null` = o padrão. */
  messageTemplate: string | null;
}

/** Link do pin de localização (RF34): o link cadastrado, senão uma busca pelo endereço. */
export function mapsLink(s: Pick<PublicSettingsDTO, 'address' | 'mapsUrl'>): string | null {
  if (s.mapsUrl) return s.mapsUrl;
  if (s.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;
  return null;
}

/**
 * Categorias que o cliente vê nas abas e na entrada: só as que têm ao menos um produto
 * cadastrado (mesmo indisponível). Uma categoria nova aparece quando ganha o primeiro produto.
 * Os cardápios especiais vêm antes, em destaque (RF02).
 */
export function visibleCategories(catalogo: Pick<CatalogoDTO, 'categorias' | 'produtos'>): CategoryDTO[] {
  const used = new Set(catalogo.produtos.flatMap((p) => p.categoryIds));
  const shown = catalogo.categorias.filter((c) => used.has(c.id));
  return [...shown.filter((c) => c.special), ...shown.filter((c) => !c.special)];
}

/**
 * Produtos de um cardápio (RF64), na ordem dele (`productIds`, quando vem); sem ela, na ordem do
 * catálogo. Um produto pode estar em mais de um cardápio.
 */
export function productsOf(catalogo: Pick<CatalogoDTO, 'categorias' | 'produtos'>, categoryId: number): ProductDTO[] {
  const doCardapio = catalogo.produtos.filter((p) => p.categoryIds.includes(categoryId));
  const ordem = catalogo.categorias.find((c) => c.id === categoryId)?.productIds;
  if (!ordem) return doCardapio;
  const pos = new Map(ordem.map((id, i) => [id, i]));
  // Produto que não está na ordem (não deveria acontecer) vai para o fim.
  const lugar = (id: number) => pos.get(id) ?? ordem.length;
  return [...doCardapio].sort((a, b) => lugar(a.id) - lugar(b.id));
}
