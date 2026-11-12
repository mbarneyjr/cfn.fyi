import { AsyncLocalStorage } from 'node:async_hooks';

const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_LAMBDA_HTTP_ENDPOINT);

function serializeError(_key: string, value: unknown) {
  if (!(value instanceof Error)) return value;
  return { name: value.name, message: value.message, stack: value.stack, cause: value.cause };
}

export interface LogContext {
  method?: string;
  path?: string;
  messageId?: string;
}

export class Logger {
  static #context = new AsyncLocalStorage<LogContext>();

  static run<Result>(context: LogContext, operation: () => Result): Result {
    return Logger.#context.run({ ...Logger.#context.getStore(), ...context }, operation);
  }

  static info(event: string, fields: object = {}) {
    Logger.#write('info', event, fields);
  }

  static error(event: string, fields: object = {}) {
    Logger.#write('error', event, fields);
  }

  static #write(level: 'info' | 'error', event: string, fields: object) {
    const entry = JSON.stringify({ event, ...Logger.#context.getStore(), ...fields }, serializeError);
    console[level](isLambda ? JSON.parse(entry) : entry);
  }
}
