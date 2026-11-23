/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IAgentSandboxUserConfiguredPaths } from './settings.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';

/** A named set of sandbox setting values, keyed by VS Code sandbox setting ID. */
export interface ISandboxProfile {
	id: string;
	name: string;
	settings: Record<string, boolean | string | string[] | IAgentSandboxUserConfiguredPaths>;
}

// Shared by every VS Code profile and the Agents window on this machine, and not synced:
// a profile reaches other devices through the copy stored on the host it is assigned to.
const libraryKey = 'chat.sandboxProfiles.v1';

/** Reads this machine's sandbox profile library. */
export function readSandboxProfiles(storage: IStorageService): ISandboxProfile[] {
	return storage.getObject<ISandboxProfile[]>(libraryKey, StorageScope.APPLICATION_SHARED, []);
}

/** Replaces this machine's sandbox profile library. Hosts the profiles are assigned to are not changed. */
export function writeSandboxProfiles(storage: IStorageService, profiles: readonly ISandboxProfile[]): void {
	storage.store(libraryKey, profiles, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
}

/** Calls `onChange` whenever the library changes, including from another window. */
export function watchSandboxProfiles(storage: IStorageService, store: DisposableStore, onChange: () => void): void {
	store.add(storage.onDidChangeValue(StorageScope.APPLICATION_SHARED, libraryKey, store)(() => onChange()));
}
