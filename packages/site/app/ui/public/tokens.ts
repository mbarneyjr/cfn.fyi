export const tokens = {
  color: {
    background: { light: 'hsl(210 33% 98%)', dark: 'hsl(216 58% 13%)' },
    surface: { light: 'hsl(212 45% 95%)', dark: 'hsl(216 52% 17%)' },
    foreground: { light: 'hsl(218 45% 13%)', dark: 'hsl(208 45% 93%)' },
    muted: { light: 'hsl(216 18% 40%)', dark: 'hsl(210 25% 70%)' },
    border: { light: 'hsl(213 38% 80%)', dark: 'hsl(212 42% 30%)' },
    brand: { light: 'hsl(216 88% 40%)', dark: 'hsl(197 95% 68%)' },
    added: { light: 'hsl(135 85% 15%)', dark: 'hsl(135 62% 64%)' },
    removed: { light: 'hsl(356 85% 29%)', dark: 'hsl(356 90% 78%)' },
    modified: { light: 'hsl(32 100% 19%)', dark: 'hsl(40 92% 64%)' },
    addedWash: { light: 'hsl(138 55% 75%)', dark: 'hsl(140 52% 23%)' },
    removedWash: { light: 'hsl(356 78% 80%)', dark: 'hsl(354 55% 24%)' },
    modifiedWash: { light: 'hsl(40 88% 72%)', dark: 'hsl(38 60% 20%)' },
    brandWash: 'color-mix(in oklab, var(--color-brand) 12%, transparent)',
  },
  font: {
    mono: '"Ioskeley Mono", ui-monospace, monospace',
  },
  text: {
    xs: '0.6875rem',
    sm: '0.8125rem',
    base: '0.9375rem',
    lg: '1.125rem',
    xl: '1.75rem',
  },
  leading: {
    tight: '1.15',
    base: '1.6',
  },
  tracking: {
    label: '0.14em',
  },
  space: {
    1: '0.25rem',
    2: '0.5rem',
    3: '1rem',
    4: '1.5rem',
    5: '3rem',
    gutter: '16px',
  },
  line: {
    width: '1px',
  },
  lineNumber: {
    width: '4ch',
  },
  content: {
    width: '1040px',
  },
  heading: {
    min: '24ch',
  },
  badge: {
    size: '1.5em',
  },
  duration: {
    fast: '120ms',
  },
  easing: {
    standard: 'ease-out',
  },
};

function kebab(name: string) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

const declarations = Object.entries(tokens).flatMap(([section, group]) =>
  Object.entries(group).map(([name, value]) => {
    const css = typeof value === 'string' ? value : `light-dark(${value.light}, ${value.dark})`;
    return `--${kebab(section)}-${kebab(name)}: ${css};`;
  }),
);

export const themeCss = `@layer theme {
  :root {
    ${declarations.join('\n    ')}
  }
}`;
