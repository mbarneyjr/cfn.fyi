export type UpdateType = 'Mutable' | 'Immutable' | 'Conditional';
export type PrimitiveItemType = 'String' | 'Long' | 'Integer' | 'Double' | 'Boolean' | 'Timestamp';
export type PrimitiveType = PrimitiveItemType | 'Json';

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

export interface Definition extends Property {
  Properties?: Record<string, Property>;
  Attributes?: Record<string, Property>;
}

export interface Specification {
  ResourceSpecificationVersion: string;
  ResourceTypes: Record<string, Definition>;
  PropertyTypes: Record<string, Definition>;
}

export interface Neighbor {
  version: string;
  date?: string;
}

const bucketUrl = 'https://cfn-resource-specifications-us-east-1-prod.s3.us-east-1.amazonaws.com';

const fileUrl = (version: string, folder = '') =>
  `${bucketUrl}/${version}/${folder}CloudFormationResourceSpecification.json`;

export async function listCfnVersions() {
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

export async function neighbor(version: string | undefined): Promise<Neighbor | undefined> {
  if (!version) return undefined;
  const response = await fetch(fileUrl(version), { method: 'HEAD' }).catch(() => undefined);
  const modified = response?.ok && response.headers.get('last-modified');
  return { version, date: modified ? new Date(modified).toISOString().slice(0, 10) : undefined };
}

export async function specification(version: string) {
  let response = await fetch(fileUrl(version, 'gzip/'));
  if (!response.ok) response = await fetch(fileUrl(version));
  if (!response.ok) throw new Error(`Download ${version} failed: ${response.status}`);
  return (await response.json()) as Specification;
}
