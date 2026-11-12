import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export class S3 {
  static #client?: S3Client;

  static get #s3() {
    S3.#client ??= new S3Client({});
    return S3.#client;
  }

  static async getObject(bucket: string, key: string) {
    const response = await S3.#s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await response.Body?.transformToByteArray()) ?? new Uint8Array();
  }

  static async putObject(bucket: string, key: string, body: Uint8Array, contentType: string) {
    await S3.#s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  }
}
