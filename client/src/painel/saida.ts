// Aviso de alterações não salvas (cenário C65). Uma tela registra a pergunta enquanto tem
// algo pendente; o PainelApp a faz antes de trocar de tela, e o navegador, antes de fechar.

let pergunta: string | null = null;

const onBeforeUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
};

export function avisarAoSair(texto: string | null) {
  if (texto && !pergunta) window.addEventListener('beforeunload', onBeforeUnload);
  if (!texto && pergunta) window.removeEventListener('beforeunload', onBeforeUnload);
  pergunta = texto;
}

/** true se pode sair: não há nada pendente, ou o operador confirmou. */
export function podeSair(): boolean {
  if (!pergunta || !window.confirm(pergunta)) return !pergunta;
  avisarAoSair(null);
  return true;
}
