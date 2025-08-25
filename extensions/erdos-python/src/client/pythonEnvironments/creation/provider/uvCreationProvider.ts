/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { CancellationToken, ProgressLocation, WorkspaceFolder } from 'vscode';
import { Commands, PVSC_EXTENSION_ID } from '../../../common/constants';
import { execObservable } from '../../../common/process/rawProcessApis';
import { createDeferred } from '../../../common/utils/async';
import { Common, CreateEnv } from '../../../common/utils/localize';
import { traceError, traceInfo, traceLog } from '../../../logging';
import { CreateEnvironmentOptionsInternal, CreateEnvironmentProgress } from '../types';
import { pickWorkspaceFolder } from '../common/workspaceSelection';
import { MultiStepAction, MultiStepNode, withProgress } from '../../../common/vscodeApis/windowApis';
import { getVenvExecutable, showErdosErrorMessageWithLogs } from '../common/commonUtils';
import { ExistingVenvAction, deleteEnvironment, pickExistingVenvAction } from './venvUtils';
import {
    CreateEnvironmentProvider,
    CreateEnvironmentOptions,
    CreateEnvironmentResult,
} from '../proposed.createEnvApis';
import { isUvInstalled } from '../../common/environmentManagers/uv';
import { pickPythonVersion } from './uvUtils';

export const UV_PROVIDER_ID = `${PVSC_EXTENSION_ID}:uv`;

async function createUvVenv(
    workspace: WorkspaceFolder,
    version: string,
    progress: CreateEnvironmentProgress,
    token?: CancellationToken,
): Promise<string | undefined> {
    progress.report({
        message: CreateEnv.Venv.creating,
    });
    const command = 'uv';
    const argv = ['venv', '--no-project', '--seed', '-p', version];

    const deferred = createDeferred<string | undefined>();
    traceLog('Running uv venv creation script: ', [command, ...argv]);
    const { proc, out, dispose } = execObservable(command, argv, {
        mergeStdOutErr: true,
        token,
        cwd: workspace.uri.fsPath,
    });

    const venvPath = `${workspace.uri.fsPath}${
        os.platform() === 'win32' ? '\\.venv\\Scripts\\python.exe' : '/.venv/bin/python'
    }`;
    out.subscribe(
        (value) => {
            const output = value.out.split(/\r?\n/g).join(os.EOL);
            traceLog(output.trimEnd());
        },
        (error) => {
            traceError('Error while running venv creation script: ', error);
            deferred.reject(error);
        },
        () => {
            dispose();
            if (proc?.exitCode !== 0) {
                traceError('Error while running uv environment creation script');
                deferred.reject(`Failed to create virtual environment with exitCode: ${proc?.exitCode}`);
            } else {
                deferred.resolve(venvPath);
            }
        },
    );
    return deferred.promise;
}

export class UvCreationProvider implements CreateEnvironmentProvider {
    public async createEnvironment(
        options?: CreateEnvironmentOptions & CreateEnvironmentOptionsInternal,
    ): Promise<CreateEnvironmentResult | undefined> {
        const uvIsInstalled = await isUvInstalled();
        if (!uvIsInstalled) {
            traceError('uv is not installed');
            showErdosErrorMessageWithLogs(CreateEnv.Venv.errorCreatingEnvironment);
            return undefined;
        }

        let workspace: WorkspaceFolder | undefined;
        const workspaceStep = new MultiStepNode(
            undefined,
            async (context?: MultiStepAction) => {
                try {
                    workspace = (await pickWorkspaceFolder(
                        { preSelectedWorkspace: options?.workspaceFolder },
                        context,
                    )) as WorkspaceFolder | undefined;
                } catch (ex) {
                    if (ex === MultiStepAction.Back || ex === MultiStepAction.Cancel) {
                        return ex;
                    }
                    throw ex;
                }

                if (workspace === undefined) {
                    traceError('Workspace was not selected or found for creating uv environment.');
                    return MultiStepAction.Cancel;
                }
                traceInfo(`Selected workspace ${workspace.uri.fsPath} for creating uv environment.`);
                return MultiStepAction.Continue;
            },
            undefined,
        );

        let existingVenvAction: ExistingVenvAction | undefined;
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

        let version: string | undefined;
        const versionStep = new MultiStepNode(
            workspaceStep,
            async (context) => {
                if (existingVenvAction === ExistingVenvAction.Create && options?.uvPythonVersion) {
                    version = options.uvPythonVersion;
                } else if (
                    existingVenvAction === ExistingVenvAction.Recreate ||
                    existingVenvAction === ExistingVenvAction.Create
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
                        traceError('Python version was not selected for creating uv environment.');
                        return MultiStepAction.Cancel;
                    }
                    traceInfo(`Selected Python version ${version} for creating uv environment.`);
                } else if (existingVenvAction === ExistingVenvAction.UseExisting) {
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
            if (existingVenvAction === ExistingVenvAction.Recreate) {
                traceInfo(`Recreating existing virtual environment in ${workspace.uri.fsPath}`);
                if (await deleteEnvironment(workspace, undefined)) {
                    traceInfo(`Deleted existing virtual environment`);
                } else {
                    traceError(`Failed to delete existing virtual environment`);
                    throw MultiStepAction.Cancel;
                }
            } else if (existingVenvAction === ExistingVenvAction.UseExisting) {
                traceInfo(`Using existing virtual environment in ${workspace.uri.fsPath}`);
                return { path: getVenvExecutable(workspace), workspaceFolder: workspace };
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
            ): Promise<CreateEnvironmentResult | undefined> => {
                progress.report({
                    message: CreateEnv.statusStarting,
                });

                let envPath: string | undefined;
                try {
                    if (workspace && version) {
                        envPath = await createUvVenv(workspace, version, progress, token);
                        if (envPath) {
                            return { path: envPath, workspaceFolder: workspace };
                        }
                        throw new Error('Failed to create uv environment. See Output > Python for more info.');
                    }
                    throw new Error('A workspace and Python version are needed to create a uv environment');
                } catch (ex) {
                    traceError(ex);
                    showErdosErrorMessageWithLogs(CreateEnv.Venv.errorCreatingEnvironment);
                    return { error: ex as Error };
                }
            },
        );
    }

    name = 'uv';

    description: string = CreateEnv.Uv.providerDescription;

    id = UV_PROVIDER_ID;

    tools = ['uv'];
}