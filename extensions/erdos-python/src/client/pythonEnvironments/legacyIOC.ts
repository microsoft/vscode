// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable } from 'inversify';
import { intersection } from 'lodash';
import * as vscode from 'vscode';
import { FileChangeType } from '../common/platform/fileSystemWatcher';
import { Resource } from '../common/types';
import { IComponentAdapter, ICondaService, PythonEnvironmentsChangedEvent } from '../interpreter/contracts';
import { IServiceManager } from '../ioc/types';
import { PythonEnvInfo, PythonEnvKind, PythonEnvSource } from './base/info';
import {
    GetRefreshEnvironmentsOptions,
    IDiscoveryAPI,
    PythonLocatorQuery,
    TriggerRefreshOptions,
} from './base/locator';
import { isMacDefaultPythonPath } from './common/environmentManagers/macDefault';
import { isParentPath } from './common/externalDependencies';
import { EnvironmentType, PythonEnvironment } from './info';
import { toSemverLikeVersion } from './base/info/pythonVersion';
import { PythonVersion } from './info/pythonVersion';
import { createDeferred } from '../common/utils/async';
import { PythonEnvCollectionChangedEvent } from './base/watcher';
import { asyncFilter } from '../common/utils/arrayUtils';
import { CondaEnvironmentInfo, isCondaEnvironment } from './common/environmentManagers/conda';
import { isMicrosoftStoreEnvironment } from './common/environmentManagers/microsoftStoreEnv';
import { CondaService } from './common/environmentManagers/condaService';
import { traceError, traceVerbose } from '../logging';

const convertedKinds = new Map(
    Object.entries({
        [PythonEnvKind.OtherGlobal]: EnvironmentType.Global,
        [PythonEnvKind.System]: EnvironmentType.System,
        [PythonEnvKind.MicrosoftStore]: EnvironmentType.MicrosoftStore,
        [PythonEnvKind.Pyenv]: EnvironmentType.Pyenv,
        [PythonEnvKind.Conda]: EnvironmentType.Conda,
        [PythonEnvKind.VirtualEnv]: EnvironmentType.VirtualEnv,
        [PythonEnvKind.Pipenv]: EnvironmentType.Pipenv,
        [PythonEnvKind.Poetry]: EnvironmentType.Poetry,
        [PythonEnvKind.Hatch]: EnvironmentType.Hatch,
        [PythonEnvKind.Pixi]: EnvironmentType.Pixi,
        [PythonEnvKind.Uv]: EnvironmentType.Uv,
        [PythonEnvKind.Custom]: EnvironmentType.Custom,
        [PythonEnvKind.Venv]: EnvironmentType.Venv,
        [PythonEnvKind.VirtualEnvWrapper]: EnvironmentType.VirtualEnvWrapper,
        [PythonEnvKind.ActiveState]: EnvironmentType.ActiveState,
    }),
);

export function convertEnvInfoToPythonEnvironment(info: PythonEnvInfo): PythonEnvironment {
    return convertEnvInfo(info);
}

function convertEnvInfo(info: PythonEnvInfo): PythonEnvironment {
    const { name, location, executable, arch, kind, version, distro, id } = info;
    const { filename, sysPrefix } = executable;
    const env: PythonEnvironment = {
        id,
        sysPrefix,
        envType: EnvironmentType.Unknown,
        envName: name,
        envPath: location,
        path: filename,
        architecture: arch,
    };

    const envType = convertedKinds.get(kind);
    if (envType !== undefined) {
        env.envType = envType;
    }
    // Otherwise it stays Unknown.

    if (version !== undefined) {
        const { release, sysVersion } = version;
        if (release === undefined) {
            env.sysVersion = '';
        } else {
            env.sysVersion = sysVersion;
        }

        const semverLikeVersion: PythonVersion = toSemverLikeVersion(version);
        env.version = semverLikeVersion;
    }

    if (distro !== undefined && distro.org !== '') {
        env.companyDisplayName = distro.org;
    }
    env.displayName = info.display;
    env.detailedDisplayName = info.detailedDisplayName;
    env.type = info.type;
    // We do not worry about using distro.defaultDisplayName.

    return env;
}
@injectable()
class ComponentAdapter implements IComponentAdapter {
    private readonly changed = new vscode.EventEmitter<PythonEnvironmentsChangedEvent>();

