import { useCheckoutDraft } from '../lib/checkoutDraft';
import { IS_DEMO } from '../lib/demo';

/** Mostra o *negrito* do WhatsApp como no aplicativo. */
function whatsappBold(text: string) {
  return text.split(/\*([^*\n]+)\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

// Tela 4 do cliente: Confirmação (RF09). Mostra o pedido enviado enquanto a página estiver
// aberta; ao fechar, o resumo não volta, porque o site não guarda pedidos (RN03, RN50).
export function ConfirmationView({ onMenu }: { onMenu: () => void }) {
  const { sent } = useCheckoutDraft();

  if (!sent) {
    return (
      <section className="cart">
        <p className="cart__empty">Nenhum pedido enviado nesta visita.</p>
        <button type="button" className="link" onClick={onMenu}>
          ← Ver o cardápio
        </button>
      </section>
    );
  }

  return (
    <section className="cart confirmation" aria-labelledby="confirmation-title">
      <h2 id="confirmation-title">Pedido pronto para envio</h2>
      <p className="confirmation__code">
        Código do pedido <strong>{sent.code}</strong>
      </p>
      {IS_DEMO ? (
        <>
          <p>
            Versão de teste: no site de verdade, o WhatsApp da padaria abriria com esta mensagem pronta para enviar.
          </p>
          <pre className="confirmation__message">{whatsappBold(sent.message)}</pre>
        </>
      ) : (
        <>
          <p>
            Abrimos o WhatsApp com a mensagem do pedido. Se ainda não enviou, aperte enviar por lá. Seu pedido só vale
            depois que a padaria confirmar, junto com o sinal e o horário da retirada.
          </p>

          <a className="primary primary--whatsapp" href={sent.url} target="_blank" rel="noreferrer">
            Abrir o WhatsApp de novo
          </a>
        </>
      )}

      {!IS_DEMO && (
        <div className="confirmation__summary">
          <p>
            <strong>{sent.modo}:</strong> {sent.pickup}
          </p>
          {sent.address && (
            <p>
              <strong>Endereço:</strong> {sent.address}
            </p>
          )}
          <ul>
            {sent.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {sent.total && <p>{sent.total}</p>}
        </div>
      )}

      <button type="button" className="link" onClick={onMenu}>
        Fazer um novo pedido
      </button>
    </section>
  );
}
