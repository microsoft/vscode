/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyCode, KeyCodeUtils, ResolvedKeybinding, Keybinding, SimpleKeybinding, KeybindingType, USER_SETTINGS } from 'vs/base/common/keyCodes';
import { KeyboardEventCode, KeyboardEventCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE } from 'vs/workbench/services/keybinding/common/keyboardEventCode';
import { CharCode } from 'vs/base/common/charCode';
import { UILabelProvider, AriaLabelProvider, ElectronAcceleratorLabelProvider, UserSettingsLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
import { OperatingSystem } from 'vs/base/common/platform';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { IKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';

export interface IKeyMapping {
	vkey: string;
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;
}

export interface IKeyboardMapping {
	[code: string]: IKeyMapping;
}

const LOG = false;
function log(str: string): void {
	if (LOG) {
		console.info(str);
	}
}

const NATIVE_KEY_CODE_TO_KEY_CODE: { [nativeKeyCode: string]: KeyCode; } = _getNativeMap();

interface IHardwareCodeMapping {
	code: KeyboardEventCode;
	keyCode: KeyCode;
	value: number;
	withShift: number;
	withAltGr: number;
	withShiftAltGr: number;
}

export class WindowsNativeResolvedKeybinding extends ResolvedKeybinding {

	private readonly _mapper: WindowsKeyboardMapper;
	private readonly _firstPart: SimpleKeybinding;
	private readonly _chordPart: SimpleKeybinding;

	constructor(mapper: WindowsKeyboardMapper, firstPart: SimpleKeybinding, chordPart: SimpleKeybinding) {
		super();
		this._mapper = mapper;
		this._firstPart = firstPart;
		this._chordPart = chordPart;
	}

	public getLabel(): string {
		let firstPart = this._firstPart ? this._mapper.getUILabelForKeyCode(this._firstPart.keyCode) : null;
		let chordPart = this._chordPart ? this._mapper.getUILabelForKeyCode(this._chordPart.keyCode) : null;
		return UILabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, OperatingSystem.Windows);
	}

	public getAriaLabel(): string {
		let firstPart = this._firstPart ? this._mapper.getAriaLabelForKeyCode(this._firstPart.keyCode) : null;
		let chordPart = this._chordPart ? this._mapper.getAriaLabelForKeyCode(this._chordPart.keyCode) : null;
		return AriaLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, OperatingSystem.Windows);
	}

	public getHTMLLabel(): IHTMLContentElement[] {
		let firstPart = this._firstPart ? this._mapper.getUILabelForKeyCode(this._firstPart.keyCode) : null;
		let chordPart = this._chordPart ? this._mapper.getUILabelForKeyCode(this._chordPart.keyCode) : null;
		return UILabelProvider.toHTMLLabel(this._firstPart, firstPart, this._chordPart, chordPart, OperatingSystem.Windows);
	}

	private _keyCodeToElectronAccelerator(keyCode: KeyCode): string {
		if (keyCode >= KeyCode.NUMPAD_0 && keyCode <= KeyCode.NUMPAD_DIVIDE) {
			// Electron cannot handle numpad keys
			return null;
		}

		switch (keyCode) {
			case KeyCode.UpArrow:
				return 'Up';
			case KeyCode.DownArrow:
				return 'Down';
			case KeyCode.LeftArrow:
				return 'Left';
			case KeyCode.RightArrow:
				return 'Right';
		}

		// electron menus always do the correct rendering on Windows
		return KeyCodeUtils.toString(keyCode);
	}

	public getElectronAccelerator(): string {
		if (this._chordPart !== null) {
			// Electron cannot handle chords
			return null;
		}

		let firstPart = this._firstPart ? this._keyCodeToElectronAccelerator(this._firstPart.keyCode) : null;
		return ElectronAcceleratorLabelProvider.toLabel(this._firstPart, firstPart, null, null, OperatingSystem.Windows);
	}

	public getUserSettingsLabel(): string {
		let firstPart = this._firstPart ? USER_SETTINGS.fromKeyCode(this._firstPart.keyCode) : null;
		let chordPart = this._chordPart ? USER_SETTINGS.fromKeyCode(this._chordPart.keyCode) : null;
		let result = UserSettingsLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, OperatingSystem.Windows);
		return result.toLowerCase();
	}

	public isChord(): boolean {
		return (this._chordPart ? true : false);
	}

	public hasCtrlModifier(): boolean {
		if (this._chordPart) {
			return false;
		}
		return this._firstPart.ctrlKey;
	}

	public hasShiftModifier(): boolean {
		if (this._chordPart) {
			return false;
		}
		return this._firstPart.shiftKey;
	}

	public hasAltModifier(): boolean {
		if (this._chordPart) {
			return false;
		}
		return this._firstPart.altKey;
	}

	public hasMetaModifier(): boolean {
		if (this._chordPart) {
			return false;
		}
		return this._firstPart.metaKey;
	}

	public getDispatchParts(): [string, string] {
		let firstPart = this._firstPart ? this._getDispatchStr(this._firstPart) : null;
		let chordPart = this._chordPart ? this._getDispatchStr(this._chordPart) : null;
		return [firstPart, chordPart];
	}

	private _getDispatchStr(keybinding: SimpleKeybinding): string {
		if (keybinding.isModifierKey()) {
			return null;
		}
		let result = '';

		if (keybinding.ctrlKey) {
			result += 'ctrl+';
		}
		if (keybinding.shiftKey) {
			result += 'shift+';
		}
		if (keybinding.altKey) {
			result += 'alt+';
		}
		if (keybinding.metaKey) {
			result += 'meta+';
		}
		result += KeyCodeUtils.toString(keybinding.keyCode);

		return result;
	}
}

