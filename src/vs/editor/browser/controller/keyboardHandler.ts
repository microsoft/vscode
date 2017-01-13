/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { StyleMutator } from 'vs/base/browser/styleMutator';
import { GlobalScreenReaderNVDA } from 'vs/editor/common/config/commonEditorConfig';
import { TextAreaHandler } from 'vs/editor/common/controller/textAreaHandler';
import { TextAreaStrategy } from 'vs/editor/common/controller/textAreaState';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { IViewController } from 'vs/editor/browser/editorBrowser';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { VisibleRange } from 'vs/editor/common/view/renderingContext';
import { TextAreaWrapper } from 'vs/editor/browser/controller/input/textAreaWrapper';

export interface IKeyboardHandlerHelper {
	viewDomNode: HTMLElement;
	textArea: HTMLTextAreaElement;
	visibleRangeForPositionRelativeToEditor(lineNumber: number, column: number): VisibleRange;
	flushAnyAccumulatedEvents(): void;
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

	private visibleRange: VisibleRange;

	constructor(context: ViewContext, viewController: IViewController, viewHelper: IKeyboardHandlerHelper) {
		super();

		this._context = context;
		this.viewController = viewController;
		this.textArea = new TextAreaWrapper(viewHelper.textArea);
		Configuration.applyFontInfoSlow(this.textArea.actual, this._context.configuration.editor.fontInfo);
		this.viewHelper = viewHelper;

		this.contentLeft = 0;
		this.contentWidth = 0;
		this.scrollLeft = 0;

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
			let lineNumber = e.showAtLineNumber;
			let column = e.showAtColumn;

			let revealPositionEvent: editorCommon.IViewRevealRangeEvent = {
				range: new Range(lineNumber, column, lineNumber, column),
				verticalType: editorCommon.VerticalRevealType.Simple,
				revealHorizontal: true,
				revealCursor: false
			};
			this._context.privateViewEventBus.emit(editorCommon.ViewEventNames.RevealRangeEvent, revealPositionEvent);

			// Find range pixel position
			this.visibleRange = this.viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column);

			if (this.visibleRange) {
				StyleMutator.setTop(this.textArea.actual, this.visibleRange.top);
				StyleMutator.setLeft(this.textArea.actual, this.contentLeft + this.visibleRange.left - this.scrollLeft);
			}

			// Show the textarea
			StyleMutator.setHeight(this.textArea.actual, this._context.configuration.editor.lineHeight);
			dom.addClass(this.viewHelper.viewDomNode, 'ime-input');

			this.viewController.compositionStart('keyboard');
		}));

		this._toDispose.push(this.textAreaHandler.onCompositionUpdate((e) => {
			if (browser.isEdgeOrIE) {
				// Due to isEdgeOrIE (where the textarea was not cleared initially)
				// we cannot assume the text consists only of the composited text
				StyleMutator.setWidth(this.textArea.actual, 0);
			} else {
				// adjust width by its size
				let canvasElem = <HTMLCanvasElement>document.createElement('canvas');
				let context = canvasElem.getContext('2d');
				let cs = dom.getComputedStyle(this.textArea.actual);
				if (browser.isFirefox) {
					// computedStyle.font is empty in Firefox...
					context.font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontStretch} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
					let metrics = context.measureText(e.data);
					StyleMutator.setWidth(this.textArea.actual, metrics.width + 2); // +2 for Japanese...
				} else {
					context.font = cs.font;
					let metrics = context.measureText(e.data);
					StyleMutator.setWidth(this.textArea.actual, metrics.width);
				}
			}
		}));

		this._toDispose.push(this.textAreaHandler.onCompositionEnd((e) => {
			this.textArea.actual.style.height = '';
			this.textArea.actual.style.width = '';
			StyleMutator.setLeft(this.textArea.actual, 0);
			StyleMutator.setTop(this.textArea.actual, 0);
			dom.removeClass(this.viewHelper.viewDomNode, 'ime-input');

			this.visibleRange = null;

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

	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		// Give textarea same font size & line height as editor, for the IME case (when the textarea is visible)
		if (e.fontInfo) {
			Configuration.applyFontInfoSlow(this.textArea.actual, this._context.configuration.editor.fontInfo);
		}
		if (e.viewInfo.experimentalScreenReader) {
			this.textAreaHandler.setStrategy(this._getStrategy());
		}
		return false;
	}

	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		this.scrollLeft = e.scrollLeft;
		if (this.visibleRange) {
			StyleMutator.setTop(this.textArea.actual, this.visibleRange.top);
			StyleMutator.setLeft(this.textArea.actual, this.contentLeft + this.visibleRange.left - this.scrollLeft);
		}
		return false;
	}

	public onViewFocusChanged(isFocused: boolean): boolean {
		this.textAreaHandler.setHasFocus(isFocused);
		return false;
	}

	private _lastCursorSelectionChanged: editorCommon.IViewCursorSelectionChangedEvent = null;
	public onCursorSelectionChanged(e: editorCommon.IViewCursorSelectionChangedEvent): boolean {
		this._lastCursorSelectionChanged = e;
		return false;
	}

	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		this.contentLeft = layoutInfo.contentLeft;
		this.contentWidth = layoutInfo.contentWidth;
		return false;
	}

	public writeToTextArea(): void {
		if (this._lastCursorSelectionChanged) {
			let e = this._lastCursorSelectionChanged;
			this._lastCursorSelectionChanged = null;
			this.textAreaHandler.setCursorSelections(e.selection, e.secondarySelections);
		}
	}

}