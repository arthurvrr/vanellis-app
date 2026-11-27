import { dataHora, type AvisoDTO, type AvisosDTO, type EventoDTO, type ReminderKind } from '@vanellis/shared';
import { useState } from 'react';
import { api } from './api';

interface Props {
  dados: AvisosDTO | null;
  /** Recebe a resposta nova depois de uma ação (Ciente, revisão marcada). */
  onAtualizar: (dados: AvisosDTO) => void;
  onRecarregar: () => Promise<void>;
  onAuthError: (e: unknown) => boolean;
}

const COR: Record<AvisoDTO['gravidade'], string> = {
  vermelho: 'Problema de sistema',
  amarelo: 'Pede ação',
  azul: 'Informação',
};

// Tela Avisos (RF66–RF68, RN71–RN74; C139, C142, C144): o que vale agora, por gravidade, cada um
// com o atalho para resolver, e o histórico de problemas e ações na loja.
export function Avisos({ dados, onAtualizar, onRecarregar, onAuthError }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!dados) return <p className="status">{erro ?? 'Carregando…'}</p>;

  const executar = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
    } catch (e) {
      if (!onAuthError(e)) setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };
  const ciente = (id: number) => executar(async () => onAtualizar(await api.ciente(id)));
  const revisado = (kind: ReminderKind) =>
    executar(async () => {
      await api.revisado(kind);
      await onRecarregar();
    });
  const pedeCiente = (id: number | null) =>
    dados.podeMarcarCiente && id !== null && dados.historico.some((e) => e.id === id && e.pedeCiente);

  return (
    <section className="painel__page avisos" aria-labelledby="avisos-title">
      <h2 id="avisos-title">Avisos</h2>
      {erro && (
        <p className="field__error" role="alert">
          {erro}
        </p>
      )}

      <section aria-labelledby="avisos-agora">
        <h3 id="avisos-agora">Agora</h3>
        {dados.agora.length === 0 ? (
          <p className="avisos__ok">
            Tudo certo. {dados.proximaRevisao}
          </p>
        ) : (
          <ul className="avisos__lista">
            {dados.agora.map((a) => (
              <li key={a.chave} className={`aviso aviso--${a.gravidade}`}>
                <div>
                  <span className="aviso__cor">{COR[a.gravidade]}</span>
                  <strong>{a.titulo}</strong>
                  {a.detalhe && <p>{a.detalhe}</p>}
                </div>
                <div className="aviso__acoes">
                  {a.acao && (
                    <a className="switch__btn" href={a.acao.href}>
                      {a.acao.rotulo}
                    </a>
                  )}
                  {a.tipo === 'revisao-vencida' && (
                    <button
                      type="button"
                      className="add"
                      disabled={ocupado}
                      onClick={() => revisado(a.chave.split(':')[1] as ReminderKind)}
                    >
                      Marquei como revisado
                    </button>
                  )}
                  {pedeCiente(a.eventoId) && (
                    <button type="button" className="add" disabled={ocupado} onClick={() => ciente(a.eventoId!)}>
                      Ciente
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="avisos-historico">
        <h3 id="avisos-historico">Histórico</h3>
        <p className="field__help">Problemas de sistema e ações na loja do último ano, do mais novo para o mais antigo.</p>
        {dados.historico.length === 0 ? (
          <p className="avisos__ok">Nada registrado ainda.</p>
        ) : (
          <ul className="avisos__historico">
            {dados.historico.map((e) => (
              <li key={e.id} className={e.pedeCiente && e.fim !== null ? 'registro registro--pendente' : 'registro'}>
                <span>
                  {e.titulo}
                  {e.conta && ` por ${e.conta}`}
                </span>
                <span className="registro__quando">{quando(e)}</span>
                {/* O ativo tem o Ciente em Agora; aqui, só o que já se resolveu. */}
                {e.pedeCiente && e.fim !== null && dados.podeMarcarCiente && (
                  <button type="button" className="add" disabled={ocupado} onClick={() => ciente(e.id)}>
                    Ciente
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

/** "27/11 14:10 → 27/11 17:30", "desde 27/11 06:00, em aberto", "27/11 09:00 · visto por arthur". */
function quando(e: EventoDTO): string {
  let texto: string;
  if (e.fim === null) texto = `desde ${dataHora(e.inicio)}, em aberto`;
  else if (e.fim === e.inicio) texto = dataHora(e.inicio);
  else texto = `${dataHora(e.inicio)} → ${dataHora(e.fim)}`;
  if (e.contaFim && e.contaFim !== e.conta) texto += ` (encerrado por ${e.contaFim})`;
  if (e.cientePor) texto += ` · visto por ${e.cientePor}`;
  return texto;
}
