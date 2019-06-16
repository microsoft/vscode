/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IKeymapService, IKeyboardLayoutInfo, IKeyboardMapping, IWindowsKeyboardMapping } from 'vs/workbench/services/keybinding/common/keymapService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { DispatchConfig } from 'vs/workbench/services/keybinding/common/dispatchConfig';
import { IKeyboardMapper, CachedKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { OS, OperatingSystem, isMacintosh, isWindows } from 'vs/base/common/platform';
import { WindowsKeyboardMapper, windowsKeyboardMappingEquals } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';
import { MacLinuxFallbackKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxFallbackKeyboardMapper';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { KeyCodeUtils, KeyCode } from 'vs/base/common/keyCodes';
import { IMacLinuxKeyboardMapping, MacLinuxKeyboardMapper, macLinuxKeyboardMappingEquals } from 'vs/workbench/services/keybinding/common/macLinuxKeyboardMapper';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';

import { KeyboardLayoutProvider } from 'vs/workbench/services/keybinding/browser/keyboardLayoutProvider';

export class BrowserKeymap {
	public static readonly INSTANCE: BrowserKeymap = new BrowserKeymap();

	private readonly _onDidChangeKeyboardLayout = new Emitter<void>();
	public readonly onDidChangeKeyboardLayout: Event<void> = this._onDidChangeKeyboardLayout.event;

	private readonly _onDidInitialized = new Emitter<void>();
	public readonly onDidInitialized: Event<void> = this._onDidInitialized.event;

	private _initialized: boolean;

	private constructor() {
		this._initialized = false;
		const platform = isWindows ? 'win' : isMacintosh ? 'darwin' : 'linux';

		import('vs/workbench/services/keybinding/browser/keyboardlayouts/layout.contribution.' + platform).then(() => {
			this._initialized = true;
			this._onDidInitialized.fire();
		});

		if ((navigator as any).keyboard && (navigator as any).keyboard.addEventListener) {
			(navigator as any).keyboard.addEventListener('layoutchange', () => {
				// Update user keyboard map settings
				this.getBrowserKeyMap().then((keymap: IKeyboardMapping) => {
					if (KeyboardLayoutProvider.INSTANCE.isActive(keymap)) {
						return;
					}

					this._onDidChangeKeyboardLayout.fire();
				});
			});
		}


	}

	validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): boolean {
		if (!this._initialized) {
			return true;
		}

		const standardKeyboardEvent = keyboardEvent as StandardKeyboardEvent;
		const currentKeymap = KeyboardLayoutProvider.INSTANCE.activeKeyboardLayout;
		const mapping = currentKeymap.value[standardKeyboardEvent.code];

		if (!mapping) {
			return false;
		}

		if (mapping.value === '') {
			// we don't undetstand
			if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
				setTimeout(() => {
					this.getBrowserKeyMap().then((keymap: IKeyboardMapping) => {
						if (KeyboardLayoutProvider.INSTANCE.isActive(keymap)) {
							return;
						}

						this._onDidChangeKeyboardLayout.fire();
					});
				}, 350);
			}
			return true;
		}

		const expectedValue = standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey ? mapping.withShiftAltGr :
			standardKeyboardEvent.altKey ? mapping.withAltGr :
				standardKeyboardEvent.shiftKey ? mapping.withShift : mapping.value;

		const isDead = (standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey && mapping.withShiftAltGrIsDeadKey) ||
			(standardKeyboardEvent.altKey && mapping.withAltGrIsDeadKey) ||
			(standardKeyboardEvent.shiftKey && mapping.withShiftIsDeadKey) ||
			mapping.valueIsDeadKey;

		if (isDead && standardKeyboardEvent.browserEvent.key !== 'Dead') {
			return false;
		}

		if (!isDead && standardKeyboardEvent.browserEvent.key !== expectedValue) {
			return false;
		}

		return true;
	}

	getCurrentKeyboardLayout() {
		if (!this._initialized) {
			return null;
		}

		return KeyboardLayoutProvider.INSTANCE.activeKeyboardLayout.layout;
	}

	async getBrowserKeyMap() {
		if ((navigator as any).keyboard) {
			return (navigator as any).keyboard.getLayoutMap().then((e: any) => {
				let ret: IKeyboardMapping = {};
				for (let key of e) {
					ret[key[0]] = {
						'value': key[1],
						'withShift': '',
						'withAltGr': '',
						'withShiftAltGr': ''
					};
				}

				return KeyboardLayoutProvider.INSTANCE.getMatchedKeyboardLayout(ret).value;
			});
		}

		return {};
	}
}

