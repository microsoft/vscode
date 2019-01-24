/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./hover';
import * as nls from 'vs/nls';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IEmptyContentData } from 'vs/editor/browser/controller/mouseTarget';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, IScrollEvent } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IModeService } from 'vs/editor/common/services/modeService';
import { HoverStartMode } from 'vs/editor/contrib/hover/hoverOperation';
import { ModesContentHoverWidget } from 'vs/editor/contrib/hover/modesContentHover';
import { ModesGlyphHoverWidget } from 'vs/editor/contrib/hover/modesGlyphHover';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { editorHoverBackground, editorHoverBorder, editorHoverHighlight, textCodeBlockBackground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markersDecorationService';

export class ModesHoverController implements IEditorContribution {

	private static readonly ID = 'editor.contrib.hover';

	private _toUnhook: IDisposable[];
	private _didChangeConfigurationHandler: IDisposable;

	private _contentWidget: ModesContentHoverWidget;
	private _glyphWidget: ModesGlyphHoverWidget;

	get contentWidget(): ModesContentHoverWidget {
		if (!this._contentWidget) {
			this._createHoverWidget();
		}
		return this._contentWidget;
	}

	get glyphWidget(): ModesGlyphHoverWidget {
		if (!this._glyphWidget) {
			this._createHoverWidget();
		}
		return this._glyphWidget;
	}

	private _isMouseDown: boolean;
	private _hoverClicked: boolean;
	private _isHoverEnabled: boolean;
	private _isHoverSticky: boolean;

	static get(editor: ICodeEditor): ModesHoverController {
		return editor.getContribution<ModesHoverController>(ModesHoverController.ID);
	}

	constructor(private readonly _editor: ICodeEditor,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IModeService private readonly _modeService: IModeService,
		@IMarkerDecorationsService private readonly _markerDecorationsService: IMarkerDecorationsService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		this._toUnhook = [];

		this._isMouseDown = false;
		this._hoverClicked = false;

		this._hookEvents();

		this._didChangeConfigurationHandler = this._editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.contribInfo) {
				this._hideWidgets();
				this._unhookEvents();
				this._hookEvents();
			}
		});
	}

	private _hookEvents(): void {
		const hideWidgetsEventHandler = () => this._hideWidgets();

		const hoverOpts = this._editor.getConfiguration().contribInfo.hover;
		this._isHoverEnabled = hoverOpts.enabled;
		this._isHoverSticky = hoverOpts.sticky;
		if (this._isHoverEnabled) {
			this._toUnhook.push(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
			this._toUnhook.push(this._editor.onMouseUp((e: IEditorMouseEvent) => this._onEditorMouseUp(e)));
			this._toUnhook.push(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
			this._toUnhook.push(this._editor.onKeyDown((e: IKeyboardEvent) => this._onKeyDown(e)));
			this._toUnhook.push(this._editor.onDidChangeModelDecorations(() => this._onModelDecorationsChanged()));
		} else {
			this._toUnhook.push(this._editor.onMouseMove(hideWidgetsEventHandler));
		}

		this._toUnhook.push(this._editor.onMouseLeave(hideWidgetsEventHandler));
		this._toUnhook.push(this._editor.onDidChangeModel(hideWidgetsEventHandler));
		this._toUnhook.push(this._editor.onDidScrollChange((e: IScrollEvent) => this._onEditorScrollChanged(e)));
	}

	private _unhookEvents(): void {
		this._toUnhook = dispose(this._toUnhook);
	}

	private _onModelDecorationsChanged(): void {
		this.contentWidget.onModelDecorationsChanged();
		this.glyphWidget.onModelDecorationsChanged();
	}

	private _onEditorScrollChanged(e: IScrollEvent): void {
		if (e.scrollTopChanged || e.scrollLeftChanged) {
			this._hideWidgets();
		}
	}

	private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		this._isMouseDown = true;

		const targetType = mouseEvent.target.type;

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
		// const this._editor.getConfiguration().contribInfo.hover.sticky;
		let targetType = mouseEvent.target.type;

		if (this._isMouseDown && this._hoverClicked && this.contentWidget.isColorPickerVisible()) {
			return;
		}

		if (this._isHoverSticky && targetType === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === ModesContentHoverWidget.ID) {
			// mouse moved on top of content hover widget
			return;
		}

		if (this._isHoverSticky && targetType === MouseTargetType.OVERLAY_WIDGET && mouseEvent.target.detail === ModesGlyphHoverWidget.ID) {
			// mouse moved on top of overlay hover widget
			return;
		}

		if (targetType === MouseTargetType.CONTENT_EMPTY) {
			const epsilon = this._editor.getConfiguration().fontInfo.typicalHalfwidthCharacterWidth / 2;
			const data = <IEmptyContentData>mouseEvent.target.detail;
			if (data && !data.isAfterLines && typeof data.horizontalDistanceToText === 'number' && data.horizontalDistanceToText < epsilon) {
				// Let hover kick in even when the mouse is technically in the empty area after a line, given the distance is small enough
				targetType = MouseTargetType.CONTENT_TEXT;
			}
		}

		if (targetType === MouseTargetType.CONTENT_TEXT) {
			this.glyphWidget.hide();

			if (this._isHoverEnabled && mouseEvent.target.range) {
				this.contentWidget.startShowingAt(mouseEvent.target.range, HoverStartMode.Delayed, false);
			}
		} else if (targetType === MouseTargetType.GUTTER_GLYPH_MARGIN) {
			this.contentWidget.hide();

			if (this._isHoverEnabled && mouseEvent.target.position) {
				this.glyphWidget.startShowingAt(mouseEvent.target.position.lineNumber);
			}
		} else {
			this._hideWidgets();
		}
	}

	private _onKeyDown(e: IKeyboardEvent): void {
		if (e.keyCode !== KeyCode.Ctrl && e.keyCode !== KeyCode.Alt && e.keyCode !== KeyCode.Meta && e.keyCode !== KeyCode.Shift) {
			// Do not hide hover when a modifier key is pressed
			this._hideWidgets();
		}
	}

	private _hideWidgets(): void {
		if (!this._contentWidget || (this._isMouseDown && this._hoverClicked && this._contentWidget.isColorPickerVisible())) {
			return;
		}

		this._glyphWidget.hide();
		this._contentWidget.hide();
	}

	private _createHoverWidget() {
		const renderer = new MarkdownRenderer(this._editor, this._modeService, this._openerService);
		this._contentWidget = new ModesContentHoverWidget(this._editor, renderer, this._markerDecorationsService, this._themeService);
		this._glyphWidget = new ModesGlyphHoverWidget(this._editor, renderer);
	}

	public showContentHover(range: Range, mode: HoverStartMode, focus: boolean): void {
		this.contentWidget.startShowingAt(range, mode, focus);
	}

	public getId(): string {
		return ModesHoverController.ID;
	}

	public dispose(): void {
		this._unhookEvents();
		this._didChangeConfigurationHandler.dispose();

		if (this._glyphWidget) {
			this._glyphWidget.dispose();
		}
		if (this._contentWidget) {
			this._contentWidget.dispose();
		}
	}
}

class ShowHoverAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.showHover',
			label: nls.localize({
				key: 'showHover',
				comment: [
					'Label for action that will trigger the showing of a hover in the editor.',
					'This allows for users to show the hover without using the mouse.'
				]
			}, "Show Hover"),
			alias: 'Show Hover',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_I),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}
		let controller = ModesHoverController.get(editor);
		if (!controller) {
			return;
		}
		const position = editor.getPosition();
		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		controller.showContentHover(range, HoverStartMode.Immediate, true);
	}
}

registerEditorContribution(ModesHoverController);
registerEditorAction(ShowHoverAction);

// theming
registerThemingParticipant((theme, collector) => {
	const editorHoverHighlightColor = theme.getColor(editorHoverHighlight);
	if (editorHoverHighlightColor) {
		collector.addRule(`.monaco-editor .hoverHighlight { background-color: ${editorHoverHighlightColor}; }`);
	}
	const hoverBackground = theme.getColor(editorHoverBackground);
	if (hoverBackground) {
		collector.addRule(`.monaco-editor .monaco-editor-hover { background-color: ${hoverBackground}; }`);
	}
	const hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.monaco-editor .monaco-editor-hover { border: 1px solid ${hoverBorder}; }`);
		collector.addRule(`.monaco-editor .monaco-editor-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-editor .monaco-editor-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-editor .monaco-editor-hover hr { border-bottom: 0px solid ${hoverBorder.transparent(0.5)}; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-editor .monaco-editor-hover a { color: ${link}; }`);
	}
	const codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.monaco-editor .monaco-editor-hover code { background-color: ${codeBackground}; }`);
	}
});
