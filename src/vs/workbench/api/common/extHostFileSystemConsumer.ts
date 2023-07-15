/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadFileSystemShape } from './extHost.protocol';
import type * as vscode from 'vscode';
import * as files from 'vs/platform/files/common/files';
import { FileSystemError } from 'vs/workbench/api/common/extHostTypes';
import { VSBuffer } from 'vs/base/common/buffer';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ResourceQueue } from 'vs/base/common/async';
import { IExtUri, extUri, extUriIgnorePathCase } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';
import { IMarkdownString } from 'vs/base/common/htmlContent';

export class ExtHostConsumerFileSystem {

	readonly _serviceBrand: undefined;

	readonly value: vscode.FileSystem;

	private readonly _proxy: MainThreadFileSystemShape;
	private readonly _fileSystemProvider = new Map<string, { impl: vscode.FileSystemProvider; extUri: IExtUri; isReadonly: boolean }>();

	private readonly _writeQueue = new ResourceQueue();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostFileSystemInfo fileSystemInfo: IExtHostFileSystemInfo,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadFileSystem);
		const that = this;

		this.value = Object.freeze({
			async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
				try {
					let stat;

					const provider = that._fileSystemProvider.get(uri.scheme);
					if (provider) {
						// use shortcut
						await that._proxy.$ensureActivation(uri.scheme);
						stat = await provider.impl.stat(uri);
					} else {
						stat = await that._proxy.$stat(uri);
					}

					return {
						type: stat.type,
						ctime: stat.ctime,
						mtime: stat.mtime,
						size: stat.size,
						permissions: stat.permissions === files.FilePermission.Readonly ? 1 : undefined
					};
				} catch (err) {
					ExtHostConsumerFileSystem._handleError(err);
				}
			},
			async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
				try {
					const provider = that._fileSystemProvider.get(uri.scheme);
					if (provider) {
						// use shortcut
						await that._proxy.$ensureActivation(uri.scheme);
						return (await provider.impl.readDirectory(uri)).slice(); // safe-copy
					} else {
						return await that._proxy.$readdir(uri);
					}
				} catch (err) {
					return ExtHostConsumerFileSystem._handleError(err);
				}
			},
			async createDirectory(uri: vscode.Uri): Promise<void> {
				try {
					const provider = that._fileSystemProvider.get(uri.scheme);
					if (provider && !provider.isReadonly) {
						// use shortcut
						await that._proxy.$ensureActivation(uri.scheme);
						return await that.mkdirp(provider.impl, provider.extUri, uri);
					} else {
						return await that._proxy.$mkdir(uri);
					}
				} catch (err) {
					return ExtHostConsumerFileSystem._handleError(err);
				}
			},
			async readFile(uri: vscode.Uri): Promise<Uint8Array> {
				try {
					const provider = that._fileSystemProvider.get(uri.scheme);
					if (provider) {
						// use shortcut
						await that._proxy.$ensureActivation(uri.scheme);
						return (await provider.impl.readFile(uri)).slice(); // safe-copy
					} else {
						const buff = await that._proxy.$readFile(uri);
						return buff.buffer;
					}
				} catch (err) {
					return ExtHostConsumerFileSystem._handleError(err);
				}
			},
			async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
				try {
					const provider = that._fileSystemProvider.get(uri.scheme);
					if (provider && !provider.isReadonly) {
						// use shortcut
						await that._proxy.$ensureActivation(uri.scheme);
						await that.mkdirp(provider.impl, provider.extUri, provider.extUri.dirname(uri));
						return await that._writeQueue.queueFor(uri).queue(() => Promise.resolve(provider.impl.writeFile(uri, content, { create: true, overwrite: true })));
					} else {
						return await that._proxy.$writeFile(uri, VSBuffer.wrap(content));
					}
				} catch (err) {
					return ExtHostConsumerFileSystem._handleError(err);
				}
			},
			async delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
				try {
					const provider = that._fileSystemProvider.get(uri.scheme);
					if (provider && !provider.isReadonly) {
						// use shortcut
						await that._proxy.$ensureActivation(uri.scheme);
						return await provider.impl.delete(uri, { recursive: false, ...options });
					} else {
						return await that._proxy.$delete(uri, { recursive: false, useTrash: false, atomic: false, ...options });
					}
				} catch (err) {
					return ExtHostConsumerFileSystem._handleError(err);
				}
			},
			async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options?: { overwrite?: boolean }): Promise<void> {
				try {
					// no shortcut: potentially involves different schemes, does mkdirp
					return await that._proxy.$rename(oldUri, newUri, { ...{ overwrite: false }, ...options });
				} catch (err) {
					return ExtHostConsumerFileSystem._handleError(err);
				}
			},
			async copy(source: vscode.Uri, destination: vscode.Uri, options?: { overwrite?: boolean }): Promise<void> {
				try {
					// no shortcut: potentially involves different schemes, does mkdirp
					return await that._proxy.$copy(source, destination, { ...{ overwrite: false }, ...options });
				} catch (err) {
					return ExtHostConsumerFileSystem._handleError(err);
				}
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

	private async mkdirp(provider: vscode.FileSystemProvider, providerExtUri: IExtUri, directory: vscode.Uri): Promise<void> {
		const directoriesToCreate: string[] = [];

		while (!providerExtUri.isEqual(directory, providerExtUri.dirname(directory))) {
			try {
				const stat = await provider.stat(directory);
				if ((stat.type & files.FileType.Directory) === 0) {
					throw FileSystemError.FileExists(`Unable to create folder '${directory.scheme === Schemas.file ? directory.fsPath : directory.toString(true)}' that already exists but is not a directory`);
				}

				break; // we have hit a directory that exists -> good
			} catch (error) {
				if (files.toFileSystemProviderErrorCode(error) !== files.FileSystemProviderErrorCode.FileNotFound) {
					throw error;
				}

				// further go up and remember to create this directory
				directoriesToCreate.push(providerExtUri.basename(directory));
				directory = providerExtUri.dirname(directory);
			}
		}

		for (let i = directoriesToCreate.length - 1; i >= 0; i--) {
			directory = providerExtUri.joinPath(directory, directoriesToCreate[i]);

			try {
				await provider.createDirectory(directory);
			} catch (error) {
				if (files.toFileSystemProviderErrorCode(error) !== files.FileSystemProviderErrorCode.FileExists) {
					// For mkdirp() we tolerate that the mkdir() call fails
					// in case the folder already exists. This follows node.js
					// own implementation of fs.mkdir({ recursive: true }) and
					// reduces the chances of race conditions leading to errors
					// if multiple calls try to create the same folders
					// As such, we only throw an error here if it is other than
					// the fact that the file already exists.
					// (see also https://github.com/microsoft/vscode/issues/89834)
					throw error;
				}
			}
		}
	}

	private static _handleError(err: any): never {
		// desired error type
		if (err instanceof FileSystemError) {
			throw err;
		}

		// file system provider error
		if (err instanceof files.FileSystemProviderError) {
			switch (err.code) {
				case files.FileSystemProviderErrorCode.FileExists: throw FileSystemError.FileExists(err.message);
				case files.FileSystemProviderErrorCode.FileNotFound: throw FileSystemError.FileNotFound(err.message);
				case files.FileSystemProviderErrorCode.FileNotADirectory: throw FileSystemError.FileNotADirectory(err.message);
				case files.FileSystemProviderErrorCode.FileIsADirectory: throw FileSystemError.FileIsADirectory(err.message);
				case files.FileSystemProviderErrorCode.NoPermissions: throw FileSystemError.NoPermissions(err.message);
				case files.FileSystemProviderErrorCode.Unavailable: throw FileSystemError.Unavailable(err.message);

				default: throw new FileSystemError(err.message, err.name as files.FileSystemProviderErrorCode);
			}
		}

		// generic error
		if (!(err instanceof Error)) {
			throw new FileSystemError(String(err));
		}

		// no provider (unknown scheme) error
		if (err.name === 'ENOPRO' || err.message.includes('ENOPRO')) {
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

	// ---

	addFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider, options?: { isCaseSensitive?: boolean; isReadonly?: boolean | IMarkdownString }): IDisposable {
		this._fileSystemProvider.set(scheme, { impl: provider, extUri: options?.isCaseSensitive ? extUri : extUriIgnorePathCase, isReadonly: !!options?.isReadonly });
		return toDisposable(() => this._fileSystemProvider.delete(scheme));
	}

	getFileSystemProviderExtUri(scheme: string) {
		return this._fileSystemProvider.get(scheme)?.extUri ?? extUri;
	}
}

export interface IExtHostConsumerFileSystem extends ExtHostConsumerFileSystem { }
export const IExtHostConsumerFileSystem = createDecorator<IExtHostConsumerFileSystem>('IExtHostConsumerFileSystem');
