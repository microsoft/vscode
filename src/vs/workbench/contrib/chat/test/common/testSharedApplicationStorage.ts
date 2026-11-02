/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { IStorage, IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest, Storage, StorageHint } from '../../../../../base/parts/storage/common/storage.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfile, toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { URI } from '../../../../../base/common/uri.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { TestUserDataProfileService } from '../../../../test/common/workbenchTestServices.js';

/**
 * Backing items for one application storage database shared by several
 * windows. A write from one window is delivered to every other window as an
 * external change, like the real shared application storage.
 */
export class SharedApplicationStorageDatabase {
	readonly items = new Map<string, string>();
	readonly windows = new Set<WindowApplicationStorageDatabase>();
}

class WindowApplicationStorageDatabase implements IStorageDatabase {
	private readonly _onDidChangeItemsExternal = new Emitter<IStorageItemsChangeEvent>();
	readonly onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;

	constructor(private readonly _shared: SharedApplicationStorageDatabase) {
		_shared.windows.add(this);
	}

	async getItems(): Promise<Map<string, string>> {
		return new Map(this._shared.items);
	}

	async updateItems(request: IUpdateRequest): Promise<void> {
		request.insert?.forEach((value, key) => this._shared.items.set(key, value));
		request.delete?.forEach(key => this._shared.items.delete(key));
		for (const other of this._shared.windows) {
			if (other !== this) {
				other._onDidChangeItemsExternal.fire({
					changed: request.insert ? new Map(request.insert) : undefined,
					deleted: request.delete ? new Set(request.delete) : undefined,
				});
			}
		}
	}

	async optimize(): Promise<void> { }

	async close(): Promise<void> {
		this._shared.windows.delete(this);
		this._onDidChangeItemsExternal.dispose();
	}
}

/**
 * An in-memory storage service for one window: its own profile and workspace
 * storage, plus application storage backed by a {@link SharedApplicationStorageDatabase}.
 * Call {@link init} before use so existing shared items are loaded.
 */
export class TestWindowStorageService extends InMemoryStorageService {
	private readonly _sharedApplicationStorage: Storage;

	constructor(shared: SharedApplicationStorageDatabase) {
		super();
		this._sharedApplicationStorage = this._register(new Storage(new WindowApplicationStorageDatabase(shared), { hint: StorageHint.STORAGE_IN_MEMORY }));
		this._register(this._sharedApplicationStorage.onDidChangeStorage(e => this.emitDidChangeValue(StorageScope.APPLICATION, e)));
	}

	async init(): Promise<this> {
		await this._sharedApplicationStorage.init();
		return this;
	}

	protected override getStorage(scope: StorageScope): IStorage {
		return scope === StorageScope.APPLICATION ? this._sharedApplicationStorage : super.getStorage(scope);
	}
}

export function createTestProfile(id: string, options?: { isDefault?: boolean; useDefaultGlobalState?: boolean }): IUserDataProfile {
	const profile = toUserDataProfile(id, id, URI.file(`/profiles/${id}`), URI.file('/cache'), options?.useDefaultGlobalState ? { useDefaultFlags: { globalState: true } } : undefined);
	return options?.isDefault ? { ...profile, isDefault: true } : profile;
}

export function createTestProfileService(profile: IUserDataProfile): IUserDataProfileService {
	return new class extends TestUserDataProfileService {
		override readonly currentProfile = profile;
	}();
}
