/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import * as objects from 'vs/base/common/objects';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageValue, SYNC_SERVICE_URL_TYPE } from 'vs/platform/userDataSync/common/userDataSync';

export interface IMergeResult {
	local: { added: IStringDictionary<IStorageValue>; removed: string[]; updated: IStringDictionary<IStorageValue> };
	remote: { added: string[]; removed: string[]; updated: string[]; all: IStringDictionary<IStorageValue> | null };
}

export function merge(localStorage: IStringDictionary<IStorageValue>, remoteStorage: IStringDictionary<IStorageValue> | null, baseStorage: IStringDictionary<IStorageValue> | null, storageKeys: { machine: ReadonlyArray<string>; unregistered: ReadonlyArray<string> }, logService: ILogService): IMergeResult {
	if (!remoteStorage) {
		return { remote: { added: Object.keys(localStorage), removed: [], updated: [], all: Object.keys(localStorage).length > 0 ? localStorage : null }, local: { added: {}, removed: [], updated: {} } };
	}

	const localToRemote = compare(localStorage, remoteStorage);
	if (localToRemote.added.size === 0 && localToRemote.removed.size === 0 && localToRemote.updated.size === 0) {
		// No changes found between local and remote.
		return { remote: { added: [], removed: [], updated: [], all: null }, local: { added: {}, removed: [], updated: {} } };
	}

	const baseToRemote = baseStorage ? compare(baseStorage, remoteStorage) : { added: Object.keys(remoteStorage).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
	const baseToLocal = baseStorage ? compare(baseStorage, localStorage) : { added: Object.keys(localStorage).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };

	const local: { added: IStringDictionary<IStorageValue>; removed: string[]; updated: IStringDictionary<IStorageValue> } = { added: {}, removed: [], updated: {} };
	const remote: IStringDictionary<IStorageValue> = objects.deepClone(remoteStorage);

	const isFirstTimeSync = !baseStorage;

	// Added in local
	for (const key of baseToLocal.added.values()) {
		// If syncing for first time remote value gets precedence always,
		// except for sync service type key - local value takes precedence for this key
		if (key !== SYNC_SERVICE_URL_TYPE && isFirstTimeSync && baseToRemote.added.has(key)) {
			continue;
		}

		remote[key] = localStorage[key];
	}

	// Updated in local
	for (const key of baseToLocal.updated.values()) {
		remote[key] = localStorage[key];
	}

	// Removed in local
	for (const key of baseToLocal.removed.values()) {
		// Do not remove from remote if key is not registered.
		if (storageKeys.unregistered.includes(key)) {
			continue;
		}
		delete remote[key];
	}

	// Added in remote
	for (const key of baseToRemote.added.values()) {
		const remoteValue = remoteStorage[key];
		if (storageKeys.machine.includes(key)) {
			logService.info(`GlobalState: Skipped adding ${key} in local storage because it is declared as machine scoped.`);
			continue;
		}
		// Skip if the value is also added in local from the time it is last synced
		if (baseStorage && baseToLocal.added.has(key)) {
			continue;
		}
		const localValue = localStorage[key];
		if (localValue && localValue.value === remoteValue.value) {
			continue;
		}

		// Local sync service type value takes precedence if syncing for first time
		if (key === SYNC_SERVICE_URL_TYPE && isFirstTimeSync && baseToLocal.added.has(key)) {
			continue;
		}

		if (localValue) {
			local.updated[key] = remoteValue;
		} else {
			local.added[key] = remoteValue;
		}
	}

	// Updated in Remote
	for (const key of baseToRemote.updated.values()) {
		const remoteValue = remoteStorage[key];
		if (storageKeys.machine.includes(key)) {
			logService.info(`GlobalState: Skipped updating ${key} in local storage because it is declared as machine scoped.`);
			continue;
		}
		// Skip if the value is also updated or removed in local
		if (baseToLocal.updated.has(key) || baseToLocal.removed.has(key)) {
			continue;
		}
		const localValue = localStorage[key];
		if (localValue && localValue.value === remoteValue.value) {
			continue;
		}
		local.updated[key] = remoteValue;
	}

	// Removed in remote
	for (const key of baseToRemote.removed.values()) {
		if (storageKeys.machine.includes(key)) {
			logService.trace(`GlobalState: Skipped removing ${key} in local storage because it is declared as machine scoped.`);
			continue;
		}
		// Skip if the value is also updated or removed in local
		if (baseToLocal.updated.has(key) || baseToLocal.removed.has(key)) {
			continue;
		}
		local.removed.push(key);
	}

	const result = compare(remoteStorage, remote);
	return { local, remote: { added: [...result.added], updated: [...result.updated], removed: [...result.removed], all: result.added.size === 0 && result.removed.size === 0 && result.updated.size === 0 ? null : remote } };
}

function compare(from: IStringDictionary<any>, to: IStringDictionary<any>): { added: Set<string>; removed: Set<string>; updated: Set<string> } {
	const fromKeys = Object.keys(from);
	const toKeys = Object.keys(to);
	const added = toKeys.filter(key => !fromKeys.includes(key)).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
	const removed = fromKeys.filter(key => !toKeys.includes(key)).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
	const updated: Set<string> = new Set<string>();

	for (const key of fromKeys) {
		if (removed.has(key)) {
			continue;
		}
		const value1 = from[key];
		const value2 = to[key];
		if (!objects.equals(value1, value2)) {
			updated.add(key);
		}
	}

	return { added, removed, updated };
}
