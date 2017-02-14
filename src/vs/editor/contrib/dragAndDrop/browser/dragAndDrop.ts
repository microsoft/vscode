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


@editorContribution
export class DragAndDropController implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.dragAndDrop';

	private _editor: ICodeEditor;
	private _toUnhook: IDisposable[];
	private _contentWidget: DragContentHintWidget;

	static get(editor: editorCommon.ICommonCodeEditor): DragAndDropController {
		return editor.getContribution<DragAndDropController>(DragAndDropController.ID);
	}

	constructor(editor: ICodeEditor) {
		this._editor = editor;

		this._toUnhook = [];

		this._toUnhook.push(this._editor.onMouseDrag((e: IEditorMouseEvent) => this._onEditorMouseDrag(e)));
		this._toUnhook.push(this._editor.onMouseUp((e: IEditorMouseEvent) => this._hideWidgets()));
		this._contentWidget = new DragContentHintWidget(editor);
	}

	private _onEditorMouseDrag(mouseEvent: IEditorMouseEvent): void {
		let target = mouseEvent.target;
		this._contentWidget.showAt(target.position);
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