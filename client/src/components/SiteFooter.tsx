import { IS_DEMO } from '../lib/demo';
import { useSettings } from '../lib/useSettings';

// Rodapé de todas as telas do cliente: telefone para ligação, se cadastrado (RF33), e o
// acesso discreto da equipe ao painel (RF49). WhatsApp e Instagram ficam no cabeçalho.
export function SiteFooter() {
  const phone = useSettings()?.contactPhone?.replace(/\D/g, '');
  if (!phone && IS_DEMO) return null;
  return (
    <footer className="footer">
      {phone && (
        <a className="footer__call" href={`tel:+${phone}`}>
          Ligar para a padaria
        </a>
      )}
      {/* A versão de teste não tem servidor nem painel. */}
      {!IS_DEMO && (
        <a className="footer__team" href="/painel/">
          Área da equipe
        </a>
      )}
    </footer>
  );
}
