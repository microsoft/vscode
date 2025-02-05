/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';

/**
 * Represents a generic file system node.
 */
interface IMockFilesystemNode {
	name: string;
}

/**
 * Represents a `file` node.
 */
export interface IMockFile extends IMockFilesystemNode {
	contents: string;
}

/**
 * Represents a `folder` node.
 */
export interface IMockFolder extends IMockFilesystemNode {
	children: (IMockFolder | IMockFile)[];
}

/**
 * Creates provided filesystem folder structure. Exists so that
 * the public {@link mockFolder} function doesn't expose
 * the {@link parentFolder} parameter.
 */
const mockFolderInternal = async (
	folder: IMockFolder,
	fileService: IFileService,
	parentFolder?: URI,
): Promise<void> => {
	const folderUri = parentFolder
		? URI.joinPath(parentFolder, folder.name)
		: URI.file(folder.name);

	// TODO: @legomushroom - throw if file or folder already exists
	if (await fileService.exists(folderUri)) {
		await fileService.del(folderUri);
	}
	await fileService.createFolder(folderUri);

	for (const child of folder.children) {
		const childUri = URI.joinPath(folderUri, child.name);
		// create child file
		if ('contents' in child) {
			await fileService.writeFile(childUri, VSBuffer.fromString(child.contents));
			continue;
		}

		// recursively create child filesystem structure
		await mockFolderInternal(child, fileService, folderUri);
	}
};

/**
 * Creates provided filesystem folder structure.
 */
export const mockFolder = async (
	folder: IMockFolder,
	fileService: IFileService,
): Promise<void> => {
	return await mockFolderInternal(folder, fileService);
};
