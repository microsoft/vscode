/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/notebookFind.css';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { FindStartFocusAction, getSelectionSearchString, IFindStartOptions, NextMatchFindAction, PreviousMatchFindAction, StartFindAction, StartFindReplaceAction } from '../../../../../../editor/contrib/find/browser/findController.js';
import { localize2 } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';

import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IShowNotebookFindWidgetOptions, NotebookFindContrib } from './notebookFindWidget.js';
import { INotebookCommandContext, NotebookMultiCellAction } from '../../controller/coreActions.js';
import { getNotebookEditorFromEditorPane, INotebookEditor } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CellUri, NotebookFindScopeType } from '../../../common/notebookCommon.js';
import { INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../common/notebookContextKeys.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { CONTEXT_FIND_WIDGET_VISIBLE } from '../../../../../../editor/contrib/find/browser/findModel.js';

registerNotebookContribution(NotebookFindContrib.id, NotebookFindContrib);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.hideFind',
			title: localize2('notebookActions.hideFind', 'Hide Find in Notebook'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, CONTEXT_FIND_WIDGET_VISIBLE),
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib + 5
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		const controller = editor.getContribution<NotebookFindContrib>(NotebookFindContrib.id);
		controller.hide();
		editor.focus();
	}
});

registerAction2(class extends NotebookMultiCellAction {
	constructor() {
		super({
			id: 'notebook.find',
			title: localize2('notebookActions.findInNotebook', 'Find in Notebook'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.or(NOTEBOOK_IS_ACTIVE_EDITOR, INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR), EditorContextKeys.focus.toNegated()),
				primary: KeyCode.KeyF | KeyMod.CtrlCmd,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		const controller = editor.getContribution<NotebookFindContrib>(NotebookFindContrib.id);
		controller.show(undefined, { findScope: { findScopeType: NotebookFindScopeType.None } });
	}
});

function notebookContainsTextModel(uri: URI, textModel: ITextModel) {
	if (textModel.uri.scheme === Schemas.vscodeNotebookCell) {
		const cellUri = CellUri.parse(textModel.uri);
		if (cellUri && isEqual(cellUri.notebook, uri)) {
			return true;
		}
	}

	return false;
}

function getSearchStringOptions(editor: ICodeEditor, opts: IFindStartOptions) {
	// Get the search string result, following the same logic in _start function in 'vs/editor/contrib/find/browser/findController'
	if (opts.seedSearchStringFromSelection === 'single') {
		const selectionSearchString = getSelectionSearchString(editor, opts.seedSearchStringFromSelection, opts.seedSearchStringFromNonEmptySelection);
		if (selectionSearchString) {
			return {
				searchString: selectionSearchString,
				selection: editor.getSelection()
			};
		}
	} else if (opts.seedSearchStringFromSelection === 'multiple' && !opts.updateSearchScope) {
		const selectionSearchString = getSelectionSearchString(editor, opts.seedSearchStringFromSelection);
		if (selectionSearchString) {
			return {
				searchString: selectionSearchString,
				selection: editor.getSelection()
			};
		}
	}

	return undefined;
}

function isNotebookEditorValidForSearch(accessor: ServicesAccessor, editor: INotebookEditor | undefined, codeEditor: ICodeEditor) {
	if (!editor) {
		return false;
	}

	if (!codeEditor.hasModel()) {
		return false;
	}

	if (!editor.hasEditorFocus() && !editor.hasWebviewFocus()) {
		const codeEditorService = accessor.get(ICodeEditorService);
		// check if the active pane contains the active text editor
		const textEditor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
		if (editor.hasModel() && textEditor && textEditor.hasModel() && notebookContainsTextModel(editor.textModel.uri, textEditor.getModel())) {
			// the active text editor is in notebook editor
			return true;
		} else {
			return false;
		}
	}
	return true;
}

function openFindWidget(controller: NotebookFindContrib | undefined, editor: INotebookEditor | undefined, codeEditor: ICodeEditor | undefined, focusWidget: boolean = true) {
	if (!editor || !codeEditor || !controller) {
		return false;
	}

	if (!codeEditor.hasModel()) {
		return false;
	}

	const searchStringOptions = getSearchStringOptions(codeEditor, {
		forceRevealReplace: false,
		seedSearchStringFromSelection: codeEditor.getOption(EditorOption.find).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
		seedSearchStringFromNonEmptySelection: codeEditor.getOption(EditorOption.find).seedSearchStringFromSelection === 'selection',
		seedSearchStringFromGlobalClipboard: codeEditor.getOption(EditorOption.find).globalFindClipboard,
		shouldFocus: FindStartFocusAction.FocusFindInput,
		shouldAnimate: true,
		updateSearchScope: false,
		loop: codeEditor.getOption(EditorOption.find).loop
	});

	let options: IShowNotebookFindWidgetOptions | undefined = undefined;
	const uri = codeEditor.getModel().uri;
	const data = CellUri.parse(uri);
	if (searchStringOptions?.selection && data) {
		const cell = editor.getCellByHandle(data.handle);
		if (cell) {
			options = {
				searchStringSeededFrom: { cell, range: searchStringOptions.selection },
				focus: focusWidget
			};
		}
	} else {
		options = { focus: focusWidget };
	}

	controller.show(searchStringOptions?.searchString, options);
	return true;
}

function findWidgetAction(accessor: ServicesAccessor, codeEditor: ICodeEditor, next: boolean): boolean {
	const editorService = accessor.get(IEditorService);
	const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

	if (!isNotebookEditorValidForSearch(accessor, editor, codeEditor)) {
		return false;
	}

	const controller = editor?.getContribution<NotebookFindContrib>(NotebookFindContrib.id);
	if (!controller) {
		return false;
	}

	// Check if find widget is already visible
	if (controller.isVisible()) {
		// Find widget is open, navigate
		next ? controller.findNext() : controller.findPrevious();
		return true;
	} else {
		// Find widget is not open, open it without focusing the widget (keep focus in editor)
		return openFindWidget(controller, editor, codeEditor, false);
	}
}

async function runFind(accessor: ServicesAccessor, next: boolean): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

	if (!editor) {
		return;
	}

	const controller = editor.getContribution<NotebookFindContrib>(NotebookFindContrib.id);
	if (controller && controller.isVisible()) {
		next ? controller.findNext() : controller.findPrevious();
	}
}

StartFindAction.addImplementation(100, (accessor: ServicesAccessor, codeEditor: ICodeEditor, args: any) => {
	const editorService = accessor.get(IEditorService);
	const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

	if (!isNotebookEditorValidForSearch(accessor, editor, codeEditor)) {
		return false;
	}

	const controller = editor?.getContribution<NotebookFindContrib>(NotebookFindContrib.id);
	return openFindWidget(controller, editor, codeEditor, true);
});

StartFindReplaceAction.addImplementation(100, (accessor: ServicesAccessor, codeEditor: ICodeEditor, args: any) => {
	const editorService = accessor.get(IEditorService);
	const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

	if (!editor) {
		return false;
	}

	if (!codeEditor.hasModel()) {
		return false;
	}

	const controller = editor.getContribution<NotebookFindContrib>(NotebookFindContrib.id);

	const searchStringOptions = getSearchStringOptions(codeEditor, {
		forceRevealReplace: false,
		seedSearchStringFromSelection: codeEditor.getOption(EditorOption.find).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
		seedSearchStringFromNonEmptySelection: codeEditor.getOption(EditorOption.find).seedSearchStringFromSelection === 'selection',
		seedSearchStringFromGlobalClipboard: codeEditor.getOption(EditorOption.find).globalFindClipboard,
		shouldFocus: FindStartFocusAction.FocusFindInput,
		shouldAnimate: true,
		updateSearchScope: false,
		loop: codeEditor.getOption(EditorOption.find).loop
	});

	if (controller) {
		controller.replace(searchStringOptions?.searchString);
		return true;
	}

	return false;
});

NextMatchFindAction.addImplementation(100, (accessor: ServicesAccessor, codeEditor: ICodeEditor, args: any) => {
	return findWidgetAction(accessor, codeEditor, true);
});

PreviousMatchFindAction.addImplementation(100, (accessor: ServicesAccessor, codeEditor: ICodeEditor, args: any) => {
	return findWidgetAction(accessor, codeEditor, false);
});

// Widget-focused keybindings - these handle F3/Shift+F3 when the notebook find widget has focus
// This follows the same pattern as the text editor which has separate keybindings for widget focus
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.findNext.fromWidget',
			title: localize2('notebook.findNext.fromWidget', 'Find Next'),
			keybinding: {
				when: ContextKeyExpr.and(
					NOTEBOOK_EDITOR_FOCUSED,
					CONTEXT_FIND_WIDGET_VISIBLE
				),
				primary: KeyCode.F3,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG, secondary: [KeyCode.F3] },
				weight: KeybindingWeight.WorkbenchContrib + 1
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return runFind(accessor, true);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.findPrevious.fromWidget',
			title: localize2('notebook.findPrevious.fromWidget', 'Find Previous'),
			keybinding: {
				when: ContextKeyExpr.and(
					NOTEBOOK_EDITOR_FOCUSED,
					CONTEXT_FIND_WIDGET_VISIBLE
				),
				primary: KeyMod.Shift | KeyCode.F3,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG, secondary: [KeyMod.Shift | KeyCode.F3] },
				weight: KeybindingWeight.WorkbenchContrib + 1
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return runFind(accessor, false);
	}
});

