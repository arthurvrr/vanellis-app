import { cardImage, cardPrice, formatBRL, HIDDEN_PRICE_LABEL, type ProductDTO } from '@vanellis/shared';
import { Photo } from './Photo';

// Card leve do cardápio: foto, nome, preço e "Escolher". As opções ficam no detalhe.
export function MenuCard({
  product,
  onOpen,
  selected = false,
  compact = false,
}: {
  product: ProductDTO;
  onOpen: () => void;
  /** Aberto no painel lateral (computador). */
  selected?: boolean;
  /** Card horizontal e menor, ao lado do painel (computador). */
  compact?: boolean;
}) {
  const price = cardPrice(product, {});
  const image = cardImage(product, {});
  return (
    <article
      className={[
        'mcard',
        compact && 'mcard--compact',
        (!product.available || product.orderClosed) && 'mcard--off',
        selected && 'mcard--selected',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="mcard__hit"
        onClick={onOpen}
        disabled={!product.available}
        aria-pressed={selected}
      >
        <span className="mcard__media">
          <Photo src={image} className="mcard__img" lazy />
          {selected && <span className="mcard__badge">Selecionado</span>}
        </span>
        <span className="mcard__body">
          <span className="mcard__name">{product.name}</span>
          {/* Preço oculto só deste produto (RF69, RN76). */}
          {product.priceHidden && <span className="mcard__price preco-oculto">{HIDDEN_PRICE_LABEL}</span>}
          {price.value !== null && (
            <span className="mcard__price">
              {price.fromPrice && 'a partir de '}
              {formatBRL(price.value)}/{price.unit}
            </span>
          )}
          <span className="mcard__cta">
            {!product.available
              ? 'Indisponível'
              : product.orderClosed
                ? 'Prazo encerrado para este item'
                : selected
                  ? 'Vendo ao lado'
                  : 'Escolher'}
          </span>
        </span>
      </button>
    </article>
  );
}
