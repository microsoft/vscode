/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { IViewsService } from 'vs/workbench/common/views';
import * as Constants from 'vs/workbench/contrib/search/common/constants';
import * as SearchEditorConstants from 'vs/workbench/contrib/searchEditor/browser/constants';
import { FileMatchOrMatch, FolderMatch, RenderableMatch } from 'vs/workbench/contrib/search/browser/searchModel';
import { SearchEditor } from 'vs/workbench/contrib/searchEditor/browser/searchEditor';
import { SearchEditorInput } from 'vs/workbench/contrib/searchEditor/browser/searchEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { assertIsDefined } from 'vs/base/common/types';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from 'vs/editor/contrib/find/browser/findModel';
import { category, getSearchView, openSearchView } from 'vs/workbench/contrib/search/browser/searchActionsBase';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';

//#region Actions: Changing Search Input Options
registerAction2(class ToggleQueryDetailsAction extends Action2 {
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
	run(accessor: ServicesAccessor, ...args: any[]) {
		const contextService = accessor.get(IContextKeyService).getContext(document.activeElement);
		if (contextService.getValue(SearchEditorConstants.InSearchEditor.serialize())) {
			(accessor.get(IEditorService).activeEditorPane as SearchEditor).toggleQueryDetails(args[0]?.show);
		} else if (contextService.getValue(Constants.SearchViewFocusedKey.serialize())) {
			const searchView = getSearchView(accessor.get(IViewsService));
			assertIsDefined(searchView).toggleQueryDetails(undefined, args[0]?.show);
		}
	}
});

registerAction2(class CloseReplaceAction extends Action2 {
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
});

registerAction2(class ToggleCaseSensitiveCommandAction extends Action2 {

	constructor(
	) {

		super({
			id: Constants.ToggleCaseSensitiveCommandId,
			title: {
				value: nls.localize('ToggleCaseSensitiveCommandId.label', "Toggle Case Sensitive"),
				original: 'Toggle Case Sensitive'
			},
			category,
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: isMacintosh ? ContextKeyExpr.and(Constants.SearchViewFocusedKey, Constants.FileMatchOrFolderMatchFocusKey.toNegated()) : Constants.SearchViewFocusedKey,
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
			id: Constants.ToggleWholeWordCommandId,
			title: {
				value: nls.localize('ToggleWholeWordCommandId.label', 'Toggle Whole Word'),
				original: 'Toggle Whole Word'
			},
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchViewFocusedKey,
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
			id: Constants.ToggleRegexCommandId,
			title: {
				value: nls.localize('ToggleRegexCommandId.label', 'Toggle Regex'),
				original: 'Toggle Regex'
			},
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchViewFocusedKey,
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
			id: Constants.TogglePreserveCaseId,
			title: {
				value: nls.localize('TogglePreserveCaseId.label', 'Toggle Preserve Case'),
				original: 'Toggle Preserve Case'
			},
			keybinding: Object.assign({
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchViewFocusedKey,
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
});

registerAction2(class OpenMatchToSideAction extends Action2 {
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
});

registerAction2(class AddCursorsAtSearchResultsAction extends Action2 {
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
			category,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		const searchView = getSearchView(accessor.get(IViewsService));
		if (searchView) {
			const tree: WorkbenchCompressibleObjectTree<RenderableMatch> = searchView.getControl();
			searchView.openEditorWithMultiCursor(<FileMatchOrMatch>tree.getFocus()[0]);
		}
	}
});

//#endregion
//#region Actions: Toggling Focus
registerAction2(class FocusNextInputAction extends Action2 {
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
});

registerAction2(class FocusPreviousInputAction extends Action2 {
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
});

registerAction2(class FocusSearchFromResultsAction extends Action2 {
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
				when: ContextKeyExpr.and(Constants.SearchViewVisibleKey, ContextKeyExpr.or(Constants.FirstMatchFocusKey, CONTEXT_ACCESSIBILITY_MODE_ENABLED)),
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
			id: Constants.ToggleSearchOnTypeActionId,
			title: {
				value: nls.localize('toggleTabs', 'Toggle Search on Type'),
				original: 'Toggle Search on Type'
			},
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
			id: Constants.FocusSearchListCommandID,
			title: {
				value: nls.localize('focusSearchListCommandLabel', "Focus List"),
				original: 'Focus List'
			},
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
			id: Constants.FocusNextSearchResultActionId,
			title: {
				value: nls.localize('FocusNextSearchResult.label', 'Focus Next Search Result'),
				original: 'Focus Next Search Result'
			},
			keybinding: [{
				primary: KeyCode.F4,
				weight: KeybindingWeight.WorkbenchContrib,
			}],
			category,
			f1: true,
			precondition: ContextKeyExpr.or(Constants.HasSearchResults, SearchEditorConstants.InSearchEditor),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return await focusNextSearchResult(accessor);
	}
});

registerAction2(class FocusPreviousSearchResultAction extends Action2 {
	constructor() {
		super({
			id: Constants.FocusPreviousSearchResultActionId,
			title: {
				value: nls.localize('FocusPreviousSearchResult.label', 'Focus Previous Search Result'),
				original: 'Focus Previous Search Result'
			},
			keybinding: [{
				primary: KeyMod.Shift | KeyCode.F4,
				weight: KeybindingWeight.WorkbenchContrib,
			}],
			category,
			f1: true,
			precondition: ContextKeyExpr.or(Constants.HasSearchResults, SearchEditorConstants.InSearchEditor),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		return await focusPreviousSearchResult(accessor);
	}
});

registerAction2(class ReplaceInFilesAction extends Action2 {
	constructor() {
		super({
			id: Constants.ReplaceInFilesActionId,
			title: {
				value: nls.localize('replaceInFiles', 'Replace in Files'),
				original: 'Replace in Files'
			},
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
//#endregion
