/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IKeyboardLayoutInfo, IKeyboardLayoutService, IKeyboardMapping } from 'vs/workbench/services/keyboardLayout/common/keyboardLayout';
import { Emitter } from 'vs/base/common/event';
import * as nativeKeymap from 'native-keymap';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';

export class KeyboardLayoutService extends Disposable implements IKeyboardLayoutService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeKeyboardLayout = this._register(new Emitter<void>());
	readonly onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;

	private _cachedKeyboardMapping: IKeyboardMapping | null;
	private _cachedKeyboardLayoutInfo: IKeyboardLayoutInfo | null;
	private _cacheIsValid: boolean;

	constructor() {
		super();
		this._cachedKeyboardMapping = null;
		this._cachedKeyboardLayoutInfo = null;
		this._cacheIsValid = false;

		ipcRenderer.on('vscode:keyboardLayoutChanged', () => {
			this._cacheIsValid = false;
			this._onDidChangeKeyboardLayout.fire();
		});
	}

	private _ensureCache(): void {
		if (this._cacheIsValid) {
			return;
		}
		this._cachedKeyboardMapping = nativeKeymap.getKeyMap();
		this._cachedKeyboardLayoutInfo = nativeKeymap.getCurrentKeyboardLayout();
		this._cacheIsValid = true;
	}

	public getKeyboardMapping(): IKeyboardMapping | null {
		this._ensureCache();
		return this._cachedKeyboardMapping;
	}

	public getKeyboardLayoutInfo(): IKeyboardLayoutInfo | null {
		this._ensureCache();
		return this._cachedKeyboardLayoutInfo;
	}
}

registerSingleton(IKeyboardLayoutService, KeyboardLayoutService, false);
