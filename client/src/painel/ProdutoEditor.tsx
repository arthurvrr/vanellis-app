import {
  emptyGroup,
  emptyOption,
  productFromTemplate,
  validateProduct,
  type GroupForm,
  type OptionForm,
  type ProductForm,
  type TemplateDTO,
} from '@vanellis/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, type CategoriaPainel } from './api';
import { FotoUpload } from './FotoUpload';

// Cadastro completo de produto (etapa 3: RF14, RF29, RF30, RF40, RF46; cenários C52–C61).
// Os erros (impedem salvar) e avisos (não impedem) aparecem na hora, pelas mesmas regras
// que o servidor usa.

/** Número digitado com vírgula ou ponto; vazio = null. */
function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
const showNum = (n: number | null, digits = 2) =>
  n === null || Number.isNaN(n) ? '' : String(Number(n.toFixed(digits))).replace('.', ',');

function NumField({
  label,
  value,
  onChange,
  digits = 2,
  suffix,
  integer = false,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  digits?: number;
  suffix?: string;
  integer?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(showNum(value, digits));
  // Reflete mudanças de fora (carregar, modelo) sem atrapalhar a digitação: só reescreve o campo
  // se o valor novo não for o que já está digitado. Ajustado durante a renderização, como
  // recomenda o React, em vez de num efeito.
  const [prevValue, setPrevValue] = useState(value);
  if (!Object.is(value, prevValue)) {
    setPrevValue(value);
    if (!Object.is(parseNum(text), value) && !(value === null && text === '')) setText(showNum(value, digits));
  }
  return (
    <label className="nfield">
      <span>{label}</span>
      <span className="nfield__box">
        <input
          inputMode={integer ? 'numeric' : 'decimal'}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseNum(e.target.value);
            onChange(integer && n !== null && !Number.isNaN(n) ? Math.trunc(n) : n);
          }}
        />
        {suffix && <span className="nfield__suffix">{suffix}</span>}
      </span>
    </label>
  );
}

function Bloco({ titulo, children, ajuda }: { titulo: string; children: ReactNode; ajuda?: string }) {
  return (
    <section className="card-form editor__block">
      <h3>{titulo}</h3>
      {ajuda && <p className="field__help">{ajuda}</p>}
      {children}
    </section>
  );
}

function moveItem<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  return copy;
}

