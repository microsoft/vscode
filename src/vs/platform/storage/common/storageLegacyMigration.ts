/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageLegacyService, IStorageLegacy } from 'vs/platform/storage/common/storageLegacyService';
import { endsWith, startsWith, rtrim } from 'vs/base/common/strings';

/**
 * We currently store local storage with the following format:
 *
 * [Global]
 * storage://global/<key>
 *
 * [Workspace]
 * storage://workspace/<folder>/<key>
 * storage://workspace/empty:<id>/<key>
 * storage://workspace/root:<id>/<key>
 *
 * <folder>
 * macOS/Linux: /some/folder/path
 *     Windows: c%3A/Users/name/folder (normal path)
 *              file://localhost/c%24/name/folder (unc path)
 *
 * [no workspace]
 * storage://workspace/__$noWorkspace__<key>
 * => no longer being used (used for empty workspaces previously)
 */

const COMMON_WORKSPACE_PREFIX = `${StorageLegacyService.COMMON_PREFIX}workspace/`;
const NO_WORKSPACE_PREFIX = 'storage://workspace/__$noWorkspace__';

export type StorageObject = { [key: string]: string };

export interface IParsedStorage {
	multiRoot: Map<string, StorageObject>;
	folder: Map<string, StorageObject>;
	empty: Map<string, StorageObject>;
	noWorkspace: StorageObject;
}

export function parseFolderStorage(storage: IStorageLegacy, folderId: string): StorageObject {

	const workspaces: { prefix: string; resource: string; }[] = [];
	const activeKeys = new Set<string>();

	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);

		// Workspace Storage (storage://workspace/)
		if (!startsWith(key, StorageLegacyService.WORKSPACE_PREFIX)) {
			continue;
		}

		activeKeys.add(key);

		// We are looking for key: storage://workspace/<folder>/workspaceIdentifier to be able to find all folder
		// paths that are known to the storage. is the only way how to parse all folder paths known in storage.
		if (endsWith(key, StorageLegacyService.WORKSPACE_IDENTIFIER)) {

			// storage://workspace/<folder>/workspaceIdentifier => <folder>/
			let workspace = key.substring(StorageLegacyService.WORKSPACE_PREFIX.length, key.length - StorageLegacyService.WORKSPACE_IDENTIFIER.length);

			// macOS/Unix: Users/name/folder/
			//    Windows: c%3A/Users/name/folder/
			if (!startsWith(workspace, 'file:')) {
				workspace = `file:///${rtrim(workspace, '/')}`;
			}

			// Windows UNC path: file://localhost/c%3A/Users/name/folder/
			else {
				workspace = rtrim(workspace, '/');
			}

			// storage://workspace/<folder>/workspaceIdentifier => storage://workspace/<folder>/
			const prefix = key.substr(0, key.length - StorageLegacyService.WORKSPACE_IDENTIFIER.length);
			if (startsWith(workspace, folderId)) {
				workspaces.push({ prefix, resource: workspace });
			}
		}
	}

	// With all the folder paths known we can now extract storage for each path. We have to go through all workspaces
	// from the longest path first to reliably extract the storage. The reason is that one folder path can be a parent
	// of another folder path and as such a simple indexOf check is not enough.
	const workspacesByLength = workspaces.sort((w1, w2) => w1.prefix.length >= w2.prefix.length ? -1 : 1);

	const folderWorkspaceStorage: StorageObject = Object.create(null);

	workspacesByLength.forEach(workspace => {
		activeKeys.forEach(key => {
			if (!startsWith(key, workspace.prefix)) {
				return; // not part of workspace prefix or already handled
			}

			activeKeys.delete(key);

			if (workspace.resource === folderId) {
				// storage://workspace/<folder>/someKey => someKey
				const storageKey = key.substr(workspace.prefix.length);
				folderWorkspaceStorage[storageKey] = storage.getItem(key);
			}
		});
	});

	return folderWorkspaceStorage;
}

export function parseNoWorkspaceStorage(storage: IStorageLegacy) {
	const noWorkspacePrefix = `${StorageLegacyService.WORKSPACE_PREFIX}__$noWorkspace__`;

	const noWorkspaceStorage: StorageObject = Object.create(null);
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);

		// No Workspace key is for extension development windows
		if (startsWith(key, noWorkspacePrefix) && !endsWith(key, StorageLegacyService.WORKSPACE_IDENTIFIER)) {
			// storage://workspace/__$noWorkspace__someKey => someKey
			noWorkspaceStorage[key.substr(NO_WORKSPACE_PREFIX.length)] = storage.getItem(key);
		}
	}

	return noWorkspaceStorage;
}

export function parseEmptyStorage(storage: IStorageLegacy, targetWorkspaceId: string): StorageObject {
	const emptyStoragePrefix = `${COMMON_WORKSPACE_PREFIX}${targetWorkspaceId}/`;

	const emptyWorkspaceStorage: StorageObject = Object.create(null);
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);

		if (startsWith(key, emptyStoragePrefix) && !endsWith(key, StorageLegacyService.WORKSPACE_IDENTIFIER)) {
			// storage://workspace/empty:<id>/someKey => someKey
			emptyWorkspaceStorage[key.substr(emptyStoragePrefix.length)] = storage.getItem(key);
		}
	}

	return emptyWorkspaceStorage;
}

export function parseMultiRootStorage(storage: IStorageLegacy, targetWorkspaceId: string): StorageObject {
	const multiRootStoragePrefix = `${COMMON_WORKSPACE_PREFIX}${targetWorkspaceId}/`;

	const multiRootWorkspaceStorage: StorageObject = Object.create(null);
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);

		if (startsWith(key, multiRootStoragePrefix) && !endsWith(key, StorageLegacyService.WORKSPACE_IDENTIFIER)) {
			// storage://workspace/root:<id>/someKey => someKey
			multiRootWorkspaceStorage[key.substr(multiRootStoragePrefix.length)] = storage.getItem(key);
		}
	}

	return multiRootWorkspaceStorage;
}