export class WindowsKeyboardMapper implements IKeyboardMapper {

	private readonly _codeInfo: IHardwareCodeMapping[];
	private readonly _hwToKb: KeyCode[];
	private readonly _kbToLabel: string[] = [];

	constructor(rawMappings: IKeyboardMapping) {
		this._hwToKb = [];
		this._kbToLabel = [];
		this._kbToLabel[KeyCode.Unknown] = KeyCodeUtils.toString(KeyCode.Unknown);

		for (let code = KeyboardEventCode.None; code < KeyboardEventCode.MAX_VALUE; code++) {
			const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[code];
			if (immutableKeyCode !== -1) {
				this._hwToKb[code] = immutableKeyCode;
				this._kbToLabel[immutableKeyCode] = KeyCodeUtils.toString(immutableKeyCode);
			}
		}

		this._codeInfo = [];
		for (let strCode in rawMappings) {
			if (rawMappings.hasOwnProperty(strCode)) {
				const code = KeyboardEventCodeUtils.toEnum(strCode);
				if (code === KeyboardEventCode.None) {
					log(`Unknown code ${strCode} in mapping.`);
					continue;
				}
				if (IMMUTABLE_CODE_TO_KEY_CODE[code] !== -1) {
					continue;
				}

				const rawMapping = rawMappings[strCode];
				const value = WindowsKeyboardMapper._getCharCode(rawMapping.value);
				const withShift = WindowsKeyboardMapper._getCharCode(rawMapping.withShift);
				const withAltGr = WindowsKeyboardMapper._getCharCode(rawMapping.withAltGr);
				const withShiftAltGr = WindowsKeyboardMapper._getCharCode(rawMapping.withShiftAltGr);
				const keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || KeyCode.Unknown;

				const mapping: IHardwareCodeMapping = {
					code: code,
					keyCode: keyCode,
					value: value,
					withShift: withShift,
					withAltGr: withAltGr,
					withShiftAltGr: withShiftAltGr,
				};
				this._codeInfo[code] = mapping;

				if (keyCode !== KeyCode.Unknown) {
					if (value >= CharCode.a && value <= CharCode.z) {
						this._kbToLabel[keyCode] = String.fromCharCode(CharCode.A + (value - CharCode.a));
					} else if (value) {
						this._kbToLabel[keyCode] = String.fromCharCode(value);
					} else {
						this._kbToLabel[keyCode] = null;
					}
				}
				this._hwToKb[code] = keyCode;
			}
		}
	}

