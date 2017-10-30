/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isPromiseCanceledError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { ISearchService, QueryType, ISearchQuery, IFolderQuery, ISearchConfiguration } from 'vs/platform/search/common/search';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadWorkspaceShape, ExtHostWorkspaceShape, ExtHostContext, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { IFileService } from 'vs/platform/files/common/files';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IRelativePattern } from 'vs/base/common/glob';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { IMessageService } from 'vs/platform/message/common/message';
import { localize } from 'vs/nls';

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
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceEditingService private _workspaceEditingService: IWorkspaceEditingService,
		@IMessageService private _messageService: IMessageService
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostWorkspace);
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

	private _onDidChangeWorkspace(): void {
		this._proxy.$acceptWorkspaceData(this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? null : this._contextService.getWorkspace());
	}

	$addFolder(extensionName: string, uri: URI, name?: string): Thenable<boolean> {
		return this.confirmAddRemoveFolder(extensionName, uri, false).then(confirmed => {
			if (!confirmed) {
				return TPromise.as(false);
			}

			return this._workspaceEditingService.addFolders([{ uri, name }]).then(() => true);
		});
	}

	$removeFolder(extensionName: string, uri: URI): Thenable<boolean> {
		return this.confirmAddRemoveFolder(extensionName, uri, true).then(confirmed => {
			if (!confirmed) {
				return TPromise.as(false);
			}

			return this._workspaceEditingService.removeFolders([uri]).then(() => true);
		});
	}

	private confirmAddRemoveFolder(extensionName, uri: URI, isRemove: boolean): Thenable<boolean> {
		if (!this._configurationService.getValue<boolean>('workbench.confirmChangesToWorkspaceFromExtensions')) {
			return TPromise.as(true); // return confirmed if the setting indicates this
		}

		return this._messageService.confirm({
			message: isRemove ?
				localize('folderMessageRemove', "Extension {0} wants to remove a folder from the workspace. Please confirm.", extensionName) :
				localize('folderMessageAdd', "Extension {0} wants to add a folder to the workspace. Please confirm.", extensionName),
			detail: localize('folderPath', "Folder path: '{0}'", uri.scheme === 'file' ? uri.fsPath : uri.toString()),
			type: 'question',
			primaryButton: isRemove ? localize('removeFolder', "&&Remove Folder") : localize('addFolder', "&&Add Folder"),
			checkbox: {
				label: localize('doNotAskAgain', "Do not ask me again")
			}
		}).then(confirmation => {
			let updateConfirmSettingsPromise: TPromise<void> = TPromise.as(void 0);
			if (confirmation.confirmed && confirmation.checkboxChecked === true) {
				updateConfirmSettingsPromise = this._configurationService.updateValue('workbench.confirmChangesToWorkspaceFromExtensions', false, ConfigurationTarget.USER);
			}

			return updateConfirmSettingsPromise.then(() => confirmation.confirmed);
		});
	}

	// --- search ---

	$startSearch(include: string | IRelativePattern, exclude: string | IRelativePattern, maxResults: number, requestId: number): Thenable<URI[]> {
		const workspace = this._contextService.getWorkspace();
		if (!workspace.folders.length) {
			return undefined;
		}

		let folderQueries: IFolderQuery[];
		if (typeof include === 'string' || !include) {
			folderQueries = workspace.folders.map(folder => ({ folder: folder.uri })); // absolute pattern: search across all folders
		} else {
			folderQueries = [{ folder: URI.file(include.base) }]; // relative pattern: search only in base folder
		}

		const useRipgrep = folderQueries.every(folderQuery => {
			const folderConfig = this._configurationService.getConfiguration<ISearchConfiguration>({ resource: folderQuery.folder });
			return folderConfig.search.useRipgrep;
		});

		const ignoreSymlinks = folderQueries.every(folderQuery => {
			const folderConfig = this._configurationService.getConfiguration<ISearchConfiguration>({ resource: folderQuery.folder });
			return !folderConfig.search.followSymlinks;
		});

		const query: ISearchQuery = {
			folderQueries,
			type: QueryType.File,
			maxResults,
			includePattern: { [typeof include === 'string' ? include : !!include ? include.pattern : undefined]: true },
			excludePattern: { [typeof exclude === 'string' ? exclude : !!exclude ? exclude.pattern : undefined]: true },
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

