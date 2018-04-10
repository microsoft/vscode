/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainContext, IMainContext, ExtHostFileSystemShape, MainThreadFileSystemShape } from './extHost.protocol';
import * as vscode from 'vscode';
import { IStat } from 'vs/platform/files/common/files';
import { IDisposable } from 'vs/base/common/lifecycle';
import { asWinJsPromise } from 'vs/base/common/async';
import { IPatternInfo } from 'vs/platform/search/common/search';
import { values } from 'vs/base/common/map';
import { Range, FileType } from 'vs/workbench/api/node/extHostTypes';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';

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

	_version: 3;

	onDidChange: vscode.Event<vscode.FileChange[]>;

	constructor(private readonly _delegate: vscode.FileSystemProvider) {
		this.onDidChange = this._delegate.onDidChange;
	}

	stat(resource: vscode.Uri): Thenable<vscode.FileStat> {
		return this._delegate.stat(resource);
	}
	rename(oldUri: vscode.Uri, newUri: vscode.Uri): Thenable<vscode.FileStat> {
		return this._delegate.move(oldUri, newUri);
	}
	readDirectory(resource: vscode.Uri): Thenable<[vscode.Uri, vscode.FileStat][]> {
		return this._delegate.readdir(resource);
	}

	// --- delete/create file or folder

	delete(resource: vscode.Uri): Thenable<void> {
		return this.stat(resource).then(stat => {
			if (stat.type === FileType.Dir) {
				return this._delegate.rmdir(resource);
			} else {
				return this._delegate.unlink(resource);
			}
		});
	}
	create(resource: vscode.Uri, options: { type: vscode.FileType; }): Thenable<vscode.FileStat> {
		if (options.type === FileType.Dir) {
			return this._delegate.mkdir(resource);
		} else {
			return this._delegate.write(resource, Buffer.from([])).then(() => this._delegate.stat(resource));
		}
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
	writeFile(resource: vscode.Uri, content: Uint8Array): Thenable<void> {
		return this._delegate.write(resource, content);
	}
}

export class ExtHostFileSystem implements ExtHostFileSystemShape {

	private readonly _proxy: MainThreadFileSystemShape;
	private readonly _fsProvider = new Map<number, vscode.FileSystemProvider2>();
	private readonly _searchProvider = new Map<number, vscode.SearchProvider>();
	private readonly _linkProvider = new FsLinkProvider();

	private _handlePool: number = 0;

	constructor(mainContext: IMainContext, extHostLanguageFeatures: ExtHostLanguageFeatures) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadFileSystem);
		extHostLanguageFeatures.registerDocumentLinkProvider('*', this._linkProvider);
	}

	registerFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider, newProvider: vscode.FileSystemProvider2) {
		if (newProvider && newProvider._version === 3) {
			return this._doRegisterFileSystemProvider(scheme, newProvider);
		} else {
			return this._doRegisterFileSystemProvider(scheme, new FileSystemProviderShim(provider));
		}
	}

	private _doRegisterFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider2) {
		const handle = this._handlePool++;
		this._linkProvider.add(scheme);
		this._fsProvider.set(handle, provider);
		this._proxy.$registerFileSystemProvider(handle, scheme);
		let reg: IDisposable;
		if (provider.onDidChange) {
			reg = provider.onDidChange(event => this._proxy.$onFileSystemChange(handle, <any>event));
		}
		return {
			dispose: () => {
				if (reg) {
					reg.dispose();
				}
				this._linkProvider.delete(scheme);
				this._fsProvider.delete(handle);
				this._proxy.$unregisterProvider(handle);
			}
		};
	}

	registerSearchProvider(scheme: string, provider: vscode.SearchProvider) {
		const handle = this._handlePool++;
		this._searchProvider.set(handle, provider);
		this._proxy.$registerSearchProvider(handle, scheme);
		return {
			dispose: () => {
				this._searchProvider.delete(handle);
				this._proxy.$unregisterProvider(handle);
			}
		};
	}

	$stat(handle: number, resource: UriComponents): TPromise<IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).stat(URI.revive(resource), token));
	}
	$readdir(handle: number, resource: UriComponents): TPromise<[UriComponents, IStat][], any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).readDirectory(URI.revive(resource), token));
	}
	$readFile(handle: number, resource: UriComponents): TPromise<string> {
		return asWinJsPromise(token => {
			return this._fsProvider.get(handle).readFile(URI.revive(resource), token);
		}).then(data => {
			return Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
		});
	}
	$writeFile(handle: number, resource: UriComponents, base64Content: string): TPromise<void, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).writeFile(URI.revive(resource), Buffer.from(base64Content, 'base64'), token));
	}
	$delete(handle: number, resource: UriComponents): TPromise<void, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).delete(URI.revive(resource), token));
	}
	$move(handle: number, oldUri: UriComponents, newUri: UriComponents): TPromise<IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).rename(URI.revive(oldUri), URI.revive(newUri), token));
	}
	$mkdir(handle: number, resource: UriComponents): TPromise<IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).create(URI.revive(resource), { type: FileType.Dir }, token));
	}

	$provideFileSearchResults(handle: number, session: number, query: string): TPromise<void> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideFileSearchResults) {
			return TPromise.as(undefined);
		}
		const progress = {
			report: (uri) => {
				this._proxy.$handleFindMatch(handle, session, uri);
			}
		};
		return asWinJsPromise(token => provider.provideFileSearchResults(query, progress, token));
	}
	$provideTextSearchResults(handle: number, session: number, pattern: IPatternInfo, options: { includes: string[], excludes: string[] }): TPromise<void> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideTextSearchResults) {
			return TPromise.as(undefined);
		}
		const progress = {
			report: (data: vscode.TextSearchResult) => {
				this._proxy.$handleFindMatch(handle, session, [data.uri, {
					lineNumber: data.range.start.line,
					preview: data.preview.leading + data.preview.matching + data.preview.trailing,
					offsetAndLengths: [[data.preview.leading.length, data.preview.matching.length]]
				}]);
			}
		};
		return asWinJsPromise(token => provider.provideTextSearchResults(pattern, options, progress, token));
	}
}
