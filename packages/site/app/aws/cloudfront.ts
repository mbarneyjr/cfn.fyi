import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { Config } from '#app/config.ts';

export class CloudFront {
  static #client?: CloudFrontClient;

  static get #cloudFront() {
    CloudFront.#client ??= new CloudFrontClient({});
    return CloudFront.#client;
  }

  static async invalidate(paths: string[]) {
    const { distributionId } = Config.cloudFront();
    if (!distributionId) throw new Error('The CloudFront distribution ID is not set');
    await CloudFront.#cloudFront.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `invalidation-${Date.now()}`,
          Paths: { Quantity: paths.length, Items: paths },
        },
      }),
    );
  }
}
