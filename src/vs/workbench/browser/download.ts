/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { triggerDownload } from '../../base/browser/dom.js';
import { VSBuffer } from '../../base/common/buffer.js';
import { CancellationToken } from '../../base/common/cancellation.js';
import { matchesSomeScheme, Schemas } from '../../base/common/network.js';
import { basename } from '../../base/common/path.js';
import { isWeb } from '../../base/common/platform.js';
import { joinPath } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { localize } from '../../nls.js';
import { IFileDialogService } from '../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../platform/files/common/files.js';
import { ISharedWebContentExtractorService } from '../../platform/webContentExtractor/common/webContentExtractor.js';

/** Downloads a resource or in-memory file to the user's local file system. */
export async function downloadFile(source: URI | VSBuffer | Uint8Array, name: string, fileService: IFileService, fileDialogService: IFileDialogService, webContentExtractorService: ISharedWebContentExtractorService): Promise<void> {
	const fileName = basename(name);
	let target: URI | undefined;
	if (!isWeb) {
		target = await fileDialogService.showSaveDialog({
			defaultUri: joinPath(await fileDialogService.defaultFilePath(Schemas.file), fileName),
			availableFileSystems: [Schemas.file],
			title: localize('downloadFile.title', "Download"),
		});
		if (!target) {
			return;
		}
	}

	let content: VSBuffer;
	if (URI.isUri(source) && !isWeb && matchesSomeScheme(source, Schemas.http, Schemas.https)) {
		const image = await webContentExtractorService.readImage(source, CancellationToken.None);
		if (!image) {
			throw new Error(localize('downloadFile.imageUnavailable', "Unable to read image data from the URL."));
		}
		content = image;
	} else {
		content = URI.isUri(source) ? (await fileService.readFile(source)).value : source instanceof Uint8Array ? VSBuffer.wrap(source) : source;
	}
	if (target) {
		await fileService.writeFile(target, content);
	} else {
		triggerDownload(content.buffer, fileName);
	}
}
