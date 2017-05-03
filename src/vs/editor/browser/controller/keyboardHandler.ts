/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { GlobalScreenReaderNVDA } from 'vs/editor/common/config/commonEditorConfig';
import { TextAreaHandler, ITextAreaHandlerHost, TextAreaStrategy } from 'vs/editor/browser/controller/textAreaHandler';
import { ISimpleModel } from 'vs/editor/browser/controller/textAreaState';
import { Range } from 'vs/editor/common/core/range';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { HorizontalRange } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { VerticalRevealType } from 'vs/editor/common/controller/cursorEvents';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EndOfLinePreference } from "vs/editor/common/editorCommon";

export interface IKeyboardHandlerHelper {
	viewDomNode: FastDomNode<HTMLElement>;
	textArea: FastDomNode<HTMLTextAreaElement>;
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
export class KeyboardHandler extends ViewEventHandler {

	private _context: ViewContext;
	private viewController: ViewController;
	private textArea: FastDomNode<HTMLTextAreaElement>;
	private viewHelper: IKeyboardHandlerHelper;
	private visiblePosition: TextAreaVisiblePosition;

	private contentLeft: number;
	private contentWidth: number;
	private scrollLeft: number;
	private scrollTop: number;

	private _selections: Range[];
	private _lastCopiedValue: string;
	private _lastCopiedValueIsFromEmptySelection: boolean;

	private textAreaHandler: TextAreaHandler;

	constructor(context: ViewContext, viewController: ViewController, viewHelper: IKeyboardHandlerHelper) {
		super();

		this._context = context;
		this.viewController = viewController;
		this.textArea = viewHelper.textArea;
		Configuration.applyFontInfo(this.textArea, this._context.configuration.editor.fontInfo);
		this.viewHelper = viewHelper;
		this.visiblePosition = null;

		this.contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		this.contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		this.scrollLeft = 0;
		this.scrollTop = 0;

		this._selections = [new Range(1, 1, 1, 1)];
		this._lastCopiedValue = null;
		this._lastCopiedValueIsFromEmptySelection = false;

		const textAreaHandlerHost: ITextAreaHandlerHost = {
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
			}
		};
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
		this.textAreaHandler = new TextAreaHandler(textAreaHandlerHost, this._getStrategy(), this.textArea, simpleModel);

		this._register(this.textAreaHandler.onKeyDown((e) => this.viewController.emitKeyDown(e)));
		this._register(this.textAreaHandler.onKeyUp((e) => this.viewController.emitKeyUp(e)));
		this._register(this.textAreaHandler.onPaste((e) => {
			let pasteOnNewLine = false;
			if (browser.enableEmptySelectionClipboard) {
				pasteOnNewLine = (e.text === this._lastCopiedValue && this._lastCopiedValueIsFromEmptySelection);
			}
			this.viewController.paste('keyboard', e.text, pasteOnNewLine);
		}));
		this._register(this.textAreaHandler.onCut((e) => this.viewController.cut('keyboard')));
		this._register(this.textAreaHandler.onType((e) => {
			if (e.replaceCharCnt) {
				this.viewController.replacePreviousChar('keyboard', e.text, e.replaceCharCnt);
			} else {
				this.viewController.type('keyboard', e.text);
			}
		}));
		this._register(this.textAreaHandler.onCompositionStart(() => {
			const lineNumber = this._selections[0].startLineNumber;
			const column = this._selections[0].startColumn;

			this._context.privateViewEventBus.emit(new viewEvents.ViewRevealRangeRequestEvent(
				new Range(lineNumber, column, lineNumber, column),
				VerticalRevealType.Simple,
				true
			));

			// Find range pixel position
			const visibleRange = this.viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column);

			if (visibleRange) {
				this.visiblePosition = new TextAreaVisiblePosition(
					this.viewHelper.getVerticalOffsetForLineNumber(lineNumber),
					visibleRange.left
				);
				this.textArea.setTop(this.visiblePosition.top - this.scrollTop);
				this.textArea.setLeft(this.contentLeft + this.visiblePosition.left - this.scrollLeft);
			}

			// Show the textarea
			this.textArea.setHeight(this._context.configuration.editor.lineHeight);
			this.viewHelper.viewDomNode.addClassName('ime-input');

			this.viewController.compositionStart('keyboard');
		}));

