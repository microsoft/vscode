/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { reviveIdentifier } from '../../workspace/common/workspace.js';
export class StorageDatabaseChannel extends Disposable {
    static { this.STORAGE_CHANGE_DEBOUNCE_TIME = 100; }
    constructor(logService, storageMainService) {
        super();
        this.logService = logService;
        this.storageMainService = storageMainService;
        this.onDidChangeApplicationStorageEmitter = this._register(new Emitter());
        this.mapProfileToOnDidChangeProfileStorageEmitter = new Map();
        this.registerStorageChangeListeners(storageMainService.applicationStorage, this.onDidChangeApplicationStorageEmitter);
    }
    //#region Storage Change Events
    registerStorageChangeListeners(storage, emitter) {
        // Listen for changes in provided storage to send to listeners
        // that are listening. Use a debouncer to reduce IPC traffic.
        this._register(Event.debounce(storage.onDidChangeStorage, (prev, cur) => {
            if (!prev) {
                prev = [cur];
            }
            else {
                prev.push(cur);
            }
            return prev;
        }, StorageDatabaseChannel.STORAGE_CHANGE_DEBOUNCE_TIME)(events => {
            if (events.length) {
                emitter.fire(this.serializeStorageChangeEvents(events, storage));
            }
        }));
    }
    serializeStorageChangeEvents(events, storage) {
        const changed = new Map();
        const deleted = new Set();
        events.forEach(event => {
            const existing = storage.get(event.key);
            if (typeof existing === 'string') {
                changed.set(event.key, existing);
            }
            else {
                deleted.add(event.key);
            }
        });
        return {
            changed: Array.from(changed.entries()),
            deleted: Array.from(deleted.values())
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen(_, event, arg) {
        switch (event) {
            case 'onDidChangeStorage': {
                const profile = arg.profile ? revive(arg.profile) : undefined;
                // Without profile: application scope
                if (!profile) {
                    return this.onDidChangeApplicationStorageEmitter.event;
                }
                // With profile: profile scope for the profile
                let profileStorageChangeEmitter = this.mapProfileToOnDidChangeProfileStorageEmitter.get(profile.id);
                if (!profileStorageChangeEmitter) {
                    profileStorageChangeEmitter = this._register(new Emitter());
                    this.registerStorageChangeListeners(this.storageMainService.profileStorage(profile), profileStorageChangeEmitter);
                    this.mapProfileToOnDidChangeProfileStorageEmitter.set(profile.id, profileStorageChangeEmitter);
                }
                return profileStorageChangeEmitter.event;
            }
        }
        throw new Error(`Event not found: ${event}`);
    }
    //#endregion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async call(_, command, arg) {
        const profile = arg.profile ? revive(arg.profile) : undefined;
        const workspace = reviveIdentifier(arg.workspace);
        // Get storage to be ready
        const storage = await this.withStorageInitialized(profile, workspace);
        // handle call
        switch (command) {
            case 'getItems': {
                return Array.from(storage.items.entries());
            }
            case 'updateItems': {
                const items = arg;
                if (items.insert) {
                    for (const [key, value] of items.insert) {
                        storage.set(key, value);
                    }
                }
                items.delete?.forEach(key => storage.delete(key));
                break;
            }
            case 'optimize': {
                return storage.optimize();
            }
            case 'isUsed': {
                const path = arg.payload;
                if (typeof path === 'string') {
                    return this.storageMainService.isUsed(path);
                }
                return false;
            }
            default:
                throw new Error(`Call not found: ${command}`);
        }
    }
    async withStorageInitialized(profile, workspace) {
        let storage;
        if (workspace) {
            storage = this.storageMainService.workspaceStorage(workspace);
        }
        else if (profile) {
            storage = this.storageMainService.profileStorage(profile);
        }
        else {
            storage = this.storageMainService.applicationStorage;
        }
        try {
            await storage.init();
        }
        catch (error) {
            this.logService.error(`StorageIPC#init: Unable to init ${workspace ? 'workspace' : profile ? 'profile' : 'application'} storage due to ${error}`);
        }
        return storage;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZUlwYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3N0b3JhZ2UvZWxlY3Ryb24tbWFpbi9zdG9yYWdlSXBjLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQU83RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQTJCLE1BQU0scUNBQXFDLENBQUM7QUFFaEcsTUFBTSxPQUFPLHNCQUF1QixTQUFRLFVBQVU7YUFFN0IsaUNBQTRCLEdBQUcsR0FBRyxBQUFOLENBQU87SUFNM0QsWUFDa0IsVUFBdUIsRUFDdkIsa0JBQXVDO1FBRXhELEtBQUssRUFBRSxDQUFDO1FBSFMsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUN2Qix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBTnhDLHlDQUFvQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWlDLENBQUMsQ0FBQztRQUVwRyxpREFBNEMsR0FBRyxJQUFJLEdBQUcsRUFBbUUsQ0FBQztRQVExSSxJQUFJLENBQUMsOEJBQThCLENBQUMsa0JBQWtCLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLG9DQUFvQyxDQUFDLENBQUM7SUFDdkgsQ0FBQztJQUVELCtCQUErQjtJQUV2Qiw4QkFBOEIsQ0FBQyxPQUFxQixFQUFFLE9BQStDO1FBRTVHLDhEQUE4RDtRQUM5RCw2REFBNkQ7UUFFN0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLElBQXVDLEVBQUUs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