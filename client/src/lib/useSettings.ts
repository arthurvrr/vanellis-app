import type { PublicSettingsDTO } from '@vanellis/shared';
import { useEffect, useState } from 'react';
import { loadSettings } from './api';

/** Configurações públicas da loja; `null` enquanto carregam ou se falharem. */
export function useSettings(): PublicSettingsDTO | null {
  const [settings, setSettings] = useState<PublicSettingsDTO | null>(null);
  useEffect(() => {
    let alive = true;
    loadSettings()
      .then((s) => alive && setSettings(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return settings;
}
