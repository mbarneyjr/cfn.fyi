import { css, type Handle } from 'remix/component';
import { border, color, layout, space, text } from '#app/ui/public/styles.ts';
import type { Block, Changelog, Line, Mark, Segment, Status } from './comparison.ts';
import { ExpandControls } from './public/expand-controls.tsx';

const tone = (token: string, wash?: string) => css({ color: token, '--link-color': token, backgroundColor: wash });

const mutedTone = tone('var(--color-muted)');

const marks: Record<Mark, { label: string; glyph: string; mix: ReturnType<typeof css> }> = {
  '+': { label: 'added', glyph: '+', mix: tone('var(--color-added)', 'var(--color-added-wash)') },
  '-': { label: 'removed', glyph: '−', mix: tone('var(--color-removed)', 'var(--color-removed-wash)') },
  '~': { label: 'modified', glyph: '~', mix: tone('var(--color-modified)', 'var(--color-modified-wash)') },
};

const statusMarks: Record<Status, Mark> = { added: '+', modified: '~', removed: '-' };

const groupTitles: [Status, string][] = [
  ['added', 'Added resource types'],
  ['modified', 'Modified resource types'],
  ['removed', 'Removed resource types'],
];

const badge = css({
  display: 'inline-grid',
  placeItems: 'center',
  flex: 'none',
  width: 'var(--badge-size)',
  height: 'var(--badge-size)',
  border: 'var(--line-width) solid currentColor',
  fontWeight: 'bold',
  lineHeight: 1,
});

export function Badge(handle: Handle<{ status: Status }>) {
  return () => {
    const mark = marks[statusMarks[handle.props.status]];
    return (
      <span mix={[badge, mark.mix]}>
        <span aria-hidden="true">{mark.glyph}</span>
        <span mix={layout.visuallyHidden}>{mark.label}</span>
      </span>
    );
  };
}

function TypeName(handle: Handle<{ name: string }>) {
  return () => {
    const parts = handle.props.name.split(/(?<=::)/);
    const last = parts.pop();
    return (
      <span mix={[layout.grow, text.breakAnywhere]}>
        {parts.flatMap((part, index) => [
          <span key={`part-${index}`} mix={color.muted}>
            {part}
          </span>,
          <wbr key={`break-${index}`} />,
        ])}
        <span mix={text.bold}>{last}</span>
      </span>
    );
  };
}

const chevron = css({
  flex: 'none',
  color: 'var(--color-brand)',
  transition: 'transform var(--duration-fast) var(--easing-standard)',
  '[open] > summary > &': { transform: 'rotate(90deg)' },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
});

const invisible = css({ visibility: 'hidden' });

const row = css({ cursor: 'default', listStyle: 'none', '&::-webkit-details-marker': { display: 'none' } });

const summaryRow = css({ cursor: 'pointer', '&:hover': { backgroundColor: 'var(--color-sheet)' } });

const entryHeader = css({
  gap: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  '@media (max-width: 640px)': { paddingInline: 'var(--space-2)' },
});

const anchor = css({
  '--link-color': 'var(--color-muted)',
  opacity: 0,
  ':hover > &': { opacity: 1 },
  '&:focus-visible': { opacity: 1 },
  '@media (hover: none)': { opacity: 1 },
});

function EntryHeader(handle: Handle<{ block: Block; expandable: boolean }>) {
  return () => {
    const { block, expandable } = handle.props;
    return (
      <>
        <span aria-hidden="true" mix={[chevron, !expandable && invisible]}>
          ▸
        </span>
        <Badge status={block.status} />
        <TypeName name={block.name} />
        {block.href && (
          <a href={block.href} mix={[text.small, text.nowrap]}>
            docs ↗
          </a>
        )}
        <a href={`#${block.id}`} mix={[text.small, anchor]}>
          #<span mix={layout.visuallyHidden}>Link to {block.name}</span>
        </a>
      </>
    );
  };
}

const sheet = css({
  overflowX: 'auto',
  paddingBlock: 'var(--space-2)',
  backgroundColor: 'var(--color-sheet)',
  borderTop: 'var(--line-width) solid var(--color-line)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-base)',
  '--link-color': 'var(--color-ink)',
  '& code': { display: 'block', width: 'max-content', minWidth: '100%', counterReset: 'line' },
  '& code > span': { display: 'block', paddingInlineEnd: 'var(--space-3)' },
  '& :target': { outline: 'var(--line-width) solid var(--color-brand)', outlineOffset: '-1px' },
});

