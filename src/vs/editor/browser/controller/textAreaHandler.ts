/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./textAreaHandler';
import * as platform from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import { TextAreaInput, ITextAreaInputHost, IPasteData, ICompositionData } from 'vs/editor/browser/controller/textAreaInput';
import { ISimpleModel, ITypeData, TextAreaState, PagedScreenReaderStrategy } from 'vs/editor/browser/controller/textAreaState';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Position } from 'vs/editor/common/core/position';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { HorizontalRange, RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EndOfLinePreference, ScrollType } from 'vs/editor/common/editorCommon';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { PartFingerprints, PartFingerprint, ViewPart } from 'vs/editor/browser/view/viewPart';
import { Margin } from 'vs/editor/browser/viewParts/margin/margin';
import { LineNumbersOverlay } from 'vs/editor/browser/viewParts/lineNumbers/lineNumbers';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';

export interface ITextAreaHandlerHelper {
	visibleRangeForPositionRelativeToEditor(lineNumber: number, column: number): HorizontalRange;
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

export class TextAreaHandler extends ViewPart {

	private readonly _viewController: ViewController;
	private readonly _viewHelper: ITextAreaHandlerHelper;

	private _pixelRatio: number;
	private _accessibilitySupport: platform.AccessibilitySupport;
	private _contentLeft: number;
	private _contentWidth: number;
	private _contentHeight: number;
	private _scrollLeft: number;
	private _scrollTop: number;
	private _fontInfo: BareFontInfo;
	private _lineHeight: number;
	private _emptySelectionClipboard: boolean;

	/**
	 * Defined only when the text area is visible (composition case).
	 */
	private _visibleTextArea: VisibleTextAreaData;
	private _selections: Selection[];
	private _lastCopiedValue: string;
	private _lastCopiedValueIsFromEmptySelection: boolean;

	public readonly textArea: FastDomNode<HTMLTextAreaElement>;
	public readonly textAreaCover: FastDomNode<HTMLElement>;
	private readonly _textAreaInput: TextAreaInput;

	constructor(context: ViewContext, viewController: ViewController, viewHelper: ITextAreaHandlerHelper) {
		super(context);

		this._viewController = viewController;
		this._viewHelper = viewHelper;

		const conf = this._context.configuration.editor;

		this._pixelRatio = conf.pixelRatio;
		this._accessibilitySupport = conf.accessibilitySupport;
		this._contentLeft = conf.layoutInfo.contentLeft;
		this._contentWidth = conf.layoutInfo.contentWidth;
		this._contentHeight = conf.layoutInfo.contentHeight;
		this._scrollLeft = 0;
		this._scrollTop = 0;
		this._fontInfo = conf.fontInfo;
		this._lineHeight = conf.lineHeight;
		this._emptySelectionClipboard = conf.emptySelectionClipboard;

		this._visibleTextArea = null;
		this._selections = [new Selection(1, 1, 1, 1)];
		this._lastCopiedValue = null;
		this._lastCopiedValueIsFromEmptySelection = false;

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
				const whatToCopy = this._context.model.getPlainTextToCopy(this._selections, this._emptySelectionClipboard);

				if (this._emptySelectionClipboard) {
					if (browser.isFirefox) {
						// When writing "LINE\r\n" to the clipboard and then pasting,
						// Firefox pastes "LINE\n", so let's work around this quirk
						this._lastCopiedValue = whatToCopy.replace(/\r\n/g, '\n');
					} else {
						this._lastCopiedValue = whatToCopy;
					}

					let selections = this._selections;
					this._lastCopiedValueIsFromEmptySelection = (selections.length === 1 && selections[0].isEmpty());
				}

				return whatToCopy;
			},

			getHTMLToCopy: (): string => {
				return this._context.model.getHTMLToCopy(this._selections, this._emptySelectionClipboard);
			},

			getScreenReaderContent: (currentState: TextAreaState): TextAreaState => {

				if (browser.isIPad) {
					// Do not place anything in the textarea for the iPad
					return TextAreaState.EMPTY;
				}

				if (this._accessibilitySupport === platform.AccessibilitySupport.Disabled) {
					// We know for a fact that a screen reader is not attached
					return TextAreaState.EMPTY;
				}

				return PagedScreenReaderStrategy.fromEditorSelection(currentState, simpleModel, this._selections[0]);
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
			let pasteOnNewLine = false;
			if (this._emptySelectionClipboard) {
				pasteOnNewLine = (e.text === this._lastCopiedValue && this._lastCopiedValueIsFromEmptySelection);
			}
			this._viewController.paste('keyboard', e.text, pasteOnNewLine);
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
				this._visibleTextArea = this._visibleTextArea.setWidth(0);
			} else {
				// adjust width by its size
				this._visibleTextArea = this._visibleTextArea.setWidth(measureText(e.data, this._fontInfo));
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
		if (e.pixelRatio) {
			this._pixelRatio = conf.pixelRatio;
		}
		if (e.accessibilitySupport) {
			this._accessibilitySupport = conf.accessibilitySupport;
			this._textAreaInput.writeScreenReaderContent('strategy changed');
		}
		if (e.emptySelectionClipboard) {
			this._emptySelectionClipboard = conf.emptySelectionClipboard;
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

	public setAriaActiveDescendant(id: string): void {
		if (id) {
			this.textArea.setAttribute('role', 'combobox');
			if (this.textArea.getAttribute('aria-activedescendant') !== id) {
				this.textArea.setAttribute('aria-haspopup', 'true');
				this.textArea.setAttribute('aria-activedescendant', id);
			}
		} else {
			this.textArea.setAttribute('role', 'textbox');
			this.textArea.removeAttribute('aria-activedescendant');
			this.textArea.removeAttribute('aria-haspopup');
		}
	}

	// --- end view API

	private _primaryCursorVisibleRange: HorizontalRange = null;

	public prepareRender(ctx: RenderingContext): void {
		if (this._accessibilitySupport === platform.AccessibilitySupport.Enabled) {
			// Do not move the textarea with the cursor, as this generates accessibility events that might confuse screen readers
			// See https://github.com/Microsoft/vscode/issues/26730
			this._primaryCursorVisibleRange = null;
		} else {
			const primaryCursorPosition = new Position(this._selections[0].positionLineNumber, this._selections[0].positionColumn);
			this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(primaryCursorPosition);
		}
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
		// specifically, when doing Korean IME, setting the textare to 0x0 breaks IME badly.

		ta.setWidth(1);
		ta.setHeight(1);
		tac.setWidth(1);
		tac.setHeight(1);

		if (this._context.configuration.editor.viewInfo.glyphMargin) {
			tac.setClassName('monaco-editor-background textAreaCover ' + Margin.CLASS_NAME);
		} else {
			if (this._context.configuration.editor.viewInfo.renderLineNumbers) {
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
	const context = canvasElem.getContext('2d');
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
