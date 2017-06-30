/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./iPadShowKeyboard';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';

@editorContribution
export class IPadShowKeyboard implements IEditorContribution {

	private static ID = 'editor.contrib.iPadShowKeyboard';

	private editor: ICodeEditor;
	private widget: ShowKeyboardWidget;
	private toDispose: IDisposable[];

	constructor(editor: ICodeEditor) {
		this.editor = editor;
		this.toDispose = [];
		if (browser.isIPad) {
			this.toDispose.push(editor.onDidChangeConfiguration(() => this.update()));
			this.update();
		}
	}

	private update(): void {
		var hasWidget = (!!this.widget);
		var shouldHaveWidget = (!this.editor.getConfiguration().readOnly);

		if (!hasWidget && shouldHaveWidget) {

			this.widget = new ShowKeyboardWidget(this.editor);

		} else if (hasWidget && !shouldHaveWidget) {

			this.widget.dispose();
			this.widget = null;

		}
	}

	public getId(): string {
		return IPadShowKeyboard.ID;
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
		if (this.widget) {
			this.widget.dispose();
			this.widget = null;
		}
	}
}

class ShowKeyboardWidget implements IOverlayWidget {

	private static ID = 'editor.contrib.ShowKeyboardWidget';

	private editor: ICodeEditor;

	private _domNode: HTMLElement;
	private _toDispose: IDisposable[];

	constructor(editor: ICodeEditor) {
		this.editor = editor;
		this._domNode = document.createElement('textarea');
		this._domNode.className = 'iPadShowKeyboard';

		this._toDispose = [];
		this._toDispose.push(dom.addDisposableListener(this._domNode, 'touchstart', (e) => {
			this.editor.focus();
		}));
		this._toDispose.push(dom.addDisposableListener(this._domNode, 'focus', (e) => {
			this.editor.focus();
		}));

		this.editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this.editor.removeOverlayWidget(this);
		this._toDispose = dispose(this._toDispose);
	}

	// ----- IOverlayWidget API

	public getId(): string {
		return ShowKeyboardWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}
}
