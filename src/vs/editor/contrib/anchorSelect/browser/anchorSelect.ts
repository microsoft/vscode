/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./anchorSelect';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Selection } from 'vs/editor/common/core/selection';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { TrackedRangeStickiness } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export const SelectionAnchorSet = new RawContextKey('selectionAnchorSet', false);

class SelectionAnchorController implements IEditorContribution {

	public static readonly ID = 'editor.contrib.selectionAnchorController';

	static get(editor: ICodeEditor): SelectionAnchorController | null {
		return editor.getContribution<SelectionAnchorController>(SelectionAnchorController.ID);
	}

	private decorationId: string | undefined;
	private selectionAnchorSetContextKey: IContextKey<boolean>;
	private modelChangeListener: IDisposable;

	constructor(
		private editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.selectionAnchorSetContextKey = SelectionAnchorSet.bindTo(contextKeyService);
		this.modelChangeListener = editor.onDidChangeModel(() => this.selectionAnchorSetContextKey.reset());
	}

	setSelectionAnchor(): void {
		if (this.editor.hasModel()) {
			const position = this.editor.getPosition();
			this.editor.changeDecorations((accessor) => {
				if (this.decorationId) {
					accessor.removeDecoration(this.decorationId);
				}
				this.decorationId = accessor.addDecoration(
					Selection.fromPositions(position, position),
					{
						description: 'selection-anchor',
						stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
						hoverMessage: new MarkdownString().appendText(localize('selectionAnchor', "Selection Anchor")),
						className: 'selection-anchor'
					}
				);
			});
			this.selectionAnchorSetContextKey.set(!!this.decorationId);
			alert(localize('anchorSet', "Anchor set at {0}:{1}", position.lineNumber, position.column));
		}
	}

	goToSelectionAnchor(): void {
		if (this.editor.hasModel() && this.decorationId) {
			const anchorPosition = this.editor.getModel().getDecorationRange(this.decorationId);
			if (anchorPosition) {
				this.editor.setPosition(anchorPosition.getStartPosition());
			}
		}
	}

	selectFromAnchorToCursor(): void {
		if (this.editor.hasModel() && this.decorationId) {
			const start = this.editor.getModel().getDecorationRange(this.decorationId);
			if (start) {
				const end = this.editor.getPosition();
				this.editor.setSelection(Selection.fromPositions(start.getStartPosition(), end));
				this.cancelSelectionAnchor();
			}
		}
	}

	cancelSelectionAnchor(): void {
		if (this.decorationId) {
			const decorationId = this.decorationId;
			this.editor.changeDecorations((accessor) => {
				accessor.removeDecoration(decorationId);
				this.decorationId = undefined;
			});
			this.selectionAnchorSetContextKey.set(false);
		}
	}

	dispose(): void {
		this.cancelSelectionAnchor();
		this.modelChangeListener.dispose();
	}
}

class SetSelectionAnchor extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.setSelectionAnchor',
			label: localize('setSelectionAnchor', "Set Selection Anchor"),
			alias: 'Set Selection Anchor',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyB),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	async run(_accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		SelectionAnchorController.get(editor)?.setSelectionAnchor();
	}
}

class GoToSelectionAnchor extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.goToSelectionAnchor',
			label: localize('goToSelectionAnchor', "Go to Selection Anchor"),
			alias: 'Go to Selection Anchor',
			precondition: SelectionAnchorSet,
		});
	}

	async run(_accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		SelectionAnchorController.get(editor)?.goToSelectionAnchor();
	}
}

class SelectFromAnchorToCursor extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.selectFromAnchorToCursor',
			label: localize('selectFromAnchorToCursor', "Select from Anchor to Cursor"),
			alias: 'Select from Anchor to Cursor',
			precondition: SelectionAnchorSet,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	async run(_accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		SelectionAnchorController.get(editor)?.selectFromAnchorToCursor();
	}
}

class CancelSelectionAnchor extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.cancelSelectionAnchor',
			label: localize('cancelSelectionAnchor', "Cancel Selection Anchor"),
			alias: 'Cancel Selection Anchor',
			precondition: SelectionAnchorSet,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	async run(_accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		SelectionAnchorController.get(editor)?.cancelSelectionAnchor();
	}
}

registerEditorContribution(SelectionAnchorController.ID, SelectionAnchorController, EditorContributionInstantiation.Lazy);
registerEditorAction(SetSelectionAnchor);
registerEditorAction(GoToSelectionAnchor);
registerEditorAction(SelectFromAnchorToCursor);
registerEditorAction(CancelSelectionAnchor);
