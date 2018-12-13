/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { MainContext, IMainContext, ExtHostFileSystemShape, MainThreadFileSystemShape, IFileChangeDto } from './extHost.protocol';
import * as vscode from 'vscode';
import * as files from 'vs/platform/files/common/files';
import { IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { FileChangeType, DocumentLink } from 'vs/workbench/api/node/extHostTypes';
import * as typeConverter from 'vs/workbench/api/node/extHostTypeConverters';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/node/extHostLanguageFeatures';
import { Schemas } from 'vs/base/common/network';
import { LabelRules } from 'vs/platform/label/common/label';
import { State, StateMachine, LinkComputer } from 'vs/editor/common/modes/linkComputer';
import { commonPrefixLength } from 'vs/base/common/strings';
import { CharCode } from 'vs/base/common/charCode';

class FsLinkProvider {

	private _schemes: string[] = [];
	private _stateMachine: StateMachine;

	add(scheme: string): void {
		this._stateMachine = undefined;
		this._schemes.push(scheme);
	}

	delete(scheme: string): void {
		let idx = this._schemes.indexOf(scheme);
		if (idx >= 0) {
			this._schemes.splice(idx, 1);
			this._stateMachine = undefined;
		}
	}

	private _initStateMachine(): void {
		if (!this._stateMachine) {

			// sort and compute common prefix with previous scheme
			// then build state transitions based on the data
			const schemes = this._schemes.sort();
			const edges = [];
			let prevScheme: string;
			let prevState: State;
			let nextState = State.LastKnownState;
			for (const scheme of schemes) {

				// skip the common prefix of the prev scheme
				// and continue with its last state
				let pos = !prevScheme ? 0 : commonPrefixLength(prevScheme, scheme);
				if (pos === 0) {
					prevState = State.Start;
				} else {
					prevState = nextState;
				}

				for (; pos < scheme.length; pos++) {
					// keep creating new (next) states until the
					// end (and the BeforeColon-state) is reached
					if (pos + 1 === scheme.length) {
						nextState = State.BeforeColon;
					} else {
						nextState += 1;
					}
					edges.push([prevState, scheme.toUpperCase().charCodeAt(pos), nextState]);
					edges.push([prevState, scheme.toLowerCase().charCodeAt(pos), nextState]);
					prevState = nextState;
				}

				prevScheme = scheme;
			}

			// all link must match this pattern `<scheme>:/<more>`
			edges.push([State.BeforeColon, CharCode.Colon, State.AfterColon]);
			edges.push([State.AfterColon, CharCode.Slash, State.End]);

			this._stateMachine = new StateMachine(edges);
		}
	}

	provideDocumentLinks(document: vscode.TextDocument): vscode.ProviderResult<vscode.DocumentLink[]> {
		this._initStateMachine();

		const result: vscode.DocumentLink[] = [];
		const links = LinkComputer.computeLinks({
			getLineContent(lineNumber: number): string {
				return document.lineAt(lineNumber - 1).text;
			},
			getLineCount(): number {
				return document.lineCount;
			}
		}, this._stateMachine);

		for (const link of links) {
			try {
				let uri = URI.parse(link.url, true);
				result.push(new DocumentLink(typeConverter.Range.to(link.range), uri));
			} catch (err) {
				// ignore
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

	private _linkProviderRegistration: IDisposable;
	private _handlePool: number = 0;

	constructor(mainContext: IMainContext, private _extHostLanguageFeatures: ExtHostLanguageFeatures) {
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
	}

	dispose(): void {
		dispose(this._linkProviderRegistration);
	}

	private _registerLinkProviderIfNotYetRegistered(): void {
		if (!this._linkProviderRegistration) {
			this._linkProviderRegistration = this._extHostLanguageFeatures.registerDocumentLinkProvider(undefined, '*', this._linkProvider);
		}
	}

	registerFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider, options: { isCaseSensitive?: boolean, isReadonly?: boolean } = {}) {

		if (this._usedSchemes.has(scheme)) {
			throw new Error(`a provider for the scheme '${scheme}' is already registered`);
		}

		//
		this._registerLinkProviderIfNotYetRegistered();

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
