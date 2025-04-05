/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buffer, ExtractError } from '../../../base/node/zip.js';
import { localize } from '../../../nls.js';
import { toExtensionManagementError } from '../common/abstractExtensionManagementService.js';
import { ExtensionManagementError, ExtensionManagementErrorCode } from '../common/extensionManagement.js';
import { IExtensionManifest } from '../../extensions/common/extensions.js';

export function fromExtractError(e: Error): ExtensionManagementError {
	let errorCode = ExtensionManagementErrorCode.Extract;
	if (e instanceof ExtractError) {
		if (e.type === 'CorruptZip') {
			errorCode = ExtensionManagementErrorCode.CorruptZip;
		} else if (e.type === 'Incomplete') {
			errorCode = ExtensionManagementErrorCode.IncompleteZip;
		}
	}
	return toExtensionManagementError(e, errorCode);
}

export async function getManifest(vsixPath: string): Promise<IExtensionManifest> {
	let data;
	try {
		data = await buffer(vsixPath, 'extension/package.json');
	} catch (e) {
		throw fromExtractError(e);
	}

	try {
		return JSON.parse(data.toString('utf8'));
	} catch (err) {
		throw new ExtensionManagementError(localize('invalidManifest', "VSIX invalid: package.json is not a JSON file."), ExtensionManagementErrorCode.Invalid);
	}
}
