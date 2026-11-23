import { mapsLink, weekSummary } from '@vanellis/shared';
import { IS_DEMO } from '../lib/demo';
import { useLoja } from '../lib/useLoja';
import { useSettings } from '../lib/useSettings';

// Rodapé de todas as telas do cliente: horário da semana, endereço com link para o mapa,
// telefone (RF33, RF34) e o acesso discreto da equipe ao painel (RF49).
export function SiteFooter() {
  const settings = useSettings();
  const loja = useLoja();
  const phone = settings?.contactPhone?.replace(/\D/g, '');
  const maps = settings ? mapsLink(settings) : null;
  const week = loja ? weekSummary(loja.week) : '';

  return (
    <footer className="footer">
      <div className="footer__cols">
        {week && (
          <div className="footer__col">
            <h2 className="footer__title">Horário</h2>
            <p>{week}</p>
          </div>
        )}
        {settings?.address && (
          <div className="footer__col">
            <h2 className="footer__title">Retirada</h2>
            <p>
              {maps ? (
                <a href={maps} target="_blank" rel="noreferrer">
                  {settings.address}
                </a>
              ) : (
                settings.address
              )}
            </p>
          </div>
        )}
        {phone && (
          <div className="footer__col">
            <h2 className="footer__title">Contato</h2>
            <p>
              <a href={`tel:+${phone}`}>Ligar para a padaria</a>
            </p>
          </div>
        )}
      </div>
      {/* A versão de teste não tem servidor nem painel. */}
      {!IS_DEMO && (
        <a className="footer__team" href="/painel/">
          Área da equipe
        </a>
      )}
    </footer>
  );
}