    constructor(
        // The adapter only wraps one thing: the component API.
        private readonly api: IDiscoveryAPI,
    ) {
        this.api.onChanged((event) => {
            this.changed.fire({
                type: event.type,
                new: event.new ? convertEnvInfo(event.new) : undefined,
                old: event.old ? convertEnvInfo(event.old) : undefined,
                resource: event.searchLocation,
            });
        });
    }

    public triggerRefresh(query?: PythonLocatorQuery, options?: TriggerRefreshOptions): Promise<void> {
        return this.api.triggerRefresh(query, options);
    }

    public getRefreshPromise(options?: GetRefreshEnvironmentsOptions) {
        return this.api.getRefreshPromise(options);
    }

    public get onProgress() {
        return this.api.onProgress;
    }

    public get onChanged() {
        return this.changed.event;
    }

    // For use in VirtualEnvironmentPrompt.activate()

    // Call callback if an environment gets created within the resource provided.
    public onDidCreate(resource: Resource, callback: () => void): vscode.Disposable {
        const workspaceFolder = resource ? vscode.workspace.getWorkspaceFolder(resource) : undefined;
        return this.api.onChanged((e) => {
            if (!workspaceFolder || !e.searchLocation) {
                return;
            }
            traceVerbose(`Received event ${JSON.stringify(e)} file change event`);
            if (
                e.type === FileChangeType.Created &&
                isParentPath(e.searchLocation.fsPath, workspaceFolder.uri.fsPath)
            ) {
                callback();
            }
        });
    }

    // Implements IInterpreterHelper
    public async getInterpreterInformation(pythonPath: string): Promise<Partial<PythonEnvironment> | undefined> {
        const env = await this.api.resolveEnv(pythonPath);
        return env ? convertEnvInfo(env) : undefined;
    }

    // eslint-disable-next-line class-methods-use-this
    public async isMacDefaultPythonPath(pythonPath: string): Promise<boolean> {
        // While `ComponentAdapter` represents how the component would be used in the rest of the
        // extension, we cheat here for the sake of performance.  This is not a problem because when
        // we start using the component's public API directly we will be dealing with `PythonEnvInfo`
        // instead of just `pythonPath`.
        return isMacDefaultPythonPath(pythonPath);
    }

    // Implements IInterpreterService

    // We use the same getInterpreters() here as for IInterpreterLocatorService.
    public async getInterpreterDetails(pythonPath: string): Promise<PythonEnvironment | undefined> {
        try {
            const env = await this.api.resolveEnv(pythonPath);
            if (!env) {
                return undefined;
            }
            return convertEnvInfo(env);
        } catch (ex) {
            traceError(`Failed to resolve interpreter: ${pythonPath}`, ex);
            return undefined;
        }
    }

    // Implements ICondaService

    // eslint-disable-next-line class-methods-use-this
    public async isCondaEnvironment(interpreterPath: string): Promise<boolean> {
        // While `ComponentAdapter` represents how the component would be used in the rest of the
        // extension, we cheat here for the sake of performance.  This is not a problem because when
        // we start using the component's public API directly we will be dealing with `PythonEnvInfo`
        // instead of just `pythonPath`.
        return isCondaEnvironment(interpreterPath);
    }

