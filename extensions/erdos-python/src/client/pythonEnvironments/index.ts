// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { cloneDeep } from 'lodash';
import { getGlobalStorage, IPersistentStorage } from '../common/persistentState';
import { getOSType, OSType } from '../common/utils/platform';
import { ActivationResult, ExtensionState } from '../components';
import { PythonEnvInfo } from './base/info';
import { BasicEnvInfo, IDiscoveryAPI, ILocator } from './base/locator';
import { PythonEnvsReducer } from './base/locators/composite/envsReducer';
import { PythonEnvsResolver } from './base/locators/composite/envsResolver';
import { WindowsPathEnvVarLocator } from './base/locators/lowLevel/windowsKnownPathsLocator';
import { WorkspaceVirtualEnvironmentLocator } from './base/locators/lowLevel/workspaceVirtualEnvLocator';
import {
    initializeExternalDependencies as initializeLegacyExternalDependencies,
    normCasePath,
} from './common/externalDependencies';
import { ExtensionLocators, WatchRootsArgs, WorkspaceLocators } from './base/locators/wrappers';
import { CustomVirtualEnvironmentLocator } from './base/locators/lowLevel/customVirtualEnvLocator';
import { CondaEnvironmentLocator } from './base/locators/lowLevel/condaLocator';
import { GlobalVirtualEnvironmentLocator } from './base/locators/lowLevel/globalVirtualEnvronmentLocator';
import { PosixKnownPathsLocator } from './base/locators/lowLevel/posixKnownPathsLocator';
import { PyenvLocator } from './base/locators/lowLevel/pyenvLocator';
import { WindowsRegistryLocator } from './base/locators/lowLevel/windowsRegistryLocator';
import { MicrosoftStoreLocator } from './base/locators/lowLevel/microsoftStoreLocator';
import { getEnvironmentInfoService } from './base/info/environmentInfoService';
import { registerNewDiscoveryForIOC } from './legacyIOC';
import { PoetryLocator } from './base/locators/lowLevel/poetryLocator';
import { HatchLocator } from './base/locators/lowLevel/hatchLocator';
import { createPythonEnvironments } from './api';
import {
    createCollectionCache as createCache,
    IEnvsCollectionCache,
} from './base/locators/composite/envsCollectionCache';
import { EnvsCollectionService } from './base/locators/composite/envsCollectionService';
import { IDisposable } from '../common/types';
import { traceError } from '../logging';
import { ActiveStateLocator } from './base/locators/lowLevel/activeStateLocator';
import { CustomWorkspaceLocator } from './base/locators/lowLevel/customWorkspaceLocator';
import { PixiLocator } from './base/locators/lowLevel/pixiLocator';
import { getConfiguration } from '../common/vscodeApis/workspaceApis';
import { getNativePythonFinder } from './base/locators/common/nativePythonFinder';
import { createNativeEnvironmentsApi } from './nativeAPI';
import { useEnvExtension } from '../envExt/api.internal';
import { createEnvExtApi } from '../envExt/envExtApi';
import { UserSpecifiedEnvironmentLocator } from './base/locators/lowLevel/userSpecifiedEnvLocator';

const PYTHON_ENV_INFO_CACHE_KEY = 'PYTHON_ENV_INFO_CACHEv2';

export function shouldUseNativeLocator(): boolean {
    const config = getConfiguration('python');
    return config.get<string>('locator', 'js') === 'native';
}

/**
 * Set up the Python environments component (during extension activation).'
 */
export async function initialize(ext: ExtensionState): Promise<IDiscoveryAPI> {
    // Set up the legacy IOC container before api is created.
    initializeLegacyExternalDependencies(ext.legacyIOC.serviceContainer);

    if (useEnvExtension()) {
        const api = await createEnvExtApi(ext.disposables);
        registerNewDiscoveryForIOC(
            // These are what get wrapped in the legacy adapter.
            ext.legacyIOC.serviceManager,
            api,
        );
        return api;
    }

    if (shouldUseNativeLocator()) {
        const finder = getNativePythonFinder(ext.context);
        const api = createNativeEnvironmentsApi(finder);
        ext.disposables.push(api);
        registerNewDiscoveryForIOC(
            // These are what get wrapped in the legacy adapter.
            ext.legacyIOC.serviceManager,
            api,
        );
        return api;
    }

    const api = await createPythonEnvironments(() => createLocator(ext));
    registerNewDiscoveryForIOC(
        // These are what get wrapped in the legacy adapter.
        ext.legacyIOC.serviceManager,
        api,
    );
    return api;
}

/**
 * Make use of the component (e.g. register with VS Code).
 */
export async function activate(api: IDiscoveryAPI, ext: ExtensionState): Promise<ActivationResult> {
    /**
     * Force an initial background refresh of the environments.
     *
     * Note API is ready to be queried only after a refresh has been triggered, and extension activation is
     * blocked on API being ready. So if discovery was never triggered for a scope, we need to block
     * extension activation on the "refresh trigger".
     */
    const folders = vscode.workspace.workspaceFolders;
    // Trigger discovery if environment cache is empty.
    const wasTriggered = getGlobalStorage<PythonEnvInfo[]>(ext.context, PYTHON_ENV_INFO_CACHE_KEY, []).get().length > 0;
    if (!wasTriggered) {
        api.triggerRefresh().ignoreErrors();
        folders?.forEach(async (folder) => {
            const wasTriggeredForFolder = getGlobalStorage<boolean>(
                ext.context,
                `PYTHON_WAS_DISCOVERY_TRIGGERED_${normCasePath(folder.uri.fsPath)}`,
                false,
            );
            await wasTriggeredForFolder.set(true);
        });
    } else {
        // Figure out which workspace folders need to be activated if any.
        folders?.forEach(async (folder) => {
            const wasTriggeredForFolder = getGlobalStorage<boolean>(
                ext.context,
                `PYTHON_WAS_DISCOVERY_TRIGGERED_${normCasePath(folder.uri.fsPath)}`,
                false,
            );
            if (!wasTriggeredForFolder.get()) {
                api.triggerRefresh({
                    searchLocations: { roots: [folder.uri], doNotIncludeNonRooted: true },
                }).ignoreErrors();
                await wasTriggeredForFolder.set(true);
            }
        });
    }

    return {
        fullyReady: Promise.resolve(),
    };
}