const Seta = ({ dir, label, onClick }: { dir: -1 | 1; label: string; onClick: () => void }) => (
  <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d={dir < 0 ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
);

// ---------- escolha do modelo (produto novo) ----------

function EscolheModelo({
  categorias,
  onPick,
  onBack,
}: {
  categorias: CategoriaPainel[];
  onPick: (t: TemplateDTO, categoryId: number) => void;
  onBack: () => void;
}) {
  const [modelos, setModelos] = useState<TemplateDTO[] | null>(null);
  const [cat, setCat] = useState(categorias[0]?.id ?? 0);
  useEffect(() => {
    api
      .modelos()
      .then(setModelos)
      .catch(() => setModelos([]));
  }, []);
  return (
    <section className="painel__page editor">
      <button type="button" className="link" onClick={onBack}>
        ← Voltar à lista
      </button>
      <h2>Novo produto</h2>
      <div className="field">
        <label htmlFor="novo-cat">Categoria</label>
        <select id="novo-cat" value={cat} onChange={(e) => setCat(Number(e.target.value))}>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <p className="field__help">
        Escolha o modelo mais parecido: os grupos de opção já vêm montados e dá para ajustar depois.
      </p>
      <div className="modelos">
        {(modelos ?? []).map((m) => (
          <button key={m.id} type="button" className="modelo" onClick={() => onPick(m, cat)}>
            <strong>{m.name}</strong>
            <span className="tag">{m.saleUnit === 'KG' ? 'Por quilo' : 'Por unidade'}</span>
            <span className="modelo__groups">
              {m.groups.length ? m.groups.map((g) => g.name).join(' · ') : 'Sem opções'}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------- editor ----------

export function ProdutoEditor({
  produtoId,
  categorias,
  onDone,
  onOpen,
  onAuthError,
  aviso,
}: {
  /** Mensagem de sucesso vinda da ação anterior (criado, cópia criada). */
  aviso?: string | null;
  /** null = produto novo */
  produtoId: number | null;
  categorias: CategoriaPainel[];
  onDone: (msg?: string) => void;
  onOpen: (id: number, msg?: string) => void;
  onAuthError: (e: unknown) => boolean;
}) {
  const [form, setForm] = useState<ProductForm | null>(null);
  const [inicial, setInicial] = useState<string>('');
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(produtoId !== null);

  useEffect(() => {
    if (produtoId === null) return;
    // oxlint-disable-next-line react/set-state-in-effect -- mostra "carregando" ao iniciar a busca do produto
    setCarregando(true);
    api
      .cadastro(produtoId)
      .then((f) => {
        setForm(f);
        setInicial(JSON.stringify(f));
      })
      .catch((e: unknown) => onAuthError(e) || setServerErrors([e instanceof Error ? e.message : String(e)]))
      .finally(() => setCarregando(false));
  }, [produtoId, onAuthError]);

  const problems = useMemo(() => (form ? validateProduct(form) : { errors: [], warnings: [] }), [form]);
  const dirty = form !== null && JSON.stringify(form) !== inicial;

  const erro = (e: unknown) => {
    if (onAuthError(e)) return;
    setServerErrors(e instanceof ApiError ? e.errors : [e instanceof Error ? e.message : String(e)]);
  };

  const sair = () => {
    if (!dirty || window.confirm('Sair sem salvar? As mudanças serão perdidas.')) onDone();
  };

  if (produtoId === null && !form) {
    return (
      <EscolheModelo
        categorias={categorias}
        onBack={() => onDone()}
        onPick={(t, categoryId) => {
          const f = productFromTemplate(t, categoryId);
          setForm(f);
          setInicial('');
        }}
      />
    );
  }
  if (carregando || !form) return <p className="status">{serverErrors[0] ?? 'Carregando…'}</p>;

  const set = (patch: Partial<ProductForm>) => setForm({ ...form, ...patch });
  const setGroup = (gi: number, patch: Partial<GroupForm>) =>
    set({ groups: form.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) });
  const setOption = (gi: number, oi: number, patch: Partial<OptionForm>) =>
    setGroup(gi, { options: form.groups[gi]!.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });

  const salvar = async () => {
    setServerErrors([]);
    if (problems.errors.length) return;
    setSalvando(true);
    try {
      if (produtoId === null) {
        const { id } = await api.criaProduto(form);
        onOpen(id, `${form.name} criado.`);
      } else {
        await api.salvaProduto(produtoId, form);
        setInicial(JSON.stringify(form));
        onDone(`${form.name} salvo.`);
      }
    } catch (e) {
      erro(e);
    } finally {
      setSalvando(false);
    }
  };

  const duplicar = async () => {
    if (dirty && !window.confirm('Duplicar sem salvar as mudanças? A cópia é feita do produto salvo.')) return;
    try {
      const { id } = await api.duplicaProduto(produtoId!);
      onOpen(id, 'Cópia criada, indisponível e sem códigos PDV. Ajuste e deixe disponível quando estiver pronta.');
    } catch (e) {
      erro(e);
    }
  };

  const kg = form.saleUnit === 'KG';
  const grupoPreco = form.groups.find((g) => g.priceMode === 'replace');
  const grupoPeso = form.groups.find((g) => g.hasWeight);

  return (
    <section className="painel__page editor" aria-labelledby="editor-title">
      <button type="button" className="link" onClick={sair}>
        ← Voltar à lista
      </button>
      {aviso && (
        <p className="form-ok agenda__msg" role="status">
          {aviso}
        </p>
      )}
      <div className="editor__head">
        <h2 id="editor-title">{produtoId === null ? 'Novo produto' : form.name || 'Produto'}</h2>
        {produtoId !== null && (
          <button type="button" className="switch__btn" onClick={duplicar}>
            Duplicar
          </button>
        )}
      </div>

      <Bloco titulo="Dados do produto">
        <div className="field">
          <label htmlFor="p-nome">Nome</label>
          <input id="p-nome" maxLength={100} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="p-cat">Categoria</label>
          <select id="p-cat" value={form.categoryId} onChange={(e) => set({ categoryId: Number(e.target.value) })}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-desc">Descrição</label>
          <textarea
            id="p-desc"
            rows={3}
            maxLength={1000}
            value={form.description ?? ''}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
        <div className="field">
          <span className="capa__label">Foto do produto</span>
          <FotoUpload value={form.imageUrl} onChange={(url) => set({ imageUrl: url })} onError={erro} label="Foto" />
        </div>
        <div className="field">
          <label htmlFor="p-pdv">Código PDV do produto</label>
          <input
            id="p-pdv"
            maxLength={20}
            value={form.pdvCode ?? ''}
            onChange={(e) => set({ pdvCode: e.target.value || null })}
            placeholder={form.groups.some((g) => g.hasPdv) ? 'Opcional: as opções têm código próprio' : 'Ex: 1001'}
          />
          <p className="field__help">O mesmo código do caixa (PDV). Vai na mensagem do pedido ao lado do item.</p>
        </div>
      </Bloco>

      <Bloco titulo="Venda">
        <div className="radios" role="radiogroup" aria-label="Como é vendido">
          {(['UN', 'KG'] as const).map((u) => (
            <label key={u} className={form.saleUnit === u ? 'radio radio--on' : 'radio'}>
              <input type="radio" name="unidade" checked={form.saleUnit === u} onChange={() => set({ saleUnit: u })} />
              {u === 'UN' ? 'Por unidade' : 'Por quilo'}
            </label>
          ))}
        </div>
        <div className="editor__grid">
          <NumField
            label={kg ? 'Preço do quilo' : 'Preço da unidade'}
            suffix="R$"
            value={form.basePrice}
            onChange={(v) => set({ basePrice: v })}
            placeholder={grupoPreco ? `Opcional: ${grupoPreco.name || 'o grupo'} define` : ''}
          />
          <NumField
            label="Quantidade mínima"
            integer
            digits={0}
            value={form.minQuantity}
            onChange={(v) => set({ minQuantity: v ?? 0 })}
          />
          <NumField
            label="Antecedência própria"
            integer
            digits={0}
            suffix="h"
            value={form.leadTimeHours}
            onChange={(v) => set({ leadTimeHours: v })}
            placeholder="Padrão da loja"
          />
          {kg && !grupoPeso && (
            <>
              <NumField
                label="Peso mínimo"
                suffix="kg"
                digits={3}
                value={form.weightMinKg}
                onChange={(v) => set({ weightMinKg: v })}
              />
              <NumField
                label="Peso máximo"
                suffix="kg"
                digits={3}
                value={form.weightMaxKg}
                onChange={(v) => set({ weightMaxKg: v })}
              />
            </>
          )}
        </div>
        {kg && (
          <p className="field__help">
            {grupoPeso
              ? `O peso vem das opções de ${grupoPeso.name || 'tamanho'}.`
              : 'Produto por quilo precisa de uma faixa de peso para a estimativa: aqui ou num grupo de tamanhos.'}
          </p>
        )}
        <label className="check">
          <input type="checkbox" checked={form.available} onChange={(e) => set({ available: e.target.checked })} />
          Disponível no cardápio
        </label>
      </Bloco>

      <Bloco
        titulo="Opções do produto"
        ajuda="Tamanhos, sabores, estilos e adicionais. Cada grupo vira uma pergunta no card do cliente."
      >
        {form.groups.map((g, gi) => (
          <div key={g.id ?? `novo-${gi}`} className="grupo">
            <div className="grupo__head">
              <div className="field grupo__name">
                <label htmlFor={`g-${gi}`}>Grupo</label>
                <input
                  id={`g-${gi}`}
                  maxLength={50}
                  placeholder="Ex: Tamanho"
                  value={g.name}
                  onChange={(e) => setGroup(gi, { name: e.target.value })}
                />
              </div>
              <span className="prow__order">
                {gi > 0 && (
                  <Seta
                    dir={-1}
                    label={`Subir grupo ${g.name}`}
                    onClick={() => set({ groups: moveItem(form.groups, gi, -1) })}
                  />
                )}
                {gi < form.groups.length - 1 && (
                  <Seta
                    dir={1}
                    label={`Descer grupo ${g.name}`}
                    onClick={() => set({ groups: moveItem(form.groups, gi, 1) })}
                  />
                )}
              </span>
              <button
                type="button"
                className="link link--danger"
                onClick={() => {
                  if (!g.options.length || window.confirm(`Remover o grupo ${g.name || ''} e suas opções?`))
                    set({ groups: form.groups.filter((_, i) => i !== gi) });
                }}
              >
                Remover grupo
              </button>
            </div>

            <div className="grupo__traits">
              <label>
                Preço das opções
                <select
                  value={g.priceMode ?? ''}
                  onChange={(e) => setGroup(gi, { priceMode: (e.target.value || null) as GroupForm['priceMode'] })}
                >
                  <option value="">Não muda o preço</option>
                  <option value="replace">Cada opção tem seu preço</option>
                  <option value="add">Soma ao preço (adicional)</option>
                </select>
              </label>
              <NumField
                label="Escolhas mín."
                integer
                digits={0}
                value={g.minSelect}
                onChange={(v) => setGroup(gi, { minSelect: v ?? 0 })}
              />
              <NumField
                label="Escolhas máx."
                integer
                digits={0}
                value={g.maxSelect}
                onChange={(v) => setGroup(gi, { maxSelect: v ?? 1 })}
              />
              {kg ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={g.hasWeight}
                    onChange={(e) => setGroup(gi, { hasWeight: e.target.checked })}
                  />
                  Opções com faixa de peso
                </label>
              ) : (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={g.hasPdv}
                    onChange={(e) => setGroup(gi, { hasPdv: e.target.checked })}
                  />
                  Cada opção tem código PDV
                </label>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={g.controlsImage}
                  onChange={(e) => setGroup(gi, { controlsImage: e.target.checked })}
                />
                Troca a foto do produto
              </label>
            </div>
            <p className="field__help">
              {g.minSelect === 0
                ? 'Opcional para o cliente.'
                : `O cliente escolhe ${g.minSelect === g.maxSelect ? g.minSelect : `de ${g.minSelect} a ${g.maxSelect}`}.`}
            </p>

            <ul className="opcoes">
              {g.options.map((o, oi) => (
                <li key={o.id ?? `nova-${oi}`} className="opcao">
                  <input
                    className="opcao__name"
                    aria-label="Nome da opção"
                    placeholder="Ex: Pequena"
                    maxLength={50}
                    value={o.name}
                    onChange={(e) => setOption(gi, oi, { name: e.target.value })}
                  />
                  {g.priceMode && (
                    <NumField
                      label={g.priceMode === 'add' ? 'Soma' : kg ? 'Preço/kg' : 'Preço'}
                      suffix="R$"
                      value={o.price}
                      onChange={(v) => setOption(gi, oi, { price: v })}
                    />
                  )}
                  {g.hasWeight && kg && (
                    <>
                      <NumField
                        label="Peso mín."
                        suffix="kg"
                        digits={3}
                        value={o.weightMinKg}
                        onChange={(v) => setOption(gi, oi, { weightMinKg: v })}
                      />
                      <NumField
                        label="Peso máx."
                        suffix="kg"
                        digits={3}
                        value={o.weightMaxKg}
                        onChange={(v) => setOption(gi, oi, { weightMaxKg: v })}
                      />
                    </>
                  )}
                  {g.hasPdv && !kg && (
                    <label className="nfield">
                      <span>PDV</span>
                      <input
                        maxLength={20}
                        value={o.pdvCode ?? ''}
                        onChange={(e) => setOption(gi, oi, { pdvCode: e.target.value || null })}
                      />
                    </label>
                  )}
                  {g.controlsImage && (
                    <FotoUpload
                      compact
                      value={o.imageUrl}
                      onChange={(url) => setOption(gi, oi, { imageUrl: url })}
                      onError={erro}
                      label="Foto da opção"
                    />
                  )}
                  <label className="check opcao__on">
                    <input
                      type="checkbox"
                      checked={o.available}
                      onChange={(e) => setOption(gi, oi, { available: e.target.checked })}
                    />
                    Disponível
                  </label>
                  <span className="prow__order">
                    {oi > 0 && (
                      <Seta
                        dir={-1}
                        label={`Subir ${o.name}`}
                        onClick={() => setGroup(gi, { options: moveItem(g.options, oi, -1) })}
                      />
                    )}
                    {oi < g.options.length - 1 && (
                      <Seta
                        dir={1}
                        label={`Descer ${o.name}`}
                        onClick={() => setGroup(gi, { options: moveItem(g.options, oi, 1) })}
                      />
                    )}
                  </span>
                  <button
                    type="button"
                    className="link link--danger"
                    onClick={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}
                  >
                    Remover
                  </button>
                  <textarea
                    className="opcao__desc"
                    aria-label={`Descrição da opção ${o.name}`}
                    placeholder="Descrição (opcional): aparece no site quando o cliente escolhe esta opção. Ex: Aproximadamente 50 gramas"
                    maxLength={300}
                    rows={2}
                    value={o.description ?? ''}
                    onChange={(e) => setOption(gi, oi, { description: e.target.value || null })}
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="link"
              onClick={() => setGroup(gi, { options: [...g.options, emptyOption()] })}
            >
              + Adicionar opção
            </button>
          </div>
        ))}
        <button
          type="button"
          className="switch__btn agenda__open"
          onClick={() => set({ groups: [...form.groups, { ...emptyGroup(), hasWeight: false }] })}
        >
          + Adicionar grupo
        </button>
      </Bloco>

      {/* Barra fixa: problemas e salvar */}
      <div className="editor__bar">
        {(problems.errors.length > 0 || serverErrors.length > 0) && (
          <ul className="editor__errors" role="alert">
            {[...serverErrors, ...problems.errors].map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {problems.warnings.length > 0 && problems.errors.length === 0 && (
          <ul className="editor__warnings">
            {problems.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <div className="editor__actions">
          <button type="button" className="link" onClick={sair}>
            Cancelar
          </button>
          <button type="button" className="add" disabled={salvando || problems.errors.length > 0} onClick={salvar}>
            {salvando ? 'Salvando…' : produtoId === null ? 'Criar produto' : 'Salvar'}
          </button>
        </div>
      </div>
    </section>
  );
}
