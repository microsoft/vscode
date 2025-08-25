// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as os from 'os';
import { CancellationToken, CancellationTokenSource, ProgressLocation, WorkspaceFolder } from 'vscode';
import { Commands, PVSC_EXTENSION_ID } from '../../../common/constants';
import { createVenvScript } from '../../../common/process/internal/scripts';
import { execObservable } from '../../../common/process/rawProcessApis';
import { createDeferred } from '../../../common/utils/async';
import { Common, CreateEnv } from '../../../common/utils/localize';
import { traceError, traceInfo, traceLog, traceVerbose } from '../../../logging';
import { CreateEnvironmentOptionsInternal, CreateEnvironmentProgress } from '../types';
import { pickWorkspaceFolder } from '../common/workspaceSelection';
import { IInterpreterQuickPick } from '../../../interpreter/configuration/types';
import { EnvironmentType, PythonEnvironment } from '../../info';
import { MultiStepAction, MultiStepNode, withProgress } from '../../../common/vscodeApis/windowApis';
import { sendTelemetryEvent } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { VenvProgressAndTelemetry, VENV_CREATED_MARKER, VENV_EXISTING_MARKER } from './venvProgressAndTelemetry';
import { getVenvExecutable, showErrorMessageWithLogs } from '../common/commonUtils';
import {
    ExistingVenvAction,
    IPackageInstallSelection,
    deleteEnvironment,
    pickExistingVenvAction,
    pickPackagesToInstall,
} from './venvUtils';
import { InputFlowAction } from '../../../common/utils/multiStepInput';
import {
    CreateEnvironmentProvider,
    CreateEnvironmentOptions,
    CreateEnvironmentResult,
} from '../proposed.createEnvApis';
import { shouldDisplayEnvCreationProgress } from './hideEnvCreation';
import { noop } from '../../../common/utils/misc';

interface IVenvCommandArgs {
    argv: string[];
    stdin: string | undefined;
}

function generateCommandArgs(installInfo?: IPackageInstallSelection[], addGitIgnore?: boolean): IVenvCommandArgs {
    const command: string[] = [createVenvScript()];
    let stdin: string | undefined;

    if (addGitIgnore) {
        command.push('--git-ignore');
    }

    if (installInfo) {
        if (installInfo.some((i) => i.installType === 'toml')) {
            const source = installInfo.find((i) => i.installType === 'toml')?.source;
            command.push('--toml', source?.fileToCommandArgumentForPythonExt() || 'pyproject.toml');
        }
        const extras = installInfo.filter((i) => i.installType === 'toml').map((i) => i.installItem);
        extras.forEach((r) => {
            if (r) {
                command.push('--extras', r);
            }
        });

        const requirements = installInfo.filter((i) => i.installType === 'requirements').map((i) => i.installItem);

        if (requirements.length < 10) {
            requirements.forEach((r) => {
                if (r) {
                    command.push('--requirements', r);
                }
            });
        } else {
            command.push('--stdin');
            // Too many requirements can cause the command line to be too long error.
            stdin = JSON.stringify({ requirements });
        }
    }

    return { argv: command, stdin };
}

function getVenvFromOutput(output: string): string | undefined {
    try {
        const envPath = output
            .split(/\r?\n/g)
            .map((s) => s.trim())
            .filter((s) => s.startsWith(VENV_CREATED_MARKER) || s.startsWith(VENV_EXISTING_MARKER))[0];
        if (envPath.includes(VENV_CREATED_MARKER)) {
            return envPath.substring(VENV_CREATED_MARKER.length);
        }
        return envPath.substring(VENV_EXISTING_MARKER.length);
    } catch (ex) {
        traceError('Parsing out environment path failed.');
        return undefined;
    }
}

