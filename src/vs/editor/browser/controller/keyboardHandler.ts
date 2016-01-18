/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import keyboardController = require('vs/base/browser/keyboardController');
import DomUtils = require('vs/base/browser/dom');
import Platform = require('vs/base/common/platform');
import Browser = require('vs/base/browser/browser');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EventEmitter = require('vs/base/common/eventEmitter');
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import Schedulers = require('vs/base/common/async');
import * as Lifecycle from 'vs/base/common/lifecycle';
import Strings = require('vs/base/common/strings');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {CommonKeybindings} from 'vs/base/common/keyCodes';
import Event, {Emitter} from 'vs/base/common/event';
import {TextAreaHandler} from 'vs/editor/browser/controller/textAreaHandler';
import {ITextAreaWrapper, IClipboardEvent, IKeyboardEventWrapper, ITextAreaStyle, ISimpleModel} from 'vs/editor/browser/controller/textAreaState';

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

	public actual: DomUtils.IKeyboardEvent;

	constructor(actual:DomUtils.IKeyboardEvent) {
		this.actual = actual;
	}

}

class TextAreaWrapper extends Lifecycle.Disposable implements ITextAreaWrapper {

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

		let kbController = this._register(new keyboardController.KeyboardController(this._textArea));
		this._register(kbController.addListener2('keydown', (e) => this._onKeyDown.fire(new KeyboardEventWrapper(e))));
		this._register(kbController.addListener2('keyup', (e) => this._onKeyUp.fire(new KeyboardEventWrapper(e))));
		this._register(kbController.addListener2('keypress', (e) => this._onKeyPress.fire(new KeyboardEventWrapper(e))));

		this._register(DomUtils.addDisposableListener(this._textArea, 'compositionstart', (e) => this._onCompositionStart.fire()));
		this._register(DomUtils.addDisposableListener(this._textArea, 'compositionend', (e) => this._onCompositionEnd.fire()));
		this._register(DomUtils.addDisposableListener(this._textArea, 'input', (e) => this._onInput.fire()));
		this._register(DomUtils.addDisposableListener(this._textArea, 'cut', (e:ClipboardEvent) => this._onCut.fire(new ClipboardEventWrapper(e))));
		this._register(DomUtils.addDisposableListener(this._textArea, 'copy', (e:ClipboardEvent) => this._onCopy.fire(new ClipboardEventWrapper(e))));
		this._register(DomUtils.addDisposableListener(this._textArea, 'paste', (e:ClipboardEvent) => this._onPaste.fire(new ClipboardEventWrapper(e))));
	}

	public get value(): string {
		return this._textArea.value;
	}

	public set value(value:string) {
		this._textArea.value = value;
	}

	public get selectionStart(): number {
		return this._textArea.selectionStart;
	}

	public get selectionEnd(): number {
		return this._textArea.selectionEnd;
	}

	public setSelectionRange(selectionStart:number, selectionEnd:number): void {
		// console.log('setSelectionRange: ' + selectionStart + ', ' + selectionEnd);
		try {
			var scrollState = DomUtils.saveParentsScrollTop(this._textArea);
			this._textArea.focus();
			this._textArea.setSelectionRange(selectionStart, selectionEnd);
			DomUtils.restoreParentsScrollTop(this._textArea, scrollState);
		} catch(e) {
			// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
			console.log('an error has been thrown!');
		}
	}

	public setStyle(style:ITextAreaStyle): void {
		if (typeof style.top !== 'undefined') {
			this._textArea.style.top = style.top;
		}
		if (typeof style.left !== 'undefined') {
			this._textArea.style.left = style.left;
		}
		if (typeof style.width !== 'undefined') {
			this._textArea.style.width = style.width;
		}
		if (typeof style.height !== 'undefined') {
			this._textArea.style.height = style.height;
		}
	}

	public isInOverwriteMode(): boolean {
		// In IE, pressing Insert will bring the typing into overwrite mode
		if (Browser.isIE11orEarlier && document.queryCommandValue('OverWrite')) {
			return true;
		}
		return false;
	}
}


export class KeyboardHandler extends ViewEventHandler implements Lifecycle.IDisposable {

	private context:EditorBrowser.IViewContext;
	private viewController:EditorBrowser.IViewController;
	private viewHelper:EditorBrowser.IKeyboardHandlerHelper;
	private textArea:TextAreaWrapper;
	private textAreaHandler:TextAreaHandler;

	constructor(context:EditorBrowser.IViewContext, viewController:EditorBrowser.IViewController, viewHelper:EditorBrowser.IKeyboardHandlerHelper) {
		super();

		this.context = context;
		this.viewController = viewController;
		this.textArea = new TextAreaWrapper(viewHelper.textArea);
		this.viewHelper = viewHelper;

		this.textAreaHandler = new TextAreaHandler(this.textArea, {
			getModel: (): ISimpleModel => this.context.model,
			emitKeyDown: (e:DomUtils.IKeyboardEvent): void => this.viewController.emitKeyDown(e),
			emitKeyUp: (e:DomUtils.IKeyboardEvent): void => this.viewController.emitKeyUp(e),
			paste: (source:string, txt:string, pasteOnNewLine:boolean): void => this.viewController.paste(source, txt, pasteOnNewLine),
			type: (source:string, txt:string): void => this.viewController.type(source, txt),
			replacePreviousChar: (source:string, txt:string): void => this.viewController.replacePreviousChar(source, txt),
			cut: (source:string): void => this.viewController.cut(source),
			visibleRangeForPositionRelativeToEditor: (lineNumber:number, column1:number, column2:number): { column1: EditorBrowser.VisibleRange; column2: EditorBrowser.VisibleRange; } => {
				var revealInterestingColumn1Event:EditorCommon.IViewRevealRangeEvent = {
					range: new Range(lineNumber, column1, lineNumber, column1),
					verticalType: EditorCommon.VerticalRevealType.Simple,
					revealHorizontal: true
				};
				this.context.privateViewEventBus.emit(EditorCommon.ViewEventNames.RevealRangeEvent, revealInterestingColumn1Event);

				// Find range pixel position
				var visibleRange1 = this.viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column1);
				var visibleRange2 = this.viewHelper.visibleRangeForPositionRelativeToEditor(lineNumber, column2);

				return {
					column1: visibleRange1,
					column2: visibleRange2
				}
			},
			startIME: (): void => {
				DomUtils.addClass(this.viewHelper.viewDomNode, 'ime-input');
			},
			stopIME: (): void => {
				DomUtils.removeClass(this.viewHelper.viewDomNode, 'ime-input');
			}
		}, this.context.configuration);

		this.context.addEventHandler(this);
	}

	public dispose(): void {
		this.context.removeEventHandler(this);
		this.textAreaHandler.dispose();
		this.textArea.dispose();
	}

	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		this.textAreaHandler.onScrollChanged(e);
		return false;
	}

	public onViewFocusChanged(isFocused:boolean): boolean {
		this.textAreaHandler.onViewFocusChanged(isFocused);
		return false;
	}

	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		this.textAreaHandler.onCursorSelectionChanged(e);
		return false;
	}

	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		this.textAreaHandler.onCursorPositionChanged(e);
		return false;
	}

	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		this.textAreaHandler.onLayoutChanged(layoutInfo);
		return false;
	}

}