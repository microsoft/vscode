// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { CancellationTokenSource, DebugSessionOptions, TestRun, TestRunProfileKind, Uri } from 'vscode';
import { ChildProcess } from 'child_process';
import { IConfigurationService } from '../../../common/types';
import { Deferred, createDeferred } from '../../../common/utils/async';
import { EXTENSION_ROOT_DIR } from '../../../constants';
import {
    ExecutionTestPayload,
    ITestExecutionAdapter,
    ITestResultResolver,
    TestCommandOptions,
    TestExecutionCommand,
} from '../common/types';
import { traceError, traceInfo, traceLog, traceVerbose } from '../../../logging';
import { fixLogLinesNoTrailing } from '../common/utils';
import { EnvironmentVariables, IEnvironmentVariablesProvider } from '../../../common/variables/types';
import {
    ExecutionFactoryCreateWithEnvironmentOptions,
    ExecutionResult,
    IPythonExecutionFactory,
    SpawnOptions,
} from '../../../common/process/types';
import { ITestDebugLauncher, LaunchOptions } from '../../common/types';
import { UNITTEST_PROVIDER } from '../../common/constants';
import * as utils from '../common/utils';
import { getEnvironment, runInBackground, useEnvExtension } from '../../../envExt/api.internal';

/**
 * Wrapper Class for unittest test execution. This is where we call `runTestCommand`?
 */

export class UnittestTestExecutionAdapter implements ITestExecutionAdapter {
    constructor(
        public configSettings: IConfigurationService,
        private readonly resultResolver?: ITestResultResolver,
        private readonly envVarsService?: IEnvironmentVariablesProvider,
    ) {}

    public async runTests(
        uri: Uri,
        testIds: string[],
        profileKind?: TestRunProfileKind,
        runInstance?: TestRun,
        executionFactory?: IPythonExecutionFactory,
        debugLauncher?: ITestDebugLauncher,
    ): Promise<void> {
        // deferredTillServerClose awaits named pipe server close
        const deferredTillServerClose: Deferred<void> = utils.createTestingDeferred();

        // create callback to handle data received on the named pipe
        const dataReceivedCallback = (data: ExecutionTestPayload) => {
            if (runInstance && !runInstance.token.isCancellationRequested) {
                this.resultResolver?.resolveExecution(data, runInstance);
            } else {
                traceError(`No run instance found, cannot resolve execution, for workspace ${uri.fsPath}.`);
            }
        };
        const cSource = new CancellationTokenSource();
        runInstance?.token.onCancellationRequested(() => cSource.cancel());
        const name = await utils.startRunResultNamedPipe(
            dataReceivedCallback, // callback to handle data received
            deferredTillServerClose, // deferred to resolve when server closes
            cSource.token, // token to cancel
        );
        runInstance?.token.onCancellationRequested(() => {
            console.log(`Test run cancelled, resolving 'till TillAllServerClose' deferred for ${uri.fsPath}.`);
            // if canceled, stop listening for results
            deferredTillServerClose.resolve();
        });
        try {
            await this.runTestsNew(
                uri,
                testIds,
                name,
                cSource,
                runInstance,
                profileKind,
                executionFactory,
                debugLauncher,
            );
        } catch (error) {
            traceError(`Error in running unittest tests: ${error}`);
        } finally {
            await deferredTillServerClose.promise;
        }
    }

