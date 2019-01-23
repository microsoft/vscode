/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isPromiseCanceledError } from 'vs/base/common/errors';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IFolderQuery, IPatternInfo, ISearchConfiguration, ISearchProgressItem, ISearchService, QueryType, IFileQuery, IFileMatch } from 'vs/platform/search/common/search';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { QueryBuilder, ITextQueryBuilderOptions } from 'vs/workbench/parts/search/common/queryBuilder';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { ExtHostContext, ExtHostWorkspaceShape, IExtHostContext, MainContext, MainThreadWorkspaceShape } from '../node/extHost.protocol';
import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';
import { TextSearchComplete } from 'vscode';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

@extHostNamedCustomer(MainContext.MainThreadWorkspace)
export class MainThreadWorkspace implements MainThreadWorkspaceShape {

	private readonly _toDispose: IDisposable[] = [];
	private readonly _activeCancelTokens: { [id: number]: CancellationTokenSource } = Object.create(null);
	private readonly _proxy: ExtHostWorkspaceShape;

	constructor(
		extHostContext: IExtHostContext,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceEditingService private readonly _workspaceEditingService: IWorkspaceEditingService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
		@IWindowService private readonly _windowService: IWindowService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostWorkspace);
		this._contextService.onDidChangeWorkspaceFolders(this._onDidChangeWorkspace, this, this._toDispose);
		this._contextService.onDidChangeWorkbenchState(this._onDidChangeWorkspace, this, this._toDispose);
	}

	dispose(): void {
		dispose(this._toDispose);

		for (let requestId in this._activeCancelTokens) {
			const tokenSource = this._activeCancelTokens[requestId];
			tokenSource.cancel();
		}
	}

	// --- workspace ---

	$updateWorkspaceFolders(extensionName: string, index: number, deleteCount: number, foldersToAdd: { uri: UriComponents, name?: string }[]): Promise<void> {
		const workspaceFoldersToAdd = foldersToAdd.map(f => ({ uri: URI.revive(f.uri), name: f.name }));

		// Indicate in status message
		this._statusbarService.setStatusMessage(this.getStatusMessage(extensionName, workspaceFoldersToAdd.length, deleteCount), 10 * 1000 /* 10s */);

		return this._workspaceEditingService.updateFolders(index, deleteCount, workspaceFoldersToAdd, true);
	}

	private getStatusMessage(extensionName: string, addCount: number, removeCount: number): string {
		let message: string;

		const wantsToAdd = addCount > 0;
		const wantsToDelete = removeCount > 0;

		// Add Folders
		if (wantsToAdd && !wantsToDelete) {
			if (addCount === 1) {
				message = localize('folderStatusMessageAddSingleFolder', "Extension '{0}' added 1 folder to the workspace", extensionName);
			} else {
				message = localize('folderStatusMessageAddMultipleFolders', "Extension '{0}' added {1} folders to the workspace", extensionName, addCount);
			}
		}

		// Delete Folders
		else if (wantsToDelete && !wantsToAdd) {
			if (removeCount === 1) {
				message = localize('folderStatusMessageRemoveSingleFolder', "Extension '{0}' removed 1 folder from the workspace", extensionName);
			} else {
				message = localize('folderStatusMessageRemoveMultipleFolders', "Extension '{0}' removed {1} folders from the workspace", extensionName, removeCount);
			}
		}

		// Change Folders
		else {
			message = localize('folderStatusChangeFolder', "Extension '{0}' changed folders of the workspace", extensionName);
		}

		return message;
	}

	private _onDidChangeWorkspace(): void {
		const workspace = this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? null : this._contextService.getWorkspace();
		this._proxy.$acceptWorkspaceData(workspace ? {
			configuration: workspace.configuration,
			folders: workspace.folders,
			id: workspace.id,
			name: this._labelService.getWorkspaceLabel(workspace)
		} : null);
	}

	// --- search ---

	$startFileSearch(includePattern: string, _includeFolder: UriComponents, excludePatternOrDisregardExcludes: string | false, maxResults: number, token: CancellationToken): Promise<URI[]> {
		const includeFolder = URI.revive(_includeFolder);
		const workspace = this._contextService.getWorkspace();
		if (!workspace.folders.length) {
			return undefined;
		}

		let folderQueries: IFolderQuery[];
		if (includeFolder) {
			folderQueries = [{ folder: includeFolder }]; // if base provided, only search in that folder
		} else {
			folderQueries = workspace.folders.map(folder => ({ folder: folder.uri })); // absolute pattern: search across all folders
		}

		if (!folderQueries) {
			return undefined; // invalid query parameters
		}

		const useRipgrep = folderQueries.every(folderQuery => {
			const folderConfig = this._configurationService.getValue<ISearchConfiguration>({ resource: folderQuery.folder });
			return folderConfig.search.useRipgrep;
		});

		const ignoreSymlinks = folderQueries.every(folderQuery => {
			const folderConfig = this._configurationService.getValue<ISearchConfiguration>({ resource: folderQuery.folder });
			return !folderConfig.search.followSymlinks;
		});

		// TODO replace wth QueryBuilder
		folderQueries.forEach(fq => {
			fq.ignoreSymlinks = ignoreSymlinks;
		});

		const query: IFileQuery = {
			folderQueries,
			type: QueryType.File,
			maxResults,
			disregardExcludeSettings: excludePatternOrDisregardExcludes === false,
			useRipgrep,
			_reason: 'startFileSearch'
		};
		if (typeof includePattern === 'string') {
			query.includePattern = { [includePattern]: true };
		}

		if (typeof excludePatternOrDisregardExcludes === 'string') {
			query.excludePattern = { [excludePatternOrDisregardExcludes]: true };
		}

		this._searchService.extendQuery(query);

		return this._searchService.fileSearch(query, token).then(result => {
			return result.results.map(m => m.resource);
		}, err => {
			if (!isPromiseCanceledError(err)) {
				return Promise.reject(err);
			}
			return undefined;
		});
	}

	$startTextSearch(pattern: IPatternInfo, options: ITextQueryBuilderOptions, requestId: number, token: CancellationToken): Promise<TextSearchComplete> {
		const workspace = this._contextService.getWorkspace();
		const folders = workspace.folders.map(folder => folder.uri);

		const queryBuilder = this._instantiationService.createInstance(QueryBuilder);
		const query = queryBuilder.text(pattern, folders, options);
		query._reason = 'startTextSearch';

		const onProgress = (p: ISearchProgressItem) => {
			if ((<IFileMatch>p).results) {
				this._proxy.$handleTextSearchResult(<IFileMatch>p, requestId);
			}
		};

		const search = this._searchService.textSearch(query, token, onProgress).then(
			result => {
				return { limitHit: result.limitHit };
			},
			err => {
				if (!isPromiseCanceledError(err)) {
					return Promise.reject(err);
				}

				return undefined;
			});

		return search;
	}

	$checkExists(includes: string[], token: CancellationToken): Promise<boolean> {
		const queryBuilder = this._instantiationService.createInstance(QueryBuilder);
		const folders = this._contextService.getWorkspace().folders.map(folder => folder.uri);
		const query = queryBuilder.file(folders, {
			_reason: 'checkExists',
			includePattern: includes.join(', '),
			exists: true
		});

		return this._searchService.fileSearch(query, token).then(
			result => {
				return result.limitHit;
			},
			err => {
				if (!isPromiseCanceledError(err)) {
					return Promise.reject(err);
				}

				return undefined;
			});
	}

	// --- save & edit resources ---

	$saveAll(includeUntitled?: boolean): Promise<boolean> {
		return this._textFileService.saveAll(includeUntitled).then(result => {
			return result.results.every(each => each.success === true);
		});
	}

	$resolveProxy(url: string): Promise<string> {
		return this._windowService.resolveProxy(url);
	}
}

CommandsRegistry.registerCommand('_workbench.enterWorkspace', async function (accessor: ServicesAccessor, workspace: URI, disableExtensions: string[]) {
	const workspaceEditingService = accessor.get(IWorkspaceEditingService);
	const extensionService = accessor.get(IExtensionService);
	const windowService = accessor.get(IWindowService);

	if (disableExtensions && disableExtensions.length) {
		const runningExtensions = await extensionService.getExtensions();
		// If requested extension to disable is running, then reload window with given workspace
		if (disableExtensions && runningExtensions.some(runningExtension => disableExtensions.some(id => ExtensionIdentifier.equals(runningExtension.identifier, id)))) {
			return windowService.openWindow([URI.file(workspace.fsPath)], { args: { _: [], 'disable-extension': disableExtensions } });
		}
	}

	return workspaceEditingService.enterWorkspace(workspace.fsPath);
});
