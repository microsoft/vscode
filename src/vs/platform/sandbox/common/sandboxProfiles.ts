/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IAgentSandboxUserConfiguredPaths } from './settings.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';

export interface ISandboxProfile {
	id: string;
	name: string;
	settings: Record<string, boolean | string | string[] | IAgentSandboxUserConfiguredPaths>;
}

const libraryKey = 'chat.sandboxProfiles.v1';
const assignmentPrefix = 'chat.sandboxProfile.remote.';

export function readSandboxProfiles(storage: IStorageService): ISandboxProfile[] {
	return storage.getObject<ISandboxProfile[]>(libraryKey, StorageScope.PROFILE, []);
}

export function writeSandboxProfiles(storage: IStorageService, profiles: ISandboxProfile[]): void {
	storage.store(libraryKey, profiles, StorageScope.PROFILE, StorageTarget.MACHINE);
}

export function selectedSandboxProfile(storage: IStorageService, address: string): ISandboxProfile | undefined {
	const id = storage.get(assignmentPrefix + address, StorageScope.PROFILE);
	return id ? readSandboxProfiles(storage).find(profile => profile.id === id) : undefined;
}

export function selectSandboxProfile(storage: IStorageService, address: string, id: string | undefined): void {
	if (id) {
		storage.store(assignmentPrefix + address, id, StorageScope.PROFILE, StorageTarget.MACHINE);
	} else {
		storage.remove(assignmentPrefix + address, StorageScope.PROFILE);
	}
}

export function watchSandboxProfiles(storage: IStorageService, store: DisposableStore, change: (address?: string) => void): void {
	store.add(storage.onDidChangeValue(StorageScope.PROFILE, undefined, store)(event => {
		if (event.key === libraryKey) {
			change();
		} else if (event.key.startsWith(assignmentPrefix)) {
			change(event.key.slice(assignmentPrefix.length));
		}
	}));
}
