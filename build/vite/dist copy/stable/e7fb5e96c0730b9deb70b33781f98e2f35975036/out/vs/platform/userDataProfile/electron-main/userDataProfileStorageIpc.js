/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { loadKeyTargets, TARGET_KEY } from '../../storage/common/storage.js';
export class ProfileStorageChangesListenerChannel extends Disposable {
    constructor(storageMainService, userDataProfilesService, logService) {
        super();
        this.storageMainService = storageMainService;
        this.userDataProfilesService = userDataProfilesService;
        this.logService = logService;
        const disposable = this._register(new MutableDisposable());
        this._onDidChange = this._register(new Emitter({
            // Start listening to profile storage changes only when someone is listening
            onWillAddFirstListener: () => disposable.value = this.registerStorageChangeListeners(),
            // Stop listening to profile storage changes when no one is listening
            onDidRemoveLastListener: () => disposable.value = undefined
        }));
    }
    registerStorageChangeListeners() {
        this.logService.debug('ProfileStorageChangesListenerChannel#registerStorageChangeListeners');
        const disposables = new DisposableStore();
        disposables.add(Event.debounce(this.storageMainService.applicationStorage.onDidChangeStorage, (keys, e) => {
            if (keys) {
                keys.push(e.key);
            }
            else {
                keys = [e.key];
            }
            return keys;
        }, 100)(keys => this.onDidChangeApplicationStorage(keys)));
        disposables.add(Event.debounce(this.storageMainService.onDidChangeProfileStorage, (changes, e) => {
            if (!changes) {
                changes = new Map();
            }
            let profileChanges = changes.get(e.profile.id);
            if (!profileChanges) {
                changes.set(e.profile.id, profileChanges = { profile: e.profile, keys: [], storage: e.storage });
            }
            profileChanges.keys.push(e.key);
            return changes;
        }, 100)(keys => this.onDidChangeProfileStorage(keys)));
        return disposables;
    }
    onDidChangeApplicationStorage(keys) {
        const targetChangedProfiles = keys.includes(TARGET_KEY) ? [this.userDataProfilesService.defaultProfile] : [];
        const profileStorageValueChanges = [];
        keys = keys.filter(key => key !== TARGET_KEY);
        if (keys.length) {
            const keyTargets = loadKeyTargets(this.storageMainService.applicationStorage.storage);
            profileStorageValueChanges.push({ profile: this.userDataProfilesService.defaultProfile, changes: keys.map(key => ({ key, scope: 0 /* StorageScope.PROFILE */, target: keyTargets[key] })) });
        }
        this.triggerEvents(targetChangedProfiles, profileStorageValueChanges);
    }
    onDidChangeProfileStorage(changes) {
        const targetChangedProfiles = [];
        const profileStorageValueChanges = new Map();
        for (const [profileId, profileChanges] of changes.entries()) {
            if (profileChanges.keys.includes(TARGET_KEY)) {
                targetChangedProfiles.push(profileChanges.profile);
            }
            const keys = profileChanges.keys.filter(key => key !== TARGET_KEY);
            if (keys.length) {
                const keyTargets = loadKeyTargets(profileChanges.storage.storage);
                profileStorageValueChanges.set(profileId, { profile: profileChanges.profile, changes: keys.map(key => ({ key, scope: 0 /* StorageScope.PROFILE */, target: keyTargets[key] })) });
            }
        }
        this.triggerEvents(targetChangedProfiles, [...profileStorageValueChanges.values()]);
    }
    triggerEvents(targetChanges, valueChanges) {
        if (targetChanges.length || valueChanges.length) {
            this._onDidChange.fire({ valueChanges, targetChanges });
        }
    }
    listen(_, event, arg) {
        switch (event) {
            case 'onDidChange': return this._onDidChange.event;
        }
        throw new Error(`[ProfileStorageChangesListenerChannel] Event not found: ${event}`);
    }
    async call(_, command) {
        throw new Error(`Call not found: ${command}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlU3RvcmFnZUlwYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9lbGVjdHJvbi1tYWluL3VzZXJEYXRhUHJvZmlsZVN0b3JhZ2VJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSWhILE9BQU8sRUFBRSxjQUFjLEVBQWdCLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBTTNGLE1BQU0sT0FBTyxvQ0FBcUMsU0FBUSxVQUFVO0lBSW5FLFlBQ2tCLGtCQUF1QyxFQUN2Qyx1QkFBaUQsRUFDakQsVUFBdUI7UUFFeEMsS0FBSyxFQUFFLENBQUM7UUFKUyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQ3ZDLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBMEI7UUFDakQsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUd4QyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQWUsQ0FBQyxDQUFDO1FBQ3hFLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FDN0M7WUFDQyw0RUFBNEU7WUFDNUUsc0JBQXNCLEVBQUUsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsOEJBQThCLEVBQUU7WUFDdEYscUVBQXFFO1lBQ3JFLHVCQUF1QixFQUFFLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQUcsU0FBUztTQUMzRCxDQUNELENBQUMsQ0FBQztJQUNK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