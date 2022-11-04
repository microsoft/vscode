/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ITreeNavigator } from 'vs/base/browser/ui/tree/tree';
import { dirname } from 'vs/base/common/resources';
import { createKeybinding, ResolvedKeybinding } from 'vs/base/common/keybindings';
import { isMacintosh, isWindows, OS } from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ICommandHandler, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { getSelectionKeyboardEvent, IListService, WorkbenchCompressibleObjectTree, WorkbenchListFocusContextKey } from 'vs/platform/list/browser/listService';
import { IViewsService, ViewContainerLocation } from 'vs/workbench/common/views';
import { searchClearIcon, searchCollapseAllIcon, searchExpandAllIcon, searchRefreshIcon, searchRemoveIcon, searchReplaceIcon, searchShowAsList, searchShowAsTree, searchStopIcon } from 'vs/workbench/contrib/search/browser/searchIcons';
import { SearchView } from 'vs/workbench/contrib/search/browser/searchView';
import * as Constants from 'vs/workbench/contrib/search/common/constants';
import * as SearchEditorConstants from 'vs/workbench/contrib/searchEditor/browser/constants';
import { IReplaceService } from 'vs/workbench/contrib/search/common/replace';
import { ISearchHistoryService } from 'vs/workbench/contrib/search/common/searchHistoryService';
import { arrayContainsElementOrParent, FileMatch, FileMatchOrMatch, FolderMatch, FolderMatchNoRoot, FolderMatchWithResource, FolderMatchWorkspaceRoot, Match, RenderableMatch, searchComparer, searchMatchComparer, SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { SearchEditor } from 'vs/workbench/contrib/searchEditor/browser/searchEditor';
import { OpenSearchEditorArgs } from 'vs/workbench/contrib/searchEditor/browser/searchEditor.contribution';
import { SearchEditorInput } from 'vs/workbench/contrib/searchEditor/browser/searchEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ISearchConfiguration, ISearchConfigurationProperties, VIEW_ID } from 'vs/workbench/services/search/common/search';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { URI } from 'vs/base/common/uri';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { assertIsDefined, assertType } from 'vs/base/common/types';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { resolveResourcesForSearchIncludes } from 'vs/workbench/services/search/common/queryBuilder';
import { getMultiSelectedResources, IExplorerService } from 'vs/workbench/contrib/files/browser/files';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExplorerFolderContext, ExplorerRootContext, FilesExplorerFocusCondition, VIEWLET_ID as VIEWLET_ID_FILES } from 'vs/workbench/contrib/files/common/files';
import { getWorkspaceSymbols, IWorkspaceSymbol, SearchStateKey, SearchUIState } from 'vs/workbench/contrib/search/common/search';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ExplorerViewPaneContainer } from 'vs/workbench/contrib/files/browser/explorerViewlet';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from 'vs/editor/contrib/find/browser/findModel';

/** INTERFACES */
interface ISearchActionContext {
	readonly viewer: WorkbenchCompressibleObjectTree<RenderableMatch>;
}

export interface IMatchActionContext extends ISearchActionContext {
	readonly element: Match;
}

export interface IFileMatchActionContext extends ISearchActionContext {
	readonly element: FileMatch;
}

export interface IFolderMatchActionContext extends ISearchActionContext {
	readonly element: FolderMatch;
}

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

/** ACTIONS */

/** ACTIONS: REPLACE/REMOVE RESULTS */

export class RemoveAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.RemoveActionId,
			title: {
				value: nls.localize('RemoveAction.label', "Dismiss"),
				original: 'Dismiss'
			},
			category,
			icon: searchRemoveIcon,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.FileMatchOrMatchFocusKey),
				primary: KeyCode.Delete,
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				},
			},
			menu: [
				{
					id: MenuId.SearchContext,
					when: Constants.FileMatchOrMatchFocusKey,
					group: 'search',
					order: 2,
				},
				{
					id: MenuId.SearchFolderMatchContext,
					group: 'inline',
					order: 2,
				},
				{
					id: MenuId.SearchFileMatchContext,
					group: 'inline',
					order: 2,
				},
				{
					id: MenuId.SearchMatchContext,
					group: 'inline',
					order: 2,
				}
			]
		});
	}

	run(accessor: ServicesAccessor, context: IMatchActionContext | IFileMatchActionContext | IFolderMatchActionContext | undefined): void {
		const viewsService = accessor.get(IViewsService);
		const configurationService = accessor.get(IConfigurationService);
		const searchView = getSearchView(viewsService);

		if (!searchView) {
			return;
		}

		let element = context?.element;
		let viewer = context?.viewer;
		if (!viewer) {
			viewer = searchView.getControl();
		}
		if (!element) {
			element = viewer.getFocus()[0] ?? undefined;
		}

		const opInfo = getElementsToOperateOnInfo(viewer, element, configurationService.getValue<ISearchConfigurationProperties>('search'));
		const elementsToRemove = opInfo.elements;
		let focusElement = viewer.getFocus()[0] ?? undefined;

		if (elementsToRemove.length === 0) {
			return;
		}

		if (!focusElement || (focusElement instanceof SearchResult)) {
			focusElement = element;
		}

		let nextFocusElement;
		if (opInfo.mustReselect && focusElement) {
			nextFocusElement = getElementToFocusAfterRemoved(viewer, focusElement, elementsToRemove);
		}

		const searchResult = searchView.searchResult;

		if (searchResult) {
			searchResult.batchRemove(elementsToRemove);
		}

		if (opInfo.mustReselect && focusElement) {
			if (!nextFocusElement) {
				nextFocusElement = getLastNodeFromSameType(viewer, focusElement);
			}

			if (nextFocusElement && !arrayContainsElementOrParent(nextFocusElement, elementsToRemove)) {
				viewer.reveal(nextFocusElement);
				viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
				viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());
			}
		}

		viewer.domFocus();
		return;
	}
}

