/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nativeKeymap from 'native-keymap';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';

export class KeyboardLayoutMonitor {

	public static readonly INSTANCE = new KeyboardLayoutMonitor();

	private readonly _emitter: Emitter<void>;
	private _registered: boolean;

	private constructor() {
		this._emitter = new Emitter<void>();
		this._registered = false;
	}

	public onDidChangeKeyboardLayout(callback: () => void): IDisposable {
		if (!this._registered) {
			this._registered = true;

			nativeKeymap.onDidChangeKeyboardLayout(() => {
				this._emitter.fire();
			});
		}
		return this._emitter.event(callback);
	}
}