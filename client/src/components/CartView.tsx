import {
  cardImage,
  formatBRL,
  resolveCart,
  sumRanges,
  type ProductDTO,
  type Range,
  type Selection,
} from '@vanellis/shared';
import { useEffect, useState } from 'react';
import { useCart } from '../lib/cart';
import { QuantityStepper } from './QuantityStepper';

function formatRange(r: Range): string {
  return r.min === r.max ? formatBRL(r.min) : `${formatBRL(r.min)} a ${formatBRL(r.max)}`;
}

/** "Naked · Grande · Morangos": as escolhas na ordem dos grupos. */
function describe(product: ProductDTO, selection: Selection): string {
  return product.groups
    .flatMap((g) => g.options.filter((o) => selection[g.id]?.includes(o.id)).map((o) => o.name))
    .join(' · ');
}

// Tela 2 do cliente: itens do carrinho e total estimado (RF03, RF27). O cliente confere e
// segue para a tela de retirada e dados.
export function CartView({
  produtos,
  onBack,
  onContinue,
}: {
  produtos: ProductDTO[];
  onBack: () => void;
  onContinue: () => void;
}) {
  const { lines, setQuantity, remove } = useCart();
  const { valid, invalid } = resolveCart(lines, produtos);
  const [removedKeys, setRemovedKeys] = useState<ReadonlySet<string>>(new Set());
  const removedCount = removedKeys.size;

  // Itens que deixaram de valer (produto removido ou indisponível) saem do carrinho (RN10).
  useEffect(() => {
    if (!invalid.length) return;
    setRemovedKeys((prev) => new Set([...prev, ...invalid.map((l) => l.key)]));
    for (const l of invalid) remove(l.key);
  }, [invalid, remove]);

  const total = sumRanges(valid.map((v) => v.estimate));
  const estimated = valid.some((v) => v.product.saleUnit === 'KG');

  return (
    <section className="cart" aria-labelledby="cart-title">
      <div className="cart__top">
        <button type="button" className="link" onClick={onBack}>
          ← Continuar escolhendo
        </button>
        <h2 id="cart-title">Seu pedido</h2>
      </div>

      {removedCount > 0 && (
        <p className="cart__notice" role="status">
          {removedCount === 1
            ? 'Um item saiu do carrinho porque não está mais disponível.'
            : `${removedCount} itens saíram do carrinho porque não estão mais disponíveis.`}
        </p>
      )}

      {valid.length === 0 ? (
        <p className="cart__empty">Seu carrinho está vazio.</p>
      ) : (
        <>
          <ul className="cart__list">
            {valid.map(({ line, product, estimate }) => {
              const image = cardImage(product, line.selection);
              const choices = describe(product, line.selection);
              return (
                <li key={line.key} className="cart__item">
                  {image && <img className="cart__img" src={image} alt="" />}
                  <div className="cart__info">
                    <p className="cart__name">{product.name}</p>
                    {choices && <p className="cart__choices">{choices}</p>}
                    <div className="cart__row">
                      <QuantityStepper
                        value={line.quantity}
                        min={product.minQuantity}
                        onChange={(q) => setQuantity(line.key, q)}
                        label={`Quantidade de ${product.name}`}
                      />
                      <button type="button" className="link" onClick={() => remove(line.key)}>
                        Remover
                      </button>
                    </div>
                  </div>
                  <p className="cart__price">
                    {estimate ? formatRange(estimate) : ''}
                    {estimate && product.saleUnit === 'KG' && <span className="cart__approx">estimado pelo peso</span>}
                  </p>
                </li>
              );
            })}
          </ul>

          {total && (
            <p className="cart__total">
              <span>{estimated ? 'Total estimado' : 'Total'}</span>
              <strong>{formatRange(total)}</strong>
            </p>
          )}

          <button type="button" className="primary" onClick={onContinue}>
            Continuar
          </button>
        </>
      )}
    </section>
  );
}
