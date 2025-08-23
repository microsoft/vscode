// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { EventEmitter, Terminal, Uri, Disposable, ConfigurationTarget } from 'vscode';
import { getExtension } from '../common/vscodeApis/extensionsApi';
import {
    GetEnvironmentScope,
    PythonBackgroundRunOptions,
    PythonEnvironment,
    PythonEnvironmentApi,
    PythonProcess,
    RefreshEnvironmentsScope,
    DidChangeEnvironmentEventArgs,
} from './types';
import { executeCommand } from '../common/vscodeApis/commandApis';
import { IInterpreterPathService } from '../common/types';
import { getConfiguration } from '../common/vscodeApis/workspaceApis';

export const ENVS_EXTENSION_ID = 'ms-python.vscode-python-envs';

let _useExt: boolean | undefined;
export function useEnvExtension(): boolean {
    if (_useExt !== undefined) {
        return _useExt;
    }
    const inExpSetting = getConfiguration('python').get<boolean>('useEnvironmentsExtension', false);
    // If extension is installed and in experiment, then use it.
    _useExt = !!getExtension(ENVS_EXTENSION_ID) && inExpSetting;
    return _useExt;
}

const onDidChangeEnvironmentEnvExtEmitter: EventEmitter<DidChangeEnvironmentEventArgs> = new EventEmitter<
    DidChangeEnvironmentEventArgs
>();
export function onDidChangeEnvironmentEnvExt(
    listener: (e: DidChangeEnvironmentEventArgs) => unknown,
    thisArgs?: unknown,
    disposables?: Disposable[],
): Disposable {
    return onDidChangeEnvironmentEnvExtEmitter.event(listener, thisArgs, disposables);
}

let _extApi: PythonEnvironmentApi | undefined;
export async function getEnvExtApi(): Promise<PythonEnvironmentApi> {
    if (_extApi) {
        return _extApi;
    }
    const extension = getExtension(ENVS_EXTENSION_ID);
    if (!extension) {
        throw new Error('Python Environments extension not found.');
    }
    if (!extension?.isActive) {
        await extension.activate();
    }

    _extApi = extension.exports as PythonEnvironmentApi;
    _extApi.onDidChangeEnvironment((e) => {
        onDidChangeEnvironmentEnvExtEmitter.fire(e);
    });

    return _extApi;
}

export async function runInBackground(
    environment: PythonEnvironment,
    options: PythonBackgroundRunOptions,
): Promise<PythonProcess> {
    const envExtApi = await getEnvExtApi();
    return envExtApi.runInBackground(environment, options);
}

export async function getEnvironment(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
    const envExtApi = await getEnvExtApi();
    return envExtApi.getEnvironment(scope);
}

export async function resolveEnvironment(pythonPath: string): Promise<PythonEnvironment | undefined> {
    const envExtApi = await getEnvExtApi();
    return envExtApi.resolveEnvironment(Uri.file(pythonPath));
}

export async function refreshEnvironments(scope: RefreshEnvironmentsScope): Promise<void> {
    const envExtApi = await getEnvExtApi();
    return envExtApi.refreshEnvironments(scope);
}

export async function runInTerminal(
    resource: Uri | undefined,
    args?: string[],
    cwd?: string | Uri,
    show?: boolean,
): Promise<Terminal> {
    const envExtApi = await getEnvExtApi();
    const env = await getEnvironment(resource);
    const project = resource ? envExtApi.getPythonProject(resource) : undefined;
    if (env && resource) {
        return envExtApi.runInTerminal(env, {
            cwd: cwd ?? project?.uri ?? process.cwd(),
            args,
            show,
        });
    }
    throw new Error('Invalid arguments to run in terminal');
}

export async function runInDedicatedTerminal(
    resource: Uri | undefined,
    args?: string[],
    cwd?: string | Uri,
    show?: boolean,
): Promise<Terminal> {
    const envExtApi = await getEnvExtApi();
    const env = await getEnvironment(resource);
    const project = resource ? envExtApi.getPythonProject(resource) : undefined;
    if (env) {
        return envExtApi.runInDedicatedTerminal(resource ?? 'global', env, {
            cwd: cwd ?? project?.uri ?? process.cwd(),
            args,
            show,
        });
    }
    throw new Error('Invalid arguments to run in dedicated terminal');
}

export async function clearCache(): Promise<void> {
    const envExtApi = await getEnvExtApi();
    if (envExtApi) {
        await executeCommand('python-envs.clearCache');
    }
}

export function registerEnvExtFeatures(
    disposables: Disposable[],
    interpreterPathService: IInterpreterPathService,
): void {
    if (useEnvExtension()) {
        disposables.push(
            onDidChangeEnvironmentEnvExt(async (e: DidChangeEnvironmentEventArgs) => {
                const previousPath = interpreterPathService.get(e.uri);

                if (previousPath !== e.new?.environmentPath.fsPath) {
                    if (e.uri) {
                        await interpreterPathService.update(
                            e.uri,
                            ConfigurationTarget.WorkspaceFolder,
                            e.new?.environmentPath.fsPath,
                        );
                    } else {
                        await interpreterPathService.update(
                            undefined,
                            ConfigurationTarget.Global,
                            e.new?.environmentPath.fsPath,
                        );
                    }
                }
            }),
        );
    }
}
