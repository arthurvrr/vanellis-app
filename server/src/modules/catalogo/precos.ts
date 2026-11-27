// Tela Preços do painel (etapa 4: RF31; cenários C62–C66). Lista todos os preços e grava os
// reajustes de uma vez. A estrutura do produto (quais opções têm preço, se trocam ou somam)
// continua no editor do produto: aqui só muda o valor de um preço que já existe.

import {
  problemaPreco,
  type PrecoCategoriaDTO,
  type PrecoProdutoDTO,
  type PrecosPatch,
  type PriceMode,
  type SaleUnit,
} from '@vanellis/shared';
import { asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { money, num } from '../../db/conversao';
import { requireUser } from '../acesso/sessao';
import { category, option, optionGroup, product, productCategory } from './schema';

const alteracao = z.object({ id: z.number().int().positive(), price: z.number() });
const patchBody = z.object({
  produtos: z.array(alteracao).max(1000).default([]),
  opcoes: z.array(alteracao).max(1000).default([]),
});

class PrecoError extends Error {}

export async function listPrecos(db: DB): Promise<PrecoCategoriaDTO[]> {
  const cats = await db.select().from(category).orderBy(asc(category.position), asc(category.id));
  const prods = await db.select().from(product).orderBy(asc(product.id));
  // Cada produto aparece uma vez, no primeiro cardápio dele (pela ordem das categorias) e na
  // ordem desse cardápio; quem não tem cardápio fica num grupo no fim (RF64).
  const vinculos = await db.select().from(productCategory);
  const ordemCat = new Map(cats.map((c, i) => [c.id, i]));
  const ondeFica = new Map<number, { categoryId: number; position: number }>();
  for (const v of vinculos) {
    const atual = ondeFica.get(v.productId);
    if (!atual || ordemCat.get(v.categoryId)! < ordemCat.get(atual.categoryId)!) ondeFica.set(v.productId, v);
  }
  const opts = await db
    .select({
      id: option.id,
      productId: optionGroup.productId,
      groupName: optionGroup.name,
      name: option.name,
      priceMode: option.priceMode,
      price: option.price,
    })
    .from(option)
    .innerJoin(optionGroup, eq(option.groupId, optionGroup.id))
    .where(isNotNull(option.price))
    .orderBy(asc(optionGroup.position), asc(optionGroup.id), asc(option.position), asc(option.id));

  const byProduct = new Map<number, PrecoProdutoDTO['options']>();
  for (const o of opts) {
    const list = byProduct.get(o.productId) ?? [];
    list.push({
      id: o.id,
      groupName: o.groupName,
      name: o.name,
      priceMode: o.priceMode as PriceMode,
      // A consulta só traz opções com preço (isNotNull acima).
      price: num(o.price)!,
    });
    byProduct.set(o.productId, list);
  }

  const semCardapio = prods.some((p) => !ondeFica.has(p.id)) ? [{ id: 0, name: 'Sem cardápio' }] : [];
  const grupos = [...cats.map((c) => ({ id: c.id, name: c.name })), ...semCardapio];
  return grupos.map((c) => ({
    id: c.id,
    name: c.name,
    produtos: prods
      .filter((p) => (ondeFica.get(p.id)?.categoryId ?? 0) === c.id)
      .sort((a, b) => (ondeFica.get(a.id)?.position ?? 0) - (ondeFica.get(b.id)?.position ?? 0))
      .map((p) => ({
        id: p.id,
        name: p.name,
        saleUnit: p.saleUnit as SaleUnit,
        available: p.available,
        price: num(p.basePrice),
        options: byProduct.get(p.id) ?? [],
      })),
  }));
}

/** Grava os reajustes numa transação: ou entram todos, ou nenhum (C64). */
async function savePrecos(db: DB, patch: PrecosPatch) {
  await db.transaction(async (tx) => {
    if (patch.produtos.length) {
      const ids = patch.produtos.map((p) => p.id);
      const rows = await tx
        .select({ id: product.id, name: product.name, basePrice: product.basePrice })
        .from(product)
        .where(inArray(product.id, ids));
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const { id, price } of patch.produtos) {
        const p = byId.get(id);
        if (!p) throw new PrecoError('Um dos produtos foi excluído. Recarregue a página.');
        if (p.basePrice === null)
          throw new PrecoError(`${p.name}: o preço vem das opções; altere-o no cadastro do produto`);
        const problema = problemaPreco(price);
        if (problema) throw new PrecoError(`${p.name}: ${problema}`);
        await tx.update(product).set({ basePrice: money(price) }).where(eq(product.id, id));
      }
    }
    if (patch.opcoes.length) {
      const ids = patch.opcoes.map((o) => o.id);
      const rows = await tx
        .select({ id: option.id, name: option.name, priceMode: option.priceMode, productName: product.name })
        .from(option)
        .innerJoin(optionGroup, eq(option.groupId, optionGroup.id))
        .innerJoin(product, eq(optionGroup.productId, product.id))
        .where(inArray(option.id, ids));
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const { id, price } of patch.opcoes) {
        const o = byId.get(id);
        if (!o) throw new PrecoError('Uma das opções foi excluída. Recarregue a página.');
        if (!o.priceMode) throw new PrecoError(`${o.productName} · ${o.name}: esta opção não tem preço próprio`);
        const problema = problemaPreco(price, o.priceMode as PriceMode);
        if (problema) throw new PrecoError(`${o.productName} · ${o.name}: ${problema}`);
        await tx.update(option).set({ price: money(price) }).where(eq(option.id, id));
      }
    }
  });
}

export function precosPainelRouter(db: DB) {
  const router = Router();
  router.use(requireUser(db));

  router.get('/', async (_req, res) => {
    res.json(await listPrecos(db));
  });

  router.put('/', async (req, res) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    try {
      await savePrecos(db, parsed.data);
    } catch (e) {
      if (e instanceof PrecoError) return res.status(400).json({ error: e.message });
      throw e;
    }
    res.json(await listPrecos(db));
  });

  return router;
}
