/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import { adoptToGalleryExtensionId, LOCAL_EXTENSION_ID_REGEX } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionManifest } from 'vs/platform/extensionManagement/common/extensionManagement';
import { buffer } from 'vs/platform/node/zip';
import { localize } from 'vs/nls';

export function getIdAndVersionFromLocalExtensionId(localExtensionId: string): { id: string, version: string | null } {
	const matches = LOCAL_EXTENSION_ID_REGEX.exec(localExtensionId);
	if (matches && matches[1] && matches[2]) {
		const version = semver.valid(matches[2]);
		if (version) {
			return { id: adoptToGalleryExtensionId(matches[1]), version };
		}
	}
	return {
		id: adoptToGalleryExtensionId(localExtensionId),
		version: null
	};
}

export function getManifest(vsix: string): Promise<IExtensionManifest> {
	return buffer(vsix, 'extension/package.json')
		.then(buffer => {
			try {
				return JSON.parse(buffer.toString('utf8'));
			} catch (err) {
				throw new Error(localize('invalidManifest', "VSIX invalid: package.json is not a JSON file."));
			}
		});
}