	public dumpDebugInfo(): string {
		let result: string[] = [];

		let cnt = 0;
		result.push(`--------------------------------------------------------------------------------------------------`);
		for (let code = KeyboardEventCode.None; code < KeyboardEventCode.MAX_VALUE; code++) {
			if (IMMUTABLE_CODE_TO_KEY_CODE[code] !== -1) {
				continue;
			}

			if (cnt % 6 === 0) {
				result.push(`|       HW Code combination      |  Key  |    KeyCode combination    |          UI label         |`);
				result.push(`--------------------------------------------------------------------------------------------------`);
			}
			cnt++;

			const mapping = this._codeInfo[code];
			const strCode = KeyboardEventCodeUtils.toString(code);
			const keyCode = this._hwToKb[code];
			const strKeyCode = KeyCodeUtils.toString(keyCode);
			const uiLabel = this._kbToLabel[keyCode];

			let mods = [0b000, 0b010, 0b101, 0b111];
			for (let modIndex = 0; modIndex < mods.length; modIndex++) {
				const mod = mods[modIndex];
				const ctrlKey = (mod & 0b001) ? true : false;
				const shiftKey = (mod & 0b010) ? true : false;
				const altKey = (mod & 0b100) ? true : false;
				const strHw = `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${strCode}`;
				const uiHwLabel = `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${uiLabel}`;

				let key = 0;
				if (mapping) {
					if (ctrlKey && shiftKey && altKey) {
						key = mapping.withShiftAltGr;
					} else if (ctrlKey && altKey) {
						key = mapping.withAltGr;
					} else if (shiftKey) {
						key = mapping.withShift;
					} else {
						key = mapping.value;
					}
				}
				let strKey: string = ' --- ';
				if (key !== 0) {
					if (key >= CharCode.U_Combining_Grave_Accent && key <= CharCode.U_Combining_Latin_Small_Letter_X) {
						// combining
						strKey = 'U+' + key.toString(16);
					} else {
						strKey = '  ' + String.fromCharCode(key) + '  ';
					}
				}

				const strKb = `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${strKeyCode}`;

				result.push(`| ${this._leftPad(strHw, 30)} | ${strKey} | ${this._leftPad(strKb, 25)} | ${this._leftPad(uiHwLabel, 25)} |`);
			}
			result.push(`--------------------------------------------------------------------------------------------------`);
		}


		return result.join('\n');
	}

	private _leftPad(str: string, cnt: number): string {
		while (str.length < cnt) {
			str = ' ' + str;
		}
		return str;
	}

	private static _getCharCode(char: string): number {
		if (char.length === 0) {
			return 0;
		}
		return char.charCodeAt(0);
	}

	public getUILabelForKeyCode(keyCode: KeyCode): string {
		return this._getLabelForKeyCode(keyCode);
	}

	public getAriaLabelForKeyCode(keyCode: KeyCode): string {
		return this._getLabelForKeyCode(keyCode);
	}

	private _getLabelForKeyCode(keyCode: KeyCode): string {
		return this._kbToLabel[keyCode] || KeyCodeUtils.toString(KeyCode.Unknown);
	}

	public resolveKeybinding(keybinding: Keybinding): WindowsNativeResolvedKeybinding[] {
		if (keybinding.type === KeybindingType.Chord) {
			return [new WindowsNativeResolvedKeybinding(this, keybinding.firstPart, keybinding.chordPart)];
		} else {
			return [new WindowsNativeResolvedKeybinding(this, keybinding, null)];
		}
	}
}


