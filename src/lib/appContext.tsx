import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getUnit, setUnit as persistUnit, type Unit } from './units';
import { getEquipmentHave, setEquipmentHave } from './equipment';
import { resolveTheme, setTheme as persistTheme, applyTheme, type Theme } from './theme';

const NAME_KEY = 'fit_display_name';

interface AppState {
  upn: string;
  displayName: string;
  setDisplayName: (name: string) => void;
  unit: Unit;
  setUnit: (u: Unit) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  equipment: string[];
  setEquipment: (list: string[]) => void;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [displayName, setDisplayNameState] = useState<string>(() => localStorage.getItem(NAME_KEY) || 'Athlete');
  const [unit, setUnitState] = useState<Unit>(getUnit());
  const [theme, setThemeState] = useState<Theme>(resolveTheme());
  const [equipment, setEquipmentState] = useState<string[]>(getEquipmentHave());
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  useEffect(() => { document.documentElement.setAttribute('data-standalone', 'true'); applyTheme(theme); }, []);

  const setDisplayName = useCallback((name: string) => {
    const clean = name.trim() || 'Athlete';
    localStorage.setItem(NAME_KEY, clean);
    setDisplayNameState(clean);
  }, []);
  const setUnit = useCallback((u: Unit) => { persistUnit(u); setUnitState(u); }, []);
  const setTheme = useCallback((t: Theme) => { persistTheme(t); setThemeState(t); }, []);
  const setEquipment = useCallback((list: string[]) => { setEquipmentHave(list); setEquipmentState(list); }, []);
  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToastMsg({ msg, kind });
    setTimeout(() => setToastMsg(null), 2600);
  }, []);

  return (
    <Ctx.Provider value={{ upn: '', displayName, setDisplayName, unit, setUnit, theme, setTheme, equipment, setEquipment, toast }}>
      {children}
      {toastMsg && <div className={`toast ${toastMsg.kind === 'err' ? 'err' : ''}`}>{toastMsg.msg}</div>}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
