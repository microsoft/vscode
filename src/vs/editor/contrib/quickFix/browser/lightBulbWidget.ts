/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import * as dom from 'vs/base/browser/dom';
import { IPosition } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';

export class LightBulbWidget implements IContentWidget, IDisposable {

	private _editor: ICodeEditor;
	private _position: IPosition;
	private _domNode: HTMLElement;
	private _visible: boolean;
	private _onClick = new Emitter<IPosition>();
	private _toDispose: IDisposable[] = [];

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._editor.addContentWidget(this);
	}

	public dispose(): void {
		this._editor.removeContentWidget(this);
		this._toDispose = dispose(this._toDispose);
	}

	get onClick(): Event<IPosition> {
		return this._onClick.event;
	}

	getId(): string {
		return '__lightBulbWidget';
	}

	// Editor.IContentWidget.allowEditorOverflow
	get allowEditorOverflow() {
		return true;
	}

	getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = document.createElement('div');
			this._domNode.style.width = '20px';
			this._domNode.style.height = '20px';
			this._domNode.className = 'lightbulb-glyph';
			this._toDispose.push(dom.addDisposableListener(this._domNode, 'mousedown', (e: MouseEvent) => {
				e.preventDefault();
				this._onClick.fire(this._position);
			}));
		}
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition {
		return this._visible
			? { position: this._position, preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE] }
			: null;
	}

	show(where: IPosition): void {
		if (this._visible && Position.equals(this._position, where)) {
			return;
		}
		this._position = where;
		this._visible = true;
		this._editor.layoutContentWidget(this);
	}

	hide(): void {
		if (this._visible) {
			this._visible = false;
			this._editor.layoutContentWidget(this);
		}
	}
}
