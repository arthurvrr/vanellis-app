import { useState } from 'react';
import { enviaFoto } from './api';

// Envio de foto pelo painel: o servidor reduz, converte para WebP e guarda no banco (RN56).
export function FotoUpload({
  value,
  onChange,
  onError,
  label = 'Foto',
  compact = false,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  onError: (e: unknown) => void;
  label?: string;
  compact?: boolean;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <div className={compact ? 'foto foto--compact' : 'foto'}>
      {value ? (
        <img className="thumb" src={value} alt="" />
      ) : (
        <span className="thumb thumb--empty" aria-hidden="true" />
      )}
      <label className="switch__btn foto__btn">
        {enviando ? 'Enviando…' : value ? 'Trocar' : compact ? 'Foto' : `Enviar ${label.toLowerCase()}`}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          disabled={enviando}
          aria-label={label}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setEnviando(true);
            try {
              onChange((await enviaFoto(file)).url);
            } catch (err) {
              onError(err);
            } finally {
              setEnviando(false);
            }
          }}
        />
      </label>
      {value && (
        <button type="button" className="link" onClick={() => onChange(null)}>
          Remover
        </button>
      )}
    </div>
  );
}
