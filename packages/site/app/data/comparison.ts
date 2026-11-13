import type { Definition, Property, Specification } from './specification.ts';

export const statuses = ['added', 'modified', 'removed'] as const;

export type Status = (typeof statuses)[number];

export interface Shape {
  container?: 'List' | 'Map';
  primitive?: string;
  type?: string;
  href?: string;
}

export interface State {
  property: Property;
  shape: Shape;
}

interface PropertyDiffBase {
  name: string;
  children?: PropertyDiff[];
}

export type PropertyDiff = PropertyDiffBase &
  (
    | { status: 'added'; before?: undefined; after: State }
    | { status: 'removed'; before: State; after?: undefined }
    | { status: 'modified'; before: State; after: State }
  );

export interface Diff {
  name: string;
  status: Status;
  before?: Property;
  after?: Property;
  properties: PropertyDiff[];
  attributes: PropertyDiff[];
  types: PropertyDiff[];
}

const emptySpecification: Specification = { ResourceSpecificationVersion: '', ResourceTypes: {}, PropertyTypes: {} };

function scopeOf(key: string) {
  return key.includes('.') ? key.slice(0, key.indexOf('.')) : '';
}

function sortedUnion(a: object, b: object) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
}

function isAlias(definition: Definition) {
  return !definition.Properties && Boolean(definition.Type);
}

function fieldsOf(specification: Specification, key: string) {
  return specification.PropertyTypes[key]?.Properties ?? {};
}

function header(definition?: Definition) {
  if (!definition) return undefined;
  const { Properties, Attributes, ...rest } = definition;
  return rest;
}

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

function state(specification: Specification, scope: string, property: Property): State {
  return { property, shape: shapeOf(specification, scope, property) };
}

export function typeName(shape: Shape) {
  return shape.primitive ?? shape.type?.slice(shape.type.indexOf('.') + 1) ?? '';
}

function sameShape(a: Shape, b: Shape) {
  return a.container === b.container && typeName(a) === typeName(b);
}

function sameConstraints(a: Property, b: Property) {
  return a.Required === b.Required && a.UpdateType === b.UpdateType && a.DuplicatesAllowed === b.DuplicatesAllowed;
}

export function expansion(diff: PropertyDiff) {
  return `${diff.before?.shape.type ?? ''}|${diff.after?.shape.type ?? ''}`;
}

