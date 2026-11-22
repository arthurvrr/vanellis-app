// Tipos do catálogo trafegados entre servidor e site.
// Espelham o esquema proposto no doc de requisitos (Modelo de produtos e banco de dados).

export type SaleUnit = 'UN' | 'KG';
export type PriceMode = 'replace' | 'add';

export interface CategoryDTO {
  id: number;
  name: string;
  slug: string;
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
}

/** Opções escolhidas pelo cliente, por id de grupo. */
export type Selection = Record<number, number[]>;