const gutter = css({
  display: 'inline-block',
  counterIncrement: 'line',
  userSelect: 'none',
  marginInlineEnd: 'var(--space-2)',
  paddingInlineEnd: 'var(--space-2)',
  borderInlineEnd: 'var(--line-width) solid var(--color-line)',
  '&::before': {
    content: 'counter(line)',
    display: 'inline-block',
    width: 'var(--line-number-width)',
    marginInline: 'var(--space-2)',
    textAlign: 'right',
    color: 'var(--color-muted)',
  },
});

const unselectable = css({ userSelect: 'none' });

function Link(handle: Handle<{ segment: Segment }>) {
  return () => {
    const { segment } = handle.props;
    return segment.href ? <a href={segment.href}>{segment.text}</a> : segment.text;
  };
}

function YamlLine(handle: Handle<{ line: Line }>) {
  return () => {
    const { line } = handle.props;
    const mark = line.mark ? marks[line.mark] : undefined;
    const indent = '  '.repeat(Math.max(0, line.depth - (line.dash ? 1 : 0)));
    return (
      <span id={line.id} mix={mark?.mix}>
        <span aria-hidden="true" mix={gutter}>
          {mark?.glyph ?? ' '}
        </span>
        {mark && <span mix={[layout.visuallyHidden, unselectable]}>{mark.label}: </span>}
        {indent}
        {line.dash && '- '}
        {line.key && (
          <>
            <Link segment={line.key} />:
          </>
        )}
        {line.value && (
          <>
            {line.key && ' '}
            <Link segment={line.value} />
          </>
        )}
        {line.comment && (
          <span mix={mark ? undefined : mutedTone}>
            {(line.key || line.value) && '  '}# <Link segment={line.comment} />
          </span>
        )}
      </span>
    );
  };
}

const sectionHeading = css({ flex: '1 1 var(--heading-min)' });

const counter = (index: number) => String(index + 1).padStart(2, '0');

interface ChangelogChangesProps {
  changelog?: Changelog;
  error?: string;
}

export function ChangelogChanges(handle: Handle<ChangelogChangesProps>) {
  return () => {
    const { changelog, error } = handle.props;
    if (!changelog) return <p mix={color.removed}>{error}</p>;
    const groups = groupTitles
      .map(([status, title]) => ({
        status,
        title,
        blocks: changelog.blocks.filter((block) => block.status === status),
      }))
      .filter((group) => group.blocks.length > 0);
    return (
      <div mix={[layout.stack, space.gap5]}>
        {changelog.blocks.length === 0 && <p mix={color.muted}>No changes in this version.</p>}
        {groups.map((group, index) => (
          <section key={group.status} mix={[layout.stack, space.gap3]}>
            <div mix={[layout.cluster, space.gap3]}>
              <h2 mix={[sectionHeading, text.heading, border.rule]}>
                <span mix={[color.brand, text.tabular]}>{counter(index)}</span>
                <span>{group.title}</span>
                <span mix={[color.muted, text.tabular, text.regular]}>{group.blocks.length}</span>
              </h2>
              {group.status !== 'removed' && <ExpandControls />}
            </div>
            <div mix={[layout.cells, layout.stack]}>
              {group.blocks.map((block) => {
                const header = [layout.row, space.padBlock2, row, entryHeader];
                if (block.status === 'removed') {
                  return (
                    <h3 key={block.name} id={block.id} mix={[...header, text.base, text.regular]}>
                      <EntryHeader block={block} expandable={false} />
                    </h3>
                  );
                }
                return (
                  <details key={block.name} id={block.id}>
                    <summary mix={[...header, summaryRow]}>
                      <EntryHeader block={block} expandable={true} />
                    </summary>
                    <pre mix={sheet}>
                      <code>
                        {block.lines.map((line, lineIndex) => (
                          <YamlLine
                            key={lineIndex}
                            line={block.status === 'added' ? { ...line, mark: undefined } : line}
                          />
                        ))}
                      </code>
                    </pre>
                  </details>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  };
}
