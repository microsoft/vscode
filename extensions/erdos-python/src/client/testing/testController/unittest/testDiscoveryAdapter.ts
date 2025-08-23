// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { CancellationTokenSource, Uri } from 'vscode';
import { CancellationToken } from 'vscode-jsonrpc';
import { ChildProcess } from 'child_process';
import { IConfigurationService } from '../../../common/types';
import { EXTENSION_ROOT_DIR } from '../../../constants';
import {
    DiscoveredTestPayload,
    ITestDiscoveryAdapter,
    ITestResultResolver,
    TestCommandOptions,
    TestDiscoveryCommand,
} from '../common/types';
import { createDeferred } from '../../../common/utils/async';
import { EnvironmentVariables, IEnvironmentVariablesProvider } from '../../../common/variables/types';
import {
    ExecutionFactoryCreateWithEnvironmentOptions,
    ExecutionResult,
    IPythonExecutionFactory,
    SpawnOptions,
} from '../../../common/process/types';
import { createDiscoveryErrorPayload, fixLogLinesNoTrailing, startDiscoveryNamedPipe } from '../common/utils';
import { traceError, traceInfo, traceLog, traceVerbose } from '../../../logging';
import { getEnvironment, runInBackground, useEnvExtension } from '../../../envExt/api.internal';

/**
 * Wrapper class for unittest test discovery. This is where we call `runTestCommand`.
 */
export class UnittestTestDiscoveryAdapter implements ITestDiscoveryAdapter {
    constructor(
        public configSettings: IConfigurationService,
        private readonly resultResolver?: ITestResultResolver,
        private readonly envVarsService?: IEnvironmentVariablesProvider,
    ) {}

    public async discoverTests(
        uri: Uri,
        executionFactory?: IPythonExecutionFactory,
        token?: CancellationToken,
    ): Promise<void> {
        const settings = this.configSettings.getSettings(uri);
        const { unittestArgs } = settings.testing;
        const cwd = settings.testing.cwd && settings.testing.cwd.length > 0 ? settings.testing.cwd : uri.fsPath;

        const cSource = new CancellationTokenSource();
        // Create a deferred to return to the caller
        const deferredReturn = createDeferred<void>();

        token?.onCancellationRequested(() => {
            traceInfo(`Test discovery cancelled.`);
            cSource.cancel();
            deferredReturn.resolve();
        });

        const name = await startDiscoveryNamedPipe((data: DiscoveredTestPayload) => {
            if (!token?.isCancellationRequested) {
                this.resultResolver?.resolveDiscovery(data);
            }
        }, cSource.token);

        // set up env with the pipe name
        let env: EnvironmentVariables | undefined = await this.envVarsService?.getEnvironmentVariables(uri);
        if (env === undefined) {
            env = {} as EnvironmentVariables;
        }
        env.TEST_RUN_PIPE = name;

        const command = buildDiscoveryCommand(unittestArgs);
        const options: TestCommandOptions = {
            workspaceFolder: uri,
            command,
            cwd,
            token,
        };

        this.runDiscovery(uri, options, name, cwd, cSource, executionFactory).then(() => {
            deferredReturn.resolve();
        });

        return deferredReturn.promise;
    }

    async runDiscovery(
        uri: Uri,
        options: TestCommandOptions,
        testRunPipeName: string,
        cwd: string,
        cSource: CancellationTokenSource,
        executionFactory?: IPythonExecutionFactory,
    ): Promise<void> {
        // get and edit env vars
        const mutableEnv = {
            ...(await this.envVarsService?.getEnvironmentVariables(uri)),
        };
        mutableEnv.TEST_RUN_PIPE = testRunPipeName;
        const args = [options.command.script].concat(options.command.args);

        if (options.outChannel) {
            options.outChannel.appendLine(`python ${args.join(' ')}`);
        }

        if (useEnvExtension()) {
            const pythonEnv = await getEnvironment(uri);
            if (pythonEnv) {
                const deferredTillExecClose = createDeferred();

                const proc = await runInBackground(pythonEnv, {
                    cwd,
                    args,
                    env: (mutableEnv as unknown) as { [key: string]: string },
                });
                options.token?.onCancellationRequested(() => {
                    traceInfo(`Test discovery cancelled, killing unittest subprocess for workspace ${uri.fsPath}`);
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
            token: options.token,
            cwd: options.cwd,
            throwOnStdErr: true,
            env: mutableEnv,
        };

        try {
            traceLog(`Discovering unittest tests for workspace ${options.cwd} with arguments: ${args}\r\n`);
            const deferredTillExecClose = createDeferred<ExecutionResult<string>>();

            // Create the Python environment in which to execute the command.
            const creationOptions: ExecutionFactoryCreateWithEnvironmentOptions = {
                allowEnvironmentFetchExceptions: false,
                resource: options.workspaceFolder,
            };
            const execService = await executionFactory?.createActivatedEnvironment(creationOptions);
            const execInfo = await execService?.getExecutablePath();
            traceVerbose(`Executable path for unittest discovery: ${execInfo}.`);

            let resultProc: ChildProcess | undefined;
            options.token?.onCancellationRequested(() => {
                traceInfo(`Test discovery cancelled, killing unittest subprocess for workspace ${uri.fsPath}`);
                // if the resultProc exists just call kill on it which will handle resolving the ExecClose deferred, otherwise resolve the deferred here.
                if (resultProc) {
                    resultProc?.kill();
                } else {
                    deferredTillExecClose.resolve();
                    cSource.cancel();
                }
            });
            const result = execService?.execObservable(args, spawnOptions);
            resultProc = result?.proc;

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
                // if the child has testIds then this is a run request

                if (code !== 0) {
                    // This occurs when we are running discovery
                    traceError(
                        `Subprocess exited unsuccessfully with exit code ${code} and signal ${signal} on workspace ${options.cwd}. Creating and sending error discovery payload \n`,
                    );
                    traceError(
                        `Subprocess exited unsuccessfully with exit code ${code} and signal ${signal} on workspace ${uri.fsPath}. Creating and sending error discovery payload`,
                    );
                    this.resultResolver?.resolveDiscovery(createDiscoveryErrorPayload(code, signal, cwd));
                }
                deferredTillExecClose.resolve();
            });
            await deferredTillExecClose.promise;
        } catch (ex) {
            traceError(`Error while server attempting to run unittest command for workspace ${uri.fsPath}: ${ex}`);
        }
    }
}
function buildDiscoveryCommand(args: string[]): TestDiscoveryCommand {
    const discoveryScript = path.join(EXTENSION_ROOT_DIR, 'python_files', 'unittestadapter', 'discovery.py');

    return {
        script: discoveryScript,
        args: ['--udiscovery', ...args],
    };
}