export class ReplaceAction extends Action2 {
	constructor(
	) {
		super({
			id: Constants.ReplaceActionId,
			title: {
				value: nls.localize('match.replace.label', "Replace"),
				original: 'Replace'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ReplaceActiveKey, Constants.MatchFocusKey),
				primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Digit1,
			},
			icon: searchReplaceIcon,
			menu: [
				{
					id: MenuId.SearchContext,
					when: ContextKeyExpr.and(Constants.ReplaceActiveKey, Constants.MatchFocusKey),
					group: 'search',
					order: 1
				},
				{
					id: MenuId.SearchMatchContext,
					when: Constants.ReplaceActiveKey,
					group: 'inline',
					order: 1
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, context: IMatchActionContext | undefined): Promise<any> {
		return performReplace(accessor, context);
	}
}

export class ReplaceAllAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.ReplaceAllInFileActionId,
			title: {
				value: nls.localize('file.replaceAll.label', "Replace All"),
				original: 'Replace All'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ReplaceActiveKey, Constants.FileFocusKey),
				primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Digit1,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter],
			},
			icon: searchReplaceIcon,
			menu: [
				{
					id: MenuId.SearchContext,
					when: ContextKeyExpr.and(Constants.ReplaceActiveKey, Constants.FileFocusKey),
					group: 'search',
					order: 1
				},
				{
					id: MenuId.SearchFileMatchContext,
					when: Constants.ReplaceActiveKey,
					group: 'inline',
					order: 1
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, context: IFileMatchActionContext | undefined): Promise<any> {
		return performReplace(accessor, context);
	}
}

export class ReplaceAllInFolderAction extends Action2 {
	constructor(
	) {
		super({
			id: Constants.ReplaceAllInFolderActionId,
			title: {
				value: nls.localize('file.replaceAll.label', "Replace All"),
				original: 'Replace All'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ReplaceActiveKey, Constants.FolderFocusKey),
				primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Digit1,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter],
			},
			icon: searchReplaceIcon,
			menu: [
				{
					id: MenuId.SearchContext,
					when: ContextKeyExpr.and(Constants.ReplaceActiveKey, Constants.FolderFocusKey),
					group: 'search',
					order: 1
				},
				{
					id: MenuId.SearchFolderMatchContext,
					when: Constants.ReplaceActiveKey,
					group: 'inline',
					order: 1
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, context: IFolderMatchActionContext | undefined): Promise<any> {
		return performReplace(accessor, context);
	}
}

/** ACTIONS: TOP ACTIONBAR ICON ACTIONS */

export class ClearSearchHistoryCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.ClearSearchHistoryCommandId,
			title: {
				value: nls.localize('clearSearchHistoryLabel', "Clear Search History"),
				original: 'Clear Search History'
			},
			category: category,
			f1: true
		});

	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		clearHistoryCommand(accessor);
	}
}

export class CancelSearchAction extends Action2 {
	constructor() {
		super({
			id: Constants.CancelSearchActionId,
			title: {
				value: nls.localize('CancelSearchAction.label', "Cancel Search"),
				original: 'Cancel Search'
			},
			icon: searchStopIcon,
			category,
			f1: true,
			precondition: SearchStateKey.isEqualTo(SearchUIState.Idle).negate(),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, WorkbenchListFocusContextKey),
				primary: KeyCode.Escape,
			},
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), SearchStateKey.isEqualTo(SearchUIState.SlowSearch)),
			}]
		});
	}
	run(accessor: ServicesAccessor) {
		return cancelSearch(accessor);
	}
}

export class RefreshAction extends Action2 {
	constructor() {
		super({
			id: Constants.RefreshSearchResultsActionId,
			title: {
				value: nls.localize('RefreshAction.label', "Refresh"),
				original: 'Refresh'
			},
			icon: searchRefreshIcon,
			precondition: Constants.ViewHasSearchPatternKey,
			category,
			f1: true,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), SearchStateKey.isEqualTo(SearchUIState.SlowSearch).negate()),
			}]
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		return refreshSearch(accessor);
	}
}

export class CollapseDeepestExpandedLevelAction extends Action2 {
	constructor() {
		super({
			id: Constants.CollapseSearchResultsActionId,
			title: {
				value: nls.localize('CollapseDeepestExpandedLevelAction.label', "Collapse All"),
				original: 'Collapse All'
			},
			category,
			icon: searchCollapseAllIcon,
			f1: true,
			precondition: ContextKeyExpr.and(Constants.HasSearchResults, Constants.ViewHasSomeCollapsibleKey),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), ContextKeyExpr.or(Constants.HasSearchResults.negate(), Constants.ViewHasSomeCollapsibleKey)),
			}]
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		return collapseDeepestExpandedLevel(accessor);
	}
}

export class ExpandAllAction extends Action2 {
	constructor() {
		super({
			id: Constants.ExpandSearchResultsActionId,
			title: {
				value: nls.localize('ExpandAllAction.label', "Expand All"),
				original: 'Expand All'
			},
			category,
			icon: searchExpandAllIcon,
			f1: true,
			precondition: ContextKeyExpr.and(Constants.HasSearchResults, Constants.ViewHasSomeCollapsibleKey.toNegated()),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), Constants.HasSearchResults, Constants.ViewHasSomeCollapsibleKey.toNegated()),
			}]
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		return expandAll(accessor);
	}
}

export class ClearSearchResultsAction extends Action2 {
	constructor() {
		super({
			id: Constants.ClearSearchResultsActionId,
			title: {
				value: nls.localize('ClearSearchResultsAction.label', "Clear Search Results"),
				original: 'Clear Search Results'
			},
			category,
			icon: searchClearIcon,
			f1: true,
			precondition: ContextKeyExpr.or(Constants.HasSearchResults, Constants.ViewHasSearchPatternKey, Constants.ViewHasReplacePatternKey, Constants.ViewHasFilePatternKey),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.equals('view', VIEW_ID),
			}]
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		return clearSearchResults(accessor);
	}
}


