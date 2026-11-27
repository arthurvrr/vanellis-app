// B02: fotos enviadas que ficaram sem uso (enviadas e nunca salvas, como no B01) saem do banco
// numa limpeza diária. A folga de um dia protege a foto de quem ainda está editando o produto.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DB } from '../../db/client';
import { startTestApp } from '../../test/app';
import { inserirProdutos } from '../../test/produtos';
import { category, option, optionGroup, product } from '../catalogo/schema';
import { imageUrl } from './imagens';
import { agendarLimpeza, limparFotosOrfas } from './limpeza';
import { avisoEvento } from '../avisos/schema';
import { storedImage } from './schema';

let app: Awaited<ReturnType<typeof startTestApp>>;
let db: DB;
const AGORA = new Date('2026-11-27T03:00:00Z');
const horasAntes = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);

beforeAll(async () => {
  app = await startTestApp();
  // O PGlite do teste tem a mesma API do banco do app (como em test/app.ts).
  db = app.db as unknown as DB;
});
afterAll(() => app.stop());
beforeEach(async () => {
  await app.db.delete(product);
  await app.db.delete(category);
  await app.db.delete(storedImage);
});

/** Grava uma foto enviada `horas` antes de AGORA e devolve a URL dela. */
async function foto(horas: number): Promise<string> {
  const [row] = await app.db
    .insert(storedImage)
    .values({ data: Buffer.from('foto'), mime: 'image/webp', width: 1, height: 1, createdAt: horasAntes(horas) })
    .returning({ id: storedImage.id });
  return imageUrl(row!.id);
}

const restantes = async () =>
  (await app.db.select({ id: storedImage.id }).from(storedImage)).map((r) => imageUrl(r.id)).sort();

describe('limpeza das fotos sem uso (B02)', () => {
  it('apaga a foto sem uso enviada há mais de um dia e diz quantas apagou', async () => {
    const velha = await foto(25);
    const outraVelha = await foto(24 * 30);
    expect(await limparFotosOrfas(db, AGORA)).toBe(2);
    expect(await restantes()).not.toContain(velha);
    expect(await restantes()).not.toContain(outraVelha);
  });

  it('guarda a foto sem uso enviada há menos de um dia: o operador pode estar editando', async () => {
    const recente = await foto(23);
    const noLimite = await foto(24);
    expect(await limparFotosOrfas(db, AGORA)).toBe(0);
    expect(await restantes()).toEqual([recente, noLimite].sort());
  });

  it('guarda as fotos em uso: do produto, de uma opção e da capa de um cardápio', async () => {
    const doProduto = await foto(48);
    const daOpcao = await foto(48);
    const daCapa = await foto(48);
    const solta = await foto(48);
    await app.db.insert(category).values({ name: 'Doces', slug: 'doces', position: 0, coverImageUrl: daCapa });
    const [p] = await inserirProdutos(app.db, [{ name: 'Torta', saleUnit: 'UN', imageUrl: doProduto }]);
    const [g] = await app.db.insert(optionGroup).values({ productId: p!.id, name: 'Sabor' }).returning();
    await app.db.insert(option).values({ groupId: g!.id, name: 'Limão', imageUrl: daOpcao });

    expect(await limparFotosOrfas(db, AGORA)).toBe(1);
    expect(await restantes()).toEqual([doProduto, daOpcao, daCapa].sort());
    expect(await restantes()).not.toContain(solta);
  });

  it('sem nada para apagar, não mexe em nada', async () => {
    expect(await limparFotosOrfas(db, AGORA)).toBe(0);
  });
});

describe('agenda da limpeza', () => {
  it('também apaga o histórico de avisos com mais de 1 ano e registra quantos (RN75)', async () => {
    const velho = new Date(AGORA.getTime() - 400 * 24 * 3_600_000);
    await app.db
      .insert(avisoEvento)
      .values({ tipo: 'revisao-marcada', chave: 'r', gravidade: 'azul', titulo: 'velho', inicio: velho, fim: velho });
    const registrar = vi.fn();
    const agenda = agendarLimpeza(db, { agora: () => AGORA, registrar });
    await agenda.primeira;
    agenda.parar();
    expect(registrar).toHaveBeenCalledWith('Histórico de avisos: 1 registro(s) com mais de 1 ano apagado(s).');
    expect(await app.db.select().from(avisoEvento)).toEqual([]);
  });

  it('roda ao subir o servidor, registra quantas apagou e se repete uma vez por dia', async () => {
    await foto(48);
    const registrar = vi.fn();
    const repetir = vi.spyOn(globalThis, 'setInterval');
    const agenda = agendarLimpeza(db, { agora: () => AGORA, registrar });
    try {
      expect(await agenda.primeira).toBe(1);
      expect(registrar).toHaveBeenCalledWith('Limpeza de fotos sem uso: 1 apagada(s).');
      expect(repetir).toHaveBeenCalledWith(expect.any(Function), 24 * 3_600_000);
    } finally {
      agenda.parar();
      repetir.mockRestore();
    }
  });

  it('não registra nada quando não há o que apagar, e uma falha não derruba o servidor', async () => {
    const registrar = vi.fn();
    const agenda = agendarLimpeza(db, { agora: () => AGORA, registrar });
    expect(await agenda.primeira).toBe(0);
    expect(registrar).not.toHaveBeenCalled();
    agenda.parar();

    const quebrado = {
      delete: () => {
        throw new Error('banco fora do ar');
      },
    } as unknown as DB;
    const comFalha = agendarLimpeza(quebrado, { agora: () => AGORA, registrar });
    expect(await comFalha.primeira).toBe(0);
    expect(registrar).toHaveBeenCalledWith('Limpeza de fotos sem uso falhou: banco fora do ar');
    comFalha.parar();
  });
});
