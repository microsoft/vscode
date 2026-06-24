/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { ICommandHandler } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchCompressibleAsyncDataTree, WorkbenchListFocusContextKey } from '../../../../platform/list/browser/listService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { searchClearIcon, searchCollapseAllIcon, searchExpandAllIcon, searchRefreshIcon, searchShowAsList, searchShowAsTree, searchStopIcon } from './searchIcons.js';
import * as Constants from '../common/constants.js';
import { ISearchHistoryService } from '../common/searchHistoryService.js';
import { VIEW_ID } from '../../../services/search/common/search.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { SearchStateKey, SearchUIState } from '../common/search.js';
import { category, getSearchView } from './searchActionsBase.js';
import { isSearchTreeMatch, RenderableMatch, ISearchResult, isSearchTreeFolderMatch, isSearchTreeFolderMatchNoRoot, isSearchTreeFolderMatchWorkspaceRoot, isSearchResult, isTextSearchHeading, isSearchTreeFileMatch } from './searchTreeModel/searchTreeCommon.js';

//#region Actions
registerAction2(class ClearSearchHistoryCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.ClearSearchHistoryCommandId,
			title: nls.localize2('clearSearchHistoryLabel', "Clear Search History"),
			category,
			f1: true
		});

	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		clearHistoryCommand(accessor);
	}
});

registerAction2(class CancelSearchAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.CancelSearchActionId,
			title: nls.localize2('CancelSearchAction.label', "Cancel Search"),
			icon: searchStopIcon,
			category,
			f1: true,
			precondition: SearchStateKey.isEqualTo(SearchUIState.Idle).negate(),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, WorkbenchListFocusContextKey),
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
});

registerAction2(class RefreshAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.RefreshSearchResultsActionId,
			title: nls.localize2('RefreshAction.label', "Refresh"),
			icon: searchRefreshIcon,
			precondition: Constants.SearchContext.ViewHasSearchPatternKey,
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
	run(accessor: ServicesAccessor, ...args: unknown[]) {
		return refreshSearch(accessor);
	}
});

registerAction2(class CollapseDeepestExpandedLevelAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.CollapseSearchResultsActionId,
			title: nls.localize2('CollapseDeepestExpandedLevelAction.label', "Collapse All"),
			category,
			icon: searchCollapseAllIcon,
			f1: true,
			precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSomeCollapsibleKey),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 4,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), ContextKeyExpr.or(Constants.SearchContext.HasSearchResults.negate(), Constants.SearchContext.ViewHasSomeCollapsibleKey)),
			}]
		});
	}
	run(accessor: ServicesAccessor, ...args: unknown[]) {
		return collapseDeepestExpandedLevel(accessor);
	}
});

registerAction2(class ExpandAllAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.ExpandSearchResultsActionId,
			title: nls.localize2('ExpandAllAction.label', "Expand All"),
			category,
			icon: searchExpandAllIcon,
			f1: true,
			precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSomeCollapsibleKey.toNegated()),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 4,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSomeCollapsibleKey.toNegated()),
			}]
		});
	}
	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		return expandAll(accessor);
	}
});

registerAction2(class ClearSearchResultsAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.ClearSearchResultsActionId,
			title: nls.localize2('ClearSearchResultsAction.label', "Clear Search Results"),
			category,
			icon: searchClearIcon,
			f1: true,
			precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSearchPatternKey, Constants.SearchContext.ViewHasReplacePatternKey, Constants.SearchContext.ViewHasFilePatternKey),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.equals('view', VIEW_ID),
			}]
		});
	}
	run(accessor: ServicesAccessor, ...args: unknown[]) {
		return clearSearchResults(accessor);
	}
});


registerAction2(class ViewAsTreeAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.ViewAsTreeActionId,
			title: nls.localize2('ViewAsTreeAction.label', "View as Tree"),
			category,
			icon: searchShowAsList,
			f1: true,
			precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.InTreeViewKey.toNegated()),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), Constants.SearchContext.InTreeViewKey.toNegated()),
			}]
		});
	}
	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			await searchView.setTreeView(true);
		}
	}
});

registerAction2(class ViewAsListAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.ViewAsListActionId,
			title: nls.localize2('ViewAsListAction.label', "View as List"),
			category,
			icon: searchShowAsTree,
			f1: true,
			precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.InTreeViewKey),
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), Constants.SearchContext.InTreeViewKey),
			}]
		});
	}
	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			await searchView.setTreeView(false);
		}
	}
});

registerAction2(class SearchWithAIAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.SearchWithAIActionId,
			title: nls.localize2('SearchWithAIAction.label', "Search with AI"),
			category,
			f1: true,
			precondition: Constants.SearchContext.hasAIResultProvider,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.hasAIResultProvider, Constants.SearchContext.SearchViewFocusedKey),
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			}
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			searchView.requestAIResults();
		}
	}
});

