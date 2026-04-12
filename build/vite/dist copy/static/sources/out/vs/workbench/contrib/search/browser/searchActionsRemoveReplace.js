/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { getSelectionKeyboardEvent } from '../../../../platform/list/browser/listService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { searchRemoveIcon, searchReplaceIcon } from './searchIcons.js';
import * as Constants from '../common/constants.js';
import { IReplaceService } from './replace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { category, getElementsToOperateOn, getSearchView, shouldRefocus } from './searchActionsBase.js';
import { equals } from '../../../../base/common/arrays.js';
import { arrayContainsElementOrParent, isSearchTreeFileMatch, isSearchTreeFolderMatch, isSearchTreeMatch, isSearchResult, isTextSearchHeading } from './searchTreeModel/searchTreeCommon.js';
import { MatchInNotebook } from './notebookSearch/notebookSearchModel.js';
import { AITextSearchHeadingImpl } from './AISearch/aiSearchModel.js';
//#endregion
//#region Actions
registerAction2(class RemoveAction extends Action2 {
    constructor() {
        super({
            id: "search.action.remove" /* Constants.SearchCommandIds.RemoveActionId */,
            title: nls.localize2('RemoveAction.label', "Dismiss"),
            category,
            icon: searchRemoveIcon,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
                primary: 20 /* KeyCode.Delete */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */,
                },
            },
            menu: [
                {
                    id: MenuId.SearchContext,
                    group: 'search',
                    order: 2,
                },
                {
                    id: MenuId.SearchActionMenu,
                    group: 'inline',
                    when: ContextKeyExpr.or(Constants.SearchContext.FileFocusKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.FolderFocusKey),
                    order: 2,
                },
            ]
        });
    }
    async run(accessor, context) {
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
        const elementsToRemove = getElementsToOperateOn(viewer, element, configurationService.getValue('search'));
        let focusElement = viewer.getFocus()[0] ?? undefined;
        if (elementsToRemove.length === 0) {
            return;
        }
        if (!focusElement || (isSearchResult(focusElement))) {
            focusElement = element;
        }
        let nextFocusElement;
        const shouldRefocusMatch = shouldRefocus(elementsToRemove, focusElement);
        if (focusElement && shouldRefocusMatch) {
            nextFocusElement = await getElementToFocusAfterRemoved(viewer, focusElement, elementsToRemove);
        }
        const searchResult = searchView.searchResult;
        if (searchResult) {
            searchResult.batchRemove(elementsToRemove);
        }
        await searchView.queueRefreshTree(); // wait for refreshTree to finish
        if (focusElement && shouldRefocusMatch) {
            if (!nextFocusElement) {
                // Ignore error if there are no elements left
                nextFocusElement = await getLastNodeFromSameType(viewer, focusElement).catch(() => { });
            }
            if (nextFocusElement && !arrayContainsElementOrParent(nextFocusElement, elementsToRemove)) {
                viewer.reveal(nextFocusElement);
                viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
                viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());
            }
        }
        else if (!equals(viewer.getFocus(), viewer.getSelection())) {
            viewer.setSelection(viewer.getFocus());
        }
        viewer.domFocus();
        return;
    }
});
registerAction2(class ReplaceAction extends Action2 {
    constructor() {
        super({
            id: "search.action.replace" /* Constants.SearchCommandIds.ReplaceActionId */,
            title: nls.localize2('match.replace.label', "Replace"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.IsEditableItemKey),
                primary: 1024 /* KeyMod.Shift */ | 2048 /* KeyMod.CtrlCmd */ | 22 /* KeyCode.Digit1 */,
            },
            icon: searchReplaceIcon,
            menu: [
                {
                    id: MenuId.SearchContext,
                    when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.IsEditableItemKey),
                    group: 'search',
                    order: 1
                },
                {
                    id: MenuId.SearchActionMenu,
                    when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.IsEditableItemKey),
                    group: 'inline',
                    order: 1
                }
            ]
        });
    }
    async run(accessor, context) {
        return performReplace(accessor, context);
    }
});
registerAction2(class ReplaceAllAction extends Action2 {
    constructor() {
        super({
            id: "search.action.replaceAllInFile" /* Constants.SearchCommandIds.ReplaceAllInFileActionId */,
            title: nls.localize2('file.replaceAll.label', "Replace All"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FileFocusKey, Constants.SearchContext.IsEditableItemKey),
                primary: 1024 /* KeyMod.Shift */ | 2048 /* KeyMod.CtrlCmd */ | 22 /* KeyCode.Digit1 */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */],
            },
            icon: searchReplaceIcon,
            menu: [
                {
                    id: MenuId.SearchContext,
                    when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FileFocusKey, Constants.SearchContext.IsEditableItemKey),
                    group: 'search',
                    order: 1
                },
                {
                    id: MenuId.SearchActionMenu,
                    when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FileFocusKey, Constants.SearchContext.IsEditableItemKey),
                    group: 'inline',
                    order: 1
                }
            ]
        });
    }
    async run(accessor, context) {
        return performReplace(accessor, context);
    }
});
registerAction2(class ReplaceAllInFolderAction extends Action2 {
    constructor() {
        super({
            id: "search.action.replaceAllInFolder" /* Constants.SearchCommandIds.ReplaceAllInFolderActionId */,
            title: nls.localize2('file.replaceAll.label', "Replace All"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FolderFocusKey, Constants.SearchContext.IsEditableItemKey),
                primary: 1024 /* KeyMod.Shift */ | 2048 /* KeyMod.CtrlCmd */ | 22 /* KeyCode.Digit1 */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */],
            },
            icon: searchReplaceIcon,
            menu: [
                {
                    id: MenuId.SearchContext,
                    when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FolderFocusKey, Constants.SearchContext.IsEditableItemKey),
                    group: 'search',
                    order: 1
                },
                {
                    id: MenuId.SearchActionMenu,
                    when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FolderFocusKey, Constants.SearchContext.IsEditableItemKey),
                    group: 'inline',
                    order: 1
                }
            ]
        });
    }
    async run(accessor, context) {
        return performReplace(accessor, context);
    }
});
//#endregion
//#region Helpers
async function performReplace(accessor, context) {
    const configurationService = accessor.get(IConfigurationService);
    const viewsService = accessor.get(IViewsService);
    const instantiationService = accessor.get(IInstantiationService);
    const viewlet = getSearchView(viewsService);
    const viewer = context?.viewer ?? viewlet?.getControl();
    if (!viewer) {
        return;
    }
    const element = context?.element ?? viewer.getFocus()[0];
    // since multiple elements can be selected, we need to check the type of the FolderMatch/FileMatch/Match before we perform the replace.
    const elementsToReplace = getElementsToOperateOn(viewer, element ?? undefined, configurationService.getValue('search'));
    let focusElement = viewer.getFocus()[0];
    if (!focusElement || (focusElement && !arrayContainsElementOrParent(focusElement, elementsToReplace)) || (isSearchResult(focusElement))) {
        focusElement = element;
    }
    if (elementsToReplace.length === 0) {
        return;
    }
    let nextFocusElement;
    if (focusElement) {
        nextFocusElement = await getElementToFocusAfterRemoved(viewer, focusElement, elementsToReplace);
    }
    const searchResult = viewlet?.searchResult;
    if (searchResult) {
        await searchResult.batchReplace(elementsToReplace);
    }
    await viewlet?.queueRefreshTree(); // wait for refreshTree to finish
    if (focusElement) {
        if (!nextFocusElement) {
            nextFocusElement = await getLastNodeFromSameType(viewer, focusElement);
        }
        if (nextFocusElement) {
            viewer.reveal(nextFocusElement);
            viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
            viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());
            if (isSearchTreeMatch(nextFocusElement)) {
                const useReplacePreview = configurationService.getValue().search.useReplacePreview;
                if (!useReplacePreview || instantiationService.invokeFunction(accessor => hasToOpenFile(accessor, nextFocusElement)) || nextFocusElement instanceof MatchInNotebook) {
                    viewlet?.open(nextFocusElement, true);
                }
                else {
                    instantiationService.invokeFunction(accessor => accessor.get(IReplaceService)).openReplacePreview(nextFocusElement, true);
                }
            }
            else if (isSearchTreeFileMatch(nextFocusElement)) {
                viewlet?.open(nextFocusElement, true);
            }
        }
    }
    viewer.domFocus();
}
function hasToOpenFile(accessor, currBottomElem) {
    if (!(isSearchTreeMatch(currBottomElem))) {
        return false;
    }
    const activeEditor = accessor.get(IEditorService).activeEditor;
    const file = activeEditor?.resource;
    if (file) {
        return accessor.get(IUriIdentityService).extUri.isEqual(file, currBottomElem.parent().resource);
    }
    return false;
}
function compareLevels(elem1, elem2) {
    if (isSearchTreeMatch(elem1)) {
        if (isSearchTreeMatch(elem2)) {
            return 0;
        }
        else {
            return -1;
        }
    }
    else if (isSearchTreeFileMatch(elem1)) {
        if (isSearchTreeMatch(elem2)) {
            return 1;
        }
        else if (isSearchTreeFileMatch(elem2)) {
            return 0;
        }
        else {
            return -1;
        }
    }
    else if (isSearchTreeFolderMatch(elem1)) {
        if (isTextSearchHeading(elem2)) {
            return -1;
        }
        else if (isSearchTreeFolderMatch(elem2)) {
            return 0;
        }
        else {
            return 1;
        }
    }
    else {
        if (isTextSearchHeading(elem2)) {
            return 0;
        }
        else {
            return 1;
        }
    }
}
/**
 * Returns element to focus after removing the given element
 */
