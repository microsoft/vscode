// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CancellationToken, CancellationTokenSource, ProgressLocation, WorkspaceFolder } from 'vscode';
import * as path from 'path';
import { Commands, PVSC_EXTENSION_ID } from '../../../common/constants';
import { traceError, traceInfo, traceLog } from '../../../logging';
import { CreateEnvironmentProgress } from '../types';
import { pickWorkspaceFolder } from '../common/workspaceSelection';
import { execObservable } from '../../../common/process/rawProcessApis';
import { createDeferred } from '../../../common/utils/async';
import { getOSType, OSType } from '../../../common/utils/platform';
import { createCondaScript } from '../../../common/process/internal/scripts';
import { Common, CreateEnv } from '../../../common/utils/localize';
import {
    ExistingCondaAction,
    deleteEnvironment,
    getCondaBaseEnv,
    getPathEnvVariableForConda,
    pickExistingCondaAction,
    pickPythonVersion,
} from './condaUtils';
import { getPrefixCondaEnvPath, showErrorMessageWithLogs } from '../common/commonUtils';
import { MultiStepAction, MultiStepNode, withProgress } from '../../../common/vscodeApis/windowApis';
import { EventName } from '../../../telemetry/constants';
import { sendTelemetryEvent } from '../../../telemetry';
import {
    CondaProgressAndTelemetry,
    CONDA_ENV_CREATED_MARKER,
    CONDA_ENV_EXISTING_MARKER,
} from './condaProgressAndTelemetry';
import { splitLines } from '../../../common/stringUtils';
import {
    CreateEnvironmentOptions,
    CreateEnvironmentResult,
    CreateEnvironmentProvider,
} from '../proposed.createEnvApis';
import { shouldDisplayEnvCreationProgress } from './hideEnvCreation';
import { noop } from '../../../common/utils/misc';

function generateCommandArgs(version?: string, options?: CreateEnvironmentOptions): string[] {
    let addGitIgnore = true;
    let installPackages = true;
    if (options) {
        addGitIgnore = options?.ignoreSourceControl !== undefined ? options.ignoreSourceControl : true;
        installPackages = options?.installPackages !== undefined ? options.installPackages : true;
    }

    const command: string[] = [createCondaScript()];

    if (addGitIgnore) {
        command.push('--git-ignore');
    }

    if (installPackages) {
        command.push('--install');
    }

    if (version) {
        command.push('--python');
        command.push(version);
    }

    return command;
}

function getCondaEnvFromOutput(output: string): string | undefined {
    try {
        const envPath = output
            .split(/\r?\n/g)
            .map((s) => s.trim())
            .filter((s) => s.startsWith(CONDA_ENV_CREATED_MARKER) || s.startsWith(CONDA_ENV_EXISTING_MARKER))[0];
        if (envPath.includes(CONDA_ENV_CREATED_MARKER)) {
            return envPath.substring(CONDA_ENV_CREATED_MARKER.length);
        }
        return envPath.substring(CONDA_ENV_EXISTING_MARKER.length);
    } catch (ex) {
        traceError('Parsing out environment path failed.');
        return undefined;
    }
}

async function createCondaEnv(
    workspace: WorkspaceFolder,
    command: string,
    args: string[],
    progress: CreateEnvironmentProgress,
    token?: CancellationToken,
): Promise<string> {
    progress.report({
        message: CreateEnv.Conda.creating,
    });

    const deferred = createDeferred<string>();
    const pathEnv = getPathEnvVariableForConda(command);
    traceLog('Running Conda Env creation script: ', [command, ...args]);
    const { proc, out, dispose } = execObservable(command, args, {
        mergeStdOutErr: true,
        token,
        cwd: workspace.uri.fsPath,
        env: {
            PATH: pathEnv,
        },
    });

    const progressAndTelemetry = new CondaProgressAndTelemetry(progress);
    let condaEnvPath: string | undefined;
    out.subscribe(
        (value) => {
            const output = splitLines(value.out).join('\r\n');
            traceLog(output.trimEnd());
            if (output.includes(CONDA_ENV_CREATED_MARKER) || output.includes(CONDA_ENV_EXISTING_MARKER)) {
                condaEnvPath = getCondaEnvFromOutput(output);
            }
            progressAndTelemetry.process(output);
        },
        async (error) => {
            traceError('Error while running conda env creation script: ', error);
            deferred.reject(error);
        },
        () => {
            dispose();
            if (proc?.exitCode !== 0) {
                traceError('Error while running venv creation script: ', progressAndTelemetry.getLastError());
                deferred.reject(
                    progressAndTelemetry.getLastError() || `Conda env creation failed with exitCode: ${proc?.exitCode}`,
                );
            } else {
                deferred.resolve(condaEnvPath);
            }
        },
    );
    return deferred.promise;
}

function getExecutableCommand(condaBaseEnvPath: string): string {
    if (getOSType() === OSType.Windows) {
        // Both Miniconda3 and Anaconda3 have the following structure:
        // Miniconda3 (or Anaconda3)
        //  |- python.exe     <--- this is the python that we want.
        return path.join(condaBaseEnvPath, 'python.exe');
    }
    // On non-windows machines:
    // miniconda (or miniforge or anaconda3)
    // |- bin
    //     |- python   <--- this is the python that we want.
    return path.join(condaBaseEnvPath, 'bin', 'python');
}

