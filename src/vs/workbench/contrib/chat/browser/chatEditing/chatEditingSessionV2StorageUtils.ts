/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import {
	IChatEditingStorageService,
	IChatEditingMigrationService
} from './chatEditingSessionV2.js';

// ============================================================================
// STORAGE SERVICE TOKENS
// ============================================================================

export const IChatEditingStorageServiceV2 = createDecorator<IChatEditingStorageService>('chatEditingStorageServiceV2');
export const IChatEditingMigrationServiceV2 = createDecorator<IChatEditingMigrationService>('chatEditingMigrationServiceV2');

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

/**
 * Utilities for basic data serialization and storage.
 */
export class StorageUtils {
	/**
	 * Serialize data to JSON string.
	 */
	static serialize(data: any): string {
		return JSON.stringify(data);
	}

	/**
	 * Deserialize data from JSON string.
	 */
	static deserialize(json: string): any {
		return JSON.parse(json);
	}

	/**
	 * Calculate data size in bytes.
	 */
	static getDataSize(data: string): number {
		return Buffer.byteLength(data, 'utf8');
	}
}
