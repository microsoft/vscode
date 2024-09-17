/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveElement } from '../../../../../base/browser/dom.js';
import { IDisposable, Disposable } from '../../../../../base/common/lifecycle.js';

export interface ITypeData {
	text: string;
	replacePrevCharCnt: number;
	replaceNextCharCnt: number;
	positionDelta: number;
}

export class FocusTracker extends Disposable {
	private _isFocused: boolean = false;

	constructor(
		private readonly _domNode: HTMLElement,
		private readonly _onFocusChange: (newFocusValue: boolean) => void,
	) {
		super();
		this._register(addDisposableListener(this._domNode, 'focus', () => {
			console.log('on focus of FocusTracker');
			this._handleFocusedChanged(true);
		}));
		this._register(addDisposableListener(this._domNode, 'blur', () => {
			console.log('on blur of FocusTracker');
			this._handleFocusedChanged(false);
		}));
	}

	private _handleFocusedChanged(focused: boolean): void {
		console.log('_handleFocusedChanges, focused : ', focused);
		console.log('document.activeElement : ', getActiveElement());
		if (this._isFocused === focused) {
			return;
		}
		console.log('after early return');
		this._isFocused = focused;
		this._onFocusChange(this._isFocused);
	}

	public focus(): void {
		console.log('inside of focus');
		// fixes: https://github.com/microsoft/vscode/issues/228147
		// Immediately call this method in order to directly set the field isFocused to true so the textInputFocus context key is evaluated correctly
		this._handleFocusedChanged(true);
		this._domNode.focus();
	}

	public refreshFocusState(): void {
		console.log('refreshFocusState of FocusTracker');
		const isFocused = getActiveElement() === this._domNode;
		console.log('isFocused : ', isFocused);
		this._handleFocusedChanged(isFocused);
	}

	get isFocused(): boolean {
		return this._isFocused;
	}
}

export function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): IDisposable {
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			target.removeEventListener(type, listener as any);
		}
	};
}
