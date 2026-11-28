// Seções dentro do cardápio (RF71–RF74, RN80–RN83; C156–C164): a API do painel e o que o site
// recebe. O Ano Novo tem Champanhe, Pernil, Farofa, Pudim e Lombo, nessa ordem; o Pudim também
// está em Doces, que não tem seções.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';
import { inserirProdutos } from '../../test/produtos';
import { category, menuSection, product, productCategory } from './schema';

let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;
const ids: Record<string, number> = {};
/** Nome de cada produto, pelo id (os ids de cardápio e de produto podem coincidir). */
const produtoDe = new Map<number, string>();
const BASE = '/api/painel/catalogo';

beforeAll(async () => {
  app = await startTestApp({ now: () => '2026-12-10T10:00' });
  op = app.browser();
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
});
afterAll(() => app.stop());

beforeEach(async () => {
  await app.db.delete(product);
  await app.db.delete(menuSection);
  await app.db.delete(category);
  const cats = await app.db
    .insert(category)
    .values([
      { name: 'Ano Novo', slug: 'ano-novo', position: 0 },
      { name: 'Doces', slug: 'doces', position: 1 },
    ])
    .returning({ id: category.id, name: category.name });
  for (const c of cats) ids[c.name] = c.id;
  const prods = await inserirProdutos(
    app.db,
    ['Champanhe', 'Pernil', 'Farofa', 'Pudim', 'Lombo'].map((name) => ({
      categoryId: ids['Ano Novo']!,
      name,
      saleUnit: 'UN',
      basePrice: '10.00',
    })),
  );
  for (const p of prods) {
    ids[p.name] = p.id;
    produtoDe.set(p.id, p.name);
  }
  await app.db.insert(productCategory).values({ productId: ids.Pudim!, categoryId: ids.Doces!, position: 0 });
});

type Secao = { id: number; name: string; productIds: number[] };
type Categoria = { id: number; name: string; sections: Secao[]; productIds: number[] };
const categorias = async (): Promise<Categoria[]> => (await op('GET', `${BASE}/categorias`)).body;
const anoNovo = async () => (await categorias()).find((c) => c.name === 'Ano Novo')!;
const secao = async (nome: string) => (await anoNovo()).sections.find((s) => s.name === nome)!;
const nomesDe = (lista: number[]) => lista.map((id) => produtoDe.get(id));
const criar = (nome: string, cat = 'Ano Novo') => op('POST', `${BASE}/categorias/${ids[cat]}/secoes`, { name: nome });
const cadastro = async (nome: string) => (await op('GET', `${BASE}/produtos/${ids[nome]}/cadastro`)).body;
const porNaSecao = async (nome: string, secaoNome: string | null, cat = 'Ano Novo') => {
  const form = await cadastro(nome);
  const s = secaoNome === null ? undefined : (await secao(secaoNome)).id;
  const sectionIds = { ...form.sectionIds };
  if (s === undefined) delete sectionIds[ids[cat]!];
  else sectionIds[ids[cat]!] = s;
  return op('PUT', `${BASE}/produtos/${ids[nome]}`, { ...form, sectionIds });
};
const site = async () => (await app.browser()('GET', '/api/catalogo')).body;

