// Tela Produtos do painel, parte 1 (etapa 3): categorias (RF52) e lista de produtos com
// disponibilidade, ordem e exclusão (RF15, RF53, RF54, RN41). Cenários C43–C51.
// Etapa 6: uma categoria pode ser cardápio especial (RF16–RF19; cenários C70–C72).

import {
  menuEnd,
  moveWithinSection,
  normalize,
  sectionNameProblem,
  sendToEnd,
  type MenuSection,
  specialMenuProblem,
  specialMenuWarnings,
  type SpecialMenu,
  type SpecialMenuState,
  type Until,
} from '@vanellis/shared';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { inTransaction } from '../../db/transacao';
import { requireUser } from '../acesso/sessao';
import { deleteStoredImage, photoUrl } from '../imagens/imagens';
import {
  createProduct,
  duplicate,
  FormError,
  listTemplates,
  loadProductForm,
  updateProduct,
} from './produtoForm';
import { idsNoCardapio, ordenar, secaoDe, secoesPorCardapio } from './cardapios';
import { productsMissingPdv, specialMenus } from './repository';
import { category, menuSection, option, optionGroup, product, productCategory } from './schema';

export interface CategoriaPainelDTO {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  productCount: number;
  /** Os produtos do cardápio, na ordem dele (RF64). */
  productIds: number[];
  /** As seções do cardápio, na ordem do operador, com os produtos de cada uma (RF71). */
  sections: MenuSection[];
  /** Quantos produtos só estão neste cardápio: ao excluí-lo, ficam sem cardápio (RN70). */
  exclusiveCount: number;
  /** Configuração do cardápio especial; `null` = categoria regular. */
  special: SpecialMenu | null;
  /** Situação agora, para o painel mostrar se aparece no site (Agendado, No site, Oculto, Encerrado). */
  specialState: SpecialMenuState | null;
  /** Fim calculado: o prazo da última data de retirada (RF60, C113). */
  specialEnd: Until | null;
  /** O anúncio que o site mostra agora (RN62). */
  specialAnnouncement: string | null;
  /** Avisos do cadastro, como o de começar já encerrado (RF61, C125). */
  specialWarnings: string[];
}

export interface ProdutoListaDTO {
  id: number;
  /** Os cardápios do produto (RF64); vazio = sem cardápio, fora do site. */
  categoryIds: number[];
  /** Posição do produto em cada cardápio dele, pelo id do cardápio (C134). */
  posicoes: Record<number, number>;
  /** Seção do produto em cada cardápio dele, pelo id do cardápio; ausente = sem seção (RF74). */
  secoes: Record<number, number>;
  name: string;
  pdvCode: string | null;
  /** Sem código no produto e em nenhuma opção (RN41). */
  missingPdv: boolean;
  available: boolean;
  /** Preço oculto no site (RF69): a lista marca o produto. */
  priceHidden: boolean;
  imageUrl: string | null;
  saleUnit: string;
}

