/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { dirname } from 'vs/base/common/resources';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IListService, WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { IViewsService, ViewContainerLocation } from 'vs/workbench/common/views';
import * as Constants from 'vs/workbench/contrib/search/common/constants';
import * as SearchEditorConstants from 'vs/workbench/contrib/searchEditor/browser/constants';
import { FileMatch, FolderMatchWithResource, Match, RenderableMatch } from 'vs/workbench/contrib/search/browser/searchModel';
import { OpenSearchEditorArgs } from 'vs/workbench/contrib/searchEditor/browser/searchEditor.contribution';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ISearchConfiguration, ISearchConfigurationProperties } from 'vs/workbench/services/search/common/search';
import { URI } from 'vs/base/common/uri';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { resolveResourcesForSearchIncludes } from 'vs/workbench/services/search/common/queryBuilder';
import { getMultiSelectedResources, IExplorerService } from 'vs/workbench/contrib/files/browser/files';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExplorerFolderContext, ExplorerRootContext, FilesExplorerFocusCondition, VIEWLET_ID as VIEWLET_ID_FILES } from 'vs/workbench/contrib/files/common/files';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ExplorerViewPaneContainer } from 'vs/workbench/contrib/files/browser/explorerViewlet';
import { onUnexpectedError } from 'vs/base/common/errors';
import { category, getElementsToOperateOn, getSearchView, openSearchView } from 'vs/workbench/contrib/search/browser/searchActionsBase';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { Schemas } from 'vs/base/common/network';


//#region Interfaces
export interface IFindInFilesArgs {
	query?: string;
	replace?: string;
	preserveCase?: boolean;
	triggerSearch?: boolean;
	filesToInclude?: string;
	filesToExclude?: string;
	isRegex?: boolean;
	isCaseSensitive?: boolean;
	matchWholeWord?: boolean;
	useExcludeSettingsAndIgnoreFiles?: boolean;
	onlyOpenEditors?: boolean;
}
//#endregion

registerAction2(class RestrictSearchToFolderAction extends Action2 {
	constructor() {
		super({
			id: Constants.RestrictSearchToFolderId,
			title: {
				value: nls.localize('restrictResultsToFolder', "Restrict Search to Folder"),
				original: 'Restrict Search to Folder'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ResourceFolderFocusKey),
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF,
			},
			menu: [
				{
					id: MenuId.SearchContext,
					group: 'search',
					order: 3,
					when: ContextKeyExpr.and(Constants.ResourceFolderFocusKey)
				}
			]
		});
	}
	async run(accessor: ServicesAccessor, folderMatch?: FolderMatchWithResource) {
		await searchWithFolderCommand(accessor, false, true, undefined, folderMatch);
	}
});

registerAction2(class ExcludeFolderFromSearchAction extends Action2 {
	constructor() {
		super({
			id: Constants.ExcludeFolderFromSearchId,
			title: {
				value: nls.localize('excludeFolderFromSearch', "Exclude Folder from Search"),
				original: 'Exclude Folder from Search'
			},
			category,
			menu: [
				{
					id: MenuId.SearchContext,
					group: 'search',
					order: 4,
					when: ContextKeyExpr.and(Constants.ResourceFolderFocusKey)
				}
			]
		});
	}
	async run(accessor: ServicesAccessor, folderMatch?: FolderMatchWithResource) {
		await searchWithFolderCommand(accessor, false, false, undefined, folderMatch);
	}
});

registerAction2(class RevealInSideBarForSearchResultsAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.RevealInSideBarForSearchResults,
			title: {
				value: nls.localize('revealInSideBar', "Reveal in Explorer View"),
				original: 'Reveal in Explorer View'
			},
			category,
			menu: [{
				id: MenuId.SearchContext,
				when: ContextKeyExpr.and(Constants.FileFocusKey, Constants.HasSearchResults),
				group: 'search_3',
				order: 1
			}]
		});

	}

	override async run(accessor: ServicesAccessor, args: any): Promise<any> {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const explorerService = accessor.get(IExplorerService);
		const contextService = accessor.get(IWorkspaceContextService);

		const searchView = getSearchView(accessor.get(IViewsService));
		if (!searchView) {
			return;
		}

		let fileMatch: FileMatch;
		if (!(args instanceof FileMatch)) {
			args = searchView.getControl().getFocus()[0];
		}
		if (args instanceof FileMatch) {
			fileMatch = args;
		} else {
			return;
		}

		paneCompositeService.openPaneComposite(VIEWLET_ID_FILES, ViewContainerLocation.Sidebar, false).then((viewlet) => {
			if (!viewlet) {
				return;
			}

			const explorerViewContainer = viewlet.getViewPaneContainer() as ExplorerViewPaneContainer;
			const uri = fileMatch.resource;
			if (uri && contextService.isInsideWorkspace(uri)) {
				const explorerView = explorerViewContainer.getExplorerView();
				explorerView.setExpanded(true);
				explorerService.select(uri, true).then(() => explorerView.focus(), onUnexpectedError);
			}
		});
	}
});

