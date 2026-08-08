/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const AUTOMATION_STORAGE_KEY = 'chat.automations.ledger';

export interface ILegacyAutomationMigrationCompareAndSwapResult {
	readonly swapped: boolean;
	readonly currentValue: string | undefined;
}

export const ILegacyAutomationMigrationStorageService = createDecorator<ILegacyAutomationMigrationStorageService>('legacyAutomationMigrationStorageService');

/**
 * Provides atomic access to the retired local ledger while it is being migrated.
 */
export interface ILegacyAutomationMigrationStorageService {
	readonly _serviceBrand: undefined;

	read(key?: string): Promise<string | undefined>;
	compareAndSwap(key: string, expectedValue: string | undefined, newValue: string): Promise<ILegacyAutomationMigrationCompareAndSwapResult>;
}
