/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import DomUtils = require('vs/base/browser/dom');
import {Position} from 'vs/editor/common/core/position';

export class ContentHoverWidget implements EditorBrowser.IContentWidget {

	private _id: string;
	_editor: EditorBrowser.ICodeEditor;
	_isVisible: boolean;
	private _containerDomNode: HTMLElement;
	_domNode: HTMLElement;
	_showAtPosition: EditorCommon.IEditorPosition;

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	constructor(id: string, editor: EditorBrowser.ICodeEditor) {
		this._id = id;
		this._editor = editor;
		this._isVisible = false;

		this._containerDomNode = document.createElement('div');
		this._containerDomNode.className = 'monaco-editor-hover monaco-editor-background';

		this._domNode = document.createElement('div');
		this._domNode.style.display = 'inline-block';
		this._containerDomNode.appendChild(this._domNode);

		this._editor.addContentWidget(this);
		this._showAtPosition = null;
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._containerDomNode;
	}

	public showAt(position:EditorCommon.IPosition): void {

		// Position has changed
		this._showAtPosition = new Position(position.lineNumber, position.column);
		this._isVisible = true;
		var editorMaxWidth = Math.min(800, parseInt(this._containerDomNode.style.maxWidth, 10));

		// When scrolled horizontally, the div does not want to occupy entire visible area.
		DomUtils.StyleMutator.setWidth(this._containerDomNode, editorMaxWidth);
		DomUtils.StyleMutator.setHeight(this._containerDomNode, 0);
		DomUtils.StyleMutator.setLeft(this._containerDomNode, 0);

		var renderedWidth = Math.min(editorMaxWidth, this._domNode.clientWidth + 5);
		var renderedHeight = this._domNode.clientHeight + 1;

		DomUtils.StyleMutator.setWidth(this._containerDomNode, renderedWidth);
		DomUtils.StyleMutator.setHeight(this._containerDomNode, renderedHeight);

		this._editor.layoutContentWidget(this);
		// Simply force a synchronous render on the editor
		// such that the widget does not really render with left = '0px'
		this._editor.render();
	}

	public hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._editor.layoutContentWidget(this);
	}

	public getPosition():EditorBrowser.IContentWidgetPosition {
		if (this._isVisible) {
			return {
				position: this._showAtPosition,
				preference: [
					EditorBrowser.ContentWidgetPositionPreference.ABOVE,
					EditorBrowser.ContentWidgetPositionPreference.BELOW
				]
			};
		}
		return null;
	}

	public dispose(): void {
		this.hide();
	}
}

export class GlyphHoverWidget implements EditorBrowser.IOverlayWidget {

	private _id: string;
	_editor: EditorBrowser.ICodeEditor;
	_isVisible: boolean;
	_domNode: HTMLElement;
	_showAtLineNumber: number;

	constructor(id: string, editor: EditorBrowser.ICodeEditor) {

		this._id = id;
		this._editor = editor;
		this._isVisible = false;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-editor-hover monaco-editor-background';
		this._domNode.style.display = 'none';
		this._domNode.setAttribute('aria-hidden', 'true');
		this._domNode.setAttribute('role', 'presentation');

		this._showAtLineNumber = -1;
		this._editor.addOverlayWidget(this);
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public showAt(lineNumber: number): void {
		this._showAtLineNumber = lineNumber;

		if (!this._isVisible) {
			this._isVisible = true;
			this._domNode.style.display = 'block';
		}

		var editorLayout = this._editor.getLayoutInfo();
		var topForLineNumber = this._editor.getTopForLineNumber(this._showAtLineNumber);
		var editorScrollTop = this._editor.getScrollTop();

		this._domNode.style.left = (editorLayout.glyphMarginLeft + editorLayout.glyphMarginWidth) + 'px';
		this._domNode.style.top = (topForLineNumber - editorScrollTop) + 'px';
	}

	public hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._domNode.style.display = 'none';
	}

	public getPosition():EditorBrowser.IOverlayWidgetPosition {
		return null;
	}

	public dispose(): void {
		this.hide();
	}
}
