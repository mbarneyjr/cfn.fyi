import { css } from 'remix/component';

export const layout = {
  /** Centered content column with the page gutter on both sides. */
  container: css({
    width: '100%',
    maxWidth: 'var(--content-width)',
    marginInline: 'auto',
    paddingInline: 'var(--gutter)',
  }),
  /** One horizontal line of items, vertically centered. Items do not wrap. */
  row: css({ display: 'flex', alignItems: 'center' }),
  /** Same as `row`, but flows inline with the surrounding text. */
  inlineRow: css({ display: 'inline-flex', alignItems: 'center' }),
  /** Horizontal items that wrap to new lines when space runs out. */
  cluster: css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }),
  /** Vertical list of items. The column can shrink below its content width. */
  stack: css({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', alignContent: 'start' }),
  /**
   * Title block grid: a hairline frame around the grid and between its children. Each direct child gets the paper
   * background. Combine with `stack` or a local column template.
   */
  cells: css({
    display: 'grid',
    gap: 'var(--line-width)',
    backgroundColor: 'var(--color-line)',
    border: 'var(--line-width) solid var(--color-line)',
    '& > *': { backgroundColor: 'var(--color-paper)' },
  }),
  /** Pushes this item and all items after it to the end of a flex row. */
  pushEnd: css({ marginLeft: 'auto' }),
  /** Takes all free space in a flex row, and can shrink to zero. */
  grow: css({ flex: '1 1 0', minWidth: 0 }),
  /** Keeps its content size in a flex row. It does not grow or shrink. */
  fixed: css({ flex: 'none' }),
  /** Hides the element on screen but keeps it for screen readers. */
  visuallyHidden: css({
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  }),
};

export const space = {
  gap1: css({ gap: 'var(--space-1)' }),
  gap2: css({ gap: 'var(--space-2)' }),
  gap3: css({ gap: 'var(--space-3)' }),
  gap4: css({ gap: 'var(--space-4)' }),
  gap5: css({ gap: 'var(--space-5)' }),
  padBlock2: css({ paddingBlock: 'var(--space-2)' }),
  padBlock3: css({ paddingBlock: 'var(--space-3)' }),
  padBlock4: css({ paddingBlock: 'var(--space-4)' }),
  padInline3: css({ paddingInline: 'var(--space-3)' }),
};

export const text = {
  /** Page title (`h1`). */
  title: css({ fontSize: 'var(--text-xl)', fontWeight: 'bold', lineHeight: 'var(--leading-tight)' }),
  /** Section heading (`h2`), sentence case. */
  heading: css({ fontSize: 'var(--text-lg)', fontWeight: 'bold', lineHeight: 'var(--leading-tight)' }),
  /** Title block label: extra small, uppercase, tracked. Pair with `color.brand`. */
  label: css({
    fontSize: 'var(--text-xs)',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-label)',
  }),
  small: css({ fontSize: 'var(--text-sm)' }),
  base: css({ fontSize: 'var(--text-base)' }),
  large: css({ fontSize: 'var(--text-lg)' }),
  bold: css({ fontWeight: 'bold' }),
  regular: css({ fontWeight: 'normal' }),
  /** Equal-width digits, so numbers align in columns. */
  tabular: css({ fontVariantNumeric: 'tabular-nums' }),
  alignCenter: css({ textAlign: 'center' }),
  alignEnd: css({ textAlign: 'end' }),
  nowrap: css({ whiteSpace: 'nowrap' }),
  /** Lets long words and URLs break onto the next line. */
  breakAnywhere: css({ overflowWrap: 'anywhere' }),
  noUnderline: css({ textDecoration: 'none' }),
};

export const color = {
  ink: css({ color: 'var(--color-ink)' }),
  muted: css({ color: 'var(--color-muted)' }),
  /** Drafting blue: structure, labels, and interactive elements. */
  brand: css({ color: 'var(--color-brand)' }),
  /** Change data that is removed. */
  removed: css({ color: 'var(--color-removed)' }),
  paper: css({ backgroundColor: 'var(--color-paper)' }),
  /** Filled areas: code sheets, the footer, row hover. */
  sheet: css({ backgroundColor: 'var(--color-sheet)' }),
};

export const border = {
  top: css({ borderTop: 'var(--line-width) solid var(--color-line)' }),
  bottom: css({ borderBottom: 'var(--line-width) solid var(--color-line)' }),
  /** Lays the children out in a row and adds a hairline after them, to the end of the row. Used for `h2`. */
  rule: css({
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--space-3)',
    '&::after': { content: '""', flex: 1, alignSelf: 'center', borderTop: 'var(--line-width) solid var(--color-line)' },
  }),
};