/** ACTIONS: FIND IN... */

// Find in Files by default is the same as View: Show Search, but can be configured to open a search editor instead with the `search.mode` binding
export class FindInFilesAction extends Action2 {

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
			category: category,
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
		FindInFilesCommand(accessor, args);
	}
}

export class FindInFolderAction extends Action2 {
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
	run(accessor: ServicesAccessor, resource?: URI) {
		searchWithFolderCommand(accessor, true, true, resource);
	}
}

export class FindInWorkspaceAction extends Action2 {
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
}

/** ACTIONS: ADDITIONAL CONTEXT MENU ACTIONS */

export class RestrictSearchToFolderAction extends Action2 {
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
	run(accessor: ServicesAccessor, folderMatch?: FolderMatchWithResource) {
		searchWithFolderCommand(accessor, false, true, undefined, folderMatch);
	}
}

export class ExcludeFolderFromSearchAction extends Action2 {
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
	run(accessor: ServicesAccessor, folderMatch?: FolderMatchWithResource) {
		searchWithFolderCommand(accessor, false, false, undefined, folderMatch);
	}
}

export class RevealInSideBarForSearchResultsAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.RevealInSideBarForSearchResults,
			title: {
				value: nls.localize('revealInSideBar', "Reveal in Explorer View"),
				original: 'Reveal in Explorer View'
			},
			category: category,
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
}

/** ACTIONS: CHANGING SEARCH INPUT OPTIONS */

export class ToggleQueryDetailsAction extends Action2 {
	constructor() {
		super({
			id: Constants.ToggleQueryDetailsActionId,
			title: {
				value: nls.localize('ToggleQueryDetailsAction.label', "Toggle Query Details"),
				original: 'Toggle Query Details'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.or(Constants.SearchViewFocusedKey, SearchEditorConstants.InSearchEditor),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyJ,
			},
		});
	}
	run(accessor: ServicesAccessor) {
		const contextService = accessor.get(IContextKeyService).getContext(document.activeElement);
		if (contextService.getValue(SearchEditorConstants.InSearchEditor.serialize())) {
			(accessor.get(IEditorService).activeEditorPane as SearchEditor).toggleQueryDetails();
		} else if (contextService.getValue(Constants.SearchViewFocusedKey.serialize())) {
			const searchView = getSearchView(accessor.get(IViewsService));
			assertIsDefined(searchView).toggleQueryDetails();
		}
	}
}

export class CloseReplaceAction extends Action2 {
	constructor() {
		super({
			id: Constants.CloseReplaceWidgetActionId,
			title: {
				value: nls.localize('CloseReplaceWidget.label', "Close Replace Widget"),
				original: 'Close Replace Widget'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.ReplaceInputBoxFocusedKey),
				primary: KeyCode.Escape,
			},
		});
	}
	run(accessor: ServicesAccessor) {

		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			searchView.searchAndReplaceWidget.toggleReplace(false);
			searchView.searchAndReplaceWidget.focus();
		}
		return Promise.resolve(null);
	}
}
export class ToggleCaseSensitiveCommandAction extends Action2 {

	constructor(
	) {

		super({
			id: Constants.ToggleCaseSensitiveCommandId,
			title: {
				value: nls.localize('ToggleCaseSensitiveCommandId.label', "Toggle Case Sensitive"),
				original: 'Toggle Case Sensitive'
			},
			category: category,
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: isMacintosh ? ContextKeyExpr.and(Constants.SearchViewFocusedKey, Constants.FileMatchOrFolderMatchFocusKey.toNegated()) : Constants.SearchViewFocusedKey,
			}, ToggleCaseSensitiveKeybinding)

		});

	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		toggleCaseSensitiveCommand(accessor);
	}
}

export class ToggleWholeWordCommandAction extends Action2 {
	constructor() {
		super({
			id: Constants.ToggleWholeWordCommandId,
			title: {
				value: nls.localize('ToggleWholeWordCommandId.label', 'Toggle Whole Word'),
				original: 'Toggle Whole Word'
			},
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchViewFocusedKey,
			}, ToggleWholeWordKeybinding),
			category: category.value,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return toggleWholeWordCommand(accessor);
	}
}

export class ToggleRegexCommandAction extends Action2 {
	constructor() {
		super({
			id: Constants.ToggleRegexCommandId,
			title: {
				value: nls.localize('ToggleRegexCommandId.label', 'Toggle Regex'),
				original: 'Toggle Regex'
			},
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchViewFocusedKey,
			}, ToggleRegexKeybinding),
			category: category.value,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return toggleRegexCommand(accessor);
	}
}

export class TogglePreserveCaseAction extends Action2 {
	constructor() {
		super({
			id: Constants.TogglePreserveCaseId,
			title: {
				value: nls.localize('TogglePreserveCaseId.label', 'Toggle Preserve Case'),
				original: 'Toggle Preserve Case'
			},
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchViewFocusedKey,
			}, TogglePreserveCaseKeybinding),
			category: category.value,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return togglePreserveCaseCommand(accessor);
	}
}


/** ACTIONS: OPENING MATCHES */
export class OpenMatchAction extends Action2 {
	constructor() {
		super({
			id: Constants.OpenMatch,
			title: {
				value: nls.localize('OpenMatch.label', "Open Match"),
				original: 'Open Match'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.FileMatchOrMatchFocusKey),
				primary: KeyCode.Enter,
				mac: {
					primary: KeyCode.Enter,
					secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
				},
			},
		});
	}
	run(accessor: ServicesAccessor) {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			const tree: WorkbenchCompressibleObjectTree<RenderableMatch> = searchView.getControl();
			const viewer = searchView.getControl();
			const focus = tree.getFocus()[0];

			if (focus instanceof FolderMatch) {
				viewer.toggleCollapsed(focus);
			} else {
				searchView.open(<FileMatchOrMatch>tree.getFocus()[0], false, false, true);
			}
		}
	}
}

