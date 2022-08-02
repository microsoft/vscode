/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, IPartialEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, IScrollEvent } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { GotoDefinitionAtPositionEditorContribution } from 'vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition';
import { HoverStartMode } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { ContentHoverWidget, ContentHoverController } from 'vs/editor/contrib/hover/browser/contentHover';
import { MarginHoverWidget } from 'vs/editor/contrib/hover/browser/marginHover';
import * as nls from 'vs/nls';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { editorHoverBackground, editorHoverBorder, editorHoverForeground, editorHoverHighlight, editorHoverStatusBarBackground, textCodeBlockBackground, textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { MarkdownHoverParticipant } from 'vs/editor/contrib/hover/browser/markdownHoverParticipant';
import { MarkerHoverParticipant } from 'vs/editor/contrib/hover/browser/markerHoverParticipant';

export class ModesHoverController implements IEditorContribution {

	public static readonly ID = 'editor.contrib.hover';

	private readonly _toUnhook = new DisposableStore();
	private readonly _didChangeConfigurationHandler: IDisposable;

	private _contentWidget: ContentHoverController | null;
	private _glyphWidget: MarginHoverWidget | null;

	private _isMouseDown: boolean;
	private _hoverClicked: boolean;
	private _isHoverEnabled!: boolean;
	private _isHoverSticky!: boolean;

	static get(editor: ICodeEditor): ModesHoverController | null {
		return editor.getContribution<ModesHoverController>(ModesHoverController.ID);
	}

	constructor(private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IContextKeyService _contextKeyService: IContextKeyService
	) {
		this._isMouseDown = false;
		this._hoverClicked = false;
		this._contentWidget = null;
		this._glyphWidget = null;

		this._hookEvents();

		this._didChangeConfigurationHandler = this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.hover)) {
				this._unhookEvents();
				this._hookEvents();
			}
		});
	}

	private _hookEvents(): void {
		const hideWidgetsEventHandler = () => this._hideWidgets();

		const hoverOpts = this._editor.getOption(EditorOption.hover);
		this._isHoverEnabled = hoverOpts.enabled;
		this._isHoverSticky = hoverOpts.sticky;
		if (this._isHoverEnabled) {
			this._toUnhook.add(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
			this._toUnhook.add(this._editor.onMouseUp((e: IEditorMouseEvent) => this._onEditorMouseUp(e)));
			this._toUnhook.add(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
			this._toUnhook.add(this._editor.onKeyDown((e: IKeyboardEvent) => this._onKeyDown(e)));
		} else {
			this._toUnhook.add(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
			this._toUnhook.add(this._editor.onKeyDown((e: IKeyboardEvent) => this._onKeyDown(e)));
		}

		this._toUnhook.add(this._editor.onMouseLeave((e) => this._onEditorMouseLeave(e)));
		this._toUnhook.add(this._editor.onDidChangeModel(hideWidgetsEventHandler));
		this._toUnhook.add(this._editor.onDidScrollChange((e: IScrollEvent) => this._onEditorScrollChanged(e)));
	}

	private _unhookEvents(): void {
		this._toUnhook.clear();
	}

	private _onEditorScrollChanged(e: IScrollEvent): void {
		if (e.scrollTopChanged || e.scrollLeftChanged) {
			this._hideWidgets();
		}
	}

	private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		this._isMouseDown = true;

		const target = mouseEvent.target;

		if (target.type === MouseTargetType.CONTENT_WIDGET && target.detail === ContentHoverWidget.ID) {
			this._hoverClicked = true;
			// mouse down on top of content hover widget
			return;
		}

		if (target.type === MouseTargetType.OVERLAY_WIDGET && target.detail === MarginHoverWidget.ID) {
			// mouse down on top of overlay hover widget
			return;
		}

		if (target.type !== MouseTargetType.OVERLAY_WIDGET) {
			this._hoverClicked = false;
		}

		this._hideWidgets();
	}

	private _onEditorMouseUp(mouseEvent: IEditorMouseEvent): void {
		this._isMouseDown = false;
	}

	private _onEditorMouseLeave(mouseEvent: IPartialEditorMouseEvent): void {
		const targetEm = (mouseEvent.event.browserEvent.relatedTarget) as HTMLElement;
		if (this._contentWidget?.containsNode(targetEm)) {
			// when the mouse is inside hover widget
			return;
		}
		this._hideWidgets();
	}

	private _onEditorMouseMove(mouseEvent: IEditorMouseEvent): void {
		const target = mouseEvent.target;

		if (this._isMouseDown && this._hoverClicked) {
			return;
		}

		if (this._isHoverSticky && target.type === MouseTargetType.CONTENT_WIDGET && target.detail === ContentHoverWidget.ID) {
			// mouse moved on top of content hover widget
			return;
		}

		if (this._isHoverSticky && !mouseEvent.event.browserEvent.view?.getSelection()?.isCollapsed) {
			// selected text within content hover widget
			return;
		}

		if (
			!this._isHoverSticky && target.type === MouseTargetType.CONTENT_WIDGET && target.detail === ContentHoverWidget.ID
			&& this._contentWidget?.isColorPickerVisible()
		) {
			// though the hover is not sticky, the color picker needs to.
			return;
		}

		if (this._isHoverSticky && target.type === MouseTargetType.OVERLAY_WIDGET && target.detail === MarginHoverWidget.ID) {
			// mouse moved on top of overlay hover widget
			return;
		}

		if (!this._isHoverEnabled) {
			this._hideWidgets();
			return;
		}

		const contentWidget = this._getOrCreateContentWidget();
		if (contentWidget.maybeShowAt(mouseEvent)) {
			this._glyphWidget?.hide();
			return;
		}

		if (target.type === MouseTargetType.GUTTER_GLYPH_MARGIN && target.position) {
			this._contentWidget?.hide();
			if (!this._glyphWidget) {
				this._glyphWidget = new MarginHoverWidget(this._editor, this._languageService, this._openerService);
			}
			this._glyphWidget.startShowingAt(target.position.lineNumber);
			return;
		}

		this._hideWidgets();
	}

	private _onKeyDown(e: IKeyboardEvent): void {
		if (e.keyCode !== KeyCode.Ctrl && e.keyCode !== KeyCode.Alt && e.keyCode !== KeyCode.Meta && e.keyCode !== KeyCode.Shift) {
			// Do not hide hover when a modifier key is pressed
			this._hideWidgets();
		}
	}

	private _hideWidgets(): void {
		if ((this._isMouseDown && this._hoverClicked && this._contentWidget?.isColorPickerVisible())) {
			return;
		}

		this._hoverClicked = false;
		this._glyphWidget?.hide();
		this._contentWidget?.hide();
	}

	private _getOrCreateContentWidget(): ContentHoverController {
		if (!this._contentWidget) {
			this._contentWidget = this._instantiationService.createInstance(ContentHoverController, this._editor);
		}
		return this._contentWidget;
	}

	public isColorPickerVisible(): boolean {
		return this._contentWidget?.isColorPickerVisible() || false;
	}

	public showContentHover(range: Range, mode: HoverStartMode, focus: boolean): void {
		this._getOrCreateContentWidget().startShowingAtRange(range, mode, focus);
	}

	public dispose(): void {
		this._unhookEvents();
		this._toUnhook.dispose();
		this._didChangeConfigurationHandler.dispose();
		this._glyphWidget?.dispose();
		this._contentWidget?.dispose();
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
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}
		const controller = ModesHoverController.get(editor);
		if (!controller) {
			return;
		}
		const position = editor.getPosition();
		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		const focus = editor.getOption(EditorOption.accessibilitySupport) === AccessibilitySupport.Enabled;
		controller.showContentHover(range, HoverStartMode.Immediate, focus);
	}
}

class ShowDefinitionPreviewHoverAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.showDefinitionPreviewHover',
			label: nls.localize({
				key: 'showDefinitionPreviewHover',
				comment: [
					'Label for action that will trigger the showing of definition preview hover in the editor.',
					'This allows for users to show the definition preview hover without using the mouse.'
				]
			}, "Show Definition Preview Hover"),
			alias: 'Show Definition Preview Hover',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = ModesHoverController.get(editor);
		if (!controller) {
			return;
		}
		const position = editor.getPosition();

		if (!position) {
			return;
		}

		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		const goto = GotoDefinitionAtPositionEditorContribution.get(editor);
		if (!goto) {
			return;
		}
		const promise = goto.startFindDefinitionFromCursor(position);
		promise.then(() => {
			controller.showContentHover(range, HoverStartMode.Immediate, true);
		});
	}
}

registerEditorContribution(ModesHoverController.ID, ModesHoverController);
registerEditorAction(ShowHoverAction);
registerEditorAction(ShowDefinitionPreviewHoverAction);
HoverParticipantRegistry.register(MarkdownHoverParticipant);
HoverParticipantRegistry.register(MarkerHoverParticipant);

// theming
registerThemingParticipant((theme, collector) => {
	const editorHoverHighlightColor = theme.getColor(editorHoverHighlight);
	if (editorHoverHighlightColor) {
		collector.addRule(`.monaco-editor .hoverHighlight { background-color: ${editorHoverHighlightColor}; }`);
	}
	const hoverBackground = theme.getColor(editorHoverBackground);
	if (hoverBackground) {
		collector.addRule(`.monaco-editor .monaco-hover { background-color: ${hoverBackground}; }`);
	}
	const hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.monaco-editor .monaco-hover { border: 1px solid ${hoverBorder}; }`);
		collector.addRule(`.monaco-editor .monaco-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-editor .monaco-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-editor .monaco-hover hr { border-bottom: 0px solid ${hoverBorder.transparent(0.5)}; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-editor .monaco-hover a { color: ${link}; }`);
	}
	const linkHover = theme.getColor(textLinkActiveForeground);
	if (linkHover) {
		collector.addRule(`.monaco-editor .monaco-hover a:hover { color: ${linkHover}; }`);
	}
	const hoverForeground = theme.getColor(editorHoverForeground);
	if (hoverForeground) {
		collector.addRule(`.monaco-editor .monaco-hover { color: ${hoverForeground}; }`);
	}
	const actionsBackground = theme.getColor(editorHoverStatusBarBackground);
	if (actionsBackground) {
		collector.addRule(`.monaco-editor .monaco-hover .hover-row .actions { background-color: ${actionsBackground}; }`);
	}
	const codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.monaco-editor .monaco-hover code { background-color: ${codeBackground}; }`);
	}
});