async function createEnvironment(options?: CreateEnvironmentOptions): Promise<CreateEnvironmentResult | undefined> {
    const conda = await getCondaBaseEnv();
    if (!conda) {
        return undefined;
    }

    let workspace: WorkspaceFolder | undefined;
    const workspaceStep = new MultiStepNode(
        undefined,
        async (context?: MultiStepAction) => {
            try {
                workspace = (await pickWorkspaceFolder(undefined, context)) as WorkspaceFolder | undefined;
            } catch (ex) {
                if (ex === MultiStepAction.Back || ex === MultiStepAction.Cancel) {
                    return ex;
                }
                throw ex;
            }

            if (workspace === undefined) {
                traceError('Workspace was not selected or found for creating conda environment.');
                return MultiStepAction.Cancel;
            }
            traceInfo(`Selected workspace ${workspace.uri.fsPath} for creating conda environment.`);
            return MultiStepAction.Continue;
        },
        undefined,
    );

    let existingCondaAction: ExistingCondaAction | undefined;
    const existingEnvStep = new MultiStepNode(
        workspaceStep,
        async (context?: MultiStepAction) => {
            if (workspace && context === MultiStepAction.Continue) {
                try {
                    existingCondaAction = await pickExistingCondaAction(workspace);
                    return MultiStepAction.Continue;
                } catch (ex) {
                    if (ex === MultiStepAction.Back || ex === MultiStepAction.Cancel) {
                        return ex;
                    }
                    throw ex;
                }
            } else if (context === MultiStepAction.Back) {
                return MultiStepAction.Back;
            }
            return MultiStepAction.Continue;
        },
        undefined,
    );
    workspaceStep.next = existingEnvStep;

    let version: string | undefined;
    const versionStep = new MultiStepNode(
        workspaceStep,
        async (context) => {
            if (
                existingCondaAction === ExistingCondaAction.Recreate ||
                existingCondaAction === ExistingCondaAction.Create
            ) {
                try {
                    version = await pickPythonVersion();
                } catch (ex) {
                    if (ex === MultiStepAction.Back || ex === MultiStepAction.Cancel) {
                        return ex;
                    }
                    throw ex;
                }
                if (version === undefined) {
                    traceError('Python version was not selected for creating conda environment.');
                    return MultiStepAction.Cancel;
                }
                traceInfo(`Selected Python version ${version} for creating conda environment.`);
            } else if (existingCondaAction === ExistingCondaAction.UseExisting) {
                if (context === MultiStepAction.Back) {
                    return MultiStepAction.Back;
                }
            }

            return MultiStepAction.Continue;
        },
        undefined,
    );
    existingEnvStep.next = versionStep;

    const action = await MultiStepNode.run(workspaceStep);
    if (action === MultiStepAction.Back || action === MultiStepAction.Cancel) {
        throw action;
    }

    if (workspace) {
        if (existingCondaAction === ExistingCondaAction.Recreate) {
            sendTelemetryEvent(EventName.ENVIRONMENT_DELETE, undefined, {
                environmentType: 'conda',
                status: 'triggered',
            });
            if (await deleteEnvironment(workspace, getExecutableCommand(conda))) {
                sendTelemetryEvent(EventName.ENVIRONMENT_DELETE, undefined, {
                    environmentType: 'conda',
                    status: 'deleted',
                });
            } else {
                sendTelemetryEvent(EventName.ENVIRONMENT_DELETE, undefined, {
                    environmentType: 'conda',
                    status: 'failed',
                });
                throw MultiStepAction.Cancel;
            }
        } else if (existingCondaAction === ExistingCondaAction.UseExisting) {
            sendTelemetryEvent(EventName.ENVIRONMENT_REUSE, undefined, {
                environmentType: 'conda',
            });
            return { path: getPrefixCondaEnvPath(workspace), workspaceFolder: workspace };
        }
    }

    const createEnvInternal = async (progress: CreateEnvironmentProgress, token: CancellationToken) => {
        progress.report({
            message: CreateEnv.statusStarting,
        });

        let envPath: string | undefined;
        try {
            sendTelemetryEvent(EventName.ENVIRONMENT_CREATING, undefined, {
                environmentType: 'conda',
                pythonVersion: version,
            });
            if (workspace) {
                envPath = await createCondaEnv(
                    workspace,
                    getExecutableCommand(conda),
                    generateCommandArgs(version, options),
                    progress,
                    token,
                );

                if (envPath) {
                    return { path: envPath, workspaceFolder: workspace };
                }

                throw new Error('Failed to create conda environment. See Output > Python for more info.');
            } else {
                throw new Error('A workspace is needed to create conda environment');
            }
        } catch (ex) {
            traceError(ex);
            showErrorMessageWithLogs(CreateEnv.Conda.errorCreatingEnvironment);
            return { error: ex as Error };
        }
    };

    if (!shouldDisplayEnvCreationProgress()) {
        const token = new CancellationTokenSource();
        try {
            return await createEnvInternal({ report: noop }, token.token);
        } finally {
            token.dispose();
        }
    }

    return withProgress(
        {
            location: ProgressLocation.Notification,
            title: `${CreateEnv.statusTitle} ([${Common.showLogs}](command:${Commands.ViewOutput}))`,
            cancellable: true,
        },
        async (
            progress: CreateEnvironmentProgress,
            token: CancellationToken,
        ): Promise<CreateEnvironmentResult | undefined> => createEnvInternal(progress, token),
    );
}

export const CONDA_PROVIDER_ID = `${PVSC_EXTENSION_ID}:conda`;

export function condaCreationProvider(): CreateEnvironmentProvider {
    return {
        createEnvironment,
        name: 'Conda',

        description: CreateEnv.Conda.providerDescription,

        // --- Start Erdos ---
        id: CONDA_PROVIDER_ID,
        // --- End Erdos ---

        tools: ['Conda'],
    };
}
