/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notebookFind';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ITextModel } from 'vs/editor/common/model';
import { FindStartFocusAction, getSelectionSearchString, IFindStartOptions, StartFindAction, StartFindReplaceAction } from 'vs/editor/contrib/find/browser/findController';
import { localize2 } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IShowNotebookFindWidgetOptions, NotebookFindContrib } from 'vs/workbench/contrib/notebook/browser/contrib/find/notebookFindWidget';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { INotebookCommandContext, NotebookMultiCellAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';

registerNotebookContribution(NotebookFindContrib.id, NotebookFindContrib);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.hideFind',
			title: localize2('notebookActions.hideFind', 'Hide Find in Notebook'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED),
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib
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

		if (context.selectedCells.length > 1) {
			controller.show(undefined, { searchInRanges: true, selectedRanges: editor.getSelections() });
		} else {
			controller.show(undefined, { searchInRanges: false, selectedRanges: [] });
		}
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


StartFindAction.addImplementation(100, (accessor: ServicesAccessor, codeEditor: ICodeEditor, args: any) => {
	const editorService = accessor.get(IEditorService);
	const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

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
		} else {
			return false;
		}
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

	let options: IShowNotebookFindWidgetOptions | undefined = undefined;
	const uri = codeEditor.getModel().uri;
	const data = CellUri.parse(uri);
	if (searchStringOptions?.selection && data) {
		const cell = editor.getCellByHandle(data.handle);
		if (cell) {
			options = {
				searchStringSeededFrom: { cell, range: searchStringOptions.selection },
			};
		}
	}

	controller.show(searchStringOptions?.searchString, options);
	return true;
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
