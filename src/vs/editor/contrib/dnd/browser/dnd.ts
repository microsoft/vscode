/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./dnd';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ICodeEditor, IEditorMouseEvent, IMouseTarget, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { DragAndDropCommand } from '../common/dragAndDropCommand';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';

@editorContribution
export class DragAndDropController implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.dragAndDrop';

	private _editor: ICodeEditor;
	private _toUnhook: IDisposable[];
	private _dragSelection: Selection;
	private _dndDecorationIds: string[];
	private _mouseDown: boolean;
	private _modiferPressed: boolean;
	static TRIGGER_MODIFIER = isMacintosh ? 'altKey' : 'ctrlKey';
	static TRIGGER_KEY_VALUE = isMacintosh ? KeyCode.Alt : KeyCode.Ctrl;

	static get(editor: editorCommon.ICommonCodeEditor): DragAndDropController {
		return editor.getContribution<DragAndDropController>(DragAndDropController.ID);
	}

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._toUnhook = [];
		this._toUnhook.push(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
		this._toUnhook.push(this._editor.onMouseUp((e: IEditorMouseEvent) => this._onEditorMouseUp(e)));
		this._toUnhook.push(this._editor.onMouseDrag((e: IEditorMouseEvent) => this._onEditorMouseDrag(e)));
		this._toUnhook.push(this._editor.onMouseDrop((e: IEditorMouseEvent) => this._onEditorMouseDrop(e)));
		this._toUnhook.push(this._editor.onKeyDown((e: IKeyboardEvent) => this.onEditorKeyDown(e)));
		this._toUnhook.push(this._editor.onKeyUp((e: IKeyboardEvent) => this.onEditorKeyUp(e)));
		this._dndDecorationIds = [];
		this._mouseDown = false;
		this._modiferPressed = false;
		this._dragSelection = null;
	}

	private onEditorKeyDown(e: IKeyboardEvent): void {
		if (!this._editor.getConfiguration().dragAndDrop) {
			return;
		}

		if (e[DragAndDropController.TRIGGER_MODIFIER]) {
			this._modiferPressed = true;
		}

		if (this._mouseDown && e[DragAndDropController.TRIGGER_MODIFIER]) {
			this._editor.updateOptions({
				mouseStyle: 'copy'
			});
		}
	}

	private onEditorKeyUp(e: IKeyboardEvent): void {
		if (!this._editor.getConfiguration().dragAndDrop) {
			return;
		}

		if (e[DragAndDropController.TRIGGER_MODIFIER]) {
			this._modiferPressed = false;
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
		let target = mouseEvent.target;

		if (this._dragSelection === null) {
			let possibleSelections = this._editor.getSelections().filter(selection => selection.containsPosition(target.position));
			if (possibleSelections.length === 1) {
				this._dragSelection = possibleSelections[0];
			} else {
				return;
			}
		}

		if (mouseEvent.event[DragAndDropController.TRIGGER_MODIFIER]) {
			this._editor.updateOptions({
				mouseStyle: 'copy'
			});
		} else {
			this._editor.updateOptions({
				mouseStyle: 'default'
			});
		}

		if (this._dragSelection.containsPosition(target.position)) {
			this._removeDecoration();
		} else {
			this.showAt(target.position);
		}
	}

	private _onEditorMouseDrop(mouseEvent: IEditorMouseEvent): void {
		if (mouseEvent.target && (this._hitContent(mouseEvent.target) || this._hitMargin(mouseEvent.target)) && mouseEvent.target.position) {
			let newCursorPosition = new Position(mouseEvent.target.position.lineNumber, mouseEvent.target.position.column);

			if (this._dragSelection === null) {
				let newSelections = this._editor.getSelections().map(selection => {
					if (selection.containsPosition(newCursorPosition)) {
						return new Selection(newCursorPosition.lineNumber, newCursorPosition.column, newCursorPosition.lineNumber, newCursorPosition.column);
					} else {
						return selection;
					}
				});
				this._editor.setSelections(newSelections);
			} else if (!this._dragSelection.containsPosition(newCursorPosition) ||
				(
					(
						mouseEvent.event[DragAndDropController.TRIGGER_MODIFIER] ||
						this._modiferPressed
					) && (
						this._dragSelection.getEndPosition().equals(newCursorPosition) || this._dragSelection.getStartPosition().equals(newCursorPosition)
					) // we allow users to paste content beside the selection
				)) {
				this._editor.pushUndoStop();
				this._editor.executeCommand(DragAndDropController.ID, new DragAndDropCommand(this._dragSelection, newCursorPosition, mouseEvent.event[DragAndDropController.TRIGGER_MODIFIER] || this._modiferPressed));
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

	private static _DECORATION_OPTIONS = ModelDecorationOptions.register({
		className: 'dnd-target'
	});

	public showAt(position: Position): void {
		this._editor.changeDecorations(changeAccessor => {
			let newDecorations: editorCommon.IModelDeltaDecoration[] = [];
			newDecorations.push({
				range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
				options: DragAndDropController._DECORATION_OPTIONS
			});

			this._dndDecorationIds = changeAccessor.deltaDecorations(this._dndDecorationIds, newDecorations);
		});
		this._editor.revealPosition(position, editorCommon.ScrollType.Immediate);
	}

	private _removeDecoration(): void {
		this._editor.changeDecorations(changeAccessor => {
			changeAccessor.deltaDecorations(this._dndDecorationIds, []);
		});
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

	public getId(): string {
		return DragAndDropController.ID;
	}

	public dispose(): void {
		this._removeDecoration();
		this._dragSelection = null;
		this._mouseDown = false;
		this._modiferPressed = false;
		this._toUnhook = dispose(this._toUnhook);
	}
}