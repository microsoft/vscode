/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nativeKeymap from 'native-keymap';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from "vs/base/common/platform";
import { Emitter } from "vs/base/common/event";

export class KeyboardLayoutMonitor {

	public static readonly INSTANCE = new KeyboardLayoutMonitor();

	private _emitter: Emitter<boolean>;
	private _registered: boolean;
	private _isISOKeyboard: boolean;

	private constructor() {
		this._emitter = new Emitter<boolean>();
		this._registered = false;
		this._isISOKeyboard = this._readIsISOKeyboard();
	}

	public onDidChangeKeyboardLayout(callback: (isISOKeyboard: boolean) => void): IDisposable {
		if (!this._registered) {
			this._registered = true;

			nativeKeymap.onDidChangeKeyboardLayout(() => {
				this._emitter.fire(this._isISOKeyboard);
			});

			if (isMacintosh) {
				// See https://github.com/Microsoft/vscode/issues/24153
				// On OSX, on ISO keyboards, Chromium swaps the scan codes
				// of IntlBackslash and Backquote.
				//
				// The C++ methods can give the current keyboard type (ISO or not)
				// only after a NSEvent was handled.
				//
				// We therefore poll.
				setInterval(() => {
					let newValue = this._readIsISOKeyboard();
					if (this._isISOKeyboard === newValue) {
						// no change
						return;
					}

					this._isISOKeyboard = newValue;
					this._emitter.fire(this._isISOKeyboard);

				}, 3000);
			}
		}
		return this._emitter.event(callback);
	}

	private _readIsISOKeyboard(): boolean {
		if (isMacintosh) {
			return nativeKeymap.isISOKeyboard();
		}
		return false;
	}

	public isISOKeyboard(): boolean {
		return this._isISOKeyboard;
	}
}
