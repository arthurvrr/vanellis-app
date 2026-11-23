// Recebe a foto enviada pelo painel, reduz e converte para WebP e guarda no banco (RN56).
// As fotos são servidas em /api/imagens/<id>, com cache longo: uma foto nova ganha outro id.

import { eq } from 'drizzle-orm';
import { Router, raw } from 'express';
import sharp from 'sharp';
import type { DB } from '../../db/client';
import { requireUser } from '../acesso/sessao';
import { storedImage } from './schema';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1200;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const URL_PREFIX = '/api/imagens/';

export const imageUrl = (id: number) => `${URL_PREFIX}${id}`;

/** Id da foto guardada no banco a partir da URL, ou `null` se for uma foto do site (public/). */
export function storedImageId(url: string | null | undefined): number | null {
  if (!url?.startsWith(URL_PREFIX)) return null;
  const id = Number(url.slice(URL_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Reduz para no máximo 1200 px no lado maior e converte para WebP (cerca de 100 KB). */
export async function compressImage(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate() // respeita a orientação da câmera do celular
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Apaga uma foto guardada que deixou de ser usada (trocada ou do produto excluído). */
export async function deleteStoredImage(db: DB, url: string | null | undefined): Promise<void> {
  const id = storedImageId(url);
  if (id) await db.delete(storedImage).where(eq(storedImage.id, id));
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