async function createVenv(
    workspace: WorkspaceFolder,
    command: string,
    args: IVenvCommandArgs,
    progress: CreateEnvironmentProgress,
    token?: CancellationToken,
): Promise<string | undefined> {
    progress.report({
        message: CreateEnv.Venv.creating,
    });
    sendTelemetryEvent(EventName.ENVIRONMENT_CREATING, undefined, {
        environmentType: 'venv',
        pythonVersion: undefined,
    });

    const deferred = createDeferred<string | undefined>();
    traceLog('Running Env creation script: ', [command, ...args.argv]);
    if (args.stdin) {
        traceLog('Requirements passed in via stdin: ', args.stdin);
    }
    const { proc, out, dispose } = execObservable(command, args.argv, {
        mergeStdOutErr: true,
        token,
        cwd: workspace.uri.fsPath,
        stdinStr: args.stdin,
    });

    const progressAndTelemetry = new VenvProgressAndTelemetry(progress);
    let venvPath: string | undefined;
    out.subscribe(
        (value) => {
            const output = value.out.split(/\r?\n/g).join(os.EOL);
            traceLog(output.trimEnd());
            if (output.includes(VENV_CREATED_MARKER) || output.includes(VENV_EXISTING_MARKER)) {
                venvPath = getVenvFromOutput(output);
            }
            progressAndTelemetry.process(output);
        },
        (error) => {
            traceError('Error while running venv creation script: ', error);
            deferred.reject(error);
        },
        () => {
            dispose();
            if (proc?.exitCode !== 0) {
                traceError('Error while running venv creation script: ', progressAndTelemetry.getLastError());
                deferred.reject(
                    progressAndTelemetry.getLastError() ||
                        `Failed to create virtual environment with exitCode: ${proc?.exitCode}`,
                );
            } else {
                deferred.resolve(venvPath);
            }
        },
    );
    return deferred.promise;
}

export const VenvCreationProviderId = `${PVSC_EXTENSION_ID}:venv`;
export class VenvCreationProvider implements CreateEnvironmentProvider {
    constructor(private readonly interpreterQuickPick: IInterpreterQuickPick) {}