describe('seções do cardápio no painel (RF71, RN81)', () => {
  it('C156: criar e ordenar seções; os produtos continuam no cardápio, sem seção', async () => {
    expect((await criar('Sobremesas')).status).toBe(201);
    await criar('Prato principal');
    await criar('Acompanhamentos');
    const prato = await secao('Prato principal');
    expect((await op('POST', `${BASE}/secoes/${prato.id}/mover`, { direcao: 'subir' })).status).toBe(200);
    await op('POST', `${BASE}/secoes/${prato.id}/mover`, { direcao: 'subir' });
    const sobremesas = await secao('Sobremesas');
    await op('POST', `${BASE}/secoes/${sobremesas.id}/mover`, { direcao: 'descer' });
    const cat = await anoNovo();
    expect(cat.sections.map((s) => s.name)).toEqual(['Prato principal', 'Acompanhamentos', 'Sobremesas']);
    expect(cat.sections.every((s) => s.productIds.length === 0)).toBe(true);
    expect(nomesDe(cat.productIds)).toEqual(['Champanhe', 'Pernil', 'Farofa', 'Pudim', 'Lombo']);
    expect((await categorias()).find((c) => c.name === 'Doces')!.sections).toEqual([]);
  });

  it('a primeira seção não sobe e a última não desce', async () => {
    await criar('Prato principal');
    await criar('Sobremesas');
    const prato = await secao('Prato principal');
    await op('POST', `${BASE}/secoes/${prato.id}/mover`, { direcao: 'subir' });
    const sobremesas = await secao('Sobremesas');
    await op('POST', `${BASE}/secoes/${sobremesas.id}/mover`, { direcao: 'descer' });
    expect((await anoNovo()).sections.map((s) => s.name)).toEqual(['Prato principal', 'Sobremesas']);
    expect((await op('POST', `${BASE}/secoes/${prato.id}/mover`, { direcao: 'lado' })).status).toBe(400);
    expect((await op('POST', `${BASE}/secoes/99999/mover`, { direcao: 'subir' })).status).toBe(404);
  });

  it('C157: nome vazio ou repetido no mesmo cardápio é recusado; em outro cardápio, aceito; renomear', async () => {
    await criar('Sobremesas');
    expect((await criar('  ')).body.error).toBe('Informe o nome da seção');
    const repetido = await criar('sobremesas');
    expect(repetido.status).toBe(409);
    expect(repetido.body.error).toBe('Já existe a seção "Sobremesas" neste cardápio');
    expect((await criar('Sobremesas', 'Doces')).status).toBe(201);
    expect((await op('POST', `${BASE}/categorias/99999/secoes`, { name: 'X' })).status).toBe(404);
    const s = await secao('Sobremesas');
    expect((await op('PUT', `${BASE}/secoes/${s.id}`, { name: ' Doces ' })).status).toBe(200);
    expect((await anoNovo()).sections.map((x) => x.name)).toEqual(['Doces']);
    await criar('Bebidas');
    expect((await op('PUT', `${BASE}/secoes/${s.id}`, { name: 'BEBIDAS' })).status).toBe(409);
    expect((await op('PUT', `${BASE}/secoes/${s.id}`, { name: '' })).status).toBe(400);
    expect((await op('PUT', `${BASE}/secoes/99999`, { name: 'X' })).status).toBe(404);
  });
});

