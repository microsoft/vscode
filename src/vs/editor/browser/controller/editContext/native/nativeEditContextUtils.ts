/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveElement, getShadowRoot } from '../../../../../base/browser/dom.js';
import { IDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

export interface ITypeData {
	text: string;
	replacePrevCharCnt: number;
	replaceNextCharCnt: number;
	positionDelta: number;
}

export class FocusTracker extends Disposable {
	private _isFocused: boolean = false;
	private _isPaused: boolean = false;

	constructor(
		@ILogService _logService: ILogService,
		private readonly _domNode: HTMLElement,
		private readonly _onFocusChange: (newFocusValue: boolean) => void,
	) {
		super();
		this._register(addDisposableListener(this._domNode, 'focus', () => {
			_logService.trace('NativeEditContext.focus');
			if (this._isPaused) {
				return;
			}
			// Here we don't trust the browser and instead we check
			// that the active element is the one we are tracking
			// (this happens when cmd+tab is used to switch apps)
			this.refreshFocusState();
		}));
		this._register(addDisposableListener(this._domNode, 'blur', () => {
			_logService.trace('NativeEditContext.blur');
			if (this._isPaused) {
				return;
			}
			this._handleFocusedChanged(false);
		}));
	}

	public pause(): void {
		this._isPaused = true;
	}

	public resume(): void {
		this._isPaused = false;
		this.refreshFocusState();
	}

	private _handleFocusedChanged(focused: boolean): void {
		if (this._isFocused === focused) {
			return;
		}
		this._isFocused = focused;
		this._onFocusChange(this._isFocused);
	}

	public focus(): void {
		this._domNode.focus();
		this.refreshFocusState();
	}

	public refreshFocusState(): void {
		const shadowRoot = getShadowRoot(this._domNode);
		const activeElement = shadowRoot ? shadowRoot.activeElement : getActiveElement();
		const focused = this._domNode === activeElement;
		this._handleFocusedChanged(focused);
	}

	get isFocused(): boolean {
		return this._isFocused;
	}
}

export function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => void, options?: boolean | AddEventListenerOptions): IDisposable {
	// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
			target.removeEventListener(type, listener as any);
		}
	};
}
