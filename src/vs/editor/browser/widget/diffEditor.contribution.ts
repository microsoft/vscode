/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { localize } from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

class DiffReviewNext extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.diffReview.next',
			label: localize('editor.action.diffReview.next', "Go to Next Difference"),
			alias: 'Go to Next Difference',
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			kbOpts: {
				kbExpr: null,
				primary: KeyCode.F7,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		diffEditor?.diffReviewNext();
	}
}

class DiffReviewPrev extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.diffReview.prev',
			label: localize('editor.action.diffReview.prev', "Go to Previous Difference"),
			alias: 'Go to Previous Difference',
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			kbOpts: {
				kbExpr: null,
				primary: KeyMod.Shift | KeyCode.F7,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		diffEditor?.diffReviewPrev();
	}
}

function findFocusedDiffEditor(accessor: ServicesAccessor): IDiffEditor | null {
	const codeEditorService = accessor.get(ICodeEditorService);
	const diffEditors = codeEditorService.listDiffEditors();
	const activeCodeEditor = codeEditorService.getFocusedCodeEditor() ?? codeEditorService.getActiveCodeEditor();
	if (!activeCodeEditor) {
		return null;
	}

	for (let i = 0, len = diffEditors.length; i < len; i++) {
		const diffEditor = <IDiffEditor>diffEditors[i];
		if (diffEditor.getModifiedEditor().getId() === activeCodeEditor.getId() || diffEditor.getOriginalEditor().getId() === activeCodeEditor.getId()) {
			return diffEditor;
		}
	}
	return null;
}

registerEditorAction(DiffReviewNext);
registerEditorAction(DiffReviewPrev);
