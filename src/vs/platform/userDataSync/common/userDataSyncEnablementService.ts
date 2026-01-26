/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isWeb } from '../../../base/common/platform.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IApplicationStorageValueChangeEvent, IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { ALL_SYNC_RESOURCES, getEnablementKey, IUserDataSyncEnablementService, IUserDataSyncStoreManagementService, SyncResource } from './userDataSync.js';

const enablementKey = 'sync.enable';

export class UserDataSyncEnablementService extends Disposable implements IUserDataSyncEnablementService {

	_serviceBrand: undefined;

	private _onDidChangeEnablement = new Emitter<boolean>();
	readonly onDidChangeEnablement: Event<boolean> = this._onDidChangeEnablement.event;

	private _onDidChangeResourceEnablement = new Emitter<[SyncResource, boolean]>();
	readonly onDidChangeResourceEnablement: Event<[SyncResource, boolean]> = this._onDidChangeResourceEnablement.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IEnvironmentService protected readonly environmentService: IEnvironmentService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
	) {
		super();
		this._register(storageService.onDidChangeValue(StorageScope.APPLICATION, undefined, this._store)(e => this.onDidStorageChange(e)));
	}

	isEnabled(): boolean {
		switch (this.environmentService.sync) {
			case 'on':
				return true;
			case 'off':
				return false;
		}
		return this.storageService.getBoolean(enablementKey, StorageScope.APPLICATION, false);
	}

	canToggleEnablement(): boolean {
		return this.userDataSyncStoreManagementService.userDataSyncStore !== undefined && this.environmentService.sync === undefined;
	}

	setEnablement(enabled: boolean): void {
		if (enabled && !this.canToggleEnablement()) {
			return;
		}
		this.storageService.store(enablementKey, enabled, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	isResourceEnabled(resource: SyncResource, defaultValue?: boolean): boolean {
		const storedValue = this.storageService.getBoolean(getEnablementKey(resource), StorageScope.APPLICATION);
		defaultValue = defaultValue ?? resource !== SyncResource.Prompts;
		return storedValue ?? defaultValue;
	}

	isResourceEnablementConfigured(resource: SyncResource): boolean {
		const storedValue = this.storageService.getBoolean(getEnablementKey(resource), StorageScope.APPLICATION);

		return (storedValue !== undefined);
	}

	setResourceEnablement(resource: SyncResource, enabled: boolean): void {
		if (this.isResourceEnabled(resource) !== enabled) {
			const resourceEnablementKey = getEnablementKey(resource);
			this.storeResourceEnablement(resourceEnablementKey, enabled);
		}
	}

	getResourceSyncStateVersion(resource: SyncResource): string | undefined {
		return undefined;
	}

	private storeResourceEnablement(resourceEnablementKey: string, enabled: boolean): void {
		this.storageService.store(resourceEnablementKey, enabled, StorageScope.APPLICATION, isWeb ? StorageTarget.USER /* sync in web */ : StorageTarget.MACHINE);
	}

	private onDidStorageChange(storageChangeEvent: IApplicationStorageValueChangeEvent): void {
		if (enablementKey === storageChangeEvent.key) {
			this._onDidChangeEnablement.fire(this.isEnabled());
			return;
		}

		const resourceKey = ALL_SYNC_RESOURCES.filter(resourceKey => getEnablementKey(resourceKey) === storageChangeEvent.key)[0];
		if (resourceKey) {
			this._onDidChangeResourceEnablement.fire([resourceKey, this.isResourceEnabled(resourceKey)]);
			return;
		}
	}
}
