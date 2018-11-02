/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { MainContext, IMainContext, ExtHostFileSystemShape, MainThreadFileSystemShape, IFileChangeDto } from './extHost.protocol';
import * as vscode from 'vscode';
import * as files from 'vs/platform/files/common/files';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { values } from 'vs/base/common/map';
import { Range, FileChangeType } from 'vs/workbench/api/node/extHostTypes';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { Schemas } from 'vs/base/common/network';
import { LabelRules } from 'vs/platform/label/common/label';

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
		if (typeof provider.open === 'function' && typeof provider.close === 'function'
			&& typeof provider.read === 'function' && typeof provider.write === 'function'
		) {
			capabilites += files.FileSystemProviderCapabilities.FileOpenReadWriteClose;
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

	setUriFormatter(scheme: string, formatter: LabelRules): void {
		this._proxy.$setUriFormatter(scheme, formatter);
	}

	private static _asIStat(stat: vscode.FileStat): files.IStat {
		const { type, ctime, mtime, size } = stat;
		return { type, ctime, mtime, size };
	}

	private _checkProviderExists(handle: number): void {
		if (!this._fsProvider.has(handle)) {
			const err = new Error();
			err.name = 'ENOPRO';
			err.message = `no provider`;
			throw err;
		}
	}

	$stat(handle: number, resource: UriComponents): Promise<files.IStat> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).stat(URI.revive(resource))).then(ExtHostFileSystem._asIStat);
	}

	$readdir(handle: number, resource: UriComponents): Promise<[string, files.FileType][]> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).readDirectory(URI.revive(resource)));
	}

	$readFile(handle: number, resource: UriComponents): Promise<Buffer> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).readFile(URI.revive(resource))).then(data => {
			return Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
		});
	}

	$writeFile(handle: number, resource: UriComponents, content: Buffer, opts: files.FileWriteOptions): Promise<void> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).writeFile(URI.revive(resource), content, opts));
	}

	$delete(handle: number, resource: UriComponents, opts: files.FileDeleteOptions): Promise<void> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).delete(URI.revive(resource), opts));
	}

	$rename(handle: number, oldUri: UriComponents, newUri: UriComponents, opts: files.FileOverwriteOptions): Promise<void> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).rename(URI.revive(oldUri), URI.revive(newUri), opts));
	}

	$copy(handle: number, oldUri: UriComponents, newUri: UriComponents, opts: files.FileOverwriteOptions): Promise<void> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).copy(URI.revive(oldUri), URI.revive(newUri), opts));
	}

	$mkdir(handle: number, resource: UriComponents): Promise<void> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).createDirectory(URI.revive(resource)));
	}

	$watch(handle: number, session: number, resource: UriComponents, opts: files.IWatchOptions): void {
		this._checkProviderExists(handle);
		let subscription = this._fsProvider.get(handle).watch(URI.revive(resource), opts);
		this._watches.set(session, subscription);
	}

	$unwatch(session: number): void {
		let subscription = this._watches.get(session);
		if (subscription) {
			subscription.dispose();
			this._watches.delete(session);
		}
	}

	$open(handle: number, resource: UriComponents): Promise<number> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).open(URI.revive(resource)));
	}

	$close(handle: number, fd: number): Promise<void> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).close(fd));
	}

	$read(handle: number, fd: number, pos: number, data: Buffer, offset: number, length: number): Promise<number> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).read(fd, pos, data, offset, length));
	}

	$write(handle: number, fd: number, pos: number, data: Buffer, offset: number, length: number): Promise<number> {
		this._checkProviderExists(handle);
		return Promise.resolve(this._fsProvider.get(handle).write(fd, pos, data, offset, length));
	}

}
