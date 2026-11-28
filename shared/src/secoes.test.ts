// Seções dentro do cardápio (RF71–RF74, RN80–RN83; C156–C164).

import { describe, expect, it } from 'vitest';
import {
  menuGroups,
  moveWithinSection,
  sectionNameProblem,
  sendToEnd,
  type MenuSection,
} from './secoes';
import { category, product } from './test-utils';

// Ano Novo (id 1): Champanhe 10, Pernil 11, Farofa 12, Pudim 13, Lombo 14, nessa ordem do cardápio.
const nomes: Record<number, string> = { 10: 'Champanhe', 11: 'Pernil', 12: 'Farofa', 13: 'Pudim', 14: 'Lombo' };
const ordem = [10, 11, 12, 13, 14];
const catalogo = (sections?: MenuSection[]) => ({
  categorias: [category({ id: 1, name: 'Ano Novo', slug: 'ano-novo', productIds: ordem, sections })],
  produtos: ordem.map((id) => product({ id, name: nomes[id], categoryId: 1 })),
});
const prato = { id: 7, name: 'Prato principal', productIds: [11, 14] };
const acomp = { id: 8, name: 'Acompanhamentos', productIds: [12] };
const sobremesas = { id: 9, name: 'Sobremesas', productIds: [13] };
const ver = (grupos: ReturnType<typeof menuGroups>) =>
  grupos.map((g) => [g.section?.name ?? null, g.products.map((p) => p.name)]);

describe('o site agrupa o cardápio por seção (RF73, RN80, RN83)', () => {
  it('C159: as seções na ordem do operador, cada uma com os produtos na ordem do cardápio, e os sem seção no fim', () => {
    expect(ver(menuGroups(catalogo([prato, acomp, sobremesas]), 1))).toEqual([
      ['Prato principal', ['Pernil', 'Lombo']],
      ['Acompanhamentos', ['Farofa']],
      ['Sobremesas', ['Pudim']],
      [null, ['Champanhe']],
    ]);
  });

  it('a ordem dentro da seção é a do cardápio, não a da lista da seção', () => {
    const invertida = { ...prato, productIds: [14, 11] };
    expect(ver(menuGroups(catalogo([invertida]), 1))[0]).toEqual(['Prato principal', ['Pernil', 'Lombo']]);
  });

  it('C160: cardápio sem seções é um grupo só, sem nome, como hoje', () => {
    expect(ver(menuGroups(catalogo(), 1))).toEqual([[null, ['Champanhe', 'Pernil', 'Farofa', 'Pudim', 'Lombo']]]);
    expect(ver(menuGroups(catalogo([]), 1))).toEqual([[null, ['Champanhe', 'Pernil', 'Farofa', 'Pudim', 'Lombo']]]);
  });

  it('C161: seção sem produto não aparece; sem produtos sem seção, não há grupo sem nome', () => {
    const bebidas = { id: 6, name: 'Bebidas', productIds: [] };
    const tudo = { ...prato, productIds: [10, 11, 12, 13, 14] };
    expect(ver(menuGroups(catalogo([bebidas, tudo]), 1))).toEqual([
      ['Prato principal', ['Champanhe', 'Pernil', 'Farofa', 'Pudim', 'Lombo']],
    ]);
  });

  it('um produto que o site não recebeu não entra na seção', () => {
    const c = catalogo([prato]);
    c.produtos = c.produtos.filter((p) => p.id !== 14);
    expect(ver(menuGroups(c, 1))).toEqual([
      ['Prato principal', ['Pernil']],
      [null, ['Champanhe', 'Farofa', 'Pudim']],
    ]);
  });

  it('cardápio desconhecido não tem grupos com produtos', () => {
    expect(menuGroups(catalogo([prato]), 99)).toEqual([{ section: null, products: [] }]);
  });

  it('as seções são as do cardápio pedido, não as de outro', () => {
    const c = catalogo();
    c.categorias = [category({ id: 2, name: 'Natal', slug: 'natal', sections: [prato] }), ...c.categorias];
    expect(ver(menuGroups(c, 1))).toEqual([[null, ['Champanhe', 'Pernil', 'Farofa', 'Pudim', 'Lombo']]]);
  });

  it('o grupo traz o id e o nome da seção', () => {
    expect(menuGroups(catalogo([sobremesas]), 1)[0]!.section).toEqual({ id: 9, name: 'Sobremesas' });
  });
});

