import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { Config } from '#app/config.ts';

type FunctionName = keyof ReturnType<typeof Config.lambda>['functionNames'];

export class Lambda {
  static #client?: LambdaClient;

  static get #lambda() {
    Lambda.#client ??= new LambdaClient({});
    return Lambda.#client;
  }

  static async invokeAsynchronously(name: FunctionName) {
    const functionName = Config.lambda().functionNames[name];
    if (!functionName) throw new Error(`The ${name} function name is not set`);
    await Lambda.#lambda.send(new InvokeCommand({ FunctionName: functionName, InvocationType: 'Event' }));
  }
}
