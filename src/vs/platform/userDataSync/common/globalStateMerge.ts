/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { IGlobalState } from 'vs/platform/userDataSync/common/userDataSync';
import { IStringDictionary } from 'vs/base/common/collections';
import { values } from 'vs/base/common/map';

export function merge(localGloablState: IGlobalState, remoteGlobalState: IGlobalState | null, lastSyncGlobalState: IGlobalState | null): { local?: IGlobalState, remote?: IGlobalState } {
	if (!remoteGlobalState) {
		return { remote: localGloablState };
	}

	const { local: localArgv, remote: remoteArgv } = doMerge(localGloablState.argv, remoteGlobalState.argv, lastSyncGlobalState ? lastSyncGlobalState.argv : null);
	const { local: localStorage, remote: remoteStorage } = doMerge(localGloablState.storage, remoteGlobalState.storage, lastSyncGlobalState ? lastSyncGlobalState.storage : null);
	const local: IGlobalState | undefined = localArgv || localStorage ? { argv: localArgv || localGloablState.argv, storage: localStorage || localGloablState.storage } : undefined;
	const remote: IGlobalState | undefined = remoteArgv || remoteStorage ? { argv: remoteArgv || remoteGlobalState.argv, storage: remoteStorage || remoteGlobalState.storage } : undefined;

	return { local, remote };
}

function doMerge(local: IStringDictionary<any>, remote: IStringDictionary<any>, base: IStringDictionary<any> | null): { local?: IStringDictionary<any>, remote?: IStringDictionary<any> } {
	const localToRemote = compare(local, remote);
	if (localToRemote.added.size === 0 && localToRemote.removed.size === 0 && localToRemote.updated.size === 0) {
		// No changes found between local and remote.
		return {};
	}

	const baseToRemote = base ? compare(base, remote) : { added: Object.keys(remote).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
	if (baseToRemote.added.size === 0 && baseToRemote.removed.size === 0 && baseToRemote.updated.size === 0) {
		// No changes found between base and remote.
		return { remote: local };
	}

	const baseToLocal = base ? compare(base, local) : { added: Object.keys(local).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
	if (baseToLocal.added.size === 0 && baseToLocal.removed.size === 0 && baseToLocal.updated.size === 0) {
		// No changes found between base and local.
		return { local: remote };
	}

	const merged = objects.deepClone(local);

	// Added in remote
	for (const key of values(baseToRemote.added)) {
		merged[key] = remote[key];
	}

	// Updated in Remote
	for (const key of values(baseToRemote.updated)) {
		merged[key] = remote[key];
	}

	// Removed in remote & local
	for (const key of values(baseToRemote.removed)) {
		// Got removed in local
		if (baseToLocal.removed.has(key)) {
			delete merged[key];
		}
	}

	return { local: merged, remote: merged };
}

function compare(from: IStringDictionary<any>, to: IStringDictionary<any>): { added: Set<string>, removed: Set<string>, updated: Set<string> } {
	const fromKeys = Object.keys(from);
	const toKeys = Object.keys(to);
	const added = toKeys.filter(key => fromKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
	const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
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

