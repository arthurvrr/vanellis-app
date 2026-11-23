import { statusLabel, type CatalogoDTO } from '@vanellis/shared';
import { asset } from '../lib/demo';
import { useLoja } from '../lib/useLoja';
import { Photo } from './Photo';

// Entrada do site: conduz o cliente ao cardápio aos poucos, em vez de abrir direto na grade
// de produtos. Destaque com a situação da loja, como funciona (compacto) e as categorias.
export function HomeView({ catalogo, onCategory }: { catalogo: CatalogoDTO; onCategory: (slug: string) => void }) {
  const loja = useLoja();
  const imageOf = (categoryId: number) =>
    catalogo.produtos.find((p) => p.categoryId === categoryId && p.imageUrl)?.imageUrl ?? null;

  return (
    <main className="home">
      {/* No celular a foto fica de fundo; no computador, texto e foto lado a lado (foto em alta). */}
      <section className="hero" aria-labelledby="hero-title">
        <img
          className="hero__img"
          src={asset('/images/destaque/salgados-1600.webp')}
          srcSet={`${asset('/images/destaque/salgados-800.webp')} 800w, ${asset('/images/destaque/salgados-1600.webp')} 1600w`}
          sizes="(min-width: 900px) 55vw, 100vw"
          alt="Bandeja de salgados da Vanellis"
        />
        <div className="hero__content">
          {loja && (
            <p className={loja.status.open ? 'hero__status' : 'hero__status hero__status--closed'}>
              {statusLabel(loja.status, loja.today)}
            </p>
          )}
          <h2 id="hero-title" className="hero__title">
            Feito todo dia
            <br />
            em Xangri-lá
          </h2>
          <p className="hero__sub">Salgados, tortas e doces para encomendar e retirar no balcão.</p>
        </div>
      </section>

      <ol className="steps" aria-label="Como funciona">
        <li>
          <span className="steps__n">1</span>
          <span>
            <strong>Escolha os produtos</strong> no cardápio
          </span>
        </li>
        <li>
          <span className="steps__n">2</span>
          <span>
            <strong>Escolha o dia</strong> da retirada
          </span>
        </li>
        <li>
          <span className="steps__n">3</span>
          <span>
            <strong>Envie pelo WhatsApp</strong> e a padaria confirma
          </span>
        </li>
      </ol>

      <section className="home__section" aria-labelledby="cats-title">
        <h2 id="cats-title" className="home__title">
          O que você procura?
        </h2>
        <div className="cats">
          {catalogo.categorias.map((c) => (
            <button key={c.id} type="button" className="cat" onClick={() => onCategory(c.slug)}>
              <Photo src={c.coverImageUrl ?? imageOf(c.id)} className="cat__img" />
              <span className="cat__body">
                <span className="cat__name">{c.name}</span>
                {c.description && <span className="cat__text">{c.description}</span>}
                <span className="cat__cta">Ver {c.name.toLowerCase()} →</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
