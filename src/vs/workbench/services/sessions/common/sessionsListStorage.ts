/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/**
 * Reads Sessions list state that stays on this device: the caller stores it under
 * `key` in the profile with {@link StorageTarget.MACHINE}, so Settings Sync does not
 * roam it. The state used to be user state under `legacySyncedKey`, which Settings
 * Sync roamed across devices.
 *
 * The first read on a device adopts the legacy value, once, so that deleting the
 * state later does not bring the legacy value back. The legacy key is left in place:
 * removing it would sync the removal to devices that still run older builds, which
 * would then lose their state.
 */
export function readMachineSessionsListState(storageService: IStorageService, key: string, legacySyncedKey: string): string | undefined {
	const value = storageService.get(key, StorageScope.PROFILE);
	if (value !== undefined) {
		return value;
	}
	const adoptedKey = `${key}.adoptedLegacyState`;
	if (storageService.getBoolean(adoptedKey, StorageScope.PROFILE, false)) {
		return undefined;
	}
	storageService.store(adoptedKey, true, StorageScope.PROFILE, StorageTarget.MACHINE);
	const legacyValue = storageService.get(legacySyncedKey, StorageScope.PROFILE);
	if (legacyValue !== undefined) {
		storageService.store(key, legacyValue, StorageScope.PROFILE, StorageTarget.MACHINE);
	}
	return legacyValue;
}
