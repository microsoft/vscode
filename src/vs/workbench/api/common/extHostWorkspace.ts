/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { delta as arrayDelta, mapArrayOrNot } from '../../../base/common/arrays.js';
import { AsyncIterableObject, Barrier } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { AsyncEmitter, Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { Schemas } from '../../../base/common/network.js';
import { Counter } from '../../../base/common/numbers.js';
import { basename, basenameOrAuthority, dirname, ExtUri, relativePath } from '../../../base/common/resources.js';
import { compare } from '../../../base/common/strings.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { FileSystemProviderCapabilities } from '../../../platform/files/common/files.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { Severity } from '../../../platform/notification/common/notification.js';
import { EditSessionIdentityMatch } from '../../../platform/workspace/common/editSessions.js';
import { Workspace, WorkspaceFolder } from '../../../platform/workspace/common/workspace.js';
import { IExtHostFileSystemInfo } from './extHostFileSystemInfo.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { GlobPattern } from './extHostTypeConverters.js';
import { Range } from './extHostTypes.js';
import { IURITransformerService } from './extHostUriTransformerService.js';
import { IFileQueryBuilderOptions, ISearchPatternBuilder, ITextQueryBuilderOptions } from '../../services/search/common/queryBuilder.js';
import { IRawFileMatch2, ITextSearchResult, resultIsMatch } from '../../services/search/common/search.js';
import type * as vscode from 'vscode';
import { ExtHostWorkspaceShape, IRelativePatternDto, IWorkspaceData, MainContext, MainThreadMessageOptions, MainThreadMessageServiceShape, MainThreadWorkspaceShape } from './extHost.protocol.js';
import { revive } from '../../../base/common/marshalling.js';
import { AuthInfo, Credentials } from '../../../platform/request/common/request.js';
import { ExcludeSettingOptions, TextSearchContextNew, TextSearchMatchNew } from '../../services/search/common/searchExtTypes.js';

export interface IExtHostWorkspaceProvider {
	getWorkspaceFolder2(uri: vscode.Uri, resolveParent?: boolean): Promise<vscode.WorkspaceFolder | undefined>;
	resolveWorkspaceFolder(uri: vscode.Uri): Promise<vscode.WorkspaceFolder | undefined>;
	getWorkspaceFolders2(): Promise<vscode.WorkspaceFolder[] | undefined>;
	resolveProxy(url: string): Promise<string | undefined>;
	lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined>;
	lookupKerberosAuthorization(url: string): Promise<string | undefined>;
	loadCertificates(): Promise<string[]>;
}

function isFolderEqual(folderA: URI, folderB: URI, extHostFileSystemInfo: IExtHostFileSystemInfo): boolean {
	return new ExtUri(uri => ignorePathCasing(uri, extHostFileSystemInfo)).isEqual(folderA, folderB);
}

function compareWorkspaceFolderByUri(a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder, extHostFileSystemInfo: IExtHostFileSystemInfo): number {
	return isFolderEqual(a.uri, b.uri, extHostFileSystemInfo) ? 0 : compare(a.uri.toString(), b.uri.toString());
}

function compareWorkspaceFolderByUriAndNameAndIndex(a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder, extHostFileSystemInfo: IExtHostFileSystemInfo): number {
	if (a.index !== b.index) {
		return a.index < b.index ? -1 : 1;
	}

	return isFolderEqual(a.uri, b.uri, extHostFileSystemInfo) ? compare(a.name, b.name) : compare(a.uri.toString(), b.uri.toString());
}

function delta(oldFolders: vscode.WorkspaceFolder[], newFolders: vscode.WorkspaceFolder[], compare: (a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder, extHostFileSystemInfo: IExtHostFileSystemInfo) => number, extHostFileSystemInfo: IExtHostFileSystemInfo): { removed: vscode.WorkspaceFolder[]; added: vscode.WorkspaceFolder[] } {
	const oldSortedFolders = oldFolders.slice(0).sort((a, b) => compare(a, b, extHostFileSystemInfo));
	const newSortedFolders = newFolders.slice(0).sort((a, b) => compare(a, b, extHostFileSystemInfo));

	return arrayDelta(oldSortedFolders, newSortedFolders, (a, b) => compare(a, b, extHostFileSystemInfo));
}

function ignorePathCasing(uri: URI, extHostFileSystemInfo: IExtHostFileSystemInfo): boolean {
	const capabilities = extHostFileSystemInfo.getCapabilities(uri.scheme);
	return !(capabilities && (capabilities & FileSystemProviderCapabilities.PathCaseSensitive));
}

interface MutableWorkspaceFolder extends vscode.WorkspaceFolder {
	name: string;
	index: number;
}

interface QueryOptions<T> {
	options: T;
	folder: URI | undefined;
}

class ExtHostWorkspaceImpl extends Workspace {

	static toExtHostWorkspace(data: IWorkspaceData | null, previousConfirmedWorkspace: ExtHostWorkspaceImpl | undefined, previousUnconfirmedWorkspace: ExtHostWorkspaceImpl | undefined, extHostFileSystemInfo: IExtHostFileSystemInfo): { workspace: ExtHostWorkspaceImpl | null; added: vscode.WorkspaceFolder[]; removed: vscode.WorkspaceFolder[] } {
		if (!data) {
			return { workspace: null, added: [], removed: [] };
		}

		const { id, name, folders, configuration, transient, isUntitled } = data;
		const newWorkspaceFolders: vscode.WorkspaceFolder[] = [];

		// If we have an existing workspace, we try to find the folders that match our
		// data and update their properties. It could be that an extension stored them
		// for later use and we want to keep them "live" if they are still present.
		const oldWorkspace = previousConfirmedWorkspace;
		if (previousConfirmedWorkspace) {
			folders.forEach((folderData, index) => {
				const folderUri = URI.revive(folderData.uri);
				const existingFolder = ExtHostWorkspaceImpl._findFolder(previousUnconfirmedWorkspace || previousConfirmedWorkspace, folderUri, extHostFileSystemInfo);

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

		const workspace = new ExtHostWorkspaceImpl(id, name, newWorkspaceFolders, !!transient, configuration ? URI.revive(configuration) : null, !!isUntitled, uri => ignorePathCasing(uri, extHostFileSystemInfo));
		const { added, removed } = delta(oldWorkspace ? oldWorkspace.workspaceFolders : [], workspace.workspaceFolders, compareWorkspaceFolderByUri, extHostFileSystemInfo);

		return { workspace, added, removed };
	}

	private static _findFolder(workspace: ExtHostWorkspaceImpl, folderUriToFind: URI, extHostFileSystemInfo: IExtHostFileSystemInfo): MutableWorkspaceFolder | undefined {
		for (let i = 0; i < workspace.folders.length; i++) {
			const folder = workspace.workspaceFolders[i];
			if (isFolderEqual(folder.uri, folderUriToFind, extHostFileSystemInfo)) {
				return folder;
			}
		}

		return undefined;
	}

	private readonly _workspaceFolders: vscode.WorkspaceFolder[] = [];
	private readonly _structure: TernarySearchTree<URI, vscode.WorkspaceFolder>;

	constructor(id: string, private _name: string, folders: vscode.WorkspaceFolder[], transient: boolean, configuration: URI | null, private _isUntitled: boolean, ignorePathCasing: (key: URI) => boolean) {
		super(id, folders.map(f => new WorkspaceFolder(f)), transient, configuration, ignorePathCasing);
		this._structure = TernarySearchTree.forUris<vscode.WorkspaceFolder>(ignorePathCasing, () => true);

		// setup the workspace folder data structure
		folders.forEach(folder => {
			this._workspaceFolders.push(folder);
			this._structure.set(folder.uri, folder);
		});
	}

	get name(): string {
		return this._name;
	}

	get isUntitled(): boolean {
		return this._isUntitled;
	}

	get workspaceFolders(): vscode.WorkspaceFolder[] {
		return this._workspaceFolders.slice(0);
	}

	getWorkspaceFolder(uri: URI, resolveParent?: boolean): vscode.WorkspaceFolder | undefined {
		if (resolveParent && this._structure.get(uri)) {
			// `uri` is a workspace folder so we check for its parent
			uri = dirname(uri);
		}
		return this._structure.findSubstr(uri);
	}

	resolveWorkspaceFolder(uri: URI): vscode.WorkspaceFolder | undefined {
		return this._structure.get(uri);
	}
}

export class ExtHostWorkspace implements ExtHostWorkspaceShape, IExtHostWorkspaceProvider {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeWorkspace = new Emitter<vscode.WorkspaceFoldersChangeEvent>();
	readonly onDidChangeWorkspace: Event<vscode.WorkspaceFoldersChangeEvent> = this._onDidChangeWorkspace.event;

	private readonly _onDidGrantWorkspaceTrust = new Emitter<void>();
	readonly onDidGrantWorkspaceTrust: Event<void> = this._onDidGrantWorkspaceTrust.event;

	private readonly _logService: ILogService;
	private readonly _requestIdProvider: Counter;
	private readonly _barrier: Barrier;

	private _confirmedWorkspace?: ExtHostWorkspaceImpl;
	private _unconfirmedWorkspace?: ExtHostWorkspaceImpl;

	private readonly _proxy: MainThreadWorkspaceShape;
	private readonly _messageService: MainThreadMessageServiceShape;
	private readonly _extHostFileSystemInfo: IExtHostFileSystemInfo;
	private readonly _uriTransformerService: IURITransformerService;

	private readonly _activeSearchCallbacks: ((match: IRawFileMatch2) => any)[] = [];

	private _trusted: boolean = false;

	private readonly _editSessionIdentityProviders = new Map<string, vscode.EditSessionIdentityProvider>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostFileSystemInfo extHostFileSystemInfo: IExtHostFileSystemInfo,
		@ILogService logService: ILogService,
		@IURITransformerService uriTransformerService: IURITransformerService,
	) {
		this._logService = logService;
		this._extHostFileSystemInfo = extHostFileSystemInfo;
		this._uriTransformerService = uriTransformerService;
		this._requestIdProvider = new Counter();
		this._barrier = new Barrier();

		this._proxy = extHostRpc.getProxy(MainContext.MainThreadWorkspace);
		this._messageService = extHostRpc.getProxy(MainContext.MainThreadMessageService);
		const data = initData.workspace;
		this._confirmedWorkspace = data ? new ExtHostWorkspaceImpl(data.id, data.name, [], !!data.transient, data.configuration ? URI.revive(data.configuration) : null, !!data.isUntitled, uri => ignorePathCasing(uri, extHostFileSystemInfo)) : undefined;
	}

	$initializeWorkspace(data: IWorkspaceData | null, trusted: boolean): void {
		this._trusted = trusted;
		this.$acceptWorkspaceData(data);
		this._barrier.open();
	}

	waitForInitializeCall(): Promise<boolean> {
		return this._barrier.wait();
	}

	// --- workspace ---

	get workspace(): Workspace | undefined {
		return this._actualWorkspace;
	}

	get name(): string | undefined {
		return this._actualWorkspace ? this._actualWorkspace.name : undefined;
	}

	get workspaceFile(): vscode.Uri | undefined {
		if (this._actualWorkspace) {
			if (this._actualWorkspace.configuration) {
				if (this._actualWorkspace.isUntitled) {
					return URI.from({ scheme: Schemas.untitled, path: basename(dirname(this._actualWorkspace.configuration)) }); // Untitled Workspace: return untitled URI
				}

				return this._actualWorkspace.configuration; // Workspace: return the configuration location
			}
		}

		return undefined;
	}

	private get _actualWorkspace(): ExtHostWorkspaceImpl | undefined {
		return this._unconfirmedWorkspace || this._confirmedWorkspace;
	}

	getWorkspaceFolders(): vscode.WorkspaceFolder[] | undefined {
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.workspaceFolders.slice(0);
	}

	async getWorkspaceFolders2(): Promise<vscode.WorkspaceFolder[] | undefined> {
		await this._barrier.wait();
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.workspaceFolders.slice(0);
	}

	updateWorkspaceFolders(extension: IExtensionDescription, index: number, deleteCount: number, ...workspaceFoldersToAdd: { uri: vscode.Uri; name?: string }[]): boolean {
		const validatedDistinctWorkspaceFoldersToAdd: { uri: vscode.Uri; name?: string }[] = [];
		if (Array.isArray(workspaceFoldersToAdd)) {
			workspaceFoldersToAdd.forEach(folderToAdd => {
				if (URI.isUri(folderToAdd.uri) && !validatedDistinctWorkspaceFoldersToAdd.some(f => isFolderEqual(f.uri, folderToAdd.uri, this._extHostFileSystemInfo))) {
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
		newWorkspaceFolders.splice(index, deleteCount, ...validatedDistinctWorkspaceFoldersToAdd.map(f => ({ uri: f.uri, name: f.name || basenameOrAuthority(f.uri), index: undefined! /* fixed later */ })));

		for (let i = 0; i < newWorkspaceFolders.length; i++) {
			const folder = newWorkspaceFolders[i];
			if (newWorkspaceFolders.some((otherFolder, index) => index !== i && isFolderEqual(folder.uri, otherFolder.uri, this._extHostFileSystemInfo))) {
				return false; // cannot add the same folder multiple times
			}
		}

		newWorkspaceFolders.forEach((f, index) => f.index = index); // fix index
		const { added, removed } = delta(currentWorkspaceFolders, newWorkspaceFolders, compareWorkspaceFolderByUriAndNameAndIndex, this._extHostFileSystemInfo);
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
				const options: MainThreadMessageOptions = { source: { identifier: extension.identifier, label: extension.displayName || extension.name } };
				this._messageService.$showMessage(Severity.Error, localize('updateerror', "Extension '{0}' failed to update workspace folders: {1}", extName, error.toString()), options, []);
			});
		}

		// Try to accept directly
		this.trySetWorkspaceFolders(newWorkspaceFolders);

		return true;
	}

	getWorkspaceFolder(uri: vscode.Uri, resolveParent?: boolean): vscode.WorkspaceFolder | undefined {
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
	}

	async getWorkspaceFolder2(uri: vscode.Uri, resolveParent?: boolean): Promise<vscode.WorkspaceFolder | undefined> {
		await this._barrier.wait();
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
	}

	async resolveWorkspaceFolder(uri: vscode.Uri): Promise<vscode.WorkspaceFolder | undefined> {
		await this._barrier.wait();
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.resolveWorkspaceFolder(uri);
	}

	getPath(): string | undefined {

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

		let resource: URI | undefined;
		let path: string = '';
		if (typeof pathOrUri === 'string') {
			resource = URI.file(pathOrUri);
			path = pathOrUri;
		} else if (typeof pathOrUri !== 'undefined') {
			resource = pathOrUri;
			path = pathOrUri.fsPath;
		}

		if (!resource) {
			return path;
		}

		const folder = this.getWorkspaceFolder(
			resource,
			true
		);

		if (!folder) {
			return path;
		}

		if (typeof includeWorkspace === 'undefined' && this._actualWorkspace) {
			includeWorkspace = this._actualWorkspace.folders.length > 1;
		}

		let result = relativePath(folder.uri, resource);
		if (includeWorkspace && folder.name) {
			result = `${folder.name}/${result}`;
		}
		return result!;
	}

	private trySetWorkspaceFolders(folders: vscode.WorkspaceFolder[]): void {

		// Update directly here. The workspace is unconfirmed as long as we did not get an
		// acknowledgement from the main side (via $acceptWorkspaceData)
		if (this._actualWorkspace) {
			this._unconfirmedWorkspace = ExtHostWorkspaceImpl.toExtHostWorkspace({
				id: this._actualWorkspace.id,
				name: this._actualWorkspace.name,
				configuration: this._actualWorkspace.configuration,
				folders,
				isUntitled: this._actualWorkspace.isUntitled
			}, this._actualWorkspace, undefined, this._extHostFileSystemInfo).workspace || undefined;
		}
	}

	$acceptWorkspaceData(data: IWorkspaceData | null): void {

		const { workspace, added, removed } = ExtHostWorkspaceImpl.toExtHostWorkspace(data, this._confirmedWorkspace, this._unconfirmedWorkspace, this._extHostFileSystemInfo);

		// Update our workspace object. We have a confirmed workspace, so we drop our
		// unconfirmed workspace.
		this._confirmedWorkspace = workspace || undefined;
		this._unconfirmedWorkspace = undefined;

		// Events
		this._onDidChangeWorkspace.fire(Object.freeze({
			added,
			removed,
		}));
	}

	// --- search ---

	/**
	 * Note, null/undefined have different and important meanings for "exclude"
	 */
	findFiles(include: vscode.GlobPattern | undefined, exclude: vscode.GlobPattern | null | undefined, maxResults: number | undefined, extensionId: ExtensionIdentifier, token: vscode.CancellationToken = CancellationToken.None): Promise<vscode.Uri[]> {
		this._logService.trace(`extHostWorkspace#findFiles: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles`);

		let excludeString: string = '';
		let useFileExcludes = true;
		if (exclude === null) {
			useFileExcludes = false;
		} else if (exclude !== undefined) {
			if (typeof exclude === 'string') {
				excludeString = exclude;
			} else {
				excludeString = exclude.pattern;
			}
		}

		// todo: consider exclude baseURI if available
		return this._findFilesImpl(include, undefined, {
			exclude: [excludeString],
			maxResults,
			useExcludeSettings: useFileExcludes ? ExcludeSettingOptions.FilesExclude : ExcludeSettingOptions.None,
			useIgnoreFiles: {
				local: false
			}
		}, token);
	}

	findFiles2(filePattern: vscode.GlobPattern | undefined,
		options: vscode.FindFiles2Options = {},
		extensionId: ExtensionIdentifier,
		token: vscode.CancellationToken = CancellationToken.None): Promise<vscode.Uri[]> {
		this._logService.trace(`extHostWorkspace#findFiles2: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles2`);


		const useDefaultExcludes = options.useDefaultExcludes ?? true;
		const useDefaultSearchExcludes = options.useDefaultSearchExcludes ?? true;
		const excludeSetting = useDefaultExcludes ?
			(useDefaultSearchExcludes ? ExcludeSettingOptions.SearchAndFilesExclude : ExcludeSettingOptions.FilesExclude) :
			ExcludeSettingOptions.None;
		const newOptions: vscode.FindFiles2OptionsNew = {
			exclude: options.exclude ? [options.exclude] : undefined,
			useIgnoreFiles: {
				local: options.useIgnoreFiles,
				global: options.useGlobalIgnoreFiles,
				parent: options.useParentIgnoreFiles
			},
			useExcludeSettings: excludeSetting,
			followSymlinks: options.followSymlinks,
			maxResults: options.maxResults,
		};
		return this._findFilesImpl(undefined, filePattern !== undefined ? [filePattern] : [], newOptions, token);
	}

	findFiles2New(filePatterns: vscode.GlobPattern[],
		options: vscode.FindFiles2OptionsNew = {},
		extensionId: ExtensionIdentifier,
		token: vscode.CancellationToken = CancellationToken.None): Promise<vscode.Uri[]> {
		this._logService.trace(`extHostWorkspace#findFiles2New: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles2New`);
		return this._findFilesImpl(undefined, filePatterns, options, token);
	}

	private async _findFilesImpl(
		// the old `findFiles` used `include` to query, but the new `findFiles2` uses `filePattern` to query.
		// `filePattern` is the proper way to handle this, since it takes less precedence than the ignore files.
		include: vscode.GlobPattern | undefined,
		filePatterns: vscode.GlobPattern[] | undefined,
		options: vscode.FindFiles2OptionsNew,
		token: vscode.CancellationToken = CancellationToken.None): Promise<vscode.Uri[]> {
		if (token && token.isCancellationRequested) {
			return Promise.resolve([]);
		}


		const filePatternsToUse = include !== undefined ? [include] : filePatterns;
		const queryOptions: QueryOptions<IFileQueryBuilderOptions>[] = filePatternsToUse?.map(filePattern => {

			const excludePatterns = globsToISearchPatternBuilder(options.exclude);

			const fileQueries: IFileQueryBuilderOptions = {
				ignoreSymlinks: typeof options.followSymlinks === 'boolean' ? !options.followSymlinks : undefined,
				disregardIgnoreFiles: typeof options.useIgnoreFiles?.local === 'boolean' ? !options.useIgnoreFiles.local : undefined,
				disregardGlobalIgnoreFiles: typeof options.useIgnoreFiles?.global === 'boolean' ? !options.useIgnoreFiles.global : undefined,
				disregardParentIgnoreFiles: typeof options.useIgnoreFiles?.parent === 'boolean' ? !options.useIgnoreFiles.parent : undefined,
				disregardExcludeSettings: options.useExcludeSettings !== undefined && options.useExcludeSettings === ExcludeSettingOptions.None,
				disregardSearchExcludeSettings: options.useExcludeSettings !== undefined && (options.useExcludeSettings !== ExcludeSettingOptions.SearchAndFilesExclude),
				maxResults: options.maxResults,
				excludePattern: excludePatterns.length > 0 ? excludePatterns : undefined,
				_reason: 'startFileSearch',
				shouldGlobSearch: include ? undefined : true,
			};

			const parseInclude = parseSearchExcludeInclude(GlobPattern.from(filePattern));
			const folderToUse = parseInclude?.folder;
			if (include) {
				fileQueries.includePattern = parseInclude?.pattern;
			} else {
				fileQueries.filePattern = parseInclude?.pattern;
			}
			return {
				folder: folderToUse,
				options: fileQueries
			};
		}) ?? [];

		return this._findFilesBase(queryOptions, token);
	}

	private async _findFilesBase(
		queryOptions: QueryOptions<IFileQueryBuilderOptions>[] | undefined,
		token: CancellationToken
	): Promise<vscode.Uri[]> {
		const result = await Promise.all(queryOptions?.map(option => this._proxy.$startFileSearch(
			option.folder ?? null,
			option.options,
			token).then(data => Array.isArray(data) ? data.map(d => URI.revive(d)) : [])
		) ?? []);

		return result.flat();
	}

	findTextInFilesNew(query: vscode.TextSearchQueryNew, options: vscode.FindTextInFilesOptionsNew | undefined, extensionId: ExtensionIdentifier, token: vscode.CancellationToken = CancellationToken.None): vscode.FindTextInFilesResponse {
		this._logService.trace(`extHostWorkspace#findTextInFilesNew: textSearch, extension: ${extensionId.value}, entryPoint: findTextInFilesNew`);


		const getOptions = (include: vscode.GlobPattern | undefined): QueryOptions<ITextQueryBuilderOptions> => {
			if (!options) {
				return {
					folder: undefined,
					options: {}
				};
			}
			const parsedInclude = include ? parseSearchExcludeInclude(GlobPattern.from(include)) : undefined;

			const excludePatterns = options.exclude ? globsToISearchPatternBuilder(options.exclude) : undefined;

			return {
				options: {

					ignoreSymlinks: typeof options.followSymlinks === 'boolean' ? !options.followSymlinks : undefined,
					disregardIgnoreFiles: typeof options.useIgnoreFiles === 'boolean' ? !options.useIgnoreFiles : undefined,
					disregardGlobalIgnoreFiles: typeof options.useIgnoreFiles?.global === 'boolean' ? !options.useIgnoreFiles?.global : undefined,
					disregardParentIgnoreFiles: typeof options.useIgnoreFiles?.parent === 'boolean' ? !options.useIgnoreFiles?.parent : undefined,
					disregardExcludeSettings: options.useExcludeSettings !== undefined && options.useExcludeSettings === ExcludeSettingOptions.None,
					disregardSearchExcludeSettings: options.useExcludeSettings !== undefined && (options.useExcludeSettings !== ExcludeSettingOptions.SearchAndFilesExclude),
					fileEncoding: options.encoding,
					maxResults: options.maxResults,
					previewOptions: options.previewOptions ? {
						matchLines: options.previewOptions?.numMatchLines ?? 100,
						charsPerLine: options.previewOptions?.charsPerLine ?? 10000,
					} : undefined,
					surroundingContext: options.surroundingContext,

					includePattern: parsedInclude?.pattern,
					excludePattern: excludePatterns
				} satisfies ITextQueryBuilderOptions,
				folder: parsedInclude?.folder
			} satisfies QueryOptions<ITextQueryBuilderOptions>;
		};

		const queryOptionsRaw: (QueryOptions<ITextQueryBuilderOptions> | undefined)[] = ((options?.include?.map((include) =>
			getOptions(include)))) ?? [getOptions(undefined)];

		const queryOptions = queryOptionsRaw.filter((queryOps): queryOps is QueryOptions<ITextQueryBuilderOptions> => !!queryOps);

		const disposables = new DisposableStore();
		const progressEmitter = disposables.add(new Emitter<{ result: ITextSearchResult<URI>; uri: URI }>());
		const complete = this.findTextInFilesBase(
			query,
			queryOptions,
			(result, uri) => progressEmitter.fire({ result, uri }),
			token
		);
		const asyncIterable = new AsyncIterableObject<vscode.TextSearchResultNew>(async emitter => {
			disposables.add(progressEmitter.event(e => {
				const result = e.result;
				const uri = e.uri;
				if (resultIsMatch(result)) {
					emitter.emitOne(new TextSearchMatchNew(
						uri,
						result.rangeLocations.map((range) => ({
							previewRange: new Range(range.preview.startLineNumber, range.preview.startColumn, range.preview.endLineNumber, range.preview.endColumn),
							sourceRange: new Range(range.source.startLineNumber, range.source.startColumn, range.source.endLineNumber, range.source.endColumn)
						})),
						result.previewText

					));
				} else {
					emitter.emitOne(new TextSearchContextNew(
						uri,
						result.text,
						result.lineNumber
					));

				}
			}));
			await complete;
		});

		return {
			results: asyncIterable,
			complete: complete.then((e) => {
				disposables.dispose();
				return {
					limitHit: e?.limitHit ?? false
				};
			}),
		};
	}


	async findTextInFilesBase(query: vscode.TextSearchQuery, queryOptions: QueryOptions<ITextQueryBuilderOptions>[] | undefined, callback: (result: ITextSearchResult<URI>, uri: URI) => void, token: vscode.CancellationToken = CancellationToken.None): Promise<vscode.TextSearchComplete> {
		const requestId = this._requestIdProvider.getNext();

		let isCanceled = false;
		token.onCancellationRequested(_ => {
			isCanceled = true;
		});

		this._activeSearchCallbacks[requestId] = p => {
			if (isCanceled) {
				return;
			}

			const uri = URI.revive(p.resource);
			p.results!.forEach(rawResult => {
				const result: ITextSearchResult<URI> = revive(rawResult);
				callback(result, uri);
			});
		};

		if (token.isCancellationRequested) {
			return {};
		}

		try {
			const result = await Promise.all(queryOptions?.map(option => this._proxy.$startTextSearch(
				query,
				option.folder ?? null,
				option.options,
				requestId,
				token) || {}
			) ?? []);
			delete this._activeSearchCallbacks[requestId];
			return result.reduce((acc, val) => {
				return {
					limitHit: acc?.limitHit || (val?.limitHit ?? false),
					message: [acc?.message ?? [], val?.message ?? []].flat(),
				};
			}, {}) ?? { limitHit: false };

		} catch (err) {
			delete this._activeSearchCallbacks[requestId];
			throw err;
		}
	}

	async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions & { useSearchExclude?: boolean }, callback: (result: vscode.TextSearchResult) => void, extensionId: ExtensionIdentifier, token: vscode.CancellationToken = CancellationToken.None): Promise<vscode.TextSearchComplete> {
		this._logService.trace(`extHostWorkspace#findTextInFiles: textSearch, extension: ${extensionId.value}, entryPoint: findTextInFiles`);

		const previewOptions: vscode.TextSearchPreviewOptions = typeof options.previewOptions === 'undefined' ?
			{
				matchLines: 100,
				charsPerLine: 10000
			} :
			options.previewOptions;

		const parsedInclude = parseSearchExcludeInclude(GlobPattern.from(options.include));

		const excludePattern = (typeof options.exclude === 'string') ? options.exclude :
			options.exclude ? options.exclude.pattern : undefined;
		const queryOptions: ITextQueryBuilderOptions = {
			ignoreSymlinks: typeof options.followSymlinks === 'boolean' ? !options.followSymlinks : undefined,
			disregardIgnoreFiles: typeof options.useIgnoreFiles === 'boolean' ? !options.useIgnoreFiles : undefined,
			disregardGlobalIgnoreFiles: typeof options.useGlobalIgnoreFiles === 'boolean' ? !options.useGlobalIgnoreFiles : undefined,
			disregardParentIgnoreFiles: typeof options.useParentIgnoreFiles === 'boolean' ? !options.useParentIgnoreFiles : undefined,
			disregardExcludeSettings: typeof options.useDefaultExcludes === 'boolean' ? !options.useDefaultExcludes : true,
			disregardSearchExcludeSettings: typeof options.useSearchExclude === 'boolean' ? !options.useSearchExclude : true,
			fileEncoding: options.encoding,
			maxResults: options.maxResults,
			previewOptions,
			surroundingContext: options.afterContext, // TODO: remove ability to have before/after context separately

			includePattern: parsedInclude?.pattern,
			excludePattern: excludePattern ? [{ pattern: excludePattern }] : undefined,
		};

		const progress = (result: ITextSearchResult<URI>, uri: URI) => {
			if (resultIsMatch(result)) {
				callback({
					uri,
					preview: {
						text: result.previewText,
						matches: mapArrayOrNot(
							result.rangeLocations,
							m => new Range(m.preview.startLineNumber, m.preview.startColumn, m.preview.endLineNumber, m.preview.endColumn))
					},
					ranges: mapArrayOrNot(
						result.rangeLocations,
						r => new Range(r.source.startLineNumber, r.source.startColumn, r.source.endLineNumber, r.source.endColumn))
				} satisfies vscode.TextSearchMatch);
			} else {
				callback({
					uri,
					text: result.text,
					lineNumber: result.lineNumber
				} satisfies vscode.TextSearchContext);
			}
		};

		return this.findTextInFilesBase(query, [{ options: queryOptions, folder: parsedInclude?.folder }], progress, token);
	}

	$handleTextSearchResult(result: IRawFileMatch2, requestId: number): void {
		this._activeSearchCallbacks[requestId]?.(result);
	}

	async save(uri: URI): Promise<URI | undefined> {
		const result = await this._proxy.$save(uri, { saveAs: false });

		return URI.revive(result);
	}

	async saveAs(uri: URI): Promise<URI | undefined> {
		const result = await this._proxy.$save(uri, { saveAs: true });

		return URI.revive(result);
	}

	saveAll(includeUntitled?: boolean): Promise<boolean> {
		return this._proxy.$saveAll(includeUntitled);
	}

	resolveProxy(url: string): Promise<string | undefined> {
		return this._proxy.$resolveProxy(url);
	}

	lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		return this._proxy.$lookupAuthorization(authInfo);
	}

	lookupKerberosAuthorization(url: string): Promise<string | undefined> {
		return this._proxy.$lookupKerberosAuthorization(url);
	}

	loadCertificates(): Promise<string[]> {
		return this._proxy.$loadCertificates();
	}

	// --- trust ---

	get trusted(): boolean {
		return this._trusted;
	}

	requestWorkspaceTrust(options?: vscode.WorkspaceTrustRequestOptions): Promise<boolean | undefined> {
		return this._proxy.$requestWorkspaceTrust(options);
	}

	$onDidGrantWorkspaceTrust(): void {
		if (!this._trusted) {
			this._trusted = true;
			this._onDidGrantWorkspaceTrust.fire();
		}
	}

	// --- edit sessions ---

	private _providerHandlePool = 0;

	// called by ext host
	registerEditSessionIdentityProvider(scheme: string, provider: vscode.EditSessionIdentityProvider) {
		if (this._editSessionIdentityProviders.has(scheme)) {
			throw new Error(`A provider has already been registered for scheme ${scheme}`);
		}

		this._editSessionIdentityProviders.set(scheme, provider);
		const outgoingScheme = this._uriTransformerService.transformOutgoingScheme(scheme);
		const handle = this._providerHandlePool++;
		this._proxy.$registerEditSessionIdentityProvider(handle, outgoingScheme);

		return toDisposable(() => {
			this._editSessionIdentityProviders.delete(scheme);
			this._proxy.$unregisterEditSessionIdentityProvider(handle);
		});
	}

	// called by main thread
	async $getEditSessionIdentifier(workspaceFolder: UriComponents, cancellationToken: CancellationToken): Promise<string | undefined> {
		this._logService.info('Getting edit session identifier for workspaceFolder', workspaceFolder);
		const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
		if (!folder) {
			this._logService.warn('Unable to resolve workspace folder');
			return undefined;
		}

		this._logService.info('Invoking #provideEditSessionIdentity for workspaceFolder', folder);

		const provider = this._editSessionIdentityProviders.get(folder.uri.scheme);
		this._logService.info(`Provider for scheme ${folder.uri.scheme} is defined: `, !!provider);
		if (!provider) {
			return undefined;
		}

		const result = await provider.provideEditSessionIdentity(folder, cancellationToken);
		this._logService.info('Provider returned edit session identifier: ', result);
		if (!result) {
			return undefined;
		}

		return result;
	}

	async $provideEditSessionIdentityMatch(workspaceFolder: UriComponents, identity1: string, identity2: string, cancellationToken: CancellationToken): Promise<EditSessionIdentityMatch | undefined> {
		this._logService.info('Getting edit session identifier for workspaceFolder', workspaceFolder);
		const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
		if (!folder) {
			this._logService.warn('Unable to resolve workspace folder');
			return undefined;
		}

		this._logService.info('Invoking #provideEditSessionIdentity for workspaceFolder', folder);

		const provider = this._editSessionIdentityProviders.get(folder.uri.scheme);
		this._logService.info(`Provider for scheme ${folder.uri.scheme} is defined: `, !!provider);
		if (!provider) {
			return undefined;
		}

		const result = await provider.provideEditSessionIdentityMatch?.(identity1, identity2, cancellationToken);
		this._logService.info('Provider returned edit session identifier match result: ', result);
		if (!result) {
			return undefined;
		}

		return result;
	}

	private readonly _onWillCreateEditSessionIdentityEvent = new AsyncEmitter<vscode.EditSessionIdentityWillCreateEvent>();

	getOnWillCreateEditSessionIdentityEvent(extension: IExtensionDescription): Event<vscode.EditSessionIdentityWillCreateEvent> {
		return (listener, thisArg, disposables) => {
			const wrappedListener: IExtensionListener<vscode.EditSessionIdentityWillCreateEvent> = function wrapped(e) { listener.call(thisArg, e); };
			wrappedListener.extension = extension;
			return this._onWillCreateEditSessionIdentityEvent.event(wrappedListener, undefined, disposables);
		};
	}

	// main thread calls this to trigger participants
	async $onWillCreateEditSessionIdentity(workspaceFolder: UriComponents, token: CancellationToken, timeout: number): Promise<void> {
		const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));

		if (folder === undefined) {
			throw new Error('Unable to resolve workspace folder');
		}

		await this._onWillCreateEditSessionIdentityEvent.fireAsync({ workspaceFolder: folder }, token, async (thenable: Promise<unknown>, listener) => {
			const now = Date.now();
			await Promise.resolve(thenable);
			if (Date.now() - now > timeout) {
				this._logService.warn('SLOW edit session create-participant', (<IExtensionListener<vscode.EditSessionIdentityWillCreateEvent>>listener).extension.identifier);
			}
		});

		if (token.isCancellationRequested) {
			return undefined;
		}
	}

	// --- canonical uri identity ---

	private readonly _canonicalUriProviders = new Map<string, vscode.CanonicalUriProvider>();

	// called by ext host
	registerCanonicalUriProvider(scheme: string, provider: vscode.CanonicalUriProvider) {
		if (this._canonicalUriProviders.has(scheme)) {
			throw new Error(`A provider has already been registered for scheme ${scheme}`);
		}

		this._canonicalUriProviders.set(scheme, provider);
		const outgoingScheme = this._uriTransformerService.transformOutgoingScheme(scheme);
		const handle = this._providerHandlePool++;
		this._proxy.$registerCanonicalUriProvider(handle, outgoingScheme);

		return toDisposable(() => {
			this._canonicalUriProviders.delete(scheme);
			this._proxy.$unregisterCanonicalUriProvider(handle);
		});
	}

	async provideCanonicalUri(uri: URI, options: vscode.CanonicalUriRequestOptions, cancellationToken: CancellationToken): Promise<URI | undefined> {
		const provider = this._canonicalUriProviders.get(uri.scheme);
		if (!provider) {
			return undefined;
		}

		const result = await provider.provideCanonicalUri?.(URI.revive(uri), options, cancellationToken);
		if (!result) {
			return undefined;
		}

		return result;
	}

	// called by main thread
	async $provideCanonicalUri(uri: UriComponents, targetScheme: string, cancellationToken: CancellationToken): Promise<UriComponents | undefined> {
		return this.provideCanonicalUri(URI.revive(uri), { targetScheme }, cancellationToken);
	}
}

