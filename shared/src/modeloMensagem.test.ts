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

  it('a linha do campo vazio some mesmo sem brancos em volta ou com espaços nas pontas', () => {
    const vazio = { ...SAMPLE_MESSAGE_VALUES, observacao: '', total: '' };
    expect(fillMessageTemplate('A\n{observacao}\nB', vazio)).toBe('A\nB');
    expect(fillMessageTemplate('A\n  {observacao}  \nB', vazio)).toBe('A\nB');
  });

  it('linha com dois campos vazios não é "só um campo": fica como linha em branco', () => {
    const vazio = { ...SAMPLE_MESSAGE_VALUES, observacao: '', total: '' };
    expect(fillMessageTemplate('A\n{total} {observacao}\nB', vazio)).toBe('A\n \nB');
  });

  it('linha só com espaços conta como branca ao juntar brancos repetidos', () => {
    expect(fillMessageTemplate('A\n \n\nB', SAMPLE_MESSAGE_VALUES)).toBe('A\n \nB');
    expect(fillMessageTemplate('A\n\n \nB', SAMPLE_MESSAGE_VALUES)).toBe('A\n\nB');
  });

  it('linhas em branco no começo do modelo somem', () => {
    expect(fillMessageTemplate('\n\nA', SAMPLE_MESSAGE_VALUES)).toBe('A');
  });
});

describe('C85: pré-visualização no painel', () => {
  it('o modelo padrão preenchido com os valores de exemplo', () => {
    expect(fillMessageTemplate(DEFAULT_MESSAGE_TEMPLATE, SAMPLE_MESSAGE_VALUES)).toBe(
      [
        '*Pedido VNL-7K3QX*',
        '',
        '*Itens*',
        '• 25x Coxinha [cód. 1002] — R$ 40,00',
        '• 1x Torta Macron (Mini) [cód. 2001] — R$ 79,90 a R$ 95,88 (estimado)',
        'Total estimado: R$ 119,90 a R$ 135,88',
        '',
        '*Retirada:* Sáb 12/12 às 10:00',
        '*Nome:* Maria da Silva',
        '*CPF:* 123.456.789-09',
        '*Telefone:* (51) 99999-9999',
        '*Observação:* Sem cebola, por favor.',
      ].join('\n'),
    );
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
  it('diz o que é o campo que falta, com a descrição em minúscula', () => {
    expect(messageTemplateProblem(DEFAULT_MESSAGE_TEMPLATE.replace('{codigo}', ''))).toBe(
      'Falta o campo {codigo}: código do pedido, ex: VNL-7K3QX',
    );
    expect(messageTemplateProblem(DEFAULT_MESSAGE_TEMPLATE.replace('{telefone}', ''))).toBe(
      'Falta o campo {telefone}: telefone do cliente',
    );
  });
  it('aceita sem os opcionais', () => {
    expect(messageTemplateProblem(DEFAULT_MESSAGE_TEMPLATE.replace('{total}', '').replace('{observacao}', ''))).toBeNull();
  });
  it('recusa campo que não existe, vazio e longo demais', () => {
    expect(messageTemplateProblem(`${DEFAULT_MESSAGE_TEMPLATE}\n{preco}`)).toMatch('O campo {preco} não existe');
    expect(messageTemplateProblem('   ')).toMatch(/Escreva/);
    expect(messageTemplateProblem(DEFAULT_MESSAGE_TEMPLATE + 'x'.repeat(1000))).toMatch(/até 1000/);
  });
  it('aceita o modelo com exatamente 1000 caracteres', () => {
    const template = DEFAULT_MESSAGE_TEMPLATE + 'x'.repeat(1000 - DEFAULT_MESSAGE_TEMPLATE.length);
    expect(template).toHaveLength(1000);
    expect(messageTemplateProblem(template)).toBeNull();
  });
});

describe('fillMessageTemplate: campo fora da lista (G19)', () => {
  it('mantém o texto do campo e não usa nada herdado do objeto', () => {
    expect(fillMessageTemplate('{toString} {constructor} {xyz}', SAMPLE_MESSAGE_VALUES)).toBe(
      '{toString} {constructor} {xyz}',
    );
  });
});
