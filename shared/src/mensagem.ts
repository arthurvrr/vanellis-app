// Mensagem do pedido para o WhatsApp (RF08, RN09, RN41, RNF07).
// O site só monta o texto e o link wa.me; o pedido passa a existir quando o cliente envia (RN04).

import type { ProductDTO, Selection } from './catalogo';
import { formatAddress, type Address, type CustomerData } from './cliente';
import type { ResolvedLine } from './carrinho';
import { sumRanges } from './carrinho';
import { formatBRL, type Range } from './preco';
import { formatDay } from './agenda';
import { onlyDigits } from './texto';

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
  /** Endereço da tele-entrega; `null` ou ausente = retirada no balcão (RN05, RN45). */
  delivery?: Address | null;
  /** Modelo configurado pelo operador (RF23); `null` ou ausente = o padrão. */
  template?: string | null;
}

// ---------- Modelo da mensagem (RF23; cenários C84–C87) ----------

/**
 * Campos do modelo. Os obrigatórios garantem que o pedido chegue completo: código (RN09),
 * itens com código do PDV (RN41), retirada ou entrega e os dados do cliente (RN06).
 */
export const MESSAGE_FIELDS = [
  { key: 'codigo', required: true, label: 'Código do pedido, ex: VNL-7K3QX' },
  { key: 'itens', required: true, label: 'Lista de itens, com opções, código do PDV e valor' },
  { key: 'total', required: false, label: 'Total ou total estimado (some com os preços ocultos)' },
  { key: 'recebimento', required: true, label: 'Retirada ou entrega, com data, horário e endereço' },
  { key: 'nome', required: true, label: 'Nome completo do cliente' },
  { key: 'cpf', required: true, label: 'CPF do cliente' },
  { key: 'telefone', required: true, label: 'Telefone do cliente' },
  { key: 'observacao', required: false, label: 'Observação do pedido, se houver' },
] as const;
export type MessageField = (typeof MESSAGE_FIELDS)[number]['key'];

export const MESSAGE_TEMPLATE_MAX_LENGTH = 1000;

/** O modelo padrão: a mensagem que o site sempre enviou. */
export const DEFAULT_MESSAGE_TEMPLATE = [
  '*Pedido {codigo}*',
  '',
  '*Itens*',
  '{itens}',
  '{total}',
  '',
  '{recebimento}',
  '*Nome:* {nome}',
  '*CPF:* {cpf}',
  '*Telefone:* {telefone}',
  '{observacao}',
].join('\n');

/** Problema no modelo, ou null (C86). */
export function messageTemplateProblem(template: string): string | null {
  if (!template.trim()) return 'Escreva o modelo da mensagem';
  if (template.length > MESSAGE_TEMPLATE_MAX_LENGTH)
    return `O modelo pode ter até ${MESSAGE_TEMPLATE_MAX_LENGTH} caracteres`;
  const known = new Set<string>(MESSAGE_FIELDS.map((f) => f.key));
  for (const [, key] of template.matchAll(/\{([^{}\s]*)\}/g))
    if (!known.has(key!)) return `O campo {${key}} não existe. Use só os campos da lista.`;
  for (const f of MESSAGE_FIELDS)
    if (f.required && !template.includes(`{${f.key}}`)) return `Falta o campo {${f.key}}: ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}`;
  return null;
}

/**
 * Preenche o modelo. Uma linha só com um campo vazio (ex: {observacao} sem observação) some,
 * e linhas em branco repetidas viram uma.
 */
export function fillMessageTemplate(template: string, values: Record<MessageField, string>): string {
  const lines = template.split('\n').flatMap((line) => {
    const onlyField = /^\s*\{(\w+)\}\s*$/.exec(line);
    // Object.hasOwn, não "in": {toString} ou {constructor} não podem pegar algo herdado do objeto.
    // O modelo salvo já vem validado (messageTemplateProblem); isto protege quem chama direto.
    const filled = line.replace(/\{(\w+)\}/g, (m, k: string) =>
      Object.hasOwn(values, k) ? values[k as MessageField] : m,
    );
    if (onlyField && !filled.trim()) return [];
    return filled.split('\n');
  });
  return lines
    .filter((l, i) => l.trim() !== '' || (i > 0 && lines[i - 1]!.trim() !== ''))
    .join('\n')
    .trim();
}

/** Valores de exemplo para a pré-visualização no painel (C85). */
export const SAMPLE_MESSAGE_VALUES: Record<MessageField, string> = {
  codigo: 'VNL-7K3QX',
  itens: '• 25x Coxinha [cód. 1002] — R$ 40,00\n• 1x Torta Macron (Mini) [cód. 2001] — R$ 79,90 a R$ 95,88 (estimado)',
  total: 'Total estimado: R$ 119,90 a R$ 135,88',
  recebimento: '*Retirada:* Sáb 12/12 às 10:00',
  nome: 'Maria da Silva',
  cpf: '123.456.789-09',
  telefone: '(51) 99999-9999',
  observacao: '*Observação:* Sem cebola, por favor.',
};

function pickupText(p: OrderPickup): string {
  const day = formatDay(p);
  return p.special || !p.time ? `${day} (${p.special ?? 'data especial'}), horário a combinar` : `${day} às ${p.time}`;
}

/**
 * Texto do pedido. A versão compacta tira o valor de cada item e mantém só o total,
 * para pedidos grandes caberem no link (RNF07).
 */
export function buildOrderMessage(input: OrderMessageInput, compact = false): string {
  const { code, lines, pickup, customer, delivery, template } = input;
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

  const values: Record<MessageField, string> = {
    codigo: code,
    itens: items.join('\n'),
    total: total ? `${estimated ? 'Total estimado' : 'Total'}: ${formatRange(total)}` : '',
    recebimento: delivery
      ? `*Entrega:* ${pickupText(pickup)}\n*Endereço:* ${formatAddress(delivery)}`
      : `*Retirada:* ${pickupText(pickup)}`,
    nome: customer.name.trim(),
    cpf: customer.cpf,
    telefone: customer.phone,
    observacao: customer.note.trim() ? `*Observação:* ${customer.note.trim()}` : '',
  };
  return fillMessageTemplate(template || DEFAULT_MESSAGE_TEMPLATE, values);
}

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${onlyDigits(number)}?text=${encodeURIComponent(text)}`;
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
