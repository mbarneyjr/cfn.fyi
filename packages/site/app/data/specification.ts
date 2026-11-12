import { array, boolean, enum_, object, optional, parse, record, type Schema, string } from 'remix/data-schema';

export type UpdateType = 'Mutable' | 'Immutable' | 'Conditional';
export type PrimitiveItemType = 'String' | 'Long' | 'Integer' | 'Double' | 'Boolean' | 'Timestamp' | 'Json';
export type PrimitiveType = PrimitiveItemType | 'Map';

export interface Property {
  Documentation?: string;
  Required?: boolean;
  UpdateType?: UpdateType;
  PrimitiveType?: PrimitiveType;
  Type?: string;
  ItemType?: string;
  PrimitiveItemType?: PrimitiveItemType;
  DuplicatesAllowed?: boolean;
}

export interface DeletionPolicy {
  Default: string;
  AllowedValues: string[];
}

export interface Definition extends Property {
  Properties?: Record<string, Property>;
  Attributes?: Record<string, Property>;
  AdditionalProperties?: boolean;
  AllowCreationPolicy?: string;
  AllowUpdatePolicy?: string;
  DeletionPolicy?: DeletionPolicy;
}

export interface Specification {
  ResourceSpecificationVersion: string;
  ResourceTypes: Record<string, Definition>;
  PropertyTypes: Record<string, Definition>;
}

const bucketUrl = 'https://cfn-resource-specifications-us-east-1-prod.s3.us-east-1.amazonaws.com';

const fileUrl = (version: string, folder = '') =>
  `${bucketUrl}/${version}/${folder}CloudFormationResourceSpecification.json`;

export const ordinal = (version: string) =>
  version.split('.').reduce((total, part) => total * 1000 + Number.parseInt(part, 10), 0);

export async function listSourceVersions() {
  const versions: string[] = [];
  let token: string | undefined;
  do {
    const query = new URLSearchParams({ 'list-type': '2', delimiter: '/' });
    if (token) query.set('continuation-token', token);
    const response = await fetch(`${bucketUrl}/?${query}`);
    if (!response.ok) throw new Error(`Listing versions failed: ${response.status}`);
    const xml = await response.text();
    for (const [, prefix] of xml.matchAll(/<Prefix>(\d+\.\d+\.\d+)\/<\/Prefix>/g)) versions.push(prefix);
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
  } while (token);
  return versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function requestSource(version: string, method: 'GET' | 'HEAD') {
  const response = await fetch(fileUrl(version, 'gzip/'), { method });
  if (response.ok) return response;
  return fetch(fileUrl(version), { method });
}

const updateTypeSchema = enum_(['Mutable', 'Immutable', 'Conditional']);
const primitiveItemTypeSchema = enum_(['String', 'Long', 'Integer', 'Double', 'Boolean', 'Timestamp', 'Json']);
const primitiveTypeSchema = enum_(['String', 'Long', 'Integer', 'Double', 'Boolean', 'Timestamp', 'Json', 'Map']);

const propertySchema: Schema<unknown, Property> = object({
  Documentation: optional(string()),
  Required: optional(boolean()),
  UpdateType: optional(updateTypeSchema),
  PrimitiveType: optional(primitiveTypeSchema),
  Type: optional(string()),
  ItemType: optional(string()),
  PrimitiveItemType: optional(primitiveItemTypeSchema),
  DuplicatesAllowed: optional(boolean()),
});

const definitionSchema: Schema<unknown, Definition> = object({
  Documentation: optional(string()),
  Required: optional(boolean()),
  UpdateType: optional(updateTypeSchema),
  PrimitiveType: optional(primitiveTypeSchema),
  Type: optional(string()),
  ItemType: optional(string()),
  PrimitiveItemType: optional(primitiveItemTypeSchema),
  DuplicatesAllowed: optional(boolean()),
  Properties: optional(record(string(), propertySchema)),
  Attributes: optional(record(string(), propertySchema)),
  AdditionalProperties: optional(boolean()),
  AllowCreationPolicy: optional(string()),
  AllowUpdatePolicy: optional(string()),
  DeletionPolicy: optional(object({ Default: string(), AllowedValues: array(string()) })),
});

const specificationSchema: Schema<unknown, Specification> = object({
  ResourceSpecificationVersion: string(),
  ResourceTypes: record(string(), definitionSchema),
  PropertyTypes: record(string(), definitionSchema),
});

export const parseSpecification = (json: Uint8Array) =>
  parse(specificationSchema, JSON.parse(Buffer.from(json).toString('utf8')));