// See https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
// See https://github.com/Microsoft/node-native-keymap/blob/master/deps/chromium/keyboard_codes_win.h
function _getNativeMap() {
	return {
		VK_BACK: KeyCode.Backspace,
		VK_TAB: KeyCode.Tab,
		VK_CLEAR: KeyCode.Unknown, // MISSING
		VK_RETURN: KeyCode.Enter,
		VK_SHIFT: KeyCode.Shift,
		VK_CONTROL: KeyCode.Ctrl,
		VK_MENU: KeyCode.Alt,
		VK_PAUSE: KeyCode.PauseBreak,
		VK_CAPITAL: KeyCode.CapsLock,
		VK_KANA: KeyCode.Unknown, // MISSING
		VK_HANGUL: KeyCode.Unknown, // MISSING
		VK_JUNJA: KeyCode.Unknown, // MISSING
		VK_FINAL: KeyCode.Unknown, // MISSING
		VK_HANJA: KeyCode.Unknown, // MISSING
		VK_KANJI: KeyCode.Unknown, // MISSING
		VK_ESCAPE: KeyCode.Escape,
		VK_CONVERT: KeyCode.Unknown, // MISSING
		VK_NONCONVERT: KeyCode.Unknown, // MISSING
		VK_ACCEPT: KeyCode.Unknown, // MISSING
		VK_MODECHANGE: KeyCode.Unknown, // MISSING
		VK_SPACE: KeyCode.Space,
		VK_PRIOR: KeyCode.PageUp,
		VK_NEXT: KeyCode.PageDown,
		VK_END: KeyCode.End,
		VK_HOME: KeyCode.Home,
		VK_LEFT: KeyCode.LeftArrow,
		VK_UP: KeyCode.UpArrow,
		VK_RIGHT: KeyCode.RightArrow,
		VK_DOWN: KeyCode.DownArrow,
		VK_SELECT: KeyCode.Unknown, // MISSING
		VK_PRINT: KeyCode.Unknown, // MISSING
		VK_EXECUTE: KeyCode.Unknown, // MISSING
		VK_SNAPSHOT: KeyCode.Unknown, // MISSING
		VK_INSERT: KeyCode.Insert,
		VK_DELETE: KeyCode.Delete,
		VK_HELP: KeyCode.Unknown, // MISSING

		VK_0: KeyCode.KEY_0,
		VK_1: KeyCode.KEY_1,
		VK_2: KeyCode.KEY_2,
		VK_3: KeyCode.KEY_3,
		VK_4: KeyCode.KEY_4,
		VK_5: KeyCode.KEY_5,
		VK_6: KeyCode.KEY_6,
		VK_7: KeyCode.KEY_7,
		VK_8: KeyCode.KEY_8,
		VK_9: KeyCode.KEY_9,
		VK_A: KeyCode.KEY_A,
		VK_B: KeyCode.KEY_B,
		VK_C: KeyCode.KEY_C,
		VK_D: KeyCode.KEY_D,
		VK_E: KeyCode.KEY_E,
		VK_F: KeyCode.KEY_F,
		VK_G: KeyCode.KEY_G,
		VK_H: KeyCode.KEY_H,
		VK_I: KeyCode.KEY_I,
		VK_J: KeyCode.KEY_J,
		VK_K: KeyCode.KEY_K,
		VK_L: KeyCode.KEY_L,
		VK_M: KeyCode.KEY_M,
		VK_N: KeyCode.KEY_N,
		VK_O: KeyCode.KEY_O,
		VK_P: KeyCode.KEY_P,
		VK_Q: KeyCode.KEY_Q,
		VK_R: KeyCode.KEY_R,
		VK_S: KeyCode.KEY_S,
		VK_T: KeyCode.KEY_T,
		VK_U: KeyCode.KEY_U,
		VK_V: KeyCode.KEY_V,
		VK_W: KeyCode.KEY_W,
		VK_X: KeyCode.KEY_X,
		VK_Y: KeyCode.KEY_Y,
		VK_Z: KeyCode.KEY_Z,

		VK_LWIN: KeyCode.Meta,
		VK_COMMAND: KeyCode.Meta,
		VK_RWIN: KeyCode.Meta,
		VK_APPS: KeyCode.Unknown, // MISSING
		VK_SLEEP: KeyCode.Unknown, // MISSING
		VK_NUMPAD0: KeyCode.NUMPAD_0,
		VK_NUMPAD1: KeyCode.NUMPAD_1,
		VK_NUMPAD2: KeyCode.NUMPAD_2,
		VK_NUMPAD3: KeyCode.NUMPAD_3,
		VK_NUMPAD4: KeyCode.NUMPAD_4,
		VK_NUMPAD5: KeyCode.NUMPAD_5,
		VK_NUMPAD6: KeyCode.NUMPAD_6,
		VK_NUMPAD7: KeyCode.NUMPAD_7,
		VK_NUMPAD8: KeyCode.NUMPAD_8,
		VK_NUMPAD9: KeyCode.NUMPAD_9,
		VK_MULTIPLY: KeyCode.NUMPAD_MULTIPLY,
		VK_ADD: KeyCode.NUMPAD_ADD,
		VK_SEPARATOR: KeyCode.NUMPAD_SEPARATOR,
		VK_SUBTRACT: KeyCode.NUMPAD_SUBTRACT,
		VK_DECIMAL: KeyCode.NUMPAD_DECIMAL,
		VK_DIVIDE: KeyCode.NUMPAD_DIVIDE,
		VK_F1: KeyCode.F1,
		VK_F2: KeyCode.F2,
		VK_F3: KeyCode.F3,
		VK_F4: KeyCode.F4,
		VK_F5: KeyCode.F5,
		VK_F6: KeyCode.F6,
		VK_F7: KeyCode.F7,
		VK_F8: KeyCode.F8,
		VK_F9: KeyCode.F9,
		VK_F10: KeyCode.F10,
		VK_F11: KeyCode.F11,
		VK_F12: KeyCode.F12,
		VK_F13: KeyCode.F13,
		VK_F14: KeyCode.F14,
		VK_F15: KeyCode.F15,
		VK_F16: KeyCode.F16,
		VK_F17: KeyCode.F17,
		VK_F18: KeyCode.F18,
		VK_F19: KeyCode.F19,
		VK_F20: KeyCode.Unknown, // MISSING
		VK_F21: KeyCode.Unknown, // MISSING
		VK_F22: KeyCode.Unknown, // MISSING
		VK_F23: KeyCode.Unknown, // MISSING
		VK_F24: KeyCode.Unknown, // MISSING
		VK_NUMLOCK: KeyCode.NumLock,
		VK_SCROLL: KeyCode.ScrollLock,
		VK_LSHIFT: KeyCode.Shift,
		VK_RSHIFT: KeyCode.Shift,
		VK_LCONTROL: KeyCode.Ctrl,
		VK_RCONTROL: KeyCode.Ctrl,
		VK_LMENU: KeyCode.Unknown, // MISSING
		VK_RMENU: KeyCode.Unknown, // MISSING
		VK_BROWSER_BACK: KeyCode.Unknown, // MISSING
		VK_BROWSER_FORWARD: KeyCode.Unknown, // MISSING
		VK_BROWSER_REFRESH: KeyCode.Unknown, // MISSING
		VK_BROWSER_STOP: KeyCode.Unknown, // MISSING
		VK_BROWSER_SEARCH: KeyCode.Unknown, // MISSING
		VK_BROWSER_FAVORITES: KeyCode.Unknown, // MISSING
		VK_BROWSER_HOME: KeyCode.Unknown, // MISSING
		VK_VOLUME_MUTE: KeyCode.Unknown, // MISSING
		VK_VOLUME_DOWN: KeyCode.Unknown, // MISSING
		VK_VOLUME_UP: KeyCode.Unknown, // MISSING
		VK_MEDIA_NEXT_TRACK: KeyCode.Unknown, // MISSING
		VK_MEDIA_PREV_TRACK: KeyCode.Unknown, // MISSING
		VK_MEDIA_STOP: KeyCode.Unknown, // MISSING
		VK_MEDIA_PLAY_PAUSE: KeyCode.Unknown, // MISSING
		VK_MEDIA_LAUNCH_MAIL: KeyCode.Unknown, // MISSING
		VK_MEDIA_LAUNCH_MEDIA_SELECT: KeyCode.Unknown, // MISSING
		VK_MEDIA_LAUNCH_APP1: KeyCode.Unknown, // MISSING
		VK_MEDIA_LAUNCH_APP2: KeyCode.Unknown, // MISSING
		VK_OEM_1: KeyCode.US_SEMICOLON,
		VK_OEM_PLUS: KeyCode.US_EQUAL,
		VK_OEM_COMMA: KeyCode.US_COMMA,
		VK_OEM_MINUS: KeyCode.US_MINUS,
		VK_OEM_PERIOD: KeyCode.US_DOT,
		VK_OEM_2: KeyCode.US_SLASH,
		VK_OEM_3: KeyCode.US_BACKTICK,
		VK_OEM_4: KeyCode.US_OPEN_SQUARE_BRACKET,
		VK_OEM_5: KeyCode.US_BACKSLASH,
		VK_OEM_6: KeyCode.US_CLOSE_SQUARE_BRACKET,
		VK_OEM_7: KeyCode.US_QUOTE,
		VK_OEM_8: KeyCode.OEM_8,
		VK_OEM_102: KeyCode.OEM_102,
		VK_PROCESSKEY: KeyCode.Unknown, // MISSING
		VK_PACKET: KeyCode.Unknown, // MISSING
		VK_DBE_SBCSCHAR: KeyCode.Unknown, // MISSING
		VK_DBE_DBCSCHAR: KeyCode.Unknown, // MISSING
		VK_ATTN: KeyCode.Unknown, // MISSING
		VK_CRSEL: KeyCode.Unknown, // MISSING
		VK_EXSEL: KeyCode.Unknown, // MISSING
		VK_EREOF: KeyCode.Unknown, // MISSING
		VK_PLAY: KeyCode.Unknown, // MISSING
		VK_ZOOM: KeyCode.Unknown, // MISSING
		VK_NONAME: KeyCode.Unknown, // MISSING
		VK_PA1: KeyCode.Unknown, // MISSING
		VK_OEM_CLEAR: KeyCode.Unknown, // MISSING
		VK_UNKNOWN: KeyCode.Unknown,
	};
}