class Comparison {
  readonly before: Specification;
  readonly after: Specification;
  visited = new Set<string>();
  changedPairs = new Map<string, boolean>();
  expanded = new Set<string>();

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
        this.changed(
          state(this.before, scopeOf(beforeKey), beforeFields[name]),
          state(this.after, scopeOf(afterKey), afterFields[name]),
        ),
    );
    this.changedPairs.set(pair, changed);
    return changed;
  }

  changed(before: State, after: State) {
    if (!sameShape(before.shape, after.shape) || !sameConstraints(before.property, after.property)) return true;
    const [beforeType, afterType] = [before.shape.type, after.shape.type];
    return Boolean(beforeType && afterType && this.pairChanged(beforeType, afterType));
  }

  expand(diff: PropertyDiff, children: () => PropertyDiff[]) {
    const key = expansion(diff);
    if (this.expanded.has(key)) return diff;
    this.expanded.add(key);
    diff.children = children();
    return diff;
  }

  full(
    specification: Specification,
    scope: string,
    name: string,
    property: Property,
    status: 'added' | 'removed',
  ): PropertyDiff {
    const current = state(specification, scope, property);
    const diff: PropertyDiff =
      status === 'added' ? { name, status, after: current } : { name, status, before: current };
    const type = current.shape.type;
    if (!type) return diff;
    return this.expand(diff, () => this.fullFields(specification, type, status));
  }

  fullFields(specification: Specification, key: string, status: 'added' | 'removed'): PropertyDiff[] {
    this.visited.add(key);
    return Object.entries(fieldsOf(specification, key)).map(([name, property]) =>
      this.full(specification, scopeOf(key), name, property, status),
    );
  }

  compareFields(
    beforeScope: string,
    afterScope: string,
    beforeFields: Record<string, Property>,
    afterFields: Record<string, Property>,
  ): PropertyDiff[] {
    return sortedUnion(beforeFields, afterFields).flatMap((name) => {
      if (!beforeFields[name]) return [this.full(this.after, afterScope, name, afterFields[name], 'added')];
      if (!afterFields[name]) return [this.full(this.before, beforeScope, name, beforeFields[name], 'removed')];
      const before = state(this.before, beforeScope, beforeFields[name]);
      const after = state(this.after, afterScope, afterFields[name]);
      if (!this.changed(before, after)) return [];
      const diff: PropertyDiff = { name, status: 'modified', before, after };
      const [beforeType, afterType] = [before.shape.type, after.shape.type];
      if (!afterType) return [diff];
      return [
        this.expand(diff, () =>
          beforeType ? this.compareTypes(beforeType, afterType) : this.fullFields(this.after, afterType, 'added'),
        ),
      ];
    });
  }

  compareTypes(beforeKey: string, afterKey: string): PropertyDiff[] {
    this.visited.add(beforeKey);
    this.visited.add(afterKey);
    const beforeFields = fieldsOf(this.before, beforeKey);
    const afterFields = fieldsOf(this.after, afterKey);
    return this.compareFields(scopeOf(beforeKey), scopeOf(afterKey), beforeFields, afterFields);
  }

  resource(name: string, status: Status): Diff {
    this.expanded = new Set();
    const beforeDefinition = this.before.ResourceTypes[name];
    const afterDefinition = this.after.ResourceTypes[name];
    let properties: PropertyDiff[] = [];
    let attributes: PropertyDiff[] = [];
    if (status === 'added') {
      properties = Object.entries(afterDefinition.Properties ?? {}).map(([property, value]) =>
        this.full(this.after, name, property, value, 'added'),
      );
      attributes = Object.entries(afterDefinition.Attributes ?? {}).map(([attribute, value]) =>
        this.full(this.after, name, attribute, value, 'added'),
      );
    }
    if (status === 'modified') {
      properties = this.compareFields(name, name, beforeDefinition.Properties ?? {}, afterDefinition.Properties ?? {});
      attributes = this.compareFields(name, name, beforeDefinition.Attributes ?? {}, afterDefinition.Attributes ?? {});
    }
    return {
      name,
      status,
      before: header(beforeDefinition),
      after: header(afterDefinition),
      properties,
      attributes,
      types: [],
    };
  }

  propertyType(key: string): PropertyDiff {
    const name = key.slice(key.indexOf('.') + 1);
    const beforeDefinition = this.before.PropertyTypes[key];
    const afterDefinition = this.after.PropertyTypes[key];
    if (!beforeDefinition) {
      return this.full(
        this.after,
        scopeOf(key),
        name,
        { Type: name, Documentation: afterDefinition.Documentation },
        'added',
      );
    }
    return {
      name,
      status: 'modified',
      before: {
        property: { Documentation: beforeDefinition.Documentation },
        shape: { type: key, href: beforeDefinition.Documentation },
      },
      after: {
        property: { Documentation: afterDefinition.Documentation },
        shape: { type: key, href: afterDefinition.Documentation },
      },
      children: this.compareTypes(key, key),
    };
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

  diffs() {
    const diffs: Diff[] = [];
    for (const name of sortedUnion(this.before.ResourceTypes, this.after.ResourceTypes)) {
      const status: Status = !this.before.ResourceTypes[name]
        ? 'added'
        : !this.after.ResourceTypes[name]
          ? 'removed'
          : 'modified';
      const diff = this.resource(name, status);
      if (status === 'modified' && !diff.properties.length && !diff.attributes.length) continue;
      diffs.push(diff);
    }
    for (const [scope, keys] of Map.groupBy(this.orphans(), (key) => scopeOf(key) || key)) {
      this.expanded = new Set();
      const types = keys.map((key) => this.propertyType(key));
      const diff = diffs.find((candidate) => candidate.name === scope);
      if (diff) {
        diff.types = types;
        continue;
      }
      diffs.push({
        name: scope,
        status: 'modified',
        before: header(this.before.ResourceTypes[scope]),
        after: header(this.after.ResourceTypes[scope]),
        properties: [],
        attributes: [],
        types,
      });
    }
    return diffs.sort(
      (a, b) => statuses.indexOf(a.status) - statuses.indexOf(b.status) || a.name.localeCompare(b.name),
    );
  }
}

export function compare(previous: Specification | undefined, after: Specification): Diff[] {
  return new Comparison(previous ?? emptySpecification, after).diffs();
}
