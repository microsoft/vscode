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
import { Range } from 'vs/workbench/api/node/extHostTypes';
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

export class ExtHostFileSystem implements ExtHostFileSystemShape {

	private readonly _proxy: MainThreadFileSystemShape;
	private readonly _fsProvider = new Map<number, vscode.FileSystemProvider>();
	private readonly _searchProvider = new Map<number, vscode.SearchProvider>();
	private readonly _linkProvider = new FsLinkProvider();

	private _handlePool: number = 0;

	constructor(mainContext: IMainContext, extHostLanguageFeatures: ExtHostLanguageFeatures) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadFileSystem);
		extHostLanguageFeatures.registerDocumentLinkProvider('*', this._linkProvider);
	}

	registerFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider) {
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

	$utimes(handle: number, resource: UriComponents, mtime: number, atime: number): TPromise<IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).utimes(URI.revive(resource), mtime, atime));
	}
	$stat(handle: number, resource: UriComponents): TPromise<IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).stat(URI.revive(resource)));
	}
	$read(handle: number, session: number, offset: number, count: number, resource: UriComponents): TPromise<number> {
		const progress = {
			report: chunk => {
				this._proxy.$reportFileChunk(handle, session, [].slice.call(chunk));
			}
		};
		return asWinJsPromise(token => this._fsProvider.get(handle).read(URI.revive(resource), offset, count, progress));
	}
	$write(handle: number, resource: UriComponents, content: number[]): TPromise<void, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).write(URI.revive(resource), Buffer.from(content)));
	}
	$unlink(handle: number, resource: UriComponents): TPromise<void, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).unlink(URI.revive(resource)));
	}
	$move(handle: number, resource: UriComponents, target: UriComponents): TPromise<IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).move(URI.revive(resource), URI.revive(target)));
	}
	$mkdir(handle: number, resource: UriComponents): TPromise<IStat, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).mkdir(URI.revive(resource)));
	}
	$readdir(handle: number, resource: UriComponents): TPromise<[UriComponents, IStat][], any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).readdir(URI.revive(resource)));
	}
	$rmdir(handle: number, resource: UriComponents): TPromise<void, any> {
		return asWinJsPromise(token => this._fsProvider.get(handle).rmdir(URI.revive(resource)));
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
