// Light/dark theme preference. Persisted per-device in localStorage; falls back
// to the OS setting until the user picks explicitly. Applied by setting a
// data-theme attribute on <html>, which flips the CSS variables in theme.css.
export type Theme = 'light' | 'dark';

const KEY = 'fit_theme';

export function getStoredTheme(): Theme | null {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? systemTheme();
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#101010' : '#ffffff');
}

export function setTheme(t: Theme): void {
  localStorage.setItem(KEY, t);
  applyTheme(t);
}
