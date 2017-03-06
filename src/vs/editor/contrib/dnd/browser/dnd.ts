/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./dnd';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, IMouseTarget } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { DragAndDropCommand } from '../common/dragAndDropCommand';

@editorContribution
export class DragAndDropController implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.dragAndDrop';

	private _editor: ICodeEditor;
	private _toUnhook: IDisposable[];
	private _active: boolean;
	private _dragSelection: Selection;
	private _dndDecorationIds: string[];

	static get(editor: editorCommon.ICommonCodeEditor): DragAndDropController {
		return editor.getContribution<DragAndDropController>(DragAndDropController.ID);
	}

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._toUnhook = [];
		this._toUnhook.push(this._editor.onMouseDrag((e: IEditorMouseEvent) => this._onEditorMouseDrag(e)));
		this._toUnhook.push(this._editor.onMouseDrop((e: IEditorMouseEvent) => this._onEditorMouseDrop(e)));
		this._active = false;
		this._dndDecorationIds = [];
	}

	private _onEditorMouseDrag(mouseEvent: IEditorMouseEvent): void {
		let target = mouseEvent.target;

		if (this._active) {
			this.showAt(target.position);
		} else {
			let possibleSelections = this._editor.getSelections().filter(selection => selection.containsPosition(target.position));

			if (possibleSelections.length === 1) {
				this._active = true;
				this._dragSelection = possibleSelections[0];
				this.showAt(target.position);
			}
		}
	}

	private _onEditorMouseDrop(mouseEvent: IEditorMouseEvent): void {
		if (mouseEvent.target && (this._hitContent(mouseEvent.target) || this._hitMargin(mouseEvent.target)) && mouseEvent.target.position) {
			let newCursorPosition = new Position(mouseEvent.target.position.lineNumber, mouseEvent.target.position.column);

			if (this._dragSelection.containsPosition(newCursorPosition)) {
				let newSelections = this._editor.getSelections().map(selection => {
					if (selection.equalsSelection(this._dragSelection)) {
						return new Selection(newCursorPosition.lineNumber, newCursorPosition.column, newCursorPosition.lineNumber, newCursorPosition.column);
					} else {
						return selection;
					}
				});
				this._editor.setSelections(newSelections);
			} else {
				this._editor.executeCommand(DragAndDropController.ID, new DragAndDropCommand(this._dragSelection, newCursorPosition, mouseEvent.event.altKey));
			}
		}

		this._removeDecoration();
		this._active = false;
	}

	public showAt(position: Position): void {
		this._editor.changeDecorations(changeAccessor => {
			let newDecorations: editorCommon.IModelDeltaDecoration[] = [];
			newDecorations.push({
				range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
				options: { className: 'dnd-target' }
			});

			this._dndDecorationIds = changeAccessor.deltaDecorations(this._dndDecorationIds, newDecorations);
		});
		this._editor.revealPosition(position);
	}

	private _removeDecoration(): void {
		this._editor.changeDecorations(changeAccessor => {
			changeAccessor.deltaDecorations(this._dndDecorationIds, []);
		});
	}

	private _hitContent(target: IMouseTarget): boolean {
		return target.type === editorCommon.MouseTargetType.CONTENT_TEXT ||
			target.type === editorCommon.MouseTargetType.CONTENT_EMPTY;
	}

	private _hitMargin(target: IMouseTarget): boolean {
		return target.type === editorCommon.MouseTargetType.GUTTER_GLYPH_MARGIN ||
			target.type === editorCommon.MouseTargetType.GUTTER_LINE_NUMBERS ||
			target.type === editorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS;
	}

	public getId(): string {
		return DragAndDropController.ID;
	}

	public dispose(): void {
		this._removeDecoration();
		this._toUnhook = dispose(this._toUnhook);
	}
}