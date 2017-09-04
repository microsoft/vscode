/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./hover';
import * as nls from 'vs/nls';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ModesContentHoverWidget } from './modesContentHover';
import { ModesGlyphHoverWidget } from './modesGlyphHover';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorHoverHighlight, editorHoverBackground, editorHoverBorder, textLinkForeground, textCodeBlockBackground } from 'vs/platform/theme/common/colorRegistry';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

@editorContribution
export class ModesHoverController implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.hover';

	private _editor: ICodeEditor;
	private _toUnhook: IDisposable[];

	private _contentWidget: ModesContentHoverWidget;
	private _glyphWidget: ModesGlyphHoverWidget;

	private _isMouseDown: boolean;
	private _hoverClicked: boolean;

	static get(editor: editorCommon.ICommonCodeEditor): ModesHoverController {
		return editor.getContribution<ModesHoverController>(ModesHoverController.ID);
	}

	constructor(editor: ICodeEditor,
		@IOpenerService openerService: IOpenerService,
		@IModeService modeService: IModeService
	) {
		this._editor = editor;

		this._toUnhook = [];
		this._isMouseDown = false;

		if (editor.getConfiguration().contribInfo.hover) {
			this._toUnhook.push(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
			this._toUnhook.push(this._editor.onMouseUp((e: IEditorMouseEvent) => this._onEditorMouseUp(e)));
			this._toUnhook.push(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
			this._toUnhook.push(this._editor.onMouseLeave((e: IEditorMouseEvent) => this._hideWidgets()));
			this._toUnhook.push(this._editor.onKeyDown((e: IKeyboardEvent) => this._onKeyDown(e)));
			this._toUnhook.push(this._editor.onDidChangeModel(() => this._hideWidgets()));
			this._toUnhook.push(this._editor.onDidChangeModelDecorations(() => this._onModelDecorationsChanged()));
			this._toUnhook.push(this._editor.onDidScrollChange((e) => {
				if (e.scrollTopChanged || e.scrollLeftChanged) {
					this._hideWidgets();
				}
			}));

			this._contentWidget = new ModesContentHoverWidget(editor, openerService, modeService);
			this._glyphWidget = new ModesGlyphHoverWidget(editor, openerService, modeService);
		}
	}

	private _onModelDecorationsChanged(): void {
		this._contentWidget.onModelDecorationsChanged();
		this._glyphWidget.onModelDecorationsChanged();
	}

	private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		this._isMouseDown = true;

		var targetType = mouseEvent.target.type;

		if (targetType === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === ModesContentHoverWidget.ID) {
			this._hoverClicked = true;
			// mouse down on top of content hover widget
			return;
		}

		if (targetType === MouseTargetType.OVERLAY_WIDGET && mouseEvent.target.detail === ModesGlyphHoverWidget.ID) {
			// mouse down on top of overlay hover widget
			return;
		}

		if (targetType !== MouseTargetType.OVERLAY_WIDGET && mouseEvent.target.detail !== ModesGlyphHoverWidget.ID) {
			this._hoverClicked = false;
		}

		this._hideWidgets();
	}

	private _onEditorMouseUp(mouseEvent: IEditorMouseEvent): void {
		this._isMouseDown = false;
	}

	private _onEditorMouseMove(mouseEvent: IEditorMouseEvent): void {
		var targetType = mouseEvent.target.type;
		var stopKey = platform.isMacintosh ? 'metaKey' : 'ctrlKey';

		if (this._isMouseDown && this._hoverClicked && this._contentWidget.isColorPickerVisible()) {
			return;
		}

		if (targetType === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === ModesContentHoverWidget.ID && !mouseEvent.event[stopKey]) {
			// mouse moved on top of content hover widget
			return;
		}

		if (targetType === MouseTargetType.OVERLAY_WIDGET && mouseEvent.target.detail === ModesGlyphHoverWidget.ID && !mouseEvent.event[stopKey]) {
			// mouse moved on top of overlay hover widget
			return;
		}

		if (this._editor.getConfiguration().contribInfo.hover && targetType === MouseTargetType.CONTENT_TEXT) {
			this._glyphWidget.hide();
			this._contentWidget.startShowingAt(mouseEvent.target.range, false);
		} else if (targetType === MouseTargetType.GUTTER_GLYPH_MARGIN) {
			this._contentWidget.hide();
			this._glyphWidget.startShowingAt(mouseEvent.target.position.lineNumber);
		} else {
			this._hideWidgets();
		}
	}

	private _onKeyDown(e: IKeyboardEvent): void {
		if (e.keyCode !== KeyCode.Ctrl && e.keyCode !== KeyCode.Alt && e.keyCode !== KeyCode.Meta) {
			// Do not hide hover when Ctrl/Meta is pressed
			this._hideWidgets();
		}
	}

	private _hideWidgets(): void {
		if (this._isMouseDown && this._hoverClicked && this._contentWidget.isColorPickerVisible()) {
			return;
		}

		this._glyphWidget.hide();
		this._contentWidget.hide();
	}

	public showContentHover(range: Range, focus: boolean): void {
		this._contentWidget.startShowingAt(range, focus);
	}

	public getId(): string {
		return ModesHoverController.ID;
	}

	public dispose(): void {
		this._toUnhook = dispose(this._toUnhook);
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

@editorAction
class ShowHoverAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.showHover',
			label: nls.localize('showHover', "Show Hover"),
			alias: 'Show Hover',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_I)
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		let controller = ModesHoverController.get(editor);
		if (!controller) {
			return;
		}
		const position = editor.getPosition();
		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		controller.showContentHover(range, true);
	}
}

// theming
registerThemingParticipant((theme, collector) => {
	let editorHoverHighlightColor = theme.getColor(editorHoverHighlight);
	if (editorHoverHighlightColor) {
		collector.addRule(`.monaco-editor .hoverHighlight { background-color: ${editorHoverHighlightColor}; }`);
	}
	let hoverBackground = theme.getColor(editorHoverBackground);
	if (hoverBackground) {
		collector.addRule(`.monaco-editor .monaco-editor-hover { background-color: ${hoverBackground}; }`);
	}
	let hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.monaco-editor .monaco-editor-hover { border: 1px solid ${hoverBorder}; }`);
		collector.addRule(`.monaco-editor .monaco-editor-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
	}
	let link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-editor .monaco-editor-hover a { color: ${link}; }`);
	}
	let codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.monaco-editor .monaco-editor-hover code { background-color: ${codeBackground}; }`);
	}

});
