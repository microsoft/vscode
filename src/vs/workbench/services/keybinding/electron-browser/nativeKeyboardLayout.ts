/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IKeyboardLayoutInfo, IKeyboardLayoutService, IKeyboardMapping, ILinuxKeyboardLayoutInfo, IMacKeyboardLayoutInfo, IMacLinuxKeyboardMapping, IWindowsKeyboardLayoutInfo, IWindowsKeyboardMapping, macLinuxKeyboardMappingEquals, windowsKeyboardMappingEquals } from 'vs/platform/keyboardLayout/common/keyboardLayout';
import { Emitter } from 'vs/base/common/event';
import * as nativeKeymap from 'native-keymap';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { OperatingSystem, OS } from 'vs/base/common/platform';
import { CachedKeyboardMapper, IKeyboardMapper } from 'vs/platform/keyboardLayout/common/keyboardMapper';
import { WindowsKeyboardMapper } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';
import { MacLinuxFallbackKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxFallbackKeyboardMapper';
import { MacLinuxKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxKeyboardMapper';
import { DispatchConfig } from 'vs/platform/keyboardLayout/common/dispatchConfig';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';

export class KeyboardLayoutService extends Disposable implements IKeyboardLayoutService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeKeyboardLayout = this._register(new Emitter<void>());
	readonly onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;

	private _keyboardMapping: IKeyboardMapping | null;
	private _keyboardLayoutInfo: IKeyboardLayoutInfo | null;
	private _keyboardMapper: IKeyboardMapper;

	constructor() {
		super();
		this._keyboardMapping = nativeKeymap.getKeyMap();
		this._keyboardLayoutInfo = nativeKeymap.getCurrentKeyboardLayout();
		this._keyboardMapper = new CachedKeyboardMapper(createKeyboardMapper(this._keyboardLayoutInfo, this._keyboardMapping));

		ipcRenderer.on('vscode:keyboardLayoutChanged', () => {
			const newKeyboardMapping = nativeKeymap.getKeyMap();
			if (keyboardMappingEquals(this._keyboardMapping, newKeyboardMapping)) {
				// the mappings are equal
				return;
			}

			this._keyboardMapping = nativeKeymap.getKeyMap();
			this._keyboardLayoutInfo = nativeKeymap.getCurrentKeyboardLayout();
			this._keyboardMapper = new CachedKeyboardMapper(createKeyboardMapper(this._keyboardLayoutInfo, this._keyboardMapping));
			this._onDidChangeKeyboardLayout.fire();
		});
	}

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		return this._keyboardMapping;
	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		return this._keyboardLayoutInfo;
	}

	public getAllKeyboardLayouts(): IKeyboardLayoutInfo[] {
		return [];
	}

	public getKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		if (dispatchConfig === DispatchConfig.KeyCode) {
			// Forcefully set to use keyCode
			return new MacLinuxFallbackKeyboardMapper(OS);
		}
		return this._keyboardMapper;
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		return;
	}
}

function keyboardMappingEquals(a: IKeyboardMapping | null, b: IKeyboardMapping | null): boolean {
	if (OS === OperatingSystem.Windows) {
		return windowsKeyboardMappingEquals(<IWindowsKeyboardMapping | null>a, <IWindowsKeyboardMapping | null>b);
	}

	return macLinuxKeyboardMappingEquals(<IMacLinuxKeyboardMapping | null>a, <IMacLinuxKeyboardMapping | null>b);
}

function createKeyboardMapper(layoutInfo: IKeyboardLayoutInfo | null, rawMapping: IKeyboardMapping | null): IKeyboardMapper {
	const _isUSStandard = isUSStandard(layoutInfo);
	if (OS === OperatingSystem.Windows) {
		return new WindowsKeyboardMapper(_isUSStandard, <IWindowsKeyboardMapping>rawMapping);
	}

	if (!rawMapping || Object.keys(rawMapping).length === 0) {
		// Looks like reading the mappings failed (most likely Mac + Japanese/Chinese keyboard layouts)
		return new MacLinuxFallbackKeyboardMapper(OS);
	}

	if (OS === OperatingSystem.Macintosh) {
		const kbInfo = <IMacKeyboardLayoutInfo>layoutInfo;
		if (kbInfo.id === 'com.apple.keylayout.DVORAK-QWERTYCMD') {
			// Use keyCode based dispatching for DVORAK - QWERTY ⌘
			return new MacLinuxFallbackKeyboardMapper(OS);
		}
	}

	return new MacLinuxKeyboardMapper(_isUSStandard, <IMacLinuxKeyboardMapping>rawMapping, OS);
}

function isUSStandard(_kbInfo: IKeyboardLayoutInfo | null): boolean {
	if (OS === OperatingSystem.Linux) {
		const kbInfo = <ILinuxKeyboardLayoutInfo>_kbInfo;
		return (kbInfo && (kbInfo.layout === 'us' || /^us,/.test(kbInfo.layout)));
	}

	if (OS === OperatingSystem.Macintosh) {
		const kbInfo = <IMacKeyboardLayoutInfo>_kbInfo;
		return (kbInfo && kbInfo.id === 'com.apple.keylayout.US');
	}

	if (OS === OperatingSystem.Windows) {
		const kbInfo = <IWindowsKeyboardLayoutInfo>_kbInfo;
		return (kbInfo && kbInfo.name === '00000409');
	}

	return false;
}

registerSingleton(IKeyboardLayoutService, KeyboardLayoutService, false);
