/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { Widget } from 'vs/base/browser/ui/widget';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { Position } from 'vs/editor/common/core/position';
import { IPosition, TextEditorCursorStyle, IConfigurationChangedEvent } from 'vs/editor/common/editorCommon';

export class DragTargetHintWidget extends Widget implements editorBrowser.IContentWidget {

	static ID = 'editor.contrib.dragTargetHintWidget';
	protected _editor: editorBrowser.ICodeEditor;
	protected _showAtPosition: Position;
	private disposables: IDisposable[] = [];
	private _cursorStyle: TextEditorCursorStyle;
	private _lineHeight: number;
	private _typicalHalfwidthCharacterWidth: number;
	private readonly _domNode: FastDomNode<HTMLElement>;
	private _isVisible: boolean = false;

	protected get isVisible(): boolean {
		return this._isVisible;
	}

	protected set isVisible(value: boolean) {
		this._isVisible = value;
	}

	constructor(editor: editorBrowser.ICodeEditor) {
		super();
		this._editor = editor;


		// Create the dom node
		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setClassName('dnd-target');
		this._domNode.setTop(0);
		this._domNode.setLeft(0);
		this._domNode.setAttribute('role', 'presentation');
		this._domNode.setAttribute('aria-hidden', 'true');
		this._domNode.setVisibility('hidden');
		this._editor.addContentWidget(this);

		this._cursorStyle = this._editor.getConfiguration().viewInfo.cursorStyle;
		this._lineHeight = this._editor.getConfiguration().lineHeight;
		this._typicalHalfwidthCharacterWidth = this._editor.getConfiguration().fontInfo.typicalHalfwidthCharacterWidth;

		this._register(this._editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.fontInfo || e.viewInfo || e.lineHeight) {
				this._typicalHalfwidthCharacterWidth = this._editor.getConfiguration().fontInfo.typicalHalfwidthCharacterWidth;
				this._lineHeight = this._editor.getConfiguration().lineHeight;
				this._cursorStyle = this._editor.getConfiguration().viewInfo.cursorStyle;
			}
		}));

		// render cursor after preparing the dom node and fetching data from config.
		this.renderCursor();
	}

	public getId(): string {
		return DragTargetHintWidget.ID;
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
		this.renderCursor();
	}

	public hide(): void {
		if (this._isVisible) {
			this._domNode.setVisibility('hidden');
			this._isVisible = false;
			this._editor.layoutContentWidget(this);
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

	private renderCursor() {
		if (!this.isVisible) {
			return;
		}

		Configuration.applyFontInfo(this._domNode, this._editor.getConfiguration().fontInfo);
		this._domNode.setHeight(this._lineHeight);
		this._domNode.setWidth(0);
	}
}