export class OpenMatchToSideAction extends Action2 {
	constructor() {
		super({
			id: Constants.OpenMatchToSide,
			title: {
				value: nls.localize('OpenMatchToSide.label', "Open Match To Side"),
				original: 'Open Match To Side'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.FileMatchOrMatchFocusKey),
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.Enter
				},
			},
		});
	}
	run(accessor: ServicesAccessor) {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			const tree: WorkbenchCompressibleObjectTree<RenderableMatch> = searchView.getControl();
			searchView.open(<FileMatchOrMatch>tree.getFocus()[0], false, true, true);
		}
	}
}

export class AddCursorsAtSearchResultsAction extends Action2 {
	constructor() {
		super({
			id: Constants.AddCursorsAtSearchResults,
			title: {
				value: nls.localize('AddCursorsAtSearchResults.label', 'Add Cursors at Search Results'),
				original: 'Add Cursors at Search Results'
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.FileMatchOrMatchFocusKey),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
			},
			category: category.value,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			const tree: WorkbenchCompressibleObjectTree<RenderableMatch> = searchView.getControl();
			searchView.openEditorWithMultiCursor(<FileMatchOrMatch>tree.getFocus()[0]);
		}
	}
}
/** ACTIONS: TOGGLING FOCUS */

export class FocusNextInputAction extends Action2 {
	constructor() {
		super({
			id: Constants.FocusNextInputActionId,
			title: {
				value: nls.localize('FocusNextInputAction.label', "Focus Next Input"),
				original: 'Focus Next Input'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.or(
					ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.InputBoxFocusedKey),
					ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.InputBoxFocusedKey)),
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		const editorService = accessor.get(IEditorService);
		const input = editorService.activeEditor;
		if (input instanceof SearchEditorInput) {
			// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
			(editorService.activeEditorPane as SearchEditor).focusNextInput();
		}

		const searchView = getSearchView(accessor.get(IViewsService));
		searchView?.focusNextInputBox();
	}
}

export class FocusPreviousInputAction extends Action2 {
	constructor() {
		super({
			id: Constants.FocusPreviousInputActionId,
			title: {
				value: nls.localize('FocusPreviousInputAction.label', "Focus Previous Input"),
				original: 'Focus Previous Input'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.or(
					ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.InputBoxFocusedKey),
					ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.InputBoxFocusedKey, Constants.SearchInputBoxFocusedKey.toNegated())),
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		const editorService = accessor.get(IEditorService);
		const input = editorService.activeEditor;
		if (input instanceof SearchEditorInput) {
			// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
			(editorService.activeEditorPane as SearchEditor).focusPrevInput();
		}

		const searchView = getSearchView(accessor.get(IViewsService));
		searchView?.focusPreviousInputBox();
	}
}

export class FocusSearchFromResultsAction extends Action2 {
	constructor() {
		super({
			id: Constants.FocusSearchFromResults,
			title: {
				value: nls.localize('FocusSearchFromResults.label', "Focus Search From Results"),
				original: 'Focus Search From Results'
			},
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, Constants.FirstMatchFocusKey),
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
			},
		});
	}
	run(accessor: ServicesAccessor) {
		const searchView = getSearchView(accessor.get(IViewsService));
		searchView?.focusPreviousInputBox();
	}
}

export class ToggleSearchOnTypeAction extends Action2 {
	private static readonly searchOnTypeKey = 'search.searchOnType';

	constructor(
	) {
		super({
			id: Constants.ToggleSearchOnTypeActionId,
			title: {
				value: nls.localize('toggleTabs', 'Toggle Search on Type'),
				original: 'Toggle Search on Type'
			},
			category: category.value,
		});

	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		const configurationService = accessor.get(IConfigurationService);
		const searchOnType = configurationService.getValue<boolean>(ToggleSearchOnTypeAction.searchOnTypeKey);
		return configurationService.updateValue(ToggleSearchOnTypeAction.searchOnTypeKey, !searchOnType);
	}
}

export class FocusSearchListCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.FocusSearchListCommandID,
			title: {
				value: nls.localize('focusSearchListCommandLabel', "Focus List"),
				original: 'Focus List'
			},
			category: category,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		focusSearchListCommand(accessor);
	}
}

