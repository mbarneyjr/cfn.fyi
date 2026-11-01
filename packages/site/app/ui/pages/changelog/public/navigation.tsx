import { clientEntry, css, type Handle, on } from 'remix/component';
import { routes } from '#app/routes.ts';
import type { Neighbor } from '#app/ui/pages/changelog/specification.ts';
import { color, layout, space, text } from '#app/ui/public/styles.ts';

interface ChangelogNavigationProps {
  versions: string[];
  version: string;
  date?: string;
  previous?: Neighbor;
  next?: Neighbor;
}

const titleBlock = css({
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)',
  gridTemplateAreas: '"previous version next"',
  '@media (max-width: 640px)': {
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gridTemplateAreas: '"version version" "previous next"',
  },
});

const area = (name: string) => css({ gridArea: name });

const contents = css({ display: 'contents' });

const dateSlot = css({ minBlockSize: '1lh' });

const select = css({
  width: '100%',
  font: 'inherit',
  fontSize: 'var(--text-lg)',
  fontWeight: 'bold',
  color: 'var(--color-ink)',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: 0,
  padding: 0,
  paddingInline: 'var(--space-4)',
  textAlign: 'center',
  textAlignLast: 'center',
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, var(--color-brand) 50%), linear-gradient(135deg, var(--color-brand) 50%, transparent 50%)',
  backgroundSize: 'var(--space-1) var(--space-1)',
  backgroundPosition: 'calc(100% - var(--space-2) - var(--space-1)) 50%, calc(100% - var(--space-2)) 50%',
  backgroundRepeat: 'no-repeat',
});

const cellLink = css({
  '--link-color': 'var(--color-ink)',
  '&:hover': { backgroundImage: 'linear-gradient(var(--color-brand-wash), var(--color-brand-wash))' },
});

export const ChangelogNavigation = clientEntry(
  import.meta.url,
  function ChangelogNavigation(handle: Handle<ChangelogNavigationProps>) {
    return () => {
      const { versions, version, date, previous, next } = handle.props;
      const link = (direction: 'previous' | 'next', neighbor?: Neighbor) => {
        const label = <span mix={[text.label, color.brand]}>{direction === 'previous' ? '← Previous' : 'Next →'}</span>;
        const align = direction === 'next' && text.alignEnd;
        if (!neighbor) {
          return (
            <div mix={[area(direction), layout.stack, space.gap1, space.padBlock2, space.padInline3, align]}>
              {label}
              <span mix={color.muted}>
                {direction === 'previous' ? 'This is the first version' : 'This is the latest version'}
              </span>
            </div>
          );
        }
        return (
          <a
            href={routes.index.href({ version: neighbor.version })}
            rel={direction === 'previous' ? 'prev' : 'next'}
            mix={[
              area(direction),
              layout.stack,
              space.gap1,
              space.padBlock2,
              space.padInline3,
              text.noUnderline,
              cellLink,
              align,
            ]}
          >
            {label}
            <span mix={[text.bold, text.tabular, text.nowrap]}>{neighbor.version}</span>
            <time datetime={neighbor.date} mix={[text.small, text.tabular, color.muted, dateSlot]}>
              {neighbor.date}
            </time>
          </a>
        );
      };
      return (
        <nav aria-label="Specification versions" mix={[layout.cells, titleBlock]}>
          {link('previous', previous)}
          <form method="get" action={routes.index.href()} mix={contents}>
            <label
              mix={[
                area('version'),
                color.paper,
                layout.stack,
                space.gap1,
                space.padBlock2,
                space.padInline3,
                text.alignCenter,
              ]}
            >
              <span mix={[text.label, color.brand]}>Version</span>
              <select
                name="version"
                mix={[
                  select,
                  text.tabular,
                  on('change', (event) => location.assign(routes.index.href({ version: event.currentTarget.value }))),
                ]}
              >
                {versions.toReversed().map((value) => (
                  <option key={value} value={value} selected={value === version}>
                    {value}
                  </option>
                ))}
              </select>
              <time datetime={date} mix={[text.small, text.tabular, color.muted, dateSlot]}>
                {date && `issued ${date}`}
              </time>
            </label>
            <noscript>
              <button type="submit">show</button>
            </noscript>
          </form>
          {link('next', next)}
        </nav>
      );
    };
  },
);
