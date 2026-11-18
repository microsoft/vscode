/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/objects.js';
import { IUserDataProfile, UseDefaultProfileFlags } from '../../userDataProfile/common/userDataProfile.js';
import { ISyncUserDataProfile } from './userDataSync.js';

interface IRelaxedMergeResult {
	local: { added: ISyncUserDataProfile[]; removed: IUserDataProfile[]; updated: ISyncUserDataProfile[] };
	remote: { added: IUserDataProfile[]; removed: ISyncUserDataProfile[]; updated: IUserDataProfile[] } | null;
}

export type IMergeResult = Required<IRelaxedMergeResult>;

interface IUserDataProfileInfo {
	readonly id: string;
	readonly name: string;
	readonly icon?: string;
	readonly useDefaultFlags?: UseDefaultProfileFlags;
}

export function merge(local: IUserDataProfile[], remote: ISyncUserDataProfile[] | null, lastSync: ISyncUserDataProfile[] | null, ignored: string[]): IMergeResult {
	const localResult: { added: ISyncUserDataProfile[]; removed: IUserDataProfile[]; updated: ISyncUserDataProfile[] } = { added: [], removed: [], updated: [] };
	let remoteResult: { added: IUserDataProfile[]; removed: ISyncUserDataProfile[]; updated: IUserDataProfile[] } | null = { added: [], removed: [], updated: [] };

	if (!remote) {
		const added = local.filter(({ id }) => !ignored.includes(id));
		if (added.length) {
			remoteResult.added = added;
		} else {
			remoteResult = null;
		}
		return {
			local: localResult,
			remote: remoteResult
		};
	}

	const localToRemote = compare(local, remote, ignored);
	if (localToRemote.added.length > 0 || localToRemote.removed.length > 0 || localToRemote.updated.length > 0) {

		const baseToLocal = compare(lastSync, local, ignored);
		const baseToRemote = compare(lastSync, remote, ignored);

		// Remotely removed profiles
		for (const id of baseToRemote.removed) {
			const e = local.find(profile => profile.id === id);
			if (e) {
				localResult.removed.push(e);
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
					localResult.updated.push(remoteProfile);
				}
			} else {
				localResult.added.push(remoteProfile);
			}
		}

		// Remotely updated profiles
		for (const id of baseToRemote.updated) {
			// Remote wins always
			localResult.updated.push(remote.find(profile => profile.id === id)!);
		}

		// Locally added profiles
		for (const id of baseToLocal.added) {
			// Not there in remote
			if (!baseToRemote.added.includes(id)) {
				remoteResult.added.push(local.find(profile => profile.id === id)!);
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
				remoteResult.updated.push(local.find(profile => profile.id === id)!);
			}
		}

		// Locally removed profiles
		for (const id of baseToLocal.removed) {
			const removedProfile = remote.find(profile => profile.id === id);
			if (removedProfile) {
				remoteResult.removed.push(removedProfile);
			}
		}
	}

	if (remoteResult.added.length === 0 && remoteResult.removed.length === 0 && remoteResult.updated.length === 0) {
		remoteResult = null;
	}

	return { local: localResult, remote: remoteResult };
}

function compare(from: IUserDataProfileInfo[] | null, to: IUserDataProfileInfo[], ignoredProfiles: string[]): { added: string[]; removed: string[]; updated: string[] } {
	from = from ? from.filter(({ id }) => !ignoredProfiles.includes(id)) : [];
	to = to.filter(({ id }) => !ignoredProfiles.includes(id));
	const fromKeys = from.map(({ id }) => id);
	const toKeys = to.map(({ id }) => id);
	const added = toKeys.filter(key => !fromKeys.includes(key));
	const removed = fromKeys.filter(key => !toKeys.includes(key));
	const updated: string[] = [];

	for (const { id, name, icon, useDefaultFlags } of from) {
		if (removed.includes(id)) {
			continue;
		}
		const toProfile = to.find(p => p.id === id);
		if (!toProfile
			|| toProfile.name !== name
			|| toProfile.icon !== icon
			|| !equals(toProfile.useDefaultFlags, useDefaultFlags)
		) {
			updated.push(id);
		}
	}

	return { added, removed, updated };
}
