// Construtores de produtos, categorias e linhas do carrinho para os testes.
import { lineKey, type CartLine } from './carrinho';
import type { CategoryDTO, OptionDTO, OptionGroupDTO, ProductDTO } from './catalogo';

export const option = (o: Partial<OptionDTO> & Pick<OptionDTO, 'id' | 'name'>): OptionDTO => ({
  pdvCode: null,
  description: null,
  imageUrl: null,
  priceMode: null,
  price: null,
  weightMinKg: null,
  weightMaxKg: null,
  available: true,
  ...o,
});

export const group = (
  g: Partial<OptionGroupDTO> & Pick<OptionGroupDTO, 'id' | 'name' | 'options'>,
): OptionGroupDTO => ({
  minSelect: 1,
  maxSelect: 1,
  controlsImage: false,
  ...g,
});

/** Produto com os campos mínimos; `categoryIds` vem de `categoryId` se não for passado. */
export const product = (p: Partial<ProductDTO>): ProductDTO => {
  const base: Omit<ProductDTO, 'categoryIds'> & { categoryIds?: number[] } = {
    id: 1,
    categoryId: 1,
    pdvCode: null,
    name: 'Produto',
    description: null,
    imageUrl: '/p.jpg',
    imageAlt: null,
    saleUnit: 'UN',
    basePrice: null,
    weightMinKg: null,
    weightMaxKg: null,
    minQuantity: 1,
    leadTimeHours: null,
    available: true,
    groups: [],
    ...p,
  };
  return { ...base, categoryIds: p.categoryIds ?? (base.categoryId === null ? [] : [base.categoryId]) };
};

/** Categoria regular com os campos mínimos; passe `special` para um cardápio especial. */
export const category = (c: Partial<CategoryDTO> & Pick<CategoryDTO, 'id' | 'name'>): CategoryDTO => ({
  slug: c.name.toLowerCase(),
  description: null,
  coverImageUrl: null,
  special: null,
  ...c,
});

/** Linha do carrinho com a chave calculada como no site. */
export const line = (productId: number, selection: CartLine['selection'], quantity: number): CartLine => ({
  key: lineKey(productId, selection),
  productId,
  selection,
  quantity,
});
