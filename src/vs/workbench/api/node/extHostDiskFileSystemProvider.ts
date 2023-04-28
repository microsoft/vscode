/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { Schemas } from 'vs/base/common/network';
import { ILogService } from 'vs/platform/log/common/log';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { FileSystemProviderError } from 'vs/platform/files/common/files';
import { FileSystemError } from 'vs/workbench/api/common/extHostTypes';

export class ExtHostDiskFileSystemProvider {

	constructor(
		@IExtHostConsumerFileSystem extHostConsumerFileSystem: IExtHostConsumerFileSystem,
		@ILogService logService: ILogService
	) {

		// Register disk file system provider so that certain
		// file operations can execute fast within the extension
		// host without roundtripping.
		extHostConsumerFileSystem.addFileSystemProvider(Schemas.file, new DiskFileSystemProviderAdapter(logService));
	}
}

class DiskFileSystemProviderAdapter implements vscode.FileSystemProvider {

	private readonly impl = new DiskFileSystemProvider(this.logService);

	constructor(private readonly logService: ILogService) { }

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		try {
			return await this.impl.stat(uri);
		} catch (error) {
			this.handleError(error);
		}
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		try {
			return await this.impl.readdir(uri);
		} catch (error) {
			this.handleError(error);
		}
	}

	async createDirectory(uri: vscode.Uri): Promise<void> {
		try {
			return await this.impl.mkdir(uri);
		} catch (error) {
			this.handleError(error);
		}
	}

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		try {
			return await this.impl.readFile(uri);
		} catch (error) {
			this.handleError(error);
		}
	}

	async writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean }): Promise<void> {
		try {
			return await this.impl.writeFile(uri, content, { ...options, unlock: false });
		} catch (error) {
			this.handleError(error);
		}
	}

	async delete(uri: vscode.Uri, options: { readonly recursive: boolean }): Promise<void> {
		try {
			return await this.impl.delete(uri, { ...options, useTrash: false });
		} catch (error) {
			this.handleError(error);
		}
	}

	async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean }): Promise<void> {
		try {
			return await this.impl.rename(oldUri, newUri, options);
		} catch (error) {
			this.handleError(error);
		}
	}

	async copy(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean }): Promise<void> {
		try {
			return await this.impl.copy(source, destination, options);
		} catch (error) {
			this.handleError(error);
		}
	}

	private handleError(error: unknown): never {
		if (error instanceof FileSystemProviderError) {
			throw new FileSystemError(error.message, error.code);
		}

		throw error;
	}

	// --- Not Implemented ---

	get onDidChangeFile(): never { throw new Error('Method not implemented.'); }
	watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[] }): vscode.Disposable { throw new Error('Method not implemented.'); }
}
