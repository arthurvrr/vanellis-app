import { formatDates, shortDate, specialMenuProblem } from '@vanellis/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, enviaFoto, type CategoriaPainel, type ProdutoLista } from './api';
import { ProdutoEditor } from './ProdutoEditor';

// Tela Produtos do painel, parte 1 (etapa 3): lista de produtos (RF15, RF53, RF54, RN41) e
// categorias, que são as abas do cardápio (RF52, RN56). Cenários C43–C51. A edição completa
// de um produto (dados e opções) entra na próxima parte.

type Aba = 'produtos' | 'categorias';

/** '#produto/12' = editar, '#produto/novo' = novo, o resto = lista. */
function editorDoEndereco(): number | 'novo' | null {
  const m = window.location.hash.match(/^#produto\/(novo|\d+)$/);
  if (!m) return null;
  return m[1] === 'novo' ? 'novo' : Number(m[1]);
}
type Msg = { ok: boolean; text: string } | null;

function Seta({ dir, label, onClick }: { dir: 'subir' | 'descer'; label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d={dir === 'subir' ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

const Thumb = ({ src }: { src: string | null }) =>
  src ? (
    <img className="thumb" src={src} alt="" loading="lazy" />
  ) : (
    <span className="thumb thumb--empty" aria-hidden="true" />
  );

export function Produtos({ onAuthError }: { onAuthError: (e: unknown) => boolean }) {
  // A barra lateral escolhe a subseção pelo endereço: '#categorias' ou a lista.
  const abaDoEndereco = (): Aba => (window.location.hash === '#categorias' ? 'categorias' : 'produtos');
  const [aba, setAba] = useState<Aba>(abaDoEndereco);
  const [categorias, setCategorias] = useState<CategoriaPainel[] | null>(null);
  const [produtos, setProdutos] = useState<ProdutoLista[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [filtroCat, setFiltroCat] = useState<number | 'todas'>('todas');
  const [soSemPdv, setSoSemPdv] = useState(window.location.hash === '#produtos-sem-pdv');
  const [editor, setEditor] = useState(editorDoEndereco);

  useEffect(() => {
    const onHash = () => {
      setEditor(editorDoEndereco());
      setAba(abaDoEndereco());
      if (window.location.hash === '#produtos-sem-pdv') setSoSemPdv(true);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const erro = useCallback(
    (e: unknown) => {
      if (!onAuthError(e)) setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    },
    [onAuthError],
  );

  useEffect(() => {
    Promise.all([api.categorias(), api.produtos()])
      .then(([c, p]) => {
        setCategorias(c);
        setProdutos(p);
      })
      .catch(erro);
  }, [erro]);

  /** Roda uma ação; em sucesso troca a lista e mostra `ok`. */
  async function act<T>(fn: () => Promise<T>, apply: (v: T) => void, ok?: string) {
    setMsg(null);
    try {
      apply(await fn());
      if (ok) setMsg({ ok: true, text: ok });
      return true;
    } catch (e) {
      erro(e);
      return false;
    }
  }

  if (!categorias || !produtos) return <p className="status">{msg?.text ?? 'Carregando…'}</p>;

  if (editor !== null) {
    return (
      <ProdutoEditor
        key={String(editor)}
        produtoId={editor === 'novo' ? null : editor}
        categorias={categorias}
        onAuthError={onAuthError}
        aviso={msg?.ok ? msg.text : null}
        onDone={(text) => {
          window.location.hash = '#produtos';
          void api.produtos().then(setProdutos).catch(erro);
          setMsg(text ? { ok: true, text } : null);
        }}
        onOpen={(id, text) => {
          void api.produtos().then(setProdutos).catch(erro);
          window.location.hash = `#produto/${id}`;
          setMsg(text ? { ok: true, text } : null);
        }}
      />
    );
  }

  return (
    <section className="painel__page produtos" aria-labelledby="produtos-title">
      <h2 id="produtos-title">
        {aba === 'produtos' ? `Lista de produtos (${produtos.length})` : `Categorias (${categorias.length})`}
      </h2>
      {msg && (
        <p className={msg.ok ? 'form-ok agenda__msg' : 'field__error agenda__msg'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      {aba === 'produtos' ? (
        <ListaProdutos
          categorias={categorias}
          produtos={produtos}
          filtroCat={filtroCat}
          setFiltroCat={setFiltroCat}
          soSemPdv={soSemPdv}
          setSoSemPdv={setSoSemPdv}
          act={act}
          setProdutos={setProdutos}
        />
      ) : (
        <ListaCategorias categorias={categorias} act={act} setCategorias={setCategorias} erro={erro} />
      )}
    </section>
  );
}

// ---------- lista de produtos ----------

function ListaProdutos({
  categorias,
  produtos,
  filtroCat,
  setFiltroCat,
  soSemPdv,
  setSoSemPdv,
  act,
  setProdutos,
}: {
  categorias: CategoriaPainel[];
  produtos: ProdutoLista[];
  filtroCat: number | 'todas';
  setFiltroCat: (v: number | 'todas') => void;
  soSemPdv: boolean;
  setSoSemPdv: (v: boolean) => void;
  act: <T>(fn: () => Promise<T>, apply: (v: T) => void, ok?: string) => Promise<boolean>;
  setProdutos: (p: ProdutoLista[]) => void;
}) {
  const semPdv = produtos.filter((p) => p.missingPdv).length;
  const visiveis = categorias.filter((c) => filtroCat === 'todas' || c.id === filtroCat);

  return (
    <>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="f-cat">Categoria</label>
          <select
            id="f-cat"
            value={filtroCat}
            onChange={(e) => setFiltroCat(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
          >
            <option value="todas">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <a className="add toolbar__new" href="#produto/novo">
          + Novo produto
        </a>
        <label className="check">
          <input type="checkbox" checked={soSemPdv} onChange={(e) => setSoSemPdv(e.target.checked)} />
          Só os sem código PDV ({semPdv})
        </label>
      </div>

      {visiveis.map((c) => {
        const todos = produtos.filter((p) => p.categoryId === c.id);
        const lista = todos.filter((p) => !soSemPdv || p.missingPdv);
        if (!lista.length) return null;
        return (
          <section key={c.id} className="card-form plist">
            <h3>{c.name}</h3>
            <ul>
              {lista.map((p) => {
                const pos = todos.indexOf(p);
                return (
                  <li key={p.id} className={p.available ? 'prow' : 'prow prow--off'}>
                    <Thumb src={p.imageUrl} />
                    <div className="prow__info">
                      <strong>{p.name}</strong>
                      {p.missingPdv ? (
                        <span className="tag tag--warn">Sem código PDV</span>
                      ) : (
                        <span className="tag">{p.pdvCode ? `PDV ${p.pdvCode}` : 'Códigos nas opções'}</span>
                      )}
                    </div>
                    <a className="link" href={`#produto/${p.id}`}>
                      Editar
                    </a>
                    <button
                      type="button"
                      className={p.available ? 'toggle toggle--on' : 'toggle'}
                      aria-pressed={p.available}
                      onClick={() =>
                        act(
                          () => api.disponivel(p.id, !p.available),
                          setProdutos,
                          `${p.name}: ${p.available ? 'indisponível' : 'disponível'} no cardápio.`,
                        )
                      }
                    >
                      {p.available ? 'Disponível' : 'Indisponível'}
                    </button>
                    <span className="prow__order">
                      {pos > 0 && (
                        <Seta
                          dir="subir"
                          label={`Subir ${p.name}`}
                          onClick={() => act(() => api.moveProduto(p.id, 'subir'), setProdutos)}
                        />
                      )}
                      {pos < todos.length - 1 && (
                        <Seta
                          dir="descer"
                          label={`Descer ${p.name}`}
                          onClick={() => act(() => api.moveProduto(p.id, 'descer'), setProdutos)}
                        />
                      )}
                    </span>
                    <button
                      type="button"
                      className="link link--danger"
                      onClick={() => {
                        if (window.confirm(`Excluir ${p.name}? Isso não pode ser desfeito.`)) {
                          void act(() => api.excluiProduto(p.id), setProdutos, `${p.name} excluído.`);
                        }
                      }}
                    >
                      Excluir
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {soSemPdv && semPdv === 0 && <p className="agenda__empty">Todos os produtos têm código PDV.</p>}
    </>
  );
}

// ---------- categorias ----------

function FotoCapa({
  value,
  onChange,
  erro,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  erro: (e: unknown) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="field capa">
      <span className="capa__label">Foto de capa (opcional)</span>
      <div className="capa__row">
        <Thumb src={value} />
        <label className="switch__btn capa__btn">
          {enviando ? 'Enviando…' : value ? 'Trocar foto' : 'Enviar foto'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={enviando}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setEnviando(true);
              try {
                onChange((await enviaFoto(file)).url);
              } catch (err) {
                erro(err);
              } finally {
                setEnviando(false);
              }
            }}
          />
        </label>
        {value && (
          <button type="button" className="link" onClick={() => onChange(null)}>
            Remover capa
          </button>
        )}
      </div>
      <p className="field__help">Sem capa, o cartão da entrada usa a foto do primeiro produto.</p>
    </div>
  );
}

type Especial = { visibleFrom: string; visibleUntil: string; pickupDates: string[] };
const vazio = {
  name: '',
  description: '',
  coverImageUrl: null as string | null,
  /** Cardápio especial ligado e sua configuração (RF16–RF19). */
  especial: false,
  special: { visibleFrom: '', visibleUntil: '', pickupDates: [] } as Especial,
};

/** Situação do cardápio especial na lista: aparece no site agora ou não, e por quê. */
function situacaoEspecial(c: CategoriaPainel): { texto: string; aviso: boolean } {
  const sp = c.special!;
  const retirada = `retirada em ${formatDates(sp.pickupDates)}`;
  switch (c.specialState) {
    case 'oculto':
      return { texto: `Oculto: não aparece no site · ${retirada}`, aviso: true };
    case 'em-breve':
      return { texto: `Aparece no site a partir de ${shortDate(sp.visibleFrom)} · ${retirada}`, aviso: false };
    case 'encerrado':
      return { texto: `Encerrado em ${shortDate(sp.visibleUntil)}: não aparece no site`, aviso: true };
    default:
      return { texto: `No site até ${shortDate(sp.visibleUntil)} · ${retirada}`, aviso: false };
  }
}

/** Período e datas de retirada do cardápio especial (C70, C72). */
function CamposEspecial({ value, onChange }: { value: Especial; onChange: (v: Especial) => void }) {
  const [nova, setNova] = useState('');
  const incluir = () => {
    if (!nova || value.pickupDates.includes(nova)) return;
    onChange({ ...value, pickupDates: [...value.pickupDates, nova].sort() });
    setNova('');
  };
  return (
    <div className="especial">
      <div className="especial__linha">
        <div className="field">
          <label htmlFor="esp-de">Aparece no site de</label>
          <input
            id="esp-de"
            type="date"
            value={value.visibleFrom}
            onChange={(e) => onChange({ ...value, visibleFrom: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="esp-ate">até (último dia de encomendas)</label>
          <input
            id="esp-ate"
            type="date"
            value={value.visibleUntil}
            onChange={(e) => onChange({ ...value, visibleUntil: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="esp-data">Datas de retirada (os produtos só podem ser retirados nelas)</label>
        <div className="especial__linha">
          <input id="esp-data" type="date" value={nova} onChange={(e) => setNova(e.target.value)} />
          <button type="button" className="switch__btn" onClick={incluir} disabled={!nova}>
            Incluir data
          </button>
        </div>
        {value.pickupDates.length > 0 && (
          <ul className="especial__datas">
            {value.pickupDates.map((d) => (
              <li key={d}>
                {shortDate(d)}/{d.slice(0, 4)}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Tirar a data ${shortDate(d)}`}
                  onClick={() => onChange({ ...value, pickupDates: value.pickupDates.filter((x) => x !== d) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="field__help">
        Se a data de retirada é uma data especial da Agenda (como 24/12), o cliente escolhe só o dia. Itens do cardápio
        regular no mesmo pedido vêm junto nessa data.
      </p>
    </div>
  );
}

function ListaCategorias({
  categorias,
  act,
  setCategorias,
  erro,
}: {
  categorias: CategoriaPainel[];
  act: <T>(fn: () => Promise<T>, apply: (v: T) => void, ok?: string) => Promise<boolean>;
  setCategorias: (c: CategoriaPainel[]) => void;
  erro: (e: unknown) => void;
}) {
  const [editando, setEditando] = useState<number | 'nova' | null>(null);
  const [form, setForm] = useState(vazio);

  const abrir = (c: CategoriaPainel | null) => {
    setEditando(c ? c.id : 'nova');
    setForm(
      c
        ? {
            name: c.name,
            description: c.description ?? '',
            coverImageUrl: c.coverImageUrl,
            especial: c.special !== null,
            special: c.special
              ? { visibleFrom: c.special.visibleFrom, visibleUntil: c.special.visibleUntil, pickupDates: c.special.pickupDates }
              : vazio.special,
          }
        : vazio,
    );
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const dados = {
      name: form.name,
      description: form.description || null,
      coverImageUrl: form.coverImageUrl,
      special: form.especial ? form.special : null,
    };
    const ok = await act(
      () => (editando === 'nova' ? api.criaCategoria(dados) : api.editaCategoria(editando as number, dados)),
      setCategorias,
      editando === 'nova' ? `Categoria "${form.name}" criada.` : 'Categoria salva.',
    );
    if (ok) setEditando(null);
  };

  const problemaEspecial = form.especial ? specialMenuProblem(form.special) : null;

  const formulario = (
    <form className="cat-form" onSubmit={salvar}>
      <div className="field">
        <label htmlFor="cat-nome">Nome da aba</label>
        <input
          id="cat-nome"
          required
          maxLength={50}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="cat-frase">Frase (aparece na entrada e no topo do cardápio)</label>
        <input
          id="cat-frase"
          maxLength={160}
          placeholder="Ex: Fritos e assados no dia, para festas e reuniões."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <FotoCapa value={form.coverImageUrl} onChange={(url) => setForm({ ...form, coverImageUrl: url })} erro={erro} />
      <label className="check especial__toggle">
        <input
          type="checkbox"
          checked={form.especial}
          onChange={(e) => setForm({ ...form, especial: e.target.checked })}
        />
        Cardápio especial (ex: Ceia de Natal): aparece só num período e tem datas de retirada próprias
      </label>
      {form.especial && <CamposEspecial value={form.special} onChange={(special) => setForm({ ...form, special })} />}
      {problemaEspecial && (
        <p className="field__error" role="alert">
          {problemaEspecial}
        </p>
      )}
      <div className="agenda__actions">
        <button type="button" className="link" onClick={() => setEditando(null)}>
          Cancelar
        </button>
        <button type="submit" className="add" disabled={problemaEspecial !== null}>
          {editando === 'nova' ? 'Criar categoria' : 'Salvar'}
        </button>
      </div>
    </form>
  );

  return (
    <section className="card-form plist">
      <p className="field__help">
        Cada categoria é uma aba do cardápio e um cartão na entrada. Uma categoria sem produtos não aparece no site.
      </p>
      <ul>
        {categorias.map((c, i) =>
          editando === c.id ? (
            <li key={c.id} className="prow prow--form">
              {formulario}
            </li>
          ) : (
            <li key={c.id} className="prow">
              <Thumb src={c.coverImageUrl} />
              <div className="prow__info">
                <strong>{c.name}</strong>
                <span className="prow__desc">{c.description ?? 'Sem frase'}</span>
                <span className="tag">
                  {c.productCount} {c.productCount === 1 ? 'produto' : 'produtos'}
                  {c.productCount === 0 && ' · não aparece no site'}
                </span>
                {c.special && (
                  <span className={situacaoEspecial(c).aviso ? 'tag tag--warn' : 'tag tag--especial'}>
                    ★ Especial · {situacaoEspecial(c).texto}
                  </span>
                )}
              </div>
              {c.special && (
                <button
                  type="button"
                  className={c.special.hidden ? 'toggle' : 'toggle toggle--on'}
                  aria-pressed={!c.special.hidden}
                  onClick={() =>
                    act(
                      () => api.ocultaCategoria(c.id, !c.special!.hidden),
                      setCategorias,
                      c.special!.hidden ? `${c.name} reexibido.` : `${c.name} oculto: saiu do site.`,
                    )
                  }
                >
                  {c.special.hidden ? 'Reexibir' : 'Ocultar'}
                </button>
              )}
              <span className="prow__order">
                {i > 0 && (
                  <Seta
                    dir="subir"
                    label={`Subir ${c.name}`}
                    onClick={() => act(() => api.moveCategoria(c.id, 'subir'), setCategorias)}
                  />
                )}
                {i < categorias.length - 1 && (
                  <Seta
                    dir="descer"
                    label={`Descer ${c.name}`}
                    onClick={() => act(() => api.moveCategoria(c.id, 'descer'), setCategorias)}
                  />
                )}
              </span>
              <button type="button" className="link" onClick={() => abrir(c)}>
                Editar
              </button>
              <button
                type="button"
                className="link link--danger"
                onClick={() => {
                  if (window.confirm(`Excluir a categoria ${c.name}? Isso não pode ser desfeito.`)) {
                    void act(() => api.excluiCategoria(c.id), setCategorias, `Categoria ${c.name} excluída.`);
                  }
                }}
              >
                Excluir
              </button>
            </li>
          ),
        )}
      </ul>
      {editando === 'nova' ? (
        <div className="prow--form">{formulario}</div>
      ) : (
        <button type="button" className="switch__btn agenda__open" onClick={() => abrir(null)}>
          Nova categoria
        </button>
      )}
    </section>
  );
}
