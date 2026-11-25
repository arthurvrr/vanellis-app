import { describe, expect, it } from 'vitest';
import { lineKey, resolveCart, type CartLine } from './carrinho';
import {
  buildOrderMessage,
  describeSelection,
  generateOrderCode,
  MAX_WHATSAPP_URL_LENGTH,
  orderWhatsAppUrl,
  pdvCodeFor,
  whatsappUrl,
  type OrderMessageInput,
} from './mensagem';
import { cardPrice, withoutPrices } from './preco';
import { group, option, product } from './test-utils';

const coxinha = product({ id: 1, name: 'Coxinha', basePrice: 1.6, minQuantity: 25, pdvCode: '1001' });
const cupcake = product({
  id: 2,
  name: 'Cupcake',
  minQuantity: 10,
  groups: [
    group({
      id: 10,
      name: 'Tamanho',
      options: [
        option({ id: 100, name: 'Mini', priceMode: 'replace', price: 4.9, pdvCode: '2001' }),
        option({ id: 101, name: 'Tradicional', priceMode: 'replace', price: 8, pdvCode: '2002' }),
      ],
    }),
    group({ id: 11, name: 'Sabor', options: [option({ id: 110, name: 'Chocolate' })] }),
  ],
});
const torta = product({
  id: 3,
  name: 'Torta Macron',
  saleUnit: 'KG',
  basePrice: 80,
  groups: [group({ id: 20, name: 'Tamanho', options: [option({ id: 200, name: 'Pequena', weightMinKg: 1.2, weightMaxKg: 1.5 })] })],
});

const line = (productId: number, selection: CartLine['selection'], quantity: number): CartLine => ({
  key: lineKey(productId, selection),
  productId,
  selection,
  quantity,
});

const customer = { name: ' Ana Souza ', cpf: '529.982.247-25', phone: '(51) 99528-4226', note: '' };

function input(lines: CartLine[], extra: Partial<OrderMessageInput> = {}): OrderMessageInput {
  return {
    code: 'VNL-7K3QX',
    lines: resolveCart(lines, [coxinha, cupcake, torta]).valid,
    pickup: { date: '2026-11-23', weekday: 1, time: '14:30', special: null },
    customer,
    ...extra,
  };
}

describe('generateOrderCode', () => {
  it('gera VNL- e 5 caracteres sem letras e números confundíveis (RN09)', () => {
    const code = generateOrderCode();
    expect(code).toMatch(/^VNL-[A-HJKMNP-Z2-9]{5}$/);
    expect(generateOrderCode(() => 0)).toBe('VNL-AAAAA');
  });

  it('cada sorteio escolhe uma posição proporcional no alfabeto', () => {
    const sorteios = [0, 0.2, 0.5, 0.8, 0.999];
    expect(generateOrderCode(() => sorteios.shift()!)).toBe('VNL-AGS39');
  });
});

describe('pdvCodeFor', () => {
  it('usa o código da opção escolhida, senão o do produto (RN41)', () => {
    expect(pdvCodeFor(cupcake, { 10: [101], 11: [110] })).toBe('2002');
    expect(pdvCodeFor(coxinha, {})).toBe('1001');
    expect(pdvCodeFor(torta, { 20: [200] })).toBeNull();
  });

  it('grupo sem escolha não quebra: cai no código do produto', () => {
    expect(pdvCodeFor(cupcake, { 11: [110] })).toBeNull();
    expect(pdvCodeFor({ ...cupcake, pdvCode: '2000' }, {})).toBe('2000');
  });
});

describe('describeSelection', () => {
  it('lista as escolhas na ordem dos grupos e pula o grupo sem escolha', () => {
    expect(describeSelection(cupcake, { 11: [110], 10: [100] })).toBe('Mini · Chocolate');
    expect(describeSelection(cupcake, { 11: [110] })).toBe('Chocolate');
  });
});

