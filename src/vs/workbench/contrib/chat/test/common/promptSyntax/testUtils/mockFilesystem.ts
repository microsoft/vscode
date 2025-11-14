/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../../base/common/uri.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { timeout } from '../../../../../../../base/common/async.js';
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
	contents: string | readonly string[];
}

/**
 * Represents a `folder` node.
 */
export interface IMockFolder extends IMockFilesystemNode {
	children: (IMockFolder | IMockFile)[];
}

/**
 * Type for a mocked file or a folder that has absolute path URI.
 */
type TWithURI<T extends IMockFilesystemNode> = T & { uri: URI };

/**
 * Utility to recursively creates provided filesystem structure.
 */
export class MockFilesystem {

	private createdRootFolders: URI[] = [];

	constructor(
		private readonly folders: IMockFolder[],
		@IFileService private readonly fileService: IFileService,
	) { }

	/**
	 * Starts the mock process.
	 */
	public async mock(parentFolder?: URI): Promise<TWithURI<IMockFolder>[]> {
		const result = await Promise.all(
			this.folders
				.map((folder) => {
					return this.mockFolder(folder, parentFolder);
				}),
		);

		// wait for the filesystem event to settle before proceeding
		// this is temporary workaround and should be fixed once we
		// improve behavior of the `settled()` / `allSettled()` methods
		await timeout(25);

		this.createdRootFolders.push(...result.map(r => r.uri));

		return result;
	}

	public async delete(): Promise<void> {
		for (const folder of this.createdRootFolders) {
			await this.fileService.del(folder, { recursive: true, useTrash: false });
		}
	}

	/**
	 * The internal implementation of the filesystem mocking process.
	 *
	 * @throws If a folder or file in the filesystem structure already exists.
	 * 		   This is to prevent subtle errors caused by overwriting existing files.
	 */
	private async mockFolder(
		folder: IMockFolder,
		parentFolder?: URI,
	): Promise<TWithURI<IMockFolder>> {
		const folderUri = parentFolder
			? URI.joinPath(parentFolder, folder.name)
			: URI.file(folder.name);

		assert(
			!(await this.fileService.exists(folderUri)),
			`Folder '${folderUri.path}' already exists.`,
		);

		try {
			await this.fileService.createFolder(folderUri);
		} catch (error) {
			throw new Error(`Failed to create folder '${folderUri.fsPath}': ${error}.`);
		}

		const resolvedChildren: (TWithURI<IMockFolder> | TWithURI<IMockFile>)[] = [];
		for (const child of folder.children) {
			const childUri = URI.joinPath(folderUri, child.name);
			// create child file
			if ('contents' in child) {
				assert(
					!(await this.fileService.exists(childUri)),
					`File '${folderUri.path}' already exists.`,
				);

				const contents: string = (typeof child.contents === 'string')
					? child.contents
					: child.contents.join('\n');

				await this.fileService.writeFile(childUri, VSBuffer.fromString(contents));

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