// Find in Files by default is the same as View: Show Search, but can be configured to open a search editor instead with the `search.mode` binding
registerAction2(class FindInFilesAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.FindInFilesActionId,
			title: {
				value: nls.localize('findInFiles', "Find in Files"),
				mnemonicTitle: nls.localize({ key: 'miFindInFiles', comment: ['&& denotes a mnemonic'] }, "Find &&in Files"),
				original: 'Find in Files'
			},
			description: {
				description: nls.localize('findInFiles.description', "Open a workspace search"),
				args: [
					{
						name: nls.localize('findInFiles.args', "A set of options for the search"),
						schema: {
							type: 'object',
							properties: {
								query: { 'type': 'string' },
								replace: { 'type': 'string' },
								preserveCase: { 'type': 'boolean' },
								triggerSearch: { 'type': 'boolean' },
								filesToInclude: { 'type': 'string' },
								filesToExclude: { 'type': 'string' },
								isRegex: { 'type': 'boolean' },
								isCaseSensitive: { 'type': 'boolean' },
								matchWholeWord: { 'type': 'boolean' },
								useExcludeSettingsAndIgnoreFiles: { 'type': 'boolean' },
								onlyOpenEditors: { 'type': 'boolean' },
							}
						}
					},
				]
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
			},
			menu: [{
				id: MenuId.MenubarEditMenu,
				group: '4_find_global',
				order: 1,
			}],
			f1: true
		});

	}

	override async run(accessor: ServicesAccessor, args: IFindInFilesArgs = {}): Promise<any> {
		findInFilesCommand(accessor, args);
	}
});

registerAction2(class FindInFolderAction extends Action2 {
	// from explorer
	constructor() {
		super({
			id: Constants.FindInFolderId,
			title: {
				value: nls.localize('findInFolder', "Find in Folder..."),
				original: 'Find in Folder...'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext),
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF,
			},
			menu: [
				{
					id: MenuId.ExplorerContext,
					group: '4_search',
					order: 10,
					when: ContextKeyExpr.and(ExplorerFolderContext)
				}
			]
		});
	}
	async run(accessor: ServicesAccessor, resource?: URI) {
		await searchWithFolderCommand(accessor, true, true, resource);
	}
});

registerAction2(class FindInWorkspaceAction extends Action2 {
	// from explorer
	constructor() {
		super({
			id: Constants.FindInWorkspaceId,
			title: {
				value: nls.localize('findInWorkspace', "Find in Workspace..."),
				original: 'Find in Workspace...'
			},
			category,
			menu: [
				{
					id: MenuId.ExplorerContext,
					group: '4_search',
					order: 10,
					when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext.toNegated())

				}
			]
		});
	}
	async run(accessor: ServicesAccessor) {
		const searchConfig = accessor.get(IConfigurationService).getValue<ISearchConfiguration>().search;
		const mode = searchConfig.mode;

		if (mode === 'view') {
			const searchView = await openSearchView(accessor.get(IViewsService), true);
			searchView?.searchInFolders();
		}
		else {
			return accessor.get(ICommandService).executeCommand(SearchEditorConstants.OpenEditorCommandId, {
				location: mode === 'newEditor' ? 'new' : 'reuse',
				filesToInclude: '',
			});
		}
	}
});

