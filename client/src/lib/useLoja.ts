import type { StoreInfoDTO } from '@vanellis/shared';
import { useEffect, useState } from 'react';
import { fetchLoja } from './api';

let once: Promise<StoreInfoDTO> | null = null;

/** Situação da loja e horário da semana, carregados uma vez por visita. */
export function useLoja(): StoreInfoDTO | null {
  const [info, setInfo] = useState<StoreInfoDTO | null>(null);
  useEffect(() => {
    let alive = true;
    once ??= fetchLoja().catch((e: unknown) => {
      once = null;
      throw e;
    });
    once.then((i) => alive && setInfo(i)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return info;
}
