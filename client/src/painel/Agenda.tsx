import {
  addDays,
  dayPeriods,
  deliveryProblem,
  formatDates,
  formatPeriods,
  specialWindowProblem,
  weekHoursProblem,
} from '@vanellis/shared';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, type AgendaPainel, type Horario } from './api';
import { avisarAoSair } from './saida';

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
    const ps = dayPeriods(hours, wd);
    return `${DIAS[wd]!.slice(0, 3)} ${ps.length ? formatPeriods(ps) : 'fechado'}`;
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

// Um dia pode ter vários períodos, como o intervalo de almoço (C67).
type Periodo = { open: string; close: string };
type Semana = Record<number, { aberto: boolean; periodos: Periodo[] }>;

function toSemana(hours: Horario[]): Semana {
  const s: Semana = {};
  for (let wd = 0; wd < 7; wd++) {
    const ps = dayPeriods(hours, wd).map(({ open, close }) => ({ open, close }));
    s[wd] = ps.length ? { aberto: true, periodos: ps } : { aberto: false, periodos: [{ open: '07:30', close: '19:00' }] };
  }
  return s;
}
const fromSemana = (s: Semana): Horario[] =>
  ORDEM.filter((wd) => s[wd]!.aberto).flatMap((wd) => s[wd]!.periodos.map((p) => ({ weekday: wd, ...p })));

/** Problema do horário digitado, na hora, pela mesma regra do servidor (C29, C68). */
const problemaSemana = (s: Semana) => weekHoursProblem(fromSemana(s));

/**
 * Ao incluir um intervalo, divide o último período em dois: 7h30–19h vira 7h30–12h e
 * 14h–19h. Se o último período não comporta o almoço, o novo começa 1h depois dele.
 */
