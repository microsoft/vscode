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
import { IEditorContribution, IScrollEvent } from 'vs/editor/common/editorCommon';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { registerEditorAction, registerEditorContribution, ServicesAccessor, EditorAction } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ModesContentHoverWidget } from './modesContentHover';
import { ModesGlyphHoverWidget } from './modesGlyphHover';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { registerThemingParticipant, IThemeService } from 'vs/platform/theme/common/themeService';
import { editorHoverHighlight, editorHoverBackground, editorHoverBorder, textLinkForeground, textCodeBlockBackground } from 'vs/platform/theme/common/colorRegistry';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { IEmptyContentData } from 'vs/editor/browser/controller/mouseTarget';
import { HoverStartMode } from 'vs/editor/contrib/hover/hoverOperation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { getDefinitionsAtPosition } from 'vs/editor/contrib/goToDefinition/goToDefinition';
import { createCancelablePromise, CancelablePromise } from 'vs/base/common/async';
import { DefinitionLink } from 'vs/editor/common/modes';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Position } from 'vs/editor/common/core/position';
import { EditorState, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';

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
		const hasStopKey = (platform.isMacintosh ? mouseEvent.event.metaKey : mouseEvent.event.ctrlKey);

		if (this._isMouseDown && this._hoverClicked && this.contentWidget.isColorPickerVisible()) {
			return;
		}

		if (this._isHoverSticky && targetType === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === ModesContentHoverWidget.ID && !hasStopKey) {
			// mouse moved on top of content hover widget
			return;
		}

		if (this._isHoverSticky && targetType === MouseTargetType.OVERLAY_WIDGET && mouseEvent.target.detail === ModesGlyphHoverWidget.ID && !hasStopKey) {
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

			if (this._isHoverEnabled) {
				this.contentWidget.startShowingAt(mouseEvent.target.range, HoverStartMode.Delayed, false);
			}
		} else if (targetType === MouseTargetType.GUTTER_GLYPH_MARGIN) {
			this.contentWidget.hide();

			if (this._isHoverEnabled) {
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
		this._contentWidget = new ModesContentHoverWidget(this._editor, renderer, this._themeService);
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
			this._glyphWidget = null;
		}
		if (this._contentWidget) {
			this._contentWidget.dispose();
			this._contentWidget = null;
		}
	}
}

class ShowHoverAction extends EditorAction {
	private static previousPromise: CancelablePromise<DefinitionLink[]>;
	private static decorations: string[] = [];
	static MAX_SOURCE_PREVIEW_LINES = 8;

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
		const textModelResolverService = accessor.get(ITextModelService);
		const modeService = accessor.get(IModeService);

