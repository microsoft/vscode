/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceSet } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

/**
 * Reads a set of disabled customization URIs persisted with {@link storeDisabledPromptFiles}.
 */
export function readDisabledPromptFiles(storageService: IStorageService, key: string): ResourceSet {
	const result = new ResourceSet();
	try {
		const arr = JSON.parse(storageService.get(key, StorageScope.PROFILE, '[]'));
		if (Array.isArray(arr)) {
			for (const s of arr) {
				try {
					result.add(URI.revive(s));
				} catch {
					// ignore
				}
			}
		}
	} catch {
		// ignore invalid storage values
	}
	return result;
}

/**
 * Persists a set of disabled customization URIs in the profile, or removes the key when the set is empty.
 */
export function storeDisabledPromptFiles(storageService: IStorageService, key: string, uris: Iterable<URI>): void {
	const disabled = Array.from(uris, uri => uri.toJSON());
	if (disabled.length === 0) {
		storageService.remove(key, StorageScope.PROFILE);
	} else {
		storageService.store(key, JSON.stringify(disabled), StorageScope.PROFILE, StorageTarget.USER);
	}
}
