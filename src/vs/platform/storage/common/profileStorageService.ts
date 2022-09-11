/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, isDisposable } from 'vs/base/common/lifecycle';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { IStorageDatabase, IUpdateRequest } from 'vs/base/parts/storage/common/storage';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IKeyTargets, IStorageValueChangeEvent, StorageTarget, TARGET_KEY } from 'vs/platform/storage/common/storage';
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
	readonly value: string;
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
		try {
			const items = await storageDatabase.getItems();
			const keyTargets = this.loadKeyTargets(items);
			for (const [key, value] of items) {
				if (key !== TARGET_KEY) {
					result.set(key, { value, target: keyTargets[key] });
				}
			}
		} finally {
			await this.closeAndDispose(storageDatabase);
		}
		return result;
	}

	async updateStorageData(profile: IUserDataProfile, data: Map<string, string | undefined | null>, target: StorageTarget): Promise<void> {
		const storageDatabase = await this.createStorageDatabase(profile);
		try {
			const items = await storageDatabase.getItems();
			const keyTargets = this.loadKeyTargets(items);
			const toInsert = new Map<string, string>();
			const toDelete = new Set<string>();
			let updateTargets = false;
			for (const [key, value] of data) {
				if (isUndefinedOrNull(value)) {
					toDelete.add(key);
					if (typeof keyTargets[key] === 'number') {
						delete keyTargets[key];
						updateTargets = true;
					}
				} else {
					toInsert.set(key, value);
					if (keyTargets[key] !== target) {
						updateTargets = true;
						keyTargets[key] = target;
					}
				}
			}
			if (updateTargets) {
				toInsert.set(TARGET_KEY, JSON.stringify(keyTargets));
			}
			if (toInsert.size > 0 || toDelete.size > 0) {
				await this.updateItems(storageDatabase, { insert: toInsert, delete: toDelete });
			}
		} finally {
			await this.closeAndDispose(storageDatabase);
		}
	}

	private loadKeyTargets(items: Map<string, string>): IKeyTargets {
		const keysRaw = items.get(TARGET_KEY);
		if (keysRaw) {
			try {
				return JSON.parse(keysRaw);
			} catch (error) {
				// Fail gracefully
			}
		}
		return Object.create(null);
	}

	protected async updateItems(storageDatabase: IStorageDatabase, updateRequest: IUpdateRequest): Promise<void> {
		await storageDatabase.updateItems(updateRequest);
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
