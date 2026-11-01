import type { Definition, Property, Specification, UpdateType } from './specification.ts';

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

export type Status = 'added' | 'removed' | 'modified';

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

interface Shape {
  container?: string;
  primitive?: string;
  type?: string;
  href?: string;
}

const emptySpecification: Specification = { ResourceSpecificationVersion: '', ResourceTypes: {}, PropertyTypes: {} };

const scopeOf = (key: string) => (key.includes('.') ? key.slice(0, key.indexOf('.')) : '');
const sortedUnion = (a: object, b: object) => [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
const isAlias = (definition: Definition) => !definition.Properties && Boolean(definition.Type);
const fieldsOf = (specification: Specification, key: string) => specification.PropertyTypes[key]?.Properties ?? {};

function resolve(specification: Specification, scope: string, name: string) {
  const scoped = `${scope}.${name}`;
  if (scope && specification.PropertyTypes[scoped]) return scoped;
  if (specification.PropertyTypes[name]) return name;
}

function shapeOf(specification: Specification, scope: string, property: Property, depth = 0): Shape {
  if (property.PrimitiveType) return { primitive: property.PrimitiveType };
  if (property.Type === 'List' || property.Type === 'Map') {
    if (property.PrimitiveItemType) return { container: property.Type, primitive: property.PrimitiveItemType };
    const item = shapeOf(specification, scope, { Type: property.ItemType }, depth + 1);
    return { ...item, container: item.container ?? property.Type };
  }
  const name = property.Type ?? 'Json';
  const key = resolve(specification, scope, name);
  if (!key) return { primitive: name };
  const definition = specification.PropertyTypes[key];
  if (isAlias(definition) && depth < 8) return shapeOf(specification, scopeOf(key), definition, depth + 1);
  return { type: key, href: definition.Documentation };
}

const typeName = (shape: Shape) => shape.primitive ?? shape.type?.slice(shape.type.indexOf('.') + 1) ?? '';
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

function fieldChanges(before: Property, after: Property) {
  const changes: string[] = [];
  const compare = (label: string, a: string, b: string) => {
    if (a !== b) changes.push(`${label}: ${a} → ${b}`);
  };
  compare('Required', yesNo(before.Required), yesNo(after.Required));
  compare('Update requires', updateType(before.UpdateType), updateType(after.UpdateType));
  compare('Duplicates allowed', yesNo(before.DuplicatesAllowed), yesNo(after.DuplicatesAllowed));
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

const typeLine = (name: string, definition: Definition, mark?: Mark): Line => ({
  depth: 0,
  mark,
  key: { text: 'Type' },
  value: { text: name, href: definition.Documentation },
});

const section = (name: string, body: Line[]): Line[] =>
  body.length ? [{ depth: 0, key: { text: name } }, ...body] : [];

const statusOrder: Status[] = ['added', 'modified', 'removed'];

class Comparison {
  readonly before: Specification;
  readonly after: Specification;
  visited = new Set<string>();
  changedPairs = new Map<string, boolean>();
  expanded = new Map<string, string>();
  counter = 0;

  constructor(before: Specification, after: Specification) {
    this.before = before;
    this.after = after;
  }

  pairChanged(beforeKey: string, afterKey: string): boolean {
    const pair = `${beforeKey}|${afterKey}`;
    const cached = this.changedPairs.get(pair);
    if (cached !== undefined) return cached;
    this.changedPairs.set(pair, false);
    const beforeFields = fieldsOf(this.before, beforeKey);
    const afterFields = fieldsOf(this.after, afterKey);
    const changed = sortedUnion(beforeFields, afterFields).some(
      (name) =>
        !beforeFields[name] ||
        !afterFields[name] ||
        this.propertyChanged(scopeOf(beforeKey), scopeOf(afterKey), beforeFields[name], afterFields[name]),
    );
    this.changedPairs.set(pair, changed);
    return changed;
  }

  propertyChanged(beforeScope: string, afterScope: string, beforeProperty: Property, afterProperty: Property) {
    const beforeShape = shapeOf(this.before, beforeScope, beforeProperty);
    const afterShape = shapeOf(this.after, afterScope, afterProperty);
    if (typeChange(beforeShape, afterShape) || fieldChanges(beforeProperty, afterProperty).length) return true;
    return Boolean(beforeShape.type && afterShape.type && this.pairChanged(beforeShape.type, afterShape.type));
  }

  propertyLines(options: {
    depth: number;
    mark?: Mark;
    name: string;
    href?: string;
    shape: Shape;
    comments: string[];
    typeChange?: string;
    expansion?: string;
    pruned?: boolean;
    children?: (depth: number) => Line[];
  }): Line[] {
    const { depth, mark, name, href, shape, comments, expansion, pruned, children } = options;
    const change = options.typeChange;
    const head: Line = change
      ? { depth, mark: '~', key: { text: name, href }, value: { text: change } }
      : { depth, mark: mark ?? (comments.length ? '~' : undefined), key: { text: name, href } };
    const notes = commentLines(depth, mark, comments);
    if (!children) return [...notes, ...(change ? [head] : leafLines(head, shape, mark))];
    const reference = expansion && this.expanded.get(expansion);
    if (reference) {
      return [...notes, { ...head, comment: { text: `${typeName(shape)}: see above`, href: `#${reference}` } }];
    }
    head.id = `line-${++this.counter}`;
    if (expansion) this.expanded.set(expansion, head.id);
    if (change) return [...notes, head, ...children(depth + 1)];
    const childDepth = depth + (shape.container ? 2 : 1);
    const body = children(childDepth);
    const mapKey: Line = { depth: depth + 1, key: { text: '<key>' } };
    if (body.length) {
      if (shape.container === 'List') body[0].dash = true;
      return [...notes, head, ...(shape.container === 'Map' ? [mapKey] : []), ...body];
    }
    if (pruned) return [...notes, ...leafLines(head, shape, mark)];
    if (shape.container === 'List')
      return [...notes, head, { depth: childDepth, dash: true, mark, value: { text: '{}' } }];
    if (shape.container === 'Map') return [...notes, head, { ...mapKey, value: { text: '{}' } }];
    return [...notes, { ...head, value: { text: '{}' } }];
  }

  full(
    specification: Specification,
    scope: string,
    name: string,
    property: Property,
    depth: number,
    mark: Mark,
    comments: string[] = [],
  ): Line[] {
    const shape = shapeOf(specification, scope, property);
    const type = shape.type;
    return this.propertyLines({
      depth,
      mark,
      name,
      href: property.Documentation,
      shape,
      comments,
      expansion: type && `${mark}${type}`,
      children: type ? (childDepth) => this.fullFields(specification, type, childDepth, mark) : undefined,
    });
  }

  fullFields(specification: Specification, key: string, depth: number, mark: Mark) {
    this.visited.add(key);
    return Object.entries(fieldsOf(specification, key)).flatMap(([name, property]) =>
      this.full(specification, scopeOf(key), name, property, depth, mark),
    );
  }

  compareFields(
    beforeScope: string,
    afterScope: string,
    beforeFields: Record<string, Property>,
    afterFields: Record<string, Property>,
    depth: number,
    announceRequired: boolean,
  ) {
    return sortedUnion(beforeFields, afterFields).flatMap((name) => {
      if (!beforeFields[name]) {
        const comments = announceRequired && afterFields[name].Required ? ['Required: Yes'] : [];
        return this.full(this.after, afterScope, name, afterFields[name], depth, '+', comments);
      }
      if (!afterFields[name]) return this.full(this.before, beforeScope, name, beforeFields[name], depth, '-');
      return this.compareProperty(beforeScope, afterScope, name, beforeFields[name], afterFields[name], depth);
    });
  }

  compareProperty(
    beforeScope: string,
    afterScope: string,
    name: string,
    beforeProperty: Property,
    afterProperty: Property,
    depth: number,
  ): Line[] {
    const beforeShape = shapeOf(this.before, beforeScope, beforeProperty);
    const afterShape = shapeOf(this.after, afterScope, afterProperty);
    const comments = fieldChanges(beforeProperty, afterProperty);
    const change = typeChange(beforeShape, afterShape);
    const beforeType = beforeShape.type;
    const afterType = afterShape.type;
    const both = Boolean(beforeType && afterType);
    if (!change && !comments.length && !(beforeType && afterType && this.pairChanged(beforeType, afterType))) return [];
    return this.propertyLines({
      depth,
      name,
      href: afterProperty.Documentation,
      shape: afterShape,
      comments,
      typeChange: change,
      expansion: both ? `~${beforeType}|${afterType}` : afterType && `+${afterType}`,
      pruned: both,
      children:
        beforeType && afterType
          ? (childDepth) => this.compareTypes(beforeType, afterType, childDepth)
          : afterType
            ? (childDepth) => this.fullFields(this.after, afterType, childDepth, '+')
            : undefined,
    });
  }

  compareTypes(beforeKey: string, afterKey: string, depth: number) {
    this.visited.add(beforeKey);
    this.visited.add(afterKey);
    const beforeFields = fieldsOf(this.before, beforeKey);
    const afterFields = fieldsOf(this.after, afterKey);
    return this.compareFields(scopeOf(beforeKey), scopeOf(afterKey), beforeFields, afterFields, depth, true);
  }

  resource(name: string, status: Status) {
    this.expanded = new Map();
    const beforeDefinition = this.before.ResourceTypes[name] ?? {};
    const afterDefinition = this.after.ResourceTypes[name] ?? {};
    if (status === 'removed') return [typeLine(name, beforeDefinition, '-')];
    const mark = status === 'added' ? '+' : undefined;
    const body = (field: 'Properties' | 'Attributes') =>
      mark
        ? Object.entries(afterDefinition[field] ?? {}).flatMap(([property, value]) =>
            this.full(this.after, name, property, value, 1, mark),
          )
        : this.compareFields(
            name,
            name,
            beforeDefinition[field] ?? {},
            afterDefinition[field] ?? {},
            1,
            field === 'Properties',
          );
    return [
      typeLine(name, afterDefinition, mark),
      ...section('Properties', body('Properties')),
      ...section('Fn::GetAtt', body('Attributes')),
    ];
  }

  propertyType(key: string): Line[] {
    const name = key.slice(key.indexOf('.') + 1);
    const beforeDefinition = this.before.PropertyTypes[key];
    const afterDefinition = this.after.PropertyTypes[key];
    if (beforeDefinition && afterDefinition) {
      return [
        { depth: 1, key: { text: name, href: afterDefinition.Documentation } },
        ...this.compareTypes(key, key, 2),
      ];
    }
    return this.full(
      this.after,
      scopeOf(key),
      name,
      { Type: name, Documentation: afterDefinition.Documentation },
      1,
      '+',
    );
  }

  propertyTypes(keys: string[]) {
    this.expanded = new Map();
    return section(
      'PropertyTypes',
      keys.flatMap((key) => this.propertyType(key)),
    );
  }

  orphans() {
    return sortedUnion(this.before.PropertyTypes, this.after.PropertyTypes).filter((key) => {
      if (this.visited.has(key)) return false;
      const afterDefinition = this.after.PropertyTypes[key];
      if (!afterDefinition) return false;
      const beforeDefinition = this.before.PropertyTypes[key];
      if (!beforeDefinition) return true;
      if (isAlias(beforeDefinition) || isAlias(afterDefinition)) return false;
      return this.pairChanged(key, key);
    });
  }

  blocks() {
    const blocks: Block[] = [];
    for (const name of sortedUnion(this.before.ResourceTypes, this.after.ResourceTypes)) {
      const status: Status = !this.before.ResourceTypes[name]
        ? 'added'
        : !this.after.ResourceTypes[name]
          ? 'removed'
          : 'modified';
      const lines = this.resource(name, status);
      if (status === 'modified' && lines.length === 1) continue;
      const href = this.after.ResourceTypes[name]?.Documentation;
      blocks.push({ id: slug(name), name, href, status, lines });
    }
    for (const [scope, keys] of Map.groupBy(this.orphans(), (key) => scopeOf(key) || key)) {
      const lines = this.propertyTypes(keys);
      const block = blocks.find((candidate) => candidate.name === scope);
      if (block) {
        block.lines.push(...lines);
        continue;
      }
      const definition = this.after.ResourceTypes[scope] ?? this.before.ResourceTypes[scope];
      const head = definition ? [typeLine(scope, definition)] : [];
      blocks.push({
        id: slug(scope),
        name: scope,
        href: definition?.Documentation,
        status: 'modified',
        lines: [...head, ...lines],
      });
    }
    for (const block of blocks) assignAnchors(block);
    return blocks.sort(
      (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.name.localeCompare(b.name),
    );
  }
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function assignAnchors(block: Block) {
  const renamed = new Map<string, string>();
  const used = new Set<string>();
  for (const line of block.lines) {
    if (!line.id) continue;
    const base = `${block.id}-${slug(line.key?.text ?? '')}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    renamed.set(line.id, id);
    line.id = id;
  }
  for (const { comment } of block.lines) {
    const target = comment?.href && renamed.get(comment.href.slice(1));
    if (comment && target) comment.href = `#${target}`;
  }
}

export function compare(previous: Specification | undefined, after: Specification): Changelog {
  return { blocks: new Comparison(previous ?? emptySpecification, after).blocks() };
}
