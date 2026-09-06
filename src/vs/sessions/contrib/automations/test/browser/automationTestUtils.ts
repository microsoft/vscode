/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import type { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { NullLanguageModelsService } from '../../../../../workbench/contrib/chat/test/common/languageModels.js';
import { AutomationService } from '../../browser/automationService.js';
import { IAutomationStorageCompareAndSwapResult, IAutomationStorageService } from '../../common/automationStorageService.js';

export class TestAutomationStorageService implements IAutomationStorageService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly storageService: IStorageService,
	) { }

	async read(key: string): Promise<string | undefined> {
		return this.storageService.get(key, StorageScope.APPLICATION);
	}

	async compareAndSwap(key: string, expectedValue: string | undefined, newValue: string): Promise<IAutomationStorageCompareAndSwapResult> {
		const currentValue = this.storageService.get(key, StorageScope.APPLICATION);
		if (currentValue !== expectedValue) {
			return { swapped: false, currentValue };
		}
		this.storageService.store(key, newValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
		return { swapped: true, currentValue: newValue };
	}
}

export function createAutomationService(storageService: IStorageService, logService: ILogService, telemetryService: ITelemetryService, languageModelsService: ILanguageModelsService = new NullLanguageModelsService()): AutomationService {
	return new AutomationService(storageService, logService, telemetryService, new TestAutomationStorageService(storageService), languageModelsService);
}

export class RecordingAutomationTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(name?: string, data?: Record<string, unknown>): void {
		this.events.push({ name: name ?? '', data: data ?? {} });
	}
}
