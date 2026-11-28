// Seções dentro do cardápio (RF71–RF74, RN80–RN83): só organizam o que o cliente vê. Não mudam
// retirada, antecedência, prazo, preço nem a mensagem do pedido.

import { productsOf, type CatalogoDTO, type ProductDTO } from './catalogo';

/** Uma seção do cardápio, com os produtos que estão nela. */
export interface MenuSection {
  id: number;
  name: string;
  /** Os produtos da seção; a ordem entre eles é a do cardápio (`productIds` da categoria). */
  productIds: number[];
}

/** Um bloco do cardápio no site: uma seção, ou os produtos sem seção (`section` nulo). */
export interface MenuGroup {
  section: { id: number; name: string } | null;
  products: ProductDTO[];
}

/**
 * O cardápio dividido em seções (RF73): as seções na ordem do operador, cada uma com os produtos
 * na ordem do cardápio, e por último os produtos sem seção, sem nome (RN80). Seção sem produto não
 * aparece (RN83). Cardápio sem seções é um grupo só, sem nome, como antes.
 */
export function menuGroups(catalogo: Pick<CatalogoDTO, 'categorias' | 'produtos'>, categoryId: number): MenuGroup[] {
  const produtos = productsOf(catalogo, categoryId);
  const sections = catalogo.categorias.find((c) => c.id === categoryId)?.sections ?? [];
  const usados = new Set(sections.flatMap((s) => s.productIds));
  const grupos: MenuGroup[] = sections
    .map((s) => ({ section: { id: s.id, name: s.name }, products: produtos.filter((p) => s.productIds.includes(p.id)) }))
    .filter((g) => g.products.length);
  const soltos = produtos.filter((p) => !usados.has(p.id));
  if (soltos.length || !grupos.length) grupos.push({ section: null, products: soltos });
  return grupos;
}

const NOME_MAX = 50;

/**
 * Problema no nome de uma seção (RN81), ou null: obrigatório, até 50 caracteres e sem repetir no
 * mesmo cardápio, sem diferenciar maiúsculas. `selfId` é a seção sendo renomeada.
 */
export function sectionNameProblem(name: string, others: { id: number; name: string }[], selfId?: number): string | null {
  const nome = name.trim();
  if (!nome) return 'Informe o nome da seção';
  if (nome.length > NOME_MAX) return `Nome da seção: até ${NOME_MAX} caracteres`;
  const igual = others.find((o) => o.id !== selfId && o.name.toLowerCase() === nome.toLowerCase());
  return igual ? `Já existe a seção "${igual.name}" neste cardápio` : null;
}

/**
 * Sobe ou desce um produto dentro da seção dele (RN83): troca de lugar com o vizinho da mesma
 * seção, pulando os de outras. `sectionOf` diz a seção de cada produto; ausente = sem seção.
 * Devolve a nova ordem do cardápio, ou null se não há para onde ir.
 */
export function moveWithinSection(
  ids: number[],
  sectionOf: Record<number, number>,
  id: number,
  direcao: 'subir' | 'descer',
): number[] | null {
  if (!ids.includes(id)) return null;
  const secao = sectionOf[id];
  const mesma = ids.filter((x) => sectionOf[x] === secao);
  const i = mesma.indexOf(id);
  const vizinho = mesma[direcao === 'subir' ? i - 1 : i + 1];
  if (vizinho === undefined) return null;
  const out = [...ids];
  out[ids.indexOf(id)] = vizinho;
  out[ids.indexOf(vizinho)] = id;
  return out;
}

/**
 * Leva produtos para o fim do cardápio, na ordem que tinham (RN82, RN83): é assim que quem troca
 * de seção, ou fica sem seção quando a sua é excluída, vai para o fim do novo grupo.
 */
export function sendToEnd(ids: number[], moved: number[]): number[] {
  const indo = new Set(moved);
  return [...ids.filter((x) => !indo.has(x)), ...ids.filter((x) => indo.has(x))];
}
