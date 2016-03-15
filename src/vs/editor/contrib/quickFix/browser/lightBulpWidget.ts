/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import {IPosition} from 'vs/editor/common/editorCommon';
import {Position} from 'vs/editor/common/core/position';
import {ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition} from 'vs/editor/browser/editorBrowser';

export class LightBulpWidget implements IContentWidget, IDisposable {

	private editor: ICodeEditor;
	private position: IPosition;
	private domNode: HTMLElement;
	private visible: boolean;
	private onclick: (pos: IPosition) => void;
	private toDispose:IDisposable[];

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	constructor(editor: ICodeEditor, onclick: (pos: IPosition) => void) {
		this.editor = editor;
		this.onclick = onclick;
		this.toDispose = [];
		this.editor.addContentWidget(this);
	}

	public dispose(): void {
		this.editor.removeContentWidget(this);
		this.toDispose = disposeAll(this.toDispose);
	}

	public getId(): string {
		return '__lightBulpWidget';
	}

	public getDomNode(): HTMLElement {
		if (!this.domNode) {
			this.domNode = document.createElement('div');
			this.domNode.style.width = '20px';
			this.domNode.style.height = '20px';
			this.domNode.className = 'lightbulp-glyph';
			this.toDispose.push(dom.addDisposableListener(this.domNode, 'click',(e) => {
				this.editor.focus();
				this.onclick(this.position);
			}));
		}
		return this.domNode;
	}

	public getPosition(): IContentWidgetPosition {
		return this.visible
			? { position: this.position, preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE] }
			: null;
	}

	public show(where:IPosition): void {
		if (this.visible && Position.equals(this.position, where)) {
			return;
		}

		this.position = where;

		this.visible = true;
		this.editor.layoutContentWidget(this);
	}

	public hide(): void {
		if (!this.visible) {
			return;
		}

		this.visible = false;
		this.editor.layoutContentWidget(this);
	}
}

