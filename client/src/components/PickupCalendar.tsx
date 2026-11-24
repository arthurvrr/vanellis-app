import type { AvailableDay } from '@vanellis/shared';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

// Calendário mensal da retirada: só os dias com faixas livres (ou datas especiais) podem ser
// escolhidos. Navega por mês dentro da janela de agendamento.

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_NAMES = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const monthKey = (date: string) => date.slice(0, 7); // 'AAAA-MM'

function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** Semanas do mês (domingo a sábado), com `null` nos dias fora do mês. */
function monthGrid(key: string): (string | null)[][] {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const daysInMonth = new Date(Date.UTC(y!, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${key}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

function fullLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d)).getUTCDay();
  return `${WEEKDAY_NAMES[weekday]}, ${d} de ${MONTHS[m! - 1]}`;
}

interface Props {
  days: AvailableDay[];
  value: string | null;
  onChange: (date: string) => void;
}

export function PickupCalendar({ days, value, onChange }: Props) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const firstMonth = monthKey(days[0]!.date);
  const lastMonth = monthKey(days.at(-1)!.date);
  const [chosenMonth, setMonth] = useState(value ? monthKey(value) : firstMonth);
  const gridRef = useRef<HTMLDivElement>(null);
  // Se a janela mudar (outros produtos, outra antecedência), o mês mostrado fica dentro dela.
  const month = chosenMonth < firstMonth ? firstMonth : chosenMonth > lastMonth ? lastMonth : chosenMonth;

  const [y, m] = month.split('-').map(Number);
  const weeks = monthGrid(month);

  // Teclado: ← → vão ao dia disponível anterior/seguinte; ↑ ↓ ao mesmo dia da semana vizinha, se disponível.
  const onKeyDown = (e: KeyboardEvent) => {
    const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 } as Record<string, number>)[e.key];
    if (!step || !gridRef.current) return;
    const buttons = [...gridRef.current.querySelectorAll<HTMLButtonElement>('button[data-date]')];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    e.preventDefault();
    const target =
      Math.abs(step) === 1
        ? buttons[current + step]
        : buttons.find((b) => b.dataset.date === shiftDate(buttons[current]!.dataset.date!, step));
    target?.focus();
  };

  return (
    <div className="calendar">
      <div className="calendar__head">
        <button
          type="button"
          className="calendar__nav"
          aria-label="Mês anterior"
          disabled={month <= firstMonth}
          onClick={() => setMonth(addMonths(month, -1))}
        >
          ‹
        </button>
        <p className="calendar__title" aria-live="polite">
          {MONTHS[m! - 1]!.charAt(0).toUpperCase() + MONTHS[m! - 1]!.slice(1)} de {y}
        </p>
        <button
          type="button"
          className="calendar__nav"
          aria-label="Próximo mês"
          disabled={month >= lastMonth}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          ›
        </button>
      </div>

      <div className="calendar__grid" role="grid" aria-label="Dia da retirada" ref={gridRef} onKeyDown={onKeyDown}>
        <div className="calendar__row" role="row">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="calendar__weekday" role="columnheader" aria-label={WEEKDAY_NAMES[i]}>
              {w}
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="calendar__row" role="row">
            {week.map((date, di) => {
              if (!date) return <span key={di} className="calendar__cell" role="gridcell" />;
              const day = byDate.get(date);
              const n = Number(date.slice(8));
              if (!day) {
                return (
                  <span key={date} className="calendar__cell calendar__cell--off" role="gridcell" aria-disabled="true">
                    {n}
                  </span>
                );
              }
              const on = value === date;
              return (
                <span key={date} className="calendar__cell" role="gridcell">
                  <button
                    type="button"
                    data-date={date}
                    className={on ? 'calendar__day calendar__day--on' : 'calendar__day'}
                    aria-pressed={on}
                    aria-label={`${fullLabel(date)}${day.special ? `, ${day.special}` : ''}`}
                    onClick={() => onChange(date)}
                  >
                    {n}
                    {day.special && (
                      <span className="calendar__star" aria-hidden="true">
                        ★
                      </span>
                    )}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {days.some((d) => d.special && monthKey(d.date) === month) && (
        <p className="calendar__legend">★ Data especial: horário combinado com a padaria</p>
      )}
    </div>
  );
}
