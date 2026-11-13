import { defaulted, object, optional, parseSafe, type Schema, string } from 'remix/data-schema';
import { url } from 'remix/data-schema/checks';

const slackSchema = object({
  SLACK_AUTHORIZE_URL: string().pipe(url()),
  SLACK_CLIENT_ID: string(),
  SLACK_CLIENT_SECRET: string(),
  SLACK_SIGNING_SECRET: string(),
  SLACK_SCOPES: string(),
  SLACK_REDIRECT_URI: optional(string().pipe(url())),
});

const notificationsSchema = object({
  SITE_URL: defaulted(string().pipe(url()), 'https://cfn.fyi'),
  VERSION_READY_QUEUE_URL: optional(string().pipe(url())),
  DELIVERY_QUEUE_URL: optional(string().pipe(url())),
});

const emailSchema = object({
  EMAIL_FROM_ADDRESS: optional(string()),
});

const databaseSchema = object({
  DATABASE_ENDPOINT: optional(string()),
  DATABASE_URL: optional(string()),
  DATABASE_USER: defaulted(string(), 'admin'),
  AWS_REGION: optional(string()),
});

const archiveSchema = object({
  ARCHIVE_BUCKET: optional(string()),
  ARCHIVE_DIRECTORY: optional(string()),
});

const cloudFrontSchema = object({
  DISTRIBUTION_ID: optional(string()),
});

const lambdaSchema = object({
  REBUILD_FUNCTION_NAME: optional(string()),
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

  static email() {
    const env = load('email', emailSchema);
    return {
      fromAddress: env.EMAIL_FROM_ADDRESS,
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
