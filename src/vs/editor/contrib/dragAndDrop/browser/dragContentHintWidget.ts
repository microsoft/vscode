/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import { Position } from 'vs/editor/common/core/position';
import { IPosition, TextEditorCursorStyle } from 'vs/editor/common/editorCommon';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { Widget } from 'vs/base/browser/ui/widget';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Configuration } from 'vs/editor/browser/config/configuration';

export class DragContentHintWidget extends Widget implements editorBrowser.IContentWidget {

	private _id: string;
	protected _editor: editorBrowser.ICodeEditor;
	protected _showAtPosition: Position;
	private disposables: IDisposable[] = [];

	private _cursorStyle: TextEditorCursorStyle;
	private _lineHeight: number;
	private _typicalHalfwidthCharacterWidth: number;
	private readonly _domNode: FastDomNode;

	private _isVisible: boolean;

	constructor(editor: editorBrowser.ICodeEditor) {
		super();
		this._editor = editor;

		this._cursorStyle = this._editor.getConfiguration().viewInfo.cursorStyle;
		this._lineHeight = this._editor.getConfiguration().lineHeight;
		this._typicalHalfwidthCharacterWidth = this._editor.getConfiguration().fontInfo.typicalHalfwidthCharacterWidth;

		this._isVisible = false;
		// Create the dom node
		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setClassName('cursor secondary');

		this._domNode.setHeight(this._lineHeight);
		this._domNode.setTop(0);
		this._domNode.setLeft(0);
		this._domNode.setWidth(2);
		this._domNode.setAttribute('role', 'presentation');
		this._domNode.setAttribute('aria-hidden', 'true');
		Configuration.applyFontInfo(this._domNode, this._editor.getConfiguration().fontInfo);
		// this._domNode.setDisplay('none');

		this._editor.addContentWidget(this);
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	public showAt(position: IPosition): void {
		// Position has changed
		this._showAtPosition = new Position(position.lineNumber, position.column);
		this.show();
		this._editor.layoutContentWidget(this);
		this._editor.render();
	}

	public show(): void {
		if (!this._isVisible) {
			this._domNode.setVisibility('inherit');
			this._isVisible = true;
		}
	}

	public hide(): void {
		if (this._isVisible) {
			this._domNode.setVisibility('hidden');
			this._isVisible = false;
		}
	}


	public getPosition(): editorBrowser.IContentWidgetPosition {
		if (this._isVisible) {
			return {
				position: this._showAtPosition,
				preference: [
					editorBrowser.ContentWidgetPositionPreference.EXACT
				]
			};
		}
		return null;
	}

	public dispose(): void {
		this._editor.removeContentWidget(this);
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}