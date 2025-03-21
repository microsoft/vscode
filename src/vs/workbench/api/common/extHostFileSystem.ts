/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../base/common/uri.js';
import { MainContext, IMainContext, ExtHostFileSystemShape, MainThreadFileSystemShape, IFileChangeDto } from './extHost.protocol.js';
import type * as vscode from 'vscode';
import * as files from '../../../platform/files/common/files.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { FileChangeType } from './extHostTypes.js';
import * as typeConverter from './extHostTypeConverters.js';
import { ExtHostLanguageFeatures } from './extHostLanguageFeatures.js';
import { State, StateMachine, LinkComputer, Edge } from '../../../editor/common/languages/linkComputer.js';
import { commonPrefixLength } from '../../../base/common/strings.js';
import { CharCode } from '../../../base/common/charCode.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { IMarkdownString, isMarkdownString } from '../../../base/common/htmlContent.js';

class FsLinkProvider {

	private _schemes: string[] = [];
	private _stateMachine?: StateMachine;

	add(scheme: string): void {
		this._stateMachine = undefined;
		this._schemes.push(scheme);
	}

	delete(scheme: string): void {
		const idx = this._schemes.indexOf(scheme);
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
			const edges: Edge[] = [];
			let prevScheme: string | undefined;
			let prevState: State;
			let lastState = State.LastKnownState;
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
						// Save the last state here, because we need to continue for the next scheme
						lastState = nextState;
						nextState = State.BeforeColon;
					} else {
						nextState += 1;
					}
					edges.push([prevState, scheme.toUpperCase().charCodeAt(pos), nextState]);
					edges.push([prevState, scheme.toLowerCase().charCodeAt(pos), nextState]);
					prevState = nextState;
				}

				prevScheme = scheme;
				// Restore the last state
				nextState = lastState;
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
			const docLink = typeConverter.DocumentLink.to(link);
			if (docLink.target) {
				result.push(docLink);
			}
		}
		return result;
	}
}

export class ExtHostFileSystem implements ExtHostFileSystemShape {

	private readonly _proxy: MainThreadFileSystemShape;
	private readonly _linkProvider = new FsLinkProvider();
	private readonly _fsProvider = new Map<number, vscode.FileSystemProvider>();
	private readonly _registeredSchemes = new Set<string>();
	private readonly _watches = new Map<number, IDisposable>();

	private _linkProviderRegistration?: IDisposable;
	private _handlePool: number = 0;

