import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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
  private readonly client: S3Client;

  constructor(bucket: string, client = new S3Client({})) {
    super();
    this.bucket = bucket;
    this.client = client;
  }

  async read(version: string) {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(version) }));
    return (await response.Body?.transformToByteArray()) ?? new Uint8Array();
  }

  async write(version: string, body: Uint8Array) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(version),
        Body: body,
        ContentType: 'application/gzip',
      }),
    );
  }
}

export function createArchive(): Archive {
  if (process.env.ARCHIVE_BUCKET) return new BucketArchive(process.env.ARCHIVE_BUCKET);
  if (process.env.ARCHIVE_DIRECTORY) return new DirectoryArchive(process.env.ARCHIVE_DIRECTORY);
  throw new Error('Set ARCHIVE_BUCKET or ARCHIVE_DIRECTORY');
}
