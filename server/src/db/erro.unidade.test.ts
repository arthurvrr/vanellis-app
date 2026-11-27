// Logs das tarefas agendadas: num erro do Drizzle, o `message` é só a consulta; o motivo de
// verdade (tabela que não existe, banco fora do ar) fica no `cause`.
import { describe, expect, it } from 'vitest';
import { descreverErro } from './erro';

describe('descreverErro', () => {
  it('erro simples: só a mensagem', () => {
    expect(descreverErro(new Error('banco fora do ar'))).toBe('banco fora do ar');
  });

  it('erro de consulta: a causa primeiro e a consulta entre parênteses, sem os parâmetros', () => {
    const e = new Error('Failed query: select "id" from "aviso_evento"\nparams: vermelho', {
      cause: new Error('relação "aviso_evento" não existe'),
    });
    expect(descreverErro(e)).toBe('relação "aviso_evento" não existe (Failed query: select "id" from "aviso_evento")');
  });

  it('causa que não é Error vira texto', () => {
    expect(descreverErro(new Error('Failed query: x', { cause: { code: '57P01' } }))).toBe(
      '{"code":"57P01"} (Failed query: x)',
    );
  });

  it('algo lançado que não é Error vira texto', () => {
    expect(descreverErro('quebrou')).toBe('quebrou');
    expect(descreverErro(undefined)).toBe('undefined');
  });
});