    private async runTestsNew(
        uri: Uri,
        testIds: string[],
        resultNamedPipeName: string,
        serverCancel: CancellationTokenSource,
        runInstance?: TestRun,
        profileKind?: TestRunProfileKind,
        executionFactory?: IPythonExecutionFactory,
        debugLauncher?: ITestDebugLauncher,
    ): Promise<ExecutionTestPayload> {
        const settings = this.configSettings.getSettings(uri);
        const { unittestArgs } = settings.testing;
        const cwd = settings.testing.cwd && settings.testing.cwd.length > 0 ? settings.testing.cwd : uri.fsPath;

        const command = buildExecutionCommand(unittestArgs);
        let mutableEnv: EnvironmentVariables | undefined = await this.envVarsService?.getEnvironmentVariables(uri);
        if (mutableEnv === undefined) {
            mutableEnv = {} as EnvironmentVariables;
        }
        const pythonPathParts: string[] = mutableEnv.PYTHONPATH?.split(path.delimiter) ?? [];
        const pythonPathCommand = [cwd, ...pythonPathParts].join(path.delimiter);
        mutableEnv.PYTHONPATH = pythonPathCommand;
        mutableEnv.TEST_RUN_PIPE = resultNamedPipeName;
        if (profileKind && profileKind === TestRunProfileKind.Coverage) {
            mutableEnv.COVERAGE_ENABLED = cwd;
        }

        const options: TestCommandOptions = {
            workspaceFolder: uri,
            command,
            cwd,
            profileKind,
            testIds,
            token: runInstance?.token,
        };
        traceLog(`Running UNITTEST execution for the following test ids: ${testIds}`);

        // create named pipe server to send test ids
        const testIdsFileName = await utils.writeTestIdsFile(testIds);
        mutableEnv.RUN_TEST_IDS_PIPE = testIdsFileName;
        traceInfo(
            `All environment variables set for unittest execution, PYTHONPATH: ${JSON.stringify(
                mutableEnv.PYTHONPATH,
            )}`,
        );

        const spawnOptions: SpawnOptions = {
            token: options.token,
            cwd: options.cwd,
            throwOnStdErr: true,
            env: mutableEnv,
        };
        // Create the Python environment in which to execute the command.
        const creationOptions: ExecutionFactoryCreateWithEnvironmentOptions = {
            allowEnvironmentFetchExceptions: false,
            resource: options.workspaceFolder,
        };
        const execService = await executionFactory?.createActivatedEnvironment(creationOptions);

        const execInfo = await execService?.getExecutablePath();
        traceVerbose(`Executable path for unittest execution: ${execInfo}.`);

        const args = [options.command.script].concat(options.command.args);

        if (options.outChannel) {
            options.outChannel.appendLine(`python ${args.join(' ')}`);
        }

        try {
            if (options.profileKind && options.profileKind === TestRunProfileKind.Debug) {
                const launchOptions: LaunchOptions = {
                    cwd: options.cwd,
                    args,
                    token: options.token,
                    testProvider: UNITTEST_PROVIDER,
                    runTestIdsPort: testIdsFileName,
                    pytestPort: resultNamedPipeName, // change this from pytest
                };
                const sessionOptions: DebugSessionOptions = {
                    testRun: runInstance,
                };
                traceInfo(`Running DEBUG unittest for workspace ${options.cwd} with arguments: ${args}\r\n`);

                if (debugLauncher === undefined) {
                    traceError('Debug launcher is not defined');
                    throw new Error('Debug launcher is not defined');
                }
                await debugLauncher.launchDebugger(
                    launchOptions,
                    () => {
                        serverCancel.cancel();
                    },
                    sessionOptions,
                );
            } else if (useEnvExtension()) {
                const pythonEnv = await getEnvironment(uri);
                if (pythonEnv) {
                    traceInfo(`Running unittest with arguments: ${args.join(' ')} for workspace ${uri.fsPath} \r\n`);
                    const deferredTillExecClose = createDeferred();

                    const proc = await runInBackground(pythonEnv, {
                        cwd,
                        args,
                        env: (mutableEnv as unknown) as { [key: string]: string },
                    });
                    runInstance?.token.onCancellationRequested(() => {
                        traceInfo(`Test run cancelled, killing unittest subprocess for workspace ${uri.fsPath}`);
                        proc.kill();
                        deferredTillExecClose.resolve();
                        serverCancel.cancel();
                    });
                    proc.stdout.on('data', (data) => {
                        const out = utils.fixLogLinesNoTrailing(data.toString());
                        runInstance?.appendOutput(out);
                    });
                    proc.stderr.on('data', (data) => {
                        const out = utils.fixLogLinesNoTrailing(data.toString());
                        runInstance?.appendOutput(out);
                    });
                    proc.onExit((code, signal) => {
                        if (code !== 0) {
                            traceError(
                                `Subprocess exited unsuccessfully with exit code ${code} and signal ${signal} on workspace ${uri.fsPath}`,
                            );
                        }
                        deferredTillExecClose.resolve();
                        serverCancel.cancel();
                    });
                    await deferredTillExecClose.promise;
                } else {
                    traceError(`Python Environment not found for: ${uri.fsPath}`);
                }
            } else {
                // This means it is running the test
                traceInfo(`Running unittests for workspace ${cwd} with arguments: ${args}\r\n`);

                const deferredTillExecClose = createDeferred<ExecutionResult<string>>();

                let resultProc: ChildProcess | undefined;

                runInstance?.token.onCancellationRequested(() => {
                    traceInfo(`Test run cancelled, killing unittest subprocess for workspace ${cwd}.`);
                    // if the resultProc exists just call kill on it which will handle resolving the ExecClose deferred, otherwise resolve the deferred here.
                    if (resultProc) {
                        resultProc?.kill();
                    } else {
                        deferredTillExecClose?.resolve();
                        serverCancel.cancel();
                    }
                });

                const result = execService?.execObservable(args, spawnOptions);
                resultProc = result?.proc;

                // Displays output to user and ensure the subprocess doesn't run into buffer overflow.

                result?.proc?.stdout?.on('data', (data) => {
                    const out = fixLogLinesNoTrailing(data.toString());
                    runInstance?.appendOutput(`${out}`);
                });
                result?.proc?.stderr?.on('data', (data) => {
                    const out = fixLogLinesNoTrailing(data.toString());
                    runInstance?.appendOutput(`${out}`);
                });

                result?.proc?.on('exit', (code, signal) => {
                    // if the child has testIds then this is a run request
                    if (code !== 0 && testIds) {
                        // This occurs when we are running the test and there is an error which occurs.

                        traceError(
                            `Subprocess exited unsuccessfully with exit code ${code} and signal ${signal} for workspace ${options.cwd}. Creating and sending error execution payload \n`,
                        );
                        if (runInstance) {
                            this.resultResolver?.resolveExecution(
                                utils.createExecutionErrorPayload(code, signal, testIds, cwd),
                                runInstance,
                            );
                        }
                    }
                    deferredTillExecClose.resolve();
                    serverCancel.cancel();
                });
                await deferredTillExecClose.promise;
            }
        } catch (ex) {
            traceError(`Error while running tests for workspace ${uri}: ${testIds}\r\n${ex}\r\n\r\n`);
            return Promise.reject(ex);
        }
        // placeholder until after the rewrite is adopted
        // TODO: remove after adoption.
        const executionPayload: ExecutionTestPayload = {
            cwd,
            status: 'success',
            error: '',
        };
        return executionPayload;
    }
}

function buildExecutionCommand(args: string[]): TestExecutionCommand {
    const executionScript = path.join(EXTENSION_ROOT_DIR, 'python_files', 'unittestadapter', 'execution.py');

    return {
        script: executionScript,
        args: ['--udiscovery', ...args],
    };
}