export async function getElementToFocusAfterRemoved(viewer, element, elementsToRemove) {
    const navigator = viewer.navigate(element);
    if (isSearchTreeFolderMatch(element)) {
        while (!!navigator.next() && (!isSearchTreeFolderMatch(navigator.current()) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) { }
    }
    else if (isSearchTreeFileMatch(element)) {
        while (!!navigator.next() && (!isSearchTreeFileMatch(navigator.current()) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) {
            // Never expand AI search results by default
            if (navigator.current() instanceof AITextSearchHeadingImpl) {
                return navigator.current();
            }
            await viewer.expand(navigator.current());
        }
    }
    else {
        while (navigator.next() && (!isSearchTreeMatch(navigator.current()) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) {
            // Never expand AI search results by default
            if (navigator.current() instanceof AITextSearchHeadingImpl) {
                return navigator.current();
            }
            await viewer.expand(navigator.current());
        }
    }
    return navigator.current();
}
/***
 * Finds the last element in the tree with the same type as `element`
 */
export async function getLastNodeFromSameType(viewer, element) {
    let lastElem = viewer.lastVisibleElement ?? null;
    while (lastElem) {
        const compareVal = compareLevels(element, lastElem);
        if (compareVal === -1) {
            const expanded = await viewer.expand(lastElem);
            if (!expanded) {
                return lastElem;
            }
            lastElem = viewer.lastVisibleElement;
        }
        else if (compareVal === 1) {
            const potentialLastElem = viewer.getParentElement(lastElem);
            if (isSearchResult(potentialLastElem)) {
                break;
            }
            else {
                lastElem = potentialLastElem;
            }
        }
        else {
            return lastElem;
        }
    }
    return undefined;
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQWN0aW9uc1JlbW92ZVJlcGxhY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hBY3Rpb25zUmVtb3ZlUmVwbGFjZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUseUJBQXlCLEVBQXNDLE1BQU0sa0RBQWtELENBQUM7QUFDakksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRXZFLE9BQU8sS0FBSyxTQUFTLE1BQU0sd0JBQXdCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUMvQyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBR2xHLE9BQU8sRUFBRSxRQUFRLEVBQUUsc0JBQXNCLEVBQUUsYUFBYSxFQUFFLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRCxPQUFP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