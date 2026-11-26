import { useState } from 'react';
import { enviaFoto } from './api';

// Envio de foto pelo painel: o navegador reduz a foto (api.ts, enviaFoto), o servidor converte
// para WebP e guarda no banco (RN56).

/**
 * Envio de uma foto, com o estado "enviando". `onBusy` avisa a tela, que não deixa salvar
 * enquanto a foto não chegou: salvar antes gravaria o cadastro sem ela.
 */
export function useEnvioFoto(
  onChange: (url: string) => void,
  onError: (e: unknown) => void,
  onBusy?: (busy: boolean) => void,
) {
  const [enviando, setEnviando] = useState(false);
  const enviar = async (file: File) => {
    setEnviando(true);
    onBusy?.(true);
    try {
      onChange((await enviaFoto(file)).url);
    } catch (err) {
      onError(err);
    } finally {
      setEnviando(false);
      onBusy?.(false);
    }
  };
  return { enviando, enviar };
}

export function FotoUpload({
  value,
  onChange,
  onError,
  onBusy,
  label = 'Foto',
  compact = false,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  onError: (e: unknown) => void;
  /** Avisa a tela enquanto a foto está sendo enviada. */
  onBusy?: (busy: boolean) => void;
  label?: string;
  compact?: boolean;
}) {
  const { enviando, enviar } = useEnvioFoto(onChange, onError, onBusy);
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
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void enviar(file);
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
