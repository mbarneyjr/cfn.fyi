import { clientEntry, css, type Handle } from 'remix/component';
import { routes } from '#app/routes.ts';
import { border, color, layout, space, text } from './styles.ts';
import { ThemeControl } from './theme-control.tsx';

const mark = css({
  width: '1.25em',
  height: '1.25em',
  fill: 'var(--color-brand-wash)',
  stroke: 'var(--color-brand)',
  strokeWidth: 2,
  strokeLinejoin: 'miter',
});

export function DeltaMark(_handle: Handle) {
  return () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" mix={mark}>
      <path d="M12 3 22 21H2Z" />
    </svg>
  );
}

export const Navbar = clientEntry(import.meta.url, function Navbar(_handle: Handle) {
  return () => (
    <nav mix={[border.bottom, space.padBlock2]}>
      <div mix={[layout.container, layout.row, space.gap3]}>
        <a href={routes.index.href()} mix={[layout.inlineRow, space.gap2, text.large, text.bold, text.noUnderline]}>
          <DeltaMark />
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