describe('buildOrderMessage', () => {
  it('traz código, itens com código do PDV, total, retirada e dados do cliente (RF08)', () => {
    const text = buildOrderMessage(
      input([line(1, {}, 25), line(2, { 10: [101], 11: [110] }, 10), line(3, { 20: [200] }, 1)], {
        customer: { ...customer, note: 'Sem cebola' },
      }),
    );
    expect(text).toBe(
      [
        '*Pedido VNL-7K3QX*',
        '',
        '*Itens*',
        '• 25x Coxinha [cód. 1001] — R$ 40,00',
        '• 10x Cupcake (Tradicional · Chocolate) [cód. 2002] — R$ 80,00',
        '• 1x Torta Macron (Pequena) — R$ 96,00 a R$ 120,00 (estimado)',
        'Total estimado: R$ 216,00 a R$ 240,00',
        '',
        '*Retirada:* Seg 23/11 às 14:30',
        '*Nome:* Ana Souza',
        '*CPF:* 529.982.247-25',
        '*Telefone:* (51) 99528-4226',
        '*Observação:* Sem cebola',
      ].join('\n'),
    );
  });

  it('em data especial, diz que o horário é a combinar (RN20)', () => {
    const text = buildOrderMessage(
      input([line(1, {}, 25)], { pickup: { date: '2026-12-24', weekday: 4, time: null, special: 'Véspera de Natal' } }),
    );
    expect(text).toContain('*Retirada:* Qui 24/12 (Véspera de Natal), horário a combinar');
    expect(text).toContain('Total: R$');
    expect(text).not.toContain('Observação');
  });

  it('data especial com horário marcado ainda diz que o horário é a combinar (RN20)', () => {
    const text = buildOrderMessage(
      input([line(1, {}, 25)], { pickup: { date: '2026-12-24', weekday: 4, time: '10:00', special: 'Véspera de Natal' } }),
    );
    expect(text).toContain('*Retirada:* Qui 24/12 (Véspera de Natal), horário a combinar');
  });

  it('sem horário e sem nome da data, diz "data especial"', () => {
    const text = buildOrderMessage(
      input([line(1, {}, 25)], { pickup: { date: '2026-12-24', weekday: 4, time: null, special: null } }),
    );
    expect(text).toContain('*Retirada:* Qui 24/12 (data especial), horário a combinar');
  });

  it('a observação sai sem os espaços das pontas, e só espaços não vira observação', () => {
    const com = buildOrderMessage(input([line(1, {}, 25)], { customer: { ...customer, note: '  Sem cebola  ' } }));
    expect(com.split('\n').at(-1)).toBe('*Observação:* Sem cebola');
    const sem = buildOrderMessage(input([line(1, {}, 25)], { customer: { ...customer, note: '   ' } }));
    expect(sem.split('\n').at(-1)).toBe('*Telefone:* (51) 99528-4226');
  });

  it('a versão compacta tira o valor de cada item e mantém o total', () => {
    const text = buildOrderMessage(input([line(1, {}, 25)]), true);
    expect(text).toContain('• 25x Coxinha [cód. 1001]\n');
    expect(text).toContain('Total: R$');
  });
});

describe('orderWhatsAppUrl', () => {
  it('monta o link wa.me com o número só em dígitos e o texto codificado', () => {
    expect(whatsappUrl('+55 (51) 99528-4226', 'Oi 1')).toBe('https://wa.me/5551995284226?text=Oi%201');
    const result = orderWhatsAppUrl('5551995284226', input([line(1, {}, 25)]));
    expect(result?.compact).toBe(false);
    expect(result?.url.startsWith('https://wa.me/5551995284226?text=')).toBe(true);
  });

  it('o link com exatamente o limite de caracteres ainda vai completo', () => {
    const comNota = (note: string) => input([line(1, {}, 25)], { customer: { ...customer, note } });
    const base = whatsappUrl('5551995284226', buildOrderMessage(comNota('x'))).length;
    const nota = 'x'.repeat(1 + MAX_WHATSAPP_URL_LENGTH - base);
    const result = orderWhatsAppUrl('5551995284226', comNota(nota));
    expect(result?.url.length).toBe(MAX_WHATSAPP_URL_LENGTH);
    expect(result?.compact).toBe(false);
  });

  it('usa a versão compacta quando a completa passa do limite, e recusa se nem ela cabe (RNF07)', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => product({ id: 100 + i, name: `Produto com nome comprido ${i}`, basePrice: 1 }));
    const build = (n: number): OrderMessageInput => {
      const produtos = many(n);
      return {
        ...input([]),
        lines: resolveCart(produtos.map((p) => line(p.id, {}, 1)), produtos).valid,
      };
    };
    const medio = orderWhatsAppUrl('5551995284226', build(55));
    expect(medio?.compact).toBe(true);
    expect(medio!.url.length).toBeLessThanOrEqual(MAX_WHATSAPP_URL_LENGTH);
    expect(orderWhatsAppUrl('5551995284226', build(100))).toBeNull();
  });
});

describe('preços ocultos (RF39, cenário C13)', () => {
  const { produtos } = withoutPrices({ produtos: [coxinha, cupcake, torta] });
  const hidden = (lines: CartLine[]): OrderMessageInput => ({ ...input(lines), lines: resolveCart(lines, produtos).valid });
  const lines = [line(1, {}, 25), line(2, { 10: [101], 11: [110] }, 10), line(3, { 20: [200] }, 1)];

  it('o card não mostra preço, nem "a partir de"', () => {
    for (const p of produtos) expect(cardPrice(p, {}).value).toBeNull();
  });

  it('o carrinho fica sem valores e continua válido', () => {
    const { valid, invalid } = resolveCart(lines, produtos);
    expect(invalid).toEqual([]);
    expect(valid.map((v) => v.estimate)).toEqual([null, null, null]);
  });

  it('a mensagem sai sem nenhum valor, com itens, códigos e retirada', () => {
    const msg = buildOrderMessage(hidden(lines));
    expect(msg).not.toContain('R$');
    expect(msg).not.toContain('Total');
    expect(msg).toContain('• 25x Coxinha [cód. 1001]');
    expect(msg).toContain('• 10x Cupcake (Tradicional · Chocolate) [cód. 2002]');
    expect(msg).toContain('*Retirada:* Seg 23/11 às 14:30');
    // Sem total nem observação, as linhas desses campos somem por inteiro.
    expect(msg).toBe(
      [
        '*Pedido VNL-7K3QX*',
        '',
        '*Itens*',
        '• 25x Coxinha [cód. 1001]',
        '• 10x Cupcake (Tradicional · Chocolate) [cód. 2002]',
        '• 1x Torta Macron (Pequena)',
        '',
        '*Retirada:* Seg 23/11 às 14:30',
        '*Nome:* Ana Souza',
        '*CPF:* 529.982.247-25',
        '*Telefone:* (51) 99528-4226',
      ].join('\n'),
    );
  });
});
