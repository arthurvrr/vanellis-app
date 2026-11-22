import { MAX_QUANTITY } from '@vanellis/shared';
import { useEffect, useState } from 'react';

interface Props {
  value: number;
  min: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}

// Seletor de quantidade: botões de 1 em 1 e campo digitável, sempre entre o mínimo e 999.
export function QuantityStepper({ value, min, onChange, label, disabled }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = (n: number) => {
    const next = Math.min(MAX_QUANTITY, Math.max(min, Number.isFinite(n) ? Math.floor(n) : min));
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper__btn"
        aria-label="Diminuir"
        disabled={disabled || value <= min}
        onClick={() => commit(value - 1)}
      >
        −
      </button>
      <input
        className="stepper__input"
        inputMode="numeric"
        aria-label="Quantidade"
        disabled={disabled}
        value={draft}
        onChange={(e) => {
          if (/^\d{0,3}$/.test(e.target.value)) setDraft(e.target.value);
        }}
        onBlur={() => commit(Number(draft))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(Number(draft));
        }}
      />
      <button
        type="button"
        className="stepper__btn"
        aria-label="Aumentar"
        disabled={disabled || value >= MAX_QUANTITY}
        onClick={() => commit(value + 1)}
      >
        +
      </button>
    </div>
  );
}
