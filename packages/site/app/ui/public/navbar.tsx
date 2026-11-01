import { clientEntry, css, type Handle } from 'remix/component';
import { routes } from '#app/routes.ts';
import { border, color, layout, space, text } from './styles.ts';
import { ThemeControl } from './theme-control.tsx';

const mark = css({ width: '1.75em', height: '1.75em', strokeWidth: 2, fill: 'none' });
const outline = css({ stroke: 'var(--color-line)' });
const overlap = css({ fill: 'var(--color-brand-wash)', stroke: 'var(--color-brand)' });
const tilde = css({ stroke: 'var(--color-brand)', strokeLinecap: 'square' });

export function Logo(_handle: Handle) {
  return () => (
    <svg viewBox="3 3 26 26" aria-hidden="true" mix={mark}>
      <rect x="4" y="4" width="18" height="18" mix={outline} />
      <rect x="10" y="10" width="18" height="18" mix={outline} />
      <rect x="10" y="10" width="12" height="12" mix={overlap} />
      <path d="M12.5 16.6C14 15.2 15 15.2 16 16S18 16.8 19.5 15.4" mix={tilde} />
    </svg>
  );
}

export const Navbar = clientEntry(import.meta.url, function Navbar(_handle: Handle) {
  return () => (
    <nav mix={[border.bottom, space.padBlock2]}>
      <div mix={[layout.container, layout.row, space.gap3]}>
        <a href={routes.index.href()} mix={[layout.inlineRow, space.gap2, text.large, text.bold, text.noUnderline]}>
          <Logo />
          <span mix={color.ink}>
            cfn<span mix={color.brand}>.fyi</span>
          </span>
        </a>
        <div mix={[layout.row, layout.pushEnd, space.gap2]}>
          <ThemeControl />
        </div>
      </div>
    </nav>
  );
});
