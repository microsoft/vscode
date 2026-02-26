/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from '../../../../base/common/platform.js';
import * as nls from '../../../../nls.js';
import { ICommandHandler } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import * as Constants from '../common/constants.js';
import * as SearchEditorConstants from '../../searchEditor/browser/constants.js';
import { SearchEditor } from '../../searchEditor/browser/searchEditor.js';
import { SearchEditorInput } from '../../searchEditor/browser/searchEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from '../../../../editor/contrib/find/browser/findModel.js';
import { category, getSearchView, openSearchView } from './searchActionsBase.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { getActiveElement } from '../../../../base/browser/dom.js';
import { FileMatchOrMatch, RenderableMatch, ISearchResult, isSearchTreeFolderMatch } from './searchTreeModel/searchTreeCommon.js';

//#region Actions: Changing Search Input Options
registerAction2(class ToggleQueryDetailsAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.ToggleQueryDetailsActionId,
			title: nls.localize2('ToggleQueryDetailsAction.label', "Toggle Query Details"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.or(Constants.SearchContext.SearchViewFocusedKey, SearchEditorConstants.InSearchEditor),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyJ,
			},
		});
	}
	run(accessor: ServicesAccessor, ...args: unknown[]) {
		const options = args[0] as { show?: boolean } | undefined;
		const contextService = accessor.get(IContextKeyService).getContext(getActiveElement());
		if (contextService.getValue(SearchEditorConstants.InSearchEditor.serialize())) {
			(accessor.get(IEditorService).activeEditorPane as SearchEditor).toggleQueryDetails(options?.show);
		} else if (contextService.getValue(Constants.SearchContext.SearchViewFocusedKey.serialize())) {
			const searchView = getSearchView(accessor.get(IViewsService));
			assertReturnsDefined(searchView).toggleQueryDetails(undefined, options?.show);
		}
	}
});

registerAction2(class CloseReplaceAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.CloseReplaceWidgetActionId,
			title: nls.localize2('CloseReplaceWidget.label', "Close Replace Widget"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceInputBoxFocusedKey),
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
});

registerAction2(class ToggleCaseSensitiveCommandAction extends Action2 {

	constructor(
	) {

		super({
			id: Constants.SearchCommandIds.ToggleCaseSensitiveCommandId,
			title: nls.localize2('ToggleCaseSensitiveCommandId.label', "Toggle Case Sensitive"),
			category,
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: isMacintosh ? ContextKeyExpr.and(Constants.SearchContext.SearchViewFocusedKey, Constants.SearchContext.FileMatchOrFolderMatchFocusKey.toNegated()) : Constants.SearchContext.SearchViewFocusedKey,
			}, ToggleCaseSensitiveKeybinding)

		});

	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		toggleCaseSensitiveCommand(accessor);
	}
});

registerAction2(class ToggleWholeWordCommandAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.ToggleWholeWordCommandId,
			title: nls.localize2('ToggleWholeWordCommandId.label', "Toggle Whole Word"),
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchContext.SearchViewFocusedKey,
			}, ToggleWholeWordKeybinding),
			category,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return toggleWholeWordCommand(accessor);
	}
});

registerAction2(class ToggleRegexCommandAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.ToggleRegexCommandId,
			title: nls.localize2('ToggleRegexCommandId.label', "Toggle Regex"),
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchContext.SearchViewFocusedKey,
			}, ToggleRegexKeybinding),
			category,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return toggleRegexCommand(accessor);
	}
});

registerAction2(class TogglePreserveCaseAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.TogglePreserveCaseId,
			title: nls.localize2('TogglePreserveCaseId.label', "Toggle Preserve Case"),
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchContext.SearchViewFocusedKey,
			}, TogglePreserveCaseKeybinding),
			category,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return togglePreserveCaseCommand(accessor);
	}
});

//#endregion
//#region Actions: Opening Matches
registerAction2(class OpenMatchAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.OpenMatch,
			title: nls.localize2('OpenMatch.label', "Open Match"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
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
			const tree: WorkbenchCompressibleAsyncDataTree<ISearchResult, RenderableMatch> = searchView.getControl();
			const viewer = searchView.getControl();
			const focus = tree.getFocus()[0];

			if (isSearchTreeFolderMatch(focus)) {
				viewer.toggleCollapsed(focus);
			} else {
				searchView.open(<FileMatchOrMatch>tree.getFocus()[0], false, false, true);
			}
		}
	}
});

registerAction2(class OpenMatchToSideAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.OpenMatchToSide,
			title: nls.localize2('OpenMatchToSide.label', "Open Match To Side"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
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
			const tree: WorkbenchCompressibleAsyncDataTree<ISearchResult, RenderableMatch> = searchView.getControl();
			searchView.open(<FileMatchOrMatch>tree.getFocus()[0], false, true, true);
		}
	}
});

