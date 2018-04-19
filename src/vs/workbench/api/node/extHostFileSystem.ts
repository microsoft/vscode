/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Event, mapEvent } from 'vs/base/common/event';
import { MainContext, IMainContext, ExtHostFileSystemShape, MainThreadFileSystemShape } from './extHost.protocol';
import * as vscode from 'vscode';
import * as files from 'vs/platform/files/common/files';
import * as path from 'path';
import { IDisposable } from 'vs/base/common/lifecycle';
import { asWinJsPromise } from 'vs/base/common/async';
import { values } from 'vs/base/common/map';
import { Range, FileType, FileChangeType, FileChangeType2, FileType2 } from 'vs/workbench/api/node/extHostTypes';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { Schemas } from 'vs/base/common/network';

class FsLinkProvider implements vscode.DocumentLinkProvider {

	private _schemes = new Set<string>();
	private _regex: RegExp;

	add(scheme: string): void {
		this._regex = undefined;
		this._schemes.add(scheme);
	}

	delete(scheme: string): void {
		if (this._schemes.delete(scheme)) {
			this._regex = undefined;
		}
	}

	provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
		if (this._schemes.size === 0) {
			return undefined;
		}
		if (!this._regex) {
			this._regex = new RegExp(`(${(values(this._schemes).join('|'))}):[^\\s]+`, 'gi');
		}
		let result: vscode.DocumentLink[] = [];
		let max = Math.min(document.lineCount, 2500);
		for (let line = 0; line < max; line++) {
			this._regex.lastIndex = 0;
			let textLine = document.lineAt(line);
			let m: RegExpMatchArray;
			while (m = this._regex.exec(textLine.text)) {
				const target = URI.parse(m[0]);
				const range = new Range(line, this._regex.lastIndex - m[0].length, line, this._regex.lastIndex);
				result.push({ target, range });
			}
		}
		return result;
	}
}

class FileSystemProviderShim implements vscode.FileSystemProvider2 {

	_version: 7 = 7;

	onDidChangeFile: vscode.Event<vscode.FileChange2[]>;

	constructor(private readonly _delegate: vscode.FileSystemProvider) {
		if (!this._delegate.onDidChange) {
			this.onDidChangeFile = Event.None;
		} else {
			this.onDidChangeFile = mapEvent(this._delegate.onDidChange, old => old.map(FileSystemProviderShim._modernizeFileChange));
		}
	}

	watch(uri: vscode.Uri, options: {}): vscode.Disposable {
		// does nothing because in the old API there was no notion of
		// watch and provider decide what file events to generate...
		return { dispose() { } };
	}

	stat(resource: vscode.Uri): Thenable<vscode.FileStat2> {
		return this._delegate.stat(resource).then(stat => FileSystemProviderShim._modernizeFileStat(stat));
	}
	rename(oldUri: vscode.Uri, newUri: vscode.Uri): Thenable<vscode.FileStat2> {
		return this._delegate.move(oldUri, newUri).then(stat => FileSystemProviderShim._modernizeFileStat(stat));
	}
	readDirectory(resource: vscode.Uri): Thenable<[string, vscode.FileStat2][]> {
		return this._delegate.readdir(resource).then(tuples => {
			return tuples.map(tuple => <[string, vscode.FileStat2]>[path.posix.basename(tuple[0].path), FileSystemProviderShim._modernizeFileStat(tuple[1])]);
		});
	}

	private static _modernizeFileStat(stat: vscode.FileStat): vscode.FileStat2 {
		let { mtime, size, type } = stat;
		let newType: vscode.FileType2;

		// no support for bitmask, effectively no support for symlinks
		switch (type) {
			case FileType.Dir:
				newType = FileType2.Directory;
				break;
			case FileType.File:
				newType = FileType2.File;
				break;
			case FileType.Symlink:
				newType = FileType2.SymbolicLink;
				break;
		}
		return { mtime, size, type: newType };
	}

	private static _modernizeFileChange(e: vscode.FileChange): vscode.FileChange2 {
		let { resource, type } = e;
		let newType: vscode.FileChangeType2;
		switch (type) {
			case FileChangeType.Updated:
				newType = FileChangeType2.Changed;
				break;
			case FileChangeType.Added:
				newType = FileChangeType2.Created;
				break;
			case FileChangeType.Deleted:
				newType = FileChangeType2.Deleted;
				break;

		}
		return { uri: resource, type: newType };
	}

	// --- delete/create file or folder

	delete(resource: vscode.Uri): Thenable<void> {
		return this._delegate.stat(resource).then(stat => {
			if (stat.type === FileType.Dir) {
				return this._delegate.rmdir(resource);
			} else {
				return this._delegate.unlink(resource);
			}
		});
	}
	createDirectory(resource: vscode.Uri): Thenable<vscode.FileStat2> {
		return this._delegate.mkdir(resource).then(stat => FileSystemProviderShim._modernizeFileStat(stat));
	}

	// --- read/write

	readFile(resource: vscode.Uri): Thenable<Uint8Array> {
		let chunks: Buffer[] = [];
		return this._delegate.read(resource, 0, -1, {
			report(data) {
				chunks.push(Buffer.from(data));
			}
		}).then(() => {
			return Buffer.concat(chunks);
		});
	}
	writeFile(resource: vscode.Uri, content: Uint8Array, options: { flags: vscode.FileOpenFlags }): Thenable<void> {
		// if (options.flags & (files.FileOpenFlags.Exclusive) )
		return this._delegate.write(resource, content);
	}
}

