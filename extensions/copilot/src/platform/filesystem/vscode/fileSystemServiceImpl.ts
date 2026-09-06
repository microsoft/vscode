/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { URI } from '../../../util/vs/base/common/uri';
import { assertReadFileSizeLimit, IFileSystemService } from '../common/fileSystemService';
import { FileType } from '../common/fileTypes';

export class VSCodeFileSystemService implements IFileSystemService {

	declare readonly _serviceBrand: undefined;

	async stat(uri: URI): Promise<vscode.FileStat> {
		return vscode.workspace.fs.stat(uri);
	}

	async readDirectory(uri: URI): Promise<[string, FileType][]> {
		return vscode.workspace.fs.readDirectory(uri);
	}

	async createDirectory(uri: URI): Promise<void> {
		return vscode.workspace.fs.createDirectory(uri);
	}

	async readFile(uri: URI, disableLimit?: boolean): Promise<Uint8Array> {
		await assertReadFileSizeLimit(this, uri, disableLimit);
		return vscode.workspace.fs.readFile(uri);
	}

	async writeFile(uri: URI, content: Uint8Array): Promise<void> {
		return vscode.workspace.fs.writeFile(uri, content);
	}

	async delete(uri: URI, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
		return vscode.workspace.fs.delete(uri, options);
	}

	async rename(oldURI: URI, newURI: URI, options?: { overwrite?: boolean }): Promise<void> {
		return vscode.workspace.fs.rename(oldURI, newURI, options);
	}

	async copy(source: URI, destination: URI, options?: { overwrite?: boolean }): Promise<void> {
		return vscode.workspace.fs.copy(source, destination, options);
	}

	isWritableFileSystem(scheme: string): boolean {
		return !!vscode.workspace.fs.isWritableFileSystem(scheme);
	}

	createFileSystemWatcher(glob: string | vscode.RelativePattern): vscode.FileSystemWatcher {
		return vscode.workspace.createFileSystemWatcher(glob);
	}
}
