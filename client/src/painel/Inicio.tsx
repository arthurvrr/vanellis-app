import { overdueText, REMINDERS, type ReminderKind, type ReminderWithStatus } from '@vanellis/shared';
import { useEffect, useState } from 'react';
import { api, type Status } from './api';

interface Props {
  onAuthError: (e: unknown) => boolean;
}

// Tela 2 do painel: Início (RF24, RF39, cenários C9–C14) e lembretes de revisão vencidos
// (RF36, RN34–RN36, cenários C89–C91).
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
      <Lembretes onAuthError={onAuthError} />

      {/* Avisos permanentes: ficam aqui enquanto a opção estiver ligada (RF39). */}
      {/* Produtos sem código PDV: aviso até zerar (RN41, cenário C46). */}
      {!!status.pdvMissing && (
        <p className="alert alert--info" role="status">
          <strong>
            {status.pdvMissing} {status.pdvMissing === 1 ? 'produto sem' : 'produtos sem'} código PDV.
          </strong>{' '}
          Eles continuam no cardápio, mas a mensagem do pedido vai sem o código.{' '}
          <a href="#produtos-sem-pdv">Ver produtos</a>
        </p>
      )}
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

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Lembretes de revisão: os vencidos com atalho e "revisado"; em dia, a próxima revisão. */
function Lembretes({ onAuthError }: Props) {
  const [lista, setLista] = useState<ReminderWithStatus[] | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<ReminderKind | null>(null);

  useEffect(() => {
    api
      .lembretes()
      .then(setLista)
      .catch((e: unknown) => onAuthError(e) || setErro(e instanceof Error ? e.message : String(e)));
  }, [onAuthError]);

  if (!lista) return erro ? <p className="field__error">{erro}</p> : null;

  const info = (kind: ReminderKind) => REMINDERS.find((r) => r.kind === kind)!;
  const vencidos = lista.filter((l) => l.status.due);
  const proximo = [...lista].sort((a, b) => a.status.dueDate.localeCompare(b.status.dueDate))[0];

  const revisar = async (l: ReminderWithStatus) => {
    setSalvando(l.kind);
    setErro(null);
    setOk(null);
    try {
      setLista(await api.revisado(l.kind));
      setOk(`${info(l.kind).label}: revisão registrada. Próxima daqui a ${l.everyDays} dias.`);
    } catch (e) {
      if (!onAuthError(e)) setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <section className="lembretes-inicio" aria-labelledby="lembretes-title">
      <h3 id="lembretes-title">
        Revisões{' '}
        <a className="lembretes-inicio__config" href="#configuracoes/lembretes">
          frequência
        </a>
      </h3>
      {vencidos.length === 0 ? (
        <p className="lembretes-inicio__ok">
          Tudo em dia.
          {proximo &&
            ` Próxima: ${info(proximo.kind).label.toLowerCase()} em ${br(proximo.status.dueDate)} (${overdueText(proximo.status)}).`}
        </p>
      ) : (
        <ul className="lembretes-inicio__lista">
          {vencidos.map((l) => {
            const r = info(l.kind);
            return (
              <li key={l.kind} className="lembrete-vencido">
                <div>
                  <strong>{r.label}</strong>: revisão {overdueText(l.status)}
                  <p className="field__help">
                    {r.help}{' '}
                    {l.lastReviewed ? `Última revisão em ${br(l.lastReviewed)}.` : 'Ainda não revisado.'}
                  </p>
                </div>
                <div className="lembrete-vencido__acoes">
                  <a className="switch__btn" href={r.href}>
                    Abrir {r.screen}
                  </a>
                  <button
                    type="button"
                    className="add"
                    disabled={salvando !== null}
                    onClick={() => revisar(l)}
                  >
                    Marquei como revisado
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {ok && (
        <p className="form-ok" role="status">
          {ok}
        </p>
      )}
      {erro && (
        <p className="field__error" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
