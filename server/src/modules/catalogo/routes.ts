import { Router } from 'express';
import { db } from '../../db/client';
import { getCatalogo } from './repository';

export const catalogoRouter = Router();

// Cardápio público: categorias e produtos com seus grupos de opção.
catalogoRouter.get('/', async (_req, res) => {
  res.json(await getCatalogo(db));
});
