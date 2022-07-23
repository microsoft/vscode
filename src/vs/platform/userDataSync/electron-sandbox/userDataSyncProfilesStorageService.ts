/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { IStorageDatabase } from 'vs/base/parts/storage/common/storage';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractUserDataSyncProfilesStorageService, IProfileStorageChanges, IUserDataSyncProfilesStorageService } from 'vs/platform/userDataSync/common/userDataSyncProfilesStorageService';
import { isProfileUsingDefaultStorage, IStorageService } from 'vs/platform/storage/common/storage';
import { ApplicationStorageDatabaseClient, ProfileStorageDatabaseClient } from 'vs/platform/storage/common/storageIpc';
import { IUserDataProfile, IUserDataProfilesService, reviveProfile } from 'vs/platform/userDataProfile/common/userDataProfile';

export class UserDataSyncProfilesStorageService extends AbstractUserDataSyncProfilesStorageService implements IUserDataSyncProfilesStorageService {

	private readonly _onDidChange: Emitter<IProfileStorageChanges>;
	readonly onDidChange: Event<IProfileStorageChanges>;

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super(storageService);

		const channel = mainProcessService.getChannel('profileStorageListener');
		const disposable = this._register(new MutableDisposable());
		this._onDidChange = this._register(new Emitter<IProfileStorageChanges>({
			// Start listening to profile storage changes only when someone is listening
			onFirstListenerAdd: () => {
				disposable.value = channel.listen<IProfileStorageChanges>('onDidChange')(e => {
					logService.trace('profile storage changes', e);
					this._onDidChange.fire({
						targetChanges: e.targetChanges.map(profile => reviveProfile(profile, userDataProfilesService.profilesHome.scheme)),
						valueChanges: e.valueChanges.map(e => ({ ...e, profile: reviveProfile(e.profile, userDataProfilesService.profilesHome.scheme) }))
					});
				});
			},
			// Stop listening to profile storage changes when no one is listening
			onLastListenerRemove: () => disposable.value = undefined
		}));
		this.onDidChange = this._onDidChange.event;
	}

	protected async createStorageDatabase(profile: IUserDataProfile): Promise<IStorageDatabase> {
		const storageChannel = this.mainProcessService.getChannel('storage');
		return isProfileUsingDefaultStorage(profile) ? new ApplicationStorageDatabaseClient(storageChannel) : new ProfileStorageDatabaseClient(storageChannel, profile);
	}
}
