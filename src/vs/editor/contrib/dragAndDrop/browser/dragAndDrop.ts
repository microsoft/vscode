/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { DragContentHintWidget } from './dragContentHintWidget';
import { Selection } from 'vs/editor/common/core/selection';
import { DragAndDropCommand } from '../common/dragAndDropCommand';
import { Position } from 'vs/editor/common/core/position';

@editorContribution
export class DragAndDropController implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.dragAndDrop';

	private _editor: ICodeEditor;
	private _toUnhook: IDisposable[];
	private _contentWidget: DragContentHintWidget;
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
		this._contentWidget = new DragContentHintWidget(editor);
		this._active = false;
	}

	private _onEditorMouseDrag(mouseEvent: IEditorMouseEvent): void {
		let target = mouseEvent.target;

		if (this._active) {
			this._contentWidget.showAt(target.position);
		} else {
			let possibleSelections = this._editor.getSelections().filter(selection => selection.containsPosition(target.position));

			if (possibleSelections.length === 1) {
				this._active = true;
				this._dragSelection = possibleSelections[0];
				this._contentWidget.showAt(target.position);
			}
		}
	}

	private _onEditorMouseDrop(mouseEvent: IEditorMouseEvent): void {
		let targetPosition = this._contentWidget.getPosition().position;

		if (targetPosition) {
			let newCursorPosition = new Position(targetPosition.lineNumber, targetPosition.column);
			this._editor.executeCommand(DragAndDropController.ID, new DragAndDropCommand(this._dragSelection, newCursorPosition));
		}

		this._hideWidgets();
		this._active = false;
	}

	private _hideWidgets(): void {
		this._contentWidget.hide();
	}

	public showContentHover(range: Range, focus: boolean): void {
		//this._contentWidget.startShowingAt(range, focus);
	}

	public getId(): string {
		return DragAndDropController.ID;
	}

	public dispose(): void {
		this._toUnhook = dispose(this._toUnhook);
		if (this._contentWidget) {
			this._contentWidget.dispose();
			this._contentWidget = null;
		}
	}
}