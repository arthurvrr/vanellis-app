import {
  formatBRL,
  formatCPF,
  formatDay,
  formatPhone,
  formatSlot,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  resolveCart,
  sumRanges,
  validateCustomer,
  type AgendaDTO,
  type CustomerData,
  type CustomerErrors,
  type ProductDTO,
} from '@vanellis/shared';
import { useEffect, useId, useState } from 'react';
import { fetchDisponibilidade } from '../lib/api';
import { useCart } from '../lib/cart';
import { useCheckoutDraft, type Pickup, type Touched } from '../lib/checkoutDraft';
import { PickupCalendar } from './PickupCalendar';

// Tela 3 do cliente: retirada, dados do cliente e avisos (RF05–RF07, RN48), depois de o cliente
// confirmar o carrinho. Os dados ficam só na memória da página (RN02).
// O envio pelo WhatsApp (RF08, RF45) entra na próxima etapa.

export function CheckoutView({
  produtos,
  onBack,
  onMenu,
}: {
  produtos: ProductDTO[];
  onBack: () => void;
  onMenu: () => void;
}) {
  const { lines: cartLines } = useCart();
  const { valid: lines } = resolveCart(cartLines, produtos);
  const { pickup, setPickup, customer, setField, touched, touch } = useCheckoutDraft();
  const productKey = [...new Set(lines.map((l) => l.product.id))].sort((a, b) => a - b).join(',');
  const [agenda, setAgenda] = useState<AgendaDTO | null>(null);
  const [agendaError, setAgendaError] = useState<string | null>(null);

  // A disponibilidade depende dos produtos (antecedência, RN14): recarrega quando eles mudam.
  useEffect(() => {
    if (!productKey) return;
    const ctrl = new AbortController();
    setAgendaError(null);
    fetchDisponibilidade(productKey.split(',').map(Number), ctrl.signal)
      .then(setAgenda)
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setAgendaError(e instanceof Error ? e.message : String(e));
      });
    return () => ctrl.abort();
  }, [productKey]);

  // Se a escolha deixou de valer (carrinho mudou, faixa lotou), o cliente escolhe de novo.
  useEffect(() => {
    if (!agenda || !pickup) return;
    const day = agenda.days.find((d) => d.date === pickup.date);
    // Horário ainda não escolhido (`null`) vale; um horário escolhido precisa continuar livre.
    const stillValid = day && (pickup.start === null || day.slots.some((s) => s.start === pickup.start));
    if (!stillValid) setPickup(null);
  }, [agenda, pickup, setPickup]);

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
  const estimated = lines.some((l) => l.product.saleUnit === 'KG');
  const total = sumRanges(lines.map((l) => l.estimate));
  const itemCount = lines.length === 1 ? '1 item' : `${lines.length} itens`;

  return (
    <section className="cart" aria-labelledby="checkout-title">
      <div className="cart__top">
        <button type="button" className="link" onClick={onBack}>
          ← Voltar ao carrinho
        </button>
        <h2 id="checkout-title">Retirada e seus dados</h2>
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
          <PickupPicker agenda={agenda} error={agendaError} value={pickup} onChange={setPickup} />
          <CustomerForm data={customer} errors={errors} touched={touched} onChange={setField} onBlur={touch} />

          {/* Bloco único de avisos (RN48): só os que valem para este pedido. */}
          <aside className="notices" aria-labelledby="notices-title">
            <h3 id="notices-title">Antes de enviar</h3>
            <ul>
              <li>Todas as encomendas precisam de um sinal. O valor será informado pela padaria no WhatsApp.</li>
              {pickup && (
                <li>
                  A data e o horário escolhidos são uma preferência: a padaria confirma pelo WhatsApp e pode propor
                  outro horário conforme a disponibilidade.
                </li>
              )}
              {estimated && (
                <li>
                  Os produtos vendidos por quilo têm valor estimado. O preço final só é conhecido quando o produto
                  fica pronto e é pesado.
                </li>
              )}
            </ul>
          </aside>
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
}: {
  agenda: AgendaDTO | null;
  error: string | null;
  value: Pickup | null;
  onChange: (p: Pickup | null) => void;
}) {
  const day = agenda?.days.find((d) => d.date === value?.date);

  return (
    <section className="checkout-section" aria-labelledby="pickup-title">
      <h3 id="pickup-title">Retirada no balcão</h3>
      {error && <p className="field__error">{error}</p>}
      {!agenda && !error && <p>Carregando os horários…</p>}
      {agenda && agenda.days.length === 0 && (
        <p>Não há horários de retirada disponíveis para estes itens nos próximos dias.</p>
      )}
      {agenda && agenda.days.length > 0 && (
        <>
          <p className="checkout-label">Dia</p>
          <PickupCalendar
            days={agenda.days}
            value={value?.date ?? null}
            onChange={(date) => onChange({ date, start: null })}
          />
          {day && <p className="checkout-chosen">Retirada em {formatDay(day)}</p>}

          {day?.special && (
            <p className="checkout-info">
              {day.special}: escolha só o dia. O horário de retirada será informado pela padaria no próprio dia.
            </p>
          )}

          {day && !day.special && (
            <>
              <p className="checkout-label">Horário</p>
              <div className="group__options" role="radiogroup" aria-label="Horário da retirada">
                {day.slots.map((s) => {
                  const on = value?.start === s.start;
                  return (
                    <button
                      key={s.start}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={on ? 'chip chip--on' : 'chip'}
                      onClick={() => onChange({ date: day.date, start: s.start })}
                    >
                      {formatSlot(s)}
                    </button>
                  );
                })}
              </div>
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
        {help('cpf', 'Usado para identificar você na retirada e para a nota fiscal.')}
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
