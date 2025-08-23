// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { IRecommendedEnvironmentService } from './types';
import { PythonExtension, ResolvedEnvironment } from '../../api/types';
import { IExtensionContext, Resource } from '../../common/types';
import { commands, Uri, workspace } from 'vscode';
import { getWorkspaceStateValue, updateWorkspaceStateValue } from '../../common/persistentState';
import { traceError } from '../../logging';
import { IExtensionActivationService } from '../../activation/types';
import { StopWatch } from '../../common/utils/stopWatch';
import { isParentPath } from '../../common/platform/fs-paths';

const MEMENTO_KEY = 'userSelectedEnvPath';

@injectable()
export class RecommendedEnvironmentService implements IRecommendedEnvironmentService, IExtensionActivationService {
    private api?: PythonExtension['environments'];
    constructor(@inject(IExtensionContext) private readonly extensionContext: IExtensionContext) {}
    supportedWorkspaceTypes: { untrustedWorkspace: boolean; virtualWorkspace: boolean } = {
        untrustedWorkspace: true,
        virtualWorkspace: false,
    };

    async activate(_resource: Resource, _startupStopWatch?: StopWatch): Promise<void> {
        this.extensionContext.subscriptions.push(
            commands.registerCommand('python.getRecommendedEnvironment', async (resource: Resource) => {
                return this.getRecommededEnvironment(resource);
            }),
        );
    }

    registerEnvApi(api: PythonExtension['environments']) {
        this.api = api;
    }

    trackUserSelectedEnvironment(environmentPath: string | undefined, uri: Uri | undefined) {
        if (workspace.workspaceFolders?.length) {
            try {
                void updateWorkspaceStateValue(MEMENTO_KEY, getDataToStore(environmentPath, uri));
            } catch (ex) {
                traceError('Failed to update workspace state for preferred environment', ex);
            }
        } else {
            void this.extensionContext.globalState.update(MEMENTO_KEY, environmentPath);
        }
    }

    async getRecommededEnvironment(
        resource: Resource,
    ): Promise<
        | {
              environment: ResolvedEnvironment;
              reason: 'globalUserSelected' | 'workspaceUserSelected' | 'defaultRecommended';
          }
        | undefined
    > {
        if (!workspace.isTrusted || !this.api) {
            return undefined;
        }
        const preferred = await this.getRecommededInternal(resource);
        if (!preferred) {
            return undefined;
        }
        const activeEnv = await this.api.resolveEnvironment(this.api.getActiveEnvironmentPath(resource));
        const recommendedEnv = await this.api.resolveEnvironment(preferred.environmentPath);
        if (activeEnv && recommendedEnv && activeEnv.id !== recommendedEnv.id) {
            traceError(
                `Active environment ${activeEnv.id} is different from recommended environment ${
                    recommendedEnv.id
                } for resource ${resource?.toString()}`,
            );
            return undefined;
        }
        if (recommendedEnv) {
            return { environment: recommendedEnv, reason: preferred.reason };
        }
        const globalEnv = await this.api.resolveEnvironment(this.api.getActiveEnvironmentPath());
        if (activeEnv && globalEnv?.path !== activeEnv?.path) {
            // User has definitely got a workspace specific environment selected.
            // Given the fact that global !== workspace env, we can safely assume that
            // at some time, the user has selected a workspace specific environment.
            // This applies to cases where the user has selected a workspace specific environment before this version of the extension
            // and we did not store it in the workspace state.
            // So we can safely return the global environment as the recommended environment.
            return { environment: activeEnv, reason: 'workspaceUserSelected' };
        }
        return undefined;
    }
    async getRecommededInternal(
        resource: Resource,
    ): Promise<
        | { environmentPath: string; reason: 'globalUserSelected' | 'workspaceUserSelected' | 'defaultRecommended' }
        | undefined
    > {
        let workspaceState: string | undefined = undefined;
        try {
            workspaceState = getWorkspaceStateValue<string>(MEMENTO_KEY);
        } catch (ex) {
            traceError('Failed to get workspace state for preferred environment', ex);
        }

        if (workspace.workspaceFolders?.length && workspaceState) {
            const workspaceUri = (
                (resource ? workspace.getWorkspaceFolder(resource)?.uri : undefined) ||
                workspace.workspaceFolders[0].uri
            ).toString();

            try {
                const existingJson: Record<string, string> = JSON.parse(workspaceState);
                const selectedEnvPath = existingJson[workspaceUri];
                if (selectedEnvPath) {
                    return { environmentPath: selectedEnvPath, reason: 'workspaceUserSelected' };
                }
            } catch (ex) {
                traceError('Failed to parse existing workspace state value for preferred environment', ex);
            }
        }

        if (workspace.workspaceFolders?.length && this.api) {
            // Check if we have a .venv or .conda environment in the workspace
            // This is required for cases where user has selected a workspace specific environment
            // but before this version of the extension, we did not store it in the workspace state.
            const workspaceEnv = await getWorkspaceSpecificVirtualEnvironment(this.api, resource);
            if (workspaceEnv) {
                return { environmentPath: workspaceEnv.path, reason: 'workspaceUserSelected' };
            }
        }

        const globalSelectedEnvPath = this.extensionContext.globalState.get<string | undefined>(MEMENTO_KEY);
        if (globalSelectedEnvPath) {
            return { environmentPath: globalSelectedEnvPath, reason: 'globalUserSelected' };
        }
        return this.api && workspace.isTrusted
            ? {
                  environmentPath: this.api.getActiveEnvironmentPath(resource).path,
                  reason: 'defaultRecommended',
              }
            : undefined;
    }
}

