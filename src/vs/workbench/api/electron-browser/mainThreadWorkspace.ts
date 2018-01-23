/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isPromiseCanceledError } from 'vs/base/common/errors';
import URI, { UriComponents } from 'vs/base/common/uri';
import { ISearchService, QueryType, ISearchQuery, IFolderQuery, ISearchConfiguration } from 'vs/platform/search/common/search';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadWorkspaceShape, ExtHostWorkspaceShape, ExtHostContext, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { localize } from 'vs/nls';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';

@extHostNamedCustomer(MainContext.MainThreadWorkspace)
export class MainThreadWorkspace implements MainThreadWorkspaceShape {

	private readonly _toDispose: IDisposable[] = [];
	private readonly _activeSearches: { [id: number]: TPromise<URI[]> } = Object.create(null);
	private readonly _proxy: ExtHostWorkspaceShape;

	constructor(
		extHostContext: IExtHostContext,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IWorkspaceEditingService private _workspaceEditingService: IWorkspaceEditingService,
		@IStatusbarService private _statusbarService: IStatusbarService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostWorkspace);
		this._contextService.onDidChangeWorkspaceFolders(this._onDidChangeWorkspace, this, this._toDispose);
		this._contextService.onDidChangeWorkbenchState(this._onDidChangeWorkspace, this, this._toDispose);
	}

	dispose(): void {
		dispose(this._toDispose);

		for (let requestId in this._activeSearches) {
			const search = this._activeSearches[requestId];
			search.cancel();
		}
	}

	// --- workspace ---

	$updateWorkspaceFolders(extensionName: string, index: number, deleteCount: number, ...add: { uri: UriComponents, name?: string }[]): Thenable<boolean> {
		let workspaceFoldersToAdd: { uri: URI, name?: string }[] = [];
		if (Array.isArray(add)) {
			workspaceFoldersToAdd = add.map(f => ({ uri: URI.revive(f.uri), name: f.name }));
		}

		let workspaceFoldersToRemove: URI[] = [];
		if (typeof deleteCount === 'number') {
			workspaceFoldersToRemove = this._contextService.getWorkspace().folders.slice(index, index + deleteCount).map(f => f.uri);
		}

		if (!workspaceFoldersToAdd.length && !workspaceFoldersToRemove.length) {
			return TPromise.as(false); // return early if we neither have folders to add nor remove
		}

		// Indicate in status message
		this._statusbarService.setStatusMessage(this.getStatusMessage(extensionName, workspaceFoldersToAdd.map(f => f.uri), workspaceFoldersToRemove), 10 * 1000 /* 10s */);

		return this._workspaceEditingService.updateFolders(index, deleteCount, workspaceFoldersToAdd, true).then(() => true);
	}

	private getStatusMessage(extensionName, workspaceFoldersToAdd?: URI[], workspaceFoldersToRemove?: URI[]): string {
		let message: string;

		const wantsToDelete = Array.isArray(workspaceFoldersToRemove) && workspaceFoldersToRemove.length;
		const wantsToAdd = Array.isArray(workspaceFoldersToAdd) && workspaceFoldersToAdd.length;

		// Add Folders
		if (wantsToAdd && !wantsToDelete) {
			if (workspaceFoldersToAdd.length === 1) {
				message = localize('folderStatusMessageAddSingleFolder', "Extension '{0}' added 1 folder to the workspace", extensionName);
			} else {
				message = localize('folderStatusMessageAddMultipleFolders', "Extension '{0}' added {1} folders to the workspace", extensionName, workspaceFoldersToAdd.length);
			}
		}

		// Delete Folders
		else if (wantsToDelete && !wantsToAdd) {
			if (workspaceFoldersToRemove.length === 1) {
				message = localize('folderStatusMessageRemoveSingleFolder', "Extension '{0}' removed 1 folder from the workspace", extensionName);
			} else {
				message = localize('folderStatusMessageRemoveMultipleFolders', "Extension '{0}' removed {1} folders from the workspace", extensionName, workspaceFoldersToRemove.length);
			}
		}

		// Change Folders
		else {
			message = localize('folderStatusChangeFolder', "Extension '{0}' changed folders of the workspace", extensionName);
		}

		return message;
	}

	private _onDidChangeWorkspace(): void {
		this._proxy.$acceptWorkspaceData(this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? null : this._contextService.getWorkspace());
	}

	// --- search ---

	$startSearch(includePattern: string, includeFolder: string, excludePattern: string, maxResults: number, requestId: number): Thenable<URI[]> {
		const workspace = this._contextService.getWorkspace();
		if (!workspace.folders.length) {
			return undefined;
		}

		let folderQueries: IFolderQuery[];
		if (typeof includeFolder === 'string') {
			folderQueries = [{ folder: URI.file(includeFolder) }]; // if base provided, only search in that folder
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

		const query: ISearchQuery = {
			folderQueries,
			type: QueryType.File,
			maxResults,
			includePattern: { [typeof includePattern === 'string' ? includePattern : undefined]: true },
			excludePattern: { [typeof excludePattern === 'string' ? excludePattern : undefined]: true },
			useRipgrep,
			ignoreSymlinks
		};
		this._searchService.extendQuery(query);

		const search = this._searchService.search(query).then(result => {
			return result.results.map(m => m.resource);
		}, err => {
			if (!isPromiseCanceledError(err)) {
				return TPromise.wrapError(err);
			}
			return undefined;
		});

		this._activeSearches[requestId] = search;
		const onDone = () => delete this._activeSearches[requestId];
		search.done(onDone, onDone);

		return search;
	}

	$cancelSearch(requestId: number): Thenable<boolean> {
		const search = this._activeSearches[requestId];
		if (search) {
			delete this._activeSearches[requestId];
			search.cancel();
			return TPromise.as(true);
		}
		return undefined;
	}

	// --- save & edit resources ---

	$saveAll(includeUntitled?: boolean): Thenable<boolean> {
		return this._textFileService.saveAll(includeUntitled).then(result => {
			return result.results.every(each => each.success === true);
		});
	}
}