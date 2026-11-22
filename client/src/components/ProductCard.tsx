import {
  cannotAdd,
  cardEstimate,
  cardImage,
  cardPrice,
  formatBRL,
  formatRange,
  type OptionGroupDTO,
  type ProductDTO,
  type Selection,
} from '@vanellis/shared';
import { useState } from 'react';
import { asset } from '../lib/demo';
import { useCart } from '../lib/cart';
import { useToast } from '../lib/toast';
import { QuantityStepper } from './QuantityStepper';

// Card genérico: desenha os grupos de opção que o produto tiver, sem tipos fixos.
// Mostra só o essencial (RN49): preço do kg no topo e, com o tamanho escolhido, a
// estimativa no fim; avisos ficam no checkout (RN48).
export function ProductCard({ product }: { product: ProductDTO }) {
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(product.minQuantity);
  const { add } = useCart();
  const toast = useToast();

  const blocked = cannotAdd(product, selection);

  // Depois de adicionar, o card volta ao estado inicial e a confirmação aparece no canto (RF48).
  const onAdd = () => {
    const result = add(product.id, selection, quantity);
    if (result === 'full') {
      toast('Carrinho cheio: remova um item para adicionar outro.', 'error');
      return;
    }
    toast(result === 'merged' ? `${product.name}: quantidade somada no carrinho` : `${product.name} adicionado ao carrinho`);
    setSelection({});
    setQuantity(product.minQuantity);
  };

  const toggle = (group: OptionGroupDTO, optionId: number) => {
    setSelection((prev) => {
      const current = prev[group.id] ?? [];
      let next: number[];
      if (group.maxSelect === 1) next = current[0] === optionId ? [] : [optionId];
      else if (current.includes(optionId)) next = current.filter((id) => id !== optionId);
      else if (current.length < group.maxSelect) next = [...current, optionId];
      else next = current;
      return { ...prev, [group.id]: next };
    });
  };

  const price = cardPrice(product, selection);
  const image = cardImage(product, selection);
  const estimate = cardEstimate(product, selection, quantity);
  const chosenDescriptions = product.groups
    .flatMap((g) => g.options.filter((o) => selection[g.id]?.includes(o.id)))
    .map((o) => o.description)
    .filter(Boolean);

  return (
    <article className={product.available ? 'card' : 'card card--off'}>
      {image && <img className="card__img" src={asset(image)} alt={product.imageAlt ?? product.name} loading="lazy" />}
      <div className="card__body">
        <div className="card__head">
          <h2 className="card__name">{product.name}</h2>
          {price.value !== null && (
            <p className="card__price">
              {price.fromPrice && <span className="card__from">a partir de </span>}
              {formatBRL(price.value)}
              <span className="card__unit">/{price.unit}</span>
            </p>
          )}
        </div>
        {product.description && <p className="card__desc">{product.description}</p>}

        {product.groups.map((g) => (
          <fieldset key={g.id} className="group">
            <legend>
              {g.name}
              {g.maxSelect > 1 && <span className="group__hint"> (até {g.maxSelect})</span>}
              {g.minSelect === 0 && <span className="group__hint"> (opcional)</span>}
            </legend>
            <div className="group__options">
              {g.options
                .filter((o) => o.available)
                .map((o) => {
                  const on = selection[g.id]?.includes(o.id) ?? false;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={on ? 'chip chip--on' : 'chip'}
                      aria-pressed={on}
                      onClick={() => toggle(g, o.id)}
                    >
                      {o.name}
                      {o.priceMode === 'add' && o.price !== null && ` +${formatBRL(o.price)}`}
                    </button>
                  );
                })}
            </div>
          </fieldset>
        ))}

        {chosenDescriptions.map((d) => (
          <p key={d} className="card__desc">
            {d}
          </p>
        ))}
        <div className="card__actions">
          <QuantityStepper
            value={quantity}
            min={product.minQuantity}
            onChange={setQuantity}
            label={`Quantidade de ${product.name}`}
            disabled={!product.available}
          />
          <button type="button" className="add" disabled={blocked !== null} onClick={onAdd}>
            Adicionar
          </button>
        </div>
        <p className="card__hint">
          {blocked ?? (product.minQuantity > 1 ? `Mínimo de ${product.minQuantity} unidades` : '')}
        </p>
        {/* Por quilo: com o tamanho escolhido, a estimativa aparece no fim do card (RN49). */}
        {estimate && (
          <p className="card__estimate">
            Estimativa{quantity > 1 ? ` para ${quantity}` : ''}: <strong>{formatRange(estimate)}</strong>
          </p>
        )}
      </div>
    </article>
  );
}
