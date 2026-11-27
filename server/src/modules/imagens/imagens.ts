// Recebe a foto enviada pelo painel, reduz e converte para WebP e guarda no banco (RN56).
// As fotos são servidas em /api/imagens/<id>, com cache longo: uma foto nova ganha outro id.

import { eq } from 'drizzle-orm';
import { Router, raw } from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { requireUser } from '../acesso/sessao';
import { category, option, product } from '../catalogo/schema';
import { storedImage } from './schema';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1200;
// Limite de pixels ao ler a foto (G08): ~60 milhões cobre as câmeras de celular de 48 MP com folga.
// Sem ele, valia o padrão do sharp (~268 milhões): um PNG pequeno com dimensões enormes ocuparia
// cerca de 1 GB de memória ao ser decodificado.
export const MAX_INPUT_PIXELS = 60_000_000;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
/** Começo da URL de uma foto guardada no banco: /api/imagens/<id>. */
export const URL_PREFIX = '/api/imagens/';

export const imageUrl = (id: number) => `${URL_PREFIX}${id}`;

/** Id da foto guardada no banco a partir da URL, ou `null` se for uma foto do site (public/). */
export function storedImageId(url: string | null | undefined): number | null {
  if (!url?.startsWith(URL_PREFIX)) return null;
  const id = Number(url.slice(URL_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Reduz para no máximo 1200 px no lado maior e converte para WebP (cerca de 100 KB). */
export async function compressImage(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // respeita a orientação da câmera do celular
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Endereço de foto aceito no cadastro (categoria, produto e opção): só as fotos guardadas pelo
 * painel (/api/imagens/<id>) ou as do próprio site (/images/...). Nunca um endereço de fora (G08).
 */
export const photoUrl = z
  .string()
  .trim()
  .max(255)
  .refine((u) => u.startsWith(URL_PREFIX) || u.startsWith('/images/'), 'Foto inválida')
  .nullable();

/**
 * Apaga uma foto guardada que deixou de ser usada (trocada, ou do produto ou categoria excluídos),
 * mas só se nada mais a usa: duplicar um produto faz a cópia apontar para a mesma foto (G01), e o
 * operador pode usar a mesma foto como capa de categoria. Chame depois de tirar a referência.
 */
export async function deleteStoredImage(db: DB, url: string | null | undefined): Promise<void> {
  const id = storedImageId(url);
  if (!id || (await photoInUse(db, url!))) return;
  await db.delete(storedImage).where(eq(storedImage.id, id));
}

/** Algum produto, opção ou capa de categoria ainda aponta para esta foto? */
async function photoInUse(db: DB, url: string): Promise<boolean> {
  const [p] = await db.select({ id: product.id }).from(product).where(eq(product.imageUrl, url)).limit(1);
  if (p) return true;
  const [o] = await db.select({ id: option.id }).from(option).where(eq(option.imageUrl, url)).limit(1);
  if (o) return true;
  const [c] = await db.select({ id: category.id }).from(category).where(eq(category.coverImageUrl, url)).limit(1);
  return c !== undefined;
}

/** GET público: a foto em si. */
export function imagensRouter(db: DB) {
  const router = Router();
  router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).end();
      return;
    }
    const [img] = await db.select().from(storedImage).where(eq(storedImage.id, id)).limit(1);
    if (!img) {
      res.status(404).end();
      return;
    }
    res.set('Content-Type', img.mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(img.data);
  });
  return router;
}

/** POST no painel: envia a foto (corpo = o arquivo, Content-Type image/jpeg|png|webp). */
export function imagensPainelRouter(db: DB) {
  const router = Router();
  router.post('/', requireUser(db), raw({ type: ACCEPTED, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      res.status(400).json({ error: 'Envie uma foto em JPG, PNG ou WebP' });
      return;
    }
    let out;
    try {
      out = await compressImage(req.body);
    } catch {
      res.status(400).json({ error: 'Não foi possível ler essa foto. Tente outra em JPG ou PNG.' });
      return;
    }
    const [row] = await db
      .insert(storedImage)
      .values({ data: out.data, mime: 'image/webp', width: out.width, height: out.height })
      .returning({ id: storedImage.id });
    res.status(201).json({ url: imageUrl(row!.id), width: out.width, height: out.height, bytes: out.data.length });
  });
  return router;
}
