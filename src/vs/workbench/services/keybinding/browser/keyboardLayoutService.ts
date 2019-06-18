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
import { WindowsKeyboardMapper } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';
import { MacLinuxFallbackKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxFallbackKeyboardMapper';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { KeyCodeUtils, KeyCode } from 'vs/base/common/keyCodes';
import { IMacLinuxKeyboardMapping, MacLinuxKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxKeyboardMapper';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyboardLayoutProvider } from 'vs/workbench/services/keybinding/browser/keyboardLayoutProvider';
import { INavigatorWithKeyboard } from 'vs/workbench/services/keybinding/common/navigatorKeyboard';

export class BrowserKeyboardMapperFactory {
	public static readonly INSTANCE = new BrowserKeyboardMapperFactory();
	private _layoutInfo: IKeyboardLayoutInfo | null;
	private _rawMapping: IKeyboardMapping | null;
	private _keyboardMapper: IKeyboardMapper | null;
	private _initialized: boolean;
	private readonly _onDidChangeKeyboardMapper = new Emitter<void>();
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	private constructor() {
		this._layoutInfo = null;
		this._rawMapping = null;
		this._keyboardMapper = null;
		this._initialized = false;

		const platform = isWindows ? 'win' : isMacintosh ? 'darwin' : 'linux';

		import('vs/workbench/services/keybinding/browser/keyboardlayouts/layout.contribution.' + platform).then(() => {
			this._initialized = true;
			this._onKeyboardLayoutChanged();
		});

		if ((<INavigatorWithKeyboard>navigator).keyboard && (<INavigatorWithKeyboard>navigator).keyboard.addEventListener) {
			(<INavigatorWithKeyboard>navigator).keyboard.addEventListener!('layoutchange', () => {
				// Update user keyboard map settings
				this.getBrowserKeyMap().then((keymap: IKeyboardMapping) => {
					if (KeyboardLayoutProvider.INSTANCE.isActive(keymap)) {
						return;
					}

					this._onKeyboardLayoutChanged();
				});
			});
		}
	}

	private _onKeyboardLayoutChanged(): void {
		this._updateKeyboardLayoutAsync(this._initialized);
	}

	private _updateKeyboardLayoutAsync(initialized: boolean) {
		if (!initialized) {
			return;
		}

		this.getBrowserKeyMap().then(keyMap => {
			// might be false positive
			if (KeyboardLayoutProvider.INSTANCE.isActive(keyMap)) {
				return;
			}
			KeyboardLayoutProvider.INSTANCE.setActive(keyMap);
			let currentKeyboardLayout = KeyboardLayoutProvider.INSTANCE.activeKeyboardLayout;

			if (currentKeyboardLayout) {
				this._setKeyboardData(currentKeyboardLayout.layout, keyMap);
			}
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

		let isCurrentKeyboard = this._validateCurrentKeyboardMapping(keyboardEvent);

		if (isCurrentKeyboard) {
			return;
		}

		this._updateKeyboardLayoutAsync(true);
	}

	private _validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): boolean {
		if (!this._initialized) {
			return true;
		}

		const standardKeyboardEvent = keyboardEvent as StandardKeyboardEvent;
		const currentKeymap = KeyboardLayoutProvider.INSTANCE.activeKeyboardLayout;
		if (!currentKeymap) {
			return true;
		}

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

						this._onKeyboardLayoutChanged();
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

		// TODO, this assumption is wrong as `browserEvent.key` doesn't necessarily equal expectedValue from real keymap
		if (!isDead && standardKeyboardEvent.browserEvent.key !== expectedValue) {
			return false;
		}

		return true;
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

	async getBrowserKeyMap() {
		if ((navigator as any).keyboard) {
			try {
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

					const matchedKeyboardLayout = KeyboardLayoutProvider.INSTANCE.getMatchedKeyboardLayout(ret);

					if (matchedKeyboardLayout) {
						return matchedKeyboardLayout.value;
					}

					return {};
				});
			} catch {
				// getLayoutMap can throw if invoked from a nested browsing context
			}
		}

		return {};
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