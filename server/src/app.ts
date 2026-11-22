import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { agendaRouter } from './modules/agenda/routes';
import { catalogoRouter } from './modules/catalogo/routes';
import { configuracoesRouter } from './modules/configuracoes/routes';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Um router por módulo de domínio (RNF14). Entrega e acesso
  // entram aqui conforme forem implementados.
  app.use('/api/catalogo', catalogoRouter);
  app.use('/api/agenda', agendaRouter);
  app.use('/api/configuracoes', configuracoesRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  // Em produção o Express também serve o site compilado: um processo, um deploy.
  const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
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
