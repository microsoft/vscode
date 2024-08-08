/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buffer, ExtractError } from 'vs/base/node/zip';
import { localize } from 'vs/nls';
import { toExtensionManagementError } from 'vs/platform/extensionManagement/common/abstractExtensionManagementService';
import { ExtensionManagementError, ExtensionManagementErrorCode } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';

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
