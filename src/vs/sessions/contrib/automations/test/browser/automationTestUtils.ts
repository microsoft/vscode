/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AutomationService } from '../../browser/automationService.js';
import { AUTOMATION_STORAGE_KEY, IAutomationStorageCompareAndSwapResult, IAutomationStorageService } from '../../common/automationStorageService.js';

export class TestAutomationStorageService implements IAutomationStorageService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly storageService: IStorageService,
	) { }

	async read(): Promise<string | undefined> {
		return this.storageService.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION);
	}

	async compareAndSwap(expectedValue: string | undefined, newValue: string): Promise<IAutomationStorageCompareAndSwapResult> {
		const currentValue = this.storageService.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION);
		if (currentValue !== expectedValue) {
			return { swapped: false, currentValue };
		}
		this.storageService.store(AUTOMATION_STORAGE_KEY, newValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
		return { swapped: true, currentValue: newValue };
	}
}

export function createAutomationService(storageService: IStorageService, logService: ILogService, telemetryService: ITelemetryService): AutomationService {
	return new AutomationService(storageService, logService, telemetryService, new TestAutomationStorageService(storageService));
}
