// Cenários C84–C88 (etapa 5): modelo da mensagem e frequência dos lembretes.

import { DEFAULT_MESSAGE_TEMPLATE } from '@vanellis/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';

let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;
beforeAll(async () => {
  app = await startTestApp();
  op = app.browser();
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
});
afterAll(() => app.stop());

const publico = async () => (await app.browser()('GET', '/api/configuracoes/publicas')).body;
const SAUDACAO = `Olá, Vanellis! Quero fazer um pedido.\n\n${DEFAULT_MESSAGE_TEMPLATE}`;

describe('Modelo da mensagem', () => {
  it('começa com o padrão (null)', async () => {
    expect((await publico()).messageTemplate).toBeNull();
  });

  it('C84: o operador salva um modelo e o site público recebe', async () => {
    const r = await op('PUT', '/api/painel/configuracoes', { messageTemplate: `${SAUDACAO}\r\n` });
    expect(r.status).toBe(200);
    expect((await publico()).messageTemplate).toBe(SAUDACAO);
  });

  it('C86: recusa modelo sem campo obrigatório ou com campo desconhecido', async () => {
    const sem = await op('PUT', '/api/painel/configuracoes', { messageTemplate: SAUDACAO.replace('{itens}', '') });
    expect(sem.status).toBe(400);
    expect(sem.body.error).toMatch('Falta o campo {itens}');
    const desconhecido = await op('PUT', '/api/painel/configuracoes', { messageTemplate: `${SAUDACAO}\n{preco}` });
    expect(desconhecido.body.error).toMatch('{preco} não existe');
    expect((await publico()).messageTemplate).toBe(SAUDACAO);
  });

  it('C87: restaurar o padrão guarda null', async () => {
    await op('PUT', '/api/painel/configuracoes', { messageTemplate: SAUDACAO });
    await op('PUT', '/api/painel/configuracoes', { messageTemplate: DEFAULT_MESSAGE_TEMPLATE });
    expect((await publico()).messageTemplate).toBeNull();
    await op('PUT', '/api/painel/configuracoes', { messageTemplate: SAUDACAO });
    await op('PUT', '/api/painel/configuracoes', { messageTemplate: null });
    expect((await publico()).messageTemplate).toBeNull();
  });
});

describe('Lembretes de revisão', () => {
  it('exige login', async () => {
    expect((await app.browser()('GET', '/api/painel/configuracoes/lembretes')).status).toBe(401);
  });

  it('C88: padrões 7, 15 e 30 dias; mudar preços para 15', async () => {
    const atual = await op('GET', '/api/painel/configuracoes/lembretes');
    expect(atual.body.map((r: { kind: string; everyDays: number }) => [r.kind, r.everyDays])).toEqual([
      ['cardapio', 7],
      ['horario', 15],
      ['precos', 30],
    ]);
    const r = await op('PUT', '/api/painel/configuracoes/lembretes', { precos: 15 });
    expect(r.status).toBe(200);
    expect(r.body.find((x: { kind: string }) => x.kind === 'precos').everyDays).toBe(15);
  });

  it('C88: recusa fora de 1 a 365 dias e tipo desconhecido', async () => {
    for (const d of [0, 366, 2.5]) {
      const r = await op('PUT', '/api/painel/configuracoes/lembretes', { cardapio: d });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/Produtos do cardápio: use de 1 a 365 dias/);
    }
    expect((await op('PUT', '/api/painel/configuracoes/lembretes', { outro: 5 })).status).toBe(400);
  });
});
