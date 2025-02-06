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
 * TODO: @legomushroom
 */
type TResolved<T extends IMockFilesystemNode> = T & { uri: URI };

/**
 * Utility to recursively creates provided filesystem structure.
 */
export class MockFilesystem {
	constructor(
		private readonly folders: IMockFolder[],
		@IFileService private readonly fileService: IFileService,
	) { }

	/**
	 * Starts the mock process.
	 */
	public async mock(): Promise<TResolved<IMockFolder>[]> {
		return await Promise.all(
			this.folders
				.map((folder) => {
					return this.mockFolder(folder);
				}),
		);
	}

	/**
	 * The internal implementation of the filesystem mocking process.
	 */
	private async mockFolder(
		folder: IMockFolder,
		parentFolder?: URI,
	): Promise<TResolved<IMockFolder>> {
		const folderUri = parentFolder
			? URI.joinPath(parentFolder, folder.name)
			: URI.file(folder.name);

		// TODO: @legomushroom - throw if file or folder already exists
		if (await this.fileService.exists(folderUri)) {
			await this.fileService.del(folderUri);
		}
		await this.fileService.createFolder(folderUri);

		const resolvedChildren: (TResolved<IMockFolder> | TResolved<IMockFile>)[] = [];
		for (const child of folder.children) {
			const childUri = URI.joinPath(folderUri, child.name);
			// create child file
			if ('contents' in child) {
				await this.fileService.writeFile(childUri, VSBuffer.fromString(child.contents));

				resolvedChildren.push({
					...child,
					uri: childUri,
				});

				continue;
			}

			// recursively create child filesystem structure
			resolvedChildren.push(await this.mockFolder(child, folderUri));
		}

		return {
			...folder,
			uri: folderUri,
		};
	}
}
