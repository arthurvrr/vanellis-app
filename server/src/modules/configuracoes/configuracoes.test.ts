// Tela Configurações (RF23, RF34, RN54): contatos e localização editáveis no painel.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';

let app: Awaited<ReturnType<typeof startTestApp>>;
let operador: ReturnType<typeof app.browser>;
let admin: ReturnType<typeof app.browser>;
beforeAll(async () => {
  app = await startTestApp();
  operador = app.browser();
  admin = app.browser();
  await operador('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
  await admin('POST', '/api/auth/login', { usuario: 'arthur', senha: 'senha-admin' });
});
afterAll(() => app.stop());

describe('Configurações da loja', () => {
  it('exige login', async () => {
    expect((await app.browser()('GET', '/api/painel/configuracoes')).status).toBe(401);
  });

  it('operador altera contatos e localização, e o site público recebe', async () => {
    const res = await operador('PUT', '/api/painel/configuracoes', {
      instagramUrl: '@vanellis',
      contactPhone: '(51) 99528-4226',
      address: 'Av. Paraguassu, 557 - Xangri-lá',
      mapsUrl: 'https://maps.app.goo.gl/abc123',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      instagramUrl: 'https://www.instagram.com/vanellis/',
      contactPhone: '5551995284226',
      address: 'Av. Paraguassu, 557 - Xangri-lá',
      mapsUrl: 'https://maps.app.goo.gl/abc123',
    });
    const pub = await app.browser()('GET', '/api/configuracoes/publicas');
    expect(pub.body.mapsUrl).toBe('https://maps.app.goo.gl/abc123');
  });

  it('campo vazio tira o atalho do site', async () => {
    const res = await operador('PUT', '/api/painel/configuracoes', { contactPhone: '', mapsUrl: '  ' });
    expect(res.body.contactPhone).toBeNull();
    expect(res.body.mapsUrl).toBeNull();
  });

  it('recusa link que não é do Instagram ou do Google Maps', async () => {
    const insta = await operador('PUT', '/api/painel/configuracoes', { instagramUrl: 'https://exemplo.com/x' });
    expect(insta.status).toBe(400);
    expect(insta.body.error).toContain('Instagram');
    const maps = await operador('PUT', '/api/painel/configuracoes', { mapsUrl: 'http://maps.google.com/x' });
    expect(maps.status).toBe(400);
  });

  it('recusa telefone sem DDD', async () => {
    const res = await operador('PUT', '/api/painel/configuracoes', { contactPhone: '99528-4226' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('DDD');
  });

  it('só o superusuário troca o WhatsApp que recebe os pedidos (RN54)', async () => {
    expect((await operador('PUT', '/api/painel/configuracoes', { whatsappNumber: '51999998888' })).status).toBe(403);
    const res = await admin('PUT', '/api/painel/configuracoes', { whatsappNumber: '(51) 99999-8888' });
    expect(res.status).toBe(200);
    expect(res.body.whatsappNumber).toBe('5551999998888');
  });
});
