// Cenários C43–C51 (Etapa 3, parte 1): lista de produtos e categorias.

import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';
import { storedImage } from '../imagens/schema';
import { category, option, optionGroup, product } from './schema';

let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;
let salgados: number;
let doces: number;

beforeAll(async () => {
  app = await startTestApp();
  op = app.browser();
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
});
afterAll(() => app.stop());

beforeEach(async () => {
  await app.db.delete(product);
  await app.db.delete(category);
  await app.db.delete(storedImage);
  const [s, d] = await app.db
    .insert(category)
    .values([
      { name: 'Salgados', slug: 'salgados', position: 0 },
      { name: 'Doces', slug: 'doces', position: 1 },
    ])
    .returning({ id: category.id });
  salgados = s!.id;
  doces = d!.id;
  await app.db.insert(product).values([
    { categoryId: salgados, name: 'Bolinha de Queijo', saleUnit: 'UN', basePrice: '1.80', position: 0, pdvCode: '1001' },
    { categoryId: salgados, name: 'Coxinha', saleUnit: 'UN', basePrice: '1.60', position: 1 },
    { categoryId: doces, name: 'Brigadeiro', saleUnit: 'UN', basePrice: '2.00', position: 0 },
  ]);
});

const site = async () => (await app.browser()('GET', '/api/catalogo')).body;
const idOf = async (name: string) => (await site()).produtos.find((p: { name: string }) => p.name === name).id;
const foto = () =>
  sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 200, g: 150, b: 90 } } })
    .png()
    .toBuffer();

describe('Lista de produtos', () => {
  it('exige login', async () => {
    expect((await app.browser()('GET', '/api/painel/catalogo/produtos')).status).toBe(401);
  });

  it('C43: desligar e religar a disponibilidade reflete no site', async () => {
    const id = await idOf('Coxinha');
    await op('PUT', `/api/painel/catalogo/produtos/${id}/disponivel`, { available: false });
    expect((await site()).produtos.find((p: { id: number }) => p.id === id).available).toBe(false);
    await op('PUT', `/api/painel/catalogo/produtos/${id}/disponivel`, { available: true });
    expect((await site()).produtos.find((p: { id: number }) => p.id === id).available).toBe(true);
  });

  it('C44: subir um produto muda a ordem no site; o primeiro não sobe', async () => {
    const id = await idOf('Coxinha');
    await op('POST', `/api/painel/catalogo/produtos/${id}/mover`, { direcao: 'subir' });
    const nomes = (await site()).produtos
      .filter((p: { categoryId: number }) => p.categoryId === salgados)
      .map((p: { name: string }) => p.name);
    expect(nomes).toEqual(['Coxinha', 'Bolinha de Queijo']);
    const res = await op('POST', `/api/painel/catalogo/produtos/${id}/mover`, { direcao: 'subir' });
    expect(res.body.filter((p: { categoryId: number }) => p.categoryId === salgados)[0].name).toBe('Coxinha');
  });

  it('C45: excluir apaga o produto, com grupos e opções', async () => {
    const id = await idOf('Coxinha');
    const [g] = await app.db.insert(optionGroup).values({ productId: id, name: 'Sabor' }).returning({ id: optionGroup.id });
    await app.db.insert(option).values({ groupId: g!.id, name: 'Frango' });
    await op('DELETE', `/api/painel/catalogo/produtos/${id}`, {});
    expect((await site()).produtos.map((p: { name: string }) => p.name)).not.toContain('Coxinha');
    expect(await app.db.select().from(option)).toEqual([]);
  });

  it('C46: conta e marca os produtos sem código PDV', async () => {
    const lista = (await op('GET', '/api/painel/catalogo/produtos')).body;
    expect(lista.filter((p: { missingPdv: boolean }) => p.missingPdv).map((p: { name: string }) => p.name)).toEqual([
      'Coxinha',
      'Brigadeiro',
    ]);
    expect((await op('GET', '/api/painel/status')).body.pdvMissing).toBe(2);
  });
});

describe('Categorias', () => {
  it('C47: categoria nova aparece no painel, e no site só com produto', async () => {
    const res = await op('POST', '/api/painel/catalogo/categorias', { name: 'Pães', description: 'Do forno' });
    expect(res.status).toBe(201);
    const paes = res.body.find((c: { name: string }) => c.name === 'Pães');
    expect(paes).toMatchObject({ slug: 'paes', productCount: 0 });
    expect((await site()).categorias.map((c: { slug: string }) => c.slug)).toContain('paes'); // a API entrega; o site esconde vazia
  });

  it('C48: renomear, mudar a frase e descer na ordem; o endereço não muda', async () => {
    await op('PUT', `/api/painel/catalogo/categorias/${salgados}`, { name: 'Salgadinhos', description: 'Fritos na hora' });
    await op('POST', `/api/painel/catalogo/categorias/${salgados}/mover`, { direcao: 'descer' });
    const cats = (await site()).categorias;
    expect(cats.map((c: { name: string }) => c.name)).toEqual(['Doces', 'Salgadinhos']);
    expect(cats[1]).toMatchObject({ slug: 'salgados', description: 'Fritos na hora' });
  });

  it('C49: foto de capa reduzida, em WebP, guardada no banco e trocada sem sobrar arquivo', async () => {
    const up = await op('POST', '/api/painel/imagens', await foto(), { 'content-type': 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ width: 1200, height: 800 });
    const img = await app.browser()('GET', up.body.url);
    expect(img.type).toBe('image/webp');
    expect(img.bytes!.length).toBeLessThan(200_000);

    await op('PUT', `/api/painel/catalogo/categorias/${doces}`, { coverImageUrl: up.body.url });
    expect((await site()).categorias.find((c: { id: number }) => c.id === doces).coverImageUrl).toBe(up.body.url);

    await op('PUT', `/api/painel/catalogo/categorias/${doces}`, { coverImageUrl: null });
    expect(await app.db.select().from(storedImage)).toEqual([]);
  });

  it('G08: recusa foto com dimensões enormes, antes de ocupar a memória', async () => {
    const enorme = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .png()
      .toBuffer();
    const res = await op('POST', '/api/painel/imagens', enorme, { 'content-type': 'image/png' });
    expect(res.status).toBe(400);
    // Gerar a imagem de 64 milhões de pixels para o teste leva alguns segundos.
  }, 30_000);

  it('recusa arquivo que não é foto', async () => {
    const res = await op('POST', '/api/painel/imagens', Buffer.from('não é foto'), { 'content-type': 'image/png' });
    expect(res.status).toBe(400);
  });

  it('C50: não exclui categoria com produtos; exclui a vazia', async () => {
    const res = await op('DELETE', `/api/painel/catalogo/categorias/${doces}`, {});
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('1 produto');
    const nova = await op('POST', '/api/painel/catalogo/categorias', { name: 'Bebidas' });
    const id = nova.body.find((c: { name: string }) => c.name === 'Bebidas').id;
    expect((await op('DELETE', `/api/painel/catalogo/categorias/${id}`, {})).status).toBe(200);
  });

  it('C51: recusa nome repetido, sem diferenciar maiúsculas', async () => {
    expect((await op('POST', '/api/painel/catalogo/categorias', { name: 'doces' })).status).toBe(409);
    expect((await op('PUT', `/api/painel/catalogo/categorias/${salgados}`, { name: 'DOCES' })).status).toBe(409);
  });
});
