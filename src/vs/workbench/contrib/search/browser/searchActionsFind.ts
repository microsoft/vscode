/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { dirname } from '../../../../base/common/resources.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IListService, WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import * as Constants from '../common/constants.js';
import * as SearchEditorConstants from '../../searchEditor/browser/constants.js';
import { FileMatch, FolderMatchWithResource, Match, RenderableMatch } from './searchModel.js';
import { OpenSearchEditorArgs } from '../../searchEditor/browser/searchEditor.contribution.js';
import { ISearchConfiguration, ISearchConfigurationProperties } from '../../../services/search/common/search.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { resolveResourcesForSearchIncludes } from '../../../services/search/common/queryBuilder.js';
import { getMultiSelectedResources, IExplorerService } from '../../files/browser/files.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ExplorerFolderContext, ExplorerRootContext, FilesExplorerFocusCondition, VIEWLET_ID as VIEWLET_ID_FILES } from '../../files/common/files.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ExplorerViewPaneContainer } from '../../files/browser/explorerViewlet.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { category, getElementsToOperateOn, getSearchView, openSearchView } from './searchActionsBase.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { Schemas } from '../../../../base/common/network.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';


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
	showIncludesExcludes?: boolean;
}
//#endregion

registerAction2(class RestrictSearchToFolderAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.RestrictSearchToFolderId,
			title: nls.localize2('restrictResultsToFolder', "Restrict Search to Folder"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ResourceFolderFocusKey),
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF,
			},
			menu: [
				{
					id: MenuId.SearchContext,
					group: 'search',
					order: 3,
					when: ContextKeyExpr.and(Constants.SearchContext.ResourceFolderFocusKey)
				}
			]
		});
	}
	async run(accessor: ServicesAccessor, folderMatch?: FolderMatchWithResource) {
		await searchWithFolderCommand(accessor, false, true, undefined, folderMatch);
	}
});


registerAction2(class ExpandSelectedTreeCommandAction extends Action2 {
	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.ExpandRecursivelyCommandId,
			title: nls.localize('search.expandRecursively', "Expand Recursively"),
			category,
			menu: [{
				id: MenuId.SearchContext,
				when: ContextKeyExpr.and(
					Constants.SearchContext.FolderFocusKey,
					Constants.SearchContext.HasSearchResults
				),
				group: 'search',
				order: 4
			}]
		});
	}

	override run(accessor: any) {
		expandSelectSubtree(accessor);
	}
});

registerAction2(class ExcludeFolderFromSearchAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.ExcludeFolderFromSearchId,
			title: nls.localize2('excludeFolderFromSearch', "Exclude Folder from Search"),
			category,
			menu: [
				{
					id: MenuId.SearchContext,
					group: 'search',
					order: 4,
					when: ContextKeyExpr.and(Constants.SearchContext.ResourceFolderFocusKey)
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
			id: Constants.SearchCommandIds.RevealInSideBarForSearchResults,
			title: nls.localize2('revealInSideBar', "Reveal in Explorer View"),
			category,
			menu: [{
				id: MenuId.SearchContext,
				when: ContextKeyExpr.and(Constants.SearchContext.FileFocusKey, Constants.SearchContext.HasSearchResults),
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
			id: Constants.SearchCommandIds.FindInFilesActionId,
			title: {
				...nls.localize2('findInFiles', "Find in Files"),
				mnemonicTitle: nls.localize({ key: 'miFindInFiles', comment: ['&& denotes a mnemonic'] }, "Find &&in Files"),
			},
			metadata: {
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
								showIncludesExcludes: { 'type': 'boolean' }
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
			id: Constants.SearchCommandIds.FindInFolderId,
			title: nls.localize2('findInFolder', "Find in Folder..."),
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
			id: Constants.SearchCommandIds.FindInWorkspaceId,
			title: nls.localize2('findInWorkspace', "Find in Workspace..."),
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
function expandSelectSubtree(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	if (searchView) {
		const viewer = searchView.getControl();
		const selected = viewer.getFocus()[0];
		viewer.expand(selected, true);
	}
}

async function searchWithFolderCommand(accessor: ServicesAccessor, isFromExplorer: boolean, isIncludes: boolean, resource?: URI, folderMatch?: FolderMatchWithResource) {
	const fileService = accessor.get(IFileService);
	const viewsService = accessor.get(IViewsService);
	const contextService = accessor.get(IWorkspaceContextService);
	const commandService = accessor.get(ICommandService);
	const searchConfig = accessor.get(IConfigurationService).getValue<ISearchConfiguration>().search;
	const mode = searchConfig.mode;

	let resources: URI[];

	if (isFromExplorer) {
		resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
	} else {
		const searchView = getSearchView(viewsService);
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
				if (typeof args.showIncludesExcludes === 'boolean') {
					openedView.toggleQueryDetails(false, args.showIncludesExcludes);
				}

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
