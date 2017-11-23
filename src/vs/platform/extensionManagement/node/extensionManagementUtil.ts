/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as semver from 'semver';
import { adoptToGalleryExtensionId, LOCAL_EXTENSION_ID_REGEX } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

export function getIdAndVersionFromLocalExtensionId(localExtensionId: string): { id: string, version: string } {
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