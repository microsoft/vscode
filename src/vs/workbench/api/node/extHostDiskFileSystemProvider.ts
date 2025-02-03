/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IExtHostConsumerFileSystem } from '../common/extHostFileSystemConsumer.js';
import { Schemas } from '../../../base/common/network.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { DiskFileSystemProvider } from '../../../platform/files/node/diskFileSystemProvider.js';
import { FilePermission } from '../../../platform/files/common/files.js';
import { isLinux } from '../../../base/common/platform.js';

export class ExtHostDiskFileSystemProvider {

	constructor(
		@IExtHostConsumerFileSystem extHostConsumerFileSystem: IExtHostConsumerFileSystem,
		@ILogService logService: ILogService
	) {

		// Register disk file system provider so that certain
		// file operations can execute fast within the extension
		// host without roundtripping.
		extHostConsumerFileSystem.addFileSystemProvider(Schemas.file, new DiskFileSystemProviderAdapter(logService), { isCaseSensitive: isLinux });
	}
}

class DiskFileSystemProviderAdapter implements vscode.FileSystemProvider {

	private readonly impl = new DiskFileSystemProvider(this.logService);

	constructor(private readonly logService: ILogService) { }

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		const stat = await this.impl.stat(uri);

		return {
			type: stat.type,
			ctime: stat.ctime,
			mtime: stat.mtime,
			size: stat.size,
			permissions: stat.permissions === FilePermission.Readonly ? 1 : undefined
		};
	}

	readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		return this.impl.readdir(uri);
	}

	createDirectory(uri: vscode.Uri): Promise<void> {
		return this.impl.mkdir(uri);
	}

	readFile(uri: vscode.Uri): Promise<Uint8Array> {
		return this.impl.readFile(uri);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean }): Promise<void> {
		return this.impl.writeFile(uri, content, { ...options, unlock: false, atomic: false });
	}

	delete(uri: vscode.Uri, options: { readonly recursive: boolean }): Promise<void> {
		return this.impl.delete(uri, { ...options, useTrash: false, atomic: false });
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean }): Promise<void> {
		return this.impl.rename(oldUri, newUri, options);
	}

	copy(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean }): Promise<void> {
		return this.impl.copy(source, destination, options);
	}

	// --- Not Implemented ---

	get onDidChangeFile(): never { throw new Error('Method not implemented.'); }
	watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[] }): vscode.Disposable { throw new Error('Method not implemented.'); }
}