    public async createEnvironment(
        options?: CreateEnvironmentOptions & CreateEnvironmentOptionsInternal,
    ): Promise<CreateEnvironmentResult | undefined> {
        let workspace = options?.workspaceFolder;
        const bypassQuickPicks = options?.workspaceFolder && options.interpreter && options.providerId ? true : false;
        const workspaceStep = new MultiStepNode(
            undefined,
            async (context?: MultiStepAction) => {
                try {
                    workspace =
                        workspace && bypassQuickPicks
                            ? workspace
                            : ((await pickWorkspaceFolder(
                                  { preSelectedWorkspace: options?.workspaceFolder },
                                  context,
                              )) as WorkspaceFolder | undefined);
                } catch (ex) {
                    if (ex === MultiStepAction.Back || ex === MultiStepAction.Cancel) {
                        return ex;
                    }
                    throw ex;
                }

                if (workspace === undefined) {
                    traceError('Workspace was not selected or found for creating virtual environment.');
                    return MultiStepAction.Cancel;
                }
                traceInfo(`Selected workspace ${workspace.uri.fsPath} for creating virtual environment.`);
                return MultiStepAction.Continue;
            },
            undefined,
        );

        let existingVenvAction: ExistingVenvAction | undefined;
        if (bypassQuickPicks) {
            existingVenvAction = ExistingVenvAction.Create;
        }
        const existingEnvStep = new MultiStepNode(
            workspaceStep,
            async (context?: MultiStepAction) => {
                if (workspace && context === MultiStepAction.Continue) {
                    try {
                        existingVenvAction = await pickExistingVenvAction(workspace);
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

        let interpreter = options?.interpreter;
        const interpreterStep = new MultiStepNode(
            existingEnvStep,
            async (context?: MultiStepAction) => {
                if (workspace) {
                    if (existingVenvAction === ExistingVenvAction.Create && options?.interpreterPath) {
                        interpreter = options.interpreterPath;
                    } else if (
                        existingVenvAction === ExistingVenvAction.Recreate ||
                        existingVenvAction === ExistingVenvAction.Create
                    ) {
                        try {
                            interpreter =
                                interpreter && bypassQuickPicks
                                    ? interpreter
                                    : await this.interpreterQuickPick.getInterpreterViaQuickPick(
                                          workspace.uri,
                                          (i: PythonEnvironment) =>
                                              [
                                                  EnvironmentType.System,
                                                  EnvironmentType.MicrosoftStore,
                                                  EnvironmentType.Global,
                                                  EnvironmentType.Pyenv,
                                                  EnvironmentType.Custom,
                                              ].includes(i.envType) && i.type === undefined, // only global intepreters
                                          {
                                              skipRecommended: true,
                                              showBackButton: true,
                                              placeholder: CreateEnv.Venv.selectPythonPlaceHolder,
                                              title: null,
                                          },
                                      );
                        } catch (ex) {
                            if (ex === InputFlowAction.back) {
                                return MultiStepAction.Back;
                            }
                            interpreter = undefined;
                        }
                    } else if (existingVenvAction === ExistingVenvAction.UseExisting) {
                        if (context === MultiStepAction.Back) {
                            return MultiStepAction.Back;
                        }
                        interpreter = getVenvExecutable(workspace);
                    }
                }

                if (!interpreter) {
                    traceError('Virtual env creation requires an interpreter.');
                    return MultiStepAction.Cancel;
                }
                traceInfo(`Selected interpreter ${interpreter} for creating virtual environment.`);
                return MultiStepAction.Continue;
            },
            undefined,
        );
        existingEnvStep.next = interpreterStep;

        let addGitIgnore = true;
        let installPackages = true;
        if (options) {
            addGitIgnore = options?.ignoreSourceControl !== undefined ? options.ignoreSourceControl : true;
            installPackages = options?.installPackages !== undefined ? options.installPackages : true;
        }
        let installInfo: IPackageInstallSelection[] | undefined;
        const packagesStep = new MultiStepNode(
            interpreterStep,
            async (context?: MultiStepAction) => {
                if (workspace && installPackages) {
                    if (existingVenvAction !== ExistingVenvAction.UseExisting) {
                        try {
                            installInfo = await pickPackagesToInstall(workspace);
                        } catch (ex) {
                            if (ex === MultiStepAction.Back || ex === MultiStepAction.Cancel) {
                                return ex;
                            }
                            throw ex;
                        }
                        if (!installInfo) {
                            traceVerbose('Virtual env creation exited during dependencies selection.');
                            return MultiStepAction.Cancel;
                        }
                    } else if (context === MultiStepAction.Back) {
                        return MultiStepAction.Back;
                    }
                }

                return MultiStepAction.Continue;
            },
            undefined,
        );
        interpreterStep.next = packagesStep;

        const action = await MultiStepNode.run(workspaceStep);
        if (action === MultiStepAction.Back || action === MultiStepAction.Cancel) {
            throw action;
        }

        if (workspace) {
            if (existingVenvAction === ExistingVenvAction.Recreate) {
                sendTelemetryEvent(EventName.ENVIRONMENT_DELETE, undefined, {
                    environmentType: 'venv',
                    status: 'triggered',
                });
                if (await deleteEnvironment(workspace, interpreter)) {
                    sendTelemetryEvent(EventName.ENVIRONMENT_DELETE, undefined, {
                        environmentType: 'venv',
                        status: 'deleted',
                    });
                } else {
                    sendTelemetryEvent(EventName.ENVIRONMENT_DELETE, undefined, {
                        environmentType: 'venv',
                        status: 'failed',
                    });
                    throw MultiStepAction.Cancel;
                }
            } else if (existingVenvAction === ExistingVenvAction.UseExisting) {
                sendTelemetryEvent(EventName.ENVIRONMENT_REUSE, undefined, {
                    environmentType: 'venv',
                });
                return { path: getVenvExecutable(workspace), workspaceFolder: workspace };
            }
        }

        const args = generateCommandArgs(installInfo, addGitIgnore);
        const createEnvInternal = async (progress: CreateEnvironmentProgress, token: CancellationToken) => {
            progress.report({
                message: CreateEnv.statusStarting,
            });

            let envPath: string | undefined;
            try {
                if (interpreter && workspace) {
                    envPath = await createVenv(workspace, interpreter, args, progress, token);
                    if (envPath) {
                        return { path: envPath, workspaceFolder: workspace };
                    }
                    throw new Error('Failed to create virtual environment. See Output > Python for more info.');
                }
                throw new Error('Failed to create virtual environment. Either interpreter or workspace is undefined.');
            } catch (ex) {
                traceError(ex);
                showErrorMessageWithLogs(CreateEnv.Venv.errorCreatingEnvironment);
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

    name = 'Venv';

    description: string = CreateEnv.Venv.providerDescription;

    id = VenvCreationProviderId;

    tools = ['Venv'];
}
