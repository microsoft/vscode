/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, isDisposable } from 'vs/base/common/lifecycle';
import { IStorage, IStorageDatabase, Storage } from 'vs/base/parts/storage/common/storage';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AbstractStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
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

export const IProfileStorageService = createDecorator<IProfileStorageService>('IProfileStorageService');
export interface IProfileStorageService {
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

export abstract class AbstractProfileStorageService extends Disposable implements IProfileStorageService {

	_serviceBrand: undefined;

	abstract onDidChange: Event<IProfileStorageChanges>;

	async readStorageData(profile: IUserDataProfile): Promise<Map<string, IStorageValue>> {
		const result = new Map<string, IStorageValue>();
		const storageDatabase = await this.createStorageDatabase(profile);
		const storageService = new StroageService(storageDatabase);
		try {
			await storageService.initialize();
			const populate = (target: StorageTarget) => {
				for (const key of storageService.keys(StorageScope.PROFILE, target)) {
					result.set(key, { value: storageService.get(key, StorageScope.PROFILE), target });
				}
			};
			populate(StorageTarget.USER);
			populate(StorageTarget.MACHINE);
		} finally {
			storageService.dispose();
			await this.closeAndDispose(storageDatabase);
		}
		return result;
	}

	async updateStorageData(profile: IUserDataProfile, data: Map<string, string | undefined | null>, target: StorageTarget): Promise<void> {
		const storageDatabase = await this.createStorageDatabase(profile);
		const storageService = new StroageService(storageDatabase);
		try {
			await storageService.initialize();
			for (const [key, value] of data) {
				storageService.store(key, value, StorageScope.PROFILE, target);
			}
			await storageService.flush();
		} finally {
			storageService.dispose();
			await this.closeAndDispose(storageDatabase);
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

class StroageService extends AbstractStorageService {

	private readonly profileStorage: IStorage;

	constructor(profileStorageDatabase: IStorageDatabase) {
		super({ flushInterval: AbstractStorageService.DEFAULT_FLUSH_INTERVAL, donotMarkPerf: true });
		this.profileStorage = this._register(new Storage(profileStorageDatabase));
	}

	protected doInitialize(): Promise<void> {
		return this.profileStorage.init();
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		return scope === StorageScope.PROFILE ? this.profileStorage : undefined;
	}

	protected getLogDetails(): string | undefined {
		return undefined;
	}

	protected async switchToProfile(): Promise<void> {
		// no-op when in-memory
	}

	protected async switchToWorkspace(): Promise<void> {
		// no-op when in-memory
	}

}
