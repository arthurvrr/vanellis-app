import { nowInBrasilia } from '@vanellis/shared';
import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db as defaultDb, type DB } from './db/client';
import { acessoRouter } from './modules/acesso/routes';
import { agendaPainelRouter } from './modules/agenda/painel';
import { agendaRouter } from './modules/agenda/routes';
import { catalogoPainelRouter } from './modules/catalogo/painel';
import { precosPainelRouter } from './modules/catalogo/precos';
import { catalogoRouter } from './modules/catalogo/routes';
import { configuracoesPainelRouter, configuracoesRouter } from './modules/configuracoes/routes';
import { imagensPainelRouter, imagensRouter } from './modules/imagens/imagens';
import { painelRouter } from './modules/painel/routes';

export interface AppOptions {
  /** Agora em Brasília, 'AAAA-MM-DDTHH:MM'. Fixo nos testes. */
  now?: () => string;
}

export function createApp(db: DB = defaultDb, { now = () => nowInBrasilia() }: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Em produção o Caddy fica na frente e repassa o HTTPS.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Um router por módulo de domínio (RNF14). Entrega entra aqui quando for implementada.
  app.use('/api/catalogo', catalogoRouter(db));
  app.use('/api/agenda', agendaRouter(db, now));
  app.use('/api/configuracoes', configuracoesRouter(db));
  app.use('/api/auth', acessoRouter(db));
  app.use('/api/painel/configuracoes', configuracoesPainelRouter(db));
  app.use('/api/imagens', imagensRouter(db));
  app.use('/api/painel/imagens', imagensPainelRouter(db));
  app.use('/api/painel/catalogo', catalogoPainelRouter(db));
  app.use('/api/painel/precos', precosPainelRouter(db));
  app.use('/api/painel/agenda', agendaPainelRouter(db, () => now().slice(0, 10)));
  app.use('/api/painel', painelRouter(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  // Em produção o Express também serve o site compilado: um processo, um deploy.
  const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/painel{/*path}', (_req, res) => {
      res.sendFile('painel/index.html', { root: clientDist });
    });
    app.get('/{*path}', (_req, res) => {
      res.sendFile('index.html', { root: clientDist });
    });
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  };
  app.use(onError);

  return app;
}