registerAction2(class AddCursorsAtSearchResultsAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.AddCursorsAtSearchResults,
			title: nls.localize2('AddCursorsAtSearchResults.label', "Add Cursors at Search Results"),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
			},
			category,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			const tree: WorkbenchCompressibleAsyncDataTree<ISearchResult, RenderableMatch> = searchView.getControl();
			searchView.openEditorWithMultiCursor(<FileMatchOrMatch>tree.getFocus()[0]);
		}
	}
});

//#endregion
//#region Actions: Toggling Focus
registerAction2(class FocusNextInputAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.FocusNextInputActionId,
			title: nls.localize2('FocusNextInputAction.label', "Focus Next Input"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.or(
					ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.SearchContext.InputBoxFocusedKey),
					ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.InputBoxFocusedKey)),
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
});

registerAction2(class FocusPreviousInputAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.FocusPreviousInputActionId,
			title: nls.localize2('FocusPreviousInputAction.label', "Focus Previous Input"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.or(
					ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.SearchContext.InputBoxFocusedKey),
					ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.InputBoxFocusedKey, Constants.SearchContext.SearchInputBoxFocusedKey.toNegated())),
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
});

registerAction2(class FocusSearchFromResultsAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.FocusSearchFromResults,
			title: nls.localize2('FocusSearchFromResults.label', "Focus Search From Results"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, ContextKeyExpr.or(Constants.SearchContext.FirstMatchFocusKey, CONTEXT_ACCESSIBILITY_MODE_ENABLED)),
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
			},
		});
	}
	run(accessor: ServicesAccessor) {
		const searchView = getSearchView(accessor.get(IViewsService));
		searchView?.focusPreviousInputBox();
	}
});

registerAction2(class ToggleSearchOnTypeAction extends Action2 {
	private static readonly searchOnTypeKey = 'search.searchOnType';

	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.ToggleSearchOnTypeActionId,
			title: nls.localize2('toggleTabs', "Toggle Search on Type"),
			category,
		});

	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		const configurationService = accessor.get(IConfigurationService);
		const searchOnType = configurationService.getValue<boolean>(ToggleSearchOnTypeAction.searchOnTypeKey);
		return configurationService.updateValue(ToggleSearchOnTypeAction.searchOnTypeKey, !searchOnType);
	}
});

registerAction2(class FocusSearchListCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.FocusSearchListCommandID,
			title: nls.localize2('focusSearchListCommandLabel', "Focus List"),
			category,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		focusSearchListCommand(accessor);
	}
});

registerAction2(class FocusNextSearchResultAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.FocusNextSearchResultActionId,
			title: nls.localize2('FocusNextSearchResult.label', "Focus Next Search Result"),
			keybinding: [{
				primary: KeyCode.F4,
				weight: KeybindingWeight.WorkbenchContrib,
			}],
			category,
			f1: true,
			precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, SearchEditorConstants.InSearchEditor),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return await focusNextSearchResult(accessor);
	}
});

registerAction2(class FocusPreviousSearchResultAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.FocusPreviousSearchResultActionId,
			title: nls.localize2('FocusPreviousSearchResult.label', "Focus Previous Search Result"),
			keybinding: [{
				primary: KeyMod.Shift | KeyCode.F4,
				weight: KeybindingWeight.WorkbenchContrib,
			}],
			category,
			f1: true,
			precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, SearchEditorConstants.InSearchEditor),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return await focusPreviousSearchResult(accessor);
	}
});

registerAction2(class ReplaceInFilesAction extends Action2 {
	constructor() {
		super({
			id: Constants.SearchCommandIds.ReplaceInFilesActionId,
			title: nls.localize2('replaceInFiles', "Replace in Files"),
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH,
				weight: KeybindingWeight.WorkbenchContrib,
			}],
			category,
			f1: true,
			menu: [{
				id: MenuId.MenubarEditMenu,
				group: '4_find_global',
				order: 2
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return await findOrReplaceInFiles(accessor, true);
	}
});

//#endregion

//#region Helpers
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

const focusSearchListCommand: ICommandHandler = accessor => {
	const viewsService = accessor.get(IViewsService);
	openSearchView(viewsService).then(searchView => {
		searchView?.moveFocusToResults();
	});
};

async function focusNextSearchResult(accessor: ServicesAccessor): Promise<any> {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
		return (editorService.activeEditorPane as SearchEditor).focusNextResult();
	}

	return openSearchView(accessor.get(IViewsService)).then(searchView => searchView?.selectNextMatch());
}

async function focusPreviousSearchResult(accessor: ServicesAccessor): Promise<any> {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
		return (editorService.activeEditorPane as SearchEditor).focusPreviousResult();
	}

	return openSearchView(accessor.get(IViewsService)).then(searchView => searchView?.selectPreviousMatch());
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
//#endregion