/**
 * Get the locator to use in the component.
 */
async function createLocator(
    ext: ExtensionState,
    // This is shared.
): Promise<IDiscoveryAPI> {
    // Create the low-level locators.
    const locators: ILocator<BasicEnvInfo> = new ExtensionLocators<BasicEnvInfo>(
        // Here we pull the locators together.
        createNonWorkspaceLocators(ext),
        createWorkspaceLocator(ext),
    );

    // Create the env info service used by ResolvingLocator and CachingLocator.
    const envInfoService = getEnvironmentInfoService(ext.disposables);

    // Build the stack of composite locators.
    const reducer = new PythonEnvsReducer(locators);
    const resolvingLocator = new PythonEnvsResolver(
        reducer,
        // These are shared.
        envInfoService,
    );
    const caching = new EnvsCollectionService(
        await createCollectionCache(ext),
        // This is shared.
        resolvingLocator,
        shouldUseNativeLocator(),
    );
    return caching;
}

function createNonWorkspaceLocators(ext: ExtensionState): ILocator<BasicEnvInfo>[] {
    const locators: (ILocator<BasicEnvInfo> & Partial<IDisposable>)[] = [];
    locators.push(
        // OS-independent locators go here.
        new PyenvLocator(),
        new CondaEnvironmentLocator(),
        new ActiveStateLocator(),
        new GlobalVirtualEnvironmentLocator(),
        new CustomVirtualEnvironmentLocator(),
        new UserSpecifiedEnvironmentLocator(),
    );

    if (getOSType() === OSType.Windows) {
        locators.push(
            // Windows specific locators go here.
            new WindowsRegistryLocator(),
            new MicrosoftStoreLocator(),
            new WindowsPathEnvVarLocator(),
        );
    } else {
        locators.push(
            // Linux/Mac locators go here.
            new PosixKnownPathsLocator(),
        );
    }

    const disposables = locators.filter((d) => d.dispose !== undefined) as IDisposable[];
    ext.disposables.push(...disposables);
    return locators;
}

function watchRoots(args: WatchRootsArgs): IDisposable {
    const { initRoot, addRoot, removeRoot } = args;

    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        folders.map((f) => f.uri).forEach(initRoot);
    }

    return vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        for (const root of event.removed) {
            removeRoot(root.uri);
        }
        for (const root of event.added) {
            addRoot(root.uri);
        }
    });
}

function createWorkspaceLocator(ext: ExtensionState): WorkspaceLocators {
    const locators = new WorkspaceLocators(watchRoots, [
        (root: vscode.Uri) => [
            new WorkspaceVirtualEnvironmentLocator(root.fsPath),
            new PoetryLocator(root.fsPath),
            new HatchLocator(root.fsPath),
            new PixiLocator(root.fsPath),
            new CustomWorkspaceLocator(root.fsPath),
        ],
        // Add an ILocator factory func here for each kind of workspace-rooted locator.
    ]);
    ext.disposables.push(locators);
    return locators;
}

function getFromStorage(storage: IPersistentStorage<PythonEnvInfo[]>): PythonEnvInfo[] {
    return storage.get().map((e) => {
        if (e.searchLocation) {
            if (typeof e.searchLocation === 'string') {
                e.searchLocation = Uri.parse(e.searchLocation);
            } else if ('scheme' in e.searchLocation && 'path' in e.searchLocation) {
                e.searchLocation = Uri.parse(`${e.searchLocation.scheme}://${e.searchLocation.path}`);
            } else {
                traceError('Unexpected search location', JSON.stringify(e.searchLocation));
            }
        }
        return e;
    });
}

function putIntoStorage(storage: IPersistentStorage<PythonEnvInfo[]>, envs: PythonEnvInfo[]): Promise<void> {
    storage.set(
        // We have to `cloneDeep()` here so that we don't overwrite the original `PythonEnvInfo` objects.
        cloneDeep(envs).map((e) => {
            if (e.searchLocation) {
                // Make TS believe it is string. This is temporary. We need to serialize this in
                // a custom way.
                e.searchLocation = (e.searchLocation.toString() as unknown) as Uri;
            }
            return e;
        }),
    );
    return Promise.resolve();
}

async function createCollectionCache(ext: ExtensionState): Promise<IEnvsCollectionCache> {
    const storage = getGlobalStorage<PythonEnvInfo[]>(ext.context, PYTHON_ENV_INFO_CACHE_KEY, []);
    const cache = await createCache({
        get: () => getFromStorage(storage),
        store: async (e) => putIntoStorage(storage, e),
    });
    return cache;
}

export async function activateAndRefreshEnvs(api: IDiscoveryAPI): Promise<ActivationResult> {
    api.triggerRefresh().ignoreErrors();

    return {
        fullyReady: Promise.resolve(),
    };
}
