/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { WorkbenchListFocusContextKey } from '../../../../platform/list/browser/listService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { searchClearIcon, searchCollapseAllIcon, searchExpandAllIcon, searchRefreshIcon, searchShowAsList, searchShowAsTree, searchStopIcon } from './searchIcons.js';
import * as Constants from '../common/constants.js';
import { ISearchHistoryService } from '../common/searchHistoryService.js';
import { VIEW_ID } from '../../../services/search/common/search.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SearchStateKey, SearchUIState } from '../common/search.js';
import { category, getSearchView } from './searchActionsBase.js';
import { isSearchTreeMatch, isSearchTreeFolderMatch, isSearchTreeFolderMatchNoRoot, isSearchTreeFolderMatchWorkspaceRoot, isSearchResult, isTextSearchHeading, isSearchTreeFileMatch } from './searchTreeModel/searchTreeCommon.js';
//#region Actions
registerAction2(class ClearSearchHistoryCommandAction extends Action2 {
    constructor() {
        super({
            id: "search.action.clearHistory" /* Constants.SearchCommandIds.ClearSearchHistoryCommandId */,
            title: nls.localize2('clearSearchHistoryLabel', "Clear Search History"),
            category,
            f1: true
        });
    }
    async run(accessor) {
        clearHistoryCommand(accessor);
    }
});
registerAction2(class CancelSearchAction extends Action2 {
    constructor() {
        super({
            id: "search.action.cancel" /* Constants.SearchCommandIds.CancelSearchActionId */,
            title: nls.localize2('CancelSearchAction.label', "Cancel Search"),
            icon: searchStopIcon,
            category,
            f1: true,
            precondition: SearchStateKey.isEqualTo(SearchUIState.Idle).negate(),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, WorkbenchListFocusContextKey),
                primary: 9 /* KeyCode.Escape */,
            },
            menu: [{
                    id: MenuId.ViewTitle,
                    group: 'navigation',
                    order: 0,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_ID), SearchStateKey.isEqualTo(SearchUIState.SlowSearch)),
                }]
        });
    }
    run(accessor) {
        return cancelSearch(accessor);
    }
});
registerAction2(class RefreshAction extends Action2 {
    constructor() {
        super({
            id: "search.action.refreshSearchResults" /* Constants.SearchCommandIds.RefreshSearchResultsActionId */,
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
    run(accessor, ...args) {
        return refreshSearch(accessor);
    }
});
registerAction2(class CollapseDeepestExpandedLevelAction extends Action2 {
    constructor() {
        super({
            id: "search.action.collapseSearchResults" /* Constants.SearchCommandIds.CollapseSearchResultsActionId */,
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
    run(accessor, ...args) {
        return collapseDeepestExpandedLevel(accessor);
    }
});
registerAction2(class ExpandAllAction extends Action2 {
    constructor() {
        super({
            id: "search.action.expandSearchResults" /* Constants.SearchCommandIds.ExpandSearchResultsActionId */,
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
    async run(accessor, ...args) {
        return expandAll(accessor);
    }
});
registerAction2(class ClearSearchResultsAction extends Action2 {
    constructor() {
        super({
            id: "search.action.clearSearchResults" /* Constants.SearchCommandIds.ClearSearchResultsActionId */,
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
    run(accessor, ...args) {
        return clearSearchResults(accessor);
    }
});
registerAction2(class ViewAsTreeAction extends Action2 {
    constructor() {
        super({
            id: "search.action.viewAsTree" /* Constants.SearchCommandIds.ViewAsTreeActionId */,
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
    async run(accessor, ...args) {
        const searchView = getSearchView(accessor.get(IViewsService));
        if (searchView) {
            await searchView.setTreeView(true);
        }
    }
});
registerAction2(class ViewAsListAction extends Action2 {
    constructor() {
        super({
            id: "search.action.viewAsList" /* Constants.SearchCommandIds.ViewAsListActionId */,
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
    async run(accessor, ...args) {
        const searchView = getSearchView(accessor.get(IViewsService));
        if (searchView) {
            await searchView.setTreeView(false);
        }
    }
});
registerAction2(class SearchWithAIAction extends Action2 {
    constructor() {
        super({
            id: "search.action.searchWithAI" /* Constants.SearchCommandIds.SearchWithAIActionId */,
            title: nls.localize2('SearchWithAIAction.label', "Search with AI"),
            category,
            f1: true,
            precondition: Constants.SearchContext.hasAIResultProvider,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.hasAIResultProvider, Constants.SearchContext.SearchViewFocusedKey),
                primary: 2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */
            }
        });
    }
    async run(accessor, ...args) {
        const searchView = getSearchView(accessor.get(IViewsService));
        if (searchView) {
            searchView.requestAIResults();
        }
    }
});
//#endregion
//#region Helpers
const clearHistoryCommand = accessor => {
    const searchHistoryService = accessor.get(ISearchHistoryService);
    searchHistoryService.clearHistory();
};
async function expandAll(accessor) {
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
export async function forcedExpandRecursively(viewer, element) {
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
function clearSearchResults(accessor) {
    const viewsService = accessor.get(IViewsService);
    const searchView = getSearchView(viewsService);
    searchView?.clearSearchResults();
}
function cancelSearch(accessor) {
    const viewsService = accessor.get(IViewsService);
    const searchView = getSearchView(viewsService);
    searchView?.cancelSearch();
}
function refreshSearch(accessor) {
    const viewsService = accessor.get(IViewsService);
    const searchView = getSearchView(viewsService);
    searchView?.triggerQueryChange({ preserveFocus: false, shouldUpdateAISearch: !searchView.model.searchResult.aiTextSearchResult.hidden });
}
function collapseDeepestExpandedLevel(accessor) {
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
        }
        else if (canCollapseFirstLevel) {
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
                        }
                        else {
                            viewer.collapseAll();
                        }
                    }
                } while (node = navigator.next());
            }
        }
        else if (isTextSearchHeading(navigator.first())) {
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
        }
        else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQWN0aW9uc1RvcEJhci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaEFjdGlvbnNUb3BCYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUcxQyxPQUFPLEVBQXNDLDRCQUE0QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxlQUFlLEVBQUUscUJBQXFCLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDdEssT0FBTyxLQUFLLFNBQVMsTUFBTSx3QkFBd0IsQ0FBQztBQUNwRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBR2xHLE9BQU8sRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNqRSxPQUFPLEVBQUUsaUJBQWlCLEVBQWtDLHVCQUF1QixFQUFFLDZCQUE2QixFQUFFLG9DQUFvQyxFQUFFLGNBQWMsRUFBRSxtQkFBbUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXBRLGlCQUFpQjtBQUNqQixlQUFlLENBQUMsTUFBTSwrQkFBZ0MsU0FBUSxPQUFPO0lBRXBFO1FBRUMsS0FBSyxDQUFDO1lBQ0wsRUFBRSwyRkFBd0Q7WUFDMUQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMseUJBQXlCLEVBQUUsc0JBQXNCLENBQUM7WUFDdkUsUUFBUTtZQUNSLEVBQUUsRUFBRSxJQUFJO1NBQ1IsQ0FBQyxDQUFDO0lBRUosQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsbUJBQW1CLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDL0IsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxNQUFNLGtCQUFtQixTQUFRLE9BQU87SUFDdkQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLDhFQUFpRDtZQUNuRCxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQywwQkFBMEIsRUFBRSxlQUFlLENBQUM7WUFDakUsSUFBSSxFQUFFLGNBQWM7WUFDcEIsUUFBUTtZQUNSLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLGNBQWMsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRTtZQUNuRSxVQUFVLEVBQUU7Z0JBQ1gsTUFBTSw2Q0FBbUM7Z0JBQ3pDLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsb0JBQW9CLEVBQUUsNEJBQTRCLENBQUM7Z0JBQ3BHLE9BQU8sd0JBQWdCO2FBQ3ZCO1lBQ0QsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxTQUFTO29CQUNwQixLQUFLLEVBQUUsWUFBWTtvQkFDbkIsS0FBSyxFQUFFLENBQUM7b0JBQ1IsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEVBQUUsY0FBYyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7aUJBQ3BILENBQUM7U0FDRixDQUFDLENBQUM7SUFDSixDQUFDO0lBQ0QsR0FBRyxDQUFDLFFBQTBCO1FBQzdCLE9BQU8sWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQy9CLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSxhQUFjLFNBQVEsT0FBTztJQUNsRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsb0dBQXlEO1lBQzNELEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLHFCQUFxQixFQUFFLFNBQVMsQ0FBQztZQUN0RCxJQUFJLEVBQUUsaUJBQWlCO1lBQ3ZCLFlBQVksRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLHVCQUF1QjtZQUM3RCxRQUFRO1lBQ1IsRUFBRSxFQUFFLElBQUk7WUFDUixJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLFNBQVM7b0JBQ3BCLEtBQUssRUFBRSxZQUFZO29CQUNuQixLQUFLLEVBQUUsQ0FBQztvQkFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsRUFBRSxjQUFjLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztpQkFDN0gsQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNKLENBQUM7SUFDRCxHQUFHLENBQUMsUUFBMEIsRUFBRSxHQUFHLElBQWU7UUFDakQsT0FBTyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDaEMsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxNQUFNLGtDQUFtQyxTQUFRLE9BQU87SUFDdkU7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLHNHQUEwRDtZQUM1RCxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQywwQ0FBMEMsRUFBRSxjQUFjLENBQUM7WUFDaEYsUUFBUTtZQUNSLElBQUksRUFBRSxxQkFBcUI7WUFDM0IsRUFBRSxFQUFFLElBQUk7WUFDUixZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMseUJBQXlCLENBQUM7WUFDN0gsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxTQUFTO29CQUNwQixLQUFLLEVBQUUsWUFBWTtvQkFDbkIsS0FBSyxFQUFFLENBQUM7b0JBQ1IsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMseUJBQXlCLENBQUMsQ0FBQztpQkFDekwsQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNKLENBQUM7SUFDRCxHQUFHLENBQUMsUUFBMEIsRUFBRSxHQUFHLElBQWU7UUFDakQsT0FBTyw0QkFBNEIsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMvQyxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZUFBZSxDQUFDLE1BQU0sZUFBZ0IsU0FBUSxPQUFPO0lBQ3BEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxrR0FBd0Q7WUFDMUQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsWUFBWSxDQUFDO1lBQzNELFFBQVE7WUFDUixJQUFJLEVBQUUsbUJBQW1CO1lBQ3pCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLHlCQUF5QixDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3pJLElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsU0FBUztvQkFDcEIsS0FBSyxFQUFFLFlBQVk7b0JBQ25CLEtBQUssRUFBRSxDQUFDO29CQUNSLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLEVBQUUsU0FBUyxDQUFDLGFBQWEsQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztpQkFDekssQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNKLENBQUM7SUFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsR0FBRyxJQUFlO1FBQ3ZELE9BQU8sU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzVCLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSx3QkFBeUIsU0FBUSxPQUFPO0lBQzdEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxnR0FBdUQ7WUFDekQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0NBQWdDLEVBQUUsc0JBQXNCLENBQUM7WUFDOUUsUUFBUTtZQUNSLElBQUksRUFBRSxlQUFlO1lBQ3JCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLHVCQUF1QixFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLEVBQUUsU0FBUyxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsQ0FBQztZQUMzTixJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLFNBQVM7b0JBQ3BCLEtBQUssRUFBRSxZQUFZO29CQUNuQixLQUFLLEVBQUUsQ0FBQztvQkFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDO2lCQUM1QyxDQUFDO1NBQ0YsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNELEdBQUcsQ0FBQyxRQUEwQixFQUFFLEdBQUcsSUFBZTtRQUNqRCxPQUFPLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFHSCxlQUFlLENBQUMsTUFBTSxnQkFBaUIsU0FBUSxPQUFPO0lBQ3JEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxnRkFBK0M7WUFDakQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsd0JBQXdCLEVBQUUsY0FBYyxDQUFDO1lBQzlELFFBQVE7WUFDUixJQUFJLEVBQUUsZ0JBQWdCO1lBQ3RCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUM3SCxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLFNBQVM7b0JBQ3BCLEtBQUssRUFBRSxZQUFZO29CQUNuQixLQUFLLEVBQUUsQ0FBQztvQkFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztpQkFDbkgsQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNKLENBQUM7SUFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsR0FBRyxJQUFlO1FBQ3ZELE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDOUQsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSxnQkFBaUIsU0FBUSxPQUFPO0lBQ3JEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxnRkFBK0M7WUFDakQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsd0JBQXdCLEVBQUUsY0FBYyxDQUFDO1lBQzlELFFBQVE7WUFDUixJQUFJLEVBQUUsZ0JBQWdCO1lBQ3RCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQztZQUNqSCxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLFNBQVM7b0JBQ3BCLEtBQUssRUFBRSxZQUFZO29CQUNuQixLQUFLLEVBQUUsQ0FBQztvQkFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQztpQkFDdkcsQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNKLENBQUM7SUFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsR0FBRyxJQUFlO1FBQ3ZELE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDOUQsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckMsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSxrQkFBbUIsU0FBUSxPQUFPO0lBQ3ZEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxvRkFBaUQ7WUFDbkQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsMEJBQTBCLEVBQUUsZ0JBQWdCLENBQUM7WUFDbEUsUUFBUTtZQUNSLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMsbUJBQW1CO1lBQ3pELFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDO2dCQUNuSCxPQUFPLEVBQUUsaURBQTZCO2FBQ3RDO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxHQUFHLElBQWU7UUFDdkQsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUM5RCxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLFVBQVUsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsWUFBWTtBQUVaLGlCQUFpQjtBQUNqQixNQUFNLG1CQUFtQixHQUFvQixRQUFRLENBQUMsRUFBRTtJQUN2RCxNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUNqRSxvQkFBb0IsQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFFRixLQUFLLFVBQVUsU0FBUyxDQUFDLFFBQTBCO0lBQ2xELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDakQsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQy9DLElBQUksVUFBVSxFQUFFLENBQUM7UUFDaEIsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sdUJBQXVCLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ2xELENBQUM7QUFDRixDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSx1QkFBdUIsQ0FDNUMsTUFBZ0YsRUFDaEYsT0FBb0M7SUFFcEMsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUNiLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDOUIsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQztJQUVuRCxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ2QsS0FBSyxNQUFNLEtBQUssSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUM5QixJQUFJLGNBQWMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDbkMsTUFBTSxLQUFLLENBQUMseURBQXlELENBQUMsQ0FBQztZQUN4RSxDQUFDO1lBQ0QsdUJBQXVCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoRCxDQUFDO0lBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFDLFFBQTBCO0lBQ3JELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDakQsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQy9DLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxDQUFDO0FBQ2xDLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxRQUEwQjtJQUMvQyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ2pELE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUMvQyxVQUFVLEVBQUUsWUFBWSxFQUFFLENBQUM7QUFDNUIsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLFFBQTBCO0lBQ2hELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDakQsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQy9DLFVBQVUsRUFBRSxrQkFBa0IsQ0FBQyxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQzFJLENBQUM7QUFFRCxTQUFTLDRCQUE0QixDQUFDLFFBQTBCO0lBRS9ELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDakQsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQy9DLElBQUksVUFBVSxFQUFFLENBQUM7UUFDaEIsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBRXZDOzs7V0FHRztRQUNILE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNwQyxJQUFJLElBQUksR0FBRyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDN0IsSUFBSSx5QkFBeUIsR0FBRyxLQUFLLENBQUM7UUFDdEMsSUFBSSxxQkFBcUIsR0FBRyxLQUFLLENBQUM7UUFFbEMsR0FBRyxDQUFDO1lBQ0gsSUFBSSxHQUFHLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN6QixDQUFDLFFBQVEsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDcEMsNENBQTRDO1FBRTVDLElBQUksb0NBQW9DLENBQUMsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDdEYsT0FBTyxJQUFJLEdBQUcsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQ2hDLElBQUksbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDL0IsU0FBUztnQkFDVixDQUFDO2dCQUNELElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDN0IseUJBQXlCLEdBQUcsSUFBSSxDQUFDO29CQUNqQyxNQUFNO2dCQUNQLENBQUM7Z0JBQ0QsSUFBSSxVQUFVLENBQUMsdUJBQXVCLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO29CQUNsRSxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUM7b0JBRXRCLElBQUksdUJBQXVCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQzt3QkFDbkMsTUFBTSxvQkFBb0IsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQzt3QkFDckYsdUxBQXVMO3dCQUN2TCxVQUFVLEdBQUcsb0JBQW9CLElBQUksQ0FBQyxDQUFDLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQ3hNLENBQUM7b0JBRUQsTUFBTSxlQUFlLEdBQUcsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUU1QyxJQUFJLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxlQUFlLENBQUMsSUFBSSxvQ0FBb0MsQ0FBQyxlQUFlLENBQUMsSUFBSSw2QkFBNkIsQ0FBQyxlQUFlLENBQUMsSUFBSSxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDO3dCQUMzTCxxQkFBcUIsR0FBRyxJQUFJLENBQUM7b0JBQzlCLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSx5QkFBeUIsRUFBRSxDQUFDO1lBQy9CLElBQUksR0FBRyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDekIsR0FBRyxDQUFDO2dCQUNILElBQUkscUJBQXFCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDakMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdkIsQ0FBQztZQUNGLENBQUMsUUFBUSxJQUFJLEdBQUcsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ25DLENBQUM7YUFBTSxJQUFJLHFCQUFxQixFQUFFLENBQUM7WUFDbEMsSUFBSSxHQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN6QixJQUFJLElBQUksRUFBRSxDQUFDO2dCQUNWLEdBQUcsQ0FBQztvQkFFSCxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUM7b0JBRXRCLElBQUksdUJBQXVCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQzt3QkFDbkMsTUFBTSxvQkFBb0IsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQzt3QkFDckYsb0hBQW9IO3dCQUNwSCxVQUFVLEdBQUcsQ0FBQyxvQkFBb0IsSUFBSSxDQUFDLENBQUMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQzVKLENBQUM7b0JBQ0QsTUFBTSxlQUFlLEdBQUcsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUU1QyxJQUFJLG9DQUFvQyxDQUFDLGVBQWUsQ0FBQyxJQUFJLDZCQUE2QixDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7d0JBQzdHLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDOzRCQUMxQixNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDN0IsQ0FBQzs2QkFBTSxDQUFDOzRCQUNQLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQzt3QkFDdEIsQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUMsUUFBUSxJQUFJLEdBQUcsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFO1lBQ25DLENBQUM7UUFDRixDQUFDO2FBQU0sSUFBSSxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ25ELGtGQUFrRjtZQUNsRixJQUFJLEdBQUcsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3pCLEdBQUcsQ0FBQztnQkFDSCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ1gsTUFBTTtnQkFFUCxDQUFDO2dCQUVELElBQUksbUJBQW1CLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDeEQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdkIsQ0FBQztZQUNGLENBQUMsUUFBUSxJQUFJLEdBQUcsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFO1FBRW5DLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3RCLENBQUM7UUFFRCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUV4RCxJQUFJLGdCQUFnQixJQUFJLENBQUMsdUJBQXVCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzdHLE1BQU0sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztZQUMzRSxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbEIsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3BCLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDeEMsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsWUFBWSJ9