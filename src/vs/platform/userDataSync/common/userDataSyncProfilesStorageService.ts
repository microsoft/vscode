/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, isDisposable } from 'vs/base/common/lifecycle';
import { IStorage, IStorageDatabase, Storage } from 'vs/base/parts/storage/common/storage';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AbstractStorageService, IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';

export interface IProfileStorageValueChanges {
	readonly profile: IUserDataProfile;
	readonly changes: IStorageValueChangeEvent[];
}

export interface IProfileStorageChanges {
	readonly targetChanges: IUserDataProfile[];
	readonly valueChanges: IProfileStorageValueChanges[];
}

export interface IStorageValue {
	readonly value: string | undefined;
	readonly target: StorageTarget;
}

export const IUserDataSyncProfilesStorageService = createDecorator<IUserDataSyncProfilesStorageService>('IUserDataSyncProfilesStorageService');
export interface IUserDataSyncProfilesStorageService {
	readonly _serviceBrand: undefined;

	/**
	 * Emitted whenever data is updated or deleted in a profile storage or target of a profile storage entry changes
	 */
	readonly onDidChange: Event<IProfileStorageChanges>;

	/**
	 * Return the requested profile storage data
	 * @param profile The profile from which the data has to be read from
	 */
	readStorageData(profile: IUserDataProfile): Promise<Map<string, IStorageValue>>;

	/**
	 * Update the given profile storage data in the profile storage
	 * @param profile The profile to which the data has to be written to
	 * @param data Data that has to be updated
	 * @param target Storage target of the data
	 */
	updateStorageData(profile: IUserDataProfile, data: Map<string, string | undefined | null>, target: StorageTarget): Promise<void>;
}

export abstract class AbstractUserDataSyncProfilesStorageService extends Disposable implements IUserDataSyncProfilesStorageService {

	_serviceBrand: undefined;

	readonly abstract onDidChange: Event<IProfileStorageChanges>;

	constructor(
		@IStorageService protected readonly storageService: IStorageService
	) {
		super();
	}

	async readStorageData(profile: IUserDataProfile): Promise<Map<string, IStorageValue>> {
		// Use current storage service if the profile is same
		if (this.storageService.hasScope(profile)) {
			return this.getItems(this.storageService);
		}

		const storageDatabase = await this.createStorageDatabase(profile);
		const storageService = new StorageService(storageDatabase);
		try {
			await storageService.initialize();
			return this.getItems(storageService);
		} finally {
			storageService.dispose();
			await this.closeAndDispose(storageDatabase);
		}
	}

	async updateStorageData(profile: IUserDataProfile, data: Map<string, string | undefined | null>, target: StorageTarget): Promise<void> {
		// Use current storage service if the profile is same
		if (this.storageService.hasScope(profile)) {
			return this.writeItems(this.storageService, data, target);
		}

		const storageDatabase = await this.createStorageDatabase(profile);
		const storageService = new StorageService(storageDatabase);
		try {
			await storageService.initialize();
			this.writeItems(storageService, data, target);
			await storageService.flush();
		} finally {
			storageService.dispose();
			await this.closeAndDispose(storageDatabase);
		}
	}

	private getItems(storageService: IStorageService): Map<string, IStorageValue> {
		const result = new Map<string, IStorageValue>();
		const populate = (target: StorageTarget) => {
			for (const key of storageService.keys(StorageScope.PROFILE, target)) {
				result.set(key, { value: storageService.get(key, StorageScope.PROFILE), target });
			}
		};
		populate(StorageTarget.USER);
		populate(StorageTarget.MACHINE);
		return result;
	}

	private writeItems(storageService: IStorageService, items: Map<string, string | undefined | null>, target: StorageTarget): void {
		for (const [key, value] of items) {
			storageService.store(key, value, StorageScope.PROFILE, target);
		}
	}

	protected async closeAndDispose(storageDatabase: IStorageDatabase): Promise<void> {
		try {
			await storageDatabase.close();
		} finally {
			if (isDisposable(storageDatabase)) {
				storageDatabase.dispose();
			}
		}
	}

	protected abstract createStorageDatabase(profile: IUserDataProfile): Promise<IStorageDatabase>;
}

class StorageService extends AbstractStorageService {

	private readonly profileStorage: IStorage;

	constructor(profileStorageDatabase: IStorageDatabase) {
		super({ flushInterval: 100 });
		this.profileStorage = this._register(new Storage(profileStorageDatabase));
	}

	protected doInitialize(): Promise<void> {
		return this.profileStorage.init();
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		return scope === StorageScope.PROFILE ? this.profileStorage : undefined;
	}

	protected getLogDetails(): string | undefined { return undefined; }
	protected async switchToProfile(): Promise<void> { }
	protected async switchToWorkspace(): Promise<void> { }
	hasScope() { return false; }
}
