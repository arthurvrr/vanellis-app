// Tela Produtos do painel, parte 1 (etapa 3): categorias (RF52) e lista de produtos com
// disponibilidade, ordem e exclusão (RF15, RF53, RF54, RN41). Cenários C43–C51.
// Etapa 6: uma categoria pode ser cardápio especial (RF16–RF19; cenários C70–C72).

import {
  normalize,
  specialMenuProblem,
  specialMenuState,
  type SpecialMenu,
  type SpecialMenuState,
} from '@vanellis/shared';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client';
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
import { productsMissingPdv } from './repository';
import { category, option, optionGroup, product } from './schema';

export interface CategoriaPainelDTO {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  productCount: number;
  /** Configuração do cardápio especial; `null` = categoria regular. */
  special: SpecialMenu | null;
  /** Situação hoje, para o painel mostrar se aparece no site. */
  specialState: SpecialMenuState | null;
}

export interface ProdutoListaDTO {
  id: number;
  categoryId: number;
  name: string;
  pdvCode: string | null;
  /** Sem código no produto e em nenhuma opção (RN41). */
  missingPdv: boolean;
  available: boolean;
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
/** Período e datas do cardápio especial; `null` volta a ser categoria regular. */
const especialBody = z
  .object({
    visibleFrom: z.string(),
    visibleUntil: z.string(),
    pickupDates: z.array(z.string()).max(31, 'No máximo 31 datas de retirada'),
  })
  .nullable();
const ocultoBody = z.object({ hidden: z.boolean() });

/** Colunas da categoria para gravar a configuração de cardápio especial. */
function specialColumns(sp: z.infer<typeof especialBody>) {
  if (!sp) return { special: false, visibleFrom: null, visibleUntil: null, pickupDates: [], hidden: false };
  return {
    special: true,
    visibleFrom: sp.visibleFrom,
    visibleUntil: sp.visibleUntil,
    pickupDates: [...new Set(sp.pickupDates)].sort(),
  };
}
const moverBody = z.object({ direcao: z.enum(['subir', 'descer']) });
const disponivelBody = z.object({ available: z.boolean() });

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
  await db.transaction(async (tx) => {
    for (const [pos, itemId] of ids.entries()) await setPosition(tx as unknown as DB, itemId, pos);
  });
  return true;
}

/** `today` devolve 'AAAA-MM-DD' no horário de Brasília (fixo nos testes). */
export function catalogoPainelRouter(db: DB, today: () => string) {
  const router = Router();
  router.use(requireUser(db));
  const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
  const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Dados inválidos';

  // ---------- categorias ----------

  async function listCategorias(): Promise<CategoriaPainelDTO[]> {
    const counts = await db
      .select({ categoryId: product.categoryId, n: count() })
      .from(product)
      .groupBy(product.categoryId);
    const byCat = new Map(counts.map((c) => [c.categoryId, Number(c.n)]));
    const rows = await db.select().from(category).orderBy(asc(category.position), asc(category.id));
    return rows.map((c) => {
      const special: SpecialMenu | null = c.special
        ? { visibleFrom: c.visibleFrom!, visibleUntil: c.visibleUntil!, hidden: c.hidden, pickupDates: [...c.pickupDates].sort() }
        : null;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        coverImageUrl: c.coverImageUrl,
        productCount: byCat.get(c.id) ?? 0,
        special,
        specialState: special ? specialMenuState(special, today()) : null,
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
    const parsed = moverBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Direção inválida');
    const ids = (await listCategorias()).map((c) => c.id);
    await move(db, ids, Number(req.params.id), parsed.data.direcao, (tx, cid, position) =>
      tx.update(category).set({ position }).where(eq(category.id, cid)),
    );
    res.json(await listCategorias());
  });

  router.delete('/categorias/:id', async (req, res) => {
    const id = Number(req.params.id);
    const cat = (await listCategorias()).find((c) => c.id === id);
    if (!cat) return fail(res, 404, 'Categoria não encontrada');
    if (cat.productCount > 0) {
      const n = cat.productCount;
      return fail(
        res,
        409,
        `"${cat.name}" tem ${n} ${n === 1 ? 'produto' : 'produtos'}. Mova ou exclua ${n === 1 ? 'o produto' : 'os produtos'} antes de excluir a categoria.`,
      );
    }
    await db.delete(category).where(eq(category.id, id));
    await deleteStoredImage(db, cat.coverImageUrl);
    res.json(await listCategorias());
  });

  // ---------- produtos (lista) ----------

  async function listProdutos(): Promise<ProdutoListaDTO[]> {
    const missing = await productsMissingPdv(db);
    const rows = await db
      .select({
        id: product.id,
        categoryId: product.categoryId,
        name: product.name,
        pdvCode: product.pdvCode,
        available: product.available,
        imageUrl: product.imageUrl,
        saleUnit: product.saleUnit,
      })
      .from(product)
      .innerJoin(category, eq(category.id, product.categoryId))
      .orderBy(asc(category.position), asc(product.position), asc(product.id));
    return rows.map((p) => ({ ...p, missingPdv: missing.has(p.id) }));
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

  router.post('/produtos/:id/mover', async (req, res) => {
    const parsed = moverBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Direção inválida');
    const id = Number(req.params.id);
    const all = await listProdutos();
    const alvo = all.find((p) => p.id === id);
    if (!alvo) return fail(res, 404, 'Produto não encontrado');
    const ids = all.filter((p) => p.categoryId === alvo.categoryId).map((p) => p.id);
    await move(db, ids, id, parsed.data.direcao, (tx, pid, position) =>
      tx.update(product).set({ position }).where(eq(product.id, pid)),
    );
    res.json(await listProdutos());
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
