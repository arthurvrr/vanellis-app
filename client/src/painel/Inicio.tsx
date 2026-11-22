import { useEffect, useState } from 'react';
import { api, type Status } from './api';

interface Props {
  onAuthError: (e: unknown) => boolean;
}

// Tela 2 do painel: Início (RF24, RF39, cenários C9–C14). Os lembretes (RF36) entram na etapa 7.
export function Inicio({ onAuthError }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<keyof Status | null>(null);

  useEffect(() => {
    api
      .status()
      .then(setStatus)
      .catch((e: unknown) => onAuthError(e) || setErro(e instanceof Error ? e.message : String(e)));
  }, [onAuthError]);

  const toggle = async (key: keyof Status) => {
    if (!status) return;
    setErro(null);
    setSalvando(key);
    try {
      setStatus(await api.setStatus({ [key]: !status[key] }));
    } catch (e) {
      if (!onAuthError(e)) setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  };

  if (!status) return <p className="status">{erro ?? 'Carregando…'}</p>;

  return (
    <section className="painel__page" aria-labelledby="inicio-title">
      <h2 id="inicio-title">Início</h2>

      {/* Avisos permanentes: ficam aqui enquanto a opção estiver ligada (RF39). */}
      {(status.ordersPaused || status.pricesHidden) && (
        <div className="alerts">
          {status.ordersPaused && (
            <p className="alert" role="status">
              <strong>Pedidos pausados.</strong> O site não está aceitando novos pedidos.
            </p>
          )}
          {status.pricesHidden && (
            <p className="alert" role="status">
              <strong>Preços ocultos.</strong> O cardápio do site está sem valores.
            </p>
          )}
        </div>
      )}
      {erro && (
        <p className="field__error" role="alert">
          {erro}
        </p>
      )}

      <div className="switches">
        <article className="switch">
          <div>
            <h3>Pedidos pelo site</h3>
            <p className={status.ordersPaused ? 'switch__state switch__state--off' : 'switch__state'}>
              {status.ordersPaused ? 'Pausados' : 'Abertos'}
            </p>
            <p className="field__help">
              Pausado, o cliente vê o cardápio mas não consegue enviar pedidos. Use em feriados ou quando a produção
              lotar.
            </p>
          </div>
          <button
            type="button"
            className="switch__btn"
            disabled={salvando !== null}
            onClick={() => toggle('ordersPaused')}
          >
            {status.ordersPaused ? 'Retomar pedidos' : 'Pausar pedidos'}
          </button>
        </article>

        <article className="switch">
          <div>
            <h3>Preços no site</h3>
            <p className={status.pricesHidden ? 'switch__state switch__state--off' : 'switch__state'}>
              {status.pricesHidden ? 'Ocultos' : 'Visíveis'}
            </p>
            <p className="field__help">
              Ocultos, o site não mostra nenhum valor, nem na mensagem do pedido. Use enquanto os preços estiverem
              desatualizados.
            </p>
          </div>
          <button
            type="button"
            className="switch__btn"
            disabled={salvando !== null}
            onClick={() => toggle('pricesHidden')}
          >
            {status.pricesHidden ? 'Mostrar preços' : 'Ocultar preços'}
          </button>
        </article>
      </div>
    </section>
  );
}