function comIntervalo(periodos: Periodo[]): Periodo[] {
  const last = periodos.at(-1)!;
  if (last.open < '12:00' && last.close > '14:00')
    return [...periodos.slice(0, -1), { open: last.open, close: '12:00' }, { open: '14:00', close: last.close }];
  const [h, m] = last.close.split(':').map(Number);
  const abre = `${String(Math.min(h! + 1, 22)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const fecha = `${String(Math.min(h! + 3, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return [...periodos, { open: abre, close: fecha }];
}

function EditorSemana({ value, onChange }: { value: Semana; onChange: (s: Semana) => void }) {
  return (
    <div className="week" role="group" aria-label="Horário de cada dia">
      {ORDEM.map((wd) => {
        const d = value[wd]!;
        const set = (patch: Partial<typeof d>) => onChange({ ...value, [wd]: { ...d, ...patch } });
        const setPeriodo = (i: number, patch: Partial<Periodo>) =>
          set({ periodos: d.periodos.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
        return (
          <div key={wd} className={d.aberto ? 'week__row' : 'week__row week__row--off'}>
            <label className="week__day">
              <input type="checkbox" checked={d.aberto} onChange={(e) => set({ aberto: e.target.checked })} />
              {DIAS[wd]}
            </label>
            {d.aberto ? (
              <span className="week__periods">
                {d.periodos.map((p, i) => (
                  <span key={i} className="week__times">
                    {i > 0 && <span className="week__e">e</span>}
                    <input
                      type="time"
                      aria-label={`${DIAS[wd]}, período ${i + 1}: abre`}
                      value={p.open}
                      onChange={(e) => setPeriodo(i, { open: e.target.value })}
                    />
                    <span>às</span>
                    <input
                      type="time"
                      aria-label={`${DIAS[wd]}, período ${i + 1}: fecha`}
                      value={p.close}
                      onChange={(e) => setPeriodo(i, { close: e.target.value })}
                    />
                    {d.periodos.length > 1 && (
                      <button
                        type="button"
                        className="icon-btn week__remove"
                        aria-label={`Remover o período ${i + 1} de ${DIAS[wd]}`}
                        title="Remover período"
                        onClick={() => set({ periodos: d.periodos.filter((_, j) => j !== i) })}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {d.periodos.length < 4 && (
                  <button
                    type="button"
                    className="link week__add"
                    onClick={() => set({ periodos: comIntervalo(d.periodos) })}
                  >
                    + intervalo
                  </button>
                )}
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

function ProblemaSemana({ semana }: { semana: Semana }) {
  const p = problemaSemana(semana);
  return p ? (
    <p className="field__error" role="alert">
      {p}
    </p>
  ) : null;
}

// ---------- blocos ----------

function Bloco({ id, titulo, ajuda, children }: { id: string; titulo: string; ajuda?: string; children: ReactNode }) {
  // O id permite chegar ao bloco pela barra lateral ('#agenda/especiais').
  return (
    <section id={`agenda-${id}`} className="card-form agenda__block">
      <h3>{titulo}</h3>
      {ajuda && <p className="field__help">{ajuda}</p>}
      {children}
    </section>
  );
}

function Lista({ vazia, children }: { vazia: string; children: ReactNode[] }) {
  return children.length ? <ul className="agenda__list">{children}</ul> : <p className="agenda__empty">{vazia}</p>;
}

function Item({
  children,
  acao,
  onAcao,
  onEditar,
  rotulo,
}: {
  children: ReactNode;
  acao: string;
  onAcao: () => void;
  /** Botão "Editar", antes da ação principal (RF63). */
  onEditar?: () => void;
  /** Nome do item para os botões no leitor de tela ("Editar 24/12"). */
  rotulo?: string;
}) {
  return (
    <li>
      <span>{children}</span>
      <span className="agenda__acoes">
        {onEditar && (
          <button type="button" className="link" onClick={onEditar} aria-label={rotulo ? `Editar ${rotulo}` : undefined}>
            Editar
          </button>
        )}
        <button type="button" className="link" onClick={onAcao} aria-label={rotulo ? `${acao} ${rotulo}` : undefined}>
          {acao}
        </button>
      </span>
    </li>
  );
}

// ---------- estado das seções ----------
// Cada seção guarda o próprio formulário (G21): gravar uma seção não apaga o que está digitado
// nas outras. A tela só junta os avisos de "não salvo" para perguntar antes de sair (C65).

type Muda = (method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, ok: string) => Promise<boolean>;
type Marcar = (secao: string, sujo: boolean) => void;

interface SecaoProps {
  agenda: AgendaPainel;
  muda: Muda;
  ocupado: boolean;
  marcar: Marcar;
}

const SAIR = 'Há mudanças na Agenda que ainda não foram salvas. Sair e perder as alterações?';

/** Avisa a tela enquanto a seção tiver algo digitado e não salvo. */
function usePendente(marcar: Marcar, secao: string, sujo: boolean) {
  useEffect(() => marcar(secao, sujo), [marcar, secao, sujo]);
  useEffect(() => () => marcar(secao, false), [marcar, secao]);
}

/**
 * Formulário de um valor já salvo (horário em vigor, regras, tele-entrega). Sem edição, mostra o
 * salvo, que acompanha as gravações das outras seções; editado, guarda o rascunho até a gravação
 * desta seção dar certo.
 */
function useRascunho<T>(salvo: T) {
  const [rascunho, setRascunho] = useState<T | null>(null);
  return {
    valor: rascunho ?? salvo,
    set: setRascunho,
    limpar: () => setRascunho(null),
    sujo: rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(salvo),
  };
}

/** Envia o formulário de inclusão; se deu certo, limpa os campos. */
async function incluir(muda: Muda, e: FormEvent, path: string, body: unknown, ok: string, limpar: () => void) {
  e.preventDefault();
  if (await muda('POST', path, body, ok)) limpar();
}

// ---------- seções ----------

/** 1. Horário em vigor (C24, C25). */
function HorarioEmVigor({ agenda, muda, ocupado, marcar }: SecaoProps) {
  const c = agenda.current;
  const semana = useRascunho(toSemana(c?.hours ?? []));
  usePendente(marcar, 'horario', semana.sujo);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await muda(
      'PUT',
      '/horario-atual',
      { hours: fromSemana(semana.valor) },
      'Horário em vigor salvo. O site já segue o novo horário.',
    );
    if (ok) semana.limpar();
  };

  return (
    <Bloco
      id="horario"
      titulo="Horário em vigor"
      ajuda={
        c
          ? `Vale ${periodo(c.validFrom, c.validUntil)}. Mudar aqui vale a partir de agora. A retirada vai até 30 minutos antes de fechar.`
          : 'Nenhum horário cadastrado: o site não oferece dias de retirada.'
      }
    >
      <form onSubmit={salvar}>
        <EditorSemana value={semana.valor} onChange={semana.set} />
        <ProblemaSemana semana={semana.valor} />
        <button type="submit" className="primary" disabled={ocupado || problemaSemana(semana.valor) !== null}>
          Salvar horário em vigor
        </button>
      </form>
    </Bloco>
  );
}

/** 2. Mudanças programadas (C26–C28). */
function ProximasMudancas({ agenda, muda, ocupado, marcar }: SecaoProps) {
  const [programando, setProgramando] = useState(false);
  const [mudanca, setMudanca] = useState({ validFrom: '', validUntil: '', semana: toSemana([]) });
  const [semanaInicial, setSemanaInicial] = useState('');
  usePendente(
    marcar,
    'mudancas',
    programando && (mudanca.validFrom !== '' || mudanca.validUntil !== '' || JSON.stringify(mudanca.semana) !== semanaInicial),
  );

  const abrir = () => {
    const semana = toSemana(agenda.current?.hours ?? []);
    setMudanca({ validFrom: '', validUntil: '', semana });
    setSemanaInicial(JSON.stringify(semana));
    setProgramando(true);
  };
  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await muda(
      'POST',
      '/mudancas',
      { validFrom: mudanca.validFrom, validUntil: mudanca.validUntil || null, hours: fromSemana(mudanca.semana) },
      'Mudança programada.',
    );
    if (ok) setProgramando(false);
  };

  return (
    <Bloco
      id="mudancas"
      titulo="Próximas mudanças"
      ajuda="Um horário novo a partir de uma data. Com data de fim, o horário normal volta sozinho depois."
    >
      <Lista vazia="Nenhuma mudança programada.">
        {agenda.upcoming.map((s) => (
          <Item key={s.id} acao="Remover" onAcao={() => void muda('DELETE', `/mudancas/${s.id}`, {}, 'Mudança removida.')}>
            <strong>{periodo(s.validFrom, s.validUntil)}</strong>
            <br />
            <small>{resumoSemana(s.hours)}</small>
          </Item>
        ))}
      </Lista>
      {programando ? (
        <form className="agenda__form" onSubmit={salvar}>
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
          <ProblemaSemana semana={mudanca.semana} />
          <div className="agenda__actions">
            <button type="button" className="link" onClick={() => setProgramando(false)}>
              Cancelar
            </button>
            <button type="submit" className="add" disabled={ocupado || problemaSemana(mudanca.semana) !== null}>
              Programar mudança
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="switch__btn agenda__open" onClick={abrir}>
          Programar mudança
        </button>
      )}
    </Bloco>
  );
}

/** 3. Datas sem retirada (C30, C31). */
function DatasBloqueadas({ agenda, muda, ocupado, marcar }: SecaoProps) {
  const [bloqueio, setBloqueio] = useState({ date: '', reason: '' });
  usePendente(marcar, 'bloqueadas', bloqueio.date !== '' || bloqueio.reason !== '');

  return (
    <Bloco id="bloqueadas" titulo="Datas sem retirada" ajuda="Feriados e folgas: o dia some do calendário do cliente.">
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
          incluir(muda, e, '/datas-bloqueadas', { date: bloqueio.date, reason: bloqueio.reason || null }, 'Data bloqueada.', () =>
            setBloqueio({ date: '', reason: '' }),
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
  );
}

/** Datas especiais (C31), com prazo de encomenda opcional (RF55, RF61; C116, C117, C123, C125). */
function DatasEspeciais({ agenda, muda, ocupado, marcar }: SecaoProps) {
  const vazio = { date: '', name: '', deadline: '', chooseTime: false, start: '', end: '' };
  const [especial, setEspecial] = useState(vazio);
  // Editando uma data já cadastrada (RF63, C127): o dia não muda; `inicial` é como ela estava.
  const [editando, setEditando] = useState<string | null>(null);
  const [inicial, setInicial] = useState(vazio);
  usePendente(marcar, 'especiais', JSON.stringify(especial) !== JSON.stringify(inicial));
  const limpar = () => {
    setEspecial(vazio);
    setInicial(vazio);
    setEditando(null);
  };
  const editar = (s: AgendaPainel['specialDates'][number]) => {
    const dados = {
      date: s.date,
      name: s.name,
      deadline: s.deadline ?? '',
      chooseTime: s.chooseTime,
      start: s.window?.start ?? '',
      end: s.window?.end ?? '',
    };
    setEspecial(dados);
    setInicial(dados);
    setEditando(s.date);
    document.getElementById('es-nome')?.focus();
  };
  // O prazo fica sempre antes da própria data (C125); o servidor confere o mesmo.
  const prazoInvalido = especial.deadline !== '' && especial.date !== '' && especial.deadline >= especial.date;
  // Intervalo próprio (RF57): opcional, mas com os dois horários e o fim depois do início.
  const usaIntervalo = especial.chooseTime && (especial.start !== '' || especial.end !== '');
  const intervaloProblema = !usaIntervalo
    ? null
    : especial.start === '' || especial.end === ''
      ? 'Preencha o início e o fim do intervalo, ou deixe os dois em branco'
      : specialWindowProblem({ start: especial.start, end: especial.end });
  const bloqueadas = new Set(agenda.blockedDates.map((b) => b.date));

  return (
    <Bloco
      id="especiais"
      titulo="Datas especiais"
      ajuda="O cliente escolhe só o dia; a padaria combina o horário pelo WhatsApp (ex: vésperas de Natal e Ano Novo). Nessa data vale o prazo de encomenda, não a antecedência de cada produto."
    >
      <Lista vazia="Nenhuma data especial.">
        {agenda.specialDates.map((s) => (
          <Item
            key={s.date}
            acao="Remover"
            rotulo={br(s.date)}
            onEditar={() => editar(s)}
            onAcao={() => {
              if (editando === s.date) limpar();
              void muda('DELETE', `/datas-especiais/${s.date}`, {}, 'Data especial removida.');
            }}
          >
            <strong>{br(s.date)}</strong> · {s.name}
            <br />
            <small>
              {bloqueadas.has(s.date) ? 'Bloqueada em Datas sem retirada: fora do site até desbloquear. ' : ''}
              {s.closing}.{' '}
              {!s.chooseTime
                ? 'Horário a combinar.'
                : s.window
                  ? `O cliente escolhe o horário, das ${hora(s.window.start)} às ${hora(s.window.end)}.`
                  : 'O cliente escolhe o horário, no funcionamento normal do dia.'}
            </small>
            {s.warnings.map((w) => (
              <small key={w} className="agenda__aviso">
                {w}
              </small>
            ))}
          </Item>
        ))}
      </Lista>
      <form
        className="agenda__inline agenda__form"
        onSubmit={(e) =>
          incluir(
            muda,
            e,
            '/datas-especiais',
            {
              date: especial.date,
              name: especial.name,
              deadline: especial.deadline || null,
              chooseTime: especial.chooseTime,
              window: usaIntervalo ? { start: especial.start, end: especial.end } : null,
            },
            editando ? 'Data especial atualizada.' : 'Data especial cadastrada.',
            limpar,
          )
        }
      >
        <div className="field">
          <label htmlFor="es-data">{editando ? 'Data (para outro dia, remova e cadastre)' : 'Data'}</label>
          <input
            id="es-data"
            type="date"
            required
            min={agenda.today}
            disabled={editando !== null}
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
        <div className="field">
          <label htmlFor="es-prazo">Encomendas até (opcional)</label>
          <input
            id="es-prazo"
            type="date"
            max={especial.date ? addDays(especial.date, -1) : undefined}
            aria-describedby="es-prazo-ajuda"
            value={especial.deadline}
            onChange={(e) => setEspecial({ ...especial, deadline: e.target.value })}
          />
        </div>
        <div className="radios especial__modo" role="radiogroup" aria-label="Horário na data especial">
          <label className={!especial.chooseTime ? 'radio radio--on' : 'radio'}>
            <input
              type="radio"
              name="es-modo"
              checked={!especial.chooseTime}
              onChange={() => setEspecial({ ...especial, chooseTime: false })}
            />
            Horário a combinar com a padaria
          </label>
          <label className={especial.chooseTime ? 'radio radio--on' : 'radio'}>
            <input
              type="radio"
              name="es-modo"
              checked={especial.chooseTime}
              onChange={() => setEspecial({ ...especial, chooseTime: true })}
            />
            O cliente escolhe o horário
          </label>
        </div>
        {especial.chooseTime && (
          <>
            <div className="field">
              <label htmlFor="es-de">Das (opcional)</label>
              <input
                id="es-de"
                type="time"
                value={especial.start}
                onChange={(e) => setEspecial({ ...especial, start: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="es-ate">Às (opcional)</label>
              <input
                id="es-ate"
                type="time"
                value={especial.end}
                onChange={(e) => setEspecial({ ...especial, end: e.target.value })}
              />
            </div>
          </>
        )}
        {editando && (
          <button type="button" className="link agenda__btn" onClick={limpar}>
            Cancelar
          </button>
        )}
        <button type="submit" className="add agenda__btn" disabled={ocupado || prazoInvalido || intervaloProblema !== null}>
          {editando ? 'Salvar alterações' : 'Cadastrar'}
        </button>
      </form>
      {especial.chooseTime && (
        <p className="field__help">
          Com intervalo, valem só os horários dele, sem as restrições gerais de retirada. Sem intervalo, vale o
          funcionamento normal do dia, com as restrições.
        </p>
      )}
      {intervaloProblema && (
        <p className="field__error" role="alert">
          {intervaloProblema}
        </p>
      )}
      <p id="es-prazo-ajuda" className="field__help">
        O prazo vai até o fechamento da loja nesse dia. Sem prazo, as encomendas vão até a véspera.
      </p>
      {prazoInvalido && (
        <p className="field__error" role="alert">
          O prazo precisa ser antes da própria data
        </p>
      )}
    </Bloco>
  );
}

/** Horários fechados por lotação num dia (C32). */
function HorariosLotados({ agenda, muda, ocupado, marcar }: SecaoProps) {
  const [fechado, setFechado] = useState({ date: '', start: '09:00', end: '11:00' });
  usePendente(marcar, 'lotados', fechado.date !== '');

  return (
    <Bloco
      id="lotados"
      titulo="Horários fechados por lotação"
      ajuda="Fecha um período só naquele dia, quando a produção lota. Reabra quando quiser."
    >
      <Lista vazia="Nenhum horário fechado.">
        {agenda.closedPeriods.map((p) => (
          <Item key={p.id} acao="Reabrir" onAcao={() => void muda('DELETE', `/horarios-fechados/${p.id}`, {}, 'Horário reaberto.')}>
            <strong>{br(p.date)}</strong> · das {hora(p.start)} às {hora(p.end)}
          </Item>
        ))}
      </Lista>
      <form
        className="agenda__inline agenda__form"
        onSubmit={(e) => incluir(muda, e, '/horarios-fechados', fechado, 'Horário fechado.', () => setFechado({ ...fechado, date: '' }))}
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
  );
}

/** 4. Restrições de retirada (C34). */
function Restricoes({ agenda, muda, ocupado, marcar }: SecaoProps) {
  const [restricao, setRestricao] = useState({ weekday: 'todos', tipo: 'apartir', start: '12:00', end: '14:00', label: '' });
  usePendente(marcar, 'restricoes', restricao.label !== '');

  const salvar = (e: FormEvent) =>
    incluir(
      muda,
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

  return (
    <Bloco id="restricoes" titulo="Restrições de retirada" ajuda="Horários em que a loja está aberta, mas não entrega encomendas.">
      <Lista vazia="Nenhuma restrição.">
        {agenda.restrictions.map((r) => (
          <Item key={r.id} acao="Remover" onAcao={() => void muda('DELETE', `/restricoes/${r.id}`, {}, 'Restrição removida.')}>
            {descreveRestricao(r)}
          </Item>
        ))}
      </Lista>
      <form className="agenda__inline agenda__form" onSubmit={salvar}>
        <div className="field">
          <label htmlFor="re-dia">Dia</label>
          <select id="re-dia" value={restricao.weekday} onChange={(e) => setRestricao({ ...restricao, weekday: e.target.value })}>
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
          <select id="re-tipo" value={restricao.tipo} onChange={(e) => setRestricao({ ...restricao, tipo: e.target.value })}>
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
  );
}

/** Antecedência mínima e prazo de agendamento (C35). */
function Regras({ agenda, muda, ocupado, marcar }: SecaoProps) {
  const regras = useRascunho({
    minLeadHours: String(agenda.config.minLeadHours),
    windowMonths: String(agenda.config.windowMonths),
  });
  usePendente(marcar, 'regras', regras.sujo);
  const r = regras.valor;

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await muda(
      'PUT',
      '/regras',
      { minLeadHours: Number(r.minLeadHours), windowMonths: Number(r.windowMonths) },
      'Regras salvas.',
    );
    if (ok) regras.limpar();
  };

  return (
    <Bloco id="regras" titulo="Antecedência e prazo">
      <form className="agenda__inline" onSubmit={salvar}>
        <div className="field">
          <label htmlFor="rg-ant">Antecedência mínima (horas)</label>
          <input
            id="rg-ant"
            type="number"
            min={0}
            max={168}
            required
            value={r.minLeadHours}
            onChange={(e) => regras.set({ ...r, minLeadHours: e.target.value })}
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
            value={r.windowMonths}
            onChange={(e) => regras.set({ ...r, windowMonths: e.target.value })}
          />
        </div>
        <button type="submit" className="add agenda__btn" disabled={ocupado}>
          Salvar
        </button>
      </form>
      <p className="field__help">
        A antecedência própria de um produto vale no lugar desta, para mais (ex: bolos de 48h) ou para menos (ex: salgados
        de 2h).
      </p>
    </Bloco>
  );
}

/** Tele-entrega (RF44, RN43, RN44; C77–C79, C83). */
function TeleEntrega({ agenda, muda, ocupado, marcar }: SecaoProps) {
  const entrega = useRascunho(agenda.delivery);
  const [novaData, setNovaData] = useState('');
  usePendente(marcar, 'entrega', entrega.sujo || novaData !== '');
  const d = entrega.valor;

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await muda(
      'PUT',
      '/entrega',
      d,
      d.enabled
        ? d.allDays
          ? 'Tele-entrega ligada para todos os dias.'
          : `Tele-entrega ligada para ${formatDates(d.dates)}.`
        : 'Tele-entrega desligada: o site só oferece retirada.',
    );
    if (ok) entrega.limpar();
  };

  return (
    <Bloco
      id="entrega"
      titulo="Tele-entrega"
      ajuda="Desligada, o site só oferece retirada no balcão. Ligada, o cliente escolhe entre retirar e receber em casa, nos mesmos dias e horários da agenda. A taxa é combinada pelo WhatsApp."
    >
      <form onSubmit={salvar}>
        <label className="check entrega__toggle">
          <input type="checkbox" checked={d.enabled} onChange={(e) => entrega.set({ ...d, enabled: e.target.checked })} />
          Oferecer tele-entrega no site
        </label>
        {d.enabled && (
          <div className="radios entrega__modo" role="radiogroup" aria-label="Em quais dias vale a entrega">
            <label className={d.allDays ? 'radio radio--on' : 'radio'}>
              <input type="radio" name="entrega-modo" checked={d.allDays} onChange={() => entrega.set({ ...d, allDays: true })} />
              Todos os dias com retirada
            </label>
            <label className={!d.allDays ? 'radio radio--on' : 'radio'}>
              <input type="radio" name="entrega-modo" checked={!d.allDays} onChange={() => entrega.set({ ...d, allDays: false })} />
              Só nas datas marcadas
            </label>
          </div>
        )}
        {d.enabled && !d.allDays && (
          <div className="entrega__datas">
            <div className="agenda__inline">
              <div className="field">
                <label htmlFor="ent-data">Data com entrega</label>
                <input
                  id="ent-data"
                  type="date"
                  min={agenda.today}
                  value={novaData}
                  onChange={(e) => setNovaData(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="switch__btn agenda__btn"
                disabled={!novaData || d.dates.includes(novaData)}
                onClick={() => {
                  entrega.set({ ...d, dates: [...d.dates, novaData].sort() });
                  setNovaData('');
                }}
              >
                Incluir data
              </button>
            </div>
            {d.dates.length > 0 && (
              <ul className="especial__datas">
                {d.dates.map((x) => (
                  <li key={x}>
                    {br(x)}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Tirar a data ${br(x)}`}
                      onClick={() => entrega.set({ ...d, dates: d.dates.filter((y) => y !== x) })}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {deliveryProblem(d) && (
          <p className="field__error" role="alert">
            {deliveryProblem(d)}
          </p>
        )}
        <button type="submit" className="primary" disabled={ocupado || deliveryProblem(d) !== null}>
          Salvar tele-entrega
        </button>
      </form>
      <p className="field__help">
        {agenda.delivery.enabled
          ? agenda.delivery.allDays
            ? 'Agora: ligada para todos os dias com retirada.'
            : `Agora: ligada só para ${formatDates(agenda.delivery.dates) || 'nenhuma data futura'}.`
          : 'Agora: desligada.'}
      </p>
    </Bloco>
  );
}

// ---------- tela ----------

export function Agenda({ onAuthError }: { onAuthError: (e: unknown) => boolean }) {
  const [agenda, setAgenda] = useState<AgendaPainel | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pendentes, setPendentes] = useState<Record<string, boolean>>({});

  const marcar = useCallback<Marcar>(
    (secao, sujo) => setPendentes((p) => (Boolean(p[secao]) === sujo ? p : { ...p, [secao]: sujo })),
    [],
  );

  // C65: com algo digitado e não salvo em qualquer seção, pergunta antes de sair da tela.
  const algoPendente = Object.values(pendentes).some(Boolean);
  useEffect(() => {
    avisarAoSair(algoPendente ? SAIR : null);
    return () => avisarAoSair(null);
  }, [algoPendente]);

  useEffect(() => {
    api
      .agenda()
      .then(setAgenda)
      .catch((e: unknown) => onAuthError(e) || setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }));
  }, [onAuthError]);

  // Subseção pela barra lateral: '#agenda/especiais' rola até o bloco.
  const carregada = agenda !== null;
  useEffect(() => {
    if (!carregada) return;
    const ir = () => {
      const m = window.location.hash.match(/^#agenda\/(\w+)$/);
      if (m) document.getElementById(`agenda-${m[1]}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (window.location.hash === '#agenda') window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    ir();
    window.addEventListener('hashchange', ir);
    return () => window.removeEventListener('hashchange', ir);
  }, [carregada]);

  /** Envia uma mudança; em sucesso atualiza a tela e mostra `ok`. Devolve se deu certo. */
  const muda = useCallback<Muda>(
    async (method, path, body, ok) => {
      setOcupado(true);
      setMsg(null);
      try {
        setAgenda(await api.agendaMuda(method, path, body));
        setMsg({ ok: true, text: ok });
        return true;
      } catch (e) {
        if (!onAuthError(e)) setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [onAuthError],
  );

  if (!agenda) return <p className="status">{msg?.text ?? 'Carregando…'}</p>;

  const secao = { agenda, muda, ocupado, marcar };
  return (
    <section className="painel__page agenda" aria-labelledby="agenda-title">
      <h2 id="agenda-title">Agenda de retirada</h2>
      {msg && (
        <p className={msg.ok ? 'form-ok agenda__msg' : 'field__error agenda__msg'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      <HorarioEmVigor {...secao} />
      <ProximasMudancas {...secao} />
      <DatasBloqueadas {...secao} />
      <DatasEspeciais {...secao} />
      <HorariosLotados {...secao} />
      <Restricoes {...secao} />
      <Regras {...secao} />
      <TeleEntrega {...secao} />
    </section>
  );
}
