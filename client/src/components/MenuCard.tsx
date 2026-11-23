import { cardImage, cardPrice, formatBRL, type ProductDTO } from '@vanellis/shared';
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
        !product.available && 'mcard--off',
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
          {price.value !== null && (
            <span className="mcard__price">
              {price.fromPrice && 'a partir de '}
              {formatBRL(price.value)}/{price.unit}
            </span>
          )}
          <span className="mcard__cta">
            {!product.available ? 'Indisponível' : selected ? 'Vendo ao lado' : 'Escolher'}
          </span>
        </span>
      </button>
    </article>
  );
}
