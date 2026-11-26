import {
  cannotAdd,
  cardEstimate,
  cardImage,
  cardPrice,
  formatBRL,
  formatRange,
  leadNotice,
  type OptionGroupDTO,
  type ProductDTO,
  type Selection,
} from '@vanellis/shared';
import { useState } from 'react';
import { Photo } from './Photo';
import { useCart } from '../lib/cart';
import { useToast } from '../lib/toast';
import { QuantityStepper } from './QuantityStepper';

// Detalhe do produto, aberto ao tocar no card do cardápio (RF28): desenha os grupos de opção
// que o produto tiver, sem tipos fixos. Preço do kg no topo e, com o tamanho escolhido, a
// estimativa antes do botão (RN49); avisos ficam no checkout (RN48).
export function ProductDetail({ product, onAdded }: { product: ProductDTO; onAdded: () => void }) {
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(product.minQuantity);
  const { add } = useCart();
  const toast = useToast();

  const blocked = cannotAdd(product, selection);

  // Depois de adicionar, o detalhe fecha e a confirmação aparece no canto (RF48).
  const onAdd = () => {
    const result = add(product.id, selection, quantity);
    if (result === 'full') {
      toast('Carrinho cheio: remova um item para adicionar outro.', 'error');
      return;
    }
    toast(
      result === 'merged' ? `${product.name}: quantidade somada no carrinho` : `${product.name} adicionado ao carrinho`,
    );
    onAdded();
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
    <article className="detail">
      <Photo src={image} className="detail__img" alt={product.imageAlt ?? product.name} />
      <div className="card__body detail__body">
        <div className="card__head">
          <h2 className="card__name detail__name" id="detail-title">
            {product.name}
          </h2>
          {price.value !== null && (
            <p className="card__price">
              {price.fromPrice && <span className="card__from">a partir de </span>}
              {formatBRL(price.value)}
              <span className="card__unit">/{price.unit}</span>
            </p>
          )}
        </div>
        {product.description && <p className="card__desc">{product.description}</p>}
        {/* Antecedência própria do produto e a primeira retirada possível (RF58, C105). */}
        {leadNotice(product) && <p className="card__lead">{leadNotice(product)}</p>}

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
        {/* Por quilo: com o tamanho escolhido, a estimativa aparece antes do botão (RN49). */}
        {estimate && (
          <p className="card__estimate">
            Estimativa{quantity > 1 ? ` para ${quantity}` : ''}: <strong>{formatRange(estimate)}</strong>
          </p>
        )}
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
      </div>
    </article>
  );
}
