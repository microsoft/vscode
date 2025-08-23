// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable, named, optional } from 'inversify';
import { Memento } from 'vscode';
import { IExtensionSingleActivationService } from '../activation/types';
import { traceError } from '../logging';
import { ICommandManager } from './application/types';
import { Commands } from './constants';
import {
    GLOBAL_MEMENTO,
    IExtensionContext,
    IMemento,
    IPersistentState,
    IPersistentStateFactory,
    WORKSPACE_MEMENTO,
} from './types';
import { cache } from './utils/decorators';
import { noop } from './utils/misc';
import { clearCacheDirectory } from '../pythonEnvironments/base/locators/common/nativePythonFinder';
import { clearCache, useEnvExtension } from '../envExt/api.internal';

let _workspaceState: Memento | undefined;
const _workspaceKeys: string[] = [];
export function initializePersistentStateForTriggers(context: IExtensionContext) {
    _workspaceState = context.workspaceState;
}

export function getWorkspaceStateValue<T>(key: string, defaultValue?: T): T | undefined {
    if (!_workspaceState) {
        throw new Error('Workspace state not initialized');
    }
    if (defaultValue === undefined) {
        return _workspaceState.get<T>(key);
    }
    return _workspaceState.get<T>(key, defaultValue);
}

export async function updateWorkspaceStateValue<T>(key: string, value: T): Promise<void> {
    if (!_workspaceState) {
        throw new Error('Workspace state not initialized');
    }
    try {
        _workspaceKeys.push(key);
        await _workspaceState.update(key, value);
        const after = getWorkspaceStateValue(key);
        if (JSON.stringify(after) !== JSON.stringify(value)) {
            await _workspaceState.update(key, undefined);
            await _workspaceState.update(key, value);
            traceError('Error while updating workspace state for key:', key);
        }
    } catch (ex) {
        traceError(`Error while updating workspace state for key [${key}]:`, ex);
    }
}

async function clearWorkspaceState(): Promise<void> {
    if (_workspaceState !== undefined) {
        await Promise.all(_workspaceKeys.map((key) => updateWorkspaceStateValue(key, undefined)));
    }
}

export class PersistentState<T> implements IPersistentState<T> {
    constructor(
        public readonly storage: Memento,
        private key: string,
        private defaultValue?: T,
        private expiryDurationMs?: number,
    ) {}

    public get value(): T {
        if (this.expiryDurationMs) {
            const cachedData = this.storage.get<{ data?: T; expiry?: number }>(this.key, { data: this.defaultValue! });
            if (!cachedData || !cachedData.expiry || cachedData.expiry < Date.now()) {
                return this.defaultValue!;
            } else {
                return cachedData.data!;
            }
        } else {
            return this.storage.get<T>(this.key, this.defaultValue!);
        }
    }

    public async updateValue(newValue: T, retryOnce = true): Promise<void> {
        try {
            if (this.expiryDurationMs) {
                await this.storage.update(this.key, { data: newValue, expiry: Date.now() + this.expiryDurationMs });
            } else {
                await this.storage.update(this.key, newValue);
            }
            if (retryOnce && JSON.stringify(this.value) != JSON.stringify(newValue)) {
                // Due to a VSCode bug sometimes the changes are not reflected in the storage, atleast not immediately.
                // It is noticed however that if we reset the storage first and then update it, it works.
                // https://github.com/microsoft/vscode/issues/171827
                await this.updateValue(undefined as any, false);
                await this.updateValue(newValue, false);
            }
        } catch (ex) {
            traceError('Error while updating storage for key:', this.key, ex);
        }
    }
}

export const GLOBAL_PERSISTENT_KEYS_DEPRECATED = 'PYTHON_EXTENSION_GLOBAL_STORAGE_KEYS';
export const WORKSPACE_PERSISTENT_KEYS_DEPRECATED = 'PYTHON_EXTENSION_WORKSPACE_STORAGE_KEYS';

export const GLOBAL_PERSISTENT_KEYS = 'PYTHON_GLOBAL_STORAGE_KEYS';
const WORKSPACE_PERSISTENT_KEYS = 'PYTHON_WORKSPACE_STORAGE_KEYS';
type KeysStorageType = 'global' | 'workspace';
export type KeysStorage = { key: string; defaultValue: unknown };

