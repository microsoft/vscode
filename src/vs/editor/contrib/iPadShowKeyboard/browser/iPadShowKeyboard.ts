/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./iPadShowKeyboard';
import Browser = require('vs/base/browser/browser');
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import DomUtils = require('vs/base/browser/dom');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Lifecycle = require('vs/base/common/lifecycle');
import {INullService} from 'vs/platform/instantiation/common/instantiation';

export class iPadShowKeyboard implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.iPadShowKeyboard';

	private editor:EditorBrowser.ICodeEditor;
	private widget:ShowKeyboardWidget;
	private toDispose:Lifecycle.IDisposable[];

	constructor(editor:EditorBrowser.ICodeEditor, @INullService ns) {
		this.editor = editor;
		this.toDispose = [];
		if (Browser.isIPad) {
			this.toDispose.push(editor.addListener2(EditorCommon.EventType.ConfigurationChanged, () => this.update()));
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
		return iPadShowKeyboard.ID;
	}

	public dispose(): void {
		this.toDispose = Lifecycle.disposeAll(this.toDispose);
		if (this.widget) {
			this.widget.dispose();
			this.widget = null;
		}
	}
}

class ShowKeyboardWidget implements EditorBrowser.IOverlayWidget {

	private static ID = 'editor.contrib.ShowKeyboardWidget';

	private editor: EditorBrowser.ICodeEditor;

	private _domNode:HTMLElement;
	private _toDispose:Lifecycle.IDisposable[];

	constructor(editor:EditorBrowser.ICodeEditor) {
		this.editor = editor;
		this._domNode = document.createElement('textarea');
		this._domNode.className = 'iPadShowKeyboard';

		this._toDispose = [];
		this._toDispose.push(DomUtils.addDisposableListener(this._domNode, 'touchstart', (e) => {
			this.editor.focus();
		}));
		this._toDispose.push(DomUtils.addDisposableListener(this._domNode, 'focus', (e) => {
			this.editor.focus();
		}));

		this.editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this.editor.removeOverlayWidget(this);
		this._toDispose = Lifecycle.disposeAll(this._toDispose);
	}

	// ----- IOverlayWidget API

	public getId(): string {
		return ShowKeyboardWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): EditorBrowser.IOverlayWidgetPosition {
		return {
			preference: EditorBrowser.OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}
}

EditorBrowserRegistry.registerEditorContribution(iPadShowKeyboard);