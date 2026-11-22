// Cenários C9–C14 do lado do servidor: o painel liga e desliga, o site público recebe.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';

let app: Awaited<ReturnType<typeof startTestApp>>;
let operador: ReturnType<typeof app.browser>;
beforeAll(async () => {
  app = await startTestApp();
  operador = app.browser();
  await operador('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
});
afterAll(() => app.stop());

describe('Pausar pedidos e ocultar preços', () => {
  it('começa com pedidos abertos e preços visíveis', async () => {
    expect((await operador('GET', '/api/painel/status')).body).toEqual({ ordersPaused: false, pricesHidden: false });
  });

  it('C9/C11: pausa e retoma os pedidos', async () => {
    expect((await operador('PUT', '/api/painel/status', { ordersPaused: true })).body.ordersPaused).toBe(true);
    expect((await operador('GET', '/api/painel/status')).body.ordersPaused).toBe(true);
    expect((await operador('PUT', '/api/painel/status', { ordersPaused: false })).body.ordersPaused).toBe(false);
  });

  it('C12/C14: oculta e reexibe os preços, sem mexer na pausa', async () => {
    const res = await operador('PUT', '/api/painel/status', { pricesHidden: true });
    expect(res.body).toEqual({ ordersPaused: false, pricesHidden: true });
    expect((await operador('PUT', '/api/painel/status', { pricesHidden: false })).body.pricesHidden).toBe(false);
  });

  it('recusa campos desconhecidos', async () => {
    expect((await operador('PUT', '/api/painel/status', { outra: true })).status).toBe(400);
  });
});
