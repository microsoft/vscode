/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./dnd';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { DragTargetHintWidget } from './dndHintWidget';
import { DragAndDropCommand } from '../common/dragAndDropCommand';

@editorContribution
export class DragAndDropController implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.dragAndDrop';

	private _editor: ICodeEditor;
	private _toUnhook: IDisposable[];
	private _targetWidget: DragTargetHintWidget;
	private _active: boolean;
	private _dragSelection: Selection;

	static get(editor: editorCommon.ICommonCodeEditor): DragAndDropController {
		return editor.getContribution<DragAndDropController>(DragAndDropController.ID);
	}

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._toUnhook = [];
		this._toUnhook.push(this._editor.onMouseDrag((e: IEditorMouseEvent) => this._onEditorMouseDrag(e)));
		this._toUnhook.push(this._editor.onMouseDrop((e: IEditorMouseEvent) => this._onEditorMouseDrop(e)));
		this._targetWidget = new DragTargetHintWidget(editor);
		this._active = false;
	}

	private _onEditorMouseDrag(mouseEvent: IEditorMouseEvent): void {
		let target = mouseEvent.target;

		if (this._active) {
			this._targetWidget.showAt(target.position);
		} else {
			let possibleSelections = this._editor.getSelections().filter(selection => selection.containsPosition(target.position));

			if (possibleSelections.length === 1) {
				this._active = true;
				this._dragSelection = possibleSelections[0];
				this._targetWidget.showAt(target.position);
			}
		}
	}

	private _onEditorMouseDrop(mouseEvent: IEditorMouseEvent): void {
		if (mouseEvent.target &&
			(mouseEvent.target.type === editorCommon.MouseTargetType.CONTENT_TEXT || mouseEvent.target.type === editorCommon.MouseTargetType.CONTENT_EMPTY) &&
			mouseEvent.target.position) {
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
				this._editor.executeCommand(DragAndDropController.ID, new DragAndDropCommand(this._dragSelection, newCursorPosition));
			}
		}

		this._hideWidget();
		this._active = false;
	}

	private _hideWidget(): void {
		this._targetWidget.hide();
	}

	public getId(): string {
		return DragAndDropController.ID;
	}

	public dispose(): void {
		this._toUnhook = dispose(this._toUnhook);
		if (this._targetWidget) {
			this._targetWidget.dispose();
			this._targetWidget = null;
		}
	}
}