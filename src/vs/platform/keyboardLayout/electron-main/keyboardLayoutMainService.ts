/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as nativeKeymap from 'native-keymap';
import * as platform from '../../../base/common/platform.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IKeyboardLayoutData, INativeKeyboardLayoutService } from '../common/keyboardLayoutService.js';
import { ILifecycleMainService, LifecycleMainPhase } from '../../lifecycle/electron-main/lifecycleMainService.js';

export const IKeyboardLayoutMainService = createDecorator<IKeyboardLayoutMainService>('keyboardLayoutMainService');

export interface IKeyboardLayoutMainService extends INativeKeyboardLayoutService { }

export class KeyboardLayoutMainService extends Disposable implements INativeKeyboardLayoutService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeKeyboardLayout = this._register(new Emitter<IKeyboardLayoutData>());
	readonly onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;

	private _initPromise: Promise<void> | null;
	private _keyboardLayoutData: IKeyboardLayoutData | null;

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService
	) {
		super();
		this._initPromise = null;
		this._keyboardLayoutData = null;

		// perf: automatically trigger initialize after windows
		// have opened so that we can do this work in parallel
		// to the window load.
		lifecycleMainService.when(LifecycleMainPhase.AfterWindowOpen).then(() => this._initialize());
	}

	private _initialize(): Promise<void> {
		if (!this._initPromise) {
			this._initPromise = this._doInitialize();
		}
		return this._initPromise;
	}

	private async _doInitialize(): Promise<void> {
		const nativeKeymapMod = await import('native-keymap');

		this._keyboardLayoutData = readKeyboardLayoutData(nativeKeymapMod);
		if (!platform.isCI) {
			// See https://github.com/microsoft/vscode/issues/152840
			// Do not register the keyboard layout change listener in CI because it doesn't work
			// on the build machines and it just adds noise to the build logs.
			nativeKeymapMod.onDidChangeKeyboardLayout(() => {
				this._keyboardLayoutData = readKeyboardLayoutData(nativeKeymapMod);
				this._onDidChangeKeyboardLayout.fire(this._keyboardLayoutData);
			});
		}
	}

	public async getKeyboardLayoutData(): Promise<IKeyboardLayoutData> {
		await this._initialize();
		return this._keyboardLayoutData!;
	}
}

function readKeyboardLayoutData(nativeKeymapMod: typeof nativeKeymap): IKeyboardLayoutData {
	const keyboardMapping = nativeKeymapMod.getKeyMap();
	const keyboardLayoutInfo = nativeKeymapMod.getCurrentKeyboardLayout();
	return { keyboardMapping, keyboardLayoutInfo };
}
