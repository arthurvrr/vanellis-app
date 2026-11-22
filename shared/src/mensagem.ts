// Mensagem do pedido para o WhatsApp (RF08, RN09, RN41, RNF07).
// O site só monta o texto e o link wa.me; o pedido passa a existir quando o cliente envia (RN04).

import type { ProductDTO, Selection } from './catalogo';
import type { CustomerData } from './cliente';
import type { ResolvedLine } from './carrinho';
import { sumRanges } from './carrinho';
import { formatBRL, type Range } from './preco';
import { formatDay } from './agenda';

/** Limite seguro de tamanho do link wa.me (o texto vai codificado na URL). */
export const MAX_WHATSAPP_URL_LENGTH = 4000;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L

/** Código de referência do pedido, gerado no navegador e não guardado (RN09). Ex: "VNL-7K3QX". */
export function generateOrderCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `VNL-${code}`;
}

/** "Naked · Grande · Morangos": as escolhas na ordem dos grupos. */
export function describeSelection(product: ProductDTO, selection: Selection): string {
  return product.groups
    .flatMap((g) => g.options.filter((o) => selection[g.id]?.includes(o.id)).map((o) => o.name))
    .join(' · ');
}

/** Código do PDV do item: o da opção escolhida que tem código, senão o do produto (RN41). */
export function pdvCodeFor(product: ProductDTO, selection: Selection): string | null {
  for (const g of product.groups) {
    const coded = g.options.find((o) => selection[g.id]?.includes(o.id) && o.pdvCode);
    if (coded) return coded.pdvCode;
  }
  return product.pdvCode;
}

export function formatRange(r: Range): string {
  return r.min === r.max ? formatBRL(r.min) : `${formatBRL(r.min)} a ${formatBRL(r.max)}`;
}

export interface OrderPickup {
  date: string;
  weekday: number;
  /** 'HH:MM'; `null` em data especial (RN20). */
  time: string | null;
  special: string | null;
}

export interface OrderMessageInput {
  code: string;
  lines: ResolvedLine[];
  pickup: OrderPickup;
  customer: CustomerData;
}

function pickupText(p: OrderPickup): string {
  const day = formatDay(p);
  return p.special || !p.time ? `${day} (${p.special ?? 'data especial'}), horário a combinar` : `${day} às ${p.time}`;
}

/**
 * Texto do pedido. A versão compacta tira o valor de cada item e mantém só o total,
 * para pedidos grandes caberem no link (RNF07).
 */
export function buildOrderMessage(input: OrderMessageInput, compact = false): string {
  const { code, lines, pickup, customer } = input;
  const estimated = lines.some((l) => l.product.saleUnit === 'KG');
  const total = sumRanges(lines.map((l) => l.estimate));

  const items = lines.map(({ line, product, estimate }) => {
    const choices = describeSelection(product, line.selection);
    const pdv = pdvCodeFor(product, line.selection);
    let text = `• ${line.quantity}x ${product.name}`;
    if (choices) text += ` (${choices})`;
    if (pdv) text += ` [cód. ${pdv}]`;
    if (!compact && estimate) text += ` — ${formatRange(estimate)}${product.saleUnit === 'KG' ? ' (estimado)' : ''}`;
    return text;
  });

  const parts = [
    `*Pedido ${code}*`,
    '',
    '*Itens*',
    ...items,
    total ? `${estimated ? 'Total estimado' : 'Total'}: ${formatRange(total)}` : '',
    '',
    `*Retirada:* ${pickupText(pickup)}`,
    `*Nome:* ${customer.name.trim()}`,
    `*CPF:* ${customer.cpf}`,
    `*Telefone:* ${customer.phone}`,
  ];
  if (customer.note.trim()) parts.push(`*Observação:* ${customer.note.trim()}`);
  return parts.filter((p, i) => p !== '' || parts[i - 1] !== '').join('\n');
}

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/**
 * Link do pedido no WhatsApp: a mensagem completa se couber; senão a compacta (RNF07).
 * `null` se nem a compacta couber: o cliente precisa dividir o pedido.
 */
export function orderWhatsAppUrl(number: string, input: OrderMessageInput): { url: string; compact: boolean } | null {
  for (const compact of [false, true]) {
    const url = whatsappUrl(number, buildOrderMessage(input, compact));
    if (url.length <= MAX_WHATSAPP_URL_LENGTH) return { url, compact };
  }
  return null;
}
