/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { GlobalScreenReaderNVDA } from 'vs/editor/common/config/commonEditorConfig';
import { TextAreaHandler } from 'vs/editor/common/controller/textAreaHandler';
import { TextAreaStrategy } from 'vs/editor/common/controller/textAreaState';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { IViewController } from 'vs/editor/browser/editorBrowser';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { HorizontalRange } from 'vs/editor/common/view/renderingContext';
import { TextAreaWrapper } from 'vs/editor/browser/controller/input/textAreaWrapper';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { FastDomNode } from 'vs/base/browser/fastDomNode';

export interface IKeyboardHandlerHelper {
	viewDomNode: FastDomNode<HTMLElement>;
	textArea: FastDomNode<HTMLTextAreaElement>;
	visibleRangeForPositionRelativeToEditor(lineNumber: number, column: number): HorizontalRange;
	getVerticalOffsetForLineNumber(lineNumber: number): number;
	flushAnyAccumulatedEvents(): void;
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
export class KeyboardHandler extends ViewEventHandler implements IDisposable {

	private _context: ViewContext;
	private viewController: IViewController;
	private viewHelper: IKeyboardHandlerHelper;
	private textArea: TextAreaWrapper;
	private textAreaHandler: TextAreaHandler;
	private _toDispose: IDisposable[];

	private contentLeft: number;
	private contentWidth: number;
	private scrollLeft: number;
	private scrollTop: number;

	private visiblePosition: TextAreaVisiblePosition;

	constructor(context: ViewContext, viewController: IViewController, viewHelper: IKeyboardHandlerHelper) {
		super();

		this._context = context;
		this.viewController = viewController;
		this.textArea = new TextAreaWrapper(viewHelper.textArea);
		Configuration.applyFontInfo(this.textArea.actual, this._context.configuration.editor.fontInfo);
		this.viewHelper = viewHelper;
		this.visiblePosition = null;

		this.contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		this.contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		this.scrollLeft = 0;
		this.scrollTop = 0;

		this.textAreaHandler = new TextAreaHandler(browser, this._getStrategy(), this.textArea, this._context.model, () => this.viewHelper.flushAnyAccumulatedEvents());

		this._toDispose = [];
		this._toDispose.push(this.textAreaHandler.onKeyDown((e) => this.viewController.emitKeyDown(<IKeyboardEvent>e._actual)));
		this._toDispose.push(this.textAreaHandler.onKeyUp((e) => this.viewController.emitKeyUp(<IKeyboardEvent>e._actual)));
		this._toDispose.push(this.textAreaHandler.onPaste((e) => this.viewController.paste('keyboard', e.text, e.pasteOnNewLine)));
		this._toDispose.push(this.textAreaHandler.onCut((e) => this.viewController.cut('keyboard')));
		this._toDispose.push(this.textAreaHandler.onType((e) => {
			if (e.replaceCharCnt) {
				this.viewController.replacePreviousChar('keyboard', e.text, e.replaceCharCnt);
			} else {
				this.viewController.type('keyboard', e.text);
			}
		}));
		this._toDispose.push(this.textAreaHandler.onCompositionStart((e) => {
			const lineNumber = e.showAtLineNumber;
			const column = e.showAtColumn;

			this._context.privateViewEventBus.emit(new viewEvents.ViewRevealRangeRequestEvent(
				new Range(lineNumber, column, lineNumber, column),
				editorCommon.VerticalRevealType.Simple,
				true,
				false
			));

			// Find range pixel position
			const visibleRange = this.viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column);

			if (visibleRange) {
				this.visiblePosition = new TextAreaVisiblePosition(
					this.viewHelper.getVerticalOffsetForLineNumber(lineNumber),
					visibleRange.left
				);
				this.textArea.actual.setTop(this.visiblePosition.top - this.scrollTop);
				this.textArea.actual.setLeft(this.contentLeft + this.visiblePosition.left - this.scrollLeft);
			}

			// Show the textarea
			this.textArea.actual.setHeight(this._context.configuration.editor.lineHeight);
			this.viewHelper.viewDomNode.addClassName('ime-input');

			this.viewController.compositionStart('keyboard');
		}));

		this._toDispose.push(this.textAreaHandler.onCompositionUpdate((e) => {
			if (browser.isEdgeOrIE) {
				// Due to isEdgeOrIE (where the textarea was not cleared initially)
				// we cannot assume the text consists only of the composited text
				this.textArea.actual.setWidth(0);
			} else {
				// adjust width by its size
				let canvasElem = <HTMLCanvasElement>document.createElement('canvas');
				let context = canvasElem.getContext('2d');
				let cs = dom.getComputedStyle(this.textArea.actual.domNode);
				if (browser.isFirefox) {
					// computedStyle.font is empty in Firefox...
					context.font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontStretch} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
					let metrics = context.measureText(e.data);
					this.textArea.actual.setWidth(metrics.width + 2); // +2 for Japanese...
				} else {
					context.font = cs.font;
					let metrics = context.measureText(e.data);
					this.textArea.actual.setWidth(metrics.width);
				}
			}
		}));

		this._toDispose.push(this.textAreaHandler.onCompositionEnd((e) => {
			this.textArea.actual.unsetHeight();
			this.textArea.actual.unsetWidth();
			this.textArea.actual.setLeft(0);
			this.textArea.actual.setTop(0);
			this.viewHelper.viewDomNode.removeClassName('ime-input');

			this.visiblePosition = null;

			this.viewController.compositionEnd('keyboard');
		}));
		this._toDispose.push(GlobalScreenReaderNVDA.onChange((value) => {
			this.textAreaHandler.setStrategy(this._getStrategy());
		}));


		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this.textAreaHandler.dispose();
		this.textArea.dispose();
		this._toDispose = dispose(this._toDispose);
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
			Configuration.applyFontInfo(this.textArea.actual, this._context.configuration.editor.fontInfo);
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
			this.textArea.actual.setTop(this.visiblePosition.top - this.scrollTop);
			this.textArea.actual.setLeft(this.contentLeft + this.visiblePosition.left - this.scrollLeft);
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