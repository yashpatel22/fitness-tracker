// Weekly backup mechanism (web-app only). Browsers can't silently write files
// on a schedule, so the strategy is: once per week (resets Monday) attempt an
// auto-download on app open, and show a persistent banner as the reliable
// fallback (especially on iOS Safari, which blocks gesture-less downloads).
import { exportAll } from './dataverse';

const LAST_KEY = 'fit_last_backup';       // ISO timestamp of last backup/ack
const AUTO_WEEK_KEY = 'fit_backup_auto_week'; // Monday key of the week we auto-tried

// Monday (local) of the given date's week, as YYYY-MM-DD.
function mondayKey(d = new Date()): string {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - dow);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function hasBaseline(): boolean {
  return !!localStorage.getItem(LAST_KEY);
}

// A backup is due if the last one was before this week's Monday.
export function isBackupDue(): boolean {
  const last = localStorage.getItem(LAST_KEY);
  if (!last) return true;
  return last.slice(0, 10) < mondayKey();
}

// Record that a backup happened (or was acknowledged) so we don't nag again
// until next Monday.
export function markBackedUp(): void {
  localStorage.setItem(LAST_KEY, new Date().toISOString());
}

export async function downloadBackup(): Promise<void> {
  const json = await exportAll();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitness-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Best-effort silent auto-download, at most once per week. Returns true if it
// attempted (does NOT mark backed-up — the banner does that on user action, so
// a blocked iOS download still reminds the user).
export async function tryWeeklyAuto(): Promise<boolean> {
  if (!isBackupDue()) return false;
  const wk = mondayKey();
  if (localStorage.getItem(AUTO_WEEK_KEY) === wk) return false;
  localStorage.setItem(AUTO_WEEK_KEY, wk);
  try { await downloadBackup(); return true; } catch { return false; }
}
