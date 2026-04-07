/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type { FileStat, FileSystemWatcher, RelativePattern, Uri } from 'vscode';
import { Event } from '../../../util/vs/base/common/event';
import { dirname, isEqual } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { assertReadFileSizeLimit, IFileSystemService } from '../common/fileSystemService';
import { FileType } from '../common/fileTypes';

export class NodeFileSystemService implements IFileSystemService {

	declare readonly _serviceBrand: undefined;


	async stat(uri: URI): Promise<FileStat> {
		const stat = await fs.promises.stat(uri.fsPath);
		return {
			type: stat.isFile() ? FileType.File : FileType.Directory,
			ctime: stat.ctimeMs,
			mtime: stat.mtimeMs,
			size: stat.size
		};
	}

	async readDirectory(uri: URI): Promise<[string, FileType][]> {
		assetIsFileUri(uri);
		const readDir = await fs.promises.readdir(uri.fsPath, { withFileTypes: true });
		const result: [string, FileType][] = [];
		for (const file of readDir) {
			result.push([file.name, file.isFile() ? FileType.File : FileType.Directory]);
		}
		return result;
	}

	async createDirectory(uri: URI): Promise<void> {
		assetIsFileUri(uri);
		return fs.promises.mkdir(uri.fsPath);
	}

	async readFile(uri: URI, disableLimit?: boolean): Promise<Uint8Array> {
		assetIsFileUri(uri);
		await assertReadFileSizeLimit(this, uri, disableLimit);
		return fs.promises.readFile(uri.fsPath);
	}

	async writeFile(uri: URI, content: Uint8Array): Promise<void> {
		assetIsFileUri(uri);
		await fs.promises.mkdir(dirname(uri).fsPath, { recursive: true });
		return fs.promises.writeFile(uri.fsPath, content);
	}

	async delete(uri: URI, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
		assetIsFileUri(uri);
		return fs.promises.rm(uri.fsPath, { recursive: options?.recursive ?? false });
	}

	async rename(oldURI: URI, newURI: URI, options?: { overwrite?: boolean }): Promise<void> {
		assetIsFileUri(oldURI);
		assetIsFileUri(newURI);
		// Check if new path exists if overwrite is not set return
		if (!options?.overwrite && fs.existsSync(newURI.fsPath)) {
			return;
		}

		return fs.promises.rename(oldURI.fsPath, newURI.fsPath);
	}

	async copy(source: URI, destination: URI, options?: { overwrite?: boolean }): Promise<void> {
		assetIsFileUri(source);
		assetIsFileUri(destination);
		// Calculate copy contants based on overwrite option
		const copyConstant = options?.overwrite ? fs.constants.COPYFILE_FICLONE : fs.constants.COPYFILE_EXCL;
		return fs.promises.copyFile(source.fsPath, destination.fsPath, copyConstant);
	}

	isWritableFileSystem(scheme: string): boolean | undefined {
		return true;
	}

	createFileSystemWatcher(_glob: string | RelativePattern): FileSystemWatcher {
		return new class implements FileSystemWatcher {
			ignoreCreateEvents = false;
			ignoreChangeEvents = false;
			ignoreDeleteEvents = false;
			onDidCreate = Event.None;
			onDidChange = Event.None;
			onDidDelete = Event.None;
			dispose() {
				// noop
			}
		};
	}
}

/**
 * A helper utility to read a file from the open text buffer if applicable otherwise from the filesystem.
 * This can be useful when you want to get the contents that are shown in the editor if a file is open, otherwise delegate to disk
 * @param fileSystemService The filesystem service
 * @param workspaceService The workspace service
 * @param uri The uri to read
 * @param maxBytesToRead An optional max bytes to read from the file system. If open, the entire document is always read.
 * @returns A promise that resolves to the file content or the file buffer
 */
export async function readFileFromTextBufferOrFS(fileSystemService: IFileSystemService, workspaceService: IWorkspaceService, uri: Uri, maxBytesToRead?: number): Promise<string | Uint8Array> {
	// First check open text documents
	const file = workspaceService.textDocuments.find(d => isEqual(d.uri, uri));
	if (file) {
		return file.getText();
	}
	try {
		assetIsFileUri(uri);
		if (maxBytesToRead !== undefined) {
			const fileHandle = await fs.promises.open(uri.fsPath, 'r');
			try {
				const buffer = Buffer.alloc(maxBytesToRead);
				const { bytesRead } = await fileHandle.read(buffer, 0, maxBytesToRead, 0);
				return buffer.subarray(0, bytesRead);
			} finally {
				await fileHandle.close();
			}
		}
		return fileSystemService.readFile(uri);
	} catch {
		const buffer = await fileSystemService.readFile(uri);
		if (maxBytesToRead) {
			return buffer.subarray(0, maxBytesToRead);
		}
		return buffer;
	}
}


function assetIsFileUri(uri: URI) {
	if (uri.scheme !== 'file') {
		throw new Error(`URI must be of file scheme, received ${uri.scheme}`);
	}
}