describe('nome da seção (RN81)', () => {
  const outras = [
    { id: 1, name: 'Sobremesas' },
    { id: 2, name: 'Prato principal' },
  ];

  it('C157: nome vazio é recusado', () => {
    expect(sectionNameProblem('', outras)).toBe('Informe o nome da seção');
    expect(sectionNameProblem('   ', outras)).toBe('Informe o nome da seção');
  });

  it('C157: o nome não se repete no mesmo cardápio, sem diferenciar maiúsculas nem espaços nas pontas', () => {
    expect(sectionNameProblem(' sobremesas ', outras)).toBe('Já existe a seção "Sobremesas" neste cardápio');
    expect(sectionNameProblem('PRATO PRINCIPAL', outras)).toBe('Já existe a seção "Prato principal" neste cardápio');
  });

  it('C157: renomear a própria seção para o mesmo nome, com outra caixa, é aceito', () => {
    expect(sectionNameProblem('SOBREMESAS', outras, 1)).toBeNull();
    expect(sectionNameProblem('Prato principal', outras, 1)).toBe('Já existe a seção "Prato principal" neste cardápio');
  });

  it('nome novo é aceito; até 50 caracteres', () => {
    expect(sectionNameProblem('Doces', outras)).toBeNull();
    expect(sectionNameProblem('a'.repeat(50), [])).toBeNull();
    expect(sectionNameProblem('a'.repeat(51), [])).toBe('Nome da seção: até 50 caracteres');
    expect(sectionNameProblem(` ${'a'.repeat(50)} `, [])).toBeNull();
  });
});

describe('ordem dos produtos com seções (RN82, RN83)', () => {
  // Pernil 11 e Lombo 14 em Prato principal (7); Farofa 12 em Acompanhamentos (8); o resto sem seção.
  const secaoDe = { 11: 7, 14: 7, 12: 8 };

  it('C162: subir um produto troca com o vizinho da mesma seção, pulando os de outras seções', () => {
    expect(moveWithinSection(ordem, secaoDe, 14, 'subir')).toEqual([10, 14, 12, 13, 11]);
    expect(moveWithinSection(ordem, secaoDe, 11, 'descer')).toEqual([10, 14, 12, 13, 11]);
  });

  it('C162: no grupo sem seção vale a mesma regra', () => {
    expect(moveWithinSection(ordem, secaoDe, 13, 'subir')).toEqual([13, 11, 12, 10, 14]);
    expect(moveWithinSection(ordem, secaoDe, 10, 'descer')).toEqual([13, 11, 12, 10, 14]);
  });

  it('o primeiro não sobe e o último não desce dentro da seção; produto fora do cardápio não mexe', () => {
    expect(moveWithinSection(ordem, secaoDe, 11, 'subir')).toBeNull();
    expect(moveWithinSection(ordem, secaoDe, 14, 'descer')).toBeNull();
    expect(moveWithinSection(ordem, secaoDe, 12, 'subir')).toBeNull();
    expect(moveWithinSection(ordem, secaoDe, 12, 'descer')).toBeNull();
    expect(moveWithinSection(ordem, secaoDe, 99, 'subir')).toBeNull();
    expect(moveWithinSection(ordem, secaoDe, 99, 'descer')).toBeNull();
  });

  it('sem seções, é a troca simples com o vizinho', () => {
    expect(moveWithinSection([1, 2, 3], {}, 2, 'subir')).toEqual([2, 1, 3]);
    expect(moveWithinSection([1, 2, 3], {}, 2, 'descer')).toEqual([1, 3, 2]);
  });

  it('não altera a lista recebida', () => {
    const ids = [1, 2, 3];
    moveWithinSection(ids, {}, 2, 'subir');
    expect(ids).toEqual([1, 2, 3]);
  });

  it('C162 e C163: os que trocam de seção vão para o fim, na ordem que tinham', () => {
    expect(sendToEnd(ordem, [12])).toEqual([10, 11, 13, 14, 12]);
    expect(sendToEnd(ordem, [14, 11])).toEqual([10, 12, 13, 11, 14]);
    expect(sendToEnd(ordem, [])).toEqual(ordem);
  });
});
