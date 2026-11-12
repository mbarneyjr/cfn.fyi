import { defaulted, object, optional, parseSafe, type Schema, string } from 'remix/data-schema';
import { minLength, url } from 'remix/data-schema/checks';

const required = () => string().pipe(minLength(1));

const slackSchema = object({
  SLACK_AUTHORIZE_URL: string().pipe(url()),
  SLACK_CLIENT_ID: required(),
  SLACK_CLIENT_SECRET: required(),
  SLACK_SIGNING_SECRET: required(),
  SLACK_SCOPES: required(),
  SLACK_REDIRECT_URI: optional(string().pipe(url())),
});

const notificationsSchema = object({
  SITE_URL: defaulted(string().pipe(url()), 'https://cfn.fyi'),
  VERSION_READY_QUEUE_URL: optional(string().pipe(url())),
  DELIVERY_QUEUE_URL: optional(string().pipe(url())),
});

const databaseSchema = object({
  DATABASE_ENDPOINT: optional(required()),
  DATABASE_URL: optional(required()),
  DATABASE_USER: defaulted(required(), 'admin'),
  AWS_REGION: optional(required()),
});

const archiveSchema = object({
  ARCHIVE_BUCKET: optional(required()),
  ARCHIVE_DIRECTORY: optional(required()),
});

const cloudFrontSchema = object({
  DISTRIBUTION_ID: optional(required()),
});

const lambdaSchema = object({
  REBUILD_FUNCTION_NAME: optional(required()),
});

function load<Output>(name: string, schema: Schema<unknown, Output>) {
  const result = parseSafe(schema, process.env);
  if (result.success) return result.value;
  const issues = result.issues.map((issue) => `${issue.path?.join('.') ?? ''}: ${issue.message}`).join('; ');
  throw new Error(`Invalid ${name} configuration: ${issues}`);
}

export class Config {
  static slack() {
    const env = load('Slack', slackSchema);
    return {
      authorizeUrl: env.SLACK_AUTHORIZE_URL,
      clientId: env.SLACK_CLIENT_ID,
      clientSecret: env.SLACK_CLIENT_SECRET,
      signingSecret: env.SLACK_SIGNING_SECRET,
      scopes: env.SLACK_SCOPES,
      redirectUri: env.SLACK_REDIRECT_URI,
    };
  }

  static notifications() {
    const env = load('notifications', notificationsSchema);
    return {
      siteUrl: env.SITE_URL,
      queueUrls: {
        versionReady: env.VERSION_READY_QUEUE_URL,
        delivery: env.DELIVERY_QUEUE_URL,
      },
    };
  }

  static database() {
    const env = load('database', databaseSchema);
    return {
      endpoint: env.DATABASE_ENDPOINT,
      url: env.DATABASE_URL,
      user: env.DATABASE_USER,
      region: env.AWS_REGION,
    };
  }

  static archive() {
    const env = load('archive', archiveSchema);
    return {
      bucket: env.ARCHIVE_BUCKET,
      directory: env.ARCHIVE_DIRECTORY,
    };
  }

  static cloudFront() {
    const env = load('CloudFront', cloudFrontSchema);
    return {
      distributionId: env.DISTRIBUTION_ID,
    };
  }

  static lambda() {
    const env = load('Lambda', lambdaSchema);
    return {
      functionNames: {
        rebuildChanges: env.REBUILD_FUNCTION_NAME,
      },
    };
  }
}
