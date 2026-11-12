import { type Diff, expansion, type PropertyDiff, type Shape, type Status, typeName } from '#app/data/comparison.ts';
import type { Property, UpdateType } from '#app/data/specification.ts';

export type Mark = '+' | '-' | '~';

export interface Segment {
  text: string;
  href?: string;
}

export interface Line {
  depth: number;
  dash?: boolean;
  mark?: Mark;
  key?: Segment;
  value?: Segment;
  comment?: Segment;
  id?: string;
}

export interface Block {
  id: string;
  name: string;
  href?: string;
  status: Status;
  lines: Line[];
}

export interface Changelog {
  blocks: Block[];
}

const statusMarks: Record<Status, Mark | undefined> = { added: '+', removed: '-', modified: undefined };

const displayType = (shape: Shape) => `${shape.container ? `${shape.container} of ` : ''}${typeName(shape)}`;

const yesNo = (value?: boolean) => (value === undefined ? 'Not specified' : value ? 'Yes' : 'No');
const updateTypes: Record<UpdateType, string> = {
  Mutable: 'No interruption',
  Immutable: 'Replacement',
  Conditional: 'Some interruptions',
};
const updateType = (value?: UpdateType) => (value === undefined ? 'Not specified' : (updateTypes[value] ?? value));

function typeChange(before: Shape, after: Shape) {
  const [a, b] = [displayType(before), displayType(after)];
  return a === b ? undefined : `${a} → ${b}`;
}

function constraintChanges(before: Property, after: Property) {
  const changes: string[] = [];
  const [requiredBefore, requiredAfter] = [yesNo(before.Required), yesNo(after.Required)];
  if (requiredBefore !== requiredAfter) changes.push(`Required: ${requiredBefore} → ${requiredAfter}`);
  const [updateBefore, updateAfter] = [updateType(before.UpdateType), updateType(after.UpdateType)];
  if (updateBefore !== updateAfter) changes.push(`Update requires: ${updateBefore} → ${updateAfter}`);
  const [duplicatesBefore, duplicatesAfter] = [yesNo(before.DuplicatesAllowed), yesNo(after.DuplicatesAllowed)];
  if (duplicatesBefore !== duplicatesAfter)
    changes.push(`Duplicates allowed: ${duplicatesBefore} → ${duplicatesAfter}`);
  return changes;
}

const commentLines = (depth: number, mark: Mark | undefined, comments: string[]): Line[] =>
  comments.map((text) => ({ depth, mark, comment: { text } }));

function leafLines(head: Line, shape: Shape, mark?: Mark): Line[] {
  const value = { text: typeName(shape) };
  if (!shape.container) return [{ ...head, value: { ...value, href: shape.href } }];
  const item: Line =
    shape.container === 'List'
      ? { depth: head.depth + 2, dash: true, mark, value }
      : { depth: head.depth + 1, mark, key: { text: '<key>' }, value };
  return [head, item];
}

const typeLine = (name: string, definition: Property, mark?: Mark): Line => ({
  depth: 0,
  mark,
  key: { text: 'Type' },
  value: { text: name, href: definition.Documentation },
});

const section = (name: string, body: Line[]): Line[] =>
  body.length ? [{ depth: 0, key: { text: name } }, ...body] : [];

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

class Renderer {
  readonly blockId: string;
  expanded = new Map<string, string>();
  used = new Set<string>();

  constructor(blockId: string) {
    this.blockId = blockId;
  }

  anchor(name: string) {
    const base = `${this.blockId}-${slug(name)}`;
    let id = base;
    for (let n = 2; this.used.has(id); n++) id = `${base}-${n}`;
    this.used.add(id);
    return id;
  }

  fields(diffs: PropertyDiff[], depth: number, announceRequired: boolean) {
    return diffs.flatMap((diff) => this.property(diff, depth, announceRequired));
  }

  property(diff: PropertyDiff, depth: number, announceRequired: boolean): Line[] {
    const current = diff.status === 'removed' ? diff.before : diff.after;
    const { shape } = current;
    const mark = statusMarks[diff.status];
    const change = diff.status === 'modified' ? typeChange(diff.before.shape, diff.after.shape) : undefined;
    const comments =
      diff.status === 'modified'
        ? constraintChanges(diff.before.property, diff.after.property)
        : diff.status === 'added' && announceRequired && diff.after.property.Required
          ? ['Required: Yes']
          : [];
    const key = { text: diff.name, href: current.property.Documentation };
    const head: Line = change
      ? { depth, mark: '~', key, value: { text: change } }
      : { depth, mark: mark ?? (comments.length ? '~' : undefined), key };
    const notes = commentLines(depth, mark, comments);
    if (!shape.type) return [...notes, ...(change ? [head] : leafLines(head, shape, mark))];
    const reference = diff.children ? undefined : this.expanded.get(expansion(diff));
    if (reference) {
      return [...notes, { ...head, comment: { text: `${typeName(shape)}: see above`, href: `#${reference}` } }];
    }
    head.id = this.anchor(diff.name);
    if (!this.expanded.has(expansion(diff))) this.expanded.set(expansion(diff), head.id);
    const compared = diff.status === 'modified' && Boolean(diff.before.shape.type);
    const children = diff.children ?? [];
    if (change) return [...notes, head, ...this.fields(children, depth + 1, compared)];
    const childDepth = depth + (shape.container ? 2 : 1);
    const body = this.fields(children, childDepth, compared);
    const mapKey: Line = { depth: depth + 1, key: { text: '<key>' } };
    if (body.length) {
      if (shape.container === 'List') body[0].dash = true;
      return [...notes, head, ...(shape.container === 'Map' ? [mapKey] : []), ...body];
    }
    if (compared) return [...notes, ...leafLines(head, shape, mark)];
    if (shape.container === 'List')
      return [...notes, head, { depth: childDepth, dash: true, mark, value: { text: '{}' } }];
    if (shape.container === 'Map') return [...notes, head, { ...mapKey, value: { text: '{}' } }];
    return [...notes, { ...head, value: { text: '{}' } }];
  }
}

export function render(diff: Diff): Block {
  const renderer = new Renderer(slug(diff.name));
  const definition = diff.after ?? diff.before;
  const lines = [
    ...(definition ? [typeLine(diff.name, definition, statusMarks[diff.status])] : []),
    ...section('Properties', renderer.fields(diff.properties, 1, diff.status === 'modified')),
    ...section('Fn::GetAtt', renderer.fields(diff.attributes, 1, false)),
  ];
  renderer.expanded = new Map();
  lines.push(...section('PropertyTypes', renderer.fields(diff.types, 1, false)));
  return { id: renderer.blockId, name: diff.name, href: diff.after?.Documentation, status: diff.status, lines };
}
