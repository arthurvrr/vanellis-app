/**
 * Texto de um erro para os logs das tarefas agendadas. Num erro do Drizzle, o `message` é só a
 * consulta ("Failed query: ...\nparams: ...") e o motivo de verdade fica no `cause`: o log mostra
 * o motivo primeiro e a consulta entre parênteses, sem os parâmetros.
 */
export function descreverErro(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  if (e.cause === undefined) return e.message;
  const causa = e.cause instanceof Error ? e.cause.message : JSON.stringify(e.cause);
  return `${causa} (${e.message.split('\n')[0]})`;
}
