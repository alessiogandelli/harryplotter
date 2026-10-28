// Editor colour theme (not the figure's): light by default, dark on request, or follow the system.

export type UITheme = 'light' | 'dark' | 'system';

const KEY = 'harryplotter.theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function loadTheme(): UITheme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* storage unavailable */ }
  return 'light';
}

export function applyTheme(t: UITheme) {
  const dark = t === 'dark' || (t === 'system' && !!media?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

media?.addEventListener('change', () => { if (loadTheme() === 'system') applyTheme('system'); });