export class FocusNextSearchResultAction extends Action2 {
	constructor() {
		super({
			id: Constants.FocusNextSearchResultActionId,
			title: {
				value: nls.localize('FocusNextSearchResult.label', 'Focus Next Search Result'),
				original: 'Focus Next Search Result'
			},
			keybinding: [{
				primary: KeyCode.F4,
				weight: KeybindingWeight.WorkbenchContrib,
			}],
			category: category.value,

			precondition: ContextKeyExpr.or(Constants.HasSearchResults, SearchEditorConstants.InSearchEditor),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return focusNextSearchResult(accessor);
	}
}

export class FocusPreviousSearchResultAction extends Action2 {
	constructor() {
		super({
			id: Constants.FocusPreviousSearchResultActionId,
			title: {
				value: nls.localize('FocusPreviousSearchResult.label', 'Search: Focus Previous Search Result'),
				original: 'Search: Focus Previous Search Result'
			},
			keybinding: [{
				primary: KeyMod.Shift | KeyCode.F4,
				weight: KeybindingWeight.WorkbenchContrib,
			}],
			category: category.value,

			precondition: ContextKeyExpr.or(Constants.HasSearchResults, SearchEditorConstants.InSearchEditor),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return focusPreviousSearchResult(accessor);
	}
}

export class ReplaceInFilesAction extends Action2 {
	constructor() {
		super({
			id: Constants.ReplaceInFilesActionId,
			title: {
				value: nls.localize('replaceInFiles', 'Search: Replace in Files'),
				original: 'Search: Replace in Files'
			},
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH,
				weight: KeybindingWeight.WorkbenchContrib,
			}],
			category: category.value,
			menu: [{
				id: MenuId.MenubarEditMenu,
				group: '4_find_global',
				order: 2
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return findOrReplaceInFiles(accessor, true);
	}
}

/** ACTIONS: TREE TOGGLE */

export class ViewAsTreeAction extends Action2 {
	constructor() {
		super({
			id: Constants.ViewAsTreeActionId,
			title: {
				value: nls.localize('ViewAsTreeAction.label', "View as Tree"),
				original: 'View as Tree'
			},
			category,
			icon: searchShowAsList,
			f1: true,
			precondition: ContextKeyExpr.and(Constants.HasSearchResults, Constants.InTreeViewKey.toNegated()),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), Constants.InTreeViewKey.toNegated()),
			}]
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			searchView.setTreeView(true);
		}
	}
}

export class ViewAsListAction extends Action2 {
	constructor() {
		super({
			id: Constants.ViewAsListActionId,
			title: {
				value: nls.localize('ViewAsListAction.label', "View as List"),
				original: 'View as List'
			},
			category,
			icon: searchShowAsTree,
			f1: true,
			precondition: ContextKeyExpr.and(Constants.HasSearchResults, Constants.InTreeViewKey),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), Constants.InTreeViewKey),
			}]
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			searchView.setTreeView(false);
		}
	}
}

/** ACTIONS: COPY COMMANDS */

export class CopyMatchCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.CopyMatchCommandId,
			title: {
				value: nls.localize('copyMatchLabel', "Copy"),
				original: 'Copy'
			},
			category: category.value,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.FileMatchOrMatchFocusKey,
				primary: KeyMod.CtrlCmd | KeyCode.KeyC,
			},
			menu: [{
				id: MenuId.SearchContext,
				when: Constants.FileMatchOrMatchFocusKey,
				group: 'search_2',
				order: 1
			}]
		});

	}

	override async run(accessor: ServicesAccessor, match: RenderableMatch | undefined): Promise<any> {
		copyMatchCommand(accessor, match);
	}
}

export class CopyPathCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.CopyPathCommandId,
			title: {
				value: nls.localize('copyPathLabel', "Copy Path"),
				original: 'Copy Path'
			},
			category: category.value,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.FileMatchOrFolderMatchWithResourceFocusKey,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
				win: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC
				},
			},
			menu: [{
				id: MenuId.SearchContext,
				when: Constants.FileMatchOrFolderMatchWithResourceFocusKey,
				group: 'search_2',
				order: 2
			}]
		});

	}

	override async run(accessor: ServicesAccessor, fileMatch: FileMatch | FolderMatchWithResource | undefined): Promise<any> {
		copyPathCommand(accessor, fileMatch);
	}
}

export class CopyAllCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.CopyAllCommandId,
			title: {
				value: nls.localize('copyAllLabel', "Copy All"),
				original: 'Copy All'
			},
			category: category.value,
			menu: [{
				id: MenuId.SearchContext,
				when: Constants.HasSearchResults,
				group: 'search_2',
				order: 3
			}]
		});

	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		copyAllCommand(accessor);
	}
}

/** ACTIONS: SYMBOL ACTIONS */

export class ShowAllSymbolsAction extends Action2 {

	static readonly ID = 'workbench.action.showAllSymbols';
	static readonly LABEL = nls.localize('showTriggerActions', "Go to Symbol in Workspace...");
	static readonly ALL_SYMBOLS_PREFIX = '#';

