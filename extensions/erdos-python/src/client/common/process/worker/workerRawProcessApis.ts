// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// !!!! IMPORTANT: DO NOT IMPORT FROM VSCODE MODULE AS IT IS NOT AVAILABLE INSIDE WORKER THREADS !!!!

import { exec, execSync, spawn } from 'child_process';
import { Readable } from 'stream';
import { createDeferred } from '../../utils/async';
import { DEFAULT_ENCODING } from '../constants';
import { decodeBuffer } from '../decoder';
import {
    ShellOptions,
    SpawnOptions,
    EnvironmentVariables,
    IDisposable,
    noop,
    StdErrError,
    ExecutionResult,
} from './types';
import { traceWarn } from '../../../logging';

const PS_ERROR_SCREEN_BOGUS = /your [0-9]+x[0-9]+ screen size is bogus\. expect trouble/;

function getDefaultOptions<T extends ShellOptions | SpawnOptions>(options: T, defaultEnv?: EnvironmentVariables): T {
    const defaultOptions = { ...options };
    const execOptions = defaultOptions as SpawnOptions;
    if (execOptions) {
        execOptions.encoding =
            typeof execOptions.encoding === 'string' && execOptions.encoding.length > 0
                ? execOptions.encoding
                : DEFAULT_ENCODING;
        const { encoding } = execOptions;
        delete execOptions.encoding;
        execOptions.encoding = encoding;
    }
    if (!defaultOptions.env || Object.keys(defaultOptions.env).length === 0) {
        const env = defaultEnv || process.env;
        defaultOptions.env = { ...env };
    } else {
        defaultOptions.env = { ...defaultOptions.env };
    }

    if (execOptions && execOptions.extraVariables) {
        defaultOptions.env = { ...defaultOptions.env, ...execOptions.extraVariables };
    }

    // Always ensure we have unbuffered output.
    defaultOptions.env.PYTHONUNBUFFERED = '1';
    if (!defaultOptions.env.PYTHONIOENCODING) {
        defaultOptions.env.PYTHONIOENCODING = 'utf-8';
    }

    return defaultOptions;
}

export function _workerShellExecImpl(
    command: string,
    options: ShellOptions,
    defaultEnv?: EnvironmentVariables,
    disposables?: Set<IDisposable>,
): Promise<ExecutionResult<string>> {
    const shellOptions = getDefaultOptions(options, defaultEnv);
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const callback = (e: any, stdout: any, stderr: any) => {
            if (e && e !== null) {
                reject(e);
            } else if (shellOptions.throwOnStdErr && stderr && stderr.length) {
                reject(new Error(stderr));
            } else {
                stdout = filterOutputUsingCondaRunMarkers(stdout);
                // Make sure stderr is undefined if we actually had none. This is checked
                // elsewhere because that's how exec behaves.
                resolve({ stderr: stderr && stderr.length > 0 ? stderr : undefined, stdout });
            }
        };
        let procExited = false;
        const proc = exec(command, shellOptions, callback); // NOSONAR
        proc.once('close', () => {
            procExited = true;
        });
        proc.once('exit', () => {
            procExited = true;
        });
        proc.once('error', () => {
            procExited = true;
        });
        const disposable: IDisposable = {
            dispose: () => {
                // If process has not exited nor killed, force kill it.
                if (!procExited && !proc.killed) {
                    if (proc.pid) {
                        killPid(proc.pid);
                    } else {
                        proc.kill();
                    }
                }
            },
        };
        if (disposables) {
            disposables.add(disposable);
        }
    });
}

export function _workerPlainExecImpl(
    file: string,
    args: string[],
    options: SpawnOptions & { doNotLog?: boolean } = {},
    defaultEnv?: EnvironmentVariables,
    disposables?: Set<IDisposable>,
): Promise<ExecutionResult<string>> {
    const spawnOptions = getDefaultOptions(options, defaultEnv);
    const encoding = spawnOptions.encoding ? spawnOptions.encoding : 'utf8';
    const proc = spawn(file, args, spawnOptions);
    // Listen to these errors (unhandled errors in streams tears down the process).
    // Errors will be bubbled up to the `error` event in `proc`, hence no need to log.
    proc.stdout?.on('error', noop);
    proc.stderr?.on('error', noop);
    const deferred = createDeferred<ExecutionResult<string>>();
    const disposable: IDisposable = {
        dispose: () => {
            // If process has not exited nor killed, force kill it.
            if (!proc.killed && !deferred.completed) {
                if (proc.pid) {
                    killPid(proc.pid);
                } else {
                    proc.kill();
                }
            }
        },
    };
    disposables?.add(disposable);
    const internalDisposables: IDisposable[] = [];

    // eslint-disable-next-line @typescript-eslint/ban-types
    const on = (ee: Readable | null, name: string, fn: Function) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ee?.on(name, fn as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        internalDisposables.push({ dispose: () => ee?.removeListener(name, fn as any) as any });
    };

    // Tokens not supported yet as they come from vscode module which is not available.
    // if (options.token) {
    //     internalDisposables.push(options.token.onCancellationRequested(disposable.dispose));
    // }

    const stdoutBuffers: Buffer[] = [];
    on(proc.stdout, 'data', (data: Buffer) => {
        stdoutBuffers.push(data);
    });
    const stderrBuffers: Buffer[] = [];
    on(proc.stderr, 'data', (data: Buffer) => {
        if (options.mergeStdOutErr) {
            stdoutBuffers.push(data);
            stderrBuffers.push(data);
        } else {
            stderrBuffers.push(data);
        }
    });

    proc.once('close', () => {
        if (deferred.completed) {
            return;
        }
        const stderr: string | undefined =
            stderrBuffers.length === 0 ? undefined : decodeBuffer(stderrBuffers, encoding);
        if (
            stderr &&
            stderr.length > 0 &&
            options.throwOnStdErr &&
            // ignore this specific error silently; see this issue for context: https://github.com/microsoft/vscode/issues/75932
            !(PS_ERROR_SCREEN_BOGUS.test(stderr) && stderr.replace(PS_ERROR_SCREEN_BOGUS, '').trim().length === 0)
        ) {
            deferred.reject(new StdErrError(stderr));
        } else {
            let stdout = decodeBuffer(stdoutBuffers, encoding);
            stdout = filterOutputUsingCondaRunMarkers(stdout);
            deferred.resolve({ stdout, stderr });
        }
        internalDisposables.forEach((d) => d.dispose());
        disposable.dispose();
    });
    proc.once('error', (ex) => {
        deferred.reject(ex);
        internalDisposables.forEach((d) => d.dispose());
        disposable.dispose();
    });

    return deferred.promise;
}

function filterOutputUsingCondaRunMarkers(stdout: string) {
    // These markers are added if conda run is used or `interpreterInfo.py` is
    // run, see `get_output_via_markers.py`.
    const regex = />>>PYTHON-EXEC-OUTPUT([\s\S]*)<<<PYTHON-EXEC-OUTPUT/;
    const match = stdout.match(regex);
    const filteredOut = match !== null && match.length >= 2 ? match[1].trim() : undefined;
    return filteredOut !== undefined ? filteredOut : stdout;
}

function killPid(pid: number): void {
    try {
        if (process.platform === 'win32') {
            // Windows doesn't support SIGTERM, so execute taskkill to kill the process
            execSync(`taskkill /pid ${pid} /T /F`); // NOSONAR
        } else {
            process.kill(pid);
        }
    } catch {
        traceWarn('Unable to kill process with pid', pid);
    }
}
