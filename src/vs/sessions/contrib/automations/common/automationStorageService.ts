/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const AUTOMATION_STORAGE_KEY = 'chat.automations.ledger';

export function providerAutomationStorageKey(providerId: string): string {
	return `chat.automations.provider.${encodeURIComponent(providerId)}.ledger`;
}

export interface IAutomationStorageCompareAndSwapResult {
	readonly swapped: boolean;
	readonly currentValue: string | undefined;
}

export const IAutomationStorageService = createDecorator<IAutomationStorageService>('automationStorageService');

/**
 * Provides authoritative reads and atomic writes for the shared automation ledger.
 */
export interface IAutomationStorageService {
	readonly _serviceBrand: undefined;

	read(key: string): Promise<string | undefined>;
	compareAndSwap(key: string, expectedValue: string | undefined, newValue: string): Promise<IAutomationStorageCompareAndSwapResult>;
}
