/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join, relative } from 'path';
import { delta as arrayDelta, mapArrayOrNot } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { TernarySearchTree } from 'vs/base/common/map';
import { Counter } from 'vs/base/common/numbers';
import { normalize } from 'vs/base/common/paths';
import { isLinux } from 'vs/base/common/platform';
import { basenameOrAuthority, dirname, isEqual } from 'vs/base/common/resources';
import { compare } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ILogService } from 'vs/platform/log/common/log';
import { Severity } from 'vs/platform/notification/common/notification';
import { IRawFileMatch2, resultIsMatch } from 'vs/platform/search/common/search';
import { Workspace, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Range, RelativePattern } from 'vs/workbench/api/node/extHostTypes';
import { ITextQueryBuilderOptions } from 'vs/workbench/parts/search/common/queryBuilder';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import * as vscode from 'vscode';
import { ExtHostWorkspaceShape, IMainContext, IWorkspaceData, MainContext, MainThreadMessageServiceShape, MainThreadWorkspaceShape } from './extHost.protocol';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

function isFolderEqual(folderA: URI, folderB: URI): boolean {
	return isEqual(folderA, folderB, !isLinux);
}

function compareWorkspaceFolderByUri(a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder): number {
	return isFolderEqual(a.uri, b.uri) ? 0 : compare(a.uri.toString(), b.uri.toString());
}

function compareWorkspaceFolderByUriAndNameAndIndex(a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder): number {
	if (a.index !== b.index) {
		return a.index < b.index ? -1 : 1;
	}

	return isFolderEqual(a.uri, b.uri) ? compare(a.name, b.name) : compare(a.uri.toString(), b.uri.toString());
}

function delta(oldFolders: vscode.WorkspaceFolder[], newFolders: vscode.WorkspaceFolder[], compare: (a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder) => number): { removed: vscode.WorkspaceFolder[], added: vscode.WorkspaceFolder[] } {
	const oldSortedFolders = oldFolders.slice(0).sort(compare);
	const newSortedFolders = newFolders.slice(0).sort(compare);

	return arrayDelta(oldSortedFolders, newSortedFolders, compare);
}

interface MutableWorkspaceFolder extends vscode.WorkspaceFolder {
	name: string;
	index: number;
}

class ExtHostWorkspaceImpl extends Workspace {

	static toExtHostWorkspace(data: IWorkspaceData, previousConfirmedWorkspace?: ExtHostWorkspaceImpl, previousUnconfirmedWorkspace?: ExtHostWorkspaceImpl): { workspace: ExtHostWorkspaceImpl, added: vscode.WorkspaceFolder[], removed: vscode.WorkspaceFolder[] } {
		if (!data) {
			return { workspace: null, added: [], removed: [] };
		}

		const { id, name, folders } = data;
		const newWorkspaceFolders: vscode.WorkspaceFolder[] = [];

		// If we have an existing workspace, we try to find the folders that match our
		// data and update their properties. It could be that an extension stored them
		// for later use and we want to keep them "live" if they are still present.
		const oldWorkspace = previousConfirmedWorkspace;
		if (oldWorkspace) {
			folders.forEach((folderData, index) => {
				const folderUri = URI.revive(folderData.uri);
				const existingFolder = ExtHostWorkspaceImpl._findFolder(previousUnconfirmedWorkspace || previousConfirmedWorkspace, folderUri);

				if (existingFolder) {
					existingFolder.name = folderData.name;
					existingFolder.index = folderData.index;

					newWorkspaceFolders.push(existingFolder);
				} else {
					newWorkspaceFolders.push({ uri: folderUri, name: folderData.name, index });
				}
			});
		} else {
			newWorkspaceFolders.push(...folders.map(({ uri, name, index }) => ({ uri: URI.revive(uri), name, index })));
		}

		// make sure to restore sort order based on index
		newWorkspaceFolders.sort((f1, f2) => f1.index < f2.index ? -1 : 1);

		const workspace = new ExtHostWorkspaceImpl(id, name, newWorkspaceFolders);
		const { added, removed } = delta(oldWorkspace ? oldWorkspace.workspaceFolders : [], workspace.workspaceFolders, compareWorkspaceFolderByUri);

		return { workspace, added, removed };
	}

