/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./textAreaHandler';
import * as browser from 'vs/base/browser/browser';
import { TextAreaInput, ITextAreaInputHost, IPasteData, ICompositionData } from 'vs/editor/browser/controller/textAreaInput';
import { ISimpleModel, ITypeData, TextAreaState, IENarratorStrategy, NVDAPagedStrategy } from 'vs/editor/browser/controller/textAreaState';
import { Range } from 'vs/editor/common/core/range';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { HorizontalRange } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { VerticalRevealType } from 'vs/editor/common/controller/cursorEvents';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EndOfLinePreference } from "vs/editor/common/editorCommon";
import { IKeyboardEvent } from "vs/base/browser/keyboardEvent";
import { PartFingerprints, PartFingerprint } from "vs/editor/browser/view/viewPart";
import { Margin } from "vs/editor/browser/viewParts/margin/margin";
import { LineNumbersOverlay } from "vs/editor/browser/viewParts/lineNumbers/lineNumbers";
import { BareFontInfo } from "vs/editor/common/config/fontInfo";

export interface ITextAreaHandlerHelper {
	visibleRangeForPositionRelativeToEditor(lineNumber: number, column: number): HorizontalRange;
	getVerticalOffsetForLineNumber(lineNumber: number): number;
}

class TextAreaVisiblePosition {
	_textAreaVisiblePosition: void;

	public readonly top: number;
	public readonly left: number;

	constructor(top: number, left: number) {
		this.top = top;
		this.left = left;
	}
}

export class TextAreaHandler extends ViewEventHandler {

	private readonly _context: ViewContext;
	private readonly _viewController: ViewController;
	private readonly _viewHelper: ITextAreaHandlerHelper;

	private _contentLeft: number;
	private _contentWidth: number;
	private _scrollLeft: number;
	private _scrollTop: number;

	private _visiblePosition: TextAreaVisiblePosition;
	private _selections: Range[];
	private _lastCopiedValue: string;
	private _lastCopiedValueIsFromEmptySelection: boolean;

	public readonly textArea: FastDomNode<HTMLTextAreaElement>;
	public readonly textAreaCover: FastDomNode<HTMLElement>;
	private readonly _textAreaInput: TextAreaInput;