export class ExtHostFileSystem implements ExtHostFileSystemShape {

	private readonly _proxy: MainThreadFileSystemShape;
	private readonly _linkProvider = new FsLinkProvider();
	private readonly _fsProvider = new Map<number, vscode.FileSystemProvider2>();
	private readonly _usedSchemes = new Set<string>();
	private readonly _watches = new Map<number, IDisposable>();

	private _handlePool: number = 0;

	constructor(mainContext: IMainContext, extHostLanguageFeatures: ExtHostLanguageFeatures) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadFileSystem);
		this._usedSchemes.add(Schemas.file);
		this._usedSchemes.add(Schemas.untitled);
		this._usedSchemes.add(Schemas.vscode);
		this._usedSchemes.add(Schemas.inMemory);
		this._usedSchemes.add(Schemas.internal);
		this._usedSchemes.add(Schemas.http);
		this._usedSchemes.add(Schemas.https);
		this._usedSchemes.add(Schemas.mailto);
		this._usedSchemes.add(Schemas.data);

		extHostLanguageFeatures.registerDocumentLinkProvider('*', this._linkProvider);
	}

	registerDeprecatedFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider) {
		return this._doRegisterFileSystemProvider(scheme, new FileSystemProviderShim(provider));
	}

	registerFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider, newProvider: vscode.FileSystemProvider2) {
		if (newProvider && newProvider._version === 7) {
			return this._doRegisterFileSystemProvider(scheme, newProvider);
		} else if (provider) {
			return this._doRegisterFileSystemProvider(scheme, new FileSystemProviderShim(provider));
		} else {
			throw new Error('FAILED to register file system provider, the new provider does not meet the version-constraint and there is no old provider');
		}
	}

	private _doRegisterFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider2) {

		if (this._usedSchemes.has(scheme)) {
			throw new Error(`a provider for the scheme '${scheme}' is already registered`);
		}

		const handle = this._handlePool++;
		this._linkProvider.add(scheme);
		this._usedSchemes.add(scheme);
		this._fsProvider.set(handle, provider);

		let capabilites = files.FileSystemProviderCapabilities.FileReadWrite;
		if (typeof provider.copy === 'function') {
			capabilites += files.FileSystemProviderCapabilities.FileFolderCopy;
		}

		this._proxy.$registerFileSystemProvider(handle, scheme, capabilites);

		const subscription = provider.onDidChangeFile(event => {
			let newEvent = event.map(e => {
				let { uri: resource, type } = e;
				let newType: files.FileChangeType;
				switch (type) {
					case FileChangeType2.Changed:
						newType = files.FileChangeType.UPDATED;
						break;
					case FileChangeType2.Created:
						newType = files.FileChangeType.ADDED;
						break;
					case FileChangeType2.Deleted:
						newType = files.FileChangeType.DELETED;
						break;
				}
				return { resource, type: newType };
			});
			this._proxy.$onFileSystemChange(handle, newEvent);
		});

		return {
			dispose: () => {
				subscription.dispose();
				this._linkProvider.delete(scheme);
				this._usedSchemes.delete(scheme);
				this._fsProvider.delete(handle);
				this._proxy.$unregisterProvider(handle);
			}
		};
	}

	$stat(handle: number, resource: UriComponents): TPromise<files.IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).stat(URI.revive(resource), token));
	}

	$readdir(handle: number, resource: UriComponents): TPromise<[string, files.IStat][], any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).readDirectory(URI.revive(resource), token));
	}

	$readFile(handle: number, resource: UriComponents, flags: files.FileOpenFlags): TPromise<string> {
		return asWinJsPromise(token => {
			return this._fsProvider.get(handle).readFile(URI.revive(resource), { flags }, token);
		}).then(data => {
			return Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
		});
	}

	$writeFile(handle: number, resource: UriComponents, base64Content: string, flags: files.FileOpenFlags): TPromise<void, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).writeFile(URI.revive(resource), Buffer.from(base64Content, 'base64'), { flags }, token));
	}

	$delete(handle: number, resource: UriComponents): TPromise<void, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).delete(URI.revive(resource), token));
	}

	$rename(handle: number, oldUri: UriComponents, newUri: UriComponents, flags: files.FileOpenFlags): TPromise<files.IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).rename(URI.revive(oldUri), URI.revive(newUri), { flags }, token));
	}

	$copy(handle: number, oldUri: UriComponents, newUri: UriComponents, flags: files.FileOpenFlags): TPromise<files.IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).copy(URI.revive(oldUri), URI.revive(newUri), { flags }, token));
	}

	$mkdir(handle: number, resource: UriComponents): TPromise<files.IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).createDirectory(URI.revive(resource), token));
	}

	$watch(handle: number, session: number, resource: UriComponents, opts: files.IWatchOptions): void {
		asWinJsPromise(token => {
			let subscription = this._fsProvider.get(handle).watch(URI.revive(resource), opts);
			this._watches.set(session, subscription);
		});
	}

	$unwatch(handle: number, session: number): void {
		let subscription = this._watches.get(session);
		if (subscription) {
			subscription.dispose();
			this._watches.delete(session);
		}
	}
}
