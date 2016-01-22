/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./hover';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import EventEmitter = require('vs/base/common/eventEmitter');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Platform = require('vs/base/common/platform');
import ModesContentHover = require('./modesContentHover');
import ModesGlyphHover = require('./modesGlyphHover');
import Keyboard = require('vs/base/browser/keyboardEvent');
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {KeyCode} from 'vs/base/common/keyCodes';

class ModesHoverController implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.hover';

	private _editor: EditorBrowser.ICodeEditor;
	private _toUnhook:EventEmitter.ListenerUnbind[];

	private _contentWidget: ModesContentHover.ModesContentHoverWidget;
	private _glyphWidget: ModesGlyphHover.ModesGlyphHoverWidget;

	constructor(editor: EditorBrowser.ICodeEditor,
		@IEditorService editorService: IEditorService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		this._editor = editor;

		this._toUnhook = [];

		if (editor.getConfiguration().hover) {
			this._toUnhook.push(this._editor.addListener(EditorCommon.EventType.MouseDown, (e: EditorBrowser.IMouseEvent) => this._onEditorMouseDown(e)));
			this._toUnhook.push(this._editor.addListener(EditorCommon.EventType.MouseMove, (e: EditorBrowser.IMouseEvent) => this._onEditorMouseMove(e)));
			this._toUnhook.push(this._editor.addListener(EditorCommon.EventType.MouseLeave, (e: EditorBrowser.IMouseEvent) => this._hideWidgets()));
			this._toUnhook.push(this._editor.addListener(EditorCommon.EventType.KeyDown, (e:Keyboard.StandardKeyboardEvent) => this._onKeyDown(e)));
			this._toUnhook.push(this._editor.addListener(EditorCommon.EventType.ModelChanged, () => this._hideWidgets()));
			this._toUnhook.push(this._editor.addListener(EditorCommon.EventType.ModelDecorationsChanged, () => this._onModelDecorationsChanged()));
			this._toUnhook.push(this._editor.addListener('scroll', () => this._hideWidgets()));

			this._contentWidget = new ModesContentHover.ModesContentHoverWidget(editor, editorService, keybindingService);
			this._glyphWidget = new ModesGlyphHover.ModesGlyphHoverWidget(editor);
		}
	}

	private _onModelDecorationsChanged(): void {
		this._contentWidget.onModelDecorationsChanged();
		this._glyphWidget.onModelDecorationsChanged();
	}

	private _onEditorMouseDown(mouseEvent: EditorBrowser.IMouseEvent): void {
		var targetType = mouseEvent.target.type;

		if (targetType === EditorCommon.MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail ===  ModesContentHover.ModesContentHoverWidget.ID) {
			// mouse down on top of content hover widget
			return;
		}

		if (targetType === EditorCommon.MouseTargetType.OVERLAY_WIDGET && mouseEvent.target.detail === ModesGlyphHover.ModesGlyphHoverWidget.ID) {
			// mouse down on top of overlay hover widget
			return;
		}

		this._hideWidgets();
	}

	private _onEditorMouseMove(mouseEvent: EditorBrowser.IMouseEvent): void {
		var targetType = mouseEvent.target.type;
		var stopKey = Platform.isMacintosh ? 'metaKey' : 'ctrlKey';

		if (targetType === EditorCommon.MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail ===  ModesContentHover.ModesContentHoverWidget.ID && !mouseEvent.event[stopKey]) {
			// mouse moved on top of content hover widget
			return;
		}

		if (targetType === EditorCommon.MouseTargetType.OVERLAY_WIDGET && mouseEvent.target.detail === ModesGlyphHover.ModesGlyphHoverWidget.ID && !mouseEvent.event[stopKey]) {
			// mouse moved on top of overlay hover widget
			return;
		}

		if (this._editor.getConfiguration().hover && targetType === EditorCommon.MouseTargetType.CONTENT_TEXT) {
			this._glyphWidget.hide();
			this._contentWidget.startShowingAt(mouseEvent.target.range);
		} else if (this._editor.getConfiguration().hover && targetType === EditorCommon.MouseTargetType.GUTTER_GLYPH_MARGIN) {
			this._contentWidget.hide();
			this._glyphWidget.startShowingAt(mouseEvent.target.position.lineNumber);
		} else {
			this._hideWidgets();
		}
	}

	private _onKeyDown(e: Keyboard.StandardKeyboardEvent): void {
		var stopKey = Platform.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
		if (e.keyCode !== stopKey) {
			// Do not hide hover when Ctrl/Meta is pressed
			this._hideWidgets();
		}
	}

	private _hideWidgets(): void {
		this._glyphWidget.hide();
		this._contentWidget.hide();
	}

	public getId(): string {
		return ModesHoverController.ID;
	}

	public dispose(): void {
		while(this._toUnhook.length > 0) {
			this._toUnhook.pop()();
		}
		if (this._glyphWidget) {
			this._glyphWidget.dispose();
			this._glyphWidget = null;
		}
		if (this._contentWidget) {
			this._contentWidget.dispose();
			this._contentWidget = null;
		}
	}
}

EditorBrowserRegistry.registerEditorContribution(ModesHoverController);
