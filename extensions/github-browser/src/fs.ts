/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import {
	CancellationToken,
	Disposable,
	Event,
	EventEmitter,
	FileChangeEvent,
	FileChangeType,
	FileSearchOptions,
	FileSearchProvider,
	FileSearchQuery,
	FileStat,
	FileSystemError,
	FileSystemProvider,
	FileType,
	Progress,
	TextSearchOptions,
	TextSearchProvider,
	TextSearchQuery,
	TextSearchResult,
	Uri,
	workspace,
} from 'vscode';
import { IChangeStore, ContextStore } from './stores';
import { GitHubApiContext } from './github/api';

const emptyDisposable = { dispose: () => { /* noop */ } };
const textEncoder = new TextEncoder();

export class VirtualFS implements FileSystemProvider, FileSearchProvider, TextSearchProvider, Disposable {
	private _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
	get onDidChangeFile(): Event<FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	private readonly disposable: Disposable;

	constructor(
		readonly scheme: string,
		private readonly originalScheme: string,
		contextStore: ContextStore<GitHubApiContext>,
		private readonly changeStore: IChangeStore,
		private readonly fs: FileSystemProvider & FileSearchProvider & TextSearchProvider
	) {
		// TODO@eamodio listen for workspace folder changes
		for (const folder of workspace.workspaceFolders ?? []) {
			const uri = this.getOriginalResource(folder.uri);

			// If we have a saved context, but no longer have any changes, reset the context
			// We only do this on startup/reload to keep things consistent
			if (contextStore.get(uri) !== undefined && !changeStore.hasChanges(folder.uri)) {
				contextStore.delete(uri);
			}
		}

		this.disposable = Disposable.from(
			workspace.registerFileSystemProvider(scheme, this, {
				isCaseSensitive: true,
			}),
			workspace.registerFileSearchProvider(scheme, this),
			workspace.registerTextSearchProvider(scheme, this),
			changeStore.onDidChange(e => {
				switch (e.type) {
					case 'created':
						this._onDidChangeFile.fire([{ type: FileChangeType.Created, uri: e.uri }]);
						break;
					case 'changed':
						this._onDidChangeFile.fire([{ type: FileChangeType.Changed, uri: e.uri }]);
						break;
					case 'deleted':
						this._onDidChangeFile.fire([{ type: FileChangeType.Deleted, uri: e.uri }]);
						break;
				}
			}),
		);
	}

	dispose() {
		this.disposable?.dispose();
	}

	private getOriginalResource(uri: Uri): Uri {
		return uri.with({ scheme: this.originalScheme });
	}

	//#region FileSystemProvider

	watch(): Disposable {
		return emptyDisposable;
	}

	async stat(uri: Uri): Promise<FileStat> {
		let stat = this.changeStore.getStat(uri);
		if (stat !== undefined) {
			return stat;
		}

		if (uri.path === '' || uri.path.lastIndexOf('/') === 0) {
			return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };
		}

		stat = await this.fs.stat(this.getOriginalResource(uri));
		return stat;
	}

	async readDirectory(uri: Uri): Promise<[string, FileType][]> {
		const entries = await this.fs.readDirectory(this.getOriginalResource(uri));
		return entries;
	}

	createDirectory(_uri: Uri): void | Thenable<void> {
		throw FileSystemError.NoPermissions;
	}

	async readFile(uri: Uri): Promise<Uint8Array> {
		const content = this.changeStore.getContent(uri);
		if (content !== undefined) {
			return textEncoder.encode(content);
		}

		const data = await this.fs.readFile(this.getOriginalResource(uri));
		return data;
	}

	async writeFile(uri: Uri, content: Uint8Array, _options: { create: boolean, overwrite: boolean }): Promise<void> {
		await this.changeStore.recordFileChange(uri, content, () => this.fs.readFile(this.getOriginalResource(uri)));
	}

	delete(_uri: Uri, _options: { recursive: boolean }): void | Thenable<void> {
		throw FileSystemError.NoPermissions;
	}

	rename(_oldUri: Uri, _newUri: Uri, _options: { overwrite: boolean }): void | Thenable<void> {
		throw FileSystemError.NoPermissions;
	}

	copy(_source: Uri, _destination: Uri, _options: { overwrite: boolean }): void | Thenable<void> {
		throw FileSystemError.NoPermissions;
	}

	//#endregion

	//#region FileSearchProvider

	provideFileSearchResults(
		query: FileSearchQuery,
		options: FileSearchOptions,
		token: CancellationToken,
	) {
		return this.fs.provideFileSearchResults(query, { ...options, folder: this.getOriginalResource(options.folder) }, token);
	}

	//#endregion

	//#region TextSearchProvider

	provideTextSearchResults(
		query: TextSearchQuery,
		options: TextSearchOptions,
		progress: Progress<TextSearchResult>,
		token: CancellationToken,
	) {
		return this.fs.provideTextSearchResults(query, { ...options, folder: this.getOriginalResource(options.folder) }, progress, token);
	}

	//#endregion
}
