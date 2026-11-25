/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/** Sessions list state that combines the value older builds synced with the device's own. */
export interface IMigratedSessionsListState {
	/** The state to use and keep on the device, or `undefined` for none. */
	readonly value: string | undefined;
	/** Whether the state holds anything the user made, which makes the device own its state. */
	readonly userMade: boolean;
}

/**
 * Reads Sessions list state that stays on this device: {@link storeMachineSessionsListState}
 * stores it under `key` in the profile with {@link StorageTarget.MACHINE}, so Settings Sync
 * does not roam it. The state used to be user state under `legacySyncedKey`, which Settings
 * Sync roamed across devices.
 *
 * Until the device owns its state, each read combines the legacy value with the device's value
 * through `migrate`, also when Settings Sync downloads the legacy value after an earlier read,
 * for example when Sync is turned on later. `migrate` adopts a legacy value that holds anything
 * the user made, which makes the device own its state, and may keep bookkeeping, which older
 * builds also stored alone, without doing so. Once the device owns its state, emptying that
 * state does not bring the legacy value back. The legacy key is left in place: removing it would
 * sync the removal to devices that still run older builds, which would then lose their state.
 */
export function readMachineSessionsListState(storageService: IStorageService, key: string, legacySyncedKey: string, migrate: (legacyValue: string, value: string | undefined) => IMigratedSessionsListState): string | undefined {
	const value = storageService.get(key, StorageScope.PROFILE);
	if (storageService.getBoolean(getOwnedKey(key), StorageScope.PROFILE, false)) {
		return value;
	}
	const legacyValue = storageService.get(legacySyncedKey, StorageScope.PROFILE);
	if (legacyValue === undefined) {
		return value;
	}
	const migrated = migrate(legacyValue, value);
	storeMachineSessionsListState(storageService, key, migrated.value, migrated.userMade);
	return migrated.value;
}

/**
 * Stores the state that {@link readMachineSessionsListState} reads, or removes it when `value`
 * is `undefined`. `userMade` tells whether the state holds anything the user made, which makes
 * the device own its state. Bookkeeping alone, such as which sessions left their group, is not
 * user made, and leaves adopting the legacy value pending.
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
