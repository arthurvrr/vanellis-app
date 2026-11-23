import { Router } from 'express';
import type { DB } from '../../db/client';
import { getCatalogo } from './repository';

// Cardápio público: categorias e produtos com seus grupos de opção.
export function catalogoRouter(db: DB) {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json(await getCatalogo(db));
  });
  return router;
}
