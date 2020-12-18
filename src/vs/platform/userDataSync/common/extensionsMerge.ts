/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISyncExtension, ISyncExtensionWithVersion } from 'vs/platform/userDataSync/common/userDataSync';
import { IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { deepClone, equals } from 'vs/base/common/objects';
import { IStringDictionary } from 'vs/base/common/collections';
import * as semver from 'vs/base/common/semver/semver';

export interface IMergeResult {
	added: ISyncExtension[];
	removed: IExtensionIdentifier[];
	updated: ISyncExtensionWithVersion[];
	remote: ISyncExtension[] | null;
}

export function merge(localExtensions: ISyncExtensionWithVersion[], remoteExtensions: ISyncExtension[] | null, lastSyncExtensions: ISyncExtension[] | null, skippedExtensions: ISyncExtension[], ignoredExtensions: string[]): IMergeResult {
	const added: ISyncExtension[] = [];
	const removed: IExtensionIdentifier[] = [];
	const updated: ISyncExtensionWithVersion[] = [];

	if (!remoteExtensions) {
		const remote = localExtensions.filter(({ identifier }) => ignoredExtensions.every(id => id.toLowerCase() !== identifier.id.toLowerCase()));
		return {
			added,
			removed,
			updated,
			remote: remote.length > 0 ? remote : null
		};
	}

	localExtensions = localExtensions.map(massageIncomingExtension);
	remoteExtensions = remoteExtensions.map(massageIncomingExtension);
	lastSyncExtensions = lastSyncExtensions ? lastSyncExtensions.map(massageIncomingExtension) : null;

	const uuids: Map<string, string> = new Map<string, string>();
	const addUUID = (identifier: IExtensionIdentifier) => { if (identifier.uuid) { uuids.set(identifier.id.toLowerCase(), identifier.uuid); } };
	localExtensions.forEach(({ identifier }) => addUUID(identifier));
	remoteExtensions.forEach(({ identifier }) => addUUID(identifier));
	if (lastSyncExtensions) {
		lastSyncExtensions.forEach(({ identifier }) => addUUID(identifier));
	}

	const getKey = (extension: ISyncExtension): string => {
		const uuid = extension.identifier.uuid || uuids.get(extension.identifier.id.toLowerCase());
		return uuid ? `uuid:${uuid}` : `id:${extension.identifier.id.toLowerCase()}`;
	};
	const addExtensionToMap = <T extends ISyncExtension>(map: Map<string, T>, extension: T) => {
		map.set(getKey(extension), extension);
		return map;
	};
	const localExtensionsMap: Map<string, ISyncExtensionWithVersion> = localExtensions.reduce(addExtensionToMap, new Map<string, ISyncExtensionWithVersion>());
	const remoteExtensionsMap = remoteExtensions.reduce(addExtensionToMap, new Map<string, ISyncExtension>());
	const newRemoteExtensionsMap = remoteExtensions.reduce((map: Map<string, ISyncExtension>, extension: ISyncExtension) => {
		const key = getKey(extension);
		extension = deepClone(extension);
		const localExtension = localExtensionsMap.get(key);
		if (localExtension) {
			if (localExtension.installed) {
				extension.installed = true;
			}
			if (!extension.version) {
				extension.version = localExtension.version;
			}
		}
		return addExtensionToMap(map, extension);
	}, new Map<string, ISyncExtension>());
	const lastSyncExtensionsMap = lastSyncExtensions ? lastSyncExtensions.reduce(addExtensionToMap, new Map<string, ISyncExtension>()) : null;
	const skippedExtensionsMap = skippedExtensions.reduce(addExtensionToMap, new Map<string, ISyncExtension>());
	const ignoredExtensionsSet = ignoredExtensions.reduce((set, id) => {
		const uuid = uuids.get(id.toLowerCase());
		return set.add(uuid ? `uuid:${uuid}` : `id:${id.toLowerCase()}`);
	}, new Set<string>());

	const localToRemote = compare(localExtensionsMap, remoteExtensionsMap, ignoredExtensionsSet);
	if (localToRemote.added.size > 0 || localToRemote.removed.size > 0 || localToRemote.updated.size > 0) {

		const baseToLocal = compare(lastSyncExtensionsMap, localExtensionsMap, ignoredExtensionsSet);
		const baseToRemote = compare(lastSyncExtensionsMap, remoteExtensionsMap, ignoredExtensionsSet);

		const merge = (key: string, updatedInRemote: boolean): ISyncExtensionWithVersion | undefined => {
			const localExtension = localExtensionsMap.get(key);
			if (localExtension) {
				const remoteExtension = remoteExtensionsMap.get(key)!;
				return {
					...(updatedInRemote ? remoteExtension : localExtension),
					version: remoteExtension.version && semver.gt(remoteExtension.version, localExtension.version) ? localExtension.version : localExtension.version,
					state: mergeExtensionState(localExtension, remoteExtension, lastSyncExtensionsMap?.get(key))
				};

			}
			return undefined;
		};

		// Remotely removed extension.
		for (const key of baseToRemote.removed.values()) {
			const e = localExtensionsMap.get(key);
			if (e) {
				removed.push(e.identifier);
			}
		}

		// Remotely added extension
		for (const key of baseToRemote.added.values()) {
			// Got added in local
			if (baseToLocal.added.has(key)) {
				// Is different from local to remote
				if (localToRemote.updated.has(key)) {
					const mergedExtension = merge(key, true);
					if (mergedExtension) {
						updated.push(massageOutgoingExtension(mergedExtension, key));
						newRemoteExtensionsMap.set(key, mergedExtension);
					}
				}
			} else {
				// Add only installed extension to local
				const remoteExtension = remoteExtensionsMap.get(key)!;
				if (remoteExtension.installed) {
					added.push(massageOutgoingExtension(remoteExtension, key));
				}
			}
		}

		// Remotely updated extensions
		for (const key of baseToRemote.updated.values()) {
			// Update in local always
			const mergedExtension = merge(key, true);
			if (mergedExtension) {
				updated.push(massageOutgoingExtension(mergedExtension, key));
				newRemoteExtensionsMap.set(key, mergedExtension);
			}
		}

		// Locally added extensions
		for (const key of baseToLocal.added.values()) {
			// Not there in remote
			if (!baseToRemote.added.has(key)) {
				newRemoteExtensionsMap.set(key, localExtensionsMap.get(key)!);
			}
		}

		// Locally updated extensions
		for (const key of baseToLocal.updated.values()) {
			// If removed in remote
			if (baseToRemote.removed.has(key)) {
				continue;
			}

			// If not updated in remote
			if (!baseToRemote.updated.has(key)) {
				const mergedExtension = merge(key, false);
				if (mergedExtension) {
					// Retain installed property
					if (newRemoteExtensionsMap.get(key)?.installed) {
						mergedExtension.installed = true;
					}
					newRemoteExtensionsMap.set(key, mergedExtension);
				}
			}
		}

		// Locally removed extensions
		for (const key of baseToLocal.removed.values()) {
			// If not skipped and not updated in remote
			if (!skippedExtensionsMap.has(key) && !baseToRemote.updated.has(key)) {
				// Remove only if it is an installed extension
				if (lastSyncExtensionsMap?.get(key)?.installed) {
					newRemoteExtensionsMap.delete(key);
				}
			}
		}
	}

	const remote: ISyncExtension[] = [];
	const remoteChanges = compare(remoteExtensionsMap, newRemoteExtensionsMap, new Set<string>(), { checkInstalledProperty: true, checkVersionProperty: true });
	if (remoteChanges.added.size > 0 || remoteChanges.updated.size > 0 || remoteChanges.removed.size > 0) {
		newRemoteExtensionsMap.forEach((value, key) => remote.push(massageOutgoingExtension(value, key)));
	}

	return { added, removed, updated, remote: remote.length ? remote : null };
}

function compare(from: Map<string, ISyncExtension> | null, to: Map<string, ISyncExtension>, ignoredExtensions: Set<string>, { checkInstalledProperty, checkVersionProperty }: { checkInstalledProperty: boolean, checkVersionProperty: boolean } = { checkInstalledProperty: false, checkVersionProperty: false }): { added: Set<string>, removed: Set<string>, updated: Set<string> } {
	const fromKeys = from ? [...from.keys()].filter(key => !ignoredExtensions.has(key)) : [];
	const toKeys = [...to.keys()].filter(key => !ignoredExtensions.has(key));
	const added = toKeys.filter(key => fromKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
	const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
	const updated: Set<string> = new Set<string>();

	for (const key of fromKeys) {
		if (removed.has(key)) {
			continue;
		}
		const fromExtension = from!.get(key)!;
		const toExtension = to.get(key);
		if (!toExtension
			|| fromExtension.disabled !== toExtension.disabled
			|| !isSameExtensionState(fromExtension.state, toExtension.state)
			|| (checkVersionProperty && fromExtension.version !== toExtension.version)
			|| (checkInstalledProperty && fromExtension.installed !== toExtension.installed)
		) {
			updated.add(key);
		}
	}

	return { added, removed, updated };
}

function mergeExtensionState(localExtension: ISyncExtensionWithVersion, remoteExtension: ISyncExtension, lastSyncExtension: ISyncExtension | undefined): IStringDictionary<any> | undefined {
	const localState = localExtension.state;
	const remoteState = remoteExtension.state;
	const baseState = lastSyncExtension?.state;

	// If remote extension has no version, use local state
	if (!remoteExtension.version) {
		return localState;
	}

	// If local state exists and local extension is latest then use local state
	if (localState && semver.gt(localExtension.version, remoteExtension.version)) {
		return localState;
	}
	// If remote state exists and remote extension is latest, use remote state
	if (remoteState && semver.gt(remoteExtension.version, localExtension.version)) {
		return remoteState;
	}


	/* Remote and local are on same version */

	// If local state is not yet set, use remote state
	if (!localState) {
		return remoteState;
	}
	// If remote state is not yet set, use local state
	if (!remoteState) {
		return localState;
	}

	const mergedState: IStringDictionary<any> = deepClone(localState);
	const baseToRemote = baseState ? compareExtensionState(baseState, remoteState) : { added: Object.keys(remoteState).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
	const baseToLocal = baseState ? compareExtensionState(baseState, localState) : { added: Object.keys(localState).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
	// Added/Updated in remote
	for (const key of [...baseToRemote.added.values(), ...baseToRemote.updated.values()]) {
		mergedState[key] = remoteState[key];
	}
	// Removed in remote
	for (const key of baseToRemote.removed.values()) {
		// Not updated in local
		if (!baseToLocal.updated.has(key)) {
			delete mergedState[key];
		}
	}
	return mergedState;
}

function compareExtensionState(from: IStringDictionary<any>, to: IStringDictionary<any>): { added: Set<string>, removed: Set<string>, updated: Set<string> } {
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
		if (!equals(value1, value2)) {
			updated.add(key);
		}
	}

	return { added, removed, updated };
}

function isSameExtensionState(a: IStringDictionary<any> = {}, b: IStringDictionary<any> = {}): boolean {
	const { added, removed, updated } = compareExtensionState(a, b);
	return added.size === 0 && removed.size === 0 && updated.size === 0;
}

// massage incoming extension - add optional properties
function massageIncomingExtension<T extends ISyncExtension>(extension: T): T {
	return { ...extension, ...{ disabled: !!extension.disabled, installed: !!extension.installed } };
}

// massage outgoing extension - remove optional properties
function massageOutgoingExtension<T extends ISyncExtension>(extension: T, key: string): T {
	const massagedExtension: ISyncExtension = {
		identifier: {
			id: extension.identifier.id,
			uuid: key.startsWith('uuid:') ? key.substring('uuid:'.length) : undefined
		},
	};
	if (extension.version) {
		massagedExtension.version = extension.version;
	}
	if (extension.disabled) {
		massagedExtension.disabled = true;
	}
	if (extension.installed) {
		massagedExtension.installed = true;
	}
	if (extension.state) {
		massagedExtension.state = extension.state;
	}
	return massagedExtension as T;
}