//#endregion

//#region Helpers
const clearHistoryCommand: ICommandHandler = accessor => {
	const searchHistoryService = accessor.get(ISearchHistoryService);
	searchHistoryService.clearHistory();
};

async function expandAll(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	if (searchView) {
		const viewer = searchView.getControl();
		await forcedExpandRecursively(viewer, undefined);
	}
}

/**
 * Recursively expand all nodes in the search results tree that are a child of `element`
 * If `element` is not provided, it is the root node.
 */
export async function forcedExpandRecursively(
	viewer: WorkbenchCompressibleAsyncDataTree<ISearchResult, RenderableMatch, void>,
	element: RenderableMatch | undefined
) {
	if (element) {
		if (!viewer.hasNode(element)) {
			return;
		}
		await viewer.expand(element, true);
	}

	const children = viewer.getNode(element)?.children;

	if (children) {
		for (const child of children) {
			if (isSearchResult(child.element)) {
				throw Error('SearchResult should not be a child of a RenderableMatch');
			}
			forcedExpandRecursively(viewer, child.element);
		}
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
	searchView?.triggerQueryChange({ preserveFocus: false, shouldUpdateAISearch: !searchView.model.searchResult.aiTextSearchResult.hidden });
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

		do {
			node = navigator.next();
		} while (isTextSearchHeading(node));
		// go to the first non-TextSearchResult node

		if (isSearchTreeFolderMatchWorkspaceRoot(node) || searchView.isTreeLayoutViewVisible) {
			while (node = navigator.next()) {
				if (isTextSearchHeading(node)) {
					continue;
				}
				if (isSearchTreeMatch(node)) {
					canCollapseFileMatchLevel = true;
					break;
				}
				if (searchView.isTreeLayoutViewVisible && !canCollapseFirstLevel) {
					let nodeToTest = node;

					if (isSearchTreeFolderMatch(node)) {
						const compressionStartNode = viewer.getCompressedTreeNode(node)?.elements[0].element;
						// Match elements should never be compressed, so `!(compressionStartNode instanceof Match)` should always be true here. Same with `!(compressionStartNode instanceof TextSearchResult)`
						nodeToTest = compressionStartNode && !(isSearchTreeMatch(compressionStartNode)) && !isTextSearchHeading(compressionStartNode) && !(isSearchResult(compressionStartNode)) ? compressionStartNode : node;
					}

					const immediateParent = nodeToTest.parent();

					if (!(isTextSearchHeading(immediateParent) || isSearchTreeFolderMatchWorkspaceRoot(immediateParent) || isSearchTreeFolderMatchNoRoot(immediateParent) || isSearchResult(immediateParent))) {
						canCollapseFirstLevel = true;
					}
				}
			}
		}

		if (canCollapseFileMatchLevel) {
			node = navigator.first();
			do {
				if (isSearchTreeFileMatch(node)) {
					viewer.collapse(node);
				}
			} while (node = navigator.next());
		} else if (canCollapseFirstLevel) {
			node = navigator.first();
			if (node) {
				do {

					let nodeToTest = node;

					if (isSearchTreeFolderMatch(node)) {
						const compressionStartNode = viewer.getCompressedTreeNode(node)?.elements[0].element;
						// Match elements should never be compressed, so !(compressionStartNode instanceof Match) should always be true here
						nodeToTest = (compressionStartNode && !(isSearchTreeMatch(compressionStartNode)) && !(isSearchResult(compressionStartNode)) ? compressionStartNode : node);
					}
					const immediateParent = nodeToTest.parent();

					if (isSearchTreeFolderMatchWorkspaceRoot(immediateParent) || isSearchTreeFolderMatchNoRoot(immediateParent)) {
						if (viewer.hasNode(node)) {
							viewer.collapse(node, true);
						} else {
							viewer.collapseAll();
						}
					}
				} while (node = navigator.next());
			}
		} else if (isTextSearchHeading(navigator.first())) {
			// if AI results are visible, just collapse everything under the TextSearchResult.
			node = navigator.first();
			do {
				if (!node) {
					break;

				}

				if (isTextSearchHeading(viewer.getParentElement(node))) {
					viewer.collapse(node);
				}
			} while (node = navigator.next());

		} else {
			viewer.collapseAll();
		}

		const firstFocusParent = viewer.getFocus()[0]?.parent();

		if (firstFocusParent && (isSearchTreeFolderMatch(firstFocusParent) || isSearchTreeFileMatch(firstFocusParent)) &&
			viewer.hasNode(firstFocusParent) && viewer.isCollapsed(firstFocusParent)) {
			viewer.domFocus();
			viewer.focusFirst();
			viewer.setSelection(viewer.getFocus());
		}
	}
}

//#endregion