//#region Helpers
async function searchWithFolderCommand(accessor: ServicesAccessor, isFromExplorer: boolean, isIncludes: boolean, resource?: URI, folderMatch?: FolderMatchWithResource) {
	const listService = accessor.get(IListService);
	const fileService = accessor.get(IFileService);
	const viewsService = accessor.get(IViewsService);
	const contextService = accessor.get(IWorkspaceContextService);
	const commandService = accessor.get(ICommandService);
	const searchConfig = accessor.get(IConfigurationService).getValue<ISearchConfiguration>().search;
	const mode = searchConfig.mode;

	let resources: URI[];

	if (isFromExplorer) {
		resources = getMultiSelectedResources(resource, listService, accessor.get(IEditorService), accessor.get(IExplorerService));
	} else {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (!searchView) {
			return;
		}
		resources = getMultiSelectedSearchResources(searchView.getControl(), folderMatch, searchConfig);
	}

	const resolvedResources = fileService.resolveAll(resources.map(resource => ({ resource }))).then(results => {
		const folders: URI[] = [];
		results.forEach(result => {
			if (result.success && result.stat) {
				folders.push(result.stat.isDirectory ? result.stat.resource : dirname(result.stat.resource));
			}
		});
		return resolveResourcesForSearchIncludes(folders, contextService);
	});

	if (mode === 'view') {
		const searchView = await openSearchView(viewsService, true);
		if (resources && resources.length && searchView) {
			if (isIncludes) {
				searchView.searchInFolders(await resolvedResources);
			} else {
				searchView.searchOutsideOfFolders(await resolvedResources);
			}
		}
		return undefined;
	} else {
		if (isIncludes) {
			return commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, {
				filesToInclude: (await resolvedResources).join(', '),
				showIncludesExcludes: true,
				location: mode === 'newEditor' ? 'new' : 'reuse',
			});
		}
		else {
			return commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, {
				filesToExclude: (await resolvedResources).join(', '),
				showIncludesExcludes: true,
				location: mode === 'newEditor' ? 'new' : 'reuse',
			});
		}
	}
}

function getMultiSelectedSearchResources(viewer: WorkbenchCompressibleObjectTree<RenderableMatch, void>, currElement: RenderableMatch | undefined, sortConfig: ISearchConfigurationProperties): URI[] {
	return getElementsToOperateOn(viewer, currElement, sortConfig)
		.map((renderableMatch) => ((renderableMatch instanceof Match) ? null : renderableMatch.resource))
		.filter((renderableMatch): renderableMatch is URI => (renderableMatch !== null));
}

export async function findInFilesCommand(accessor: ServicesAccessor, _args: IFindInFilesArgs = {}) {

	const searchConfig = accessor.get(IConfigurationService).getValue<ISearchConfiguration>().search;
	const viewsService = accessor.get(IViewsService);
	const commandService = accessor.get(ICommandService);
	const args: IFindInFilesArgs = {};
	if (Object.keys(_args).length !== 0) {
		// resolve variables in the same way as in
		// https://github.com/microsoft/vscode/blob/8b76efe9d317d50cb5b57a7658e09ce6ebffaf36/src/vs/workbench/contrib/searchEditor/browser/searchEditorActions.ts#L152-L158
		const configurationResolverService = accessor.get(IConfigurationResolverService);
		const historyService = accessor.get(IHistoryService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot();
		const filteredActiveWorkspaceRootUri = activeWorkspaceRootUri?.scheme === Schemas.file || activeWorkspaceRootUri?.scheme === Schemas.vscodeRemote ? activeWorkspaceRootUri : undefined;
		const lastActiveWorkspaceRoot = filteredActiveWorkspaceRootUri ? workspaceContextService.getWorkspaceFolder(filteredActiveWorkspaceRootUri) ?? undefined : undefined;

		for (const entry of Object.entries(_args)) {
			const name = entry[0];
			const value = entry[1];
			if (value !== undefined) {
				(args as any)[name as any] = (typeof value === 'string') ? await configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, value) : value;
			}
		}
	}

	const mode = searchConfig.mode;
	if (mode === 'view') {
		openSearchView(viewsService, false).then(openedView => {
			if (openedView) {
				const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
				searchAndReplaceWidget.toggleReplace(typeof args.replace === 'string');
				let updatedText = false;
				if (typeof args.query !== 'string') {
					updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: typeof args.replace !== 'string' });
				}
				openedView.setSearchParameters(args);

				openedView.searchAndReplaceWidget.focus(undefined, updatedText, updatedText);
			}
		});
	} else {
		const convertArgs = (args: IFindInFilesArgs): OpenSearchEditorArgs => ({
			location: mode === 'newEditor' ? 'new' : 'reuse',
			query: args.query,
			filesToInclude: args.filesToInclude,
			filesToExclude: args.filesToExclude,
			matchWholeWord: args.matchWholeWord,
			isCaseSensitive: args.isCaseSensitive,
			isRegexp: args.isRegex,
			useExcludeSettingsAndIgnoreFiles: args.useExcludeSettingsAndIgnoreFiles,
			onlyOpenEditors: args.onlyOpenEditors,
			showIncludesExcludes: !!(args.filesToExclude || args.filesToExclude || !args.useExcludeSettingsAndIgnoreFiles),
		});
		commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, convertArgs(args));
	}
}
//#endregion
