// Construtores de produtos para os testes.
import type { OptionDTO, OptionGroupDTO, ProductDTO } from './catalogo';

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

export const product = (p: Partial<ProductDTO>): ProductDTO => ({
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
});
