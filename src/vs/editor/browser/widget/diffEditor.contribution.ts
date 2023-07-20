/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';


const accessibleDiffViewerCategory: ILocalizedString = {
	value: localize('accessibleDiffViewer', 'Accessible Diff Viewer'),
	original: 'Accessible Diff Viewer',
};

export class DiffReviewNext extends EditorAction2 {
	public static id = 'editor.action.diffReview.next';

	constructor() {
		super({
			id: DiffReviewNext.id,
			title: { value: localize('editor.action.diffReview.next', "Go to Next Difference"), original: 'Go to Next Difference' },
			category: accessibleDiffViewerCategory,
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			keybinding: {
				primary: KeyCode.F7,
				weight: KeybindingWeight.EditorContrib
			},
			f1: true,
		});
	}

	public override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		diffEditor?.diffReviewNext();
	}
}

export class DiffReviewPrev extends EditorAction2 {
	public static id = 'editor.action.diffReview.prev';

	constructor() {
		super({
			id: DiffReviewPrev.id,
			title: { value: localize('editor.action.diffReview.prev', "Go to Previous Difference"), original: 'Go to Previous Difference' },
			category: accessibleDiffViewerCategory,
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			keybinding: {
				primary: KeyMod.Shift | KeyCode.F7,
				weight: KeybindingWeight.EditorContrib
			},
			f1: true,
		});
	}

	public override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		diffEditor?.diffReviewPrev();
	}
}

export function findFocusedDiffEditor(accessor: ServicesAccessor): IDiffEditor | null {
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

registerAction2(DiffReviewNext);
registerAction2(DiffReviewPrev);
