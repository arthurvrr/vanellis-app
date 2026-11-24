import {
  ADDRESS_MAX_LENGTH,
  describeSelection,
  formatAddress,
  validateAddress,
  type Address,
  type AddressErrors,
  formatBRL,
  formatCPF,
  formatDates,
  formatDay,
  formatPhone,
  formatRange,
  generateOrderCode,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  buildOrderMessage,
  orderWhatsAppUrl,
  resolveCart,
  sumRanges,
  validateCustomer,
  type AgendaDTO,
  type CustomerData,
  type CustomerErrors,
  type ProductDTO,
  type PublicSettingsDTO,
} from '@vanellis/shared';
import { useEffect, useId, useMemo, useState } from 'react';
import { fetchConfiguracoes, fetchDisponibilidade } from '../lib/api';
import { IS_DEMO } from '../lib/demo';
import { useCart } from '../lib/cart';
import { useCheckoutDraft, type AddressTouched, type Modo, type Pickup, type Touched } from '../lib/checkoutDraft';
import { PickupCalendar } from './PickupCalendar';

// Tela 3 do cliente: retirada, dados do cliente, avisos e envio pelo WhatsApp
// (RF05–RF08, RF45, RN48). Os dados ficam só na memória da página (RN02).

/** Sorteio do código do pedido com o gerador criptográfico do navegador. */
const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

