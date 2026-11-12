/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ISaveOptions } from '../../../common/editor.js';

/**
 * Implements Save As for media previews, which can't modify the file: asks for a destination and
 * copies the file there.
 *
 * @returns The destination, or `undefined` if the user cancelled.
 */
export async function saveMediaFileAs(resource: URI, fileService: IFileService, fileDialogService: IFileDialogService, options: ISaveOptions | undefined): Promise<URI | undefined> {
	const target = await fileDialogService.pickFileToSave(resource, options?.availableFileSystems);
	if (!target) {
		return undefined;
	}

	if (!isEqual(target, resource)) {
		// The save dialog already confirmed replacing an existing file
		await fileService.copy(resource, target, true);
	}
	return target;
}