/** "Pães de Fermentação" → "paes-de-fermentacao" */
export function slugify(name: string): string {
  return (
    normalize(name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'categoria'
  );
}


const categoriaBody = z.object({
  name: z.string().trim().min(1, 'Informe o nome da categoria').max(50, 'Nome: até 50 caracteres'),
  description: z
    .string()
    .trim()
    .max(160, 'Frase: até 160 caracteres')
    .transform((v) => v || null)
    .nullable()
    .default(null),
  coverImageUrl: photoUrl.default(null),
});
/** Início e datas do cardápio especial; `null` volta a ser categoria regular. O fim vem do prazo das datas (RF60). */
const especialBody = z
  .object({
    visibleFrom: z.string(),
    pickupDates: z.array(z.string()).max(31, 'No máximo 31 datas de retirada'),
  })
  .nullable();
const ocultoBody = z.object({ hidden: z.boolean() });

/** Colunas da categoria para gravar a configuração de cardápio especial. */
function specialColumns(sp: z.infer<typeof especialBody>) {
  if (!sp) return { special: false, visibleFrom: null, pickupDates: [], hidden: false };
  const pickupDates = [...new Set(sp.pickupDates)].sort();
  return {
    special: true,
    visibleFrom: sp.visibleFrom,
    pickupDates,
  };
}
/** Subir ou descer um produto num cardápio dele. */
const direcaoBody = z.object({ direcao: z.enum(['subir', 'descer']) });
const moverBody = direcaoBody.extend({ categoryId: z.number().int().positive() });
const disponivelBody = z.object({ available: z.boolean() });
const secaoBody = z.object({ name: z.string().max(200) });

/**
 * Troca um item de lugar com o vizinho. Antes, renumera as posições em sequência para não
 * depender de posições repetidas que vieram da carga inicial.
 */
async function move(
  db: DB,
  ids: number[],
  id: number,
  direcao: 'subir' | 'descer',
  setPosition: (tx: DB, id: number, position: number) => Promise<unknown>,
): Promise<boolean> {
  const i = ids.indexOf(id);
  const j = direcao === 'subir' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return false;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await inTransaction(db, async (tx) => {
    for (const [pos, itemId] of ids.entries()) await setPosition(tx, itemId, pos);
  });
  return true;
}

/** `now` devolve 'AAAA-MM-DDTHH:MM' no horário de Brasília (fixo nos testes). */
export function catalogoPainelRouter(db: DB, now: () => string) {
  const router = Router();
  router.use(requireUser(db));
  const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
  const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Dados inválidos';

  // ---------- categorias ----------

  async function listCategorias(): Promise<CategoriaPainelDTO[]> {
    // Produtos de cada cardápio, pelos vínculos e na ordem deles (RF64).
    const vinculos = await db
      .select({ categoryId: productCategory.categoryId, productId: productCategory.productId })
      .from(productCategory)
      .orderBy(asc(productCategory.position), asc(productCategory.productId));
    const ordens = new Map<number, number[]>();
    for (const v of vinculos) ordens.set(v.categoryId, [...(ordens.get(v.categoryId) ?? []), v.productId]);
    const quantos = new Map<number, number>();
    for (const v of vinculos) quantos.set(v.productId, (quantos.get(v.productId) ?? 0) + 1);
    const rows = await db.select().from(category).orderBy(asc(category.position), asc(category.id));
    const especiais = await specialMenus(db, now());
    const secoes = await secoesPorCardapio(db);
    return rows.map((c) => {
      const sp = c.special ? especiais.get(c.id) : undefined;
      const special: SpecialMenu | null = sp?.menu ?? null;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        coverImageUrl: c.coverImageUrl,
        productCount: (ordens.get(c.id) ?? []).length,
        productIds: ordens.get(c.id) ?? [],
        sections: secoes.get(c.id) ?? [],
        exclusiveCount: (ordens.get(c.id) ?? []).filter((pid) => (quantos.get(pid) ?? 0) === 1).length,
        special,
        specialState: sp?.state ?? null,
        specialEnd: sp ? menuEnd(sp.pickups) : null,
        specialAnnouncement: sp && sp.state === 'visivel' ? sp.public.announcement : null,
        specialWarnings: sp ? specialMenuWarnings(sp.menu, sp.pickups) : [],
      };
    });
  }

  async function nameTaken(name: string, exceptId?: number) {
    const where = exceptId
      ? and(sql`lower(${category.name}) = lower(${name})`, ne(category.id, exceptId))
      : sql`lower(${category.name}) = lower(${name})`;
    const [row] = await db.select({ id: category.id }).from(category).where(where).limit(1);
    return !!row;
  }

  async function uniqueSlug(name: string) {
    const base = slugify(name);
    for (let n = 1; ; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const [row] = await db.select({ id: category.id }).from(category).where(eq(category.slug, slug)).limit(1);
      if (!row) return slug;
    }
  }

  router.get('/categorias', async (_req, res) => {
    res.json(await listCategorias());
  });

  router.post('/categorias', async (req, res) => {
    const parsed = categoriaBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const sp = especialBody.optional().safeParse(req.body.special);
    if (!sp.success) return fail(res, 400, firstIssue(sp.error));
    const problema = sp.data ? specialMenuProblem(sp.data) : null;
    if (problema) return fail(res, 400, problema);
    const { name, description, coverImageUrl } = parsed.data;
    if (await nameTaken(name)) return fail(res, 409, `Já existe a categoria "${name}"`);
    const [last] = await db
      .select({ max: sql<number>`coalesce(max(${category.position}), -1)` })
      .from(category);
    await db.insert(category).values({
      name,
      slug: await uniqueSlug(name),
      description,
      coverImageUrl,
      position: Number(last?.max ?? -1) + 1,
      ...specialColumns(sp.data ?? null),
    });
    res.status(201).json(await listCategorias());
  });

  // O endereço da categoria (#slug) não muda ao renomear, para não quebrar links divulgados.
  router.put('/categorias/:id', async (req, res) => {
    const id = Number(req.params.id);
    const parsed = categoriaBody.partial().safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const [atual] = await db.select().from(category).where(eq(category.id, id)).limit(1);
    if (!atual) return fail(res, 404, 'Categoria não encontrada');
    const patch = parsed.data;
    // `special` ausente = não mexe; null = volta a ser regular (C70, C72).
    const sp = especialBody.optional().safeParse(req.body.special);
    if (!sp.success) return fail(res, 400, firstIssue(sp.error));
    const problema = sp.data ? specialMenuProblem(sp.data) : null;
    if (problema) return fail(res, 400, problema);
    if (patch.name && (await nameTaken(patch.name, id))) return fail(res, 409, `Já existe a categoria "${patch.name}"`);
    const set = { ...patch, ...(sp.data !== undefined ? specialColumns(sp.data) : {}) };
    if (Object.keys(set).length) await db.update(category).set(set).where(eq(category.id, id));
    if (patch.coverImageUrl !== undefined && patch.coverImageUrl !== atual.coverImageUrl) {
      await deleteStoredImage(db, atual.coverImageUrl);
    }
    res.json(await listCategorias());
  });

  // Ocultar ou reexibir um cardápio especial inteiro, a qualquer momento (RF18, C71).
  router.put('/categorias/:id/oculto', async (req, res) => {
    const parsed = ocultoBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Dados inválidos');
    const done = await db
      .update(category)
      .set({ hidden: parsed.data.hidden })
      .where(and(eq(category.id, Number(req.params.id)), eq(category.special, true)))
      .returning({ id: category.id });
    if (!done.length) return fail(res, 404, 'Cardápio especial não encontrado');
    res.json(await listCategorias());
  });

  router.post('/categorias/:id/mover', async (req, res) => {
    const parsed = direcaoBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Direção inválida');
    const ids = (await listCategorias()).map((c) => c.id);
    await move(db, ids, Number(req.params.id), parsed.data.direcao, (tx, cid, position) =>
      tx.update(category).set({ position }).where(eq(category.id, cid)),
    );
    res.json(await listCategorias());
  });

  // Excluir um cardápio desvincula os produtos dele, sem excluí-los (RF65, RN70). Quem só estava
  // nele fica sem cardápio: continua cadastrado, fora do site, no grupo "Sem cardápio" do painel.
  router.delete('/categorias/:id', async (req, res) => {
    const id = Number(req.params.id);
    const cat = (await listCategorias()).find((c) => c.id === id);
    if (!cat) return fail(res, 404, 'Categoria não encontrada');
    await inTransaction(db, async (tx) => {
      await tx.delete(productCategory).where(eq(productCategory.categoryId, id));
      await tx.delete(category).where(eq(category.id, id));
    });
    await deleteStoredImage(db, cat.coverImageUrl);
    res.json(await listCategorias());
  });

  // ---------- produtos (lista) ----------

  async function listProdutos(): Promise<ProdutoListaDTO[]> {
    const missing = await productsMissingPdv(db);
    const rows = await db
      .select({
        id: product.id,
        name: product.name,
        pdvCode: product.pdvCode,
        available: product.available,
        priceHidden: product.priceHidden,
        imageUrl: product.imageUrl,
        saleUnit: product.saleUnit,
      })
      .from(product)
      // A ordem de cada cardápio vem de `posicoes`; produto sem cardápio também aparece (RF64).
      .orderBy(asc(product.id));
    const vinculos = await db.select().from(productCategory);
    const posicoes = new Map<number, Record<number, number>>();
    const secoes = new Map<number, Record<number, number>>();
    for (const v of vinculos) {
      posicoes.set(v.productId, { ...posicoes.get(v.productId), [v.categoryId]: v.position });
      if (v.sectionId !== null) secoes.set(v.productId, { ...secoes.get(v.productId), [v.categoryId]: v.sectionId });
    }
    return rows.map((p) => {
      const pos = posicoes.get(p.id) ?? {};
      return {
        ...p,
        categoryIds: Object.keys(pos).map(Number),
        posicoes: pos,
        secoes: secoes.get(p.id) ?? {},
        missingPdv: missing.has(p.id),
      };
    });
  }

  router.get('/produtos', async (_req, res) => {
    res.json(await listProdutos());
  });

  router.put('/produtos/:id/disponivel', async (req, res) => {
    const parsed = disponivelBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Dados inválidos');
    const done = await db
      .update(product)
      .set({ available: parsed.data.available })
      .where(eq(product.id, Number(req.params.id)))
      .returning({ id: product.id });
    if (!done.length) return fail(res, 404, 'Produto não encontrado');
    res.json(await listProdutos());
  });

  // Subir ou descer um produto num cardápio dele; a ordem de cada cardápio é própria (C134). Com
  // seções, o produto troca com o vizinho da mesma seção, ou do grupo sem seção (RN83, C162).
  router.post('/produtos/:id/mover', async (req, res) => {
    const parsed = moverBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Direção inválida');
    const id = Number(req.params.id);
    const cardapio = parsed.data.categoryId;
    await inTransaction(db, async (tx) => {
      const ids = moveWithinSection(await idsNoCardapio(tx, cardapio), await secaoDe(tx, cardapio), id, parsed.data.direcao);
      if (ids) await ordenar(tx, cardapio, ids);
    });
    res.json(await listProdutos());
  });

  // ---------- seções do cardápio (RF71, RN81, RN82) ----------

  /** Seções de um cardápio, na ordem. */
  const secoesDo = (categoryId: number) =>
    db
      .select({ id: menuSection.id, name: menuSection.name })
      .from(menuSection)
      .where(eq(menuSection.categoryId, categoryId))
      .orderBy(asc(menuSection.position), asc(menuSection.id));
  const nomeProblema = (problema: string) => (problema.startsWith('Já existe') ? 409 : 400);

  router.post('/categorias/:id/secoes', async (req, res) => {
    const categoryId = Number(req.params.id);
    const parsed = secaoBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Informe o nome da seção');
    const [cat] = await db.select({ id: category.id }).from(category).where(eq(category.id, categoryId)).limit(1);
    if (!cat) return fail(res, 404, 'Cardápio não encontrado');
    const outras = await secoesDo(categoryId);
    const problema = sectionNameProblem(parsed.data.name, outras);
    if (problema) return fail(res, nomeProblema(problema), problema);
    // Entra no fim; as posições são renumeradas ao mover, então o tamanho basta.
    await db.insert(menuSection).values({ categoryId, name: parsed.data.name.trim(), position: outras.length });
    res.status(201).json(await listCategorias());
  });

  const secaoPorId = async (id: number) =>
    (await db.select().from(menuSection).where(eq(menuSection.id, id)).limit(1))[0];

  router.put('/secoes/:id', async (req, res) => {
    const parsed = secaoBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Informe o nome da seção');
    const s = await secaoPorId(Number(req.params.id));
    if (!s) return fail(res, 404, 'Seção não encontrada');
    const problema = sectionNameProblem(parsed.data.name, await secoesDo(s.categoryId), s.id);
    if (problema) return fail(res, nomeProblema(problema), problema);
    await db.update(menuSection).set({ name: parsed.data.name.trim() }).where(eq(menuSection.id, s.id));
    res.json(await listCategorias());
  });

  router.post('/secoes/:id/mover', async (req, res) => {
    const parsed = direcaoBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Direção inválida');
    const s = await secaoPorId(Number(req.params.id));
    if (!s) return fail(res, 404, 'Seção não encontrada');
    const ids = (await secoesDo(s.categoryId)).map((x) => x.id);
    await move(db, ids, s.id, parsed.data.direcao, (tx, sid, position) =>
      tx.update(menuSection).set({ position }).where(eq(menuSection.id, sid)),
    );
    res.json(await listCategorias());
  });

  // Excluir a seção deixa os produtos dela sem seção, no fim do cardápio, na ordem que tinham (RN82).
  router.delete('/secoes/:id', async (req, res) => {
    const s = await secaoPorId(Number(req.params.id));
    if (!s) return fail(res, 404, 'Seção não encontrada');
    await inTransaction(db, async (tx) => {
      const secao = await secaoDe(tx, s.categoryId);
      const ids = await idsNoCardapio(tx, s.categoryId);
      await ordenar(tx, s.categoryId, sendToEnd(ids, ids.filter((id) => secao[id] === s.id)));
      await tx.update(productCategory).set({ sectionId: null }).where(eq(productCategory.sectionId, s.id));
      await tx.delete(menuSection).where(eq(menuSection.id, s.id));
    });
    res.json(await listCategorias());
  });

  // ---------- cadastro completo (3c, 3d, 3e) ----------

  const formFail = (res: Response, e: unknown) => {
    if (e instanceof FormError) return res.status(e.status).json({ error: e.errors[0], errors: e.errors });
    throw e;
  };

  router.get('/modelos', async (_req, res) => {
    res.json(await listTemplates(db));
  });

  router.get('/produtos/:id/cadastro', async (req, res) => {
    const form = await loadProductForm(db, Number(req.params.id));
    if (!form) return fail(res, 404, 'Produto não encontrado');
    res.json(form);
  });

  router.post('/produtos', async (req, res) => {
    try {
      res.status(201).json(await createProduct(db, req.body));
    } catch (e) {
      formFail(res, e);
    }
  });

  router.put('/produtos/:id', async (req, res) => {
    try {
      res.json(await updateProduct(db, Number(req.params.id), req.body));
    } catch (e) {
      formFail(res, e);
    }
  });

  router.post('/produtos/:id/duplicar', async (req, res) => {
    try {
      res.status(201).json(await duplicate(db, Number(req.params.id)));
    } catch (e) {
      formFail(res, e);
    }
  });

  // Exclusão definitiva (RF53): grupos e opções saem junto; fotos guardadas também.
  router.delete('/produtos/:id', async (req, res) => {
    const id = Number(req.params.id);
    const [alvo] = await db.select({ imageUrl: product.imageUrl }).from(product).where(eq(product.id, id)).limit(1);
    if (!alvo) return fail(res, 404, 'Produto não encontrado');
    const optionImages = await db
      .select({ imageUrl: option.imageUrl })
      .from(option)
      .innerJoin(optionGroup, eq(option.groupId, optionGroup.id))
      .where(eq(optionGroup.productId, id));
    await db.delete(product).where(eq(product.id, id));
    for (const url of [alvo.imageUrl, ...optionImages.map((o) => o.imageUrl)]) await deleteStoredImage(db, url);
    res.json(await listProdutos());
  });

  return router;
}
