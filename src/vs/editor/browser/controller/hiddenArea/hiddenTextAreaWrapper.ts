/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { inputLatency } from 'vs/base/browser/performance';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICompleteHiddenAreaWrapper } from 'vs/editor/browser/controller/hiddenArea/hiddenAreaInput';
import { Range } from 'vs/editor/common/core/range';

export namespace TextAreaSyntethicEvents {
	export const Tap = '-monaco-textarea-synthetic-tap';
}

export class TextAreaWrapper extends Disposable implements ICompleteHiddenAreaWrapper {

	public readonly className: string = 'inputarea';

	private readonly _onKeyDown = this._register(new Emitter<KeyboardEvent>());
	public readonly onKeyDown = this._onKeyDown.event;

	private readonly _onKeyPress = this._register(new Emitter<KeyboardEvent>());
	public readonly onKeyPress = this._onKeyPress.event;

	private readonly _onKeyUp = this._register(new Emitter<KeyboardEvent>());
	public readonly onKeyUp = this._onKeyUp.event;

	private readonly _onCompositionStart = this._register(new Emitter<CompositionEvent>());
	public readonly onCompositionStart = this._onCompositionStart.event;

	private readonly _onCompositionEnd = this._register(new Emitter<CompositionEvent>());
	public readonly onCompositionEnd = this._onCompositionEnd.event;

	private readonly _onCompositionUpdate = this._register(new Emitter<CompositionEvent>());
	public readonly onCompositionUpdate = this._onCompositionUpdate.event;

	private readonly _onBeforeInput = this._register(new Emitter<InputEvent>());
	public readonly onBeforeInput = this._onBeforeInput.event;

	private readonly _onCut = this._register(new Emitter<ClipboardEvent>());
	public readonly onCut = this._onCut.event;

	private readonly _onCopy = this._register(new Emitter<ClipboardEvent>());
	public readonly onCopy = this._onCopy.event;

	private readonly _onPaste = this._register(new Emitter<ClipboardEvent>());
	public readonly onPaste = this._onPaste.event;

	private readonly _onFocus = this._register(new Emitter<FocusEvent>());
	public readonly onFocus = this._onFocus.event;

	private readonly _onBlur = this._register(new Emitter<FocusEvent>());
	public readonly onBlur = this._onBlur.event;

	private readonly _onInput = this._register(new Emitter<{
		timeStamp: number;
		type: string;
		data: string;
		inputType: string;
		isComposing: boolean;
	}>());
	public readonly onInput = this._onInput.event;

	public get ownerDocument(): Document {
		return this._actual.ownerDocument;
	}

	private _onSyntheticTap = this._register(new Emitter<void>());
	public readonly onSyntheticTap: Event<void> = this._onSyntheticTap.event;

	private _ignoreSelectionChangeTime: number;
	private _actual: HTMLTextAreaElement;

