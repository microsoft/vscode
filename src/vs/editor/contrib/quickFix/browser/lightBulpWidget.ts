/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import lifecycle = require('vs/base/common/lifecycle');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import DomUtils = require('vs/base/browser/dom');
import eventEmitter = require('vs/base/common/eventEmitter');

class LightBulpWidget implements EditorBrowser.IContentWidget, lifecycle.IDisposable {

	private editor: EditorBrowser.ICodeEditor;
	private position: EditorCommon.IPosition;
	private domNode: HTMLElement;
	private visible: boolean;
	private onclick: (pos: EditorCommon.IPosition) => void;
	private listenersToRemove:eventEmitter.ListenerUnbind[];

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	constructor(editor: EditorBrowser.ICodeEditor, onclick: (pos: EditorCommon.IPosition) => void) {
		this.editor = editor;
		this.onclick = onclick;
		this.listenersToRemove = [];
		this.editor.addContentWidget(this);
	}

	public dispose(): void {
		this.editor.removeContentWidget(this);
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
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
			this.listenersToRemove.push(DomUtils.addListener(this.domNode, 'click',(e) => {
				this.editor.focus();
				this.onclick(this.position);
			}));
		}
		return this.domNode;
	}

	public getPosition(): EditorBrowser.IContentWidgetPosition {
		return this.visible
			? { position: this.position, preference: [EditorBrowser.ContentWidgetPositionPreference.BELOW, EditorBrowser.ContentWidgetPositionPreference.ABOVE] }
			: null;
	}

	public show(where:EditorCommon.IPosition): void {
		this.position = where;

		this.visible = true;
		this.editor.layoutContentWidget(this);
	}

	public hide(): void {
		this.visible = false;
		this.editor.layoutContentWidget(this);
	}
}

export = LightBulpWidget;
