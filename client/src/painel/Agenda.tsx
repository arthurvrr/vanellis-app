import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, type AgendaPainel, type Horario } from './api';

// Tela Agenda do painel (RF20, RF21, RF22, RF35; cenários C24–C35).
// O site do cliente já segue todas estas regras; aqui o operador as mantém.

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ORDEM = [1, 2, 3, 4, 5, 6, 0]; // segunda primeiro, como a padaria pensa a semana

/** 2026-12-24 → 24/12/2026 */
const br = (d: string) => d.split('-').reverse().join('/');
const hora = (t: string) => t.replace(':', 'h');

function periodo(validFrom: string, validUntil: string | null) {
  return validUntil ? `de ${br(validFrom)} a ${br(validUntil)}` : `a partir de ${br(validFrom)}`;
}

function resumoSemana(hours: Horario[]) {
  return ORDEM.map((wd) => {
    const h = hours.find((x) => x.weekday === wd);
    return `${DIAS[wd]!.slice(0, 3)} ${h ? `${hora(h.open)}–${hora(h.close)}` : 'fechado'}`;
  }).join(' · ');
}

function descreveRestricao(r: AgendaPainel['restrictions'][number]) {
  const dia = r.weekday === null ? 'Todos os dias' : DIAS[r.weekday];
  const regra =
    r.start === '00:00'
      ? `retirada só a partir das ${hora(r.end)}`
      : `sem retirada das ${hora(r.start)} às ${hora(r.end)}`;
  return `${dia}: ${regra}${r.label ? ` (${r.label})` : ''}`;
}

// ---------- editor da semana ----------

type Semana = Record<number, { aberto: boolean; open: string; close: string }>;

function toSemana(hours: Horario[]): Semana {
  const s: Semana = {};
  for (let wd = 0; wd < 7; wd++) {
    const h = hours.find((x) => x.weekday === wd);
    s[wd] = h ? { aberto: true, open: h.open, close: h.close } : { aberto: false, open: '07:30', close: '19:00' };
  }
  return s;
}
const fromSemana = (s: Semana): Horario[] =>
  ORDEM.filter((wd) => s[wd]!.aberto).map((wd) => ({ weekday: wd, open: s[wd]!.open, close: s[wd]!.close }));

