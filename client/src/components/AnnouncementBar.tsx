import { useLoja } from '../lib/useLoja';

// Faixa fina no topo da entrada com a regra mais útil para quem vai encomendar.
export function AnnouncementBar() {
  const loja = useLoja();
  if (!loja) return null;
  return (
    <p className={loja.paused ? 'announce announce--paused' : 'announce'} role="note">
      {loja.paused
        ? 'No momento não estamos recebendo pedidos pelo site. Fale com a gente pelo WhatsApp.'
        : `Encomendas com ${loja.minLeadHours}h de antecedência · Retirada no balcão`}
    </p>
  );
}
