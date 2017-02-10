/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// import * as nativeKeymap from 'native-keymap';
import { KeyCode/*, KeyCodeUtils*/ } from 'vs/base/common/keyCodes';
import { CharCode } from 'vs/base/common/charCode';
import { IKeyBindingLabelProvider, MacUIKeyLabelProvider, ClassicUIKeyLabelProvider, AriaKeyLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
// import { lookupKeyCode, setExtractKeyCode } from 'vs/base/browser/keyboardEvent';
import Platform = require('vs/base/common/platform');

// console.log(nativeKeymap.getKeyMap());
getCodeInt('None');
getCodeStr(0);

// export interface ILinuxKeyMap {
// 	[code: string]: {
// 		value: string;
// 		withAltGr: string;
// 		withShift: string;
// 		withShiftAltGr: string;
// 	};
// }

// if (Platform.isLinux) {
// 	let map = <ILinuxKeyMap><any>nativeKeymap.getKeyMap();

// }

// function eatShift(notShifted:boolean): string {

// 	function d2(keyCode: KeyCode, value: string, withShift: string): void {

// 	}

// 	d2(KeyCode.KEY_0, '0', ')');
// 	d2(KeyCode.KEY_1, '1', '!');
// 	d2(KeyCode.KEY_2, '2', '@');
// 	d2(KeyCode.KEY_3, '3', '#');
// 	d2(KeyCode.KEY_4, '4', '$');
// 	d2(KeyCode.KEY_5, '5', '%');
// 	d2(KeyCode.KEY_6, '6', '^');
// 	d2(KeyCode.KEY_7, '7', '&');
// 	d2(KeyCode.KEY_8, '8', '*');
// 	d2(KeyCode.KEY_9, '9', '(');

// 	d2(KeyCode.KEY_A, 'a', 'A');
// 	d2(KeyCode.KEY_B, 'b', 'B');
// 	d2(KeyCode.KEY_C, 'c', 'C');
// 	d2(KeyCode.KEY_D, 'd', 'D');
// 	d2(KeyCode.KEY_E, 'e', 'E');
// 	d2(KeyCode.KEY_F, 'f', 'F');
// 	d2(KeyCode.KEY_G, 'g', 'G');
// 	d2(KeyCode.KEY_H, 'h', 'H');
// 	d2(KeyCode.KEY_I, 'i', 'I');
// 	d2(KeyCode.KEY_J, 'j', 'J');
// 	d2(KeyCode.KEY_K, 'k', 'K');
// 	d2(KeyCode.KEY_L, 'l', 'L');
// 	d2(KeyCode.KEY_M, 'm', 'M');
// 	d2(KeyCode.KEY_N, 'n', 'N');
// 	d2(KeyCode.KEY_O, 'o', 'O');
// 	d2(KeyCode.KEY_P, 'p', 'P');
// 	d2(KeyCode.KEY_Q, 'q', 'Q');
// 	d2(KeyCode.KEY_R, 'r', 'R');
// 	d2(KeyCode.KEY_S, 's', 'S');
// 	d2(KeyCode.KEY_T, 't', 'T');
// 	d2(KeyCode.KEY_U, 'u', 'U');
// 	d2(KeyCode.KEY_V, 'v', 'V');
// 	d2(KeyCode.KEY_W, 'w', 'W');
// 	d2(KeyCode.KEY_X, 'x', 'X');
// 	d2(KeyCode.KEY_Y, 'y', 'Y');
// 	d2(KeyCode.KEY_Z, 'z', 'Z');
// 	d2(KeyCode.US_SEMICOLON, ';', ':');
// 	d2(KeyCode.US_EQUAL, '=', '+');
// 	d2(KeyCode.US_COMMA, ',', '<');
// 	d2(KeyCode.US_MINUS, '-', '_');
// 	d2(KeyCode.US_DOT, '.', '>');
// 	d2(KeyCode.US_SLASH, '/', '?');
// 	d2(KeyCode.US_BACKTICK, '`', '~');
// 	d2(KeyCode.US_OPEN_SQUARE_BRACKET, '[', '{');
// 	d2(KeyCode.US_BACKSLASH, '\\', '|');
// 	d2(KeyCode.US_CLOSE_SQUARE_BRACKET, ']', '}');
// 	d2(KeyCode.US_QUOTE, '\'', '"');

// 	// TODO@keyboard
// 	// d2(KeyCode.OEM_8, '', '');
// 	// TODO@keyboard
// 	// d2(KeyCode.OEM_102, '', '');
// }

// let getNativeKeymap = (function () {
// 	let called = false;
// 	let result: nativeKeymap.INativeKeyMap[];

// 	return function getNativeKeymap() {
// 		if (!called) {
// 			called = true;
// 			result = nativeKeymap.getKeyMap();
// 		}
// 		return result;
// 	};
// })();

// // See https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
// // See https://github.com/Microsoft/node-native-keymap/blob/master/deps/chromium/keyboard_codes_win.h
// const NATIVE_KEY_CODE_TO_KEY_CODE: { [nativeKeyCode: string]: KeyCode; } = {
// 	VKEY_BACK: KeyCode.Backspace,
// 	VKEY_TAB: KeyCode.Tab,
// 	VKEY_CLEAR: KeyCode.Unknown, // MISSING
// 	VKEY_RETURN: KeyCode.Enter,
// 	VKEY_SHIFT: KeyCode.Shift,
// 	VKEY_CONTROL: KeyCode.Ctrl,
// 	VKEY_MENU: KeyCode.Alt,
// 	VKEY_PAUSE: KeyCode.PauseBreak,
// 	VKEY_CAPITAL: KeyCode.CapsLock,
// 	VKEY_KANA: KeyCode.Unknown, // MISSING
// 	VKEY_HANGUL: KeyCode.Unknown, // MISSING
// 	VKEY_JUNJA: KeyCode.Unknown, // MISSING
// 	VKEY_FINAL: KeyCode.Unknown, // MISSING
// 	VKEY_HANJA: KeyCode.Unknown, // MISSING
// 	VKEY_KANJI: KeyCode.Unknown, // MISSING
// 	VKEY_ESCAPE: KeyCode.Escape,
// 	VKEY_CONVERT: KeyCode.Unknown, // MISSING
// 	VKEY_NONCONVERT: KeyCode.Unknown, // MISSING
// 	VKEY_ACCEPT: KeyCode.Unknown, // MISSING
// 	VKEY_MODECHANGE: KeyCode.Unknown, // MISSING
// 	VKEY_SPACE: KeyCode.Space,
// 	VKEY_PRIOR: KeyCode.PageUp,
// 	VKEY_NEXT: KeyCode.PageDown,
// 	VKEY_END: KeyCode.End,
// 	VKEY_HOME: KeyCode.Home,
// 	VKEY_LEFT: KeyCode.LeftArrow,
// 	VKEY_UP: KeyCode.UpArrow,
// 	VKEY_RIGHT: KeyCode.RightArrow,
// 	VKEY_DOWN: KeyCode.DownArrow,
// 	VKEY_SELECT: KeyCode.Unknown, // MISSING
// 	VKEY_PRINT: KeyCode.Unknown, // MISSING
// 	VKEY_EXECUTE: KeyCode.Unknown, // MISSING
// 	VKEY_SNAPSHOT: KeyCode.Unknown, // MISSING
// 	VKEY_INSERT: KeyCode.Insert,
// 	VKEY_DELETE: KeyCode.Delete,
// 	VKEY_HELP: KeyCode.Unknown, // MISSING
// 	VKEY_0: KeyCode.KEY_0,
// 	VKEY_1: KeyCode.KEY_1,
// 	VKEY_2: KeyCode.KEY_2,
// 	VKEY_3: KeyCode.KEY_3,
// 	VKEY_4: KeyCode.KEY_4,
// 	VKEY_5: KeyCode.KEY_5,
// 	VKEY_6: KeyCode.KEY_6,
// 	VKEY_7: KeyCode.KEY_7,
// 	VKEY_8: KeyCode.KEY_8,
// 	VKEY_9: KeyCode.KEY_9,
// 	VKEY_A: KeyCode.KEY_A,
// 	VKEY_B: KeyCode.KEY_B,
// 	VKEY_C: KeyCode.KEY_C,
// 	VKEY_D: KeyCode.KEY_D,
// 	VKEY_E: KeyCode.KEY_E,
// 	VKEY_F: KeyCode.KEY_F,
// 	VKEY_G: KeyCode.KEY_G,
// 	VKEY_H: KeyCode.KEY_H,
// 	VKEY_I: KeyCode.KEY_I,
// 	VKEY_J: KeyCode.KEY_J,
// 	VKEY_K: KeyCode.KEY_K,
// 	VKEY_L: KeyCode.KEY_L,
// 	VKEY_M: KeyCode.KEY_M,
// 	VKEY_N: KeyCode.KEY_N,
// 	VKEY_O: KeyCode.KEY_O,
// 	VKEY_P: KeyCode.KEY_P,
// 	VKEY_Q: KeyCode.KEY_Q,
// 	VKEY_R: KeyCode.KEY_R,
// 	VKEY_S: KeyCode.KEY_S,
// 	VKEY_T: KeyCode.KEY_T,
// 	VKEY_U: KeyCode.KEY_U,
// 	VKEY_V: KeyCode.KEY_V,
// 	VKEY_W: KeyCode.KEY_W,
// 	VKEY_X: KeyCode.KEY_X,
// 	VKEY_Y: KeyCode.KEY_Y,
// 	VKEY_Z: KeyCode.KEY_Z,
// 	VKEY_LWIN: KeyCode.Meta,
// 	VKEY_COMMAND: KeyCode.Meta,
// 	VKEY_RWIN: KeyCode.Meta,
// 	VKEY_APPS: KeyCode.Unknown, // MISSING
// 	VKEY_SLEEP: KeyCode.Unknown, // MISSING
// 	VKEY_NUMPAD0: KeyCode.NUMPAD_0,
// 	VKEY_NUMPAD1: KeyCode.NUMPAD_1,
// 	VKEY_NUMPAD2: KeyCode.NUMPAD_2,
// 	VKEY_NUMPAD3: KeyCode.NUMPAD_3,
// 	VKEY_NUMPAD4: KeyCode.NUMPAD_4,
// 	VKEY_NUMPAD5: KeyCode.NUMPAD_5,
// 	VKEY_NUMPAD6: KeyCode.NUMPAD_6,
// 	VKEY_NUMPAD7: KeyCode.NUMPAD_7,
// 	VKEY_NUMPAD8: KeyCode.NUMPAD_8,
// 	VKEY_NUMPAD9: KeyCode.NUMPAD_9,
// 	VKEY_MULTIPLY: KeyCode.NUMPAD_MULTIPLY,
// 	VKEY_ADD: KeyCode.NUMPAD_ADD,
// 	VKEY_SEPARATOR: KeyCode.NUMPAD_SEPARATOR,
// 	VKEY_SUBTRACT: KeyCode.NUMPAD_SUBTRACT,
// 	VKEY_DECIMAL: KeyCode.NUMPAD_DECIMAL,
// 	VKEY_DIVIDE: KeyCode.NUMPAD_DIVIDE,
// 	VKEY_F1: KeyCode.F1,
// 	VKEY_F2: KeyCode.F2,
// 	VKEY_F3: KeyCode.F3,
// 	VKEY_F4: KeyCode.F4,
// 	VKEY_F5: KeyCode.F5,
// 	VKEY_F6: KeyCode.F6,
// 	VKEY_F7: KeyCode.F7,
// 	VKEY_F8: KeyCode.F8,
// 	VKEY_F9: KeyCode.F9,
// 	VKEY_F10: KeyCode.F10,
// 	VKEY_F11: KeyCode.F11,
// 	VKEY_F12: KeyCode.F12,
// 	VKEY_F13: KeyCode.F13,
// 	VKEY_F14: KeyCode.F14,
// 	VKEY_F15: KeyCode.F15,
// 	VKEY_F16: KeyCode.F16,
// 	VKEY_F17: KeyCode.F17,
// 	VKEY_F18: KeyCode.F18,
// 	VKEY_F19: KeyCode.F19,
// 	VKEY_F20: KeyCode.Unknown, // MISSING
// 	VKEY_F21: KeyCode.Unknown, // MISSING
// 	VKEY_F22: KeyCode.Unknown, // MISSING
// 	VKEY_F23: KeyCode.Unknown, // MISSING
// 	VKEY_F24: KeyCode.Unknown, // MISSING
// 	VKEY_NUMLOCK: KeyCode.NumLock,
// 	VKEY_SCROLL: KeyCode.ScrollLock,
// 	VKEY_LSHIFT: KeyCode.Shift,
// 	VKEY_RSHIFT: KeyCode.Shift,
// 	VKEY_LCONTROL: KeyCode.Ctrl,
// 	VKEY_RCONTROL: KeyCode.Ctrl,
// 	VKEY_LMENU: KeyCode.Unknown, // MISSING
// 	VKEY_RMENU: KeyCode.Unknown, // MISSING
// 	VKEY_BROWSER_BACK: KeyCode.Unknown, // MISSING
// 	VKEY_BROWSER_FORWARD: KeyCode.Unknown, // MISSING
// 	VKEY_BROWSER_REFRESH: KeyCode.Unknown, // MISSING
// 	VKEY_BROWSER_STOP: KeyCode.Unknown, // MISSING
// 	VKEY_BROWSER_SEARCH: KeyCode.Unknown, // MISSING
// 	VKEY_BROWSER_FAVORITES: KeyCode.Unknown, // MISSING
// 	VKEY_BROWSER_HOME: KeyCode.Unknown, // MISSING
// 	VKEY_VOLUME_MUTE: KeyCode.Unknown, // MISSING
// 	VKEY_VOLUME_DOWN: KeyCode.Unknown, // MISSING
// 	VKEY_VOLUME_UP: KeyCode.Unknown, // MISSING
// 	VKEY_MEDIA_NEXT_TRACK: KeyCode.Unknown, // MISSING
// 	VKEY_MEDIA_PREV_TRACK: KeyCode.Unknown, // MISSING
// 	VKEY_MEDIA_STOP: KeyCode.Unknown, // MISSING
// 	VKEY_MEDIA_PLAY_PAUSE: KeyCode.Unknown, // MISSING
// 	VKEY_MEDIA_LAUNCH_MAIL: KeyCode.Unknown, // MISSING
// 	VKEY_MEDIA_LAUNCH_MEDIA_SELECT: KeyCode.Unknown, // MISSING
// 	VKEY_MEDIA_LAUNCH_APP1: KeyCode.Unknown, // MISSING
// 	VKEY_MEDIA_LAUNCH_APP2: KeyCode.Unknown, // MISSING
// 	VKEY_OEM_1: KeyCode.US_SEMICOLON,
// 	VKEY_OEM_PLUS: KeyCode.US_EQUAL,
// 	VKEY_OEM_COMMA: KeyCode.US_COMMA,
// 	VKEY_OEM_MINUS: KeyCode.US_MINUS,
// 	VKEY_OEM_PERIOD: KeyCode.US_DOT,
// 	VKEY_OEM_2: KeyCode.US_SLASH,
// 	VKEY_OEM_3: KeyCode.US_BACKTICK,
// 	VKEY_OEM_4: KeyCode.US_OPEN_SQUARE_BRACKET,
// 	VKEY_OEM_5: KeyCode.US_BACKSLASH,
// 	VKEY_OEM_6: KeyCode.US_CLOSE_SQUARE_BRACKET,
// 	VKEY_OEM_7: KeyCode.US_QUOTE,
// 	VKEY_OEM_8: KeyCode.OEM_8,
// 	VKEY_OEM_102: KeyCode.OEM_102,
// 	VKEY_PROCESSKEY: KeyCode.Unknown, // MISSING
// 	VKEY_PACKET: KeyCode.Unknown, // MISSING
// 	VKEY_DBE_SBCSCHAR: KeyCode.Unknown, // MISSING
// 	VKEY_DBE_DBCSCHAR: KeyCode.Unknown, // MISSING
// 	VKEY_ATTN: KeyCode.Unknown, // MISSING
// 	VKEY_CRSEL: KeyCode.Unknown, // MISSING
// 	VKEY_EXSEL: KeyCode.Unknown, // MISSING
// 	VKEY_EREOF: KeyCode.Unknown, // MISSING
// 	VKEY_PLAY: KeyCode.Unknown, // MISSING
// 	VKEY_ZOOM: KeyCode.Unknown, // MISSING
// 	VKEY_NONAME: KeyCode.Unknown, // MISSING
// 	VKEY_PA1: KeyCode.Unknown, // MISSING
// 	VKEY_OEM_CLEAR: KeyCode.Unknown, // MISSING
// 	VKEY_UNKNOWN: KeyCode.Unknown,

// 	// Windows does not have a specific key code for AltGr. We use the unused
// 	// VK_OEM_AX to represent AltGr, matching the behaviour of Firefox on Linux.
// 	VKEY_ALTGR: KeyCode.Unknown, // MISSING
// };

// // See http://www.w3.org/TR/DOM-Level-3-Events/#h-optionally-fixed-virtual-key-codes
// // See issue #1302: Chromium has implemented section B.2.4 of DOM Level 3 Events on mac
// // This is bad news because we cannot trust the event's keyCode to be the actual pressed key.
// // Here we try to find out the actual pressed key by "undoing" their massaging

// // Key                       Character         Virtual Key Code
// // Semicolon                 ';'	                  186
// // Colon                     ':'                      186
// // Equals sign               '='                      187
// // Plus                      '+'                      187
// // Comma                     ','                      188
// // Less than sign            '<'                      188
// // Minus                     '-'                      189
// // Underscore                '_'                      189
// // Period                    '.'                      190
// // Greater than sign         '>'                      190
// // Forward slash             '/'                      191
// // Question mark             '?'                      191
// // Backtick                  '`'                      192
// // Tilde                     '~'                      192
// // Opening square bracket    '['                      219
// // Opening curly brace       '{'                      219
// // Backslash                 '\'                      220
// // Pipe                      '|'                      220
// // Closing square bracket    ']'                      221
// // Closing curly brace       '}'                      221
// // Single quote              '''                      222
// // Double quote              '"'                      222

// interface IFixedVirtualKeyCodeElement {
// 	char: string;
// 	virtualKeyCode: number;
// }

// let _b24_fixedVirtualKeyCodes: IFixedVirtualKeyCodeElement[] = [
// 	{ char: ';', virtualKeyCode: 186 },
// 	{ char: ':', virtualKeyCode: 186 },
// 	{ char: '=', virtualKeyCode: 187 },
// 	{ char: '+', virtualKeyCode: 187 },
// 	{ char: ',', virtualKeyCode: 188 },
// 	{ char: '<', virtualKeyCode: 188 },
// 	{ char: '-', virtualKeyCode: 189 },
// 	{ char: '_', virtualKeyCode: 189 },
// 	{ char: '.', virtualKeyCode: 190 },
// 	{ char: '>', virtualKeyCode: 190 },
// 	{ char: '/', virtualKeyCode: 191 },
// 	{ char: '?', virtualKeyCode: 191 },
// 	{ char: '`', virtualKeyCode: 192 },
// 	{ char: '~', virtualKeyCode: 192 },
// 	{ char: '[', virtualKeyCode: 219 },
// 	{ char: '{', virtualKeyCode: 219 },
// 	{ char: '\\', virtualKeyCode: 220 },
// 	{ char: '|', virtualKeyCode: 220 },
// 	{ char: ']', virtualKeyCode: 221 },
// 	{ char: '}', virtualKeyCode: 221 },
// 	{ char: '\'', virtualKeyCode: 222 },
// 	{ char: '"', virtualKeyCode: 222 },
// ];
// let _b24_interestingChars: { [char: string]: boolean; } = Object.create(null);
// _b24_fixedVirtualKeyCodes.forEach(el => _b24_interestingChars[el.char] = true);

// let _b24_interestingVirtualKeyCodes: { [virtualKeyCode: number]: boolean; } = Object.create(null);
// _b24_fixedVirtualKeyCodes.forEach(el => _b24_interestingVirtualKeyCodes[el.virtualKeyCode] = true);

// interface IUnfixedVirtualKeyCodeMap {
// 	[char: string]: KeyCode;
// }
// let _b24_getActualKeyCodeMap = (function () {
// 	let result: IUnfixedVirtualKeyCodeMap = null;
// 	return function () {
// 		if (!result) {
// 			result = Object.create(null);

// 			let nativeMappings = getNativeKeymap();

// 			for (let i = 0, len = nativeMappings.length; i < len; i++) {
// 				let nativeMapping = nativeMappings[i];

// 				if (nativeMapping.value && _b24_interestingChars[nativeMapping.value]) {
// 					// console.log(nativeMapping.value + " is made by " + nativeMapping.key_code);
// 					let keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[nativeMapping.key_code];
// 					if (keyCode) {
// 						if (!result[nativeMapping.value] || result[nativeMapping.value] > keyCode) {
// 							result[nativeMapping.value] = keyCode;
// 						}
// 					}
// 				}

// 				if (nativeMapping.withShift && _b24_interestingChars[nativeMapping.withShift]) {
// 					// console.log(nativeMapping.withShift + " is made by " + nativeMapping.key_code);
// 					let keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[nativeMapping.key_code];
// 					if (keyCode) {
// 						if (!result[nativeMapping.withShift] || result[nativeMapping.withShift] > keyCode) {
// 							result[nativeMapping.withShift] = keyCode;
// 						}
// 					}
// 				}
// 			}
// 		}
// 		return result;
// 	};
// })();

// setExtractKeyCode((e: KeyboardEvent) => {
// 	if (e.charCode) {
// 		// "keypress" events mostly
// 		let char = String.fromCharCode(e.charCode).toUpperCase();
// 		return KeyCodeUtils.fromString(char);
// 	}

// 	if (Platform.isMacintosh && _b24_interestingVirtualKeyCodes[e.keyCode] && typeof (<any>e).keyIdentifier === 'string') {
// 		let keyIdentifier: string = (<any>e).keyIdentifier;
// 		let strCharCode = keyIdentifier.substr(2);
// 		try {
// 			let charCode = parseInt(strCharCode, 16);
// 			let char = String.fromCharCode(charCode);
// 			let unfixMap = _b24_getActualKeyCodeMap();
// 			if (unfixMap[char]) {
// 				return unfixMap[char];
// 			}
// 			// console.log(keyIdentifier + ' => ' + char);
// 		} catch (err) {
// 		}
// 	}
// 	// _b24_getActualKeyCodeMap();
// 	// console.log('injected!!!');

// 	return lookupKeyCode(e);
// });

let nativeAriaLabelProvider: IKeyBindingLabelProvider = null;
export function getNativeAriaLabelProvider(): IKeyBindingLabelProvider {
	if (!nativeAriaLabelProvider) {
		let remaps = getNativeLabelProviderRemaps();
		nativeAriaLabelProvider = new NativeAriaKeyLabelProvider(remaps);
	}
	return nativeAriaLabelProvider;
}

let nativeLabelProvider: IKeyBindingLabelProvider = null;
export function getNativeLabelProvider(): IKeyBindingLabelProvider {
	if (!nativeLabelProvider) {
		let remaps = getNativeLabelProviderRemaps();

		if (Platform.isMacintosh) {
			nativeLabelProvider = new NativeMacUIKeyLabelProvider(remaps);
		} else {
			nativeLabelProvider = new NativeClassicUIKeyLabelProvider(remaps);
		}
	}
	return nativeLabelProvider;
}

class NativeLabel {

	public static Empty = new NativeLabel('', '', '', '');

	private readonly _rendered: string;

	constructor(value: string, withShift: string, withAltGr: string, withShiftAltGr: string) {
		this._rendered = value || withShift;
		this._rendered = NativeLabel._massageRenderedKey(this._rendered);
	}

	/**
	 * Very often, keyboards generate combining diacritical marks
	 * They reside in the range 0300..036F
	 * See ftp://ftp.unicode.org/Public/UNIDATA/Blocks.txt
	 * See https://en.wikipedia.org/wiki/Combining_Diacritical_Marks
	 */
	private static _massageRenderedKey(str: string): string {
		if (str.length !== 1) {
			return str;
		}

		return String.fromCharCode(this._combiningToRegular(str.charCodeAt(0)));
	}

	/**
	 * Attempt to map a combining character to a regular one that renders the same way.
	 *
	 * To the brave person following me: Good Luck!
	 * https://www.compart.com/en/unicode/bidiclass/NSM
	 */
	private static _combiningToRegular(charCode: number): number {
		switch (charCode) {
			case CharCode.U_Combining_Grave_Accent: return CharCode.U_GRAVE_ACCENT;
			case CharCode.U_Combining_Acute_Accent: return CharCode.U_ACUTE_ACCENT;
			case CharCode.U_Combining_Circumflex_Accent: return CharCode.U_CIRCUMFLEX;
			case CharCode.U_Combining_Tilde: return CharCode.U_SMALL_TILDE;
			case CharCode.U_Combining_Macron: return CharCode.U_MACRON;
			case CharCode.U_Combining_Overline: return CharCode.U_OVERLINE;
			case CharCode.U_Combining_Breve: return CharCode.U_BREVE;
			case CharCode.U_Combining_Dot_Above: return CharCode.U_DOT_ABOVE;
			case CharCode.U_Combining_Diaeresis: return CharCode.U_DIAERESIS;
			case CharCode.U_Combining_Ring_Above: return CharCode.U_RING_ABOVE;
			case CharCode.U_Combining_Double_Acute_Accent: return CharCode.U_DOUBLE_ACUTE_ACCENT;
		}
		return charCode;
	}

	public render(): string {
		return this._rendered;
	}
}

let nativeLabelRemaps: NativeLabel[] = null;
function getNativeLabelProviderRemaps(): NativeLabel[] {
	if (!nativeLabelRemaps) {
		// // See https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
		// // See https://github.com/Microsoft/node-native-keymap/blob/master/deps/chromium/keyboard_codes_win.h
		// let interestingKeyCodes: { [vkeyCode: string]: boolean; } = {
		// 	VKEY_OEM_1: true,
		// 	VKEY_OEM_PLUS: true,
		// 	VKEY_OEM_COMMA: true,
		// 	VKEY_OEM_MINUS: true,
		// 	VKEY_OEM_PERIOD: true,
		// 	VKEY_OEM_2: true,
		// 	VKEY_OEM_3: true,
		// 	VKEY_OEM_4: true,
		// 	VKEY_OEM_5: true,
		// 	VKEY_OEM_6: true,
		// 	VKEY_OEM_7: true,
		// 	VKEY_OEM_8: true,
		// 	VKEY_OEM_102: true,
		// };

		nativeLabelRemaps = [];
		for (let i = 0, len = KeyCode.MAX_VALUE; i < len; i++) {
			nativeLabelRemaps[i] = null;
		}

		// let nativeMappings = getNativeKeymap();
		// let hadRemap = false;
		// for (let i = 0, len = nativeMappings.length; i < len; i++) {
		// 	let nativeMapping = nativeMappings[i];

		// 	if (interestingKeyCodes[nativeMapping.key_code]) {
		// 		if (nativeMapping.value.length > 0 || nativeMapping.withShift.length > 0) {
		// 			hadRemap = true;
		// 			nativeLabelRemaps[NATIVE_KEY_CODE_TO_KEY_CODE[nativeMapping.key_code]] = new NativeLabel(
		// 				nativeMapping.value,
		// 				nativeMapping.withShift,
		// 				nativeMapping.withAltGr,
		// 				nativeMapping.withShiftAltGr
		// 			);
		// 		}
		// 	}
		// }

		// if (hadRemap) {
		// 	for (let interestingKeyCode in interestingKeyCodes) {
		// 		if (interestingKeyCodes.hasOwnProperty(interestingKeyCode)) {
		// 			let keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[interestingKeyCode];
		// 			nativeLabelRemaps[keyCode] = nativeLabelRemaps[keyCode] || NativeLabel.Empty;
		// 		}
		// 	}
		// }
	}
	return nativeLabelRemaps;

}

class NativeMacUIKeyLabelProvider extends MacUIKeyLabelProvider {
	constructor(private remaps: NativeLabel[]) {
		super();
	}

	public getLabelForKey(keyCode: KeyCode): string {
		if (this.remaps[keyCode] !== null) {
			return this.remaps[keyCode].render();
		}
		return super.getLabelForKey(keyCode);
	}
}

class NativeClassicUIKeyLabelProvider extends ClassicUIKeyLabelProvider {
	constructor(private remaps: NativeLabel[]) {
		super();
	}

	public getLabelForKey(keyCode: KeyCode): string {
		if (this.remaps[keyCode] !== null) {
			return this.remaps[keyCode].render();
		}
		return super.getLabelForKey(keyCode);
	}
}

class NativeAriaKeyLabelProvider extends AriaKeyLabelProvider {
	constructor(private remaps: NativeLabel[]) {
		super();
	}

	public getLabelForKey(keyCode: KeyCode): string {
		if (this.remaps[keyCode] !== null) {
			return this.remaps[keyCode].render();
		}
		return super.getLabelForKey(keyCode);
	}
}

const codeIntToStr: string[] = [];
const codeStrToInt: { [code: string]: number; } = Object.create(null);

function getCodeInt(code: string): Code {
	return codeStrToInt[code] || Code.None;
}

function getCodeStr(code: Code): string {
	return codeIntToStr[code] || 'None';
}

function d(int: Code, str: string): void {
	codeIntToStr[int] = str;
	codeStrToInt[str] = int;
}
(function () {
	d(Code.None, 'None');
	d(Code.Hyper, 'Hyper');
	d(Code.Super, 'Super');
	d(Code.Fn, 'Fn');
	d(Code.FnLock, 'FnLock');
	d(Code.Suspend, 'Suspend');
	d(Code.Resume, 'Resume');
	d(Code.Turbo, 'Turbo');
	d(Code.Sleep, 'Sleep');
	d(Code.WakeUp, 'WakeUp');
	d(Code.KeyA, 'KeyA');
	d(Code.KeyB, 'KeyB');
	d(Code.KeyC, 'KeyC');
	d(Code.KeyD, 'KeyD');
	d(Code.KeyE, 'KeyE');
	d(Code.KeyF, 'KeyF');
	d(Code.KeyG, 'KeyG');
	d(Code.KeyH, 'KeyH');
	d(Code.KeyI, 'KeyI');
	d(Code.KeyJ, 'KeyJ');
	d(Code.KeyK, 'KeyK');
	d(Code.KeyL, 'KeyL');
	d(Code.KeyM, 'KeyM');
	d(Code.KeyN, 'KeyN');
	d(Code.KeyO, 'KeyO');
	d(Code.KeyP, 'KeyP');
	d(Code.KeyQ, 'KeyQ');
	d(Code.KeyR, 'KeyR');
	d(Code.KeyS, 'KeyS');
	d(Code.KeyT, 'KeyT');
	d(Code.KeyU, 'KeyU');
	d(Code.KeyV, 'KeyV');
	d(Code.KeyW, 'KeyW');
	d(Code.KeyX, 'KeyX');
	d(Code.KeyY, 'KeyY');
	d(Code.KeyZ, 'KeyZ');
	d(Code.Digit1, 'Digit1');
	d(Code.Digit2, 'Digit2');
	d(Code.Digit3, 'Digit3');
	d(Code.Digit4, 'Digit4');
	d(Code.Digit5, 'Digit5');
	d(Code.Digit6, 'Digit6');
	d(Code.Digit7, 'Digit7');
	d(Code.Digit8, 'Digit8');
	d(Code.Digit9, 'Digit9');
	d(Code.Digit0, 'Digit0');
	d(Code.Enter, 'Enter');
	d(Code.Escape, 'Escape');
	d(Code.Backspace, 'Backspace');
	d(Code.Tab, 'Tab');
	d(Code.Space, 'Space');
	d(Code.Minus, 'Minus');
	d(Code.Equal, 'Equal');
	d(Code.BracketLeft, 'BracketLeft');
	d(Code.BracketRight, 'BracketRight');
	d(Code.Backslash, 'Backslash');
	d(Code.IntlHash, 'IntlHash');
	d(Code.Semicolon, 'Semicolon');
	d(Code.Quote, 'Quote');
	d(Code.Backquote, 'Backquote');
	d(Code.Comma, 'Comma');
	d(Code.Period, 'Period');
	d(Code.Slash, 'Slash');
	d(Code.CapsLock, 'CapsLock');
	d(Code.F1, 'F1');
	d(Code.F2, 'F2');
	d(Code.F3, 'F3');
	d(Code.F4, 'F4');
	d(Code.F5, 'F5');
	d(Code.F6, 'F6');
	d(Code.F7, 'F7');
	d(Code.F8, 'F8');
	d(Code.F9, 'F9');
	d(Code.F10, 'F10');
	d(Code.F11, 'F11');
	d(Code.F12, 'F12');
	d(Code.PrintScreen, 'PrintScreen');
	d(Code.ScrollLock, 'ScrollLock');
	d(Code.Pause, 'Pause');
	d(Code.Insert, 'Insert');
	d(Code.Home, 'Home');
	d(Code.PageUp, 'PageUp');
	d(Code.Delete, 'Delete');
	d(Code.End, 'End');
	d(Code.PageDown, 'PageDown');
	d(Code.ArrowRight, 'ArrowRight');
	d(Code.ArrowLeft, 'ArrowLeft');
	d(Code.ArrowDown, 'ArrowDown');
	d(Code.ArrowUp, 'ArrowUp');
	d(Code.NumLock, 'NumLock');
	d(Code.NumpadDivide, 'NumpadDivide');
	d(Code.NumpadMultiply, 'NumpadMultiply');
	d(Code.NumpadSubtract, 'NumpadSubtract');
	d(Code.NumpadAdd, 'NumpadAdd');
	d(Code.NumpadEnter, 'NumpadEnter');
	d(Code.Numpad1, 'Numpad1');
	d(Code.Numpad2, 'Numpad2');
	d(Code.Numpad3, 'Numpad3');
	d(Code.Numpad4, 'Numpad4');
	d(Code.Numpad5, 'Numpad5');
	d(Code.Numpad6, 'Numpad6');
	d(Code.Numpad7, 'Numpad7');
	d(Code.Numpad8, 'Numpad8');
	d(Code.Numpad9, 'Numpad9');
	d(Code.Numpad0, 'Numpad0');
	d(Code.NumpadDecimal, 'NumpadDecimal');
	d(Code.IntlBackslash, 'IntlBackslash');
	d(Code.ContextMenu, 'ContextMenu');
	d(Code.Power, 'Power');
	d(Code.NumpadEqual, 'NumpadEqual');
	d(Code.F13, 'F13');
	d(Code.F14, 'F14');
	d(Code.F15, 'F15');
	d(Code.F16, 'F16');
	d(Code.F17, 'F17');
	d(Code.F18, 'F18');
	d(Code.F19, 'F19');
	d(Code.F20, 'F20');
	d(Code.F21, 'F21');
	d(Code.F22, 'F22');
	d(Code.F23, 'F23');
	d(Code.F24, 'F24');
	d(Code.Open, 'Open');
	d(Code.Help, 'Help');
	d(Code.Select, 'Select');
	d(Code.Again, 'Again');
	d(Code.Undo, 'Undo');
	d(Code.Cut, 'Cut');
	d(Code.Copy, 'Copy');
	d(Code.Paste, 'Paste');
	d(Code.Find, 'Find');
	d(Code.AudioVolumeMute, 'AudioVolumeMute');
	d(Code.AudioVolumeUp, 'AudioVolumeUp');
	d(Code.AudioVolumeDown, 'AudioVolumeDown');
	d(Code.NumpadComma, 'NumpadComma');
	d(Code.IntlRo, 'IntlRo');
	d(Code.KanaMode, 'KanaMode');
	d(Code.IntlYen, 'IntlYen');
	d(Code.Convert, 'Convert');
	d(Code.NonConvert, 'NonConvert');
	d(Code.Lang1, 'Lang1');
	d(Code.Lang2, 'Lang2');
	d(Code.Lang3, 'Lang3');
	d(Code.Lang4, 'Lang4');
	d(Code.Lang5, 'Lang5');
	d(Code.Abort, 'Abort');
	d(Code.Props, 'Props');
	d(Code.NumpadParenLeft, 'NumpadParenLeft');
	d(Code.NumpadParenRight, 'NumpadParenRight');
	d(Code.NumpadBackspace, 'NumpadBackspace');
	d(Code.NumpadMemoryStore, 'NumpadMemoryStore');
	d(Code.NumpadMemoryRecall, 'NumpadMemoryRecall');
	d(Code.NumpadMemoryClear, 'NumpadMemoryClear');
	d(Code.NumpadMemoryAdd, 'NumpadMemoryAdd');
	d(Code.NumpadMemorySubtract, 'NumpadMemorySubtract');
	d(Code.NumpadClear, 'NumpadClear');
	d(Code.NumpadClearEntry, 'NumpadClearEntry');
	d(Code.ControlLeft, 'ControlLeft');
	d(Code.ShiftLeft, 'ShiftLeft');
	d(Code.AltLeft, 'AltLeft');
	d(Code.MetaLeft, 'MetaLeft');
	d(Code.ControlRight, 'ControlRight');
	d(Code.ShiftRight, 'ShiftRight');
	d(Code.AltRight, 'AltRight');
	d(Code.MetaRight, 'MetaRight');
	d(Code.BrightnessUp, 'BrightnessUp');
	d(Code.BrightnessDown, 'BrightnessDown');
	d(Code.MediaPlay, 'MediaPlay');
	d(Code.MediaRecord, 'MediaRecord');
	d(Code.MediaFastForward, 'MediaFastForward');
	d(Code.MediaRewind, 'MediaRewind');
	d(Code.MediaTrackNext, 'MediaTrackNext');
	d(Code.MediaTrackPrevious, 'MediaTrackPrevious');
	d(Code.MediaStop, 'MediaStop');
	d(Code.Eject, 'Eject');
	d(Code.MediaPlayPause, 'MediaPlayPause');
	d(Code.MediaSelect, 'MediaSelect');
	d(Code.LaunchMail, 'LaunchMail');
	d(Code.LaunchApp2, 'LaunchApp2');
	d(Code.LaunchApp1, 'LaunchApp1');
	d(Code.SelectTask, 'SelectTask');
	d(Code.LaunchScreenSaver, 'LaunchScreenSaver');
	d(Code.BrowserSearch, 'BrowserSearch');
	d(Code.BrowserHome, 'BrowserHome');
	d(Code.BrowserBack, 'BrowserBack');
	d(Code.BrowserForward, 'BrowserForward');
	d(Code.BrowserStop, 'BrowserStop');
	d(Code.BrowserRefresh, 'BrowserRefresh');
	d(Code.BrowserFavorites, 'BrowserFavorites');
	d(Code.ZoomToggle, 'ZoomToggle');
	d(Code.MailReply, 'MailReply');
	d(Code.MailForward, 'MailForward');
	d(Code.MailSend, 'MailSend');
})();

const enum Code {
	None,

	Hyper,
	Super,
	Fn,
	FnLock,
	Suspend,
	Resume,
	Turbo,
	Sleep,
	WakeUp,
	KeyA,
	KeyB,
	KeyC,
	KeyD,
	KeyE,
	KeyF,
	KeyG,
	KeyH,
	KeyI,
	KeyJ,
	KeyK,
	KeyL,
	KeyM,
	KeyN,
	KeyO,
	KeyP,
	KeyQ,
	KeyR,
	KeyS,
	KeyT,
	KeyU,
	KeyV,
	KeyW,
	KeyX,
	KeyY,
	KeyZ,
	Digit1,
	Digit2,
	Digit3,
	Digit4,
	Digit5,
	Digit6,
	Digit7,
	Digit8,
	Digit9,
	Digit0,
	Enter,
	Escape,
	Backspace,
	Tab,
	Space,
	Minus,
	Equal,
	BracketLeft,
	BracketRight,
	Backslash,
	IntlHash,
	Semicolon,
	Quote,
	Backquote,
	Comma,
	Period,
	Slash,
	CapsLock,
	F1,
	F2,
	F3,
	F4,
	F5,
	F6,
	F7,
	F8,
	F9,
	F10,
	F11,
	F12,
	PrintScreen,
	ScrollLock,
	Pause,
	Insert,
	Home,
	PageUp,
	Delete,
	End,
	PageDown,
	ArrowRight,
	ArrowLeft,
	ArrowDown,
	ArrowUp,
	NumLock,
	NumpadDivide,
	NumpadMultiply,
	NumpadSubtract,
	NumpadAdd,
	NumpadEnter,
	Numpad1,
	Numpad2,
	Numpad3,
	Numpad4,
	Numpad5,
	Numpad6,
	Numpad7,
	Numpad8,
	Numpad9,
	Numpad0,
	NumpadDecimal,
	IntlBackslash,
	ContextMenu,
	Power,
	NumpadEqual,
	F13,
	F14,
	F15,
	F16,
	F17,
	F18,
	F19,
	F20,
	F21,
	F22,
	F23,
	F24,
	Open,
	Help,
	Select,
	Again,
	Undo,
	Cut,
	Copy,
	Paste,
	Find,
	AudioVolumeMute,
	AudioVolumeUp,
	AudioVolumeDown,
	NumpadComma,
	IntlRo,
	KanaMode,
	IntlYen,
	Convert,
	NonConvert,
	Lang1,
	Lang2,
	Lang3,
	Lang4,
	Lang5,
	Abort,
	Props,
	NumpadParenLeft,
	NumpadParenRight,
	NumpadBackspace,
	NumpadMemoryStore,
	NumpadMemoryRecall,
	NumpadMemoryClear,
	NumpadMemoryAdd,
	NumpadMemorySubtract,
	NumpadClear,
	NumpadClearEntry,
	ControlLeft,
	ShiftLeft,
	AltLeft,
	MetaLeft,
	ControlRight,
	ShiftRight,
	AltRight,
	MetaRight,
	BrightnessUp,
	BrightnessDown,
	MediaPlay,
	MediaRecord,
	MediaFastForward,
	MediaRewind,
	MediaTrackNext,
	MediaTrackPrevious,
	MediaStop,
	Eject,
	MediaPlayPause,
	MediaSelect,
	LaunchMail,
	LaunchApp2,
	LaunchApp1,
	SelectTask,
	LaunchScreenSaver,
	BrowserSearch,
	BrowserHome,
	BrowserBack,
	BrowserForward,
	BrowserStop,
	BrowserRefresh,
	BrowserFavorites,
	ZoomToggle,
	MailReply,
	MailForward,
	MailSend,
}
