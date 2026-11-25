// Dados do cliente no checkout (RN02): validados no navegador e nunca guardados.

export interface CustomerData {
  name: string;
  cpf: string;
  phone: string;
  note: string;
}

export const NAME_MAX_LENGTH = 60;
export const NOTE_MAX_LENGTH = 200;

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** CPF com 11 dígitos e dígitos verificadores corretos. */
export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  // Stryker disable next-line Regex: equivalente, já se sabe que são 11 dígitos, então as âncoras não mudam nada
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

/** Telefone com DDD: fixo com 10 dígitos ou celular com 11 começando por 9. */
export function isValidPhone(value: string): boolean {
  const phone = onlyDigits(value);
  const ddd = Number(phone.slice(0, 2));
  if (ddd < 11) return false;
  if (phone.length === 11) return phone[2] === '9';
  // Stryker disable next-line StringLiteral: inalcançável, com 10 dígitos phone[2] sempre existe (o ?? só satisfaz o tipo)
  return phone.length === 10 && /[2-5]/.test(phone[2] ?? '');
}

/** Nome completo: ao menos duas palavras com letras. */
export function isValidFullName(value: string): boolean {
  // Sem trim: as palavras vazias das pontas caem no filtro de letras.
  // Stryker disable next-line Regex: equivalente, as palavras vazias entre espaços repetidos caem no filtro abaixo
  const words = value.split(/\s+/);
  return words.filter((w) => /\p{L}/u.test(w)).length >= 2;
}

/** "123.456.789-09" enquanto digita. */
export function formatCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(
      // Stryker disable next-line Regex: equivalente, a string só tem dígitos e o primeiro casamento já é no início
      /^(\d{3})(\d)/,
      '$1.$2',
    )
    .replace(
      // Stryker disable next-line Regex: equivalente, o único ponto fica logo após os 3 primeiros dígitos
      /^(\d{3})\.(\d{3})(\d)/,
      '$1.$2.$3',
    )
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** "(51) 99528-4226" ou "(51) 3333-4444" enquanto digita. */
export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const ddd = `(${d.slice(0, 2)}) `;
  const rest = d.slice(2);
  if (rest.length <= 4) return ddd + rest;
  const split = d.length === 11 ? 5 : 4;
  return `${ddd}${rest.slice(0, split)}-${rest.slice(split)}`;
}

export type CustomerErrors = Partial<Record<keyof CustomerData, string>>;

/**
 * Endereço da tele-entrega (RN45): vai só na mensagem do WhatsApp, como os dados do cliente
 * (RN02). Rua, número, bairro e cidade obrigatórios; complemento e referência opcionais.
 */
export interface Address {
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  reference: string;
}
export const emptyAddress: Address = { street: '', number: '', complement: '', district: '', city: '', reference: '' };
export const ADDRESS_MAX_LENGTH = 80;
export type AddressErrors = Partial<Record<keyof Address, string>>;

export function validateAddress(a: Address): AddressErrors {
  const errors: AddressErrors = {};
  const required: [keyof Address, string][] = [
    ['street', 'Informe a rua.'],
    ['number', 'Informe o número (ou "s/n").'],
    ['district', 'Informe o bairro.'],
    ['city', 'Informe a cidade.'],
  ];
  for (const [k, msg] of required) if (!a[k].trim()) errors[k] = msg;
  for (const k of Object.keys(a) as (keyof Address)[])
    if (a[k].length > ADDRESS_MAX_LENGTH) errors[k] = `Use até ${ADDRESS_MAX_LENGTH} caracteres.`;
  return errors;
}

/** "Rua das Flores, 123, ap 2 - Centro, Xangri-lá (ref.: perto da praça)" */
export function formatAddress(a: Address): string {
  const t = (s: string) => s.trim();
  let text = `${t(a.street)}, ${t(a.number)}`;
  if (t(a.complement)) text += `, ${t(a.complement)}`;
  text += ` - ${t(a.district)}, ${t(a.city)}`;
  if (t(a.reference)) text += ` (ref.: ${t(a.reference)})`;
  return text;
}

export function validateCustomer(data: CustomerData): CustomerErrors {
  const errors: CustomerErrors = {};
  if (data.name.trim().length > NAME_MAX_LENGTH) errors.name = `Use até ${NAME_MAX_LENGTH} caracteres.`;
  else if (!isValidFullName(data.name)) errors.name = 'Informe nome e sobrenome.';
  if (!isValidCPF(data.cpf)) errors.cpf = 'CPF inválido.';
  if (!isValidPhone(data.phone)) errors.phone = 'Informe o telefone com DDD.';
  if (data.note.length > NOTE_MAX_LENGTH) errors.note = `Use até ${NOTE_MAX_LENGTH} caracteres.`;
  return errors;
}
