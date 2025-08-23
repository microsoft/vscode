// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Uri } from 'vscode';
import { IDisposableRegistry } from '../../../common/types';
import { createDeferred, Deferred, sleep } from '../../../common/utils/async';
import { createRunningWorkerPool, IWorkerPool, QueuePosition } from '../../../common/utils/workerPool';
import { getInterpreterInfo, InterpreterInformation } from './interpreter';
import { buildPythonExecInfo } from '../../exec';
import { traceError, traceVerbose, traceWarn } from '../../../logging';
import { Conda, CONDA_ACTIVATION_TIMEOUT, isCondaEnvironment } from '../../common/environmentManagers/conda';
import { PythonEnvInfo, PythonEnvKind } from '.';
import { normCasePath } from '../../common/externalDependencies';
import { OUTPUT_MARKER_SCRIPT } from '../../../common/process/internal/scripts';
import { Architecture } from '../../../common/utils/platform';
import { getEmptyVersion } from './pythonVersion';

export enum EnvironmentInfoServiceQueuePriority {
    Default,
    High,
}

export interface IEnvironmentInfoService {
    /**
     * Get the interpreter information for the given environment.
     * @param env The environment to get the interpreter information for.
     * @param priority The priority of the request.
     */
    getEnvironmentInfo(
        env: PythonEnvInfo,
        priority?: EnvironmentInfoServiceQueuePriority,
    ): Promise<InterpreterInformation | undefined>;
    /**
     * Reset any stored interpreter information for the given environment.
     * @param searchLocation Search location of the environment.
     */
    resetInfo(searchLocation: Uri): void;
}

async function buildEnvironmentInfo(
    env: PythonEnvInfo,
    useIsolated = true,
): Promise<InterpreterInformation | undefined> {
    const python = [env.executable.filename];
    if (useIsolated) {
        python.push(...['-I', OUTPUT_MARKER_SCRIPT]);
    } else {
        python.push(...[OUTPUT_MARKER_SCRIPT]);
    }
    const interpreterInfo = await getInterpreterInfo(buildPythonExecInfo(python, undefined, env.executable.filename));
    return interpreterInfo;
}

async function buildEnvironmentInfoUsingCondaRun(env: PythonEnvInfo): Promise<InterpreterInformation | undefined> {
    const conda = await Conda.getConda();
    const path = env.location.length ? env.location : env.executable.filename;
    const condaEnv = await conda?.getCondaEnvironment(path);
    if (!condaEnv) {
        return undefined;
    }
    const python = await conda?.getRunPythonArgs(condaEnv, true, true);
    if (!python) {
        return undefined;
    }
    const interpreterInfo = await getInterpreterInfo(
        buildPythonExecInfo(python, undefined, env.executable.filename),
        CONDA_ACTIVATION_TIMEOUT,
    );
    return interpreterInfo;
}

class EnvironmentInfoService implements IEnvironmentInfoService {
    // Caching environment here in-memory. This is so that we don't have to run this on the same
    // path again and again in a given session. This information will likely not change in a given
    // session. There are definitely cases where this will change. But a simple reload should address
    // those.
    private readonly cache: Map<string, Deferred<InterpreterInformation>> = new Map<
        string,
        Deferred<InterpreterInformation>
    >();

    private workerPool?: IWorkerPool<PythonEnvInfo, InterpreterInformation | undefined>;

    private condaRunWorkerPool?: IWorkerPool<PythonEnvInfo, InterpreterInformation | undefined>;

    public dispose(): void {
        if (this.workerPool !== undefined) {
            this.workerPool.stop();
            this.workerPool = undefined;
        }
        if (this.condaRunWorkerPool !== undefined) {
            this.condaRunWorkerPool.stop();
            this.condaRunWorkerPool = undefined;
        }
    }

    public async getEnvironmentInfo(
        env: PythonEnvInfo,
        priority?: EnvironmentInfoServiceQueuePriority,
    ): Promise<InterpreterInformation | undefined> {
        const interpreterPath = env.executable.filename;
        const result = this.cache.get(normCasePath(interpreterPath));
        if (result !== undefined) {
            // Another call for this environment has already been made, return its result.
            return result.promise;
        }

        const deferred = createDeferred<InterpreterInformation>();
        this.cache.set(normCasePath(interpreterPath), deferred);
        this._getEnvironmentInfo(env, priority)
            .then((r) => {
                deferred.resolve(r);
            })
            .catch((ex) => {
                deferred.reject(ex);
            });
        return deferred.promise;
    }

