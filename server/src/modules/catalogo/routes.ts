import { Router } from 'express';
import type { DB } from '../../db/client';
import { getCatalogo } from './repository';

// Cardápio público: categorias e produtos com seus grupos de opção.
// `now` devolve 'AAAA-MM-DDTHH:MM' no horário de Brasília (fixo nos testes).
export function catalogoRouter(db: DB, now: () => string) {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json(await getCatalogo(db, now().slice(0, 10)));
  });
  return router;
}
