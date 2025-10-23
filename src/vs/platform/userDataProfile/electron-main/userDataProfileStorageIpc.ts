/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import { IProfileStorageChanges, IProfileStorageValueChanges } from '../common/userDataProfileStorageService.js';
import { loadKeyTargets, StorageScope, TARGET_KEY } from '../../storage/common/storage.js';
import { IBaseSerializableStorageRequest } from '../../storage/common/storageIpc.js';
import { IStorageMain } from '../../storage/electron-main/storageMain.js';
import { IStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { IUserDataProfile, IUserDataProfilesService } from '../common/userDataProfile.js';

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
				onWillAddFirstListener: () => disposable.value = this.registerStorageChangeListeners(),
				// Stop listening to profile storage changes when no one is listening
				onDidRemoveLastListener: () => disposable.value = undefined
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
		disposables.add(Event.debounce(this.storageMainService.onDidChangeProfileStorage, (changes: Map<string, { profile: IUserDataProfile; keys: string[]; storage: IStorageMain }> | undefined, e) => {
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
		throw new Error(`[ProfileStorageChangesListenerChannel] Event not found: ${event}`);
	}

	async call(_: unknown, command: string): Promise<any> {
		throw new Error(`Call not found: ${command}`);
	}

}
