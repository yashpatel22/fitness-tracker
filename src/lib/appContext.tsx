import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getUnit, setUnit as persistUnit, type Unit } from './units';
import { getEquipmentHave, setEquipmentHave } from './equipment';
import { resolveTheme, setTheme as persistTheme, applyTheme, type Theme } from './theme';
import { isBackupDue, markBackedUp, downloadBackup, tryWeeklyAuto } from './backup';

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
  const [backupDue, setBackupDue] = useState(false);

  useEffect(() => { document.documentElement.setAttribute('data-standalone', 'true'); applyTheme(theme); }, []);

  // Weekly backup: baseline new users (no first-week nag); otherwise, if a
  // backup is due, attempt a silent auto-download once and show the banner.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!localStorage.getItem('fit_last_backup')) { markBackedUp(); return; }
      if (isBackupDue()) { setBackupDue(true); void tryWeeklyAuto(); }
    }, 1200);
    return () => clearTimeout(t);
  }, []);

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

  const doBackup = useCallback(async () => {
    try { await downloadBackup(); markBackedUp(); setBackupDue(false); setToastMsg({ msg: 'Backup downloaded', kind: 'ok' }); }
    catch (e) { setToastMsg({ msg: (e as Error).message, kind: 'err' }); }
  }, []);
  const dismissBackup = useCallback(() => { markBackedUp(); setBackupDue(false); }, []);

  return (
    <Ctx.Provider value={{ upn: '', displayName, setDisplayName, unit, setUnit, theme, setTheme, equipment, setEquipment, toast }}>
      {children}
      {backupDue && (
        <div className="backup-banner" role="status">
          <span className="bb-text">🗂️ Weekly backup — keep your workouts safe.</span>
          <button className="bb-dl" onClick={doBackup} data-telemetry-name="weekly-backup-download">Download</button>
          <button className="bb-x" onClick={dismissBackup} aria-label="Dismiss" data-telemetry-name="weekly-backup-dismiss">✕</button>
        </div>
      )}
      {toastMsg && <div className={`toast ${toastMsg.kind === 'err' ? 'err' : ''}`}>{toastMsg.msg}</div>}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