    public async _getEnvironmentInfo(
        env: PythonEnvInfo,
        priority?: EnvironmentInfoServiceQueuePriority,
        retryOnce = true,
    ): Promise<InterpreterInformation | undefined> {
        if (env.kind === PythonEnvKind.Conda && env.executable.filename === 'python') {
            const emptyInterpreterInfo: InterpreterInformation = {
                arch: Architecture.Unknown,
                executable: {
                    filename: 'python',
                    ctime: -1,
                    mtime: -1,
                    sysPrefix: '',
                },
                version: getEmptyVersion(),
            };

            return emptyInterpreterInfo;
        }
        if (this.workerPool === undefined) {
            this.workerPool = createRunningWorkerPool<PythonEnvInfo, InterpreterInformation | undefined>(
                buildEnvironmentInfo,
            );
        }

        let reason: Error | undefined;
        let r = await addToQueue(this.workerPool, env, priority).catch((err) => {
            reason = err;
            return undefined;
        });

        if (r === undefined) {
            // Even though env kind is not conda, it can still be a conda environment
            // as complete env info may not be available at this time.
            const isCondaEnv = env.kind === PythonEnvKind.Conda || (await isCondaEnvironment(env.executable.filename));
            if (isCondaEnv) {
                traceVerbose(
                    `Validating ${env.executable.filename} normally failed with error, falling back to using conda run: (${reason})`,
                );
                if (this.condaRunWorkerPool === undefined) {
                    // Create a separate queue for validation using conda, so getting environment info for
                    // other types of environment aren't blocked on conda.
                    this.condaRunWorkerPool = createRunningWorkerPool<
                        PythonEnvInfo,
                        InterpreterInformation | undefined
                    >(buildEnvironmentInfoUsingCondaRun);
                }
                r = await addToQueue(this.condaRunWorkerPool, env, priority).catch((err) => {
                    traceError(err);
                    return undefined;
                });
            } else if (reason) {
                if (
                    reason.message.includes('Unknown option: -I') ||
                    reason.message.includes("ModuleNotFoundError: No module named 'encodings'")
                ) {
                    traceWarn(reason);
                    if (reason.message.includes('Unknown option: -I')) {
                        traceError(
                            'Support for Python 2.7 has been dropped by the Python extension so certain features may not work, upgrade to using Python 3.',
                        );
                    }
                    return buildEnvironmentInfo(env, false).catch((err) => {
                        traceError(err);
                        return undefined;
                    });
                }
                traceError(reason);
            }
        }
        if (r === undefined && retryOnce) {
            // Retry once, in case the environment was not fully populated. Also observed in CI:
            // https://github.com/microsoft/vscode-python/issues/20147 where running environment the first time
            // failed due to unknown reasons.
            return sleep(2000).then(() => this._getEnvironmentInfo(env, priority, false));
        }
        return r;
    }

    public resetInfo(searchLocation: Uri): void {
        const searchLocationPath = searchLocation.fsPath;
        const keys = Array.from(this.cache.keys());
        keys.forEach((key) => {
            if (key.startsWith(normCasePath(searchLocationPath))) {
                this.cache.delete(key);
            }
        });
    }
}

function addToQueue(
    workerPool: IWorkerPool<PythonEnvInfo, InterpreterInformation | undefined>,
    env: PythonEnvInfo,
    priority: EnvironmentInfoServiceQueuePriority | undefined,
) {
    return priority === EnvironmentInfoServiceQueuePriority.High
        ? workerPool.addToQueue(env, QueuePosition.Front)
        : workerPool.addToQueue(env, QueuePosition.Back);
}

let envInfoService: IEnvironmentInfoService | undefined;
export function getEnvironmentInfoService(disposables?: IDisposableRegistry): IEnvironmentInfoService {
    if (envInfoService === undefined) {
        const service = new EnvironmentInfoService();
        disposables?.push({
            dispose: () => {
                service.dispose();
                envInfoService = undefined;
            },
        });
        envInfoService = service;
    }
    return envInfoService;
}
