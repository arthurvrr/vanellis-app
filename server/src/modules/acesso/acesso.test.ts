// Cenários C1–C8 (aba Cenários do doc de requisitos).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestApp } from '../../test/app';
import { verifyPassword } from './senha';
import { resetAttempts } from './tentativas';

// A verificação de senha de verdade, contando as chamadas (G07: IP bloqueado não roda o scrypt).
vi.mock('./senha', async (original) => {
  const real = await original<typeof import('./senha')>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

let app: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.stop());
beforeEach(() => resetAttempts());

const login = (b: ReturnType<typeof app.browser>, usuario: string, senha: string) =>
  b('POST', '/api/auth/login', { usuario, senha });

describe('Login', () => {
  it('C1: operador entra com usuário e senha corretos', async () => {
    const b = app.browser();
    const res = await login(b, 'padaria', 'senha-operador');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ usuario: 'padaria', papel: 'operador' });
    expect(res.setCookie).toMatch(/HttpOnly/i);
    expect((await b('GET', '/api/auth/sessao')).body).toEqual({ usuario: 'padaria', papel: 'operador' });
  });

  it('aceita o usuário com maiúsculas e espaços', async () => {
    expect((await login(app.browser(), ' Padaria ', 'senha-operador')).status).toBe(200);
  });

  it('C2: senha errada ou usuário inexistente dão a mesma mensagem', async () => {
    const wrong = await login(app.browser(), 'padaria', 'errada');
    const unknown = await login(app.browser(), 'ninguem', 'errada');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe('Usuário ou senha incorretos');
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it('C3: 5 erros seguidos bloqueiam o usuário por 15 minutos, mesmo com a senha certa', async () => {
    const b = app.browser();
    for (let i = 0; i < 5; i++) expect((await login(b, 'padaria', 'errada')).status).toBe(401);
    const blocked = await login(b, 'padaria', 'senha-operador');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain('15 min');
    // O bloqueio é por usuário: o superusuário continua entrando.
    expect((await login(b, 'arthur', 'senha-admin')).status).toBe(200);
  });

  it('G07: 5 erros de um IP não bloqueiam o mesmo usuário vindo de outro IP', async () => {
    const deFora = { 'x-forwarded-for': '203.0.113.7' };
    const daLoja = { 'x-forwarded-for': '198.51.100.9' };
    for (let i = 0; i < 5; i++) {
      expect((await app.browser()('POST', '/api/auth/login', { usuario: 'padaria', senha: 'errada' }, deFora)).status).toBe(401);
    }
    expect((await app.browser()('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' }, deFora)).status).toBe(429);
    expect((await app.browser()('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' }, daLoja)).status).toBe(200);
  });

  it('G07: muitas tentativas de um IP, em usuários inventados, são recusadas antes de verificar a senha', async () => {
    const ip = { 'x-forwarded-for': '203.0.113.50' };
    for (let i = 0; i < 20; i++) {
      expect((await app.browser()('POST', '/api/auth/login', { usuario: `inventado${i}`, senha: 'x' }, ip)).status).toBe(401);
    }
    vi.mocked(verifyPassword).mockClear();
    const res = await app.browser()('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' }, ip);
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('15 min');
    expect(verifyPassword).not.toHaveBeenCalled();
    // Outro IP segue entrando.
    expect((await login(app.browser(), 'padaria', 'senha-operador')).status).toBe(200);
    // 20 tentativas com scrypt de verdade: o limite padrão de 5 s fica justo numa máquina ocupada.
  }, 30_000);

  it('C4: sem login, o painel é recusado', async () => {
    const b = app.browser();
    expect((await b('GET', '/api/auth/sessao')).status).toBe(401);
    expect((await b('GET', '/api/painel/status')).status).toBe(401);
  });

  it('C5: depois de sair, a sessão não vale mais', async () => {
    const b = app.browser();
    await login(b, 'padaria', 'senha-operador');
    expect((await b('POST', '/api/auth/logout', {})).status).toBe(204);
    expect((await b('GET', '/api/painel/status')).status).toBe(401);
  });

  it('C6: superusuário redefine a senha do operador e encerra as sessões dele', async () => {
    const operador = app.browser();
    await login(operador, 'padaria', 'senha-operador');
    const admin = app.browser();
    await login(admin, 'arthur', 'senha-admin');

    const res = await admin('PUT', '/api/auth/operador/senha', { senha: 'nova-senha-123' });
    expect(res.status).toBe(200);
    expect((await operador('GET', '/api/painel/status')).status).toBe(401);
    expect((await login(app.browser(), 'padaria', 'senha-operador')).status).toBe(401);
    expect((await login(app.browser(), 'padaria', 'nova-senha-123')).status).toBe(200);
    // A sessão do superusuário continua.
    expect((await admin('GET', '/api/painel/status')).status).toBe(200);
    await admin('PUT', '/api/auth/operador/senha', { senha: 'senha-operador' });
  });

  it('recusa senha nova curta', async () => {
    const admin = app.browser();
    await login(admin, 'arthur', 'senha-admin');
    const res = await admin('PUT', '/api/auth/operador/senha', { senha: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('8 caracteres');
  });

  it('C7: o servidor recusa ao operador as ações do superusuário', async () => {
    const b = app.browser();
    await login(b, 'padaria', 'senha-operador');
    expect((await b('PUT', '/api/auth/operador/senha', { senha: 'outra-senha-1' })).status).toBe(403);
  });

  it('recusa mudanças que não vêm como JSON (proteção contra CSRF)', async () => {
    const b = app.browser();
    await login(b, 'padaria', 'senha-operador');
    const res = await b('PUT', '/api/painel/status', undefined, { 'content-type': 'application/x-www-form-urlencoded' });
    expect(res.status).toBe(415);
  });
});