	constructor(context: ViewContext, viewController: ViewController, viewHelper: ITextAreaHandlerHelper) {
		super();

		this._context = context;
		this._viewController = viewController;
		this._viewHelper = viewHelper;

		this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		this._scrollLeft = 0;
		this._scrollTop = 0;

		this._visiblePosition = null;
		this._selections = [new Range(1, 1, 1, 1)];
		this._lastCopiedValue = null;
		this._lastCopiedValueIsFromEmptySelection = false;

		// Text Area (The focus will always be in the textarea when the cursor is blinking)
		this.textArea = createFastDomNode(document.createElement('textarea'));
		PartFingerprints.write(this.textArea, PartFingerprint.TextArea);
		this.textArea.setClassName('inputarea');
		this.textArea.setAttribute('wrap', 'off');
		this.textArea.setAttribute('autocorrect', 'off');
		this.textArea.setAttribute('autocapitalize', 'off');
		this.textArea.setAttribute('spellcheck', 'false');
		this.textArea.setAttribute('aria-label', this._context.configuration.editor.viewInfo.ariaLabel);
		this.textArea.setAttribute('role', 'textbox');
		this.textArea.setAttribute('aria-multiline', 'true');
		this.textArea.setAttribute('aria-haspopup', 'false');
		this.textArea.setAttribute('aria-autocomplete', 'both');

		this.textArea.setTop(0);
		this.textArea.setLeft(0);
		Configuration.applyFontInfo(this.textArea, this._context.configuration.editor.fontInfo);

		// On top of the text area, we position a dom node to cover it up
		// (there have been reports of tiny blinking cursors)
		// (in WebKit the textarea is 1px by 1px because it cannot handle input to a 0x0 textarea)
		this.textAreaCover = createFastDomNode(document.createElement('div'));
		if (this._context.configuration.editor.viewInfo.glyphMargin) {
			this.textAreaCover.setClassName('monaco-editor-background ' + Margin.CLASS_NAME + ' ' + 'textAreaCover');
		} else {
			if (this._context.configuration.editor.viewInfo.renderLineNumbers) {
				this.textAreaCover.setClassName('monaco-editor-background ' + LineNumbersOverlay.CLASS_NAME + ' ' + 'textAreaCover');
			} else {
				this.textAreaCover.setClassName('monaco-editor-background ' + 'textAreaCover');
			}
		}
		this.textAreaCover.setPosition('absolute');
		this.textAreaCover.setWidth(1);
		this.textAreaCover.setHeight(1);
		this.textAreaCover.setTop(0);
		this.textAreaCover.setLeft(0);

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
				const whatToCopy = this._context.model.getPlainTextToCopy(this._selections, browser.enableEmptySelectionClipboard);

				if (browser.enableEmptySelectionClipboard) {
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
				return this._context.model.getHTMLToCopy(this._selections, browser.enableEmptySelectionClipboard);
			},

			getScreenReaderContent: (currentState: TextAreaState): TextAreaState => {

				if (browser.isIPad) {
					// Do not place anything in the textarea for the iPad
					return TextAreaState.EMPTY;
				}

				const selection = this._selections[0];

				if (this._context.configuration.editor.viewInfo.experimentalScreenReader) {
					return NVDAPagedStrategy.fromEditorSelection(currentState, simpleModel, selection);
				}

				return IENarratorStrategy.fromEditorSelection(currentState, simpleModel, selection);
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
			if (browser.enableEmptySelectionClipboard) {
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

		this._register(this._textAreaInput.onCompositionStart(() => {
			const lineNumber = this._selections[0].startLineNumber;
			const column = this._selections[0].startColumn;

			this._context.privateViewEventBus.emit(new viewEvents.ViewRevealRangeRequestEvent(
				new Range(lineNumber, column, lineNumber, column),
				VerticalRevealType.Simple,
				true
			));

			// Find range pixel position
			const visibleRange = this._viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column);

			if (visibleRange) {
				this._visiblePosition = new TextAreaVisiblePosition(
					this._viewHelper.getVerticalOffsetForLineNumber(lineNumber),
					visibleRange.left
				);
				this.textArea.setTop(this._visiblePosition.top - this._scrollTop);
				this.textArea.setLeft(this._contentLeft + this._visiblePosition.left - this._scrollLeft);
			}

			// Show the textarea
			this.textArea.setHeight(this._context.configuration.editor.lineHeight);
			this.textArea.setClassName('inputarea ime-input');

			this._viewController.compositionStart('keyboard');
		}));

		this._register(this._textAreaInput.onCompositionUpdate((e: ICompositionData) => {
			if (browser.isEdgeOrIE) {
				// Due to isEdgeOrIE (where the textarea was not cleared initially)
				// we cannot assume the text consists only of the composited text
				this.textArea.setWidth(0);
			} else {
				// adjust width by its size
				this.textArea.setWidth(measureText(e.data, this._context.configuration.editor.fontInfo));
			}
		}));

		this._register(this._textAreaInput.onCompositionEnd(() => {
			this.textArea.unsetHeight();
			this.textArea.unsetWidth();
			this.textArea.setLeft(0);
			this.textArea.setTop(0);
			this.textArea.setClassName('inputarea');

			this._visiblePosition = null;

			this._viewController.compositionEnd('keyboard');
		}));

		this._register(this._textAreaInput.onFocus(() => {
			this._context.privateViewEventBus.emit(new viewEvents.ViewFocusChangedEvent(true));
		}));

		this._register(this._textAreaInput.onBlur(() => {
			this._context.privateViewEventBus.emit(new viewEvents.ViewFocusChangedEvent(false));
		}));

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		super.dispose();
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		// Give textarea same font size & line height as editor, for the IME case (when the textarea is visible)
		if (e.fontInfo) {
			Configuration.applyFontInfo(this.textArea, this._context.configuration.editor.fontInfo);
		}
		if (e.viewInfo.experimentalScreenReader) {
			this._textAreaInput.writeScreenReaderContent('strategy changed');
		}
		if (e.layoutInfo) {
			this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
			this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		}
		if (e.viewInfo.ariaLabel) {
			this.textArea.setAttribute('aria-label', this._context.configuration.editor.viewInfo.ariaLabel);
		}
		return false;
	}

	public onCursorSelectionChanged(e: viewEvents.ViewCursorSelectionChangedEvent): boolean {
		this._selections = [e.selection].concat(e.secondarySelections);
		return false;
	}

	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._scrollLeft = e.scrollLeft;
		this._scrollTop = e.scrollTop;
		if (this._visiblePosition) {
			this.textArea.setTop(this._visiblePosition.top - this._scrollTop);
			this.textArea.setLeft(this._contentLeft + this._visiblePosition.left - this._scrollLeft);
		}
		return false;
	}

	// --- end event handlers

	// --- begin view API

	public isFocused(): boolean {
		return this._textAreaInput.isFocused();
	}

	public focusTextArea(): void {
		this._textAreaInput.focusTextArea();
	}

	public writeToTextArea(): void {
		this._textAreaInput.writeScreenReaderContent('selection changed');
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
