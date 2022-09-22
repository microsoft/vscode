/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ISyncUserDataProfile } from 'vs/platform/userDataSync/common/userDataSync';

interface IRelaxedMergeResult {
	local: { added: ISyncUserDataProfile[]; removed: IUserDataProfile[]; updated: ISyncUserDataProfile[] };
	remote: { added: IUserDataProfile[]; removed: ISyncUserDataProfile[]; updated: IUserDataProfile[] } | null;
}

export type IMergeResult = Required<IRelaxedMergeResult>;

interface IUserDataProfileInfo {
	readonly id: string;
	readonly name: string;
	readonly shortName?: string;
}

export function merge(local: IUserDataProfile[], remote: ISyncUserDataProfile[] | null, lastSync: ISyncUserDataProfile[] | null, ignored: string[]): IMergeResult {
	const result: IRelaxedMergeResult = {
		local: {
			added: [],
			removed: [],
			updated: [],
		}, remote: {
			added: [],
			removed: [],
			updated: [],
		}
	};

	if (!remote) {
		const added = local.filter(({ id }) => !ignored.includes(id));
		if (added.length) {
			result.remote!.added = added;
		} else {
			result.remote = null;
		}
		return result;
	}

	const localToRemote = compare(local, remote, ignored);
	if (localToRemote.added.length > 0 || localToRemote.removed.length > 0 || localToRemote.updated.length > 0) {

		const baseToLocal = compare(lastSync, local, ignored);
		const baseToRemote = compare(lastSync, remote, ignored);

		// Remotely removed profiles
		for (const id of baseToRemote.removed) {
			const e = local.find(profile => profile.id === id);
			if (e) {
				result.local.removed.push(e);
			}
		}

		// Remotely added profiles
		for (const id of baseToRemote.added) {
			const remoteProfile = remote.find(profile => profile.id === id)!;
			// Got added in local
			if (baseToLocal.added.includes(id)) {
				// Is different from local to remote
				if (localToRemote.updated.includes(id)) {
					// Remote wins always
					result.local.updated.push(remoteProfile);
				}
			} else {
				result.local.added.push(remoteProfile);
			}
		}

		// Remotely updated profiles
		for (const id of baseToRemote.updated) {
			// Remote wins always
			result.local.updated.push(remote.find(profile => profile.id === id)!);
		}

		// Locally added profiles
		for (const id of baseToLocal.added) {
			// Not there in remote
			if (!baseToRemote.added.includes(id)) {
				result.remote!.added.push(local.find(profile => profile.id === id)!);
			}
		}

		// Locally updated profiles
		for (const id of baseToLocal.updated) {
			// If removed in remote
			if (baseToRemote.removed.includes(id)) {
				continue;
			}

			// If not updated in remote
			if (!baseToRemote.updated.includes(id)) {
				result.remote!.updated.push(local.find(profile => profile.id === id)!);
			}
		}

		// Locally removed profiles
		for (const id of baseToLocal.removed) {
			result.remote!.removed.push(remote.find(profile => profile.id === id)!);
		}
	}

	if (result.remote!.added.length === 0 && result.remote!.removed.length === 0 && result.remote!.updated.length === 0) {
		result.remote = null;
	}

	return result;
}

function compare(from: IUserDataProfileInfo[] | null, to: IUserDataProfileInfo[], ignoredProfiles: string[]): { added: string[]; removed: string[]; updated: string[] } {
	from = from ? from.filter(({ id }) => !ignoredProfiles.includes(id)) : [];
	to = to.filter(({ id }) => !ignoredProfiles.includes(id));
	const fromKeys = from.map(({ id }) => id);
	const toKeys = to.map(({ id }) => id);
	const added = toKeys.filter(key => fromKeys.indexOf(key) === -1);
	const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1);
	const updated: string[] = [];

	for (const { id, name, shortName } of from) {
		if (removed.includes(id)) {
			continue;
		}
		const toProfile = to.find(p => p.id === id);
		if (!toProfile
			|| toProfile.name !== name
			|| toProfile.shortName !== shortName
		) {
			updated.push(id);
		}
	}

	return { added, removed, updated };
}