	private static _findFolder(workspace: ExtHostWorkspaceImpl, folderUriToFind: URI): MutableWorkspaceFolder {
		for (let i = 0; i < workspace.folders.length; i++) {
			const folder = workspace.workspaceFolders[i];
			if (isFolderEqual(folder.uri, folderUriToFind)) {
				return folder;
			}
		}

		return undefined;
	}

	private readonly _workspaceFolders: vscode.WorkspaceFolder[] = [];
	private readonly _structure = TernarySearchTree.forPaths<vscode.WorkspaceFolder>();

	private constructor(id: string, private _name: string, folders: vscode.WorkspaceFolder[]) {
		super(id, folders.map(f => new WorkspaceFolder(f)));

		// setup the workspace folder data structure
		folders.forEach(folder => {
			this._workspaceFolders.push(folder);
			this._structure.set(folder.uri.toString(), folder);
		});
	}

	get name(): string {
		return this._name;
	}

	get workspaceFolders(): vscode.WorkspaceFolder[] {
		return this._workspaceFolders.slice(0);
	}

	getWorkspaceFolder(uri: URI, resolveParent?: boolean): vscode.WorkspaceFolder {
		if (resolveParent && this._structure.get(uri.toString())) {
			// `uri` is a workspace folder so we check for its parent
			uri = dirname(uri);
		}
		return this._structure.findSubstr(uri.toString());
	}

	resolveWorkspaceFolder(uri: URI): vscode.WorkspaceFolder {
		return this._structure.get(uri.toString());
	}
}

export class ExtHostWorkspace implements ExtHostWorkspaceShape {

	private readonly _onDidChangeWorkspace = new Emitter<vscode.WorkspaceFoldersChangeEvent>();
	private readonly _proxy: MainThreadWorkspaceShape;

	private _confirmedWorkspace: ExtHostWorkspaceImpl;
	private _unconfirmedWorkspace: ExtHostWorkspaceImpl;

	private _messageService: MainThreadMessageServiceShape;

	readonly onDidChangeWorkspace: Event<vscode.WorkspaceFoldersChangeEvent> = this._onDidChangeWorkspace.event;

	private readonly _activeSearchCallbacks: ((match: IRawFileMatch2) => any)[] = [];

