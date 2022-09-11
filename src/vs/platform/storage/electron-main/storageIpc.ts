/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILogService } from 'vs/platform/log/common/log';
import { IProfileStorageChanges, IProfileStorageValueChanges } from 'vs/platform/storage/common/profileStorageService';
import { loadKeyTargets, StorageScope, TARGET_KEY } from 'vs/platform/storage/common/storage';
import { IBaseSerializableStorageRequest, ISerializableItemsChangeEvent, ISerializableUpdateRequest, Key, Value } from 'vs/platform/storage/common/storageIpc';
import { IStorageChangeEvent, IStorageMain } from 'vs/platform/storage/electron-main/storageMain';
import { IStorageMainService } from 'vs/platform/storage/electron-main/storageMainService';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { reviveIdentifier, IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class StorageDatabaseChannel extends Disposable implements IServerChannel {

	private static readonly STORAGE_CHANGE_DEBOUNCE_TIME = 100;

	private readonly onDidChangeApplicationStorageEmitter = this._register(new Emitter<ISerializableItemsChangeEvent>());

	private readonly mapProfileToOnDidChangeProfileStorageEmitter = new Map<string /* profile ID */, Emitter<ISerializableItemsChangeEvent>>();

	constructor(
		private readonly logService: ILogService,
		private readonly storageMainService: IStorageMainService
	) {
		super();

		this.registerStorageChangeListeners(storageMainService.applicationStorage, this.onDidChangeApplicationStorageEmitter);
	}

	//#region Storage Change Events

	private registerStorageChangeListeners(storage: IStorageMain, emitter: Emitter<ISerializableItemsChangeEvent>): void {

		// Listen for changes in provided storage to send to listeners
		// that are listening. Use a debouncer to reduce IPC traffic.

		this._register(Event.debounce(storage.onDidChangeStorage, (prev: IStorageChangeEvent[] | undefined, cur: IStorageChangeEvent) => {
			if (!prev) {
				prev = [cur];
			} else {
				prev.push(cur);
			}

			return prev;
		}, StorageDatabaseChannel.STORAGE_CHANGE_DEBOUNCE_TIME)(events => {
			if (events.length) {
				emitter.fire(this.serializeStorageChangeEvents(events, storage));
			}
		}));
	}

	private serializeStorageChangeEvents(events: IStorageChangeEvent[], storage: IStorageMain): ISerializableItemsChangeEvent {
		const changed = new Map<Key, Value>();
		const deleted = new Set<Key>();
		events.forEach(event => {
			const existing = storage.get(event.key);
			if (typeof existing === 'string') {
				changed.set(event.key, existing);
			} else {
				deleted.add(event.key);
			}
		});

		return {
			changed: Array.from(changed.entries()),
			deleted: Array.from(deleted.values())
		};
	}

	listen(_: unknown, event: string, arg: IBaseSerializableStorageRequest): Event<any> {
		switch (event) {
			case 'onDidChangeStorage': {
				const profile = arg.profile ? revive<IUserDataProfile>(arg.profile) : undefined;

				// Without profile: application scope
				if (!profile) {
					return this.onDidChangeApplicationStorageEmitter.event;
				}

				// With profile: profile scope for the profile
				let profileStorageChangeEmitter = this.mapProfileToOnDidChangeProfileStorageEmitter.get(profile.id);
				if (!profileStorageChangeEmitter) {
					profileStorageChangeEmitter = this._register(new Emitter<ISerializableItemsChangeEvent>());
					this.registerStorageChangeListeners(this.storageMainService.profileStorage(profile), profileStorageChangeEmitter);
					this.mapProfileToOnDidChangeProfileStorageEmitter.set(profile.id, profileStorageChangeEmitter);
				}

				return profileStorageChangeEmitter.event;
			}
		}

		throw new Error(`Event not found: ${event}`);
	}

	//#endregion

	async call(_: unknown, command: string, arg: IBaseSerializableStorageRequest): Promise<any> {
		const profile = arg.profile ? revive<IUserDataProfile>(arg.profile) : undefined;
		const workspace = reviveIdentifier(arg.workspace);

		// Get storage to be ready
		const storage = await this.withStorageInitialized(profile, workspace);

		// handle call
		switch (command) {
			case 'getItems': {
				return Array.from(storage.items.entries());
			}

			case 'updateItems': {
				const items: ISerializableUpdateRequest = arg;

				if (items.insert) {
					for (const [key, value] of items.insert) {
						storage.set(key, value);
					}
				}

				items.delete?.forEach(key => storage.delete(key));

				break;
			}

			case 'isUsed': {
				const path = arg.payload as string | undefined;
				if (typeof path === 'string') {
					return this.storageMainService.isUsed(path);
				}
			}

			default:
				throw new Error(`Call not found: ${command}`);
		}
	}

	private async withStorageInitialized(profile: IUserDataProfile | undefined, workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): Promise<IStorageMain> {
		let storage: IStorageMain;
		if (workspace) {
			storage = this.storageMainService.workspaceStorage(workspace);
		} else if (profile) {
			storage = this.storageMainService.profileStorage(profile);
		} else {
			storage = this.storageMainService.applicationStorage;
		}

		try {
			await storage.init();
		} catch (error) {
			this.logService.error(`StorageIPC#init: Unable to init ${workspace ? 'workspace' : profile ? 'profile' : 'application'} storage due to ${error}`);
		}

		return storage;
	}
}

export class ProfileStorageChangesListenerChannel extends Disposable implements IServerChannel {

	private readonly _onDidChange: Emitter<IProfileStorageChanges>;

	constructor(
		private readonly storageMainService: IStorageMainService,
		private readonly userDataProfilesService: IUserDataProfilesService,
		private readonly logService: ILogService
	) {
		super();
		const disposable = this._register(new MutableDisposable<IDisposable>());
		this._onDidChange = this._register(new Emitter<IProfileStorageChanges>(
			{
				// Start listening to profile storage changes only when someone is listening
				onFirstListenerAdd: () => disposable.value = this.registerStorageChangeListeners(),
				// Stop listening to profile storage changes when no one is listening
				onLastListenerRemove: () => disposable.value = undefined
			}
		));
	}

	private registerStorageChangeListeners(): IDisposable {
		this.logService.debug('ProfileStorageChangesListenerChannel#registerStorageChangeListeners');
		const disposables = new DisposableStore();
		disposables.add(Event.debounce(this.storageMainService.applicationStorage.onDidChangeStorage, (keys: string[] | undefined, e) => {
			if (keys) {
				keys.push(e.key);
			} else {
				keys = [e.key];
			}
			return keys;
		}, 100)(keys => this.onDidChangeApplicationStorage(keys)));
		disposables.add(Event.debounce(this.storageMainService.onDidChangeProfileStorageData, (changes: Map<string, { profile: IUserDataProfile; keys: string[]; storage: IStorageMain }> | undefined, e) => {
			if (!changes) {
				changes = new Map<string, { profile: IUserDataProfile; keys: string[]; storage: IStorageMain }>();
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

	private onDidChangeApplicationStorage(keys: string[]): void {
		const targetChangedProfiles: IUserDataProfile[] = keys.includes(TARGET_KEY) ? [this.userDataProfilesService.defaultProfile] : [];
		const profileStorageValueChanges: IProfileStorageValueChanges[] = [];
		keys = keys.filter(key => key !== TARGET_KEY);
		if (keys.length) {
			const keyTargets = loadKeyTargets(this.storageMainService.applicationStorage.storage);
			profileStorageValueChanges.push({ profile: this.userDataProfilesService.defaultProfile, changes: keys.map(key => ({ key, scope: StorageScope.PROFILE, target: keyTargets[key] })) });
		}
		this.triggerEvents(targetChangedProfiles, profileStorageValueChanges);
	}

	private onDidChangeProfileStorage(changes: Map<string, { profile: IUserDataProfile; keys: string[]; storage: IStorageMain }>): void {
		const targetChangedProfiles: IUserDataProfile[] = [];
		const profileStorageValueChanges = new Map<string, IProfileStorageValueChanges>();
		for (const [profileId, profileChanges] of changes.entries()) {
			if (profileChanges.keys.includes(TARGET_KEY)) {
				targetChangedProfiles.push(profileChanges.profile);
			}
			const keys = profileChanges.keys.filter(key => key !== TARGET_KEY);
			if (keys.length) {
				const keyTargets = loadKeyTargets(profileChanges.storage.storage);
				profileStorageValueChanges.set(profileId, { profile: profileChanges.profile, changes: keys.map(key => ({ key, scope: StorageScope.PROFILE, target: keyTargets[key] })) });
			}
		}
		this.triggerEvents(targetChangedProfiles, [...profileStorageValueChanges.values()]);
	}

	private triggerEvents(targetChanges: IUserDataProfile[], valueChanges: IProfileStorageValueChanges[]): void {
		if (targetChanges.length || valueChanges.length) {
			this._onDidChange.fire({ valueChanges, targetChanges });
		}
	}

	listen(_: unknown, event: string, arg: IBaseSerializableStorageRequest): Event<any> {
		switch (event) {
			case 'onDidChange': return this._onDidChange.event;
		}
		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string): Promise<any> {
		throw new Error(`Call not found: ${command}`);
	}

}
