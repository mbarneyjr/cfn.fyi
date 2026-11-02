import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface Archive {
  read(version: string): Promise<Uint8Array>;
  write(version: string, body: Uint8Array): Promise<void>;
}

const key = (version: string) => `${version}/CloudFormationResourceSpecification.json.gz`;

export function createDirectoryArchive(directory: string): Archive {
  return {
    read: (version) => readFile(join(directory, key(version))),
    async write(version, body) {
      const path = join(directory, key(version));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
  };
}

export function createBucketArchive(bucket: string, client = new S3Client({})): Archive {
  return {
    async read(version) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key(version) }));
      return (await response.Body?.transformToByteArray()) ?? new Uint8Array();
    },
    async write(version, body) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key(version), Body: body, ContentType: 'application/gzip' }),
      );
    },
  };
}

export function createArchive() {
  if (process.env.ARCHIVE_BUCKET) return createBucketArchive(process.env.ARCHIVE_BUCKET);
  if (process.env.ARCHIVE_DIRECTORY) return createDirectoryArchive(process.env.ARCHIVE_DIRECTORY);
  throw new Error('Set ARCHIVE_BUCKET or ARCHIVE_DIRECTORY');
}
