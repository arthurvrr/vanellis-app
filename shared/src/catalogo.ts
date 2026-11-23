// Tipos do catálogo trafegados entre servidor e site.
// Espelham o esquema proposto no doc de requisitos (Modelo de produtos e banco de dados).

import type { AgendaInput } from './agenda';

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
  categoryId: number;
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
}

/** Link do pin de localização (RF34): o link cadastrado, senão uma busca pelo endereço. */
export function mapsLink(s: Pick<PublicSettingsDTO, 'address' | 'mapsUrl'>): string | null {
  if (s.mapsUrl) return s.mapsUrl;
  if (s.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;
  return null;
}

/** Dados da versão de teste estática (GitHub Pages), exportados do banco. */
export interface DemoData {
  catalogo: CatalogoDTO;
  agenda: { input: AgendaInput; paused: boolean };
  configuracoes: PublicSettingsDTO;
}

/**
 * Categorias que o cliente vê nas abas e na entrada: só as que têm ao menos um produto
 * cadastrado (mesmo indisponível). Uma categoria nova aparece quando ganha o primeiro produto.
 */
export function visibleCategories(catalogo: Pick<CatalogoDTO, 'categorias' | 'produtos'>): CategoryDTO[] {
  const used = new Set(catalogo.produtos.map((p) => p.categoryId));
  return catalogo.categorias.filter((c) => used.has(c.id));
}
