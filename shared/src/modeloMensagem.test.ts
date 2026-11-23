// Cenários C84–C87 (etapa 5): modelo da mensagem do WhatsApp.
import { describe, expect, it } from 'vitest';
import {
  buildOrderMessage,
  DEFAULT_MESSAGE_TEMPLATE,
  fillMessageTemplate,
  messageTemplateProblem,
  SAMPLE_MESSAGE_VALUES,
} from './mensagem';

const input = {
  code: 'VNL-ABCDE',
  lines: [],
  pickup: { date: '2026-12-12', weekday: 6, time: '10:00', special: null },
  customer: { name: 'Ana Souza', cpf: '529.982.247-25', phone: '(51) 99999-9999', note: '' },
};

describe('C84: modelo personalizado', () => {
  it('a saudação vem antes do pedido, com todos os campos preenchidos', () => {
    const template = `Olá, Vanellis! Quero fazer um pedido.\n\n${DEFAULT_MESSAGE_TEMPLATE}`;
    const msg = buildOrderMessage({ ...input, template });
    expect(msg.split('\n')[0]).toBe('Olá, Vanellis! Quero fazer um pedido.');
    expect(msg).toContain('*Pedido VNL-ABCDE*');
    expect(msg).toContain('*Retirada:* Sáb 12/12 às 10:00');
    expect(msg).toContain('*Nome:* Ana Souza');
  });

  it('sem modelo, usa o padrão', () => {
    expect(buildOrderMessage(input)).toBe(buildOrderMessage({ ...input, template: DEFAULT_MESSAGE_TEMPLATE }));
    expect(buildOrderMessage({ ...input, template: null })).toBe(buildOrderMessage(input));
  });

  it('linha só com campo vazio some; brancos repetidos viram um', () => {
    expect(fillMessageTemplate('A\n\n{observacao}\n\nB', { ...SAMPLE_MESSAGE_VALUES, observacao: '' })).toBe('A\n\nB');
    expect(fillMessageTemplate('Obs: {observacao}', { ...SAMPLE_MESSAGE_VALUES, observacao: '' })).toBe('Obs:');
  });
});

describe('C86: campos obrigatórios e desconhecidos', () => {
  it('o padrão é válido', () => {
    expect(messageTemplateProblem(DEFAULT_MESSAGE_TEMPLATE)).toBeNull();
  });
  it('recusa sem um campo obrigatório', () => {
    for (const k of ['codigo', 'itens', 'recebimento', 'nome', 'cpf', 'telefone'])
      expect(messageTemplateProblem(DEFAULT_MESSAGE_TEMPLATE.replace(`{${k}}`, ''))).toMatch(`Falta o campo {${k}}`);
  });
  it('aceita sem os opcionais', () => {
    expect(messageTemplateProblem(DEFAULT_MESSAGE_TEMPLATE.replace('{total}', '').replace('{observacao}', ''))).toBeNull();
  });
  it('recusa campo que não existe, vazio e longo demais', () => {
    expect(messageTemplateProblem(`${DEFAULT_MESSAGE_TEMPLATE}\n{preco}`)).toMatch('O campo {preco} não existe');
    expect(messageTemplateProblem('   ')).toMatch(/Escreva/);
    expect(messageTemplateProblem(DEFAULT_MESSAGE_TEMPLATE + 'x'.repeat(1000))).toMatch(/até 1000/);
  });
});
