/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { BrowserStorageService } from '../../../../workbench/services/storage/browser/storageService.js';
import { AUTOMATION_STORAGE_KEY, IAutomationStorageCompareAndSwapResult, IAutomationStorageService } from '../common/automationStorageService.js';

/**
 * Uses an IndexedDB transaction so automation writes remain atomic across browser tabs.
 */
export class BrowserAutomationStorageService implements IAutomationStorageService {

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

	async read(): Promise<string | undefined> {
		return this.storageService.getApplicationStorageValue(AUTOMATION_STORAGE_KEY);
	}

	async compareAndSwap(expectedValue: string | undefined, newValue: string): Promise<IAutomationStorageCompareAndSwapResult> {
		return this.storageService.compareAndSwapApplicationStorage(AUTOMATION_STORAGE_KEY, expectedValue, newValue);
	}
}
