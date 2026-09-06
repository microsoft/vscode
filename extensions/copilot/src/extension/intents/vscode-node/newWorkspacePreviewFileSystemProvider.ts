/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, EventEmitter, FileChangeEvent, FileStat, FileSystemError, FileSystemProvider, FileType, Uri } from 'vscode';
import { INewWorkspacePreviewContentManager } from '../node/newIntent';


export class NewWorkspacePreviewFileSystemProvider implements FileSystemProvider {
	constructor(private readonly contentManager: INewWorkspacePreviewContentManager) { }
	async stat(uri: Uri): Promise<FileStat> {
		const node = this.contentManager.get(uri);
		if (!node) {
			throw FileSystemError.FileNotFound(uri);
		}

		const size = await node.content?.then((content) => content?.length) ?? 0;
		return {
			ctime: node.ctime ?? 0,
			mtime: node.ctime ?? 0,
			size: size,
			type: node.children ? FileType.Directory : FileType.File
		};
	}

	readDirectory(uri: Uri): [string, FileType][] | Thenable<[string, FileType][]> {
		const node = this.contentManager.get(uri);
		if (!node) {
			throw FileSystemError.FileNotFound(uri);
		}

		return node.children?.map((child) => [child.name, child.children ? FileType.Directory : FileType.File]) ?? [];
	}

	async readFile(uri: Uri): Promise<Uint8Array> {
		const node = this.contentManager.get(uri);
		if (!node) {
			throw FileSystemError.FileNotFound(uri);
		}

		let content: Uint8Array | undefined;
		try {
			content = await node.content;
		} catch { }
		return content ?? new Uint8Array();
	}

	// #region not implemented since this filesystem impl is readonly
	private readonly _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
	onDidChangeFile: Event<FileChangeEvent[]> = this._onDidChangeFile.event;
	watch(uri: Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[] }): Disposable {
		return { dispose() { } };
	}
	createDirectory(uri: Uri): void | Thenable<void> {
		throw FileSystemError.NoPermissions(uri);
	}
	writeFile(uri: Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean }): void | Thenable<void> {
		throw FileSystemError.NoPermissions(uri);
	}
	delete(uri: Uri, options: { readonly recursive: boolean }): void | Thenable<void> {
		throw FileSystemError.NoPermissions(uri);
	}
	rename(oldUri: Uri, newUri: Uri, options: { readonly overwrite: boolean }): void | Thenable<void> {
		throw FileSystemError.NoPermissions(newUri);
	}
	copy?(source: Uri, destination: Uri, options: { readonly overwrite: boolean }): void | Thenable<void> {
		throw FileSystemError.NoPermissions(destination);
	}
	// #endregion

	dispose(): void {
		this._onDidChangeFile.dispose();
	}
}
