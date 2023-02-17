/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buffer, ExtractError } from 'vs/base/node/zip';
import { localize } from 'vs/nls';
import { ExtensionManagementError, ExtensionManagementErrorCode } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';

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

export function toExtensionManagementError(error: Error): ExtensionManagementError {
	let errorCode = ExtensionManagementErrorCode.Extract;

	if (error instanceof ExtractError) {
		if (error.type === 'CorruptZip') {
			errorCode = ExtensionManagementErrorCode.CorruptZip;
		} else if (error.type === 'Incomplete') {
			errorCode = ExtensionManagementErrorCode.IncompleteZip;
		}
	}

	return new ExtensionManagementError(error.message, errorCode);
}
