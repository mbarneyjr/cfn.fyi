import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { S3 } from '#app/aws/s3.ts';
import { Config } from '#app/config.ts';

export abstract class Archive {
  abstract read(version: string): Promise<Uint8Array>;
  abstract write(version: string, body: Uint8Array): Promise<void>;

  protected key(version: string) {
    return `${version}/CloudFormationResourceSpecification.json.gz`;
  }
}

export class DirectoryArchive extends Archive {
  private readonly directory: string;

  constructor(directory: string) {
    super();
    this.directory = directory;
  }

  read(version: string) {
    return readFile(join(this.directory, this.key(version)));
  }

  async write(version: string, body: Uint8Array) {
    const path = join(this.directory, this.key(version));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
}

export class BucketArchive extends Archive {
  private readonly bucket: string;

  constructor(bucket: string) {
    super();
    this.bucket = bucket;
  }

  read(version: string) {
    return S3.getObject(this.bucket, this.key(version));
  }

  async write(version: string, body: Uint8Array) {
    await S3.putObject(this.bucket, this.key(version), body, 'application/gzip');
  }
}

export function createArchive(): Archive {
  const { bucket, directory } = Config.archive();
  if (bucket) return new BucketArchive(bucket);
  if (directory) return new DirectoryArchive(directory);
  throw new Error('Set ARCHIVE_BUCKET or ARCHIVE_DIRECTORY');
}