function EditorSemana({ value, onChange }: { value: Semana; onChange: (s: Semana) => void }) {
  return (
    <div className="week" role="group" aria-label="Horário de cada dia">
      {ORDEM.map((wd) => {
        const d = value[wd]!;
        const set = (patch: Partial<typeof d>) => onChange({ ...value, [wd]: { ...d, ...patch } });
        return (
          <div key={wd} className={d.aberto ? 'week__row' : 'week__row week__row--off'}>
            <label className="week__day">
              <input type="checkbox" checked={d.aberto} onChange={(e) => set({ aberto: e.target.checked })} />
              {DIAS[wd]}
            </label>
            {d.aberto ? (
              <span className="week__times">
                <input
                  type="time"
                  aria-label={`${DIAS[wd]}: abre`}
                  value={d.open}
                  onChange={(e) => set({ open: e.target.value })}
                />
                <span>às</span>
                <input
                  type="time"
                  aria-label={`${DIAS[wd]}: fecha`}
                  value={d.close}
                  onChange={(e) => set({ close: e.target.value })}
                />
              </span>
            ) : (
              <span className="week__closed">Fechado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- blocos ----------

function Bloco({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section className="card-form agenda__block">
      <h3>{titulo}</h3>
      {ajuda && <p className="field__help">{ajuda}</p>}
      {children}
    </section>
  );
}

function Lista({ vazia, children }: { vazia: string; children: ReactNode[] }) {
  return children.length ? <ul className="agenda__list">{children}</ul> : <p className="agenda__empty">{vazia}</p>;
}

function Item({ children, acao, onAcao }: { children: ReactNode; acao: string; onAcao: () => void }) {
  return (
    <li>
      <span>{children}</span>
      <button type="button" className="link" onClick={onAcao}>
        {acao}
      </button>
    </li>
  );
}

// ---------- tela ----------

export function Agenda({ onAuthError }: { onAuthError: (e: unknown) => boolean }) {
  const [agenda, setAgenda] = useState<AgendaPainel | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Formulários
  const [semana, setSemana] = useState<Semana>(toSemana([]));
  const [programando, setProgramando] = useState(false);
  const [mudanca, setMudanca] = useState({ validFrom: '', validUntil: '', semana: toSemana([]) });
  const [bloqueio, setBloqueio] = useState({ date: '', reason: '' });
  const [especial, setEspecial] = useState({ date: '', name: '' });
  const [fechado, setFechado] = useState({ date: '', start: '09:00', end: '11:00' });
  const [restricao, setRestricao] = useState({
    weekday: 'todos',
    tipo: 'apartir',
    start: '12:00',
    end: '14:00',
    label: '',
  });
  const [regras, setRegras] = useState({ minLeadHours: '2', windowMonths: '4' });

  const aplicar = useCallback((a: AgendaPainel) => {
    setAgenda(a);
    setSemana(toSemana(a.current?.hours ?? []));
    setRegras({ minLeadHours: String(a.config.minLeadHours), windowMonths: String(a.config.windowMonths) });
  }, []);

  useEffect(() => {
    api
      .agenda()
      .then(aplicar)
      .catch((e: unknown) => onAuthError(e) || setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }));
  }, [aplicar, onAuthError]);

  /** Envia uma mudança; em sucesso atualiza a tela e mostra `ok`. Devolve se deu certo. */
  const muda = async (method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, ok: string) => {
    setOcupado(true);
    setMsg(null);
    try {
      aplicar(await api.agendaMuda(method, path, body));
      setMsg({ ok: true, text: ok });
      return true;
    } catch (e) {
      if (!onAuthError(e)) setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setOcupado(false);
    }
  };

  if (!agenda) return <p className="status">{msg?.text ?? 'Carregando…'}</p>;

  const salvarSemana = (e: FormEvent) => {
    e.preventDefault();
    void muda(
      'PUT',
      '/horario-atual',
      { hours: fromSemana(semana) },
      'Horário em vigor salvo. O site já segue o novo horário.',
    );
  };

  const abrirProgramacao = () => {
    setMudanca({ validFrom: '', validUntil: '', semana: toSemana(agenda.current?.hours ?? []) });
    setProgramando(true);
  };
  const salvarMudanca = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await muda(
      'POST',
      '/mudancas',
      { validFrom: mudanca.validFrom, validUntil: mudanca.validUntil || null, hours: fromSemana(mudanca.semana) },
      'Mudança programada.',
    );
    if (ok) setProgramando(false);
  };

  const add = async (e: FormEvent, path: string, body: unknown, ok: string, reset: () => void) => {
    e.preventDefault();
    if (await muda('POST', path, body, ok)) reset();
  };

  const salvarRestricao = (e: FormEvent) =>
    add(
      e,
      '/restricoes',
      {
        weekday: restricao.weekday === 'todos' ? null : Number(restricao.weekday),
        start: restricao.tipo === 'apartir' ? '00:00' : restricao.start,
        end: restricao.tipo === 'apartir' ? restricao.start : restricao.end,
        label: restricao.label || null,
      },
      'Restrição criada.',
      () => setRestricao({ ...restricao, label: '' }),
    );

  const c = agenda.current;
  return (
    <section className="painel__page agenda" aria-labelledby="agenda-title">
      <h2 id="agenda-title">Agenda de retirada</h2>
      {msg && (
        <p className={msg.ok ? 'form-ok agenda__msg' : 'field__error agenda__msg'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      {/* 1. Horário em vigor (C24, C25) */}
      <Bloco
        titulo="Horário em vigor"
        ajuda={
          c
            ? `Vale ${periodo(c.validFrom, c.validUntil)}. Mudar aqui vale a partir de agora. A retirada vai até 30 minutos antes de fechar.`
            : 'Nenhum horário cadastrado: o site não oferece dias de retirada.'
        }
      >
        <form onSubmit={salvarSemana}>
          <EditorSemana value={semana} onChange={setSemana} />
          <button type="submit" className="primary" disabled={ocupado}>
            Salvar horário em vigor
          </button>
        </form>
      </Bloco>

      {/* 2. Mudanças programadas (C26–C28) */}
      <Bloco
        titulo="Próximas mudanças"
        ajuda="Um horário novo a partir de uma data. Com data de fim, o horário normal volta sozinho depois."
      >
        <Lista vazia="Nenhuma mudança programada.">
          {agenda.upcoming.map((s) => (
            <Item
              key={s.id}
              acao="Remover"
              onAcao={() => void muda('DELETE', `/mudancas/${s.id}`, {}, 'Mudança removida.')}
            >
              <strong>{periodo(s.validFrom, s.validUntil)}</strong>
              <br />
              <small>{resumoSemana(s.hours)}</small>
            </Item>
          ))}
        </Lista>
        {programando ? (
          <form className="agenda__form" onSubmit={salvarMudanca}>
            <div className="agenda__inline">
              <div className="field">
                <label htmlFor="mud-inicio">Começa em</label>
                <input
                  id="mud-inicio"
                  type="date"
                  required
                  min={agenda.today}
                  value={mudanca.validFrom}
                  onChange={(e) => setMudanca({ ...mudanca, validFrom: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="mud-fim">Termina em (opcional)</label>
                <input
                  id="mud-fim"
                  type="date"
                  min={mudanca.validFrom || agenda.today}
                  value={mudanca.validUntil}
                  onChange={(e) => setMudanca({ ...mudanca, validUntil: e.target.value })}
                />
              </div>
            </div>
            <EditorSemana value={mudanca.semana} onChange={(s) => setMudanca({ ...mudanca, semana: s })} />
            <div className="agenda__actions">
              <button type="button" className="link" onClick={() => setProgramando(false)}>
                Cancelar
              </button>
              <button type="submit" className="add" disabled={ocupado}>
                Programar mudança
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="switch__btn agenda__open" onClick={abrirProgramacao}>
            Programar mudança
          </button>
        )}
      </Bloco>

      {/* 3. Exceções no calendário (C30–C33) */}
      <Bloco titulo="Datas sem retirada" ajuda="Feriados e folgas: o dia some do calendário do cliente.">
        <Lista vazia="Nenhuma data bloqueada.">
          {agenda.blockedDates.map((b) => (
            <Item
              key={b.date}
              acao="Desbloquear"
              onAcao={() => void muda('DELETE', `/datas-bloqueadas/${b.date}`, {}, 'Data desbloqueada.')}
            >
              <strong>{br(b.date)}</strong>
              {b.reason && ` · ${b.reason}`}
            </Item>
          ))}
        </Lista>
        <form
          className="agenda__inline agenda__form"
          onSubmit={(e) =>
            add(
              e,
              '/datas-bloqueadas',
              { date: bloqueio.date, reason: bloqueio.reason || null },
              'Data bloqueada.',
              () => setBloqueio({ date: '', reason: '' }),
            )
          }
        >
          <div className="field">
            <label htmlFor="bl-data">Data</label>
            <input
              id="bl-data"
              type="date"
              required
              min={agenda.today}
              value={bloqueio.date}
              onChange={(e) => setBloqueio({ ...bloqueio, date: e.target.value })}
            />
          </div>
          <div className="field agenda__grow">
            <label htmlFor="bl-motivo">Motivo (opcional)</label>
            <input
              id="bl-motivo"
              maxLength={100}
              placeholder="Ex: feriado"
              value={bloqueio.reason}
              onChange={(e) => setBloqueio({ ...bloqueio, reason: e.target.value })}
            />
          </div>
          <button type="submit" className="add agenda__btn" disabled={ocupado}>
            Bloquear
          </button>
        </form>
      </Bloco>

      <Bloco
        titulo="Datas especiais"
        ajuda="O cliente escolhe só o dia; a padaria combina o horário pelo WhatsApp (ex: vésperas de Natal e Ano Novo)."
      >
        <Lista vazia="Nenhuma data especial.">
          {agenda.specialDates.map((s) => (
            <Item
              key={s.date}
              acao="Remover"
              onAcao={() => void muda('DELETE', `/datas-especiais/${s.date}`, {}, 'Data especial removida.')}
            >
              <strong>{br(s.date)}</strong> · {s.name}
            </Item>
          ))}
        </Lista>
        <form
          className="agenda__inline agenda__form"
          onSubmit={(e) =>
            add(e, '/datas-especiais', especial, 'Data especial cadastrada.', () => setEspecial({ date: '', name: '' }))
          }
        >
          <div className="field">
            <label htmlFor="es-data">Data</label>
            <input
              id="es-data"
              type="date"
              required
              min={agenda.today}
              value={especial.date}
              onChange={(e) => setEspecial({ ...especial, date: e.target.value })}
            />
          </div>
          <div className="field agenda__grow">
            <label htmlFor="es-nome">Nome</label>
            <input
              id="es-nome"
              required
              maxLength={60}
              placeholder="Ex: Véspera de Natal"
              value={especial.name}
              onChange={(e) => setEspecial({ ...especial, name: e.target.value })}
            />
          </div>
          <button type="submit" className="add agenda__btn" disabled={ocupado}>
            Cadastrar
          </button>
        </form>
      </Bloco>

      <Bloco
        titulo="Horários fechados por lotação"
        ajuda="Fecha um período só naquele dia, quando a produção lota. Reabra quando quiser."
      >
        <Lista vazia="Nenhum horário fechado.">
          {agenda.closedPeriods.map((p) => (
            <Item
              key={p.id}
              acao="Reabrir"
              onAcao={() => void muda('DELETE', `/horarios-fechados/${p.id}`, {}, 'Horário reaberto.')}
            >
              <strong>{br(p.date)}</strong> · das {hora(p.start)} às {hora(p.end)}
            </Item>
          ))}
        </Lista>
        <form
          className="agenda__inline agenda__form"
          onSubmit={(e) =>
            add(e, '/horarios-fechados', fechado, 'Horário fechado.', () => setFechado({ ...fechado, date: '' }))
          }
        >
          <div className="field">
            <label htmlFor="fe-data">Data</label>
            <input
              id="fe-data"
              type="date"
              required
              min={agenda.today}
              value={fechado.date}
              onChange={(e) => setFechado({ ...fechado, date: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="fe-de">Das</label>
            <input
              id="fe-de"
              type="time"
              required
              value={fechado.start}
              onChange={(e) => setFechado({ ...fechado, start: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="fe-ate">Às</label>
            <input
              id="fe-ate"
              type="time"
              required
              value={fechado.end}
              onChange={(e) => setFechado({ ...fechado, end: e.target.value })}
            />
          </div>
          <button type="submit" className="add agenda__btn" disabled={ocupado}>
            Fechar
          </button>
        </form>
      </Bloco>

      {/* 4. Regras gerais (C34, C35) */}
      <Bloco titulo="Restrições de retirada" ajuda="Horários em que a loja está aberta, mas não entrega encomendas.">
        <Lista vazia="Nenhuma restrição.">
          {agenda.restrictions.map((r) => (
            <Item
              key={r.id}
              acao="Remover"
              onAcao={() => void muda('DELETE', `/restricoes/${r.id}`, {}, 'Restrição removida.')}
            >
              {descreveRestricao(r)}
            </Item>
          ))}
        </Lista>
        <form className="agenda__inline agenda__form" onSubmit={salvarRestricao}>
          <div className="field">
            <label htmlFor="re-dia">Dia</label>
            <select
              id="re-dia"
              value={restricao.weekday}
              onChange={(e) => setRestricao({ ...restricao, weekday: e.target.value })}
            >
              <option value="todos">Todos os dias</option>
              {ORDEM.map((wd) => (
                <option key={wd} value={wd}>
                  {DIAS[wd]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="re-tipo">Regra</label>
            <select
              id="re-tipo"
              value={restricao.tipo}
              onChange={(e) => setRestricao({ ...restricao, tipo: e.target.value })}
            >
              <option value="apartir">Retirada só a partir de</option>
              <option value="intervalo">Sem retirada das</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="re-ini">{restricao.tipo === 'apartir' ? 'Horário' : 'Das'}</label>
            <input
              id="re-ini"
              type="time"
              required
              value={restricao.start}
              onChange={(e) => setRestricao({ ...restricao, start: e.target.value })}
            />
          </div>
          {restricao.tipo === 'intervalo' && (
            <div className="field">
              <label htmlFor="re-fim">Às</label>
              <input
                id="re-fim"
                type="time"
                required
                value={restricao.end}
                onChange={(e) => setRestricao({ ...restricao, end: e.target.value })}
              />
            </div>
          )}
          <div className="field agenda__grow">
            <label htmlFor="re-nome">Descrição (opcional)</label>
            <input
              id="re-nome"
              maxLength={60}
              placeholder="Ex: almoço da produção"
              value={restricao.label}
              onChange={(e) => setRestricao({ ...restricao, label: e.target.value })}
            />
          </div>
          <button type="submit" className="add agenda__btn" disabled={ocupado}>
            Criar
          </button>
        </form>
      </Bloco>

      <Bloco titulo="Antecedência e prazo">
        <form
          className="agenda__inline"
          onSubmit={(e) => {
            e.preventDefault();
            void muda(
              'PUT',
              '/regras',
              { minLeadHours: Number(regras.minLeadHours), windowMonths: Number(regras.windowMonths) },
              'Regras salvas.',
            );
          }}
        >
          <div className="field">
            <label htmlFor="rg-ant">Antecedência mínima (horas)</label>
            <input
              id="rg-ant"
              type="number"
              min={0}
              max={168}
              required
              value={regras.minLeadHours}
              onChange={(e) => setRegras({ ...regras, minLeadHours: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="rg-prazo">Agendar até (meses à frente)</label>
            <input
              id="rg-prazo"
              type="number"
              min={1}
              max={12}
              required
              value={regras.windowMonths}
              onChange={(e) => setRegras({ ...regras, windowMonths: e.target.value })}
            />
          </div>
          <button type="submit" className="add agenda__btn" disabled={ocupado}>
            Salvar
          </button>
        </form>
        <p className="field__help">
          Produtos com antecedência própria (ex: bolos de 48h) continuam valendo quando são maiores.
        </p>
      </Bloco>
    </section>
  );
}
