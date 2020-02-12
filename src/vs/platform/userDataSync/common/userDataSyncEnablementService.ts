/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncEnablementService, ResourceKey, ALL_RESOURCE_KEYS } from 'vs/platform/userDataSync/common/userDataSync';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IStorageService, IWorkspaceStorageChangeEvent, StorageScope } from 'vs/platform/storage/common/storage';

const enablementKey = 'sync.enable';
function getEnablementKey(resourceKey: ResourceKey) { return `${enablementKey}.${resourceKey}`; }

export class UserDataSyncEnablementService extends Disposable implements IUserDataSyncEnablementService {

	_serviceBrand: any;

	private _onDidChangeEnablement = new Emitter<boolean>();
	readonly onDidChangeEnablement: Event<boolean> = this._onDidChangeEnablement.event;

	private _onDidChangeResourceEnablement = new Emitter<[ResourceKey, boolean]>();
	readonly onDidChangeResourceEnablement: Event<[ResourceKey, boolean]> = this._onDidChangeResourceEnablement.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		this._register(storageService.onDidChangeStorage(e => this.onDidStorageChange(e)));
	}

	isEnabled(): boolean {
		return this.storageService.getBoolean(enablementKey, StorageScope.GLOBAL, false);
	}

	setEnablement(enabled: boolean): void {
		if (this.isEnabled() !== enabled) {
			this.storageService.store(enablementKey, enabled, StorageScope.GLOBAL);
		}
	}

	isResourceEnabled(resourceKey: ResourceKey): boolean {
		return this.storageService.getBoolean(getEnablementKey(resourceKey), StorageScope.GLOBAL, true);
	}

	setResourceEnablement(resourceKey: ResourceKey, enabled: boolean): void {
		if (this.isResourceEnabled(resourceKey) !== enabled) {
			this.storageService.store(getEnablementKey(resourceKey), enabled, StorageScope.GLOBAL);
		}
	}

	private onDidStorageChange(workspaceStorageChangeEvent: IWorkspaceStorageChangeEvent): void {
		if (workspaceStorageChangeEvent.scope === StorageScope.GLOBAL) {
			if (enablementKey === workspaceStorageChangeEvent.key) {
				this._onDidChangeEnablement.fire(this.isEnabled());
				return;
			}
			const resourceKey = ALL_RESOURCE_KEYS.filter(resourceKey => getEnablementKey(resourceKey) === workspaceStorageChangeEvent.key)[0];
			if (resourceKey) {
				this._onDidChangeResourceEnablement.fire([resourceKey, this.isEnabled()]);
				return;
			}
		}
	}

}
