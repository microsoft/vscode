/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import { ILogService } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IResourceProfile } from 'vs/workbench/services/profiles/common/profile';
import { Extensions, IProfileStorageRegistry } from 'vs/workbench/services/profiles/common/profileStorageRegistry';

interface IGlobalState {
	storage: IStringDictionary<string>;
}

export class GlobalStateProfile implements IResourceProfile {

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async getProfileContent(): Promise<string> {
		const globalState = await this.getLocalGlobalState();
		return JSON.stringify(globalState);
	}

	async applyProfile(content: string): Promise<void> {
		const globalState: IGlobalState = JSON.parse(content);
		await this.writeLocalGlobalState(globalState);
	}

	private async getLocalGlobalState(): Promise<IGlobalState> {
		const storage: IStringDictionary<string> = {};
		for (const { key } of Registry.as<IProfileStorageRegistry>(Extensions.ProfileStorageRegistry).all) {
			const value = this.storageService.get(key, StorageScope.GLOBAL);
			if (value) {
				storage[key] = value;
			}
		}
		return { storage };
	}

	private async writeLocalGlobalState(globalState: IGlobalState): Promise<void> {
		const profileKeys: string[] = Object.keys(globalState.storage);
		const updatedStorage: IStringDictionary<any> = globalState.storage;
		for (const { key } of Registry.as<IProfileStorageRegistry>(Extensions.ProfileStorageRegistry).all) {
			if (!profileKeys.includes(key)) {
				// Remove the key if it does not exist in the profile
				updatedStorage[key] = undefined;
			}
		}
		const updatedStorageKeys: string[] = Object.keys(updatedStorage);
		if (updatedStorageKeys.length) {
			this.logService.trace(`Profile: Updating global state...`);
			for (const key of updatedStorageKeys) {
				this.storageService.store(key, globalState.storage[key], StorageScope.GLOBAL, StorageTarget.USER);
			}
			this.logService.info(`Profile: Updated global state`, updatedStorageKeys);
		}
	}
}