export class BrowserKeyboardMapperFactory {
	public static readonly INSTANCE = new BrowserKeyboardMapperFactory();
	private _layoutInfo: IKeyboardLayoutInfo | null;
	private _rawMapping: IKeyboardMapping | null;
	private _keyboardMapper: IKeyboardMapper | null;
	private _initialized: boolean;
	private readonly _onDidChangeKeyboardMapper = new Emitter<void>();
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	private readonly _onDidInitialized = new Emitter<void>();
	public readonly onDidInitialized: Event<void> = this._onDidInitialized.event;

	private constructor() {
		this._layoutInfo = null;
		this._rawMapping = null;
		this._keyboardMapper = null;
		this._initialized = false;

		BrowserKeymap.INSTANCE.onDidInitialized(() => {
			this._initialized = true;
			this._onKeyboardLayoutChanged();
		});

		BrowserKeymap.INSTANCE.onDidChangeKeyboardLayout(() => {
			this._onKeyboardLayoutChanged();
		});
	}

	private _onKeyboardLayoutChanged(): void {
		if (this._initialized) {
			this.updateKeyboardLayoutAsync(true);
		}
	}

	private updateKeyboardLayoutAsync(initialized: boolean) {
		if (!initialized) {
			return;
		}

		BrowserKeymap.INSTANCE.getBrowserKeyMap().then(keyMap => {
			KeyboardLayoutProvider.INSTANCE.setActive(keyMap);
			this._setKeyboardData(BrowserKeymap.INSTANCE.getCurrentKeyboardLayout()!, keyMap);
		});
	}

	public getKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		if (!this._initialized) {
			return new MacLinuxFallbackKeyboardMapper(OS);
		}
		if (dispatchConfig === DispatchConfig.KeyCode) {
			// Forcefully set to use keyCode
			return new MacLinuxFallbackKeyboardMapper(OS);
		}
		return this._keyboardMapper!;

	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		if (!this._initialized) {
			return null;
		}
		return this._layoutInfo;
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		if (!this._initialized) {
			return;
		}

		let isCurrentKeyboard = BrowserKeymap.INSTANCE.validateCurrentKeyboardMapping(keyboardEvent);

		if (isCurrentKeyboard) {
			return;
		}

		this.updateKeyboardLayoutAsync(true);
	}

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		if (!this._initialized) {
			return null;
		}
		return this._rawMapping;
	}

	private _setKeyboardData(layoutInfo: IKeyboardLayoutInfo, rawMapping: IKeyboardMapping): void {
		this._layoutInfo = layoutInfo;
		this._initialized = true;
		this._rawMapping = rawMapping;
		this._keyboardMapper = new CachedKeyboardMapper(BrowserKeyboardMapperFactory._createKeyboardMapper(this._layoutInfo, this._rawMapping));
		this._onDidChangeKeyboardMapper.fire();
	}

	private static _isUSStandard(rawMapping: IKeyboardMapping): boolean {
		for (let key in rawMapping) {
			let str = rawMapping[key].value;
			let keyCode = KeyCodeUtils.fromString(str);
			let usKeyCode = US_SCANCODE_MAP[key];

			if (keyCode !== usKeyCode) {
				return false;
			}

		}
		return true;
	}

	private static _createKeyboardMapper(layoutInfo: IKeyboardLayoutInfo, rawMapping: IKeyboardMapping): IKeyboardMapper {
		const isUSStandard = BrowserKeyboardMapperFactory._isUSStandard(rawMapping);
		if (OS === OperatingSystem.Windows) {
			return new WindowsKeyboardMapper(isUSStandard, <IWindowsKeyboardMapping>rawMapping);
		}
		if (Object.keys(rawMapping).length === 0) {
			// Looks like reading the mappings failed (most likely Mac + Japanese/Chinese keyboard layouts)
			return new MacLinuxFallbackKeyboardMapper(OS);
		}

		return new MacLinuxKeyboardMapper(isUSStandard, <IMacLinuxKeyboardMapping>rawMapping, OS);
	}

	private static _equals(a: IKeyboardMapping | null, b: IKeyboardMapping | null): boolean {
		if (OS === OperatingSystem.Windows) {
			return windowsKeyboardMappingEquals(<IWindowsKeyboardMapping>a, <IWindowsKeyboardMapping>b);
		}
		return macLinuxKeyboardMappingEquals(<IMacLinuxKeyboardMapping>a, <IMacLinuxKeyboardMapping>b);
	}
}


