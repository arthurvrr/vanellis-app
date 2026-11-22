// Formato do arquivo de carga do catálogo (catalogo.json).

import type { PriceMode, SaleUnit } from '@vanellis/shared';

export interface SeedOption {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  pdvCode?: string | null;
  priceMode?: PriceMode | null;
  price?: number | null;
  weightMinKg?: number | null;
  weightMaxKg?: number | null;
}

export interface SeedGroup {
  name: string;
  minSelect: number;
  maxSelect: number;
  controlsImage: boolean;
  options: SeedOption[];
}

export interface SeedProduct {
  /** Id da categoria no protótipo, resolvido para o id novo na carga. */
  categoryProtoId: number;
  pdvCode?: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  saleUnit: SaleUnit;
  basePrice: number | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  minQuantity: number;
  position: number;
  groups: SeedGroup[];
  /** Tipo do protótipo de onde o produto veio (só para referência). */
  origin: string;
  /** O que ainda falta acertar no painel (pesos provisórios, fotos). */
  pending: string[];
}

export interface SeedTemplateGroup {
  name: string;
  minSelect: number;
  maxSelect: number;
  priceMode: PriceMode | null;
  hasWeight: boolean;
  definesPdvCode: boolean;
  controlsImage: boolean;
}

export interface SeedTemplate {
  name: string;
  saleUnit: SaleUnit;
  groups: SeedTemplateGroup[];
}

export interface SeedCatalogo {
  categorias: { protoId: number; name: string; slug: string; position: number }[];
  produtos: SeedProduct[];
  modelos: SeedTemplate[];
}