describe('produto na seção (RF72, RN83)', () => {
  beforeEach(async () => {
    for (const n of ['Prato principal', 'Acompanhamentos', 'Sobremesas']) await criar(n);
  });

  it('C158: o vínculo é do produto naquele cardápio; o cadastro devolve a seção', async () => {
    expect((await cadastro('Pudim')).sectionIds).toEqual({});
    expect((await porNaSecao('Pudim', 'Sobremesas')).status).toBe(200);
    const form = await cadastro('Pudim');
    expect(form.sectionIds).toEqual({ [ids['Ano Novo']!]: (await secao('Sobremesas')).id });
    expect([...form.categoryIds].sort((a, b) => a - b)).toEqual([ids['Ano Novo']!, ids.Doces!].sort((a, b) => a - b));
    expect((await secao('Sobremesas')).productIds).toEqual([ids.Pudim]);
    expect((await porNaSecao('Pudim', null)).status).toBe(200);
    expect((await secao('Sobremesas')).productIds).toEqual([]);
  });

  it('a seção precisa ser de um cardápio do produto, e daquele cardápio', async () => {
    const sobremesas = (await secao('Sobremesas')).id;
    const form = await cadastro('Pudim');
    const errado = await op('PUT', `${BASE}/produtos/${ids.Pudim}`, { ...form, sectionIds: { [ids.Doces!]: sobremesas } });
    expect(errado.status).toBe(400);
    expect(errado.body.error).toBe('Seção não encontrada no cardápio');
    const fora = await op('PUT', `${BASE}/produtos/${ids.Pudim}`, {
      ...form,
      categoryIds: [ids.Doces],
      sectionIds: { [ids['Ano Novo']!]: sobremesas },
    });
    expect(fora.status).toBe(400);
    expect(fora.body.error).toBe('Seção de um cardápio em que o produto não está');
  });

  it('C162: trocar de seção leva o produto para o fim da nova; subir e descer ficam dentro da seção', async () => {
    await porNaSecao('Pernil', 'Prato principal');
    await porNaSecao('Lombo', 'Prato principal');
    await porNaSecao('Farofa', 'Acompanhamentos');
    const mover = (nome: string, direcao: string) =>
      op('POST', `${BASE}/produtos/${ids[nome]}/mover`, { direcao, categoryId: ids['Ano Novo'] });
    // O Lombo sobe por cima do Pernil, pulando a Farofa e o Pudim, que estão em outros grupos.
    expect((await mover('Lombo', 'subir')).status).toBe(200);
    expect(nomesDe((await secao('Prato principal')).productIds)).toEqual(['Lombo', 'Pernil']);
    await mover('Lombo', 'subir');
    expect(nomesDe((await secao('Prato principal')).productIds)).toEqual(['Lombo', 'Pernil']);
    await porNaSecao('Farofa', 'Prato principal');
    expect(nomesDe((await secao('Prato principal')).productIds)).toEqual(['Lombo', 'Pernil', 'Farofa']);
    // Salvar sem trocar de seção não mexe no lugar.
    await porNaSecao('Lombo', 'Prato principal');
    expect(nomesDe((await secao('Prato principal')).productIds)).toEqual(['Lombo', 'Pernil', 'Farofa']);
    // No grupo sem seção, o Pudim sobe por cima do Champanhe.
    await mover('Pudim', 'subir');
    const ordem = nomesDe((await anoNovo()).productIds).filter((n) => n === 'Champanhe' || n === 'Pudim');
    expect(ordem).toEqual(['Pudim', 'Champanhe']);
    // A lista de produtos do painel traz a seção de cada produto em cada cardápio (RF74).
    const lista = (await op('GET', `${BASE}/produtos`)).body as { id: number; secoes: Record<number, number> }[];
    expect(lista.find((p) => p.id === ids.Farofa)!.secoes).toEqual({ [ids['Ano Novo']!]: (await secao('Prato principal')).id });
    expect(lista.find((p) => p.id === ids.Pudim)!.secoes).toEqual({});
  });

  it('duplicar mantém a seção, logo depois do original', async () => {
    await porNaSecao('Pernil', 'Prato principal');
    await porNaSecao('Lombo', 'Prato principal');
    const copia = await op('POST', `${BASE}/produtos/${ids.Pernil}/duplicar`, {});
    expect(copia.status).toBe(201);
    expect((await secao('Prato principal')).productIds).toEqual([ids.Pernil, copia.body.id, ids.Lombo]);
  });

  it('C163: excluir a seção deixa os produtos sem seção, no fim, na ordem que tinham', async () => {
    await porNaSecao('Pudim', 'Sobremesas');
    await porNaSecao('Pernil', 'Sobremesas');
    await porNaSecao('Farofa', 'Acompanhamentos');
    const s = await secao('Sobremesas');
    const res = await op('DELETE', `${BASE}/secoes/${s.id}`, {});
    expect(res.status).toBe(200);
    const cat = await anoNovo();
    expect(cat.sections.map((x) => x.name)).toEqual(['Prato principal', 'Acompanhamentos']);
    expect(nomesDe(cat.productIds)).toEqual(['Champanhe', 'Lombo', 'Farofa', 'Pudim', 'Pernil']);
    expect((await cadastro('Pudim')).sectionIds).toEqual({});
    expect((await op('DELETE', `${BASE}/secoes/${s.id}`, {})).status).toBe(404);
  });

  it('C163: excluir o cardápio exclui as seções dele', async () => {
    await porNaSecao('Pudim', 'Sobremesas');
    expect((await op('DELETE', `${BASE}/categorias/${ids['Ano Novo']}`, {})).status).toBe(200);
    expect(await app.db.select().from(menuSection)).toEqual([]);
    expect((await cadastro('Pudim')).categoryIds).toEqual([ids.Doces]);
  });

  it('tirar o produto do cardápio tira ele da seção', async () => {
    await porNaSecao('Pudim', 'Sobremesas');
    const form = await cadastro('Pudim');
    expect((await op('PUT', `${BASE}/produtos/${ids.Pudim}`, { ...form, categoryIds: [ids.Doces], sectionIds: {} })).status).toBe(200);
    expect((await secao('Sobremesas')).productIds).toEqual([]);
  });
});

describe('o site recebe as seções (RF73)', () => {
  it('C159: cada cardápio traz as seções na ordem, com os produtos de cada uma', async () => {
    for (const n of ['Prato principal', 'Acompanhamentos', 'Sobremesas']) await criar(n);
    await porNaSecao('Pernil', 'Prato principal');
    await porNaSecao('Farofa', 'Acompanhamentos');
    await porNaSecao('Pudim', 'Sobremesas');
    const { categorias: cats } = await site();
    const ano = cats.find((c: { slug: string }) => c.slug === 'ano-novo');
    expect(ano.sections.map((s: Secao) => [s.name, nomesDe(s.productIds)])).toEqual([
      ['Prato principal', ['Pernil']],
      ['Acompanhamentos', ['Farofa']],
      ['Sobremesas', ['Pudim']],
    ]);
    expect(cats.find((c: { slug: string }) => c.slug === 'doces').sections).toEqual([]);
  });
});
