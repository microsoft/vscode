/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { FileSystemProviderErrorCode, IFileService, toFileSystemProviderErrorCode } from '../../../../platform/files/common/files.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';

/** Rechecks the source after resolving local aliases; an undefined source cancels the save. */
export async function saveWebviewResource(getSource: () => URI | undefined, target: URI, fileService: IFileService, uriIdentityService: IUriIdentityService): Promise<void> {
	const source = getSource();
	if (!source) {
		return;
	}

	const sourceForComparison = source.scheme === Schemas.file ? source.with({ query: '' }) : source;
	if (uriIdentityService.extUri.isEqual(sourceForComparison, target)) {
		return;
	}

	if (source.scheme === Schemas.file) {
		const sourceRealPath = await fileService.realpath(sourceForComparison);
		if (sourceRealPath) {
			let targetRealPath: URI | undefined;
			try {
				targetRealPath = await fileService.realpath(target);
			} catch (error) {
				if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileNotFound) {
					throw error;
				}
			}
			if (targetRealPath && uriIdentityService.extUri.isEqual(sourceRealPath, targetRealPath)) {
				return;
			}
		}
	}

	const currentSource = getSource();
	if (!currentSource) {
		return;
	}

	const content = await fileService.readFileStream(currentSource);
	try {
		await fileService.writeFile(target, content.value);
	} finally {
		content.value.destroy();
	}
}
