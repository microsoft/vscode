/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./textAreaHandler';
import * as browser from 'vs/base/browser/browser';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { CopyOptions, ICompositionData, IPasteData, ITextAreaInputHost, TextAreaInput } from 'vs/editor/browser/controller/textAreaInput';
import { ISimpleModel, ITypeData, PagedScreenReaderStrategy, TextAreaState } from 'vs/editor/browser/controller/textAreaState';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { PartFingerprint, PartFingerprints, ViewPart } from 'vs/editor/browser/view/viewPart';
import { LineNumbersOverlay } from 'vs/editor/browser/viewParts/lineNumbers/lineNumbers';
import { Margin } from 'vs/editor/browser/viewParts/margin/margin';
import { RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { WordCharacterClass, getMapForWordSeparators } from 'vs/editor/common/controller/wordCharacterClassifier';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { HorizontalRange, RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';

export interface ITextAreaHandlerHelper {
	visibleRangeForPositionRelativeToEditor(lineNumber: number, column: number): HorizontalRange | null;
}

class VisibleTextAreaData {
	_visibleTextAreaBrand: void;

	public readonly top: number;
	public readonly left: number;
	public readonly width: number;

	constructor(top: number, left: number, width: number) {
		this.top = top;
		this.left = left;
		this.width = width;
	}

	public setWidth(width: number): VisibleTextAreaData {
		return new VisibleTextAreaData(this.top, this.left, width);
	}
}

const canUseZeroSizeTextarea = (browser.isEdgeOrIE || browser.isFirefox);

interface LocalClipboardMetadata {
	lastCopiedValue: string;
	isFromEmptySelection: boolean;
	multicursorText: string[] | null;
}

/**
 * Every time we write to the clipboard, we record a bit of extra metadata here.
 * Every time we read from the cipboard, if the text matches our last written text,
 * we can fetch the previous metadata.
 */
class LocalClipboardMetadataManager {
	public static INSTANCE = new LocalClipboardMetadataManager();

	private _lastState: LocalClipboardMetadata | null;

	constructor() {
		this._lastState = null;
	}

	public set(state: LocalClipboardMetadata | null): void {
		this._lastState = state;
	}

	public get(pastedText: string): LocalClipboardMetadata | null {
		if (this._lastState && this._lastState.lastCopiedValue === pastedText) {
			// match!
			return this._lastState;
		}
		this._lastState = null;
		return null;
	}
}

export class TextAreaHandler extends ViewPart {

	private readonly _viewController: ViewController;
	private readonly _viewHelper: ITextAreaHandlerHelper;
	private _accessibilitySupport: AccessibilitySupport;
	private _contentLeft: number;
	private _contentWidth: number;
	private _contentHeight: number;
	private _scrollLeft: number;
	private _scrollTop: number;
	private _fontInfo: BareFontInfo;
	private _lineHeight: number;
	private _emptySelectionClipboard: boolean;
	private _copyWithSyntaxHighlighting: boolean;

	/**
	 * Defined only when the text area is visible (composition case).
	 */
	private _visibleTextArea: VisibleTextAreaData | null;
	private _selections: Selection[];

	public readonly textArea: FastDomNode<HTMLTextAreaElement>;
	public readonly textAreaCover: FastDomNode<HTMLElement>;
	private readonly _textAreaInput: TextAreaInput;

	constructor(context: ViewContext, viewController: ViewController, viewHelper: ITextAreaHandlerHelper) {
		super(context);

		this._viewController = viewController;
		this._viewHelper = viewHelper;

		const conf = this._context.configuration.editor;

		this._accessibilitySupport = conf.accessibilitySupport;
		this._contentLeft = conf.layoutInfo.contentLeft;
		this._contentWidth = conf.layoutInfo.contentWidth;
		this._contentHeight = conf.layoutInfo.contentHeight;
		this._scrollLeft = 0;
		this._scrollTop = 0;
		this._fontInfo = conf.fontInfo;
		this._lineHeight = conf.lineHeight;
		this._emptySelectionClipboard = conf.emptySelectionClipboard;
		this._copyWithSyntaxHighlighting = conf.copyWithSyntaxHighlighting;

		this._visibleTextArea = null;
		this._selections = [new Selection(1, 1, 1, 1)];

		// Text Area (The focus will always be in the textarea when the cursor is blinking)
		this.textArea = createFastDomNode(document.createElement('textarea'));
		PartFingerprints.write(this.textArea, PartFingerprint.TextArea);
		this.textArea.setClassName('inputarea');
		this.textArea.setAttribute('wrap', 'off');
		this.textArea.setAttribute('autocorrect', 'off');
		this.textArea.setAttribute('autocapitalize', 'off');
		this.textArea.setAttribute('autocomplete', 'off');
		this.textArea.setAttribute('spellcheck', 'false');
		this.textArea.setAttribute('aria-label', conf.viewInfo.ariaLabel);
		this.textArea.setAttribute('role', 'textbox');
		this.textArea.setAttribute('aria-multiline', 'true');
		this.textArea.setAttribute('aria-haspopup', 'false');
		this.textArea.setAttribute('aria-autocomplete', 'both');

		this.textAreaCover = createFastDomNode(document.createElement('div'));
		this.textAreaCover.setPosition('absolute');

		const simpleModel: ISimpleModel = {
			getLineCount: (): number => {
				return this._context.model.getLineCount();
			},
			getLineMaxColumn: (lineNumber: number): number => {
				return this._context.model.getLineMaxColumn(lineNumber);
			},
			getValueInRange: (range: Range, eol: EndOfLinePreference): string => {
				return this._context.model.getValueInRange(range, eol);
			}
		};

		const textAreaInputHost: ITextAreaInputHost = {
			getPlainTextToCopy: (): string => {
				const rawWhatToCopy = this._context.model.getPlainTextToCopy(this._selections, this._emptySelectionClipboard, platform.isWindows);
				const newLineCharacter = this._context.model.getEOL();

				const isFromEmptySelection = (this._emptySelectionClipboard && this._selections.length === 1 && this._selections[0].isEmpty());
				const multicursorText = (Array.isArray(rawWhatToCopy) ? rawWhatToCopy : null);
				const whatToCopy = (Array.isArray(rawWhatToCopy) ? rawWhatToCopy.join(newLineCharacter) : rawWhatToCopy);

				let metadata: LocalClipboardMetadata | null = null;
				if (isFromEmptySelection || multicursorText) {
					// Only store the non-default metadata

					// When writing "LINE\r\n" to the clipboard and then pasting,
					// Firefox pastes "LINE\n", so let's work around this quirk
					const lastCopiedValue = (browser.isFirefox ? whatToCopy.replace(/\r\n/g, '\n') : whatToCopy);
					metadata = {
						lastCopiedValue: lastCopiedValue,
						isFromEmptySelection: (this._emptySelectionClipboard && this._selections.length === 1 && this._selections[0].isEmpty()),
						multicursorText: multicursorText
					};
				}

				LocalClipboardMetadataManager.INSTANCE.set(metadata);

				return whatToCopy;
			},

			getHTMLToCopy: (): string | null => {
				if (!this._copyWithSyntaxHighlighting && !CopyOptions.forceCopyWithSyntaxHighlighting) {
					return null;
				}

				return this._context.model.getHTMLToCopy(this._selections, this._emptySelectionClipboard);
			},

			getScreenReaderContent: (currentState: TextAreaState): TextAreaState => {

				if (browser.isIPad) {
					// Do not place anything in the textarea for the iPad
					return TextAreaState.EMPTY;
				}

				if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
					// We know for a fact that a screen reader is not attached
					// On OSX, we write the character before the cursor to allow for "long-press" composition
					// Also on OSX, we write the word before the cursor to allow for the Accessibility Keyboard to give good hints
					if (platform.isMacintosh) {
						const selection = this._selections[0];
						if (selection.isEmpty()) {
							const position = selection.getStartPosition();

							let textBefore = this._getWordBeforePosition(position);
							if (textBefore.length === 0) {
								textBefore = this._getCharacterBeforePosition(position);
							}

							if (textBefore.length > 0) {
								return new TextAreaState(textBefore, textBefore.length, textBefore.length, position, position);
							}
						}
					}
					return TextAreaState.EMPTY;
				}

				return PagedScreenReaderStrategy.fromEditorSelection(currentState, simpleModel, this._selections[0], this._accessibilitySupport === AccessibilitySupport.Unknown);
			},

			deduceModelPosition: (viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position => {
				return this._context.model.deduceModelPositionRelativeToViewPosition(viewAnchorPosition, deltaOffset, lineFeedCnt);
			}
		};

		this._textAreaInput = this._register(new TextAreaInput(textAreaInputHost, this.textArea));

		this._register(this._textAreaInput.onKeyDown((e: IKeyboardEvent) => {
			this._viewController.emitKeyDown(e);
		}));

		this._register(this._textAreaInput.onKeyUp((e: IKeyboardEvent) => {
			this._viewController.emitKeyUp(e);
		}));

		this._register(this._textAreaInput.onPaste((e: IPasteData) => {
			const metadata = LocalClipboardMetadataManager.INSTANCE.get(e.text);

			let pasteOnNewLine = false;
			let multicursorText: string[] | null = null;
			if (metadata) {
				pasteOnNewLine = (this._emptySelectionClipboard && metadata.isFromEmptySelection);
				multicursorText = metadata.multicursorText;
			}
			this._viewController.paste('keyboard', e.text, pasteOnNewLine, multicursorText);
		}));

		this._register(this._textAreaInput.onCut(() => {
			this._viewController.cut('keyboard');
		}));

		this._register(this._textAreaInput.onType((e: ITypeData) => {
			if (e.replaceCharCnt) {
				this._viewController.replacePreviousChar('keyboard', e.text, e.replaceCharCnt);
			} else {
				this._viewController.type('keyboard', e.text);
			}
		}));

		this._register(this._textAreaInput.onSelectionChangeRequest((modelSelection: Selection) => {
			this._viewController.setSelection('keyboard', modelSelection);
		}));

		this._register(this._textAreaInput.onCompositionStart(() => {
			const lineNumber = this._selections[0].startLineNumber;
			const column = this._selections[0].startColumn;

			this._context.privateViewEventBus.emit(new viewEvents.ViewRevealRangeRequestEvent(
				new Range(lineNumber, column, lineNumber, column),
				viewEvents.VerticalRevealType.Simple,
				true,
				ScrollType.Immediate
			));

			// Find range pixel position
			const visibleRange = this._viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column);

			if (visibleRange) {
				this._visibleTextArea = new VisibleTextAreaData(
					this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber),
					visibleRange.left,
					canUseZeroSizeTextarea ? 0 : 1
				);
				this._render();
			}

			// Show the textarea
			this.textArea.setClassName('inputarea ime-input');

			this._viewController.compositionStart('keyboard');
		}));

		this._register(this._textAreaInput.onCompositionUpdate((e: ICompositionData) => {
			if (browser.isEdgeOrIE) {
				// Due to isEdgeOrIE (where the textarea was not cleared initially)
				// we cannot assume the text consists only of the composited text
				this._visibleTextArea = this._visibleTextArea!.setWidth(0);
			} else {
				// adjust width by its size
				this._visibleTextArea = this._visibleTextArea!.setWidth(measureText(e.data, this._fontInfo));
			}
			this._render();
		}));

		this._register(this._textAreaInput.onCompositionEnd(() => {

			this._visibleTextArea = null;
			this._render();

			this.textArea.setClassName('inputarea');
			this._viewController.compositionEnd('keyboard');
		}));

		this._register(this._textAreaInput.onFocus(() => {
			this._context.privateViewEventBus.emit(new viewEvents.ViewFocusChangedEvent(true));
		}));

		this._register(this._textAreaInput.onBlur(() => {
			this._context.privateViewEventBus.emit(new viewEvents.ViewFocusChangedEvent(false));
		}));
	}

	public dispose(): void {
		super.dispose();
	}

	private _getWordBeforePosition(position: Position): string {
		const lineContent = this._context.model.getLineContent(position.lineNumber);
		const wordSeparators = getMapForWordSeparators(this._context.configuration.editor.wordSeparators);

		let column = position.column;
		let distance = 0;
		while (column > 1) {
			const charCode = lineContent.charCodeAt(column - 2);
			const charClass = wordSeparators.get(charCode);
			if (charClass !== WordCharacterClass.Regular || distance > 50) {
				return lineContent.substring(column - 1, position.column - 1);
			}
			distance++;
			column--;
		}
		return lineContent.substring(0, position.column - 1);
	}

	private _getCharacterBeforePosition(position: Position): string {
		if (position.column > 1) {
			const lineContent = this._context.model.getLineContent(position.lineNumber);
			const charBefore = lineContent.charAt(position.column - 2);
			if (!strings.isHighSurrogate(charBefore.charCodeAt(0))) {
				return charBefore;
			}
		}
		return '';
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const conf = this._context.configuration.editor;

		if (e.fontInfo) {
			this._fontInfo = conf.fontInfo;
		}
		if (e.viewInfo) {
			this.textArea.setAttribute('aria-label', conf.viewInfo.ariaLabel);
		}
		if (e.layoutInfo) {
			this._contentLeft = conf.layoutInfo.contentLeft;
			this._contentWidth = conf.layoutInfo.contentWidth;
			this._contentHeight = conf.layoutInfo.contentHeight;
		}
		if (e.lineHeight) {
			this._lineHeight = conf.lineHeight;
		}
		if (e.accessibilitySupport) {
			this._accessibilitySupport = conf.accessibilitySupport;
			this._textAreaInput.writeScreenReaderContent('strategy changed');
		}
		if (e.emptySelectionClipboard) {
			this._emptySelectionClipboard = conf.emptySelectionClipboard;
		}
		if (e.copyWithSyntaxHighlighting) {
			this._copyWithSyntaxHighlighting = conf.copyWithSyntaxHighlighting;
		}

		return true;
	}
	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections.slice(0);
		this._textAreaInput.writeScreenReaderContent('selection changed');
		return true;
	}
	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return true;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._scrollLeft = e.scrollLeft;
		this._scrollTop = e.scrollTop;
		return true;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// --- end event handlers

	// --- begin view API

	public isFocused(): boolean {
		return this._textAreaInput.isFocused();
	}

	public focusTextArea(): void {
		this._textAreaInput.focusTextArea();
	}

	// --- end view API

	private _primaryCursorVisibleRange: HorizontalRange | null = null;

	public prepareRender(ctx: RenderingContext): void {
		const primaryCursorPosition = new Position(this._selections[0].positionLineNumber, this._selections[0].positionColumn);
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(primaryCursorPosition);
	}

	public render(ctx: RestrictedRenderingContext): void {
		this._textAreaInput.writeScreenReaderContent('render');
		this._render();
	}

	private _render(): void {
		if (this._visibleTextArea) {
			// The text area is visible for composition reasons
			this._renderInsideEditor(
				this._visibleTextArea.top - this._scrollTop,
				this._contentLeft + this._visibleTextArea.left - this._scrollLeft,
				this._visibleTextArea.width,
				this._lineHeight,
				true
			);
			return;
		}

		if (!this._primaryCursorVisibleRange) {
			// The primary cursor is outside the viewport => place textarea to the top left
			this._renderAtTopLeft();
			return;
		}

		const left = this._contentLeft + this._primaryCursorVisibleRange.left - this._scrollLeft;
		if (left < this._contentLeft || left > this._contentLeft + this._contentWidth) {
			// cursor is outside the viewport
			this._renderAtTopLeft();
			return;
		}

		const top = this._context.viewLayout.getVerticalOffsetForLineNumber(this._selections[0].positionLineNumber) - this._scrollTop;
		if (top < 0 || top > this._contentHeight) {
			// cursor is outside the viewport
			this._renderAtTopLeft();
			return;
		}

		// The primary cursor is in the viewport (at least vertically) => place textarea on the cursor
		this._renderInsideEditor(
			top, left,
			canUseZeroSizeTextarea ? 0 : 1, canUseZeroSizeTextarea ? 0 : 1,
			false
		);
	}

	private _renderInsideEditor(top: number, left: number, width: number, height: number, useEditorFont: boolean): void {
		const ta = this.textArea;
		const tac = this.textAreaCover;

		if (useEditorFont) {
			Configuration.applyFontInfo(ta, this._fontInfo);
		} else {
			ta.setFontSize(1);
			ta.setLineHeight(this._fontInfo.lineHeight);
		}

		ta.setTop(top);
		ta.setLeft(left);
		ta.setWidth(width);
		ta.setHeight(height);

		tac.setTop(0);
		tac.setLeft(0);
		tac.setWidth(0);
		tac.setHeight(0);
	}

	private _renderAtTopLeft(): void {
		const ta = this.textArea;
		const tac = this.textAreaCover;

		Configuration.applyFontInfo(ta, this._fontInfo);
		ta.setTop(0);
		ta.setLeft(0);
		tac.setTop(0);
		tac.setLeft(0);

		if (canUseZeroSizeTextarea) {
			ta.setWidth(0);
			ta.setHeight(0);
			tac.setWidth(0);
			tac.setHeight(0);
			return;
		}

		// (in WebKit the textarea is 1px by 1px because it cannot handle input to a 0x0 textarea)
		// specifically, when doing Korean IME, setting the textarea to 0x0 breaks IME badly.

		ta.setWidth(1);
		ta.setHeight(1);
		tac.setWidth(1);
		tac.setHeight(1);

		if (this._context.configuration.editor.viewInfo.glyphMargin) {
			tac.setClassName('monaco-editor-background textAreaCover ' + Margin.OUTER_CLASS_NAME);
		} else {
			if (this._context.configuration.editor.viewInfo.renderLineNumbers !== RenderLineNumbersType.Off) {
				tac.setClassName('monaco-editor-background textAreaCover ' + LineNumbersOverlay.CLASS_NAME);
			} else {
				tac.setClassName('monaco-editor-background textAreaCover');
			}
		}
	}
}

function measureText(text: string, fontInfo: BareFontInfo): number {
	// adjust width by its size
	const canvasElem = <HTMLCanvasElement>document.createElement('canvas');
	const context = canvasElem.getContext('2d')!;
	context.font = createFontString(fontInfo);
	const metrics = context.measureText(text);

	if (browser.isFirefox) {
		return metrics.width + 2; // +2 for Japanese...
	} else {
		return metrics.width;
	}
}

function createFontString(bareFontInfo: BareFontInfo): string {
	return doCreateFontString('normal', bareFontInfo.fontWeight, bareFontInfo.fontSize, bareFontInfo.lineHeight, bareFontInfo.fontFamily);
}

function doCreateFontString(fontStyle: string, fontWeight: string, fontSize: number, lineHeight: number, fontFamily: string): string {
	// The full font syntax is:
	// style | variant | weight | stretch | size/line-height | fontFamily
	// (https://developer.mozilla.org/en-US/docs/Web/CSS/font)
	// But it appears Edge and IE11 cannot properly parse `stretch`.
	return `${fontStyle} normal ${fontWeight} ${fontSize}px / ${lineHeight}px ${fontFamily}`;
}
