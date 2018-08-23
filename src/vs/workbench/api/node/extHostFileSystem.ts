/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainContext, IMainContext, ExtHostFileSystemShape, MainThreadFileSystemShape, IFileChangeDto } from './extHost.protocol';
import * as vscode from 'vscode';
import * as files from 'vs/platform/files/common/files';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { asWinJsPromise } from 'vs/base/common/async';
import { values } from 'vs/base/common/map';
import { Range, FileChangeType } from 'vs/workbench/api/node/extHostTypes';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { Schemas } from 'vs/base/common/network';
import { UriLabelRules } from 'vs/platform/label/common/label';

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

	provideDocumentLinks(document: vscode.TextDocument): vscode.ProviderResult<vscode.DocumentLink[]> {
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
				if (target.path[0] !== '/') {
					continue;
				}
				const range = new Range(line, this._regex.lastIndex - m[0].length, line, this._regex.lastIndex);
				result.push({ target, range });
			}
		}
		return result;
	}
}

export class ExtHostFileSystem implements ExtHostFileSystemShape {

	private readonly _proxy: MainThreadFileSystemShape;
	private readonly _linkProvider = new FsLinkProvider();
	private readonly _fsProvider = new Map<number, vscode.FileSystemProvider>();
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

	registerFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider, options: { isCaseSensitive?: boolean, isReadonly?: boolean } = {}) {

		if (this._usedSchemes.has(scheme)) {
			throw new Error(`a provider for the scheme '${scheme}' is already registered`);
		}

		const handle = this._handlePool++;
		this._linkProvider.add(scheme);
		this._usedSchemes.add(scheme);
		this._fsProvider.set(handle, provider);

		let capabilites = files.FileSystemProviderCapabilities.FileReadWrite;
		if (options.isCaseSensitive) {
			capabilites += files.FileSystemProviderCapabilities.PathCaseSensitive;
		}
		if (options.isReadonly) {
			capabilites += files.FileSystemProviderCapabilities.Readonly;
		}
		if (typeof provider.copy === 'function') {
			capabilites += files.FileSystemProviderCapabilities.FileFolderCopy;
		}

		this._proxy.$registerFileSystemProvider(handle, scheme, capabilites);

		const subscription = provider.onDidChangeFile(event => {
			let mapped: IFileChangeDto[] = [];
			for (const e of event) {
				let { uri: resource, type } = e;
				if (resource.scheme !== scheme) {
					// dropping events for wrong scheme
					continue;
				}
				let newType: files.FileChangeType;
				switch (type) {
					case FileChangeType.Changed:
						newType = files.FileChangeType.UPDATED;
						break;
					case FileChangeType.Created:
						newType = files.FileChangeType.ADDED;
						break;
					case FileChangeType.Deleted:
						newType = files.FileChangeType.DELETED;
						break;
				}
				mapped.push({ resource, type: newType });
			}
			this._proxy.$onFileSystemChange(handle, mapped);
		});

		return toDisposable(() => {
			subscription.dispose();
			this._linkProvider.delete(scheme);
			this._usedSchemes.delete(scheme);
			this._fsProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	setUriFormatter(scheme: string, formatter: UriLabelRules): void {
		this._proxy.$setUriFormatter(scheme, formatter);
	}

	private static _asIStat(stat: vscode.FileStat): files.IStat {
		const { type, ctime, mtime, size } = stat;
		return { type, ctime, mtime, size };
	}

	$stat(handle: number, resource: UriComponents): TPromise<files.IStat> {
		return asWinJsPromise(() => this._fsProvider.get(handle).stat(URI.revive(resource))).then(ExtHostFileSystem._asIStat);
	}

	$readdir(handle: number, resource: UriComponents): TPromise<[string, files.FileType][]> {
		return asWinJsPromise(() => this._fsProvider.get(handle).readDirectory(URI.revive(resource)));
	}

	$readFile(handle: number, resource: UriComponents): TPromise<string> {
		return asWinJsPromise(() => {
			return this._fsProvider.get(handle).readFile(URI.revive(resource));
		}).then(data => {
			return Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
		});
	}

	$writeFile(handle: number, resource: UriComponents, base64Content: string, opts: files.FileWriteOptions): TPromise<void> {
		return asWinJsPromise(() => this._fsProvider.get(handle).writeFile(URI.revive(resource), Buffer.from(base64Content, 'base64'), opts));
	}

	$delete(handle: number, resource: UriComponents, opts: files.FileDeleteOptions): TPromise<void> {
		return asWinJsPromise(() => this._fsProvider.get(handle).delete(URI.revive(resource), opts));
	}

	$rename(handle: number, oldUri: UriComponents, newUri: UriComponents, opts: files.FileOverwriteOptions): TPromise<void> {
		return asWinJsPromise(() => this._fsProvider.get(handle).rename(URI.revive(oldUri), URI.revive(newUri), opts));
	}

	$copy(handle: number, oldUri: UriComponents, newUri: UriComponents, opts: files.FileOverwriteOptions): TPromise<void> {
		return asWinJsPromise(() => this._fsProvider.get(handle).copy(URI.revive(oldUri), URI.revive(newUri), opts));
	}

	$mkdir(handle: number, resource: UriComponents): TPromise<void> {
		return asWinJsPromise(() => this._fsProvider.get(handle).createDirectory(URI.revive(resource)));
	}

	$watch(handle: number, session: number, resource: UriComponents, opts: files.IWatchOptions): void {
		asWinJsPromise(() => {
			let subscription = this._fsProvider.get(handle).watch(URI.revive(resource), opts);
			this._watches.set(session, subscription);
		});
	}

	$unwatch(session: number): void {
		let subscription = this._watches.get(session);
		if (subscription) {
			subscription.dispose();
			this._watches.delete(session);
		}
	}
}
