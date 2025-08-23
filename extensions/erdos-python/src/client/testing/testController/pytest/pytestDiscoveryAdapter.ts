// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as path from 'path';
import { CancellationToken, CancellationTokenSource, Uri } from 'vscode';
import * as fs from 'fs';
import { ChildProcess } from 'child_process';
import {
    ExecutionFactoryCreateWithEnvironmentOptions,
    IPythonExecutionFactory,
    SpawnOptions,
} from '../../../common/process/types';
import { IConfigurationService } from '../../../common/types';
import { createDeferred, Deferred } from '../../../common/utils/async';
import { EXTENSION_ROOT_DIR } from '../../../constants';
import { traceError, traceInfo, traceVerbose, traceWarn } from '../../../logging';
import { DiscoveredTestPayload, ITestDiscoveryAdapter, ITestResultResolver } from '../common/types';
import {
    createDiscoveryErrorPayload,
    createTestingDeferred,
    fixLogLinesNoTrailing,
    startDiscoveryNamedPipe,
    addValueIfKeyNotExist,
    hasSymlinkParent,
} from '../common/utils';
import { IEnvironmentVariablesProvider } from '../../../common/variables/types';
import { PythonEnvironment } from '../../../pythonEnvironments/info';
import { useEnvExtension, getEnvironment, runInBackground } from '../../../envExt/api.internal';

/**
 * Wrapper class for unittest test discovery. This is where we call `runTestCommand`. #this seems incorrectly copied
 */
export class PytestTestDiscoveryAdapter implements ITestDiscoveryAdapter {
    constructor(
        public configSettings: IConfigurationService,
        private readonly resultResolver?: ITestResultResolver,
        private readonly envVarsService?: IEnvironmentVariablesProvider,
    ) {}

    async discoverTests(
        uri: Uri,
        executionFactory?: IPythonExecutionFactory,
        token?: CancellationToken,
        interpreter?: PythonEnvironment,
    ): Promise<void> {
        const cSource = new CancellationTokenSource();
        const deferredReturn = createDeferred<void>();

        token?.onCancellationRequested(() => {
            traceInfo(`Test discovery cancelled.`);
            cSource.cancel();
            deferredReturn.resolve();
        });

        const name = await startDiscoveryNamedPipe((data: DiscoveredTestPayload) => {
            // if the token is cancelled, we don't want process the data
            if (!token?.isCancellationRequested) {
                this.resultResolver?.resolveDiscovery(data);
            }
        }, cSource.token);

        this.runPytestDiscovery(uri, name, cSource, executionFactory, interpreter, token).then(() => {
            deferredReturn.resolve();
        });

        return deferredReturn.promise;
    }

