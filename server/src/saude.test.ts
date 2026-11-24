// /api/health: o CD (etapa 5, RQ33) confere de fora que a versão publicada é a do commit aprovado.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from './test/app';

let app: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.stop());
afterEach(() => {
  delete process.env.APP_VERSION;
});

describe('/api/health', () => {
  it('sem versão definida (desenvolvimento), responde "dev"', async () => {
    const r = await app.browser()('GET', '/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, version: 'dev' });
  });

  it('com APP_VERSION (imagem do CD), responde o commit', async () => {
    process.env.APP_VERSION = 'abc1234';
    expect((await app.browser()('GET', '/api/health')).body).toEqual({ ok: true, version: 'abc1234' });
  });
});
