/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import './dnd.css';
import { ICodeEditor, IEditorMouseEvent, IMouseTarget, IPartialEditorMouseEvent, MouseTargetType } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { CursorChangeReason } from '../../../common/cursorEvents.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { IEditorContribution, IEditorDecorationsCollection, ScrollType } from '../../../common/editorCommon.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { DragAndDropCommand } from './dragAndDropCommand.js';

function hasTriggerModifier(e: IKeyboardEvent | IMouseEvent): boolean {
	if (isMacintosh) {
		return e.altKey;
	} else {
		return e.ctrlKey;
	}
}

export class DragAndDropController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.dragAndDrop';

	private readonly _editor: ICodeEditor;
	private _dragSelection: Selection | null;
	private readonly _dndDecorationIds: IEditorDecorationsCollection;
	private _mouseDown: boolean;
	private _modifierPressed: boolean;
	static readonly TRIGGER_KEY_VALUE = isMacintosh ? KeyCode.Alt : KeyCode.Ctrl;

	static get(editor: ICodeEditor): DragAndDropController | null {
		return editor.getContribution<DragAndDropController>(DragAndDropController.ID);
	}

	constructor(editor: ICodeEditor) {
		super();
		this._editor = editor;
		this._dndDecorationIds = this._editor.createDecorationsCollection();
		this._register(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
		this._register(this._editor.onMouseUp((e: IEditorMouseEvent) => this._onEditorMouseUp(e)));
		this._register(this._editor.onMouseDrag((e: IEditorMouseEvent) => this._onEditorMouseDrag(e)));
		this._register(this._editor.onMouseDrop((e: IPartialEditorMouseEvent) => this._onEditorMouseDrop(e)));
		this._register(this._editor.onMouseDropCanceled(() => this._onEditorMouseDropCanceled()));
		this._register(this._editor.onKeyDown((e: IKeyboardEvent) => this.onEditorKeyDown(e)));
		this._register(this._editor.onKeyUp((e: IKeyboardEvent) => this.onEditorKeyUp(e)));
		this._register(this._editor.onDidBlurEditorWidget(() => this.onEditorBlur()));
		this._register(this._editor.onDidBlurEditorText(() => this.onEditorBlur()));
		this._mouseDown = false;
		this._modifierPressed = false;
		this._dragSelection = null;
	}

	private onEditorBlur() {
		this._removeDecoration();
		this._dragSelection = null;
		this._mouseDown = false;
		this._modifierPressed = false;
	}

	private onEditorKeyDown(e: IKeyboardEvent): void {
		if (!this._editor.getOption(EditorOption.dragAndDrop) || this._editor.getOption(EditorOption.columnSelection)) {
			return;
		}

		if (hasTriggerModifier(e)) {
			this._modifierPressed = true;
		}

		if (this._mouseDown && hasTriggerModifier(e)) {
			this._editor.updateOptions({
				mouseStyle: 'copy'
			});
		}
	}

	private onEditorKeyUp(e: IKeyboardEvent): void {
		if (!this._editor.getOption(EditorOption.dragAndDrop) || this._editor.getOption(EditorOption.columnSelection)) {
			return;
		}

		if (hasTriggerModifier(e)) {
			this._modifierPressed = false;
		}

		if (this._mouseDown && e.keyCode === DragAndDropController.TRIGGER_KEY_VALUE) {
			this._editor.updateOptions({
				mouseStyle: 'default'
			});
		}
	}

	private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		this._mouseDown = true;
	}

	private _onEditorMouseUp(mouseEvent: IEditorMouseEvent): void {
		this._mouseDown = false;
		// Whenever users release the mouse, the drag and drop operation should finish and the cursor should revert to text.
		this._editor.updateOptions({
			mouseStyle: 'text'
		});
	}

	private _onEditorMouseDrag(mouseEvent: IEditorMouseEvent): void {
		const target = mouseEvent.target;

		if (this._dragSelection === null) {
			const selections = this._editor.getSelections() || [];
			const possibleSelections = selections.filter(selection => target.position && selection.containsPosition(target.position));
			if (possibleSelections.length === 1) {
				this._dragSelection = possibleSelections[0];
			} else {
				return;
			}
		}

		if (hasTriggerModifier(mouseEvent.event)) {
			this._editor.updateOptions({
				mouseStyle: 'copy'
			});
		} else {
			this._editor.updateOptions({
				mouseStyle: 'default'
			});
		}

		if (target.position) {
			if (this._dragSelection.containsPosition(target.position)) {
				this._removeDecoration();
			} else {
				this.showAt(target.position);
			}
		}
	}

	private _onEditorMouseDropCanceled() {
		this._editor.updateOptions({
			mouseStyle: 'text'
		});

		this._removeDecoration();
		this._dragSelection = null;
		this._mouseDown = false;
	}

	private _onEditorMouseDrop(mouseEvent: IPartialEditorMouseEvent): void {
		if (mouseEvent.target && (this._hitContent(mouseEvent.target) || this._hitMargin(mouseEvent.target)) && mouseEvent.target.position) {
			const newCursorPosition = new Position(mouseEvent.target.position.lineNumber, mouseEvent.target.position.column);

			if (this._dragSelection === null) {
				let newSelections: Selection[] | null = null;
				if (mouseEvent.event.shiftKey) {
					const primarySelection = this._editor.getSelection();
					if (primarySelection) {
						const { selectionStartLineNumber, selectionStartColumn } = primarySelection;
						newSelections = [new Selection(selectionStartLineNumber, selectionStartColumn, newCursorPosition.lineNumber, newCursorPosition.column)];
					}
				} else {
					newSelections = (this._editor.getSelections() || []).map(selection => {
						if (selection.containsPosition(newCursorPosition)) {
							return new Selection(newCursorPosition.lineNumber, newCursorPosition.column, newCursorPosition.lineNumber, newCursorPosition.column);
						} else {
							return selection;
						}
					});
				}
				// Use `mouse` as the source instead of `api` and setting the reason to explicit (to behave like any other mouse operation).
				(<CodeEditorWidget>this._editor).setSelections(newSelections || [], 'mouse', CursorChangeReason.Explicit);
			} else if (!this._dragSelection.containsPosition(newCursorPosition) ||
				(
					(
						hasTriggerModifier(mouseEvent.event) ||
						this._modifierPressed
					) && (
						this._dragSelection.getEndPosition().equals(newCursorPosition) || this._dragSelection.getStartPosition().equals(newCursorPosition)
					) // we allow users to paste content beside the selection
				)) {
				this._editor.pushUndoStop();
				this._editor.executeCommand(DragAndDropController.ID, new DragAndDropCommand(this._dragSelection, newCursorPosition, hasTriggerModifier(mouseEvent.event) || this._modifierPressed));
				this._editor.pushUndoStop();
			}
		}

		this._editor.updateOptions({
			mouseStyle: 'text'
		});

		this._removeDecoration();
		this._dragSelection = null;
		this._mouseDown = false;
	}

	private static readonly _DECORATION_OPTIONS = ModelDecorationOptions.register({
		description: 'dnd-target',
		className: 'dnd-target'
	});

	public showAt(position: Position): void {
		this._dndDecorationIds.set([{
			range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			options: DragAndDropController._DECORATION_OPTIONS
		}]);
		this._editor.revealPosition(position, ScrollType.Immediate);
	}

	private _removeDecoration(): void {
		this._dndDecorationIds.clear();
	}

	private _hitContent(target: IMouseTarget): boolean {
		return target.type === MouseTargetType.CONTENT_TEXT ||
			target.type === MouseTargetType.CONTENT_EMPTY;
	}

	private _hitMargin(target: IMouseTarget): boolean {
		return target.type === MouseTargetType.GUTTER_GLYPH_MARGIN ||
			target.type === MouseTargetType.GUTTER_LINE_NUMBERS ||
			target.type === MouseTargetType.GUTTER_LINE_DECORATIONS;
	}

	public override dispose(): void {
		this._removeDecoration();
		this._dragSelection = null;
		this._mouseDown = false;
		this._modifierPressed = false;
		super.dispose();
	}
}

registerEditorContribution(DragAndDropController.ID, DragAndDropController, EditorContributionInstantiation.BeforeFirstInteraction);