export const IExtHostWorkspace = createDecorator<IExtHostWorkspace>('IExtHostWorkspace');
export interface IExtHostWorkspace extends ExtHostWorkspace, ExtHostWorkspaceShape, IExtHostWorkspaceProvider { }

function parseSearchExcludeInclude(include: string | IRelativePatternDto | undefined | null): { pattern: string; folder?: URI } | undefined {
	let pattern: string | undefined;
	let includeFolder: URI | undefined;
	if (include) {
		if (typeof include === 'string') {
			pattern = include;
		} else {
			pattern = include.pattern;
			includeFolder = URI.revive(include.baseUri);
		}

		return {
			pattern,
			folder: includeFolder
		};
	}
	return undefined;
}

interface IExtensionListener<E> {
	extension: IExtensionDescription;
	(e: E): any;
}

function globsToISearchPatternBuilder(excludes: vscode.GlobPattern[] | undefined): ISearchPatternBuilder<URI>[] {
	return (
		excludes?.map((exclude): ISearchPatternBuilder<URI> | undefined => {
			if (typeof exclude === 'string') {
				if (exclude === '') {
					return undefined;
				}
				return {
					pattern: exclude,
					uri: undefined
				} satisfies ISearchPatternBuilder<URI>;
			} else {
				const parsedExclude = parseSearchExcludeInclude(exclude);
				if (!parsedExclude) {
					return undefined;
				}
				return {
					pattern: parsedExclude.pattern,
					uri: parsedExclude.folder
				} satisfies ISearchPatternBuilder<URI>;
			}
		}) ?? []
	).filter((e): e is ISearchPatternBuilder<URI> => !!e);
}
