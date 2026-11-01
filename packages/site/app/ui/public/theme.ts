import { TypedEventTarget } from 'remix/component';

export const themes = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof themes)[number];

class ThemeModel extends TypedEventTarget<{ change: Event }> {
  get current(): Theme {
    const value = document.documentElement.dataset.theme;
    return value === 'light' || value === 'dark' ? value : 'auto';
  }

  cycle() {
    const next = themes[(themes.indexOf(this.current) + 1) % themes.length];
    if (next === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      if (next === 'auto') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {}
    this.dispatchEvent(new Event('change'));
  }
}

export const theme = new ThemeModel();
