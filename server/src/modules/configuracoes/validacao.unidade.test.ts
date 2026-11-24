// Validação das configurações do painel (RF23, RF34, RF37; C84–C88), em unidade (sem servidor nem
// banco). Os testes de API (configuracoes.test.ts) conferem as mesmas regras pela rota.
import { DEFAULT_MESSAGE_TEMPLATE } from '@vanellis/shared';
import { describe, expect, it } from 'vitest';
import { remindersPatch, settingsPatch } from './validacao';

const ok = (patch: unknown) => {
  const r = settingsPatch.safeParse(patch);
  if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
};
const erros = (patch: unknown) => {
  const r = settingsPatch.safeParse(patch);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('telefones', () => {
  it('qualquer formato vira só dígitos com DDI 55', () => {
    expect(ok({ whatsappNumber: '(51) 99528-4226' }).whatsappNumber).toBe('5551995284226');
    expect(ok({ whatsappNumber: '51 3333-4444' }).whatsappNumber).toBe('555133334444');
    expect(ok({ whatsappNumber: '+55 51 99528-4226' }).whatsappNumber).toBe('5551995284226');
    expect(ok({ whatsappNumber: '  5551995284226  ' }).whatsappNumber).toBe('5551995284226');
  });

  it('recusa número sem DDD, DDD começando em 0 ou comprido demais, com o exemplo', () => {
    for (const n of ['99528-4226', '(01) 99528-4226', '5501995284226', '55519952842261', 'abc']) {
      expect(erros({ whatsappNumber: n })).toEqual(['WhatsApp dos pedidos: informe DDD e número, ex: (51) 99528-4226']);
    }
  });

  it('telefone de contato vazio some do site (null); preenchido segue a mesma regra', () => {
    expect(ok({ contactPhone: '  ' }).contactPhone).toBeNull();
    expect(ok({ contactPhone: null }).contactPhone).toBeNull();
    expect(ok({ contactPhone: '(51) 3333-4444' }).contactPhone).toBe('555133334444');
    expect(erros({ contactPhone: '123' })).toEqual(['Telefone: informe DDD e número, ex: (51) 99528-4226']);
  });
});

describe('Instagram', () => {
  it('"@perfil" ou "perfil" vira o link', () => {
    expect(ok({ instagramUrl: '@padaria.vanellis' }).instagramUrl).toBe('https://www.instagram.com/padaria.vanellis/');
    expect(ok({ instagramUrl: ' padaria_v ' }).instagramUrl).toBe('https://www.instagram.com/padaria_v/');
  });

  it('aceita o link completo, com ou sem www', () => {
    expect(ok({ instagramUrl: 'https://instagram.com/padaria/' }).instagramUrl).toBe('https://instagram.com/padaria/');
    expect(ok({ instagramUrl: 'https://www.instagram.com/padaria/' }).instagramUrl).toBe('https://www.instagram.com/padaria/');
  });

  it('recusa http, outro site, nome inválido e vazio vira null', () => {
    const msg = 'Instagram: cole o link completo, ex: https://www.instagram.com/padaria/';
    expect(erros({ instagramUrl: 'http://www.instagram.com/padaria/' })).toEqual([msg]);
    expect(erros({ instagramUrl: 'https://www.instagram.com.golpe.com/padaria/' })).toEqual([msg]);
    expect(erros({ instagramUrl: 'https://xinstagram.com/padaria/' })).toEqual([msg]);
    expect(erros({ instagramUrl: 'nome com espaço' })).toEqual([msg]);
    expect(erros({ instagramUrl: 'a'.repeat(31) })).toEqual([msg]);
    expect(erros({ instagramUrl: 'pad@ria' })).toEqual([msg]);
    expect(ok({ instagramUrl: '' }).instagramUrl).toBeNull();
  });

  it('valor que não é texto é recusado, sem derrubar a validação', () => {
    expect(settingsPatch.safeParse({ instagramUrl: 123 }).success).toBe(false);
  });

  it('link longo demais', () => {
    expect(erros({ instagramUrl: `https://www.instagram.com/${'a'.repeat(480)}/` })).toContain('Instagram: link longo demais');
  });
});

describe('Google Maps', () => {
  it('aceita os endereços do Google Maps', () => {
    for (const u of [
      'https://maps.app.goo.gl/abc',
      'https://goo.gl/maps/abc',
      'https://www.google.com/maps/place/x',
      'https://maps.google.com.br/?q=x',
    ]) {
      expect(ok({ mapsUrl: u }).mapsUrl).toBe(u);
    }
  });

  it('tira os espaços das pontas', () => {
    expect(ok({ mapsUrl: '  https://maps.app.goo.gl/abc  ' }).mapsUrl).toBe('https://maps.app.goo.gl/abc');
  });

  it('recusa outros sites e http', () => {
    const msg = 'Link do Google Maps: cole o link completo, ex: https://maps.app.goo.gl/...';
    for (const u of [
      'https://google.com/maps',
      'https://maps.app.goo.gl.golpe.com/x',
      'https://xgoo.gl/abc',
      'http://maps.app.goo.gl/abc',
      'maps',
    ]) {
      expect(erros({ mapsUrl: u })).toEqual([msg]);
    }
  });
});

describe('endereço', () => {
  it('até 200 caracteres, sem espaços nas pontas; vazio vira null', () => {
    expect(ok({ address: '  Rua A, 1  ' }).address).toBe('Rua A, 1');
    expect(ok({ address: 'a'.repeat(200) }).address).toHaveLength(200);
    expect(erros({ address: 'a'.repeat(201) })).toEqual(['Endereço: até 200 caracteres']);
    expect(ok({ address: '' }).address).toBeNull();
  });
});

describe('modelo da mensagem (C84–C87)', () => {
  it('vazio ou igual ao padrão vira null (usa o padrão)', () => {
    expect(ok({ messageTemplate: null }).messageTemplate).toBeNull();
    expect(ok({ messageTemplate: '   ' }).messageTemplate).toBeNull();
    expect(ok({ messageTemplate: DEFAULT_MESSAGE_TEMPLATE }).messageTemplate).toBeNull();
    expect(ok({ messageTemplate: `\n${DEFAULT_MESSAGE_TEMPLATE}  \n` }).messageTemplate).toBeNull();
  });

  it('troca \\r\\n por \\n e tira o espaço do fim', () => {
    const modelo = `Oi!\r\n${DEFAULT_MESSAGE_TEMPLATE.replaceAll('\n', '\r\n')}\r\n  `;
    expect(ok({ messageTemplate: modelo }).messageTemplate).toBe(`Oi!\n${DEFAULT_MESSAGE_TEMPLATE}`);
  });

  it('modelo com problema é recusado com a mensagem do shared', () => {
    expect(erros({ messageTemplate: `${DEFAULT_MESSAGE_TEMPLATE}\n{inexistente}` })).toEqual([
      'O campo {inexistente} não existe. Use só os campos da lista.',
    ]);
  });
});

describe('formato do pedido', () => {
  it('pode mandar só alguns campos', () => {
    expect(ok({})).toEqual({});
  });
  it('campo desconhecido é recusado', () => {
    expect(settingsPatch.safeParse({ cor: 'azul' }).success).toBe(false);
  });
});

describe('lembretes (C88)', () => {
  it('aceita a frequência de cada lembrete', () => {
    expect(remindersPatch.parse({ cardapio: 7, horario: 15, precos: 365 })).toEqual({ cardapio: 7, horario: 15, precos: 365 });
    expect(remindersPatch.parse({ precos: 1 })).toEqual({ precos: 1 });
  });
  it('fora da faixa: o erro diz qual lembrete', () => {
    const r = remindersPatch.safeParse({ precos: 0, cardapio: 400 });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).sort()).toEqual([
      'Preços: use de 1 a 365 dias',
      'Produtos do cardápio: use de 1 a 365 dias',
    ]);
  });
  it('lembrete desconhecido é recusado', () => {
    expect(remindersPatch.safeParse({ outro: 7 }).success).toBe(false);
  });
});