    async runPytestDiscovery(
        uri: Uri,
        discoveryPipeName: string,
        cSource: CancellationTokenSource,
        executionFactory?: IPythonExecutionFactory,
        interpreter?: PythonEnvironment,
        token?: CancellationToken,
    ): Promise<void> {
        const relativePathToPytest = 'python_files';
        const fullPluginPath = path.join(EXTENSION_ROOT_DIR, relativePathToPytest);
        const settings = this.configSettings.getSettings(uri);
        let { pytestArgs } = settings.testing;
        const cwd = settings.testing.cwd && settings.testing.cwd.length > 0 ? settings.testing.cwd : uri.fsPath;

        // check for symbolic path
        const stats = await fs.promises.lstat(cwd);
        const resolvedPath = await fs.promises.realpath(cwd);
        let isSymbolicLink = false;
        if (stats.isSymbolicLink()) {
            isSymbolicLink = true;
            traceWarn('The cwd is a symbolic link.');
        } else if (resolvedPath !== cwd) {
            traceWarn(
                'The cwd resolves to a different path, checking if it has a symbolic link somewhere in its path.',
            );
            isSymbolicLink = await hasSymlinkParent(cwd);
        }
        if (isSymbolicLink) {
            traceWarn("Symlink found, adding '--rootdir' to pytestArgs only if it doesn't already exist. cwd: ", cwd);
            pytestArgs = addValueIfKeyNotExist(pytestArgs, '--rootdir', cwd);
        }
        // if user has provided `--rootdir` then use that, otherwise add `cwd`
        // root dir is required so pytest can find the relative paths and for symlinks
        addValueIfKeyNotExist(pytestArgs, '--rootdir', cwd);

        // get and edit env vars
        const mutableEnv = {
            ...(await this.envVarsService?.getEnvironmentVariables(uri)),
        };
        // get python path from mutable env, it contains process.env as well
        const pythonPathParts: string[] = mutableEnv.PYTHONPATH?.split(path.delimiter) ?? [];
        const pythonPathCommand = [fullPluginPath, ...pythonPathParts].join(path.delimiter);
        mutableEnv.PYTHONPATH = pythonPathCommand;
        mutableEnv.TEST_RUN_PIPE = discoveryPipeName;
        traceInfo(
            `Environment variables set for pytest discovery: PYTHONPATH=${mutableEnv.PYTHONPATH}, TEST_RUN_PIPE=${mutableEnv.TEST_RUN_PIPE}`,
        );

        // delete UUID following entire discovery finishing.
        const execArgs = ['-m', 'pytest', '-p', 'vscode_pytest', '--collect-only'].concat(pytestArgs);
        traceVerbose(`Running pytest discovery with command: ${execArgs.join(' ')} for workspace ${uri.fsPath}.`);

        if (useEnvExtension()) {
            const pythonEnv = await getEnvironment(uri);
            if (pythonEnv) {
                const deferredTillExecClose: Deferred<void> = createTestingDeferred();

                const proc = await runInBackground(pythonEnv, {
                    cwd,
                    args: execArgs,
                    env: (mutableEnv as unknown) as { [key: string]: string },
                });
                token?.onCancellationRequested(() => {
                    traceInfo(`Test discovery cancelled, killing pytest subprocess for workspace ${uri.fsPath}`);
                    proc.kill();
                    deferredTillExecClose.resolve();
                    cSource.cancel();
                });
                proc.stdout.on('data', (data) => {
                    const out = fixLogLinesNoTrailing(data.toString());
                    traceInfo(out);
                });
                proc.stderr.on('data', (data) => {
                    const out = fixLogLinesNoTrailing(data.toString());
                    traceError(out);
                });
                proc.onExit((code, signal) => {
                    if (code !== 0) {
                        traceError(
                            `Subprocess exited unsuccessfully with exit code ${code} and signal ${signal} on workspace ${uri.fsPath}`,
                        );
                        this.resultResolver?.resolveDiscovery(createDiscoveryErrorPayload(code, signal, cwd));
                    }
                    deferredTillExecClose.resolve();
                });
                await deferredTillExecClose.promise;
            } else {
                traceError(`Python Environment not found for: ${uri.fsPath}`);
            }
            return;
        }

        const spawnOptions: SpawnOptions = {
            cwd,
            throwOnStdErr: true,
            env: mutableEnv,
            token,
        };

        // Create the Python environment in which to execute the command.
        const creationOptions: ExecutionFactoryCreateWithEnvironmentOptions = {
            allowEnvironmentFetchExceptions: false,
            resource: uri,
            interpreter,
        };
        const execService = await executionFactory?.createActivatedEnvironment(creationOptions);

        const execInfo = await execService?.getExecutablePath();
        traceVerbose(`Executable path for pytest discovery: ${execInfo}.`);

        const deferredTillExecClose: Deferred<void> = createTestingDeferred();

        let resultProc: ChildProcess | undefined;

        token?.onCancellationRequested(() => {
            traceInfo(`Test discovery cancelled, killing pytest subprocess for workspace ${uri.fsPath}`);
            // if the resultProc exists just call kill on it which will handle resolving the ExecClose deferred, otherwise resolve the deferred here.
            if (resultProc) {
                resultProc?.kill();
            } else {
                deferredTillExecClose.resolve();
                cSource.cancel();
            }
        });
        const result = execService?.execObservable(execArgs, spawnOptions);
        resultProc = result?.proc;

        // Take all output from the subprocess and add it to the test output channel. This will be the pytest output.
        // Displays output to user and ensure the subprocess doesn't run into buffer overflow.

        result?.proc?.stdout?.on('data', (data) => {
            const out = fixLogLinesNoTrailing(data.toString());
            traceInfo(out);
        });
        result?.proc?.stderr?.on('data', (data) => {
            const out = fixLogLinesNoTrailing(data.toString());
            traceError(out);
        });
        result?.proc?.on('exit', (code, signal) => {
            if (code !== 0) {
                traceError(
                    `Subprocess exited unsuccessfully with exit code ${code} and signal ${signal} on workspace ${uri.fsPath}.`,
                );
            }
        });
        result?.proc?.on('close', (code, signal) => {
            // pytest exits with code of 5 when 0 tests are found- this is not a failure for discovery.
            if (code !== 0 && code !== 5) {
                traceError(
                    `Subprocess exited unsuccessfully with exit code ${code} and signal ${signal} on workspace ${uri.fsPath}. Creating and sending error discovery payload`,
                );
                this.resultResolver?.resolveDiscovery(createDiscoveryErrorPayload(code, signal, cwd));
            }
            // due to the sync reading of the output.
            deferredTillExecClose?.resolve();
        });
        await deferredTillExecClose.promise;
    }
}
