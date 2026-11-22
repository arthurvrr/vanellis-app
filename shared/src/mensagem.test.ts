import { describe, expect, it } from 'vitest';
import { lineKey, resolveCart, type CartLine } from './carrinho';
import {
  buildOrderMessage,
  generateOrderCode,
  MAX_WHATSAPP_URL_LENGTH,
  orderWhatsAppUrl,
  pdvCodeFor,
  whatsappUrl,
  type OrderMessageInput,
} from './mensagem';
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
});

describe('pdvCodeFor', () => {
  it('usa o código da opção escolhida, senão o do produto (RN41)', () => {
    expect(pdvCodeFor(cupcake, { 10: [101], 11: [110] })).toBe('2002');
    expect(pdvCodeFor(coxinha, {})).toBe('1001');
    expect(pdvCodeFor(torta, { 20: [200] })).toBeNull();
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