	constructor(
		mainContext: IMainContext,
		data: IWorkspaceData,
		private _logService: ILogService,
		private _requestIdProvider: Counter
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadWorkspace);
		this._messageService = mainContext.getProxy(MainContext.MainThreadMessageService);
		this._confirmedWorkspace = ExtHostWorkspaceImpl.toExtHostWorkspace(data).workspace;
	}

	// --- workspace ---

	get workspace(): Workspace {
		return this._actualWorkspace;
	}

	get name(): string {
		return this._actualWorkspace ? this._actualWorkspace.name : undefined;
	}

	private get _actualWorkspace(): ExtHostWorkspaceImpl {
		return this._unconfirmedWorkspace || this._confirmedWorkspace;
	}

	getWorkspaceFolders(): vscode.WorkspaceFolder[] {
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.workspaceFolders.slice(0);
	}

	updateWorkspaceFolders(extension: IExtensionDescription, index: number, deleteCount: number, ...workspaceFoldersToAdd: { uri: vscode.Uri, name?: string }[]): boolean {
		const validatedDistinctWorkspaceFoldersToAdd: { uri: vscode.Uri, name?: string }[] = [];
		if (Array.isArray(workspaceFoldersToAdd)) {
			workspaceFoldersToAdd.forEach(folderToAdd => {
				if (URI.isUri(folderToAdd.uri) && !validatedDistinctWorkspaceFoldersToAdd.some(f => isFolderEqual(f.uri, folderToAdd.uri))) {
					validatedDistinctWorkspaceFoldersToAdd.push({ uri: folderToAdd.uri, name: folderToAdd.name || basenameOrAuthority(folderToAdd.uri) });
				}
			});
		}

		if (!!this._unconfirmedWorkspace) {
			return false; // prevent accumulated calls without a confirmed workspace
		}

		if ([index, deleteCount].some(i => typeof i !== 'number' || i < 0)) {
			return false; // validate numbers
		}

		if (deleteCount === 0 && validatedDistinctWorkspaceFoldersToAdd.length === 0) {
			return false; // nothing to delete or add
		}

		const currentWorkspaceFolders: MutableWorkspaceFolder[] = this._actualWorkspace ? this._actualWorkspace.workspaceFolders : [];
		if (index + deleteCount > currentWorkspaceFolders.length) {
			return false; // cannot delete more than we have
		}

		// Simulate the updateWorkspaceFolders method on our data to do more validation
		const newWorkspaceFolders = currentWorkspaceFolders.slice(0);
		newWorkspaceFolders.splice(index, deleteCount, ...validatedDistinctWorkspaceFoldersToAdd.map(f => ({ uri: f.uri, name: f.name || basenameOrAuthority(f.uri), index: undefined })));

		for (let i = 0; i < newWorkspaceFolders.length; i++) {
			const folder = newWorkspaceFolders[i];
			if (newWorkspaceFolders.some((otherFolder, index) => index !== i && isFolderEqual(folder.uri, otherFolder.uri))) {
				return false; // cannot add the same folder multiple times
			}
		}

		newWorkspaceFolders.forEach((f, index) => f.index = index); // fix index
		const { added, removed } = delta(currentWorkspaceFolders, newWorkspaceFolders, compareWorkspaceFolderByUriAndNameAndIndex);
		if (added.length === 0 && removed.length === 0) {
			return false; // nothing actually changed
		}

		// Trigger on main side
		if (this._proxy) {
			const extName = extension.displayName || extension.name;
			this._proxy.$updateWorkspaceFolders(extName, index, deleteCount, validatedDistinctWorkspaceFoldersToAdd).then(undefined, error => {

				// in case of an error, make sure to clear out the unconfirmed workspace
				// because we cannot expect the acknowledgement from the main side for this
				this._unconfirmedWorkspace = undefined;

				// show error to user
				this._messageService.$showMessage(Severity.Error, localize('updateerror', "Extension '{0}' failed to update workspace folders: {1}", extName, error.toString()), { extension }, []);
			});
		}

		// Try to accept directly
		this.trySetWorkspaceFolders(newWorkspaceFolders);

		return true;
	}

	getWorkspaceFolder(uri: vscode.Uri, resolveParent?: boolean): vscode.WorkspaceFolder {
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
	}

	resolveWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder {
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.resolveWorkspaceFolder(uri);
	}

	getPath(): string {

		// this is legacy from the days before having
		// multi-root and we keep it only alive if there
		// is just one workspace folder.
		if (!this._actualWorkspace) {
			return undefined;
		}

		const { folders } = this._actualWorkspace;
		if (folders.length === 0) {
			return undefined;
		}
		// #54483 @Joh Why are we still using fsPath?
		return folders[0].uri.fsPath;
	}

	getRelativePath(pathOrUri: string | vscode.Uri, includeWorkspace?: boolean): string {

		let path: string;
		if (typeof pathOrUri === 'string') {
			path = pathOrUri;
		} else if (typeof pathOrUri !== 'undefined') {
			path = pathOrUri.fsPath;
		}

		if (!path) {
			return path;
		}

		const folder = this.getWorkspaceFolder(
			typeof pathOrUri === 'string' ? URI.file(pathOrUri) : pathOrUri,
			true
		);

		if (!folder) {
			return path;
		}

		if (typeof includeWorkspace === 'undefined') {
			includeWorkspace = this._actualWorkspace.folders.length > 1;
		}

		let result = relative(folder.uri.fsPath, path);
		if (includeWorkspace) {
			result = `${folder.name}/${result}`;
		}
		return normalize(result, true);
	}

	private trySetWorkspaceFolders(folders: vscode.WorkspaceFolder[]): void {

		// Update directly here. The workspace is unconfirmed as long as we did not get an
		// acknowledgement from the main side (via $acceptWorkspaceData)
		if (this._actualWorkspace) {
			this._unconfirmedWorkspace = ExtHostWorkspaceImpl.toExtHostWorkspace({
				id: this._actualWorkspace.id,
				name: this._actualWorkspace.name,
				configuration: this._actualWorkspace.configuration,
				folders
			} as IWorkspaceData, this._actualWorkspace).workspace;
		}
	}

	$acceptWorkspaceData(data: IWorkspaceData): void {

		const { workspace, added, removed } = ExtHostWorkspaceImpl.toExtHostWorkspace(data, this._confirmedWorkspace, this._unconfirmedWorkspace);

		// Update our workspace object. We have a confirmed workspace, so we drop our
		// unconfirmed workspace.
		this._confirmedWorkspace = workspace;
		this._unconfirmedWorkspace = undefined;

		// Events
		this._onDidChangeWorkspace.fire(Object.freeze({
			added,
			removed,
		}));
	}

	// --- search ---

	findFiles(include: string | RelativePattern, exclude: vscode.GlobPattern, maxResults: number, extensionId: ExtensionIdentifier, token: vscode.CancellationToken = CancellationToken.None): Promise<vscode.Uri[]> {
		this._logService.trace(`extHostWorkspace#findFiles: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles`);

		let includePattern: string;
		let includeFolder: URI;
		if (include) {
			if (typeof include === 'string') {
				includePattern = include;
			} else {
				includePattern = include.pattern;

				// include.base must be an absolute path
				includeFolder = include.baseFolder || URI.file(include.base);
			}
		}

		let excludePatternOrDisregardExcludes: string | false;
		if (exclude === null) {
			excludePatternOrDisregardExcludes = false;
		} else if (exclude) {
			if (typeof exclude === 'string') {
				excludePatternOrDisregardExcludes = exclude;
			} else {
				excludePatternOrDisregardExcludes = exclude.pattern;
			}
		}

		if (token && token.isCancellationRequested) {
			return Promise.resolve([]);
		}

		return this._proxy.$startFileSearch(includePattern, includeFolder, excludePatternOrDisregardExcludes, maxResults, token)
			.then(data => Array.isArray(data) ? data.map(URI.revive) : []);
	}

	findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, callback: (result: vscode.TextSearchResult) => void, extensionId: ExtensionIdentifier, token: vscode.CancellationToken = CancellationToken.None): Promise<vscode.TextSearchComplete> {
		this._logService.trace(`extHostWorkspace#findTextInFiles: textSearch, extension: ${extensionId.value}, entryPoint: findTextInFiles`);

		const requestId = this._requestIdProvider.getNext();

		const globPatternToString = (pattern: vscode.GlobPattern | string) => {
			if (typeof pattern === 'string') {
				return pattern;
			}

			return join(pattern.base, pattern.pattern);
		};

		const previewOptions: vscode.TextSearchPreviewOptions = typeof options.previewOptions === 'undefined' ?
			{
				matchLines: 100,
				charsPerLine: 10000
			} :
			options.previewOptions;

		const queryOptions: ITextQueryBuilderOptions = {
			ignoreSymlinks: typeof options.followSymlinks === 'boolean' ? !options.followSymlinks : undefined,
			disregardIgnoreFiles: typeof options.useIgnoreFiles === 'boolean' ? !options.useIgnoreFiles : undefined,
			disregardGlobalIgnoreFiles: typeof options.useGlobalIgnoreFiles === 'boolean' ? !options.useGlobalIgnoreFiles : undefined,
			disregardExcludeSettings: options.exclude === null,
			fileEncoding: options.encoding,
			maxResults: options.maxResults,
			previewOptions,
			afterContext: options.afterContext,
			beforeContext: options.beforeContext,

			includePattern: options.include && globPatternToString(options.include),
			excludePattern: options.exclude && globPatternToString(options.exclude)
		};

		let isCanceled = false;

		this._activeSearchCallbacks[requestId] = p => {
			if (isCanceled) {
				return;
			}

			const uri = URI.revive(p.resource);
			p.results.forEach(result => {
				if (resultIsMatch(result)) {
					callback(<vscode.TextSearchMatch>{
						uri,
						preview: {
							text: result.preview.text,
							matches: mapArrayOrNot(
								result.preview.matches,
								m => new Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn))
						},
						ranges: mapArrayOrNot(
							result.ranges,
							r => new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn))
					});
				} else {
					callback(<vscode.TextSearchContext>{
						uri,
						text: result.text,
						lineNumber: result.lineNumber
					});
				}
			});
		};

		if (token.isCancellationRequested) {
			return Promise.resolve(undefined);
		}

		return this._proxy.$startTextSearch(query, queryOptions, requestId, token).then(result => {
			delete this._activeSearchCallbacks[requestId];
			return result;
		}, err => {
			delete this._activeSearchCallbacks[requestId];
			return Promise.reject(err);
		});
	}

	$handleTextSearchResult(result: IRawFileMatch2, requestId: number): void {
		if (this._activeSearchCallbacks[requestId]) {
			this._activeSearchCallbacks[requestId](result);
		}
	}

	saveAll(includeUntitled?: boolean): Promise<boolean> {
		return this._proxy.$saveAll(includeUntitled);
	}

	resolveProxy(url: string): Promise<string> {
		return this._proxy.$resolveProxy(url);
	}
}
