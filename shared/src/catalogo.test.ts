import { describe, expect, it } from 'vitest';
import { mapsLink, visibleCategories, type CategoryDTO } from './catalogo';
import { category, product } from './test-utils';

const cat = (id: number, slug: string): CategoryDTO => category({ id, name: slug, slug });

describe('categorias visíveis para o cliente', () => {
  it('esconde categoria sem produtos e mantém a com produtos indisponíveis', () => {
    const categorias = [cat(1, 'salgados'), cat(2, 'nova'), cat(3, 'doces')];
    const produtos = [product({ id: 1, categoryId: 1 }), product({ id: 2, categoryId: 3, available: false })];
    expect(visibleCategories({ categorias, produtos }).map((c) => c.slug)).toEqual(['salgados', 'doces']);
  });
});

describe('cardápios especiais em destaque (RF02)', () => {
  it('vêm antes das regulares, mantendo a ordem entre si', () => {
    const especial = (id: number, slug: string): CategoryDTO => ({
      ...cat(id, slug),
      special: { pickupDates: ['2026-12-24'], announcement: '', closedProducts: [] },
    });
    const categorias = [cat(1, 'paes'), especial(2, 'natal'), cat(3, 'doces'), especial(4, 'ano-novo')];
    const produtos = [1, 2, 3, 4].map((id) => product({ id, categoryId: id }));
    expect(visibleCategories({ categorias, produtos }).map((c) => c.slug)).toEqual([
      'natal',
      'ano-novo',
      'paes',
      'doces',
    ]);
  });
});

describe('mapsLink (RF34)', () => {
  it('usa o link cadastrado quando existe', () => {
    expect(mapsLink({ mapsUrl: 'https://maps.app.goo.gl/abc', address: 'Rua A, 1' })).toBe('https://maps.app.goo.gl/abc');
  });

  it('sem link, busca pelo endereço codificado na URL', () => {
    expect(mapsLink({ mapsUrl: null, address: 'Rua São João, 10 & 12' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Rua%20S%C3%A3o%20Jo%C3%A3o%2C%2010%20%26%2012',
    );
  });

  it('sem link nem endereço, não há pin', () => {
    expect(mapsLink({ mapsUrl: null, address: null })).toBeNull();
    expect(mapsLink({ mapsUrl: '', address: '' })).toBeNull();
  });
});
