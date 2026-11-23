import { describe, expect, it } from 'vitest';
import { visibleCategories, type CategoryDTO } from './catalogo';
import { product } from './test-utils';

const cat = (id: number, slug: string): CategoryDTO => ({
  id,
  name: slug,
  slug,
  description: null,
  coverImageUrl: null,
  special: null,
});

describe('categorias visíveis para o cliente', () => {
  it('esconde categoria sem produtos e mantém a com produtos indisponíveis', () => {
    const categorias = [cat(1, 'salgados'), cat(2, 'nova'), cat(3, 'doces')];
    const produtos = [product({ id: 1, categoryId: 1 }), product({ id: 2, categoryId: 3, available: false })];
    expect(visibleCategories({ categorias, produtos }).map((c) => c.slug)).toEqual(['salgados', 'doces']);
  });
});
