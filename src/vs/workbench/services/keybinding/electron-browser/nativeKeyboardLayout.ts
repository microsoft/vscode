/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IKeyboardLayoutInfo, IKeyboardLayoutService, IKeyboardMapping, ILinuxKeyboardLayoutInfo, IMacKeyboardLayoutInfo, IMacLinuxKeyboardMapping, IWindowsKeyboardLayoutInfo, IWindowsKeyboardMapping } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { Emitter } from '../../../../base/common/event.js';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { CachedKeyboardMapper, IKeyboardMapper } from '../../../../platform/keyboardLayout/common/keyboardMapper.js';
import { WindowsKeyboardMapper } from '../common/windowsKeyboardMapper.js';
import { FallbackKeyboardMapper } from '../common/fallbackKeyboardMapper.js';
import { MacLinuxKeyboardMapper } from '../common/macLinuxKeyboardMapper.js';
import { DispatchConfig, readKeyboardConfig } from '../../../../platform/keyboardLayout/common/keyboardConfig.js';
import { IKeyboardEvent } from '../../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INativeKeyboardLayoutService } from './nativeKeyboardLayoutService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export class KeyboardLayoutService extends Disposable implements IKeyboardLayoutService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeKeyboardLayout = this._register(new Emitter<void>());
	readonly onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;

	private _keyboardMapper: IKeyboardMapper | null;

	constructor(
		@INativeKeyboardLayoutService private readonly _nativeKeyboardLayoutService: INativeKeyboardLayoutService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._keyboardMapper = null;

		this._register(this._nativeKeyboardLayoutService.onDidChangeKeyboardLayout(async () => {
			this._keyboardMapper = null;
			this._onDidChangeKeyboardLayout.fire();
		}));

		this._register(_configurationService.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('keyboard')) {
				this._keyboardMapper = null;
				this._onDidChangeKeyboardLayout.fire();
			}
		}));
	}

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		return this._nativeKeyboardLayoutService.getRawKeyboardMapping();
	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		return this._nativeKeyboardLayoutService.getCurrentKeyboardLayout();
	}

	public getAllKeyboardLayouts(): IKeyboardLayoutInfo[] {
		return [];
	}

	public getKeyboardMapper(): IKeyboardMapper {
		const config = readKeyboardConfig(this._configurationService);
		if (config.dispatch === DispatchConfig.KeyCode) {
			// Forcefully set to use keyCode
			return new FallbackKeyboardMapper(config.mapAltGrToCtrlAlt, OS);
		}
		if (!this._keyboardMapper) {
			this._keyboardMapper = new CachedKeyboardMapper(createKeyboardMapper(this.getCurrentKeyboardLayout(), this.getRawKeyboardMapping(), config.mapAltGrToCtrlAlt));
		}
		return this._keyboardMapper;
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		return;
	}
}

function createKeyboardMapper(layoutInfo: IKeyboardLayoutInfo | null, rawMapping: IKeyboardMapping | null, mapAltGrToCtrlAlt: boolean): IKeyboardMapper {
	const _isUSStandard = isUSStandard(layoutInfo);
	if (OS === OperatingSystem.Windows) {
		return new WindowsKeyboardMapper(_isUSStandard, <IWindowsKeyboardMapping>rawMapping, mapAltGrToCtrlAlt);
	}

	if (!rawMapping || Object.keys(rawMapping).length === 0) {
		// Looks like reading the mappings failed (most likely Mac + Japanese/Chinese keyboard layouts)
		return new FallbackKeyboardMapper(mapAltGrToCtrlAlt, OS);
	}

	if (OS === OperatingSystem.Macintosh) {
		const kbInfo = <IMacKeyboardLayoutInfo>layoutInfo;
		if (kbInfo.id === 'com.apple.keylayout.DVORAK-QWERTYCMD') {
			// Use keyCode based dispatching for DVORAK - QWERTY ⌘
			return new FallbackKeyboardMapper(mapAltGrToCtrlAlt, OS);
		}
	}

	return new MacLinuxKeyboardMapper(_isUSStandard, <IMacLinuxKeyboardMapping>rawMapping, mapAltGrToCtrlAlt, OS);
}

function isUSStandard(_kbInfo: IKeyboardLayoutInfo | null): boolean {
	if (!_kbInfo) {
		return false;
	}

	if (OS === OperatingSystem.Linux) {
		const kbInfo = <ILinuxKeyboardLayoutInfo>_kbInfo;
		const layouts = kbInfo.layout.split(/,/g);
		return (layouts[kbInfo.group] === 'us');
	}

	if (OS === OperatingSystem.Macintosh) {
		const kbInfo = <IMacKeyboardLayoutInfo>_kbInfo;
		return (kbInfo.id === 'com.apple.keylayout.US');
	}

	if (OS === OperatingSystem.Windows) {
		const kbInfo = <IWindowsKeyboardLayoutInfo>_kbInfo;
		return (kbInfo.name === '00000409');
	}

	return false;
}

registerSingleton(IKeyboardLayoutService, KeyboardLayoutService, InstantiationType.Delayed);