	constructor(mainContext: IMainContext, private _extHostLanguageFeatures: ExtHostLanguageFeatures) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadFileSystem);
	}

	dispose(): void {
		this._linkProviderRegistration?.dispose();
	}

	registerFileSystemProvider(extension: IExtensionDescription, scheme: string, provider: vscode.FileSystemProvider, options: { isCaseSensitive?: boolean; isReadonly?: boolean | vscode.MarkdownString } = {}) {

		// validate the given provider is complete
		ExtHostFileSystem._validateFileSystemProvider(provider);

		if (this._registeredSchemes.has(scheme)) {
			throw new Error(`a provider for the scheme '${scheme}' is already registered`);
		}

		//
		if (!this._linkProviderRegistration) {
			this._linkProviderRegistration = this._extHostLanguageFeatures.registerDocumentLinkProvider(extension, '*', this._linkProvider);
		}

		const handle = this._handlePool++;
		this._linkProvider.add(scheme);
		this._registeredSchemes.add(scheme);
		this._fsProvider.set(handle, provider);

		let capabilities = files.FileSystemProviderCapabilities.FileReadWrite;
		if (options.isCaseSensitive) {
			capabilities += files.FileSystemProviderCapabilities.PathCaseSensitive;
		}
		if (options.isReadonly) {
			capabilities += files.FileSystemProviderCapabilities.Readonly;
		}
		if (typeof provider.copy === 'function') {
			capabilities += files.FileSystemProviderCapabilities.FileFolderCopy;
		}
		if (typeof provider.open === 'function' && typeof provider.close === 'function'
			&& typeof provider.read === 'function' && typeof provider.write === 'function'
		) {
			checkProposedApiEnabled(extension, 'fsChunks');
			capabilities += files.FileSystemProviderCapabilities.FileOpenReadWriteClose;
		}

		let readOnlyMessage: IMarkdownString | undefined;
		if (options.isReadonly && isMarkdownString(options.isReadonly) && options.isReadonly.value !== '') {
			readOnlyMessage = {
				value: options.isReadonly.value,
				isTrusted: options.isReadonly.isTrusted,
				supportThemeIcons: options.isReadonly.supportThemeIcons,
				supportHtml: options.isReadonly.supportHtml,
				baseUri: options.isReadonly.baseUri,
				uris: options.isReadonly.uris
			};
		}

		this._proxy.$registerFileSystemProvider(handle, scheme, capabilities, readOnlyMessage).catch(err => {
			console.error(`FAILED to register filesystem provider of ${extension.identifier.value}-extension for the scheme ${scheme}`);
			console.error(err);
		});

		const subscription = provider.onDidChangeFile(event => {
			const mapped: IFileChangeDto[] = [];
			for (const e of event) {
				const { uri: resource, type } = e;
				if (resource.scheme !== scheme) {
					// dropping events for wrong scheme
					continue;
				}
				let newType: files.FileChangeType | undefined;
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
					default:
						throw new Error('Unknown FileChangeType');
				}
				mapped.push({ resource, type: newType });
			}
			this._proxy.$onFileSystemChange(handle, mapped);
		});

		return toDisposable(() => {
			subscription.dispose();
			this._linkProvider.delete(scheme);
			this._registeredSchemes.delete(scheme);
			this._fsProvider.delete(handle);
			this._proxy.$unregisterProvider(handle);
		});
	}

	private static _validateFileSystemProvider(provider: vscode.FileSystemProvider) {
		if (!provider) {
			throw new Error('MISSING provider');
		}
		if (typeof provider.watch !== 'function') {
			throw new Error('Provider does NOT implement watch');
		}
		if (typeof provider.stat !== 'function') {
			throw new Error('Provider does NOT implement stat');
		}
		if (typeof provider.readDirectory !== 'function') {
			throw new Error('Provider does NOT implement readDirectory');
		}
		if (typeof provider.createDirectory !== 'function') {
			throw new Error('Provider does NOT implement createDirectory');
		}
		if (typeof provider.readFile !== 'function') {
			throw new Error('Provider does NOT implement readFile');
		}
		if (typeof provider.writeFile !== 'function') {
			throw new Error('Provider does NOT implement writeFile');
		}
		if (typeof provider.delete !== 'function') {
			throw new Error('Provider does NOT implement delete');
		}
		if (typeof provider.rename !== 'function') {
			throw new Error('Provider does NOT implement rename');
		}
	}

	private static _asIStat(stat: vscode.FileStat): files.IStat {
		const { type, ctime, mtime, size, permissions } = stat;
		return { type, ctime, mtime, size, permissions };
	}

	$stat(handle: number, resource: UriComponents): Promise<files.IStat> {
		return Promise.resolve(this._getFsProvider(handle).stat(URI.revive(resource))).then(stat => ExtHostFileSystem._asIStat(stat));
	}

	$readdir(handle: number, resource: UriComponents): Promise<[string, files.FileType][]> {
		return Promise.resolve(this._getFsProvider(handle).readDirectory(URI.revive(resource)));
	}

	$readFile(handle: number, resource: UriComponents): Promise<VSBuffer> {
		return Promise.resolve(this._getFsProvider(handle).readFile(URI.revive(resource))).then(data => VSBuffer.wrap(data));
	}

	$writeFile(handle: number, resource: UriComponents, content: VSBuffer, opts: files.IFileWriteOptions): Promise<void> {
		return Promise.resolve(this._getFsProvider(handle).writeFile(URI.revive(resource), content.buffer, opts));
	}

	$delete(handle: number, resource: UriComponents, opts: files.IFileDeleteOptions): Promise<void> {
		return Promise.resolve(this._getFsProvider(handle).delete(URI.revive(resource), opts));
	}

	$rename(handle: number, oldUri: UriComponents, newUri: UriComponents, opts: files.IFileOverwriteOptions): Promise<void> {
		return Promise.resolve(this._getFsProvider(handle).rename(URI.revive(oldUri), URI.revive(newUri), opts));
	}

	$copy(handle: number, oldUri: UriComponents, newUri: UriComponents, opts: files.IFileOverwriteOptions): Promise<void> {
		const provider = this._getFsProvider(handle);
		if (!provider.copy) {
			throw new Error('FileSystemProvider does not implement "copy"');
		}
		return Promise.resolve(provider.copy(URI.revive(oldUri), URI.revive(newUri), opts));
	}

	$mkdir(handle: number, resource: UriComponents): Promise<void> {
		return Promise.resolve(this._getFsProvider(handle).createDirectory(URI.revive(resource)));
	}

	$watch(handle: number, session: number, resource: UriComponents, opts: files.IWatchOptions): void {
		const subscription = this._getFsProvider(handle).watch(URI.revive(resource), opts);
		this._watches.set(session, subscription);
	}

	$unwatch(_handle: number, session: number): void {
		const subscription = this._watches.get(session);
		if (subscription) {
			subscription.dispose();
			this._watches.delete(session);
		}
	}

	$open(handle: number, resource: UriComponents, opts: files.IFileOpenOptions): Promise<number> {
		const provider = this._getFsProvider(handle);
		if (!provider.open) {
			throw new Error('FileSystemProvider does not implement "open"');
		}
		return Promise.resolve(provider.open(URI.revive(resource), opts));
	}

	$close(handle: number, fd: number): Promise<void> {
		const provider = this._getFsProvider(handle);
		if (!provider.close) {
			throw new Error('FileSystemProvider does not implement "close"');
		}
		return Promise.resolve(provider.close(fd));
	}

	$read(handle: number, fd: number, pos: number, length: number): Promise<VSBuffer> {
		const provider = this._getFsProvider(handle);
		if (!provider.read) {
			throw new Error('FileSystemProvider does not implement "read"');
		}
		const data = VSBuffer.alloc(length);
		return Promise.resolve(provider.read(fd, pos, data.buffer, 0, length)).then(read => {
			return data.slice(0, read); // don't send zeros
		});
	}

	$write(handle: number, fd: number, pos: number, data: VSBuffer): Promise<number> {
		const provider = this._getFsProvider(handle);
		if (!provider.write) {
			throw new Error('FileSystemProvider does not implement "write"');
		}
		return Promise.resolve(provider.write(fd, pos, data.buffer, 0, data.byteLength));
	}

	private _getFsProvider(handle: number): vscode.FileSystemProvider {
		const provider = this._fsProvider.get(handle);
		if (!provider) {
			const err = new Error();
			err.name = 'ENOPRO';
			err.message = `no provider`;
			throw err;
		}
		return provider;
	}
}