async function getWorkspaceSpecificVirtualEnvironment(api: PythonExtension['environments'], resource: Resource) {
    const workspaceUri =
        (resource ? workspace.getWorkspaceFolder(resource)?.uri : undefined) ||
        (workspace.workspaceFolders?.length ? workspace.workspaceFolders[0].uri : undefined);
    if (!workspaceUri) {
        return undefined;
    }
    let workspaceEnv = api.known.find((env) => {
        if (!env.environment?.folderUri) {
            return false;
        }
        if (env.environment.type !== 'VirtualEnvironment' && env.environment.type !== 'Conda') {
            return false;
        }
        return isParentPath(env.environment.folderUri.fsPath, workspaceUri.fsPath);
    });
    let resolvedEnv = workspaceEnv ? api.resolveEnvironment(workspaceEnv) : undefined;
    if (resolvedEnv) {
        return resolvedEnv;
    }
    workspaceEnv = api.known.find((env) => {
        // Look for any other type of env thats inside this workspace
        // Or look for an env thats associated with this workspace (pipenv or the like).
        return (
            (env.environment?.folderUri && isParentPath(env.environment.folderUri.fsPath, workspaceUri.fsPath)) ||
            (env.environment?.workspaceFolder && env.environment.workspaceFolder.uri.fsPath === workspaceUri.fsPath)
        );
    });
    return workspaceEnv ? api.resolveEnvironment(workspaceEnv) : undefined;
}

function getDataToStore(environmentPath: string | undefined, uri: Uri | undefined): string | undefined {
    if (!workspace.workspaceFolders?.length) {
        return environmentPath;
    }
    const workspaceUri = (
        (uri ? workspace.getWorkspaceFolder(uri)?.uri : undefined) || workspace.workspaceFolders[0].uri
    ).toString();
    const existingData = getWorkspaceStateValue<string>(MEMENTO_KEY);
    if (!existingData) {
        return JSON.stringify(environmentPath ? { [workspaceUri]: environmentPath } : {});
    }
    try {
        const existingJson: Record<string, string> = JSON.parse(existingData);
        if (environmentPath) {
            existingJson[workspaceUri] = environmentPath;
        } else {
            delete existingJson[workspaceUri];
        }
        return JSON.stringify(existingJson);
    } catch (ex) {
        traceError('Failed to parse existing workspace state value for preferred environment', ex);
        return JSON.stringify({
            [workspaceUri]: environmentPath,
        });
    }
}