	constructor(
		public readonly actual: FastDomNode<HTMLTextAreaElement>
	) {
		super();
		this._actual = this.actual.domNode;
		this._ignoreSelectionChangeTime = 0;

		this._register(this.onKeyDown(() => inputLatency.onKeyDown()));
		this._register(this.onBeforeInput(() => inputLatency.onBeforeInput()));
		this._register(this.onInput(() => inputLatency.onInput()));
		this._register(this.onKeyUp(() => inputLatency.onKeyUp()));

		this._register(dom.addDisposableListener(this._actual, TextAreaSyntethicEvents.Tap, () => this._onSyntheticTap.fire()));

		// sending the correct event
		this._actual.addEventListener('input', (e) => {
			this._onInput.fire({
				timeStamp: e.timeStamp,
				type: e.type,
				data: this._actual.value,
				inputType: (e as InputEvent).inputType,
				isComposing: (e as InputEvent).isComposing
			});
		});

		this._register(dom.addDisposableListener(this._actual, 'keydown', (e) => {
			this._onKeyDown.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'keypress', (e) => {
			this._onKeyPress.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'keyup', (e) => {
			this._onKeyUp.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'compositionstart', (e) => {
			this._onCompositionStart.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'compositionend', (e) => {
			this._onCompositionEnd.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'compositionupdate', (e) => {
			this._onCompositionUpdate.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'beforeinput', (e) => {
			this._onBeforeInput.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'cut', (e) => {
			this._onCut.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'copy', (e) => {
			this._onCopy.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'paste', (e) => {
			this._onPaste.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'focus', (e) => {
			this._onFocus.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'blur', (e) => {
			this._onBlur.fire(e);
		}));
	}

	public hasFocus(): boolean {
		const shadowRoot = dom.getShadowRoot(this._actual);
		if (shadowRoot) {
			return shadowRoot.activeElement === this._actual;
		} else if (this._actual.isConnected) {
			return dom.getActiveElement() === this._actual;
		} else {
			return false;
		}
	}

	public setIgnoreSelectionChangeTime(reason: string): void {
		this._ignoreSelectionChangeTime = Date.now();
	}

	public getIgnoreSelectionChangeTime(): number {
		return this._ignoreSelectionChangeTime;
	}

	public resetSelectionChangeTime(): void {
		this._ignoreSelectionChangeTime = 0;
	}

	public getValue(): string {
		// console.log('current value: ' + this._textArea.value);
		return this._actual.value;
	}

	public setRenderingContext(): void { }

	public setParent(): void { }

	public setValue(reason: string, value: string, selection: Range | null): void {
		const textArea = this._actual;
		if (textArea.value === value) {
			// No change
			return;
		}
		// console.log('reason: ' + reason + ', current value: ' + textArea.value + ' => new value: ' + value);
		this.setIgnoreSelectionChangeTime('setValue');
		textArea.value = value;
	}

	public getSelectionStart(): number {
		return this._actual.selectionDirection === 'backward' ? this._actual.selectionEnd : this._actual.selectionStart;
	}

	public getSelectionEnd(): number {
		return this._actual.selectionDirection === 'backward' ? this._actual.selectionStart : this._actual.selectionEnd;
	}

	public setSelectionRange(reason: string, selectionStart: number, selectionEnd: number): void {
		const textArea = this._actual;

		let activeElement: Element | null = null;
		const shadowRoot = dom.getShadowRoot(textArea);
		if (shadowRoot) {
			activeElement = shadowRoot.activeElement;
		} else {
			activeElement = dom.getActiveElement();
		}
		const activeWindow = dom.getWindow(activeElement);

		const currentIsFocused = (activeElement === textArea);
		const currentSelectionStart = textArea.selectionStart;
		const currentSelectionEnd = textArea.selectionEnd;

		if (currentIsFocused && currentSelectionStart === selectionStart && currentSelectionEnd === selectionEnd) {
			// No change
			// Firefox iframe bug https://github.com/microsoft/monaco-editor/issues/643#issuecomment-367871377
			if (browser.isFirefox && activeWindow.parent !== activeWindow) {
				textArea.focus();
			}
			return;
		}

		// console.log('reason: ' + reason + ', setSelectionRange: ' + selectionStart + ' -> ' + selectionEnd);

		if (currentIsFocused) {
			// No need to focus, only need to change the selection range
			this.setIgnoreSelectionChangeTime('setSelectionRange');
			textArea.setSelectionRange(selectionStart, selectionEnd);
			if (browser.isFirefox && activeWindow.parent !== activeWindow) {
				textArea.focus();
			}
			return;
		}

		// If the focus is outside the textarea, browsers will try really hard to reveal the textarea.
		// Here, we try to undo the browser's desperate reveal.
		try {
			const scrollState = dom.saveParentsScrollTop(textArea);
			this.setIgnoreSelectionChangeTime('setSelectionRange');
			textArea.focus();
			textArea.setSelectionRange(selectionStart, selectionEnd);
			dom.restoreParentsScrollTop(textArea, scrollState);
		} catch (e) {
			// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
		}
	}
}
