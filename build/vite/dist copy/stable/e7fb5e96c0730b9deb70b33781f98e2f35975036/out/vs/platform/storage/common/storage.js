/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Promises, RunOnceScheduler, runWhenGlobalIdle } from '../../../base/common/async.js';
import { Emitter, Event, PauseableEmitter } from '../../../base/common/event.js';
import { Disposable, dispose, MutableDisposable } from '../../../base/common/lifecycle.js';
import { mark } from '../../../base/common/performance.js';
import { isUndefinedOrNull } from '../../../base/common/types.js';
import { InMemoryStorageDatabase, Storage, StorageHint } from '../../../base/parts/storage/common/storage.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { isUserDataProfile } from '../../userDataProfile/common/userDataProfile.js';
export const IS_NEW_KEY = '__$__isNewStorageMarker';
export const TARGET_KEY = '__$__targetStorageMarker';
export const IStorageService = createDecorator('storageService');
export var WillSaveStateReason;
(function (WillSaveStateReason) {
    /**
     * No specific reason to save state.
     */
    WillSaveStateReason[WillSaveStateReason["NONE"] = 0] = "NONE";
    /**
     * A hint that the workbench is about to shutdown.
     */
    WillSaveStateReason[WillSaveStateReason["SHUTDOWN"] = 1] = "SHUTDOWN";
})(WillSaveStateReason || (WillSaveStateReason = {}));
export var StorageScope;
(function (StorageScope) {
    /**
     * The stored data will be scoped to all workspaces across all profiles.
     */
    StorageScope[StorageScope["APPLICATION"] = -1] = "APPLICATION";
    /**
     * The stored data will be scoped to all workspaces of the same profile.
     */
    StorageScope[StorageScope["PROFILE"] = 0] = "PROFILE";
    /**
     * The stored data will be scoped to the current workspace.
     */
    StorageScope[StorageScope["WORKSPACE"] = 1] = "WORKSPACE";
})(StorageScope || (StorageScope = {}));
export var StorageTarget;
(function (StorageTarget) {
    /**
     * The stored data is user specific and applies across machines.
     */
    StorageTarget[StorageTarget["USER"] = 0] = "USER";
    /**
     * The stored data is machine specific.
     */
    StorageTarget[StorageTarget["MACHINE"] = 1] = "MACHINE";
})(StorageTarget || (StorageTarget = {}));
export function loadKeyTargets(storage) {
    const keysRaw = storage.get(TARGET_KEY);
    if (keysRaw) {
        try {
            return JSON.parse(keysRaw);
        }
        catch (error) {
            // Fail gracefully
        }
    }
    return Object.create(null);
}
export class AbstractStorageService extends Disposable {
    static { this.DEFAULT_FLUSH_INTERVAL = 60 * 1000; } // every minute
    constructor(options = { flushInterval: AbstractStorageService.DEFAULT_FLUSH_INTERVAL }) {
        super();
        this._onDidChangeValue = this._register(new PauseableEmitter());
        this._onDidChangeTarget = this._register(new PauseableEmitter());
        this.onDidChangeTarget = this._onDidChangeTarget.event;
        this._onWillSaveState = this._register(new Emitter());
        this.onWillSaveState = this._onWillSaveState.event;
        this.runFlushWhenIdle = this._register(new MutableDisposable());
        this._workspaceKeyTargets = undefined;
        this._profileKeyTargets = undefined;
        this._applicationKeyTargets = undefined;
        this.flushWhenIdleScheduler = this._register(new RunOnceScheduler(() => this.doFlushWhenIdle(), options.flushInterval));
    }
    onDidChangeValue(scope, key, disposable) {
        return Event.filter(this._onDidChangeValue.event, e => e.scope === scope && (key === undefined || e.key === key), disposable);
    }
    doFlushWhenIdle() {
        this.runFlushWhenIdle.value = runWhenGlobalIdle(() => {
            if (this.shouldFlushWhenIdle()) {
                this.flush();
            }
            // repeat
            this.flushWhenIdleScheduler.schedule();
        });
    }
    shouldFlushWhenIdle() {
        return true;
    }
    stopFlushWhenIdle() {
        dispose([this.runFlushWhenIdle, this.flushWhenIdleScheduler]);
    }
    initialize() {
        if (!this.initializationPromise) {
            this.initializationPromise = (async () => {
                // Init all storage locations
                mark('code/willInitStorage');
                try {
                    await this.doInitialize(); // Ask subclasses to initialize storage
                }
                finally {
                    mark('code/didInitStorage');
                }
                // On some OS we do not get enough time to persist state on shutdown (e.g. when
                // Windows restarts after applying updates). In other cases, VSCode might crash,
                // so we periodically save state to reduce the chance of loosing any state.
                // In the browser we do not have support for long running unload sequences. As such,
                // we cannot ask for saving state in that moment, because that would result in a
                // long running operation.
                // Instead, periodically ask customers to save save. The library will be clever enough
                // to only save state that has actually changed.
                this.flushWhenIdleScheduler.schedule();
            })();
        }
        return this.initializationPromise;
    }
    emitDidChangeValue(scope, event) {
        const { key, external } = event;
        // Specially handle `TARGET_KEY`
        if (key === TARGET_KEY) {
            // Clear our cached version which is now out of date
            switch (scope) {
                case -1 /* StorageScope.APPLICATION */:
                    this._applicationKeyTargets = undefined;
                    break;
                case 0 /* StorageScope.PROFILE */:
                    this._profileKeyTargets = undefined;
                    break;
                case 1 /* StorageScope.WORKSPACE */:
                    this._workspaceKeyTargets = undefined;
                    break;
            }
            // Emit as `didChangeTarget` event
            this._onDidChangeTarget.fire({ scope });
        }
        // Emit any other key to outside
        else {
            this._onDidChangeValue.fire({ scope, key, target: this.getKeyTargets(scope)[key], external });
        }
    }
    emitWillSaveState(reason) {
        this._onWillSaveState.fire({ reason });
    }
    get(key, scope, fallbackValue) {
        return this.getStorage(scope)?.get(key, fallbackValue);
    }
    getBoolean(key, scope, fallbackValue) {
        return this.getStorage(scope)?.getBoolean(key, fallbackValue);
    }
    getNumber(key, scope, fallbackValue) {
        return this.getStorage(scope)?.getNumber(key, fallbackValue);
    }
    getObject(key, scope, fallbackValue) {
        return this.getStorage(scope)?.getObject(key, fallbackValue);
    }
    storeAll(entries, external) {
        this.withPausedEmitters(() => {
            for (const entry of entries) {
                this.store(entry.key, entry.value, entry.scope, entry.target, external);
            }
        });
    }
    store(key, value, scope, target, external = false) {
        // We remove the key for undefined/null values
        if (isUndefinedOrNull(value)) {
            this.remove(key, scope, external);
            return;
        }
        // Update our datastructures but send events only after
        this.withPausedEmitters(() => {
            // Update key-target map
            this.updateKeyTarget(key, scope, target);
            // Store actual value
            this.getStorage(scope)?.set(key, value, external);
        });
    }
    remove(key, scope, external = false) {
        // Update our datastructures but send events only after
        this.withPausedEmitters(() => {
            // Update key-target map
            this.updateKeyTarget(key, scope, undefined);
            // Remove actual key
            this.getStorage(scope)?.delete(key, external);
        });
    }
    withPausedEmitters(fn) {
        // Pause emitters
        this._onDidChangeValue.pause();
        this._onDidChangeTarget.pause();
        try {
            fn();
        }
        finally {
            // Resume emitters
            this._onDidChangeValue.resume();
            this._onDidChangeTarget.resume();
        }
    }
    keys(scope, target) {
        const keys = [];
        const keyTargets = this.getKeyTargets(scope);
        for (const key of Object.keys(keyTargets)) {
            const keyTarget = keyTargets[key];
            if (keyTarget === target) {
                keys.push(key);
            }
        }
        return keys;
    }
    updateKeyTarget(key, scope, target, external = false) {
        // Add
        const keyTargets = this.getKeyTargets(scope);
        if (typeof target === 'number') {
            if (keyTargets[key] !== target) {
                keyTargets[key] = target;
                this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets), external);
            }
        }
        // Remove
        else {
            if (typeof keyTargets[key] === 'number') {
                delete keyTargets[key];
                this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets), external);
            }
        }
    }
    get workspaceKeyTargets() {
        if (!this._workspaceKeyTargets) {
            this._workspaceKeyTargets = this.loadKeyTargets(1 /* StorageScope.WORKSPACE */);
        }
        return this._workspaceKeyTargets;
    }
    get profileKeyTargets() {
        if (!this._profileKeyTargets) {
            this._profileKeyTargets = this.loadKeyTargets(0 /* StorageScope.PROFILE */);
        }
        return this._profileKeyTargets;
    }
    get applicationKeyTargets() {
        if (!this._applicationKeyTargets) {
            this._applicationKeyTargets = this.loadKeyTargets(-1 /* StorageScope.APPLICATION */);
        }
        return this._applicationKeyTargets;
    }
    getKeyTargets(scope) {
        switch (scope) {
            case -1 /* StorageScope.APPLICATION */:
                return this.applicationKeyTargets;
            case 0 /* StorageScope.PROFILE */:
                return this.profileKeyTargets;
            default:
                return this.workspaceKeyTargets;
        }
    }
    loadKeyTargets(scope) {
        const storage = this.getStorage(scope);
        return storage ? loadKeyTargets(storage) : Object.create(null);
    }
    isNew(scope) {
        return this.getBoolean(IS_NEW_KEY, scope) === true;
    }
    async flush(reason = WillSaveStateReason.NONE) {
        // Signal event to collect changes
        this._onWillSaveState.fire({ reason });
        const applicationStorage = this.getStorage(-1 /* StorageScope.APPLICATION */);
        const profileStorage = this.getStorage(0 /* StorageScope.PROFILE */);
        const workspaceStorage = this.getStorage(1 /* StorageScope.WORKSPACE */);
        switch (reason) {
            // Unspecific reason: just wait when data is flushed
            case WillSaveStateReason.NONE:
                await Promises.settled([
                    applicationStorage?.whenFlushed() ?? Promise.resolve(),
                    profileStorage?.whenFlushed() ?? Promise.resolve(),
                    workspaceStorage?.whenFlushed() ?? Promise.resolve()
                ]);
                break;
            // Shutdown: we want to flush as soon as possible
            // and not hit any delays that might be there
            case WillSaveStateReason.SHUTDOWN:
                await Promises.settled([
                    applicationStorage?.flush(0) ?? Promise.resolve(),
                    profileStorage?.flush(0) ?? Promise.resolve(),
                    workspaceStorage?.flush(0) ?? Promise.resolve()
                ]);
                break;
        }
    }
    async log() {
        const applicationItems = this.getStorage(-1 /* StorageScope.APPLICATION */)?.items ?? new Map();
        const profileItems = this.getStorage(0 /* StorageScope.PROFILE */)?.items ?? new Map();
        const workspaceItems = this.getStorage(1 /* StorageScope.WORKSPACE */)?.items ?? new Map();
        return logStorage(applicationItems, profileItems, workspaceItems, this.getLogDetails(-1 /* StorageScope.APPLICATION */) ?? '', this.getLogDetails(0 /* StorageScope.PROFILE */) ?? '', this.getLogDetails(1 /* StorageScope.WORKSPACE */) ?? '');
    }
    async optimize(scope) {
        // Await pending data to be flushed to the DB
        // before attempting to optimize the DB
        await this.flush();
        return this.getStorage(scope)?.optimize();
    }
    async switch(to, preserveData) {
        // Signal as event so that clients can store data before we switch
        this.emitWillSaveState(WillSaveStateReason.NONE);
        if (isUserDataProfile(to)) {
            return this.switchToProfile(to, preserveData);
        }
        return this.switchToWorkspace(to, preserveData);
    }
    canSwitchProfile(from, to) {
        if (from.id === to.id) {
            return false; // both profiles are same
        }
        if (isProfileUsingDefaultStorage(to) && isProfileUsingDefaultStorage(from)) {
            return false; // both profiles are using default
        }
        return true;
    }
    switchData(oldStorage, newStorage, scope) {
        this.withPausedEmitters(() => {
            // Signal storage keys that have changed
            const handledkeys = new Set();
            for (const [key, oldValue] of oldStorage) {
                handledkeys.add(key);
                const newValue = newStorage.get(key);
                if (newValue !== oldValue) {
                    this.emitDidChangeValue(scope, { key, external: true });
                }
            }
            for (const [key] of newStorage.items) {
                if (!handledkeys.has(key)) {
                    this.emitDidChangeValue(scope, { key, external: true });
                }
            }
        });
    }
}
export function isProfileUsingDefaultStorage(profile) {
    return profile.isDefault || !!profile.useDefaultFlags?.globalState;
}
export class InMemoryStorageService extends AbstractStorageService {
    constructor() {
        super();
        this.applicationStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
        this.profileStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
        this.workspaceStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
        this._register(this.workspaceStorage.onDidChangeStorage(e => this.emitDidChangeValue(1 /* StorageScope.WORKSPACE */, e)));
        this._register(this.profileStorage.onDidChangeStorage(e => this.emitDidChangeValue(0 /* StorageScope.PROFILE */, e)));
        this._register(this.applicationStorage.onDidChangeStorage(e => this.emitDidChangeValue(-1 /* StorageScope.APPLICATION */, e)));
    }
    getStorage(scope) {
        switch (scope) {
            case -1 /* StorageScope.APPLICATION */:
                return this.applicationStorage;
            case 0 /* StorageScope.PROFILE */:
                return this.profileStorage;
            default:
                return this.workspaceStorage;
        }
    }
    getLogDetails(scope) {
        switch (scope) {
            case -1 /* StorageScope.APPLICATION */:
                return 'inMemory (application)';
            case 0 /* StorageScope.PROFILE */:
                return 'inMemory (profile)';
            default:
                return 'inMemory (workspace)';
        }
    }
    async doInitialize() { }
    async switchToProfile() {
        // no-op when in-memory
    }
    async switchToWorkspace() {
        // no-op when in-memory
    }
    shouldFlushWhenIdle() {
        return false;
    }
    hasScope(scope) {
        return false;
    }
}
export async function logStorage(application, profile, workspace, applicationPath, profilePath, workspacePath) {
    const safeParse = (value) => {
        try {
            return JSON.parse(value);
        }
        catch (error) {
            return value;
        }
    };
    const applicationItems = new Map();
    const applicationItemsParsed = new Map();
    application.forEach((value, key) => {
        applicationItems.set(key, value);
        applicationItemsParsed.set(key, safeParse(value));
    });
    const profileItems = new Map();
    const profileItemsParsed = new Map();
    profile.forEach((value, key) => {
        profileItems.set(key, value);
        profileItemsParsed.set(key, safeParse(value));
    });
    const workspaceItems = new Map();
    const workspaceItemsParsed = new Map();
    workspace.forEach((value, key) => {
        workspaceItems.set(key, value);
        workspaceItemsParsed.set(key, safeParse(value));
    });
    if (applicationPath !== profilePath) {
        console.group(`Storage: Application (path: ${applicationPath})`);
    }
    else {
        console.group(`Storage: Application & Profile (path: ${applicationPath}, default profile)`);
    }
    const applicationValues = [];
    applicationItems.forEach((value, key) => {
        applicationValues.push({ key, value });
    });
    console.table(applicationValues);
    console.groupEnd();
    console.log(applicationItemsParsed);
    if (applicationPath !== profilePath) {
        console.group(`Storage: Profile (path: ${profilePath}, profile specific)`);
        const profileValues = [];
        profileItems.forEach((value, key) => {
            profileValues.push({ key, value });
        });
        console.table(profileValues);
        console.groupEnd();
        console.log(profileItemsParsed);
    }
    console.group(`Storage: Workspace (path: ${workspacePath})`);
    const workspaceValues = [];
    workspaceItems.forEach((value, key) => {
        workspaceValues.push({ key, value });
    });
    console.table(workspaceValues);
    console.groupEnd();
    console.log(workspaceItemsParsed);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzlGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDakYsT0FBTyxFQUFFLFVBQVUsRUFBbUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDNUcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSx1QkFBdUIsRUFBaUMsT0FBTyxFQUFFLFdBQVcsRUFBZ0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUMzSixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGlCQUFpQixFQUFvQixNQUFNLGlEQUFpRCxDQUFDO0FBR3RHLE1BQU0sQ0FBQyxNQUFNLFVBQVUsR0FBRyx5QkFBeUIsQ0FBQztBQUNwRCxNQUFNLENBQUMsTUFBTSxVQUFVLEdBQUcsMEJBQTBCLENBQUM7QUFFckQsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLGVBQWUsQ0FBa0IsZ0JBQWdCLENBQUMsQ0FBQztBQUVsRixNQUFNLENBQU4sSUFBWSxtQkFXWDtBQVhELFdBQVksbUJBQW1CO0lBRTlCOztPQUVHO0lBQ0gsNkRBQUksQ0FBQTtJQUVKOztPQUVHO0lBQ0gscUVBQVEsQ0FBQTtBQUNULENBQUMsRUFYVyxtQkFBbUIsS0FBbkIsbUJBQW1CLFFB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