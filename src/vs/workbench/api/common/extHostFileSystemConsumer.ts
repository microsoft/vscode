/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext } from './extHost.protocol';
import * as vscode from 'vscode';
import * as files from 'vs/platform/files/common/files';
import { FileSystemError } from 'vs/workbench/api/common/extHostTypes';
import { VSBuffer } from 'vs/base/common/buffer';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';

export class ExtHostConsumerFileSystem {

	readonly _serviceBrand: undefined;

	readonly value: vscode.FileSystem;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostFileSystemInfo fileSystemInfo: IExtHostFileSystemInfo,
	) {
		const proxy = extHostRpc.getProxy(MainContext.MainThreadFileSystem);

		this.value = Object.freeze({
			stat(uri: vscode.Uri): Promise<vscode.FileStat> {
				return proxy.$stat(uri).catch(ExtHostConsumerFileSystem._handleError);
			},
			readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
				return proxy.$readdir(uri).catch(ExtHostConsumerFileSystem._handleError);
			},
			createDirectory(uri: vscode.Uri): Promise<void> {
				return proxy.$mkdir(uri).catch(ExtHostConsumerFileSystem._handleError);
			},
			async readFile(uri: vscode.Uri): Promise<Uint8Array> {
				return proxy.$readFile(uri).then(buff => buff.buffer).catch(ExtHostConsumerFileSystem._handleError);
			},
			writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
				return proxy.$writeFile(uri, VSBuffer.wrap(content)).catch(ExtHostConsumerFileSystem._handleError);
			},
			delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean; }): Promise<void> {
				return proxy.$delete(uri, { ...{ recursive: false, useTrash: false }, ...options }).catch(ExtHostConsumerFileSystem._handleError);
			},
			rename(oldUri: vscode.Uri, newUri: vscode.Uri, options?: { overwrite?: boolean; }): Promise<void> {
				return proxy.$rename(oldUri, newUri, { ...{ overwrite: false }, ...options }).catch(ExtHostConsumerFileSystem._handleError);
			},
			copy(source: vscode.Uri, destination: vscode.Uri, options?: { overwrite?: boolean; }): Promise<void> {
				return proxy.$copy(source, destination, { ...{ overwrite: false }, ...options }).catch(ExtHostConsumerFileSystem._handleError);
			},
			isWritableFileSystem(scheme: string): boolean | undefined {
				const capabilities = fileSystemInfo.getCapabilities(scheme);
				if (typeof capabilities === 'number') {
					return !(capabilities & files.FileSystemProviderCapabilities.Readonly);
				}
				return undefined;
			}
		});
	}

	private static _handleError(err: any): never {
		// generic error
		if (!(err instanceof Error)) {
			throw new FileSystemError(String(err));
		}

		// no provider (unknown scheme) error
		if (err.name === 'ENOPRO') {
			throw FileSystemError.Unavailable(err.message);
		}

		// file system error
		switch (err.name) {
			case files.FileSystemProviderErrorCode.FileExists: throw FileSystemError.FileExists(err.message);
			case files.FileSystemProviderErrorCode.FileNotFound: throw FileSystemError.FileNotFound(err.message);
			case files.FileSystemProviderErrorCode.FileNotADirectory: throw FileSystemError.FileNotADirectory(err.message);
			case files.FileSystemProviderErrorCode.FileIsADirectory: throw FileSystemError.FileIsADirectory(err.message);
			case files.FileSystemProviderErrorCode.NoPermissions: throw FileSystemError.NoPermissions(err.message);
			case files.FileSystemProviderErrorCode.Unavailable: throw FileSystemError.Unavailable(err.message);

			default: throw new FileSystemError(err.message, err.name as files.FileSystemProviderErrorCode);
		}
	}
}

export interface IExtHostConsumerFileSystem extends ExtHostConsumerFileSystem { }
export const IExtHostConsumerFileSystem = createDecorator<IExtHostConsumerFileSystem>('IExtHostConsumerFileSystem');