@injectable()
export class PersistentStateFactory implements IPersistentStateFactory, IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };
    public readonly _globalKeysStorage = new PersistentState<KeysStorage[]>(
        this.globalState,
        GLOBAL_PERSISTENT_KEYS,
        [],
    );
    public readonly _workspaceKeysStorage = new PersistentState<KeysStorage[]>(
        this.workspaceState,
        WORKSPACE_PERSISTENT_KEYS,
        [],
    );
    constructor(
        @inject(IMemento) @named(GLOBAL_MEMENTO) private globalState: Memento,
        @inject(IMemento) @named(WORKSPACE_MEMENTO) private workspaceState: Memento,
        @inject(ICommandManager) private cmdManager?: ICommandManager,
        @inject(IExtensionContext) @optional() private context?: IExtensionContext,
    ) {}

    public async activate(): Promise<void> {
        this.cmdManager?.registerCommand(Commands.ClearStorage, async () => {
            await clearWorkspaceState();
            await this.cleanAllPersistentStates();
            if (useEnvExtension()) {
                await clearCache();
            }
        });
        const globalKeysStorageDeprecated = this.createGlobalPersistentState(GLOBAL_PERSISTENT_KEYS_DEPRECATED, []);
        const workspaceKeysStorageDeprecated = this.createWorkspacePersistentState(
            WORKSPACE_PERSISTENT_KEYS_DEPRECATED,
            [],
        );
        // Old storages have grown to be unusually large due to https://github.com/microsoft/vscode-python/issues/17488,
        // so reset them. This line can be removed after a while.
        if (globalKeysStorageDeprecated.value.length > 0) {
            globalKeysStorageDeprecated.updateValue([]).ignoreErrors();
        }
        if (workspaceKeysStorageDeprecated.value.length > 0) {
            workspaceKeysStorageDeprecated.updateValue([]).ignoreErrors();
        }
    }

    public createGlobalPersistentState<T>(
        key: string,
        defaultValue?: T,
        expiryDurationMs?: number,
    ): IPersistentState<T> {
        this.addKeyToStorage('global', key, defaultValue).ignoreErrors();
        return new PersistentState<T>(this.globalState, key, defaultValue, expiryDurationMs);
    }

    public createWorkspacePersistentState<T>(
        key: string,
        defaultValue?: T,
        expiryDurationMs?: number,
    ): IPersistentState<T> {
        this.addKeyToStorage('workspace', key, defaultValue).ignoreErrors();
        return new PersistentState<T>(this.workspaceState, key, defaultValue, expiryDurationMs);
    }

    /**
     * Note we use a decorator to cache the promise returned by this method, so it's only called once.
     * It is only cached for the particular arguments passed, so the argument type is simplified here.
     */
    @cache(-1, true)
    private async addKeyToStorage<T>(keyStorageType: KeysStorageType, key: string, defaultValue?: T) {
        const storage = keyStorageType === 'global' ? this._globalKeysStorage : this._workspaceKeysStorage;
        const found = storage.value.find((value) => value.key === key);
        if (!found) {
            await storage.updateValue([{ key, defaultValue }, ...storage.value]);
        }
    }

    private async cleanAllPersistentStates(): Promise<void> {
        const clearCacheDirPromise = this.context ? clearCacheDirectory(this.context).catch() : Promise.resolve();
        await Promise.all(
            this._globalKeysStorage.value.map(async (keyContent) => {
                const storage = this.createGlobalPersistentState(keyContent.key);
                await storage.updateValue(keyContent.defaultValue);
            }),
        );
        await Promise.all(
            this._workspaceKeysStorage.value.map(async (keyContent) => {
                const storage = this.createWorkspacePersistentState(keyContent.key);
                await storage.updateValue(keyContent.defaultValue);
            }),
        );
        await this._globalKeysStorage.updateValue([]);
        await this._workspaceKeysStorage.updateValue([]);
        await clearCacheDirPromise;
        this.cmdManager?.executeCommand('workbench.action.reloadWindow').then(noop);
    }
}

/////////////////////////////
// a simpler, alternate API
// for components to use

export interface IPersistentStorage<T> {
    get(): T;
    set(value: T): Promise<void>;
}

/**
 * Build a global storage object for the given key.
 */
export function getGlobalStorage<T>(context: IExtensionContext, key: string, defaultValue?: T): IPersistentStorage<T> {
    const globalKeysStorage = new PersistentState<KeysStorage[]>(context.globalState, GLOBAL_PERSISTENT_KEYS, []);
    const found = globalKeysStorage.value.find((value) => value.key === key);
    if (!found) {
        const newValue = [{ key, defaultValue }, ...globalKeysStorage.value];
        globalKeysStorage.updateValue(newValue).ignoreErrors();
    }
    const raw = new PersistentState<T>(context.globalState, key, defaultValue);
    return {
        // We adapt between PersistentState and IPersistentStorage.
        get() {
            return raw.value;
        },
        set(value: T) {
            return raw.updateValue(value);
        },
    };
}