	constructor(
	) {
		super({
			id: Constants.ShowAllSymbolsActionId,
			title: {
				value: nls.localize('showTriggerActions', "Go to Symbol in Workspace..."),
				original: 'Go to Symbol in Workspace...',
				mnemonicTitle: nls.localize({ key: 'miGotoSymbolInWorkspace', comment: ['&& denotes a mnemonic'] }, "Go to Symbol in &&Workspace...")
			},
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyT
			},
			menu: {
				id: MenuId.MenubarGoMenu,
				group: '3_global_nav',
				order: 2
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IQuickInputService).quickAccess.show(ShowAllSymbolsAction.ALL_SYMBOLS_PREFIX);
	}
}

export class ExecuteWorkspaceSymbolProviderAction extends Action2 {
	constructor() {
		super({
			id: Constants.ExecuteWorkspaceSymbolProviderID,
			title: {
				value: nls.localize('ExecuteWorkspaceSymbolProviderID.label', 'Execute Workspace Symbol Provider'),
				original: 'Execute Workspace Symbol Provider'
			},
			category: category.value,
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<IWorkspaceSymbol[]> {
		const [query] = args;
		assertType(typeof query === 'string');
		const result = await getWorkspaceSymbols(query);
		return result.map(item => item.symbol);
	}
}

/** EXPORTED FUNCTIONS */
export function isSearchViewFocused(viewsService: IViewsService): boolean {
	const searchView = getSearchView(viewsService);
	const activeElement = document.activeElement;
	return !!(searchView && activeElement && DOM.isAncestor(activeElement, searchView.getContainer()));
}

export function appendKeyBindingLabel(label: string, inputKeyBinding: number | ResolvedKeybinding | undefined, keyBindingService2: IKeybindingService): string {
	if (typeof inputKeyBinding === 'number') {
		const keybinding = createKeybinding(inputKeyBinding, OS);
		if (keybinding) {
			const resolvedKeybindings = keyBindingService2.resolveKeybinding(keybinding);
			return doAppendKeyBindingLabel(label, resolvedKeybindings.length > 0 ? resolvedKeybindings[0] : undefined);
		}
		return doAppendKeyBindingLabel(label, undefined);
	} else {
		return doAppendKeyBindingLabel(label, inputKeyBinding);
	}
}

export function getSearchView(viewsService: IViewsService): SearchView | undefined {
	return viewsService.getActiveViewWithId(VIEW_ID) as SearchView ?? undefined;
}

/**
 * Returns element to focus after removing the given element
 */
export function getElementToFocusAfterRemoved(viewer: WorkbenchCompressibleObjectTree<RenderableMatch>, element: RenderableMatch, elementsToRemove: RenderableMatch[]): RenderableMatch | undefined {
	const navigator: ITreeNavigator<any> = viewer.navigate(element);
	if (element instanceof FolderMatch) {
		while (!!navigator.next() && (!(navigator.current() instanceof FolderMatch) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) { }
	} else if (element instanceof FileMatch) {
		while (!!navigator.next() && (!(navigator.current() instanceof FileMatch) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) {
			viewer.expand(navigator.current());
		}
	} else {
		while (navigator.next() && (!(navigator.current() instanceof Match) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) {
			viewer.expand(navigator.current());
		}
	}
	return navigator.current();
}

/***
 * Finds the last element in the tree with the same type as `element`
 */
export function getLastNodeFromSameType(viewer: WorkbenchCompressibleObjectTree<RenderableMatch>, element: RenderableMatch): RenderableMatch | undefined {
	let lastElem: RenderableMatch | null = viewer.lastVisibleElement ?? null;

	while (lastElem) {
		const compareVal = compareLevels(element, lastElem);
		if (compareVal === -1) {
			viewer.expand(lastElem);
			lastElem = viewer.lastVisibleElement;
		} else if (compareVal === 1) {
			lastElem = viewer.getParentElement(lastElem);
		} else {
			return lastElem;
		}
	}

	return undefined;
}

export function FindInFilesCommand(accessor: ServicesAccessor, args: IFindInFilesArgs = {}) {
	const searchConfig = accessor.get(IConfigurationService).getValue<ISearchConfiguration>().search;
	const mode = searchConfig.mode;
	if (mode === 'view') {
		const viewsService = accessor.get(IViewsService);
		openSearchView(viewsService, false).then(openedView => {
			if (openedView) {
				const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
				searchAndReplaceWidget.toggleReplace(typeof args.replace === 'string');
				let updatedText = false;
				if (typeof args.query === 'string') {
					openedView.setSearchParameters(args);
				} else {
					updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: typeof args.replace !== 'string' });
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
		accessor.get(ICommandService).executeCommand(SearchEditorConstants.OpenEditorCommandId, convertArgs(args));
	}
}

/** HELPERS */
const category = { value: nls.localize('search', "Search"), original: 'Search' };

const lineDelimiter = isWindows ? '\r\n' : '\n';

function toggleCaseSensitiveCommand(accessor: ServicesAccessor) {
	const searchView = getSearchView(accessor.get(IViewsService));
	searchView?.toggleCaseSensitive();
}

function toggleWholeWordCommand(accessor: ServicesAccessor) {
	const searchView = getSearchView(accessor.get(IViewsService));
	searchView?.toggleWholeWords();
}

function toggleRegexCommand(accessor: ServicesAccessor) {
	const searchView = getSearchView(accessor.get(IViewsService));
	searchView?.toggleRegex();
}

function togglePreserveCaseCommand(accessor: ServicesAccessor) {
	const searchView = getSearchView(accessor.get(IViewsService));
	searchView?.togglePreserveCase();
}

async function copyPathCommand(accessor: ServicesAccessor, fileMatch: FileMatch | FolderMatchWithResource | undefined) {
	if (!fileMatch) {
		const selection = getSelectedRow(accessor);
		if (!(selection instanceof FileMatch || selection instanceof FolderMatchWithResource)) {
			return;
		}

		fileMatch = selection;
	}

	const clipboardService = accessor.get(IClipboardService);
	const labelService = accessor.get(ILabelService);

	const text = labelService.getUriLabel(fileMatch.resource, { noPrefix: true });
	await clipboardService.writeText(text);
}

async function copyMatchCommand(accessor: ServicesAccessor, match: RenderableMatch | undefined) {
	if (!match) {
		const selection = getSelectedRow(accessor);
		if (!selection) {
			return;
		}

		match = selection;
	}

	const clipboardService = accessor.get(IClipboardService);
	const labelService = accessor.get(ILabelService);

	let text: string | undefined;
	if (match instanceof Match) {
		text = matchToString(match);
	} else if (match instanceof FileMatch) {
		text = fileMatchToString(match, labelService).text;
	} else if (match instanceof FolderMatch) {
		text = folderMatchToString(match, labelService).text;
	}

	if (text) {
		await clipboardService.writeText(text);
	}
}

async function copyAllCommand(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const clipboardService = accessor.get(IClipboardService);
	const labelService = accessor.get(ILabelService);

	const searchView = getSearchView(viewsService);
	if (searchView) {
		const root = searchView.searchResult;

		const text = allFolderMatchesToString(root.folderMatches(), labelService);
		await clipboardService.writeText(text);
	}
}

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

function openSearchView(viewsService: IViewsService, focus?: boolean): Promise<SearchView | undefined> {
	return viewsService.openView(VIEW_ID, focus).then(view => (view as SearchView ?? undefined));
}

function doAppendKeyBindingLabel(label: string, keyBinding: ResolvedKeybinding | undefined): string {
	return keyBinding ? label + ' (' + keyBinding.getLabel() + ')' : label;
}

function matchToString(match: Match, indent = 0): string {
	const getFirstLinePrefix = () => `${match.range().startLineNumber},${match.range().startColumn}`;
	const getOtherLinePrefix = (i: number) => match.range().startLineNumber + i + '';

	const fullMatchLines = match.fullPreviewLines();
	const largestPrefixSize = fullMatchLines.reduce((largest, _, i) => {
		const thisSize = i === 0 ?
			getFirstLinePrefix().length :
			getOtherLinePrefix(i).length;

		return Math.max(thisSize, largest);
	}, 0);

	const formattedLines = fullMatchLines
		.map((line, i) => {
			const prefix = i === 0 ?
				getFirstLinePrefix() :
				getOtherLinePrefix(i);

			const paddingStr = ' '.repeat(largestPrefixSize - prefix.length);
			const indentStr = ' '.repeat(indent);
			return `${indentStr}${prefix}: ${paddingStr}${line}`;
		});

	return formattedLines.join('\n');
}

function fileFolderMatchToString(match: FileMatch | FolderMatch | FolderMatchWithResource, labelService: ILabelService): { text: string; count: number } {
	if (match instanceof FileMatch) {
		return fileMatchToString(match, labelService);
	} else {
		return folderMatchToString(match, labelService);
	}
}

function fileMatchToString(fileMatch: FileMatch, labelService: ILabelService): { text: string; count: number } {
	const matchTextRows = fileMatch.matches()
		.sort(searchMatchComparer)
		.map(match => matchToString(match, 2));
	const uriString = labelService.getUriLabel(fileMatch.resource, { noPrefix: true });
	return {
		text: `${uriString}${lineDelimiter}${matchTextRows.join(lineDelimiter)}`,
		count: matchTextRows.length
	};
}

function folderMatchToString(folderMatch: FolderMatchWithResource | FolderMatch, labelService: ILabelService): { text: string; count: number } {
	const results: string[] = [];
	let numMatches = 0;

	const matches = folderMatch.matches().sort(searchMatchComparer);

	matches.forEach(match => {
		const result = fileFolderMatchToString(match, labelService);
		numMatches += result.count;
		results.push(result.text);
	});

	return {
		text: results.join(lineDelimiter + lineDelimiter),
		count: numMatches
	};
}

function allFolderMatchesToString(folderMatches: Array<FolderMatchWithResource | FolderMatch>, labelService: ILabelService): string {
	const folderResults: string[] = [];
	folderMatches = folderMatches.sort(searchMatchComparer);
	for (let i = 0; i < folderMatches.length; i++) {
		const folderResult = folderMatchToString(folderMatches[i], labelService);
		if (folderResult.count) {
			folderResults.push(folderResult.text);
		}
	}

	return folderResults.join(lineDelimiter + lineDelimiter);
}

function getSelectedRow(accessor: ServicesAccessor): RenderableMatch | undefined | null {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	return searchView?.getControl().getSelection()[0];
}

const clearHistoryCommand: ICommandHandler = accessor => {
	const searchHistoryService = accessor.get(ISearchHistoryService);
	searchHistoryService.clearHistory();
};

const focusSearchListCommand: ICommandHandler = accessor => {
	const viewsService = accessor.get(IViewsService);
	openSearchView(viewsService).then(searchView => {
		searchView?.moveFocusToResults();
	});
};

function getMultiSelectedSearchResources(viewer: WorkbenchCompressibleObjectTree<RenderableMatch, void>, currElement: RenderableMatch | undefined, sortConfig: ISearchConfigurationProperties): URI[] {
	return getElementsToOperateOnInfo(viewer, currElement, sortConfig).elements
		.map((renderableMatch) => ((renderableMatch instanceof Match) ? null : renderableMatch.resource))
		.filter((renderableMatch): renderableMatch is URI => (renderableMatch !== null));
}

function getElementsToOperateOnInfo(viewer: WorkbenchCompressibleObjectTree<RenderableMatch, void>, currElement: RenderableMatch | undefined, sortConfig: ISearchConfigurationProperties): { elements: RenderableMatch[]; mustReselect: boolean } {
	let elements: RenderableMatch[] = viewer.getSelection().filter((x): x is RenderableMatch => x !== null).sort((a, b) => searchComparer(a, b, sortConfig.sortOrder));

	const mustReselect = !currElement || elements.includes(currElement); // this indicates whether we need to re-focus/re-select on a remove.

	// if selection doesn't include multiple elements, just return current focus element.
	if (currElement && !(elements.length > 1 && elements.includes(currElement))) {
		elements = [currElement];
	}

	return { elements, mustReselect };
}

function compareLevels(elem1: RenderableMatch, elem2: RenderableMatch) {
	if (elem1 instanceof Match) {
		if (elem2 instanceof Match) {
			return 0;
		} else {
			return -1;
		}

	} else if (elem1 instanceof FileMatch) {
		if (elem2 instanceof Match) {
			return 1;
		} else if (elem2 instanceof FileMatch) {
			return 0;
		} else {
			return -1;
		}

	} else {
		// FolderMatch
		if (elem2 instanceof FolderMatch) {
			return 0;
		} else {
			return 1;
		}
	}
}

function expandAll(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	if (searchView) {
		const viewer = searchView.getControl();
		viewer.expandAll();
	}
}

function clearSearchResults(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	searchView?.clearSearchResults();
}

function cancelSearch(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	searchView?.cancelSearch();
}

function refreshSearch(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	searchView?.triggerQueryChange({ preserveFocus: false });
}

function collapseDeepestExpandedLevel(accessor: ServicesAccessor) {

	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	if (searchView) {
		const viewer = searchView.getControl();

		/**
		 * one level to collapse so collapse everything. If FolderMatch, check if there are visible grandchildren,
		 * i.e. if Matches are returned by the navigator, and if so, collapse to them, otherwise collapse all levels.
		 */
		const navigator = viewer.navigate();
		let node = navigator.first();
		let canCollapseFileMatchLevel = false;
		let canCollapseFirstLevel = false;

		if (node instanceof FolderMatchWorkspaceRoot) {
			while (node = navigator.next()) {
				if (node instanceof Match) {
					canCollapseFileMatchLevel = true;
					break;
				}
				if (searchView.isTreeLayoutViewVisible && !canCollapseFirstLevel) {
					let nodeToTest = node;

					if (node instanceof FolderMatch) {
						nodeToTest = node.compressionStartParent ?? node;
					}

					const immediateParent = nodeToTest.parent();

					if (!(immediateParent instanceof FolderMatchWorkspaceRoot || immediateParent instanceof FolderMatchNoRoot || immediateParent instanceof SearchResult)) {
						canCollapseFirstLevel = true;
					}
				}
			}
		}

		if (canCollapseFileMatchLevel) {
			node = navigator.first();
			do {
				if (node instanceof FileMatch) {
					viewer.collapse(node);
				}
			} while (node = navigator.next());
		} else if (canCollapseFirstLevel) {
			node = navigator.first();
			if (node) {
				do {

					let nodeToTest = node;

					if (node instanceof FolderMatch) {
						nodeToTest = node.compressionStartParent ?? node;
					}
					const immediateParent = nodeToTest.parent();

					if (immediateParent instanceof FolderMatchWorkspaceRoot || immediateParent instanceof FolderMatchNoRoot) {
						if (viewer.hasElement(node)) {
							viewer.collapse(node, true);
						} else {
							viewer.collapseAll();
						}
					}
				} while (node = navigator.next());
			}
		} else {
			viewer.collapseAll();
		}

		const firstFocusParent = viewer.getFocus()[0]?.parent();

		if (firstFocusParent && (firstFocusParent instanceof FolderMatch || firstFocusParent instanceof FileMatch) &&
			viewer.hasElement(firstFocusParent) && viewer.isCollapsed(firstFocusParent)) {
			viewer.domFocus();
			viewer.focusFirst();
			viewer.setSelection(viewer.getFocus());
		}
	}
}

async function focusNextSearchResult(accessor: ServicesAccessor): Promise<any> {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
		return (editorService.activeEditorPane as SearchEditor).focusNextResult();
	}

	return openSearchView(accessor.get(IViewsService)).then(searchView => {
		searchView?.selectNextMatch();
	});
}

async function focusPreviousSearchResult(accessor: ServicesAccessor): Promise<any> {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
		return (editorService.activeEditorPane as SearchEditor).focusPreviousResult();
	}

	return openSearchView(accessor.get(IViewsService)).then(searchView => {
		searchView?.selectPreviousMatch();
	});
}

async function findOrReplaceInFiles(accessor: ServicesAccessor, expandSearchReplaceWidget: boolean): Promise<any> {
	return openSearchView(accessor.get(IViewsService), false).then(openedView => {
		if (openedView) {
			const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
			searchAndReplaceWidget.toggleReplace(expandSearchReplaceWidget);

			const updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: !expandSearchReplaceWidget });
			openedView.searchAndReplaceWidget.focus(undefined, updatedText, updatedText);
		}
	});
}

function performReplace(accessor: ServicesAccessor,
	context: IMatchActionContext | IFileMatchActionContext | IFolderMatchActionContext | undefined): void {
	const configurationService = accessor.get(IConfigurationService);
	const viewsService = accessor.get(IViewsService);

	const viewlet: SearchView | undefined = getSearchView(viewsService);
	const viewer: WorkbenchCompressibleObjectTree<RenderableMatch> | undefined = context?.viewer ?? viewlet?.getControl();

	if (!viewer) {
		return;
	}
	const element: RenderableMatch | null = context?.element ?? viewer.getFocus()[0];

	// since multiple elements can be selected, we need to check the type of the FolderMatch/FileMatch/Match before we perform the replace.
	const opInfo = getElementsToOperateOnInfo(viewer, element ?? undefined, configurationService.getValue<ISearchConfigurationProperties>('search'));
	const elementsToReplace = opInfo.elements;
	let focusElement = viewer.getFocus()[0];

	if (!focusElement || (focusElement && !arrayContainsElementOrParent(focusElement, elementsToReplace)) || (focusElement instanceof SearchResult)) {
		focusElement = element;
	}

	if (elementsToReplace.length === 0) {
		return;
	}
	let nextFocusElement;
	if (focusElement) {
		nextFocusElement = getElementToFocusAfterRemoved(viewer, focusElement, elementsToReplace);
	}

	const searchResult = viewlet?.searchResult;

	if (searchResult) {
		searchResult.batchReplace(elementsToReplace);
	}

	if (focusElement) {
		if (!nextFocusElement) {
			nextFocusElement = getLastNodeFromSameType(viewer, focusElement);
		}

		if (nextFocusElement) {
			viewer.reveal(nextFocusElement);
			viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
			viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());

			if (nextFocusElement instanceof Match) {
				const useReplacePreview = configurationService.getValue<ISearchConfiguration>().search.useReplacePreview;
				if (!useReplacePreview || hasToOpenFile(accessor, nextFocusElement)) {
					viewlet?.open(nextFocusElement, true);
				} else {
					accessor.get(IReplaceService).openReplacePreview(nextFocusElement, true);
				}
			} else if (nextFocusElement instanceof FileMatch) {
				viewlet?.open(nextFocusElement, true);
			}
		}

	}

	viewer.domFocus();
}

function hasToOpenFile(accessor: ServicesAccessor, currBottomElem: RenderableMatch): boolean {
	if (!(currBottomElem instanceof Match)) {
		return false;
	}
	const activeEditor = accessor.get(IEditorService).activeEditor;
	const file = activeEditor?.resource;
	if (file) {
		return accessor.get(IUriIdentityService).extUri.isEqual(file, currBottomElem.parent().resource);
	}
	return false;
}
