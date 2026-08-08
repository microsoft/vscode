/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { BrowserStorageService } from '../../../../workbench/services/storage/browser/storageService.js';
import { AUTOMATION_STORAGE_KEY, ILegacyAutomationMigrationCompareAndSwapResult, ILegacyAutomationMigrationStorageService } from '../common/legacyAutomationMigrationStorage.js';

/**
 * Uses an IndexedDB transaction so automation writes remain atomic across browser tabs.
 */
export class BrowserLegacyAutomationMigrationStorageService implements ILegacyAutomationMigrationStorageService {

	declare readonly _serviceBrand: undefined;

	private readonly storageService: BrowserStorageService;

	constructor(
		@IStorageService storageService: IStorageService,
	) {
		if (!(storageService instanceof BrowserStorageService)) {
			throw new Error('Browser automation storage requires BrowserStorageService.');
		}
		this.storageService = storageService;
	}

	async read(key = AUTOMATION_STORAGE_KEY): Promise<string | undefined> {
		return this.storageService.getApplicationStorageValue(key);
	}

	async compareAndSwap(key: string, expectedValue: string | undefined, newValue: string): Promise<ILegacyAutomationMigrationCompareAndSwapResult> {
		return this.storageService.compareAndSwapApplicationStorage(key, expectedValue, newValue);
	}
}
