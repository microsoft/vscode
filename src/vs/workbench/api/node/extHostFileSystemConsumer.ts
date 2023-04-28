/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';
import { ExtHostConsumerFileSystem as CommonExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { Schemas } from 'vs/base/common/network';
import { ILogService } from 'vs/platform/log/common/log';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';

export class ExtHostConsumerFileSystem extends CommonExtHostConsumerFileSystem {

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostFileSystemInfo fileSystemInfo: IExtHostFileSystemInfo,
		@ILogService logService: ILogService
	) {
		super(extHostRpc, fileSystemInfo);

		this.addFileSystemProvider(Schemas.file, new DiskFileSystemProviderAdapter(logService));
	}
}

class DiskFileSystemProviderAdapter implements vscode.FileSystemProvider {

	private readonly impl = new DiskFileSystemProvider(this.logService);

	constructor(private readonly logService: ILogService) { }

	stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
		return this.impl.stat(uri);
	}

	readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]> {
		return this.impl.readdir(uri);
	}

	createDirectory(uri: vscode.Uri): Thenable<void> {
		return this.impl.mkdir(uri);
	}

	readFile(uri: vscode.Uri): Thenable<Uint8Array> {
		return this.impl.readFile(uri);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean }): Thenable<void> {
		return this.impl.writeFile(uri, content, { ...options, unlock: false });
	}

	delete(uri: vscode.Uri, options: { readonly recursive: boolean }): Thenable<void> {
		return this.impl.delete(uri, { ...options, useTrash: false });
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean }): Thenable<void> {
		return this.impl.rename(oldUri, newUri, options);
	}

	copy(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean }): Thenable<void> {
		return this.impl.copy(source, destination, options);
	}

	// --- Not Implemented ---

	get onDidChangeFile(): never { throw new Error('Method not implemented.'); }
	watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[] }): vscode.Disposable { throw new Error('Method not implemented.'); }










}
