/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {Disposable, IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {GlobalScreenReaderNVDA} from 'vs/editor/common/config/commonEditorConfig';
import {TextAreaHandler} from 'vs/editor/common/controller/textAreaHandler';
import {IClipboardEvent, IKeyboardEventWrapper, ITextAreaWrapper, TextAreaStrategy} from 'vs/editor/common/controller/textAreaState';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {IKeyboardHandlerHelper, IViewContext, IViewController} from 'vs/editor/browser/editorBrowser';

class ClipboardEventWrapper implements IClipboardEvent {

	private _event:ClipboardEvent;

	constructor(event:ClipboardEvent) {
		this._event = event;
	}

	public canUseTextData(): boolean {
		if (this._event.clipboardData) {
			return true;
		}
		if ((<any>window).clipboardData) {
			return true;
		}
		return false;
	}

	public setTextData(text:string): void {
		if (this._event.clipboardData) {
			this._event.clipboardData.setData('text/plain', text);
			this._event.preventDefault();
			return;
		}

		if ((<any>window).clipboardData) {
			(<any>window).clipboardData.setData('Text', text);
			this._event.preventDefault();
			return;
		}

		throw new Error('ClipboardEventWrapper.setTextData: Cannot use text data!');
	}

	public getTextData(): string {
		if (this._event.clipboardData) {
			this._event.preventDefault();
			return this._event.clipboardData.getData('text/plain');
		}

		if ((<any>window).clipboardData) {
			this._event.preventDefault();
			return (<any>window).clipboardData.getData('Text');
		}

		throw new Error('ClipboardEventWrapper.getTextData: Cannot use text data!');
	}
}

class KeyboardEventWrapper implements IKeyboardEventWrapper {

	public _actual: IKeyboardEvent;

	constructor(actual:IKeyboardEvent) {
		this._actual = actual;
	}

	public equals(keybinding:number): boolean {
		return this._actual.equals(keybinding);
	}

	public preventDefault(): void {
		this._actual.preventDefault();
	}

	public isDefaultPrevented(): boolean {
		if (this._actual.browserEvent) {
			return this._actual.browserEvent.defaultPrevented;
		}
		return false;
	}
}

class TextAreaWrapper extends Disposable implements ITextAreaWrapper {

	private _textArea: HTMLTextAreaElement;

	private _onKeyDown = this._register(new Emitter<IKeyboardEventWrapper>());
	public onKeyDown: Event<IKeyboardEventWrapper> = this._onKeyDown.event;

	private _onKeyUp = this._register(new Emitter<IKeyboardEventWrapper>());
	public onKeyUp: Event<IKeyboardEventWrapper> = this._onKeyUp.event;

	private _onKeyPress = this._register(new Emitter<IKeyboardEventWrapper>());
	public onKeyPress: Event<IKeyboardEventWrapper> = this._onKeyPress.event;

	private _onCompositionStart = this._register(new Emitter<void>());
	public onCompositionStart: Event<void> = this._onCompositionStart.event;

	private _onCompositionEnd = this._register(new Emitter<void>());
	public onCompositionEnd: Event<void> = this._onCompositionEnd.event;

	private _onInput = this._register(new Emitter<void>());
	public onInput: Event<void> = this._onInput.event;

	private _onCut = this._register(new Emitter<IClipboardEvent>());
	public onCut: Event<IClipboardEvent> = this._onCut.event;

	private _onCopy = this._register(new Emitter<IClipboardEvent>());
	public onCopy: Event<IClipboardEvent> = this._onCopy.event;

	private _onPaste = this._register(new Emitter<IClipboardEvent>());
	public onPaste: Event<IClipboardEvent> = this._onPaste.event;

	constructor(textArea: HTMLTextAreaElement) {
		super();
		this._textArea = textArea;

		this._register(dom.addStandardDisposableListener(this._textArea, 'keydown', (e) => this._onKeyDown.fire(new KeyboardEventWrapper(e))));
		this._register(dom.addStandardDisposableListener(this._textArea, 'keyup', (e) => this._onKeyUp.fire(new KeyboardEventWrapper(e))));
		this._register(dom.addStandardDisposableListener(this._textArea, 'keypress', (e) => this._onKeyPress.fire(new KeyboardEventWrapper(e))));
		this._register(dom.addDisposableListener(this._textArea, 'compositionstart', (e) => this._onCompositionStart.fire()));
		this._register(dom.addDisposableListener(this._textArea, 'compositionend', (e) => this._onCompositionEnd.fire()));
		this._register(dom.addDisposableListener(this._textArea, 'input', (e) => this._onInput.fire()));
		this._register(dom.addDisposableListener(this._textArea, 'cut', (e:ClipboardEvent) => this._onCut.fire(new ClipboardEventWrapper(e))));
		this._register(dom.addDisposableListener(this._textArea, 'copy', (e:ClipboardEvent) => this._onCopy.fire(new ClipboardEventWrapper(e))));
		this._register(dom.addDisposableListener(this._textArea, 'paste', (e:ClipboardEvent) => this._onPaste.fire(new ClipboardEventWrapper(e))));
	}

	public get actual(): HTMLTextAreaElement {
		return this._textArea;
	}

	public getValue(): string {
		// console.log('current value: ' + this._textArea.value);
		return this._textArea.value;
	}

	public setValue(reason:string, value:string): void {
		// console.log('reason: ' + reason + ', current value: ' + this._textArea.value + ' => new value: ' + value);
		this._textArea.value = value;
	}

	public getSelectionStart(): number {
		return this._textArea.selectionStart;
	}

	public getSelectionEnd(): number {
		return this._textArea.selectionEnd;
	}

	public setSelectionRange(selectionStart:number, selectionEnd:number): void {
		// console.log('setSelectionRange: ' + selectionStart + ', ' + selectionEnd);
		try {
			let scrollState = dom.saveParentsScrollTop(this._textArea);
			this._textArea.focus();
			this._textArea.setSelectionRange(selectionStart, selectionEnd);
			dom.restoreParentsScrollTop(this._textArea, scrollState);
		} catch(e) {
			// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
			console.log('an error has been thrown!');
		}
	}

	public isInOverwriteMode(): boolean {
		// In IE, pressing Insert will bring the typing into overwrite mode
		if (browser.isIE11orEarlier && document.queryCommandValue('OverWrite')) {
			return true;
		}
		return false;
	}
}


export class KeyboardHandler extends ViewEventHandler implements IDisposable {

	private context:IViewContext;
	private viewController:IViewController;
	private viewHelper:IKeyboardHandlerHelper;
	private textArea:TextAreaWrapper;
	private textAreaHandler:TextAreaHandler;
	private _toDispose:IDisposable[];

	private contentLeft:number;
	private contentWidth:number;
	private scrollLeft:number;

	constructor(context:IViewContext, viewController:IViewController, viewHelper:IKeyboardHandlerHelper) {
		super();

		this.context = context;
		this.viewController = viewController;
		this.textArea = new TextAreaWrapper(viewHelper.textArea);
		this.viewHelper = viewHelper;

		this.contentLeft = 0;
		this.contentWidth = 0;
		this.scrollLeft = 0;

		this.textAreaHandler = new TextAreaHandler(browser, this._getStrategy(), this.textArea, this.context.model, () => this.viewHelper.flushAnyAccumulatedEvents());

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

			let revealPositionEvent:editorCommon.IViewRevealRangeEvent = {
				range: new Range(lineNumber, column, lineNumber, column),
				verticalType: editorCommon.VerticalRevealType.Simple,
				revealHorizontal: true
			};
			this.context.privateViewEventBus.emit(editorCommon.ViewEventNames.RevealRangeEvent, revealPositionEvent);

			// Find range pixel position
			let visibleRange = this.viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column);

			if (visibleRange) {
				StyleMutator.setTop(this.textArea.actual, visibleRange.top);
				StyleMutator.setLeft(this.textArea.actual, this.contentLeft + visibleRange.left - this.scrollLeft);
			}

			if (browser.isIE11orEarlier) {
				StyleMutator.setWidth(this.textArea.actual, this.contentWidth);
			}

			// Show the textarea
			StyleMutator.setHeight(this.textArea.actual, this.context.configuration.editor.lineHeight);
			dom.addClass(this.viewHelper.viewDomNode, 'ime-input');
		}));
		this._toDispose.push(this.textAreaHandler.onCompositionEnd((e) => {
			this.textArea.actual.style.height = '';
			this.textArea.actual.style.width = '';
			StyleMutator.setLeft(this.textArea.actual, 0);
			StyleMutator.setTop(this.textArea.actual, 0);
			dom.removeClass(this.viewHelper.viewDomNode, 'ime-input');
		}));
		this._toDispose.push(GlobalScreenReaderNVDA.onChange((value) => {
			this.textAreaHandler.setStrategy(this._getStrategy());
		}));


		this.context.addEventHandler(this);
	}

	public dispose(): void {
		this.context.removeEventHandler(this);
		this.textAreaHandler.dispose();
		this.textArea.dispose();
		this._toDispose = disposeAll(this._toDispose);
	}

	private _getStrategy(): TextAreaStrategy {
		if (GlobalScreenReaderNVDA.getValue()) {
			return TextAreaStrategy.NVDA;
		}
		if (this.context.configuration.editor.experimentalScreenReader) {
			return TextAreaStrategy.NVDA;
		}
		return TextAreaStrategy.IENarrator;
	}

	public focusTextArea(): void {
		this.textAreaHandler.writePlaceholderAndSelectTextAreaSync();
	}

	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		// Give textarea same font size & line height as editor, for the IME case (when the textarea is visible)
		StyleMutator.setFontSize(this.textArea.actual, this.context.configuration.editor.fontSize);
		StyleMutator.setLineHeight(this.textArea.actual, this.context.configuration.editor.lineHeight);
		if (e.experimentalScreenReader) {
			this.textAreaHandler.setStrategy(this._getStrategy());
		}
		return false;
	}

	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		this.scrollLeft = e.scrollLeft;
		return false;
	}

	public onViewFocusChanged(isFocused:boolean): boolean {
		this.textAreaHandler.setHasFocus(isFocused);
		return false;
	}

	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): boolean {
		this.textAreaHandler.setCursorSelections(e.selection, e.secondarySelections);
		return false;
	}

	public onCursorPositionChanged(e:editorCommon.IViewCursorPositionChangedEvent): boolean {
		this.textAreaHandler.setCursorPosition(e.position);
		return false;
	}

	public onLayoutChanged(layoutInfo:editorCommon.IEditorLayoutInfo): boolean {
		this.contentLeft = layoutInfo.contentLeft;
		this.contentWidth = layoutInfo.contentWidth;
		return false;
	}

}