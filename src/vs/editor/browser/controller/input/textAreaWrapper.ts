/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IClipboardEvent, ICompositionEvent, IKeyboardEventWrapper, ITextAreaWrapper } from 'vs/editor/common/controller/textAreaState';
import { FastDomNode } from 'vs/base/browser/fastDomNode';

class ClipboardEventWrapper implements IClipboardEvent {

	private _event: ClipboardEvent;

	constructor(event: ClipboardEvent) {
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

	public setTextData(text: string, richText: string): void {
		if (this._event.clipboardData) {
			this._event.clipboardData.setData('text/plain', text);
			if (richText !== null) {
				this._event.clipboardData.setData('text/html', richText);
			}
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

	constructor(actual: IKeyboardEvent) {
		this._actual = actual;
	}

	public equals(keybinding: number): boolean {
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

export class TextAreaWrapper extends Disposable implements ITextAreaWrapper {

	private _textArea: FastDomNode<HTMLTextAreaElement>;

	private _onKeyDown = this._register(new Emitter<IKeyboardEventWrapper>());
	public onKeyDown: Event<IKeyboardEventWrapper> = this._onKeyDown.event;

	private _onKeyUp = this._register(new Emitter<IKeyboardEventWrapper>());
	public onKeyUp: Event<IKeyboardEventWrapper> = this._onKeyUp.event;

	private _onKeyPress = this._register(new Emitter<IKeyboardEventWrapper>());
	public onKeyPress: Event<IKeyboardEventWrapper> = this._onKeyPress.event;

	private _onCompositionStart = this._register(new Emitter<ICompositionEvent>());
	public onCompositionStart: Event<ICompositionEvent> = this._onCompositionStart.event;

	private _onCompositionUpdate = this._register(new Emitter<ICompositionEvent>());
	public onCompositionUpdate: Event<ICompositionEvent> = this._onCompositionUpdate.event;

	private _onCompositionEnd = this._register(new Emitter<ICompositionEvent>());
	public onCompositionEnd: Event<ICompositionEvent> = this._onCompositionEnd.event;

	private _onInput = this._register(new Emitter<void>());
	public onInput: Event<void> = this._onInput.event;

	private _onCut = this._register(new Emitter<IClipboardEvent>());
	public onCut: Event<IClipboardEvent> = this._onCut.event;

	private _onCopy = this._register(new Emitter<IClipboardEvent>());
	public onCopy: Event<IClipboardEvent> = this._onCopy.event;

	private _onPaste = this._register(new Emitter<IClipboardEvent>());
	public onPaste: Event<IClipboardEvent> = this._onPaste.event;

	constructor(_textArea: FastDomNode<HTMLTextAreaElement>) {
		super();
		this._textArea = _textArea;

		const textArea = this._textArea.domNode;
		this._register(dom.addStandardDisposableListener(textArea, 'keydown', (e) => this._onKeyDown.fire(new KeyboardEventWrapper(e))));
		this._register(dom.addStandardDisposableListener(textArea, 'keyup', (e) => this._onKeyUp.fire(new KeyboardEventWrapper(e))));
		this._register(dom.addStandardDisposableListener(textArea, 'keypress', (e) => this._onKeyPress.fire(new KeyboardEventWrapper(e))));
		this._register(dom.addDisposableListener(textArea, 'compositionstart', (e) => this._onCompositionStart.fire(e)));
		this._register(dom.addDisposableListener(textArea, 'compositionupdate', (e) => this._onCompositionUpdate.fire(e)));
		this._register(dom.addDisposableListener(textArea, 'compositionend', (e) => this._onCompositionEnd.fire(e)));
		this._register(dom.addDisposableListener(textArea, 'input', (e) => this._onInput.fire()));
		this._register(dom.addDisposableListener(textArea, 'cut', (e: ClipboardEvent) => this._onCut.fire(new ClipboardEventWrapper(e))));
		this._register(dom.addDisposableListener(textArea, 'copy', (e: ClipboardEvent) => this._onCopy.fire(new ClipboardEventWrapper(e))));
		this._register(dom.addDisposableListener(textArea, 'paste', (e: ClipboardEvent) => this._onPaste.fire(new ClipboardEventWrapper(e))));
	}

	public get actual(): FastDomNode<HTMLTextAreaElement> {
		return this._textArea;
	}

	public getValue(): string {
		// console.log('current value: ' + this._textArea.value);
		const textArea = this._textArea.domNode;
		return textArea.value;
	}

	public setValue(reason: string, value: string): void {
		// console.log('reason: ' + reason + ', current value: ' + this._textArea.value + ' => new value: ' + value);
		const textArea = this._textArea.domNode;
		textArea.value = value;
	}

	public getSelectionStart(): number {
		const textArea = this._textArea.domNode;
		return textArea.selectionStart;
	}

	public getSelectionEnd(): number {
		const textArea = this._textArea.domNode;
		return textArea.selectionEnd;
	}

	public setSelectionRange(selectionStart: number, selectionEnd: number): void {
		const textArea = this._textArea.domNode;
		const activeElement = document.activeElement;
		if (activeElement === textArea) {
			textArea.setSelectionRange(selectionStart, selectionEnd);
		} else {
			this._setSelectionRangeJumpy(selectionStart, selectionEnd);
		}
	}

	private _setSelectionRangeJumpy(selectionStart: number, selectionEnd: number): void {
		const textArea = this._textArea.domNode;
		try {
			let scrollState = dom.saveParentsScrollTop(textArea);
			textArea.focus();
			textArea.setSelectionRange(selectionStart, selectionEnd);
			dom.restoreParentsScrollTop(textArea, scrollState);
		} catch (e) {
			// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
			console.log('an error has been thrown!');
		}
	}

	public isInOverwriteMode(): boolean {
		// In IE, pressing Insert will bring the typing into overwrite mode
		if (browser.isIE && document.queryCommandValue('OverWrite')) {
			return true;
		}
		return false;
	}
}