    public async getCondaEnvironment(interpreterPath: string): Promise<CondaEnvironmentInfo | undefined> {
        if (!(await isCondaEnvironment(interpreterPath))) {
            // Undefined is expected here when the env is not Conda env.
            return undefined;
        }

        // The API getCondaEnvironment() is not called automatically, unless user attempts to install or activate environments
        // So calling resolveEnv() which although runs python unnecessarily, is not that expensive here.
        const env = await this.api.resolveEnv(interpreterPath);

        if (!env) {
            return undefined;
        }

        return { name: env.name, path: env.location };
    }

    // eslint-disable-next-line class-methods-use-this
    public async isMicrosoftStoreInterpreter(pythonPath: string): Promise<boolean> {
        // Eventually we won't be calling 'isMicrosoftStoreInterpreter' in the component adapter, so we won't
        // need to use 'isMicrosoftStoreEnvironment' directly here. This is just a temporary implementation.
        return isMicrosoftStoreEnvironment(pythonPath);
    }

    // Implements IInterpreterLocatorService
    public async hasInterpreters(
        filter: (e: PythonEnvironment) => Promise<boolean> = async () => true,
    ): Promise<boolean> {
        const onAddedToCollection = createDeferred();
        // Watch for collection changed events.
        this.api.onChanged(async (e: PythonEnvCollectionChangedEvent) => {
            if (e.new) {
                if (await filter(convertEnvInfo(e.new))) {
                    onAddedToCollection.resolve();
                }
            }
        });
        const initialEnvs = await asyncFilter(this.api.getEnvs(), (e) => filter(convertEnvInfo(e)));
        if (initialEnvs.length > 0) {
            return true;
        }
        // Wait for an env to be added to the collection until the refresh has finished. Note although it's not
        // guaranteed we have initiated discovery in this session, we do trigger refresh in the very first session,
        // when Python is not installed, etc. Assuming list is more or less upto date.
        await Promise.race([onAddedToCollection.promise, this.api.getRefreshPromise()]);
        const envs = await asyncFilter(this.api.getEnvs(), (e) => filter(convertEnvInfo(e)));
        return envs.length > 0;
    }

    public getInterpreters(resource?: vscode.Uri, source?: PythonEnvSource[]): PythonEnvironment[] {
        const query: PythonLocatorQuery = {};
        let roots: vscode.Uri[] = [];
        let wsFolder: vscode.WorkspaceFolder | undefined;
        if (resource !== undefined) {
            wsFolder = vscode.workspace.getWorkspaceFolder(resource);
            if (wsFolder) {
                roots = [wsFolder.uri];
            }
        }
        // Untitled files should still use the workspace as the query location
        if (
            !wsFolder &&
            vscode.workspace.workspaceFolders &&
            vscode.workspace.workspaceFolders.length > 0 &&
            (!resource || resource.scheme === 'untitled')
        ) {
            roots = vscode.workspace.workspaceFolders.map((w) => w.uri);
        }

        query.searchLocations = {
            roots,
        };

        let envs = this.api.getEnvs(query);
        if (source) {
            envs = envs.filter((env) => intersection(source, env.source).length > 0);
        }

        return envs.map(convertEnvInfo);
    }

    public async getWorkspaceVirtualEnvInterpreters(
        resource: vscode.Uri,
        options?: { ignoreCache?: boolean },
    ): Promise<PythonEnvironment[]> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(resource);
        if (!workspaceFolder) {
            return [];
        }
        const query: PythonLocatorQuery = {
            searchLocations: {
                roots: [workspaceFolder.uri],
                doNotIncludeNonRooted: true,
            },
        };
        if (options?.ignoreCache) {
            await this.api.triggerRefresh(query);
        }
        await this.api.getRefreshPromise();
        const envs = this.api.getEnvs(query);
        return envs.map(convertEnvInfo);
    }
}

export function registerNewDiscoveryForIOC(serviceManager: IServiceManager, api: IDiscoveryAPI): void {
    serviceManager.addSingleton<ICondaService>(ICondaService, CondaService);
    serviceManager.addSingletonInstance<IComponentAdapter>(IComponentAdapter, new ComponentAdapter(api));
}