		let controller = ModesHoverController.get(editor);
		if (!controller) {
			return;
		}
		const position = editor.getPosition();
		const word = editor.getModel().getWordAtPosition(position);
		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);

		if (!word) {
			this.removeDecorations(editor);
			return;
		}

		if (ShowHoverAction.previousPromise) {
			ShowHoverAction.previousPromise.cancel();
			ShowHoverAction.previousPromise = null;
		}

		let state = new EditorState(editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection | CodeEditorStateFlag.Scroll);

		ShowHoverAction.previousPromise = createCancelablePromise(token => getDefinitionsAtPosition(editor.getModel(), position, token));
		ShowHoverAction.previousPromise.then(results => {
			if (!results || !results.length || !state.validate(editor)) {
				this.removeDecorations(editor);
				return;
			}

			// Multiple results
			if (results.length > 1) {
				this.addDecoration(
					new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
					new MarkdownString().appendText(nls.localize('multipleResults', "Click to show {0} definitions.", results.length)),
					editor
				);
			}

			// Single result
			else {
				let result = results[0];

				if (!result.uri) {
					return;
				}

				textModelResolverService.createModelReference(result.uri).then(ref => {

					if (!ref.object || !ref.object.textEditorModel) {
						ref.dispose();
						return;
					}

					const { object: { textEditorModel } } = ref;
					const { startLineNumber } = result.range;

					if (startLineNumber < 1 || startLineNumber > textEditorModel.getLineCount()) {
						// invalid range
						ref.dispose();
						return;
					}

					const previewValue = this.getPreviewValue(textEditorModel, startLineNumber);

					let wordRange: Range;
					if (result.origin) {
						wordRange = Range.lift(result.origin);
					} else {
						wordRange = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
					}

					this.addDecoration(
						wordRange,
						new MarkdownString().appendCodeblock(modeService.getModeIdByFilenameOrFirstLine(textEditorModel.uri.fsPath), previewValue
						), editor);

					ref.dispose();
				});
			}

			controller.showContentHover(range, HoverStartMode.Immediate, false);
		}).then(undefined, onUnexpectedError);

	}

	private addDecoration(range: Range, hoverMessage: MarkdownString, editor: ICodeEditor): string[] {

		const newDecorations: IModelDeltaDecoration = {
			range: range,
			options: {
				inlineClassName: 'show-definition-hover',
				hoverMessage
			}
		};

		return ShowHoverAction.decorations = editor.deltaDecorations(ShowHoverAction.decorations, [newDecorations]);
	}

	private removeDecorations(editor: ICodeEditor): void {
		if (ShowHoverAction.decorations.length > 0) {
			ShowHoverAction.decorations = editor.deltaDecorations(ShowHoverAction.decorations, []);
		}
	}


	private getPreviewValue(textEditorModel: ITextModel, startLineNumber: number) {
		let rangeToUse = this.getPreviewRangeBasedOnBrackets(textEditorModel, startLineNumber);
		const numberOfLinesInRange = rangeToUse.endLineNumber - rangeToUse.startLineNumber;
		if (numberOfLinesInRange >= ShowHoverAction.MAX_SOURCE_PREVIEW_LINES) {
			rangeToUse = this.getPreviewRangeBasedOnIndentation(textEditorModel, startLineNumber);
		}

		const previewValue = this.stripIndentationFromPreviewRange(textEditorModel, startLineNumber, rangeToUse);
		return previewValue;
	}

	private stripIndentationFromPreviewRange(textEditorModel: ITextModel, startLineNumber: number, previewRange: Range) {
		const startIndent = textEditorModel.getLineFirstNonWhitespaceColumn(startLineNumber);
		let minIndent = startIndent;

		for (let endLineNumber = startLineNumber + 1; endLineNumber < previewRange.endLineNumber; endLineNumber++) {
			const endIndent = textEditorModel.getLineFirstNonWhitespaceColumn(endLineNumber);
			minIndent = Math.min(minIndent, endIndent);
		}

		const previewValue = textEditorModel.getValueInRange(previewRange).replace(new RegExp(`^\\s{${minIndent - 1}}`, 'gm'), '').trim();
		return previewValue;
	}

	private getPreviewRangeBasedOnIndentation(textEditorModel: ITextModel, startLineNumber: number) {
		const startIndent = textEditorModel.getLineFirstNonWhitespaceColumn(startLineNumber);
		const maxLineNumber = Math.min(textEditorModel.getLineCount(), startLineNumber + ShowHoverAction.MAX_SOURCE_PREVIEW_LINES);
		let endLineNumber = startLineNumber + 1;

		for (; endLineNumber < maxLineNumber; endLineNumber++) {
			let endIndent = textEditorModel.getLineFirstNonWhitespaceColumn(endLineNumber);

			if (startIndent === endIndent) {
				break;
			}
		}

		return new Range(startLineNumber, 1, endLineNumber + 1, 1);
	}

	private getPreviewRangeBasedOnBrackets(textEditorModel: ITextModel, startLineNumber: number) {
		const maxLineNumber = Math.min(textEditorModel.getLineCount(), startLineNumber + ShowHoverAction.MAX_SOURCE_PREVIEW_LINES);

		const brackets = [];

		let ignoreFirstEmpty = true;
		let currentBracket = textEditorModel.findNextBracket(new Position(startLineNumber, 1));
		while (currentBracket !== null) {

			if (brackets.length === 0) {
				brackets.push(currentBracket);
			} else {
				const lastBracket = brackets[brackets.length - 1];
				if (lastBracket.open === currentBracket.open && lastBracket.isOpen && !currentBracket.isOpen) {
					brackets.pop();
				} else {
					brackets.push(currentBracket);
				}

				if (brackets.length === 0) {
					if (ignoreFirstEmpty) {
						ignoreFirstEmpty = false;
					} else {
						return new Range(startLineNumber, 1, currentBracket.range.endLineNumber + 1, 1);
					}
				}
			}

			const maxColumn = textEditorModel.getLineMaxColumn(startLineNumber);
			let nextLineNumber = currentBracket.range.endLineNumber;
			let nextColumn = currentBracket.range.endColumn;
			if (maxColumn === currentBracket.range.endColumn) {
				nextLineNumber++;
				nextColumn = 1;
			}

			if (nextLineNumber > maxLineNumber) {
				return new Range(startLineNumber, 1, maxLineNumber + 1, 1);
			}

			currentBracket = textEditorModel.findNextBracket(new Position(nextLineNumber, nextColumn));
		}

		return new Range(startLineNumber, 1, maxLineNumber + 1, 1);
	}

}

registerEditorContribution(ModesHoverController);
registerEditorAction(ShowHoverAction);

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
