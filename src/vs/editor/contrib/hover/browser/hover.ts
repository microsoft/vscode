/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./hover';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import EventEmitter = require('vs/base/common/eventEmitter');
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {Range} from 'vs/editor/common/core/range';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import Platform = require('vs/base/common/platform');
import ModesContentHover = require('./modesContentHover');
import ModesGlyphHover = require('./modesGlyphHover');
import Keyboard = require('vs/base/browser/keyboardEvent');
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IKeybindingService, KbExpr} from 'vs/platform/keybinding/common/keybindingService';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';

class ModesHoverController implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.hover';

	private _editor: EditorBrowser.ICodeEditor;
	private _toUnhook:EventEmitter.ListenerUnbind[];

	private _contentWidget: ModesContentHover.ModesContentHoverWidget;
	private _glyphWidget: ModesGlyphHover.ModesGlyphHoverWidget;

	static getModesHoverController(editor: EditorCommon.ICommonCodeEditor): ModesHoverController {
		return <ModesHoverController>editor.getContribution(ModesHoverController.ID);
	}

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
			this._contentWidget.startShowingAt(mouseEvent.target.range, false);
		} else if (targetType === EditorCommon.MouseTargetType.GUTTER_GLYPH_MARGIN) {
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

	public showContentHover(range: EditorCommon.IEditorRange, focus: boolean): void {
		this._contentWidget.startShowingAt(range, focus);
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

class ShowHoverAction extends EditorAction {
	static ID = 'editor.action.showHover';

	constructor(descriptor: EditorCommon.IEditorActionDescriptorData, editor: EditorCommon.ICommonCodeEditor, @IEditorService editorService: IEditorService) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run(): TPromise<any> {
		const position = this.editor.getPosition();
		const word = this.editor.getModel().getWordAtPosition(position);
		if (word) {
			const range = new Range(position.lineNumber, position.column, position.lineNumber, word.endColumn);
			(<ModesHoverController>this.editor.getContribution(ModesHoverController.ID)).showContentHover(range, true);
		}

		return TPromise.as(null);
	}
}

EditorBrowserRegistry.registerEditorContribution(ModesHoverController);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ShowHoverAction, ShowHoverAction.ID, nls.localize('showHover', "Show Hover"), {
	context: ContextKey.EditorTextFocus,
	kbExpr: KbExpr.has(EditorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS),
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_I)
}));
