/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { dirname } from '../../../../../../../base/common/resources.js';

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
 * Represents a file entry for simplified initialization.
 */
export interface IMockFileEntry {
	path: string;
	contents: string[];
}

/**
 * Creates mock filesystem from provided file entries.
 * @param fileService File service instance
 * @param files Array of file entries with path and contents
 */
export function mockFiles(fileService: IFileService, files: IMockFileEntry[], parentFolder?: URI): Promise<void> {
	return new MockFilesystem(files, fileService).mock(parentFolder);
}

/**
 * Utility to recursively creates provided filesystem structure.
 */
export class MockFilesystem {

	private createdFiles: URI[] = [];
	private createdFolders: URI[] = [];
	private createdRootFolders: URI[] = [];

	constructor(
		private readonly input: IMockFolder[] | IMockFileEntry[],
		@IFileService private readonly fileService: IFileService,
	) { }



	/**
	 * Starts the mock process.
	 */
	public async mock(parentFolder?: URI): Promise<void> {
		// Check if input is the new simplified format
		if (this.input.length > 0 && 'path' in this.input[0]) {
			return this.mockFromFileEntries(this.input as IMockFileEntry[]);
		}

		// Use the old format
		return this.mockFromFolders(this.input as IMockFolder[], parentFolder);
	}

	/**
	 * Mock using the new simplified file entry format.
	 */
	private async mockFromFileEntries(fileEntries: IMockFileEntry[]): Promise<void> {
		// Create all files and their parent directories
		for (const fileEntry of fileEntries) {
			const fileUri = URI.file(fileEntry.path);

			// Ensure parent directories exist
			await this.ensureParentDirectories(dirname(fileUri));

			// Create the file
			const contents = fileEntry.contents.join('\n');
			await this.fileService.writeFile(fileUri, VSBuffer.fromString(contents));

			this.createdFiles.push(fileUri);
		}
	}

	/**
	 * Mock using the old nested folder format.
	 */
	private async mockFromFolders(folders: IMockFolder[], parentFolder?: URI): Promise<void> {
		const result = await Promise.all(folders.map((folder) => this.mockFolder(folder, parentFolder)));
		this.createdRootFolders.push(...result);
	}

	public async delete(): Promise<void> {
		// Delete files created by the new format
		for (const fileUri of this.createdFiles) {
			if (await this.fileService.exists(fileUri)) {
				await this.fileService.del(fileUri, { useTrash: false });
			}
		}

		for (const folderUri of this.createdFolders.reverse()) { // reverse to delete children first
			if (await this.fileService.exists(folderUri)) {
				await this.fileService.del(folderUri, { recursive: true, useTrash: false });
			}
		}

		// Delete root folders created by the old format
		for (const folder of this.createdRootFolders) {
			await this.fileService.del(folder, { recursive: true, useTrash: false });
		}
	}

	/**
	 * The internal implementation of the filesystem mocking process for the old format.
	 */
	private async mockFolder(folder: IMockFolder, parentFolder?: URI): Promise<URI> {
		const folderUri = parentFolder
			? URI.joinPath(parentFolder, folder.name)
			: URI.file(folder.name);

		if (!(await this.fileService.exists(folderUri))) {
			try {
				await this.fileService.createFolder(folderUri);
			} catch (error) {
				throw new Error(`Failed to create folder '${folderUri.fsPath}': ${error}.`);
			}
		}

		const resolvedChildren: URI[] = [];
		for (const child of folder.children) {
			const childUri = URI.joinPath(folderUri, child.name);
			// create child file
			if ('contents' in child) {
				const contents: string = (typeof child.contents === 'string')
					? child.contents
					: child.contents.join('\n');

				await this.fileService.writeFile(childUri, VSBuffer.fromString(contents));

				resolvedChildren.push(childUri);

				continue;
			}

			// recursively create child filesystem structure
			resolvedChildren.push(await this.mockFolder(child, folderUri));
		}

		return folderUri;
	}

	/**
	 * Ensures that all parent directories of the given file URI exist.
	 */
	private async ensureParentDirectories(dirUri: URI): Promise<void> {
		if (!await this.fileService.exists(dirUri)) {
			if (dirUri.path === '/') {
				try {
					await this.fileService.createFolder(dirUri);
					this.createdFolders.push(dirUri);
				} catch (error) {
					throw new Error(`Failed to create directory '${dirUri.toString()}': ${error}.`);
				}
			} else {
				await this.ensureParentDirectories(dirname(dirUri));
			}
		}
	}
}