		this._register(this.textAreaHandler.onCompositionUpdate((e) => {
			if (browser.isEdgeOrIE) {
				// Due to isEdgeOrIE (where the textarea was not cleared initially)
				// we cannot assume the text consists only of the composited text
				this.textArea.setWidth(0);
			} else {
				// adjust width by its size
				let canvasElem = <HTMLCanvasElement>document.createElement('canvas');
				let context = canvasElem.getContext('2d');
				let cs = dom.getComputedStyle(this.textArea.domNode);
				if (browser.isFirefox) {
					// computedStyle.font is empty in Firefox...
					context.font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontStretch} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
					let metrics = context.measureText(e.data);
					this.textArea.setWidth(metrics.width + 2); // +2 for Japanese...
				} else {
					context.font = cs.font;
					let metrics = context.measureText(e.data);
					this.textArea.setWidth(metrics.width);
				}
			}
		}));

		this._register(this.textAreaHandler.onCompositionEnd(() => {
			this.textArea.unsetHeight();
			this.textArea.unsetWidth();
			this.textArea.setLeft(0);
			this.textArea.setTop(0);
			this.viewHelper.viewDomNode.removeClassName('ime-input');

			this.visiblePosition = null;

			this.viewController.compositionEnd('keyboard');
		}));
		this._register(GlobalScreenReaderNVDA.onChange((value) => {
			this.textAreaHandler.setStrategy(this._getStrategy());
		}));


		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this.textAreaHandler.dispose();
		super.dispose();
	}

	private _getStrategy(): TextAreaStrategy {
		if (GlobalScreenReaderNVDA.getValue()) {
			return TextAreaStrategy.NVDA;
		}
		if (this._context.configuration.editor.viewInfo.experimentalScreenReader) {
			return TextAreaStrategy.NVDA;
		}
		return TextAreaStrategy.IENarrator;
	}

	public focusTextArea(): void {
		this.textAreaHandler.focusTextArea();
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		// Give textarea same font size & line height as editor, for the IME case (when the textarea is visible)
		if (e.fontInfo) {
			Configuration.applyFontInfo(this.textArea, this._context.configuration.editor.fontInfo);
		}
		if (e.viewInfo.experimentalScreenReader) {
			this.textAreaHandler.setStrategy(this._getStrategy());
		}
		if (e.layoutInfo) {
			this.contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
			this.contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		}
		return false;
	}

	private _lastCursorSelectionChanged: viewEvents.ViewCursorSelectionChangedEvent = null;
	public onCursorSelectionChanged(e: viewEvents.ViewCursorSelectionChangedEvent): boolean {
		this._selections = [e.selection].concat(e.secondarySelections);
		this._lastCursorSelectionChanged = e;
		return false;
	}

	public onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		this.textAreaHandler.setHasFocus(e.isFocused);
		return false;
	}

	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this.scrollLeft = e.scrollLeft;
		this.scrollTop = e.scrollTop;
		if (this.visiblePosition) {
			this.textArea.setTop(this.visiblePosition.top - this.scrollTop);
			this.textArea.setLeft(this.contentLeft + this.visiblePosition.left - this.scrollLeft);
		}
		return false;
	}

	// --- end event handlers

	public writeToTextArea(): void {
		if (this._lastCursorSelectionChanged) {
			let e = this._lastCursorSelectionChanged;
			this._lastCursorSelectionChanged = null;
			this.textAreaHandler.setCursorSelections(e.selection, e.secondarySelections);
		}
	}

}