export const US_SCANCODE_MAP: { [str: string]: KeyCode; } = {};

(function () {
	function define(scanCode: string, keyCode: KeyCode): void {
		US_SCANCODE_MAP[scanCode] = keyCode;
	}

	define('Backquote', KeyCode.US_BACKTICK);
	define('Backslash', KeyCode.US_BACKSLASH);
	define('BracketLeft', KeyCode.US_OPEN_SQUARE_BRACKET);
	define('BracketRight', KeyCode.US_CLOSE_SQUARE_BRACKET);
	define('Comma', KeyCode.US_COMMA);
	define('Digit0', KeyCode.KEY_0);
	define('Digit1', KeyCode.KEY_1);
	define('Digit2', KeyCode.KEY_2);
	define('Digit3', KeyCode.KEY_3);
	define('Digit4', KeyCode.KEY_4);
	define('Digit5', KeyCode.KEY_5);
	define('Digit6', KeyCode.KEY_6);
	define('Digit7', KeyCode.KEY_7);
	define('Digit8', KeyCode.KEY_8);
	define('Digit9', KeyCode.KEY_9);
	define('Equal', KeyCode.US_EQUAL);
	define('IntlBackslash', KeyCode.Unknown);
	define('KeyA', KeyCode.KEY_A);
	define('KeyB', KeyCode.KEY_B);
	define('KeyC', KeyCode.KEY_C);
	define('KeyD', KeyCode.KEY_D);
	define('KeyE', KeyCode.KEY_E);
	define('KeyF', KeyCode.KEY_F);
	define('KeyG', KeyCode.KEY_G);
	define('KeyH', KeyCode.KEY_H);
	define('KeyI', KeyCode.KEY_I);
	define('KeyJ', KeyCode.KEY_J);
	define('KeyK', KeyCode.KEY_K);
	define('KeyL', KeyCode.KEY_L);
	define('KeyM', KeyCode.KEY_M);
	define('KeyN', KeyCode.KEY_N);
	define('KeyO', KeyCode.KEY_O);
	define('KeyP', KeyCode.KEY_P);
	define('KeyQ', KeyCode.KEY_Q);
	define('KeyR', KeyCode.KEY_R);
	define('KeyS', KeyCode.KEY_S);
	define('KeyT', KeyCode.KEY_T);
	define('KeyU', KeyCode.KEY_U);
	define('KeyV', KeyCode.KEY_V);
	define('KeyW', KeyCode.KEY_W);
	define('KeyX', KeyCode.KEY_X);
	define('KeyY', KeyCode.KEY_Y);
	define('KeyZ', KeyCode.KEY_Z);
	define('Minus', KeyCode.US_MINUS);
	define('Period', KeyCode.US_DOT);
	define('Quote', KeyCode.US_QUOTE);
	define('Semicolon', KeyCode.US_SEMICOLON);
	define('Slash', KeyCode.US_SLASH);
})();

class BrowserKeymapService extends Disposable implements IKeymapService {
	public _serviceBrand: any;

	private readonly _onDidChangeKeyboardMapper = new Emitter<void>();
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	constructor() {
		super();

		this._register(BrowserKeyboardMapperFactory.INSTANCE.onDidChangeKeyboardMapper(() => {
			this._onDidChangeKeyboardMapper.fire();
		}));
	}

	getKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		return BrowserKeyboardMapperFactory.INSTANCE.getKeyboardMapper(dispatchConfig);
	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		return BrowserKeyboardMapperFactory.INSTANCE.getCurrentKeyboardLayout();
	}

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		return BrowserKeyboardMapperFactory.INSTANCE.getRawKeyboardMapping();
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		BrowserKeyboardMapperFactory.INSTANCE.validateCurrentKeyboardMapping(keyboardEvent);
	}
}

registerSingleton(IKeymapService, BrowserKeymapService, true);