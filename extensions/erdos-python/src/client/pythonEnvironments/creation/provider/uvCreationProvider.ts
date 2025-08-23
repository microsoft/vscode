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
    token: CancellationToken,
): Promise<CreateEnvironmentResult | undefined> {
    const workspaceUri = workspace.uri;
    const workspacePath = workspaceUri.fsPath;

    let venvExecutable = getVenvExecutable();
    if (!venvExecutable) {
        const executables = [
            'python',
            'python3',
            `python${version.substring(0, 3)}`,
            ...`${version}`.split('.').map((v, i, arr) => `python${arr.slice(0, i + 1).join('.')}`),
        ];
        if (os.platform() === 'win32') {
            venvExecutable = 'python';
        } else {
            venvExecutable = 'python3';
        }
    }

    progress.report({
        message: CreateEnv.statusStarting,
    });

    const command = 'uv';
    const args = ['venv', '--python', version, '--prompt', workspace.name];

    traceInfo(`Creating uv venv with args: ${args.join(' ')}`);
    const deferred = createDeferred<CreateEnvironmentResult>();
    
    let hasErrors = false;
    let stderr = '';
    let stdout = '';

    try {
        const result = execObservable(command, args, { cwd: workspacePath });

        result.out.subscribe({
            next: (output) => {
                traceLog('uv venv output:', output.out);
                if (output.source === 'stderr') {
                    stderr += output.out;
                    if (output.out.includes('error') || output.out.includes('Error')) {
                        hasErrors = true;
                    }
                } else {
                    stdout += output.out;
                }
            },
            error: (error) => {
                traceError('uv venv error:', error);
                hasErrors = true;
                deferred.resolve({ error });
            },
            complete: () => {
                if (hasErrors) {
                    traceError('uv venv completed with errors');
                    traceError(`stdout: ${stdout}`);
                    traceError(`stderr: ${stderr}`);
                    deferred.resolve({ error: new Error(`Failed to create uv venv: ${stderr}`) });
                } else {
                    traceInfo('uv venv completed successfully');
                    deferred.resolve({ path: workspacePath });
                }
            },
        });
    } catch (error) {
        traceError('Failed to execute uv venv command:', error);
        deferred.resolve({ error: error as Error });
    }

    return deferred.promise;
}

async function createEnvironment(
    options?: CreateEnvironmentOptions & CreateEnvironmentOptionsInternal,
): Promise<CreateEnvironmentResult | undefined> {
    let workspace: WorkspaceFolder | undefined;
    let version: string | undefined;

    if (options?.workspaceFolder && options?.uvPythonVersion) {
        workspace = options.workspaceFolder;
        version = options.uvPythonVersion;
    } else {
        workspace = await pickWorkspaceFolder();
        if (!workspace) {
            return undefined;
        }

        version = await pickPythonVersion();
        if (!version) {
            return undefined;
        }
    }

    return withProgress(
        {
            location: ProgressLocation.Notification,
            title: CreateEnv.statusTitle,
            cancellable: false,
        },
        async (
            progress: CreateEnvironmentProgress,
            token: CancellationToken,
        ): Promise<CreateEnvironmentResult | undefined> => createUvVenv(workspace!, version!, progress, token),
    );
}

export function uvCreationProvider(): CreateEnvironmentProvider {
    return {
        createEnvironment,
        name: 'uv',
        description: CreateEnv.Uv.providerDescription,
        id: UV_PROVIDER_ID,
        tools: ['uv'],
    };
}
