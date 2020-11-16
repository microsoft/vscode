/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IKeymapService } from 'vs/workbench/services/keybinding/common/keymapInfo';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IKeyboardMapper, CachedKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { Emitter, Event } from 'vs/base/common/event';
import { DispatchConfig } from 'vs/workbench/services/keybinding/common/dispatchConfig';
import { MacLinuxFallbackKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxFallbackKeyboardMapper';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { WindowsKeyboardMapper } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';
import { MacLinuxKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxKeyboardMapper';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { IKeyboardLayoutInfo, IKeyboardLayoutService, IKeyboardMapping, ILinuxKeyboardLayoutInfo, IMacKeyboardLayoutInfo, IMacLinuxKeyboardMapping, IWindowsKeyboardLayoutInfo, IWindowsKeyboardMapping } from 'vs/workbench/services/keyboardLayout/common/keyboardLayout';

class KeyboardMapperFactory {

	private _layoutInfo: IKeyboardLayoutInfo | null;
	private _rawMapping: IKeyboardMapping | null;
	private _keyboardMapper: IKeyboardMapper | null;
	private _initialized: boolean;

	private readonly _onDidChangeKeyboardMapper = new Emitter<void>();
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	constructor(
		private readonly _keyboardLayoutService: IKeyboardLayoutService
	) {
		this._layoutInfo = null;
		this._rawMapping = null;
		this._keyboardMapper = null;
		this._initialized = false;
	}

	public _onKeyboardLayoutChanged(): void {
		if (this._initialized) {
			this._setKeyboardData(this._keyboardLayoutService.getKeyboardLayoutInfo(), this._keyboardLayoutService.getKeyboardMapping());
		}
	}

	public getKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		if (!this._initialized) {
			this._setKeyboardData(this._keyboardLayoutService.getKeyboardLayoutInfo(), this._keyboardLayoutService.getKeyboardMapping());
		}
		if (dispatchConfig === DispatchConfig.KeyCode) {
			// Forcefully set to use keyCode
			return new MacLinuxFallbackKeyboardMapper(OS);
		}
		return this._keyboardMapper!;
	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		if (!this._initialized) {
			this._setKeyboardData(this._keyboardLayoutService.getKeyboardLayoutInfo(), this._keyboardLayoutService.getKeyboardMapping());
		}
		return this._layoutInfo;
	}

	private static _isUSStandard(_kbInfo: IKeyboardLayoutInfo | null): boolean {
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

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		if (!this._initialized) {
			this._setKeyboardData(this._keyboardLayoutService.getKeyboardLayoutInfo(), this._keyboardLayoutService.getKeyboardMapping());
		}
		return this._rawMapping;
	}

	private _setKeyboardData(layoutInfo: IKeyboardLayoutInfo | null, rawMapping: IKeyboardMapping | null): void {
		this._layoutInfo = layoutInfo;
		this._initialized = true;
		this._rawMapping = rawMapping;
		this._keyboardMapper = new CachedKeyboardMapper(
			KeyboardMapperFactory._createKeyboardMapper(this._layoutInfo, this._rawMapping)
		);
		this._onDidChangeKeyboardMapper.fire();
	}

	private static _createKeyboardMapper(layoutInfo: IKeyboardLayoutInfo | null, rawMapping: IKeyboardMapping | null): IKeyboardMapper {
		const isUSStandard = KeyboardMapperFactory._isUSStandard(layoutInfo);
		if (OS === OperatingSystem.Windows) {
			return new WindowsKeyboardMapper(isUSStandard, <IWindowsKeyboardMapping>rawMapping);
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

		return new MacLinuxKeyboardMapper(isUSStandard, <IMacLinuxKeyboardMapping>rawMapping, OS);
	}
}

class NativeKeymapService extends Disposable implements IKeymapService {
	public _serviceBrand: undefined;

	private readonly _onDidChangeKeyboardMapper = this._register(new Emitter<void>());
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	private readonly _factory: KeyboardMapperFactory;

	constructor(
		@IKeyboardLayoutService keyboardLayoutService: IKeyboardLayoutService
	) {
		super();

		this._factory = new KeyboardMapperFactory(keyboardLayoutService);

		this._register(this._factory.onDidChangeKeyboardMapper(() => {
			this._onDidChangeKeyboardMapper.fire();
		}));

		this._register(keyboardLayoutService.onDidChangeKeyboardLayout(() => {
			this._factory._onKeyboardLayoutChanged();
		}));
	}

	getKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		return this._factory.getKeyboardMapper(dispatchConfig);
	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		return this._factory.getCurrentKeyboardLayout();
	}

	getAllKeyboardLayouts(): IKeyboardLayoutInfo[] {
		return [];
	}

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		return this._factory.getRawKeyboardMapping();
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		return;
	}
}

registerSingleton(IKeymapService, NativeKeymapService, true);
