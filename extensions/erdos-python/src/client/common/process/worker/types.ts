/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { ExecOptions, SpawnOptions as ChildProcessSpawnOptions } from 'child_process';

export function noop() {}
export interface IDisposable {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispose(): void | undefined | Promise<void>;
}
export type EnvironmentVariables = Record<string, string | undefined>;
export class StdErrError extends Error {
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(message: string) {
        super(message);
    }
}

export type SpawnOptions = ChildProcessSpawnOptions & {
    encoding?: string;
    // /**
    //  * Can't use `CancellationToken` here as it comes from vscode which is not available in worker threads.
    //  */
    // token?: CancellationToken;
    mergeStdOutErr?: boolean;
    throwOnStdErr?: boolean;
    extraVariables?: NodeJS.ProcessEnv;
    // /**
    //  * Can't use `OutputChannel` here as it comes from vscode which is not available in worker threads.
    //  */
    // outputChannel?: OutputChannel;
    stdinStr?: string;
};
export type ShellOptions = ExecOptions & { throwOnStdErr?: boolean };

export type ExecutionResult<T extends string | Buffer> = {
    stdout: T;
    stderr?: T;
};
