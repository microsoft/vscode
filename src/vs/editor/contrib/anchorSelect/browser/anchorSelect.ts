/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import './anchorSelect.css';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { Selection } from '../../../common/core/selection.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { TrackedRangeStickiness } from '../../../common/model.js';
import { localize, localize2 } from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

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
			label: localize2('setSelectionAnchor', "Set Selection Anchor"),
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
			label: localize2('goToSelectionAnchor', "Go to Selection Anchor"),
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
			label: localize2('selectFromAnchorToCursor', "Select from Anchor to Cursor"),
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
			label: localize2('cancelSelectionAnchor', "Cancel Selection Anchor"),
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
