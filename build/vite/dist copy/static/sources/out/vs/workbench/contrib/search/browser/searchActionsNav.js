/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isMacintosh } from '../../../../base/common/platform.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import * as Constants from '../common/constants.js';
import * as SearchEditorConstants from '../../searchEditor/browser/constants.js';
import { SearchEditorInput } from '../../searchEditor/browser/searchEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from '../../../../editor/contrib/find/browser/findModel.js';
import { category, getSearchView, openSearchView } from './searchActionsBase.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { getActiveElement } from '../../../../base/browser/dom.js';
import { isSearchTreeFolderMatch } from './searchTreeModel/searchTreeCommon.js';
//#region Actions: Changing Search Input Options
registerAction2(class ToggleQueryDetailsAction extends Action2 {
    constructor() {
        super({
            id: "workbench.action.search.toggleQueryDetails" /* Constants.SearchCommandIds.ToggleQueryDetailsActionId */,
            title: nls.localize2('ToggleQueryDetailsAction.label', "Toggle Query Details"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.or(Constants.SearchContext.SearchViewFocusedKey, SearchEditorConstants.InSearchEditor),
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 40 /* KeyCode.KeyJ */,
            },
        });
    }
    run(accessor, ...args) {
        const options = args[0];
        const contextService = accessor.get(IContextKeyService).getContext(getActiveElement());
        if (contextService.getValue(SearchEditorConstants.InSearchEditor.serialize())) {
            accessor.get(IEditorService).activeEditorPane.toggleQueryDetails(options?.show);
        }
        else if (contextService.getValue(Constants.SearchContext.SearchViewFocusedKey.serialize())) {
            const searchView = getSearchView(accessor.get(IViewsService));
            assertReturnsDefined(searchView).toggleQueryDetails(undefined, options?.show);
        }
    }
});
registerAction2(class CloseReplaceAction extends Action2 {
    constructor() {
        super({
            id: "closeReplaceInFilesWidget" /* Constants.SearchCommandIds.CloseReplaceWidgetActionId */,
            title: nls.localize2('CloseReplaceWidget.label', "Close Replace Widget"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceInputBoxFocusedKey),
                primary: 9 /* KeyCode.Escape */,
            },
        });
    }
    run(accessor) {
        const searchView = getSearchView(accessor.get(IViewsService));
        if (searchView) {
            searchView.searchAndReplaceWidget.toggleReplace(false);
            searchView.searchAndReplaceWidget.focus();
        }
        return Promise.resolve(null);
    }
});
registerAction2(class ToggleCaseSensitiveCommandAction extends Action2 {
    constructor() {
        super({
            id: "toggleSearchCaseSensitive" /* Constants.SearchCommandIds.ToggleCaseSensitiveCommandId */,
            title: nls.localize2('ToggleCaseSensitiveCommandId.label', "Toggle Case Sensitive"),
            category,
            keybinding: Object.assign({
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: isMacintosh ? ContextKeyExpr.and(Constants.SearchContext.SearchViewFocusedKey, Constants.SearchContext.FileMatchOrFolderMatchFocusKey.toNegated()) : Constants.SearchContext.SearchViewFocusedKey,
            }, ToggleCaseSensitiveKeybinding)
        });
    }
    async run(accessor) {
        toggleCaseSensitiveCommand(accessor);
    }
});
registerAction2(class ToggleWholeWordCommandAction extends Action2 {
    constructor() {
        super({
            id: "toggleSearchWholeWord" /* Constants.SearchCommandIds.ToggleWholeWordCommandId */,
            title: nls.localize2('ToggleWholeWordCommandId.label', "Toggle Whole Word"),
            keybinding: Object.assign({
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: Constants.SearchContext.SearchViewFocusedKey,
            }, ToggleWholeWordKeybinding),
            category,
        });
    }
    async run(accessor) {
        return toggleWholeWordCommand(accessor);
    }
});
registerAction2(class ToggleRegexCommandAction extends Action2 {
    constructor() {
        super({
            id: "toggleSearchRegex" /* Constants.SearchCommandIds.ToggleRegexCommandId */,
            title: nls.localize2('ToggleRegexCommandId.label', "Toggle Regex"),
            keybinding: Object.assign({
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: Constants.SearchContext.SearchViewFocusedKey,
            }, ToggleRegexKeybinding),
            category,
        });
    }
    async run(accessor) {
        return toggleRegexCommand(accessor);
    }
});
registerAction2(class TogglePreserveCaseAction extends Action2 {
    constructor() {
        super({
            id: "toggleSearchPreserveCase" /* Constants.SearchCommandIds.TogglePreserveCaseId */,
            title: nls.localize2('TogglePreserveCaseId.label', "Toggle Preserve Case"),
            keybinding: Object.assign({
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: Constants.SearchContext.SearchViewFocusedKey,
            }, TogglePreserveCaseKeybinding),
            category,
        });
    }
    async run(accessor) {
        return togglePreserveCaseCommand(accessor);
    }
});
//#endregion
//#region Actions: Opening Matches
registerAction2(class OpenMatchAction extends Action2 {
    constructor() {
        super({
            id: "search.action.openResult" /* Constants.SearchCommandIds.OpenMatch */,
            title: nls.localize2('OpenMatch.label', "Open Match"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
                primary: 3 /* KeyCode.Enter */,
                mac: {
                    primary: 3 /* KeyCode.Enter */,
                    secondary: [2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */]
                },
            },
        });
    }
    run(accessor) {
        const searchView = getSearchView(accessor.get(IViewsService));
        if (searchView) {
            const tree = searchView.getControl();
            const viewer = searchView.getControl();
            const focus = tree.getFocus()[0];
            if (isSearchTreeFolderMatch(focus)) {
                viewer.toggleCollapsed(focus);
            }
            else {
                searchView.open(tree.getFocus()[0], false, false, true);
            }
        }
    }
});
registerAction2(class OpenMatchToSideAction extends Action2 {
    constructor() {
        super({
            id: "search.action.openResultToSide" /* Constants.SearchCommandIds.OpenMatchToSide */,
            title: nls.localize2('OpenMatchToSide.label', "Open Match To Side"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                mac: {
                    primary: 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */
                },
            },
        });
    }
    run(accessor) {
        const searchView = getSearchView(accessor.get(IViewsService));
        if (searchView) {
            const tree = searchView.getControl();
            searchView.open(tree.getFocus()[0], false, true, true);
        }
    }
});
registerAction2(class AddCursorsAtSearchResultsAction extends Action2 {
    constructor() {
        super({
            id: "addCursorsAtSearchResults" /* Constants.SearchCommandIds.AddCursorsAtSearchResults */,
            title: nls.localize2('AddCursorsAtSearchResults.label', "Add Cursors at Search Results"),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 42 /* KeyCode.KeyL */,
            },
            category,
        });
    }
    async run(accessor) {
        const searchView = getSearchView(accessor.get(IViewsService));
        if (searchView) {
            const tree = searchView.getControl();
            searchView.openEditorWithMultiCursor(tree.getFocus()[0]);
        }
    }
});
//#endregion
//#region Actions: Toggling Focus
registerAction2(class FocusNextInputAction extends Action2 {
    constructor() {
        super({
            id: "search.focus.nextInputBox" /* Constants.SearchCommandIds.FocusNextInputActionId */,
            title: nls.localize2('FocusNextInputAction.label', "Focus Next Input"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.or(ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.SearchContext.InputBoxFocusedKey), ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.InputBoxFocusedKey)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */,
            },
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const input = editorService.activeEditor;
        if (input instanceof SearchEditorInput) {
            // cast as we cannot import SearchEditor as a value b/c cyclic dependency.
            editorService.activeEditorPane.focusNextInput();
        }
        const searchView = getSearchView(accessor.get(IViewsService));
        searchView?.focusNextInputBox();
    }
});
registerAction2(class FocusPreviousInputAction extends Action2 {
    constructor() {
        super({
            id: "search.focus.previousInputBox" /* Constants.SearchCommandIds.FocusPreviousInputActionId */,
            title: nls.localize2('FocusPreviousInputAction.label', "Focus Previous Input"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.or(ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.SearchContext.InputBoxFocusedKey), ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.InputBoxFocusedKey, Constants.SearchContext.SearchInputBoxFocusedKey.toNegated())),
                primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
            },
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const input = editorService.activeEditor;
        if (input instanceof SearchEditorInput) {
            // cast as we cannot import SearchEditor as a value b/c cyclic dependency.
            editorService.activeEditorPane.focusPrevInput();
        }
        const searchView = getSearchView(accessor.get(IViewsService));
        searchView?.focusPreviousInputBox();
    }
});
registerAction2(class FocusSearchFromResultsAction extends Action2 {
    constructor() {
        super({
            id: "search.action.focusSearchFromResults" /* Constants.SearchCommandIds.FocusSearchFromResults */,
            title: nls.localize2('FocusSearchFromResults.label', "Focus Search From Results"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, ContextKeyExpr.or(Constants.SearchContext.FirstMatchFocusKey, CONTEXT_ACCESSIBILITY_MODE_ENABLED)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
            },
        });
    }
    run(accessor) {
        const searchView = getSearchView(accessor.get(IViewsService));
        searchView?.focusPreviousInputBox();
    }
});
registerAction2(class ToggleSearchOnTypeAction extends Action2 {
    static { this.searchOnTypeKey = 'search.searchOnType'; }
    constructor() {
        super({
            id: "workbench.action.toggleSearchOnType" /* Constants.SearchCommandIds.ToggleSearchOnTypeActionId */,
            title: nls.localize2('toggleTabs', "Toggle Search on Type"),
            category,
        });
    }
    async run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const searchOnType = configurationService.getValue(ToggleSearchOnTypeAction.searchOnTypeKey);
        return configurationService.updateValue(ToggleSearchOnTypeAction.searchOnTypeKey, !searchOnType);
    }
});
registerAction2(class FocusSearchListCommandAction extends Action2 {
    constructor() {
        super({
            id: "search.action.focusSearchList" /* Constants.SearchCommandIds.FocusSearchListCommandID */,
            title: nls.localize2('focusSearchListCommandLabel', "Focus List"),
            category,
            f1: true
        });
    }
    async run(accessor) {
        focusSearchListCommand(accessor);
    }
});
registerAction2(class FocusNextSearchResultAction extends Action2 {
    constructor() {
        super({
            id: "search.action.focusNextSearchResult" /* Constants.SearchCommandIds.FocusNextSearchResultActionId */,
            title: nls.localize2('FocusNextSearchResult.label', "Focus Next Search Result"),
            keybinding: [{
                    primary: 62 /* KeyCode.F4 */,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                }],
            category,
            f1: true,
            precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, SearchEditorConstants.InSearchEditor),
        });
    }
    async run(accessor) {
        return await focusNextSearchResult(accessor);
    }
});
registerAction2(class FocusPreviousSearchResultAction extends Action2 {
    constructor() {
        super({
            id: "search.action.focusPreviousSearchResult" /* Constants.SearchCommandIds.FocusPreviousSearchResultActionId */,
            title: nls.localize2('FocusPreviousSearchResult.label', "Focus Previous Search Result"),
            keybinding: [{
                    primary: 1024 /* KeyMod.Shift */ | 62 /* KeyCode.F4 */,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                }],
            category,
            f1: true,
            precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, SearchEditorConstants.InSearchEditor),
        });
    }
    async run(accessor) {
        return await focusPreviousSearchResult(accessor);
    }
});
registerAction2(class ReplaceInFilesAction extends Action2 {
    constructor() {
        super({
            id: "workbench.action.replaceInFiles" /* Constants.SearchCommandIds.ReplaceInFilesActionId */,
            title: nls.localize2('replaceInFiles', "Replace in Files"),
            keybinding: [{
                    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 38 /* KeyCode.KeyH */,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                }],
            category,
            f1: true,
            precondition: IsSessionsWindowContext.negate(),
            menu: [{
                    id: MenuId.MenubarEditMenu,
                    group: '4_find_global',
                    order: 2,
                    when: IsSessionsWindowContext.negate(),
                }],
        });
    }
    async run(accessor) {
        return await findOrReplaceInFiles(accessor, true);
    }
});
//#endregion
//#region Helpers
function toggleCaseSensitiveCommand(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.toggleCaseSensitive();
}
function toggleWholeWordCommand(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.toggleWholeWords();
}
function toggleRegexCommand(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.toggleRegex();
}
function togglePreserveCaseCommand(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.togglePreserveCase();
}
const focusSearchListCommand = accessor => {
    const viewsService = accessor.get(IViewsService);
    openSearchView(viewsService).then(searchView => {
        searchView?.moveFocusToResults();
    });
};
async function focusNextSearchResult(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
        // cast as we cannot import SearchEditor as a value b/c cyclic dependency.
        return editorService.activeEditorPane.focusNextResult();
    }
    return openSearchView(accessor.get(IViewsService)).then(searchView => searchView?.selectNextMatch());
}
async function focusPreviousSearchResult(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
        // cast as we cannot import SearchEditor as a value b/c cyclic dependency.
        return editorService.activeEditorPane.focusPreviousResult();
    }
    return openSearchView(accessor.get(IViewsService)).then(searchView => searchView?.selectPreviousMatch());
}
async function findOrReplaceInFiles(accessor, expandSearchReplaceWidget) {
    return openSearchView(accessor.get(IViewsService), false).then(openedView => {
        if (openedView) {
            const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
            searchAndReplaceWidget.toggleReplace(expandSearchReplaceWidget);
            const updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: !expandSearchReplaceWidget });
            openedView.searchAndReplaceWidget.focus(undefined, updatedText, updatedText);
        }
    });
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQWN0aW9uc05hdi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaEFjdGlvbnNOYXYudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFFMUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sS0FBSyxTQUFTLE1BQU0sd0JBQXdCLENBQUM7QUFDcEQsT0FBTyxLQUFLLHFCQUFxQixNQUFNLHlDQUF5QyxDQUFDO0FBRWpGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHbEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDRCQUE0QixFQUFFLHFCQUFxQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckwsT0FBTyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDakYsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbkUsT0FBTyxFQUFvRCx1QkFBdUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWxJLGdEQUFnRDtBQUNoRCxlQUFlLENBQUMsTUFBTSx3QkFBeUIsU0FBUSxPQUFPO0lBQzdEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSwwR0FBdUQ7WUFDekQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0NBQWdDLEVBQUUsc0JBQXNCLENBQUM7WUFDOUUsUUFBUTtZQUNSLFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxxQkFBcUIsQ0FBQyxjQUFjLENBQUM7Z0JBQzNHLE9BQU8sRUFBRSxtREFBNkIsd0JBQWU7YUFDckQ7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBQ0QsR0FBRyxDQUFDLFFBQTBCLEVBQUUsR0FBRyxJQUFlO1FBQ2pELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQW1DLENBQUM7UUFDMUQsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7UUFDdkYsSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDOUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxnQkFBaUMsQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkcsQ0FBQzthQUFNLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUM5RixNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQzlELG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDL0UsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSxrQkFBbUIsU0FBUSxPQUFPO0lBQ3ZEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSx5RkFBdUQ7WUFDekQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsMEJBQTBCLEVBQUUsc0JBQXNCLENBQUM7WUFDeEUsUUFBUTtZQUNSLFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLHlCQUF5QixDQUFDO2dCQUN6SCxPQUFPLHdCQUFnQjthQUN2QjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFDRCxHQUFHLENBQUMsUUFBMEI7UUFFN0IsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUM5RCxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkQsVUFBVSxDQUFDLHNCQUFzQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzNDLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDOUIsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxNQUFNLGdDQUFpQyxTQUFRLE9BQU87SUFFckU7UUFHQyxLQUFLLENBQUM7WUFDTCxFQUFFLDJGQUF5RDtZQUMzRCxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxvQ0FBb0MsRUFBRSx1QkFBdUIsQ0FBQztZQUNuRixRQUFRO1lBQ1IsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ3pCLE1BQU0sNkNBQW1DO2dCQUN6QyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsb0JBQW9CLEVBQUUsU0FBUyxDQUFDLGFBQWEsQ0FBQyw4QkFBOEIsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLG9CQUFvQjthQUN2TSxFQUFFLDZCQUE2QixDQUFDO1NBRWpDLENBQUMsQ0FBQztJQUVKLENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQzVDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSw0QkFBNkIsU0FBUSxPQUFPO0lBQ2pFO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxtRkFBcUQ7WUFDdkQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0NBQWdDLEVBQUUsbUJBQW1CLENBQUM7WUFDM0UsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ3pCLE1BQU0sNkNBQW1DO2dCQUN6QyxJQUFJLEVBQUUsU0FBUyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0I7YUFDbEQsRUFBRSx5QkFBeUIsQ0FBQztZQUM3QixRQUFRO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsT0FBTyxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN6QyxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZUFBZSxDQUFDLE1BQU0sd0JBQXlCLFNBQVEsT0FBTztJQUM3RDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsMkVBQWlEO1lBQ25ELEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLDRCQUE0QixFQUFFLGNBQWMsQ0FBQztZQUNsRSxVQUFVLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQztnQkFDekIsTUFBTSw2Q0FBbUM7Z0JBQ3pDLElBQUksRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLG9CQUFvQjthQUNsRCxFQUFFLHFCQUFxQixDQUFDO1lBQ3pCLFFBQVE7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRVEsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUM1QyxPQUFPLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSx3QkFBeUIsU0FBUSxPQUFPO0lBQzdEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxrRkFBaUQ7WUFDbkQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsNEJBQTRCLEVBQUUsc0JBQXNCLENBQUM7WUFDMUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ3pCLE1BQU0sNkNBQW1DO2dCQUN6QyxJQUFJLEVBQUUsU0FBUyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0I7YUFDbEQsRUFBRSw0QkFBNEIsQ0FBQztZQUNoQyxRQUFRO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsT0FBTyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM1QyxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsWUFBWTtBQUNaLGtDQUFrQztBQUNsQyxlQUFlLENBQUMsTUFBTSxlQUFnQixTQUFRLE9BQU87SUFDcEQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLHVFQUFzQztZQUN4QyxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxZQUFZLENBQUM7WUFDckQsUUFBUTtZQUNSLFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDO2dCQUN4SCxPQUFPLHVCQUFlO2dCQUN0QixHQUFHLEVBQUU7b0JBQ0osT0FBTyx1QkFBZTtvQkFDdEIsU0FBUyxFQUFFLENBQUMsc0RBQWtDLENBQUM7aUJBQy9DO2FBQ0Q7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBQ0QsR0FBRyxDQUFDLFFBQTBCO1FBQzdCLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDOUQsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixNQUFNLElBQUksR0FBdUUsVUFBVSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3pHLE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN2QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFakMsSUFBSSx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNwQyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQy9CLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxVQUFVLENBQUMsSUFBSSxDQUFtQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMzRSxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSxxQkFBc0IsU0FBUSxPQUFPO0lBQzFEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxtRkFBNEM7WUFDOUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsb0JBQW9CLENBQUM7WUFDbkUsUUFBUTtZQUNSLFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDO2dCQUN4SCxPQUFPLEVBQUUsaURBQThCO2dCQUN2QyxHQUFHLEVBQUU7b0JBQ0osT0FBTyxFQUFFLGdEQUE4QjtpQkFDdkM7YUFDRDtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFDRCxHQUFHLENBQUMsUUFBMEI7UUFDN0IsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUM5RCxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLE1BQU0sSUFBSSxHQUF1RSxVQUFVLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDekcsVUFBVSxDQUFDLElBQUksQ0FBbUIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUUsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSwrQkFBZ0MsU0FBUSxPQUFPO0lBQ3BFO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSx3RkFBc0Q7WUFDeEQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsaUNBQWlDLEVBQUUsK0JBQStCLENBQUM7WUFDeEYsVUFBVSxFQUFFO2dCQUNYLE1BQU0sNkNBQW1DO2dCQUN6QyxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLG9CQUFvQixFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUM7Z0JBQ3hILE9BQU8sRUFBRSxtREFBNkIsd0JBQWU7YUFDckQ7WUFDRCxRQUFRO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUM5RCxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLE1BQU0sSUFBSSxHQUF1RSxVQUFVLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDekcsVUFBVSxDQUFDLHlCQUF5QixDQUFtQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1RSxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILFlBQVk7QUFDWixpQ0FBaUM7QUFDakMsZUFBZSxDQUFDLE1BQU0sb0JBQXFCLFNBQVEsT0FBTztJQUN6RDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUscUZBQW1EO1lBQ3JELEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLDRCQUE0QixFQUFFLGtCQUFrQixDQUFDO1lBQ3RFLFFBQVE7WUFDUixVQUFVLEVBQUU7Z0JBQ1gsTUFBTSw2Q0FBbUM7Z0JBQ3pDLElBQUksRUFBRSxjQUFjLENBQUMsRUFBRSxDQUN0QixjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLGNBQWMsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLEVBQ3BHLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxTQUFTLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzlHLE9BQU8sRUFBRSxzREFBa0M7YUFDM0M7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRVEsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUM1QyxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUM7UUFDekMsSUFBSSxLQUFLLFlBQVksaUJBQWlCLEVBQUUsQ0FBQztZQUN4QywwRUFBMEU7WUFDekUsYUFBYSxDQUFDLGdCQUFpQyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ25FLENBQUM7UUFFRCxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBQzlELFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxDQUFDO0lBQ2pDLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSx3QkFBeUIsU0FBUSxPQUFPO0lBQzdEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSw2RkFBdUQ7WUFDekQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0NBQWdDLEVBQUUsc0JBQXNCLENBQUM7WUFDOUUsUUFBUTtZQUNSLFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQ3RCLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMsa0JBQWtCLENBQUMsRUFDcEcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLG9CQUFvQixFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMsa0JBQWtCLEVBQUUsU0FBUyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO2dCQUM1SyxPQUFPLEVBQUUsb0RBQWdDO2FBQ3pDO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNuRCxNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsWUFBWSxDQUFDO1FBQ3pDLElBQUksS0FBSyxZQUFZLGlCQUFpQixFQUFFLENBQUM7WUFDeEMsMEVBQTBFO1lBQ3pFLGFBQWEsQ0FBQyxnQkFBaUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNuRSxDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUM5RCxVQUFVLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztJQUNyQyxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZUFBZSxDQUFDLE1BQU0sNEJBQTZCLFNBQVEsT0FBTztJQUNqRTtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsZ0dBQW1EO1lBQ3JELEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLDJCQUEyQixDQUFDO1lBQ2pGLFFBQVE7WUFDUixVQUFVLEVBQUU7Z0JBQ1gsTUFBTSw2Q0FBbUM7Z0JBQ3pDLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsb0JBQW9CLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLGtCQUFrQixFQUFFLGtDQUFrQyxDQUFDLENBQUM7Z0JBQ3pLLE9BQU8sRUFBRSxvREFBZ0M7YUFDekM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBQ0QsR0FBRyxDQUFDLFFBQTBCO1FBQzdCLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDOUQsVUFBVSxFQUFFLHFCQUFxQixFQUFFLENBQUM7SUFDckMsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxNQUFNLHdCQUF5QixTQUFRLE9BQU87YUFDckMsb0JBQWUsR0FBRyxxQkFBcUIsQ0FBQztJQUVoRTtRQUVDLEtBQUssQ0FBQztZQUNMLEVBQUUsbUdBQXVEO1lBQ3pELEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRSx1QkFBdUIsQ0FBQztZQUMzRCxRQUFRO1NBQ1IsQ0FBQyxDQUFDO0lBRUosQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDakUsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFVLHdCQUF3QixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3RHLE9BQU8sb0JBQW9CLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLGVBQWUsRUFBRSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ2xHLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSw0QkFBNkIsU0FBUSxPQUFPO0lBRWpFO1FBRUMsS0FBSyxDQUFDO1lBQ0wsRUFBRSwyRkFBcUQ7WUFDdkQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsWUFBWSxDQUFDO1lBQ2pFLFFBQVE7WUFDUixFQUFFLEVBQUUsSUFBSTtTQUNSLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQzVDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSwyQkFBNEIsU0FBUSxPQUFPO0lBQ2hFO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxzR0FBMEQ7WUFDNUQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsMEJBQTBCLENBQUM7WUFDL0UsVUFBVSxFQUFFLENBQUM7b0JBQ1osT0FBTyxxQkFBWTtvQkFDbkIsTUFBTSw2Q0FBbUM7aUJBQ3pDLENBQUM7WUFDRixRQUFRO1lBQ1IsRUFBRSxFQUFFLElBQUk7WUFDUixZQUFZLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLHFCQUFxQixDQUFDLGNBQWMsQ0FBQztTQUMvRyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRVEsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUM1QyxPQUFPLE1BQU0scUJBQXFCLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDOUMsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxNQUFNLCtCQUFnQyxTQUFRLE9BQU87SUFDcEU7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLDhHQUE4RDtZQUNoRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxpQ0FBaUMsRUFBRSw4QkFBOEIsQ0FBQztZQUN2RixVQUFVLEVBQUUsQ0FBQztvQkFDWixPQUFPLEVBQUUsNkNBQXlCO29CQUNsQyxNQUFNLDZDQUFtQztpQkFDekMsQ0FBQztZQUNGLFFBQVE7WUFDUixFQUFFLEVBQUUsSUFBSTtZQUNSLFlBQVksRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLEVBQUUscUJBQXFCLENBQUMsY0FBYyxDQUFDO1NBQy9HLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQzVDLE9BQU8sTUFBTSx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNsRCxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZUFBZSxDQUFDLE1BQU0sb0JBQXFCLFNBQVEsT0FBTztJQUN6RDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsMkZBQW1EO1lBQ3JELEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLGdCQUFnQixFQUFFLGtCQUFrQixDQUFDO1lBQzFELFVBQVUsRUFBRSxDQUFDO29CQUNaLE9BQU8sRUFBRSxtREFBNkIsd0JBQWU7b0JBQ3JELE1BQU0sNkNBQW1DO2lCQUN6QyxDQUFDO1lBQ0YsUUFBUTtZQUNSLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLHVCQUF1QixDQUFDLE1BQU0sRUFBRTtZQUM5QyxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGVBQWU7b0JBQzFCLEtBQUssRUFBRSxlQUFlO29CQUN0QixLQUFLLEVBQUUsQ0FBQztvQkFDUixJQUFJLEVBQUUsdUJBQXVCLENBQUMsTUFBTSxFQUFFO2lCQUN0QyxDQUFDO1NBQ0YsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsT0FBTyxNQUFNLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNuRCxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsWUFBWTtBQUVaLGlCQUFpQjtBQUNqQixTQUFTLDBCQUEwQixDQUFDLFFBQTBCO0lBQzdELE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDOUQsVUFBVSxFQUFFLG1CQUFtQixFQUFFLENBQUM7QUFDbkMsQ0FBQztBQUVELFNBQVMsc0JBQXNCLENBQUMsUUFBMEI7SUFDekQsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztJQUM5RCxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztBQUNoQyxDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxRQUEwQjtJQUNyRCxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQzlELFVBQVUsRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUMzQixDQUFDO0FBRUQsU0FBUyx5QkFBeUIsQ0FBQyxRQUEwQjtJQUM1RCxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQzlELFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxDQUFDO0FBQ2xDLENBQUM7QUFFRCxNQUFNLHNCQUFzQixHQUFvQixRQUFRLENBQUMsRUFBRTtJQUMxRCxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ2pELGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDOUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLENBQUM7SUFDbEMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUM7QUFFRixLQUFLLFVBQVUscUJBQXFCLENBQUMsUUFBMEI7SUFDOUQsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUNuRCxNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsWUFBWSxDQUFDO0lBQ3pDLElBQUksS0FBSyxZQUFZLGlCQUFpQixFQUFFLENBQUM7UUFDeEMsMEVBQTBFO1FBQzFFLE9BQVEsYUFBYSxDQUFDLGdCQUFpQyxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQzNFLENBQUM7SUFFRCxPQUFPLGNBQWMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7QUFDdEcsQ0FBQztBQUVELEtBQUssVUFBVSx5QkFBeUIsQ0FBQyxRQUEwQjtJQUNsRSxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ25ELE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUM7SUFDekMsSUFBSSxLQUFLLFlBQVksaUJBQWlCLEVBQUUsQ0FBQztRQUN4QywwRUFBMEU7UUFDMUUsT0FBUSxhQUFhLENBQUMsZ0JBQWlDLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztJQUMvRSxDQUFDO0lBRUQsT0FBTyxjQUFjLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUM7QUFDMUcsQ0FBQztBQUVELEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxRQUEwQixFQUFFLHlCQUFrQztJQUNqRyxPQUFPLGNBQWMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUMzRSxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLE1BQU0sc0JBQXNCLEdBQUcsVUFBVSxDQUFDLHNCQUFzQixDQUFDO1lBQ2pFLHNCQUFzQixDQUFDLGFBQWEsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1lBRWhFLE1BQU0sV0FBVyxHQUFHLFVBQVUsQ0FBQyxtQ0FBbUMsQ0FBQyxFQUFFLG1CQUFtQixFQUFFLENBQUMseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO1lBQ3hILFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUM5RSxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBQ0QsWUFBWSJ9