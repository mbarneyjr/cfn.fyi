import { clientEntry, css, type Handle, on } from 'remix/component';
import { routes } from '#app/routes.ts';
import { color, layout, space, text } from '#app/ui/public/styles.ts';

export interface Neighbor {
  version: string;
  date?: string;
}

export function versionHref(version: string, resourceType?: string) {
  return resourceType ? routes.resource.href({ type: resourceType, version }) : routes.version.href({ version });
}

interface ChangelogNavigationProps {
  resourceType?: string;
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

function area(name: string) {
  return css({ gridArea: name });
}

const dateSlot = css({ minBlockSize: '1lh' });

const select = css({
  width: '100%',
  font: 'inherit',
  fontSize: 'var(--text-lg)',
  fontWeight: 'bold',
  color: 'var(--color-foreground)',
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
  '--link-color': 'var(--color-foreground)',
  '&:hover': { backgroundImage: 'linear-gradient(var(--color-brand-wash), var(--color-brand-wash))' },
});

export const ChangelogNavigation = clientEntry(
  import.meta.url,
  function ChangelogNavigation(handle: Handle<ChangelogNavigationProps>) {
    return () => {
      const { resourceType, versions, version, date, previous, next } = handle.props;
      const subject = resourceType ? 'change' : 'version';
      return (
        <nav aria-label="Specification versions" mix={[layout.cells, titleBlock]}>
          {previous ? (
            <a
              href={versionHref(previous.version, resourceType)}
              rel="prev"
              mix={[
                area('previous'),
                layout.stack,
                space.gap1,
                space.padBlock2,
                space.padInline3,
                text.noUnderline,
                cellLink,
                on('click', (event) => {
                  if (window.navigation?.transition && event.currentTarget.href === location.href)
                    event.preventDefault();
                }),
              ]}
            >
              <span mix={[text.label, color.brand]}>← Previous</span>
              <span mix={[text.bold, text.tabular, text.nowrap]}>{previous.version}</span>
              <time datetime={previous.date} mix={[text.small, text.tabular, color.muted, dateSlot]}>
                {previous.date}
              </time>
            </a>
          ) : (
            <div mix={[area('previous'), layout.stack, space.gap1, space.padBlock2, space.padInline3]}>
              <span mix={[text.label, color.brand]}>← Previous</span>
              <span mix={color.muted}>This is the first {subject}</span>
            </div>
          )}
          <label
            mix={[
              area('version'),
              color.background,
              layout.stack,
              space.gap1,
              space.padBlock2,
              space.padInline3,
              text.alignCenter,
            ]}
          >
            <span mix={[text.label, color.brand]}>Version</span>
            <select
              mix={[
                select,
                text.tabular,
                on('change', (event) => location.assign(versionHref(event.currentTarget.value, resourceType))),
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
          {next ? (
            <a
              href={versionHref(next.version, resourceType)}
              rel="next"
              mix={[
                area('next'),
                layout.stack,
                space.gap1,
                space.padBlock2,
                space.padInline3,
                text.noUnderline,
                cellLink,
                text.alignEnd,
                on('click', (event) => {
                  if (window.navigation?.transition && event.currentTarget.href === location.href)
                    event.preventDefault();
                }),
              ]}
            >
              <span mix={[text.label, color.brand]}>Next →</span>
              <span mix={[text.bold, text.tabular, text.nowrap]}>{next.version}</span>
              <time datetime={next.date} mix={[text.small, text.tabular, color.muted, dateSlot]}>
                {next.date}
              </time>
            </a>
          ) : (
            <div mix={[area('next'), layout.stack, space.gap1, space.padBlock2, space.padInline3, text.alignEnd]}>
              <span mix={[text.label, color.brand]}>Next →</span>
              <span mix={color.muted}>This is the latest {subject}</span>
            </div>
          )}
        </nav>
      );
    };
  },
);
