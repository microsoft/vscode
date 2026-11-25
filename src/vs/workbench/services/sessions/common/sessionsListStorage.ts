/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/**
 * Reads Sessions list state that stays on this device: {@link storeMachineSessionsListState}
 * stores it under `key` in the profile with {@link StorageTarget.MACHINE}, so Settings Sync
 * does not roam it. The state used to be user state under `legacySyncedKey`, which Settings
 * Sync roamed across devices.
 *
 * Until the device owns its state, reading adopts the legacy value, also one that Settings
 * Sync downloads after an earlier read, for example when Sync is turned on later. The device
 * owns its state once it adopted the legacy value or stored state the user made, so emptying
 * that state later does not bring the legacy value back. The legacy key is left in place:
 * removing it would sync the removal to devices that still run older builds, which would then
 * lose their state.
 */
export function readMachineSessionsListState(storageService: IStorageService, key: string, legacySyncedKey: string): string | undefined {
	const value = storageService.get(key, StorageScope.PROFILE);
	if (storageService.getBoolean(getOwnedKey(key), StorageScope.PROFILE, false)) {
		return value;
	}
	const legacyValue = storageService.get(legacySyncedKey, StorageScope.PROFILE);
	if (legacyValue === undefined) {
		return value;
	}
	storeMachineSessionsListState(storageService, key, legacyValue, true);
	return legacyValue;
}

/**
 * Stores the state that {@link readMachineSessionsListState} reads, or removes it when `value`
 * is `undefined`. `userMade` tells whether the state holds anything the user made, which makes
 * the device own its state. Bookkeeping that the device recomputes without the user, such as
 * which archived sessions left their group, is not user made, and leaves adopting the legacy
 * value pending.
 */
export function storeMachineSessionsListState(storageService: IStorageService, key: string, value: string | undefined, userMade: boolean): void {
	if (userMade) {
		storageService.store(getOwnedKey(key), true, StorageScope.PROFILE, StorageTarget.MACHINE);
	}
	if (value === undefined) {
		storageService.remove(key, StorageScope.PROFILE);
	} else {
		storageService.store(key, value, StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}

function getOwnedKey(key: string): string {
	return `${key}.ownedByDevice`;
}