export function CheckoutView({
  produtos,
  pricesHidden,
  onBack,
  onMenu,
  onSent,
}: {
  produtos: ProductDTO[];
  /** Preços ocultos pelo operador (RF39, RN38). */
  pricesHidden: boolean;
  onBack: () => void;
  onMenu: () => void;
  onSent: () => void;
}) {
  const { lines: cartLines, clear } = useCart();
  const { valid: lines } = resolveCart(cartLines, produtos);
  const {
    pickup,
    setPickup,
    modo,
    setModo,
    address,
    setAddressField,
    addressTouched,
    touchAddress,
    customer,
    setField,
    touched,
    touch,
    touchAll,
    agreed,
    setAgreed,
    finish,
  } = useCheckoutDraft();
  const productKey = [...new Set(lines.map((l) => l.product.id))].sort((a, b) => a - b).join(',');
  const [agenda, setAgenda] = useState<AgendaDTO | null>(null);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PublicSettingsDTO | null>(null);
  const [triedToSend, setTriedToSend] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchConfiguracoes(ctrl.signal)
      .then(setSettings)
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  // A disponibilidade depende dos produtos (antecedência, RN14): recarrega quando eles mudam.
  useEffect(() => {
    if (!productKey) return;
    const ctrl = new AbortController();
    // oxlint-disable-next-line react/set-state-in-effect -- limpa o erro anterior ao iniciar uma nova busca
    setAgendaError(null);
    fetchDisponibilidade(productKey.split(',').map(Number), ctrl.signal)
      .then(setAgenda)
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setAgendaError(e instanceof Error ? e.message : String(e));
      });
    return () => ctrl.abort();
  }, [productKey]);

  // Tele-entrega só quando o operador a liga para algum dos dias (RN43, RN44); se for desligada
  // enquanto o cliente escolhe, volta para retirada (C79).
  const deliveryAvailable = !!agenda?.days.some((d) => d.delivery);
  useEffect(() => {
    if (agenda && !deliveryAvailable && modo === 'entrega') setModo('retirada');
  }, [agenda, deliveryAvailable, modo, setModo]);
  const entrega = modo === 'entrega' && deliveryAvailable;
  // Na entrega, o calendário mostra só os dias com entrega (C78).
  const visibleAgenda = useMemo(
    () => (agenda && entrega ? { ...agenda, days: agenda.days.filter((d) => d.delivery) } : agenda),
    [agenda, entrega],
  );

  // Se a escolha deixou de valer (carrinho mudou, horário lotou, trocou para entrega), o cliente
  // escolhe de novo.
  useEffect(() => {
    if (!visibleAgenda || !pickup) return;
    const day = visibleAgenda.days.find((d) => d.date === pickup.date);
    // Horário ainda não escolhido (`null`) vale; um horário escolhido precisa continuar livre.
    const stillValid = day && (pickup.time === null || day.times.includes(pickup.time));
    if (!stillValid) setPickup(null);
  }, [visibleAgenda, pickup, setPickup]);

  if (!lines.length) {
    return (
      <section className="cart">
        <p className="cart__empty">Seu carrinho está vazio.</p>
        <button type="button" className="link" onClick={onMenu}>
          ← Ver o cardápio
        </button>
      </section>
    );
  }

  const errors = validateCustomer(customer);
  const addressErrors = entrega ? validateAddress(address) : {};
  const estimated = lines.some((l) => l.product.saleUnit === 'KG');
  const total = sumRanges(lines.map((l) => l.estimate));
  const itemCount = lines.length === 1 ? '1 item' : `${lines.length} itens`;
  const day = visibleAgenda?.days.find((d) => d.date === pickup?.date);

  // O que ainda falta para enviar (RN48: "Li e concordo" por último).
  const missing: string[] = [];
  const recebe = entrega ? 'entrega' : 'retirada';
  if (!day) missing.push(`escolha o dia da ${recebe}`);
  else if (!day.special && !pickup?.time) missing.push(`escolha o horário da ${recebe}`);
  if (Object.keys(addressErrors).length) missing.push('preencha o endereço de entrega');
  if (Object.keys(errors).length) missing.push('confira seus dados');
  if (!agreed) missing.push('marque "Li e concordo"');

  const order =
    day && pickup && settings
      ? {
          code: '',
          lines,
          pickup: {
            date: day.date,
            weekday: day.weekday,
            time: day.special ? null : pickup.time,
            special: day.special,
          },
          customer,
          delivery: entrega ? address : null,
          template: settings.messageTemplate,
        }
      : null;
  const tooLong =
    order !== null && orderWhatsAppUrl(settings!.whatsappNumber, { ...order, code: 'VNL-XXXXX' }) === null;

  const send = () => {
    setTriedToSend(true);
    touchAll();
    if (missing.length || !order || !settings || tooLong) return;
    const code = generateOrderCode(cryptoRandom);
    const link = orderWhatsAppUrl(settings.whatsappNumber, { ...order, code });
    if (!link) return;
    // Na versão de teste o pedido só aparece na tela, para não chegar ao WhatsApp da padaria.
    if (!IS_DEMO) window.open(link.url, '_blank');
    finish({
      code,
      url: link.url,
      message: buildOrderMessage({ ...order, code }, link.compact),
      pickup: day!.special
        ? `${formatDay(day!)} (${day!.special}), horário a combinar`
        : `${formatDay(day!)} às ${pickup!.time}`,
      modo: entrega ? 'Entrega' : 'Retirada',
      address: entrega ? formatAddress(address) : null,
      items: lines.map(({ line, product }) => {
        const choices = describeSelection(product, line.selection);
        return `${line.quantity}x ${product.name}${choices ? ` (${choices})` : ''}`;
      }),
      total: total ? `${estimated ? 'Total estimado' : 'Total'}: ${formatRange(total)}` : null,
    });
    clear(); // RN50: o carrinho esvazia ao enviar
    onSent();
  };

  return (
    <section className="cart" aria-labelledby="checkout-title">
      <div className="cart__top">
        <button type="button" className="link" onClick={onBack}>
          ← Voltar ao carrinho
        </button>
        <h2 id="checkout-title">{entrega ? 'Entrega e seus dados' : 'Retirada e seus dados'}</h2>
      </div>

      <p className="checkout-summary">
        <span>{itemCount}</span>
        {total && (
          <strong>
            {estimated ? 'Total estimado ' : 'Total '}
            {total.min === total.max ? formatBRL(total.min) : `${formatBRL(total.min)} a ${formatBRL(total.max)}`}
          </strong>
        )}
      </p>

      {agenda?.paused ? (
        <p className="cart__notice" role="status">
          No momento a padaria não está recebendo novos pedidos pelo site. Fale com a gente pelo WhatsApp.
        </p>
      ) : (
        <>
          <PickupPicker
            agenda={visibleAgenda}
            error={agendaError}
            value={pickup}
            onChange={setPickup}
            modo={entrega ? 'entrega' : 'retirada'}
            onModo={deliveryAvailable ? setModo : null}
          />
          {entrega && (
            <AddressForm
              data={address}
              errors={addressErrors}
              touched={addressTouched}
              onChange={setAddressField}
              onBlur={touchAddress}
            />
          )}
          <CustomerForm data={customer} errors={errors} touched={touched} onChange={setField} onBlur={touch} />

          {/* Bloco único de avisos (RN48): só os que valem para este pedido. */}
          <aside className="notices" aria-labelledby="notices-title">
            <h3 id="notices-title">Antes de enviar</h3>
            <ul>
              <li>Todas as encomendas precisam de um sinal. O valor será informado pela padaria no WhatsApp.</li>
              {/* RN46: o site não mostra nem soma taxa de entrega. */}
              {entrega && (
                <li>
                  A taxa de entrega será informada pela padaria no WhatsApp. A entrega depende de disponibilidade e será
                  confirmada junto com o pedido.
                </li>
              )}
              {pickup && (
                <li>
                  A data e o horário escolhidos são uma preferência: a padaria confirma pelo WhatsApp e pode propor
                  outro horário conforme a disponibilidade.
                </li>
              )}
              {pricesHidden && (
                <li>Os preços estão sendo atualizados: a padaria informa os valores na confirmação do pedido.</li>
              )}
              {estimated && !pricesHidden && (
                <li>
                  Os produtos vendidos por quilo têm valor estimado. O preço final só é conhecido quando o produto fica
                  pronto e é pesado.
                </li>
              )}
            </ul>
            <label className="agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              Li e concordo
            </label>
          </aside>

          {tooLong && (
            <p className="cart__notice" role="alert">
              O pedido ficou grande demais para uma mensagem de WhatsApp. Divida em dois pedidos.
            </p>
          )}
          {triedToSend && missing.length > 0 && (
            <p className="field__error" role="alert">
              Para enviar: {missing.join(', ')}.
            </p>
          )}
          <button type="button" className="primary primary--whatsapp" disabled={!settings || tooLong} onClick={send}>
            {IS_DEMO ? 'Enviar pedido (teste)' : 'Enviar pedido pelo WhatsApp'}
          </button>
          <p className="field__help send-help">
            {IS_DEMO
              ? 'Versão de teste: a mensagem aparece na tela e não é enviada para a padaria.'
              : 'O WhatsApp abre com a mensagem pronta: é só apertar enviar. O pedido vale depois que a padaria confirmar.'}
          </p>
        </>
      )}
    </section>
  );
}

