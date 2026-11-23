// Tela Preços do painel (etapa 4: RF31; cenários C62–C66). Regras compartilhadas entre a tela,
// que valida enquanto o operador digita, e o servidor, que valida de novo ao salvar.

import type { PriceMode, SaleUnit } from './catalogo';

export interface PrecoOpcaoDTO {
  id: number;
  groupName: string;
  name: string;
  priceMode: PriceMode;
  price: number;
}

export interface PrecoProdutoDTO {
  id: number;
  name: string;
  saleUnit: SaleUnit;
  available: boolean;
  /** Preço da unidade ou do kg; null quando um grupo de opções define o preço. */
  price: number | null;
  /** Só as opções com preço próprio (trocam ou somam). */
  options: PrecoOpcaoDTO[];
}

export interface PrecoCategoriaDTO {
  id: number;
  name: string;
  produtos: PrecoProdutoDTO[];
}

export interface PrecoAlteracao {
  id: number;
  price: number;
}

/** O que o painel envia ao salvar: só as linhas alteradas, gravadas todas juntas (C64). */
export interface PrecosPatch {
  produtos: PrecoAlteracao[];
  opcoes: PrecoAlteracao[];
}

export const PRECO_MAXIMO = 99999;

/** "1,80", "1.8", " 12 " → número; vazio → null; texto que não é número → NaN. */
export function parsePreco(text: string): number | null {
  const t = text.trim().replace(/^R\$\s*/i, '').replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return NaN;
  return Number(t);
}

/** 1.8 → "1,80" (campo de edição, sem "R$"). */
export const mostrarPreco = (n: number) => n.toFixed(2).replace('.', ',');

/**
 * Problema do preço, ou null se está certo. Um adicional que soma pode ser R$ 0,00
 * (ex: escolha sem custo); o preço do produto e o de uma opção que troca o preço, não.
 */
export function problemaPreco(price: number | null, priceMode: PriceMode | null = null): string | null {
  if (price === null) return 'Informe o preço';
  if (!Number.isFinite(price)) return 'Use só números, ex: 12,90';
  if (price < 0) return 'O preço não pode ser negativo';
  if (price === 0 && priceMode !== 'add') return 'O preço precisa ser maior que zero';
  if (price > PRECO_MAXIMO) return 'Preço alto demais';
  if (Math.round(price * 100) !== Number((price * 100).toFixed(6))) return 'Use no máximo dois dígitos após a vírgula';
  return null;
}

/** "Pães de Queijo" casa com "paes" e "QUEIJO" (C66): sem acento nem maiúsculas. */
export function casaBusca(nome: string, busca: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return norm(nome).includes(norm(busca.trim()));
}