function PickupPicker({
  agenda,
  error,
  value,
  onChange,
  modo,
  onModo,
}: {
  agenda: AgendaDTO | null;
  error: string | null;
  value: Pickup | null;
  onChange: (p: Pickup | null) => void;
  modo: Modo;
  /** Troca entre retirada e entrega; `null` quando a entrega está desligada (RN05). */
  onModo: ((m: Modo) => void) | null;
}) {
  const day = agenda?.days.find((d) => d.date === value?.date);
  const entrega = modo === 'entrega';

  return (
    <section className="checkout-section" aria-labelledby="pickup-title">
      <h3 id="pickup-title">{onModo ? 'Como você quer receber?' : 'Retirada no balcão'}</h3>
      {onModo && (
        <div className="group__options modo" role="radiogroup" aria-label="Retirada ou tele-entrega">
          {(
            [
              ['retirada', 'Retirar no balcão'],
              ['entrega', 'Tele-entrega'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={modo === m}
              className={modo === m ? 'chip chip--on' : 'chip'}
              onClick={() => onModo(m)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {onModo && entrega && agenda && agenda.days.length > 0 && (
        <p className="checkout-info">A entrega vale só nos dias marcados no calendário, nos mesmos horários.</p>
      )}
      {error && <p className="field__error">{error}</p>}
      {!agenda && !error && <p>Carregando os horários…</p>}
      {/* Cardápios especiais no carrinho: só as datas deles (RN19, RN29); sem data em comum, pedidos separados (RN30). */}
      {agenda?.rule?.conflict ? (
        <p className="cart__notice" role="alert">
          {agenda.rule.menus.map((m) => `${m.name} (retirada em ${formatDates(m.pickupDates)})`).join(' e ')} não têm
          data de retirada em comum. Faça um pedido para cada cardápio: tire do carrinho os itens de um deles e envie,
          depois faça o outro.
        </p>
      ) : (
        agenda?.rule?.menus.map((m) => (
          <p key={m.name} className="checkout-info">
            {m.name}: retirada só em {formatDates(m.pickupDates)}
            {agenda.rule!.menus.length === 1 ? '. Os outros itens do pedido vêm junto nessa data.' : '.'}
          </p>
        ))
      )}
      {agenda && agenda.days.length === 0 && !agenda.rule?.conflict && (
        <p>Não há horários de retirada disponíveis para estes itens nos próximos dias.</p>
      )}
      {agenda && agenda.days.length > 0 && (
        <>
          <p className="checkout-label">Dia</p>
          <PickupCalendar
            days={agenda.days}
            value={value?.date ?? null}
            onChange={(date) => onChange({ date, time: null })}
          />
          {day && (
            <p className="checkout-chosen">
              {entrega ? 'Entrega' : 'Retirada'} em {formatDay(day)}
              {value?.time && ` às ${value.time}`}
            </p>
          )}

          {day?.special && (
            <p className="checkout-info">
              {day.special}: escolha só o dia. O horário {entrega ? 'da entrega' : 'de retirada'} será informado pela
              padaria no próprio dia.
            </p>
          )}

          {day && !day.special && (
            <>
              <p className="checkout-label">Horário</p>
              {/* Horários de 30 em 30 minutos (RN51), separados em manhã e tarde para achar rápido. */}
              {[
                { label: 'Manhã', times: day.times.filter((t) => t < '12:00') },
                { label: 'Tarde', times: day.times.filter((t) => t >= '12:00') },
              ]
                .filter((g) => g.times.length)
                .map((g) => (
                  <div key={g.label} className="time-group">
                    <p className="time-group__label">{g.label}</p>
                    <div
                      className="group__options"
                      role="radiogroup"
                      aria-label={`Horário da retirada, ${g.label.toLowerCase()}`}
                    >
                      {g.times.map((t) => {
                        const on = value?.time === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            className={on ? 'chip chip--on chip--time' : 'chip chip--time'}
                            onClick={() => onChange({ date: day.date, time: t })}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </>
          )}
        </>
      )}
    </section>
  );
}

function CustomerForm({
  data,
  errors,
  touched,
  onChange,
  onBlur,
}: {
  data: CustomerData;
  errors: CustomerErrors;
  touched: Touched;
  onChange: (field: keyof CustomerData, value: string) => void;
  onBlur: (field: keyof CustomerData) => void;
}) {
  const id = useId();
  const field = (name: keyof CustomerData) => ({
    id: `${id}-${name}`,
    'aria-invalid': touched[name] && errors[name] ? true : undefined,
    'aria-describedby': `${id}-${name}-help`,
    onBlur: () => onBlur(name),
  });
  const help = (name: keyof CustomerData, text?: string) => (
    <p id={`${id}-${name}-help`} className={touched[name] && errors[name] ? 'field__error' : 'field__help'}>
      {touched[name] && errors[name] ? errors[name] : text}
    </p>
  );

  return (
    <section className="checkout-section" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Seus dados</h3>
      <p className="field__help">Vão só na mensagem do WhatsApp e não ficam salvos neste site.</p>

      <div className="field">
        <label htmlFor={`${id}-name`}>Nome completo</label>
        <input
          {...field('name')}
          autoComplete="name"
          maxLength={NAME_MAX_LENGTH}
          value={data.name}
          onChange={(e) => onChange('name', e.target.value)}
        />
        {help('name')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-cpf`}>CPF</label>
        <input
          {...field('cpf')}
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          value={data.cpf}
          onChange={(e) => onChange('cpf', formatCPF(e.target.value))}
        />
        {help('cpf', 'Usado para identificar você no pedido e para a nota fiscal.')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-phone`}>Telefone com DDD</label>
        <input
          {...field('phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(51) 99999-9999"
          value={data.phone}
          onChange={(e) => onChange('phone', formatPhone(e.target.value))}
        />
        {help('phone')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-note`}>Observação do pedido (opcional)</label>
        <textarea
          {...field('note')}
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          value={data.note}
          onChange={(e) => onChange('note', e.target.value)}
        />
        {help('note', `Algo que a padaria precisa saber sobre o pedido. ${data.note.length}/${NOTE_MAX_LENGTH}`)}
      </div>
    </section>
  );
}

const ADDRESS_FIELDS: { key: keyof Address; label: string; autoComplete: string; help?: string }[] = [
  { key: 'street', label: 'Rua', autoComplete: 'address-line1' },
  { key: 'number', label: 'Número', autoComplete: 'off', help: 'Sem número? Escreva "s/n".' },
  { key: 'complement', label: 'Complemento (opcional)', autoComplete: 'address-line2', help: 'Ex: ap 201, bloco B' },
  { key: 'district', label: 'Bairro', autoComplete: 'address-level3' },
  { key: 'city', label: 'Cidade', autoComplete: 'address-level2' },
  { key: 'reference', label: 'Ponto de referência (opcional)', autoComplete: 'off' },
];

/** Endereço da tele-entrega (RN45): vai só na mensagem, não passa pelo servidor nem fica salvo. */
function AddressForm({
  data,
  errors,
  touched,
  onChange,
  onBlur,
}: {
  data: Address;
  errors: AddressErrors;
  touched: AddressTouched;
  onChange: (field: keyof Address, value: string) => void;
  onBlur: (field: keyof Address) => void;
}) {
  const id = useId();
  return (
    <section className="checkout-section" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Endereço de entrega</h3>
      <p className="field__help">Vai só na mensagem do WhatsApp e não fica salvo neste site.</p>
      <div className="address">
        {ADDRESS_FIELDS.map(({ key, label, autoComplete, help }) => {
          const showError = touched[key] && errors[key];
          return (
            <div key={key} className={`field address__${key}`}>
              <label htmlFor={`${id}-${key}`}>{label}</label>
              <input
                id={`${id}-${key}`}
                autoComplete={autoComplete}
                maxLength={ADDRESS_MAX_LENGTH}
                aria-invalid={showError ? true : undefined}
                aria-describedby={`${id}-${key}-help`}
                value={data[key]}
                onChange={(e) => onChange(key, e.target.value)}
                onBlur={() => onBlur(key)}
              />
              <p id={`${id}-${key}-help`} className={showError ? 'field__error' : 'field__help'}>
                {showError ? errors[key] : help}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
