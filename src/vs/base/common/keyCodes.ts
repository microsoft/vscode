/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as defaultPlatform from 'vs/base/common/platform';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';

export interface ISimplifiedPlatform {
	isMacintosh: boolean;
	isWindows: boolean;
}

/**
 * Virtual Key Codes, the value does not hold any inherent meaning.
 * Inspired somewhat from https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
 * But these are "more general", as they should work across browsers & OS`s.
 */
export const enum KeyCode {
	/**
	 * Placed first to cover the 0 value of the enum.
	 */
	Unknown = 0,

	Backspace = 1,
	Tab = 2,
	Enter = 3,
	Shift = 4,
	Ctrl = 5,
	Alt = 6,
	PauseBreak = 7,
	CapsLock = 8,
	Escape = 9,
	Space = 10,
	PageUp = 11,
	PageDown = 12,
	End = 13,
	Home = 14,
	LeftArrow = 15,
	UpArrow = 16,
	RightArrow = 17,
	DownArrow = 18,
	Insert = 19,
	Delete = 20,

	KEY_0 = 21,
	KEY_1 = 22,
	KEY_2 = 23,
	KEY_3 = 24,
	KEY_4 = 25,
	KEY_5 = 26,
	KEY_6 = 27,
	KEY_7 = 28,
	KEY_8 = 29,
	KEY_9 = 30,

	KEY_A = 31,
	KEY_B = 32,
	KEY_C = 33,
	KEY_D = 34,
	KEY_E = 35,
	KEY_F = 36,
	KEY_G = 37,
	KEY_H = 38,
	KEY_I = 39,
	KEY_J = 40,
	KEY_K = 41,
	KEY_L = 42,
	KEY_M = 43,
	KEY_N = 44,
	KEY_O = 45,
	KEY_P = 46,
	KEY_Q = 47,
	KEY_R = 48,
	KEY_S = 49,
	KEY_T = 50,
	KEY_U = 51,
	KEY_V = 52,
	KEY_W = 53,
	KEY_X = 54,
	KEY_Y = 55,
	KEY_Z = 56,

	Meta = 57,
	ContextMenu = 58,

	F1 = 59,
	F2 = 60,
	F3 = 61,
	F4 = 62,
	F5 = 63,
	F6 = 64,
	F7 = 65,
	F8 = 66,
	F9 = 67,
	F10 = 68,
	F11 = 69,
	F12 = 70,
	F13 = 71,
	F14 = 72,
	F15 = 73,
	F16 = 74,
	F17 = 75,
	F18 = 76,
	F19 = 77,

	NumLock = 78,
	ScrollLock = 79,

	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ';:' key
	 */
	US_SEMICOLON = 80,
	/**
	 * For any country/region, the '+' key
	 * For the US standard keyboard, the '=+' key
	 */
	US_EQUAL = 81,
	/**
	 * For any country/region, the ',' key
	 * For the US standard keyboard, the ',<' key
	 */
	US_COMMA = 82,
	/**
	 * For any country/region, the '-' key
	 * For the US standard keyboard, the '-_' key
	 */
	US_MINUS = 83,
	/**
	 * For any country/region, the '.' key
	 * For the US standard keyboard, the '.>' key
	 */
	US_DOT = 84,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '/?' key
	 */
	US_SLASH = 85,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '`~' key
	 */
	US_BACKTICK = 86,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '[{' key
	 */
	US_OPEN_SQUARE_BRACKET = 87,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '\|' key
	 */
	US_BACKSLASH = 88,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ']}' key
	 */
	US_CLOSE_SQUARE_BRACKET = 89,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ''"' key
	 */
	US_QUOTE = 90,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 */
	OEM_8 = 91,
	/**
	 * Either the angle bracket key or the backslash key on the RT 102-key keyboard.
	 */
	OEM_102 = 92,

	NUMPAD_0 = 93, // VK_NUMPAD0, 0x60, Numeric keypad 0 key
	NUMPAD_1 = 94, // VK_NUMPAD1, 0x61, Numeric keypad 1 key
	NUMPAD_2 = 95, // VK_NUMPAD2, 0x62, Numeric keypad 2 key
	NUMPAD_3 = 96, // VK_NUMPAD3, 0x63, Numeric keypad 3 key
	NUMPAD_4 = 97, // VK_NUMPAD4, 0x64, Numeric keypad 4 key
	NUMPAD_5 = 98, // VK_NUMPAD5, 0x65, Numeric keypad 5 key
	NUMPAD_6 = 99, // VK_NUMPAD6, 0x66, Numeric keypad 6 key
	NUMPAD_7 = 100, // VK_NUMPAD7, 0x67, Numeric keypad 7 key
	NUMPAD_8 = 101, // VK_NUMPAD8, 0x68, Numeric keypad 8 key
	NUMPAD_9 = 102, // VK_NUMPAD9, 0x69, Numeric keypad 9 key

	NUMPAD_MULTIPLY = 103,	// VK_MULTIPLY, 0x6A, Multiply key
	NUMPAD_ADD = 104,		// VK_ADD, 0x6B, Add key
	NUMPAD_SEPARATOR = 105,	// VK_SEPARATOR, 0x6C, Separator key
	NUMPAD_SUBTRACT = 106,	// VK_SUBTRACT, 0x6D, Subtract key
	NUMPAD_DECIMAL = 107,	// VK_DECIMAL, 0x6E, Decimal key
	NUMPAD_DIVIDE = 108,	// VK_DIVIDE, 0x6F,

	/**
	 * Placed last to cover the length of the enum.
	 * Please do not depend on this value!
	 */
	MAX_VALUE
}

interface IReverseMap {
	[str:string]:KeyCode;
}

class Mapping {

	_fromKeyCode: string[];
	_toKeyCode: IReverseMap;

	constructor(fromKeyCode: string[], toKeyCode: IReverseMap) {
		this._fromKeyCode = fromKeyCode;
		this._toKeyCode = toKeyCode;
	}

	fromKeyCode(keyCode:KeyCode): string {
		return this._fromKeyCode[keyCode];
	}

	toKeyCode(str:string): KeyCode {
		if (this._toKeyCode.hasOwnProperty(str)) {
			return this._toKeyCode[str];
		}
		return KeyCode.Unknown;
	}

}

function createMapping(fill1:(map:string[])=>void, fill2:(reverseMap:IReverseMap)=>void): Mapping {
	let MAP: string[] = [];
	fill1(MAP);

	let REVERSE_MAP: IReverseMap = {};
	for (let i = 0, len = MAP.length; i < len; i++) {
		if (!MAP[i]) {
			continue;
		}
		REVERSE_MAP[MAP[i]] = i;
	}
	fill2(REVERSE_MAP);

	let FINAL_REVERSE_MAP: IReverseMap = {};
	for (let entry in REVERSE_MAP) {
		if (REVERSE_MAP.hasOwnProperty(entry)) {
			FINAL_REVERSE_MAP[entry] = REVERSE_MAP[entry];
			FINAL_REVERSE_MAP[entry.toLowerCase()] = REVERSE_MAP[entry];
		}
	}

	return new Mapping(MAP, FINAL_REVERSE_MAP);
}

let STRING = createMapping((TO_STRING_MAP) => {
	TO_STRING_MAP[KeyCode.Unknown] 		= 'unknown';

	TO_STRING_MAP[KeyCode.Backspace] 	= 'Backspace';
	TO_STRING_MAP[KeyCode.Tab] 			= 'Tab';
	TO_STRING_MAP[KeyCode.Enter] 		= 'Enter';
	TO_STRING_MAP[KeyCode.Shift] 		= 'Shift';
	TO_STRING_MAP[KeyCode.Ctrl] 		= 'Ctrl';
	TO_STRING_MAP[KeyCode.Alt] 			= 'Alt';
	TO_STRING_MAP[KeyCode.PauseBreak] 	= 'PauseBreak';
	TO_STRING_MAP[KeyCode.CapsLock] 	= 'CapsLock';
	TO_STRING_MAP[KeyCode.Escape] 		= 'Escape';
	TO_STRING_MAP[KeyCode.Space] 		= 'Space';
	TO_STRING_MAP[KeyCode.PageUp] 		= 'PageUp';
	TO_STRING_MAP[KeyCode.PageDown] 	= 'PageDown';
	TO_STRING_MAP[KeyCode.End] 			= 'End';
	TO_STRING_MAP[KeyCode.Home] 		= 'Home';
	TO_STRING_MAP[KeyCode.LeftArrow] 	= 'LeftArrow';
	TO_STRING_MAP[KeyCode.UpArrow] 		= 'UpArrow';
	TO_STRING_MAP[KeyCode.RightArrow] 	= 'RightArrow';
	TO_STRING_MAP[KeyCode.DownArrow] 	= 'DownArrow';
	TO_STRING_MAP[KeyCode.Insert] 		= 'Insert';
	TO_STRING_MAP[KeyCode.Delete] 		= 'Delete';

	TO_STRING_MAP[KeyCode.KEY_0] = '0';
	TO_STRING_MAP[KeyCode.KEY_1] = '1';
	TO_STRING_MAP[KeyCode.KEY_2] = '2';
	TO_STRING_MAP[KeyCode.KEY_3] = '3';
	TO_STRING_MAP[KeyCode.KEY_4] = '4';
	TO_STRING_MAP[KeyCode.KEY_5] = '5';
	TO_STRING_MAP[KeyCode.KEY_6] = '6';
	TO_STRING_MAP[KeyCode.KEY_7] = '7';
	TO_STRING_MAP[KeyCode.KEY_8] = '8';
	TO_STRING_MAP[KeyCode.KEY_9] = '9';

	TO_STRING_MAP[KeyCode.KEY_A] = 'A';
	TO_STRING_MAP[KeyCode.KEY_B] = 'B';
	TO_STRING_MAP[KeyCode.KEY_C] = 'C';
	TO_STRING_MAP[KeyCode.KEY_D] = 'D';
	TO_STRING_MAP[KeyCode.KEY_E] = 'E';
	TO_STRING_MAP[KeyCode.KEY_F] = 'F';
	TO_STRING_MAP[KeyCode.KEY_G] = 'G';
	TO_STRING_MAP[KeyCode.KEY_H] = 'H';
	TO_STRING_MAP[KeyCode.KEY_I] = 'I';
	TO_STRING_MAP[KeyCode.KEY_J] = 'J';
	TO_STRING_MAP[KeyCode.KEY_K] = 'K';
	TO_STRING_MAP[KeyCode.KEY_L] = 'L';
	TO_STRING_MAP[KeyCode.KEY_M] = 'M';
	TO_STRING_MAP[KeyCode.KEY_N] = 'N';
	TO_STRING_MAP[KeyCode.KEY_O] = 'O';
	TO_STRING_MAP[KeyCode.KEY_P] = 'P';
	TO_STRING_MAP[KeyCode.KEY_Q] = 'Q';
	TO_STRING_MAP[KeyCode.KEY_R] = 'R';
	TO_STRING_MAP[KeyCode.KEY_S] = 'S';
	TO_STRING_MAP[KeyCode.KEY_T] = 'T';
	TO_STRING_MAP[KeyCode.KEY_U] = 'U';
	TO_STRING_MAP[KeyCode.KEY_V] = 'V';
	TO_STRING_MAP[KeyCode.KEY_W] = 'W';
	TO_STRING_MAP[KeyCode.KEY_X] = 'X';
	TO_STRING_MAP[KeyCode.KEY_Y] = 'Y';
	TO_STRING_MAP[KeyCode.KEY_Z] = 'Z';

	TO_STRING_MAP[KeyCode.ContextMenu] = 'ContextMenu';

	TO_STRING_MAP[KeyCode.F1] = 'F1';
	TO_STRING_MAP[KeyCode.F2] = 'F2';
	TO_STRING_MAP[KeyCode.F3] = 'F3';
	TO_STRING_MAP[KeyCode.F4] = 'F4';
	TO_STRING_MAP[KeyCode.F5] = 'F5';
	TO_STRING_MAP[KeyCode.F6] = 'F6';
	TO_STRING_MAP[KeyCode.F7] = 'F7';
	TO_STRING_MAP[KeyCode.F8] = 'F8';
	TO_STRING_MAP[KeyCode.F9] = 'F9';
	TO_STRING_MAP[KeyCode.F10] = 'F10';
	TO_STRING_MAP[KeyCode.F11] = 'F11';
	TO_STRING_MAP[KeyCode.F12] = 'F12';
	TO_STRING_MAP[KeyCode.F13] = 'F13';
	TO_STRING_MAP[KeyCode.F14] = 'F14';
	TO_STRING_MAP[KeyCode.F15] = 'F15';
	TO_STRING_MAP[KeyCode.F16] = 'F16';
	TO_STRING_MAP[KeyCode.F17] = 'F17';
	TO_STRING_MAP[KeyCode.F18] = 'F18';
	TO_STRING_MAP[KeyCode.F19] = 'F19';


	TO_STRING_MAP[KeyCode.NumLock] 		= 'NumLock';
	TO_STRING_MAP[KeyCode.ScrollLock] 	= 'ScrollLock';

	TO_STRING_MAP[KeyCode.US_SEMICOLON] 			= ';';
	TO_STRING_MAP[KeyCode.US_EQUAL] 				= '=';
	TO_STRING_MAP[KeyCode.US_COMMA] 				= ',';
	TO_STRING_MAP[KeyCode.US_MINUS] 				= '-';
	TO_STRING_MAP[KeyCode.US_DOT] 					= '.';
	TO_STRING_MAP[KeyCode.US_SLASH] 				= '/';
	TO_STRING_MAP[KeyCode.US_BACKTICK] 				= '`';
	TO_STRING_MAP[KeyCode.US_OPEN_SQUARE_BRACKET] 	= '[';
	TO_STRING_MAP[KeyCode.US_BACKSLASH] 			= '\\';
	TO_STRING_MAP[KeyCode.US_CLOSE_SQUARE_BRACKET] 	= ']';
	TO_STRING_MAP[KeyCode.US_QUOTE]					= '\'';
	TO_STRING_MAP[KeyCode.OEM_8]					= 'OEM_8';
	TO_STRING_MAP[KeyCode.OEM_102]					= 'OEM_102';

	TO_STRING_MAP[KeyCode.NUMPAD_0] = 'NumPad0';
	TO_STRING_MAP[KeyCode.NUMPAD_1] = 'NumPad1';
	TO_STRING_MAP[KeyCode.NUMPAD_2] = 'NumPad2';
	TO_STRING_MAP[KeyCode.NUMPAD_3] = 'NumPad3';
	TO_STRING_MAP[KeyCode.NUMPAD_4] = 'NumPad4';
	TO_STRING_MAP[KeyCode.NUMPAD_5] = 'NumPad5';
	TO_STRING_MAP[KeyCode.NUMPAD_6] = 'NumPad6';
	TO_STRING_MAP[KeyCode.NUMPAD_7] = 'NumPad7';
	TO_STRING_MAP[KeyCode.NUMPAD_8] = 'NumPad8';
	TO_STRING_MAP[KeyCode.NUMPAD_9] = 'NumPad9';

	TO_STRING_MAP[KeyCode.NUMPAD_MULTIPLY] = 'NumPad_Multiply';
	TO_STRING_MAP[KeyCode.NUMPAD_ADD] = 'NumPad_Add';
	TO_STRING_MAP[KeyCode.NUMPAD_SEPARATOR] = 'NumPad_Separator';
	TO_STRING_MAP[KeyCode.NUMPAD_SUBTRACT] = 'NumPad_Subtract';
	TO_STRING_MAP[KeyCode.NUMPAD_DECIMAL] = 'NumPad_Decimal';
	TO_STRING_MAP[KeyCode.NUMPAD_DIVIDE] = 'NumPad_Divide';

	// for (let i = 0; i < KeyCode.MAX_VALUE; i++) {
	// 	if (!TO_STRING_MAP[i]) {
	// 		console.warn('Missing string representation for ' + KeyCode[i]);
	// 	}
	// }
}, (FROM_STRING_MAP) => {
	FROM_STRING_MAP['\r'] = KeyCode.Enter;
});


let USER_SETTINGS = createMapping((TO_USER_SETTINGS_MAP) => {
	for (let i = 0, len = STRING._fromKeyCode.length; i < len; i++) {
		TO_USER_SETTINGS_MAP[i] = STRING._fromKeyCode[i];
	}
	TO_USER_SETTINGS_MAP[KeyCode.LeftArrow] = 'Left';
	TO_USER_SETTINGS_MAP[KeyCode.UpArrow] = 'Up';
	TO_USER_SETTINGS_MAP[KeyCode.RightArrow] = 'Right';
	TO_USER_SETTINGS_MAP[KeyCode.DownArrow] = 'Down';
}, (FROM_USER_SETTINGS_MAP) => {
	FROM_USER_SETTINGS_MAP['OEM_1'] = KeyCode.US_SEMICOLON;
	FROM_USER_SETTINGS_MAP['OEM_PLUS'] = KeyCode.US_EQUAL;
	FROM_USER_SETTINGS_MAP['OEM_COMMA'] = KeyCode.US_COMMA;
	FROM_USER_SETTINGS_MAP['OEM_MINUS'] = KeyCode.US_MINUS;
	FROM_USER_SETTINGS_MAP['OEM_PERIOD'] = KeyCode.US_DOT;
	FROM_USER_SETTINGS_MAP['OEM_2'] = KeyCode.US_SLASH;
	FROM_USER_SETTINGS_MAP['OEM_3'] = KeyCode.US_BACKTICK;
	FROM_USER_SETTINGS_MAP['OEM_4'] = KeyCode.US_OPEN_SQUARE_BRACKET;
	FROM_USER_SETTINGS_MAP['OEM_5'] = KeyCode.US_BACKSLASH;
	FROM_USER_SETTINGS_MAP['OEM_6'] = KeyCode.US_CLOSE_SQUARE_BRACKET;
	FROM_USER_SETTINGS_MAP['OEM_7'] = KeyCode.US_QUOTE;
	FROM_USER_SETTINGS_MAP['OEM_8'] = KeyCode.OEM_8;
	FROM_USER_SETTINGS_MAP['OEM_102'] = KeyCode.OEM_102;
});

export namespace KeyCodeUtils {
	export function toString(key:KeyCode): string {
		return STRING.fromKeyCode(key);
	}
	export function fromString(key:string): KeyCode {
		return STRING.toKeyCode(key);
	}
}

// Binary encoding strategy:
// 15:  1 bit for ctrlCmd
// 14:  1 bit for shift
// 13:  1 bit for alt
// 12:  1 bit for winCtrl
//  0: 12 bits for keyCode (up to a maximum keyCode of 4096. Given we have 83 at this point thats good enough)
const enum BinaryKeybindingsMask {
	CtrlCmd = 1 << 15,
	Shift = 1 << 14,
	Alt = 1 << 13,
	WinCtrl = 1 << 12,
	KeyCode = 0x00000fff
}

export const enum KeyMod {
	CtrlCmd = 1 << 15,
	Shift = 1 << 14,
	Alt = 1 << 13,
	WinCtrl = 1 << 12,
}

export function KeyChord(firstPart:number, secondPart:number): number {
	return firstPart | ((secondPart & 0x0000ffff) << 16);
}

export class BinaryKeybindings {

	public static extractFirstPart(keybinding:number): number {
		return keybinding & 0x0000ffff;
	}

	public static extractChordPart(keybinding:number): number {
		return (keybinding >> 16) & 0x0000ffff;
	}

	public static hasChord(keybinding:number): boolean {
		return (this.extractChordPart(keybinding) !== 0);
	}

	public static hasCtrlCmd(keybinding:number): boolean {
		return (keybinding & BinaryKeybindingsMask.CtrlCmd ? true : false);
	}

	public static hasShift(keybinding:number): boolean {
		return (keybinding & BinaryKeybindingsMask.Shift ? true : false);
	}

	public static hasAlt(keybinding:number): boolean {
		return (keybinding & BinaryKeybindingsMask.Alt ? true : false);
	}

	public static hasWinCtrl(keybinding:number): boolean {
		return (keybinding & BinaryKeybindingsMask.WinCtrl ? true : false);
	}

	public static extractKeyCode(keybinding:number): KeyCode {
		return (keybinding & BinaryKeybindingsMask.KeyCode);
	}
}

export class Keybinding {

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 */
	private static _toUSLabel(value:number, Platform:ISimplifiedPlatform): string {
		return _asString(value, (Platform.isMacintosh ? MacUIKeyLabelProvider.INSTANCE : ClassicUIKeyLabelProvider.INSTANCE), Platform);
	}

	/**
	 * Format the binding to a format appropiate for placing in an aria-label.
	 */
	private static _toUSAriaLabel(value:number, Platform:ISimplifiedPlatform): string {
		return _asString(value, AriaKeyLabelProvider.INSTANCE, Platform);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 */
	private static _toUSHTMLLabel(value:number, Platform:ISimplifiedPlatform): IHTMLContentElement[] {
		return _asHTML(value, (Platform.isMacintosh ? MacUIKeyLabelProvider.INSTANCE : ClassicUIKeyLabelProvider.INSTANCE), Platform);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 */
	private static _toCustomLabel(value:number, labelProvider:IKeyBindingLabelProvider, Platform:ISimplifiedPlatform): string {
		return _asString(value, labelProvider, Platform);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 */
	private static _toCustomHTMLLabel(value:number, labelProvider:IKeyBindingLabelProvider, Platform:ISimplifiedPlatform): IHTMLContentElement[] {
		return _asHTML(value, labelProvider, Platform);
	}

	/**
	 * This prints the binding in a format suitable for electron's accelerators.
	 * See https://github.com/electron/electron/blob/master/docs/api/accelerator.md
	 */
	private static _toElectronAccelerator(value:number, Platform:ISimplifiedPlatform): string {
		if (BinaryKeybindings.hasChord(value)) {
			// Electron cannot handle chords
			return null;
		}
		return _asString(value, ElectronAcceleratorLabelProvider.INSTANCE, Platform);
	}

	private static _cachedKeybindingRegex: string = null;
	public static getUserSettingsKeybindingRegex(): string {
		if (!this._cachedKeybindingRegex) {
			let numpadKey = 'numpad(0|1|2|3|4|5|6|7|8|9|_multiply|_add|_subtract|_decimal|_divide|_separator)';
			let oemKey = '`|\\-|=|\\[|\\]|\\\\\\\\|;|\'|,|\\.|\\/|oem_8|oem_102';
			let specialKey = 'left|up|right|down|pageup|pagedown|end|home|tab|enter|escape|space|backspace|delete|pausebreak|capslock|insert|contextmenu|numlock|scrolllock';
			let casualKey = '[a-z]|[0-9]|f(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19)';
			let key = '((' + [numpadKey, oemKey, specialKey, casualKey].join(')|(') + '))';
			let mod = '((ctrl|shift|alt|cmd|win|meta)\\+)*';
			let keybinding = '(' + mod + key + ')';

			this._cachedKeybindingRegex = '"\\s*(' + keybinding + '(\\s+' + keybinding +')?' + ')\\s*"';
		}
		return this._cachedKeybindingRegex;
	}

	/**
	 * Format the binding to a format appropiate for the user settings file.
	 */
	public static toUserSettingsLabel(value:number, Platform:ISimplifiedPlatform = defaultPlatform): string {
		let result = _asString(value, UserSettingsKeyLabelProvider.INSTANCE, Platform);
		result = result.toLowerCase();

		if (Platform.isMacintosh) {
			result = result.replace(/meta/g, 'cmd');
		} else if (Platform.isWindows) {
			result = result.replace(/meta/g, 'win');
		}

		return result;
	}

	public static fromUserSettingsLabel(input: string, Platform: ISimplifiedPlatform = defaultPlatform): number {
		if (!input) {
			return null;
		}
		input = input.toLowerCase().trim();

		let ctrlCmd = false,
			shift = false,
			alt = false,
			winCtrl = false,
			key:string = '';

		while (/^(ctrl|shift|alt|meta|win|cmd)(\+|\-)/.test(input)) {
			if (/^ctrl(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					winCtrl = true;
				} else {
					ctrlCmd = true;
				}
				input = input.substr('ctrl-'.length);
			}
			if (/^shift(\+|\-)/.test(input)) {
				shift = true;
				input = input.substr('shift-'.length);
			}
			if (/^alt(\+|\-)/.test(input)) {
				alt = true;
				input = input.substr('alt-'.length);
			}
			if (/^meta(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					ctrlCmd = true;
				} else {
					winCtrl = true;
				}
				input = input.substr('meta-'.length);
			}
			if (/^win(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					ctrlCmd = true;
				} else {
					winCtrl = true;
				}
				input = input.substr('win-'.length);
			}
			if (/^cmd(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					ctrlCmd = true;
				} else {
					winCtrl = true;
				}
				input = input.substr('cmd-'.length);
			}
		}

		let chord: number = 0;

		let firstSpaceIdx = input.indexOf(' ');
		if (firstSpaceIdx > 0) {
			key = input.substring(0, firstSpaceIdx);
			chord = Keybinding.fromUserSettingsLabel(input.substring(firstSpaceIdx), Platform);
		} else {
			key = input;
		}

		let keyCode = USER_SETTINGS.toKeyCode(key);

		let result = 0;
		if (ctrlCmd) {
			result |= KeyMod.CtrlCmd;
		}
		if (shift) {
			result |= KeyMod.Shift;
		}
		if (alt) {
			result |= KeyMod.Alt;
		}
		if (winCtrl) {
			result |= KeyMod.WinCtrl;
		}
		result |= keyCode;
		return KeyChord(result, chord);
	}

	public value:number;

	constructor(keybinding:number) {
		this.value = keybinding;
	}

	public hasCtrlCmd(): boolean {
		return BinaryKeybindings.hasCtrlCmd(this.value);
	}

	public hasShift(): boolean {
		return BinaryKeybindings.hasShift(this.value);
	}

	public hasAlt(): boolean {
		return BinaryKeybindings.hasAlt(this.value);
	}

	public hasWinCtrl(): boolean {
		return BinaryKeybindings.hasWinCtrl(this.value);
	}

	public extractKeyCode(): KeyCode {
		return BinaryKeybindings.extractKeyCode(this.value);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 */
	public _toUSLabel(Platform:ISimplifiedPlatform = defaultPlatform): string {
		return Keybinding._toUSLabel(this.value, Platform);
	}

	/**
	 * Format the binding to a format appropiate for placing in an aria-label.
	 */
	public _toUSAriaLabel(Platform:ISimplifiedPlatform = defaultPlatform): string {
		return Keybinding._toUSAriaLabel(this.value, Platform);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 */
	public _toUSHTMLLabel(Platform:ISimplifiedPlatform = defaultPlatform): IHTMLContentElement[] {
		return Keybinding._toUSHTMLLabel(this.value, Platform);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 */
	public toCustomLabel(labelProvider:IKeyBindingLabelProvider, Platform:ISimplifiedPlatform = defaultPlatform): string {
		return Keybinding._toCustomLabel(this.value, labelProvider, Platform);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 */
	public toCustomHTMLLabel(labelProvider:IKeyBindingLabelProvider, Platform:ISimplifiedPlatform = defaultPlatform): IHTMLContentElement[] {
		return Keybinding._toCustomHTMLLabel(this.value, labelProvider, Platform);
	}

	/**
	 * This prints the binding in a format suitable for electron's accelerators.
	 * See https://github.com/electron/electron/blob/master/docs/api/accelerator.md
	 */
	public _toElectronAccelerator(Platform:ISimplifiedPlatform = defaultPlatform): string {
		return Keybinding._toElectronAccelerator(this.value, Platform);
	}

	/**
	 * Format the binding to a format appropiate for the user settings file.
	 */
	public toUserSettingsLabel(Platform:ISimplifiedPlatform = defaultPlatform): string {
		return Keybinding.toUserSettingsLabel(this.value, Platform);
	}

}

export interface IKeyBindingLabelProvider {
	ctrlKeyLabel:string;
	shiftKeyLabel:string;
	altKeyLabel:string;
	cmdKeyLabel:string;
	windowsKeyLabel:string;
	modifierSeparator:string;
	getLabelForKey(keyCode:KeyCode): string;
}

/**
 * Print for Electron
 */
export class ElectronAcceleratorLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new ElectronAcceleratorLabelProvider();

	public ctrlKeyLabel = 'Ctrl';
	public shiftKeyLabel = 'Shift';
	public altKeyLabel = 'Alt';
	public cmdKeyLabel = 'Cmd';
	public windowsKeyLabel = 'Super';
	public modifierSeparator = '+';

	public getLabelForKey(keyCode:KeyCode): string {
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

		return KeyCodeUtils.toString(keyCode);
	}
}

/**
 * Print for Mac UI
 */
export class MacUIKeyLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new MacUIKeyLabelProvider();

	private static leftArrowUnicodeLabel = String.fromCharCode(8592);
	private static upArrowUnicodeLabel = String.fromCharCode(8593);
	private static rightArrowUnicodeLabel = String.fromCharCode(8594);
	private static downArrowUnicodeLabel = String.fromCharCode(8595);

	public ctrlKeyLabel = '\u2303';
	public shiftKeyLabel = '\u21E7';
	public altKeyLabel = '\u2325';
	public cmdKeyLabel = '\u2318';
	public windowsKeyLabel = nls.localize('windowsKey', "Windows");
	public modifierSeparator = '';

	public getLabelForKey(keyCode:KeyCode): string {
		switch (keyCode) {
			case KeyCode.LeftArrow:
				return MacUIKeyLabelProvider.leftArrowUnicodeLabel;
			case KeyCode.UpArrow:
				return MacUIKeyLabelProvider.upArrowUnicodeLabel;
			case KeyCode.RightArrow:
				return MacUIKeyLabelProvider.rightArrowUnicodeLabel;
			case KeyCode.DownArrow:
				return MacUIKeyLabelProvider.downArrowUnicodeLabel;
		}

		return KeyCodeUtils.toString(keyCode);
	}
}

/**
 * Aria label provider for Mac.
 */
export class AriaKeyLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new MacUIKeyLabelProvider();

	public ctrlKeyLabel = nls.localize('ctrlKey.long', "Control");
	public shiftKeyLabel = nls.localize('shiftKey.long', "Shift");
	public altKeyLabel = nls.localize('altKey.long', "Alt");
	public cmdKeyLabel = nls.localize('cmdKey.long', "Command");
	public windowsKeyLabel = nls.localize('windowsKey.long', "Windows");
	public modifierSeparator = '+';

	public getLabelForKey(keyCode:KeyCode): string {
		return KeyCodeUtils.toString(keyCode);
	}
}

/**
 * Print for Windows, Linux UI
 */
export class ClassicUIKeyLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new ClassicUIKeyLabelProvider();

	public ctrlKeyLabel = nls.localize('ctrlKey', "Ctrl");
	public shiftKeyLabel = nls.localize('shiftKey', "Shift");
	public altKeyLabel = nls.localize('altKey', "Alt");
	public cmdKeyLabel = nls.localize('cmdKey', "Command");
	public windowsKeyLabel = nls.localize('windowsKey', "Windows");
	public modifierSeparator = '+';

	public getLabelForKey(keyCode:KeyCode): string {
		return KeyCodeUtils.toString(keyCode);
	}
}

/**
 * Print for the user settings file.
 */
class UserSettingsKeyLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new UserSettingsKeyLabelProvider();

	public ctrlKeyLabel = 'Ctrl';
	public shiftKeyLabel = 'Shift';
	public altKeyLabel = 'Alt';
	public cmdKeyLabel = 'Meta';
	public windowsKeyLabel = 'Meta';

	public modifierSeparator = '+';

	public getLabelForKey(keyCode:KeyCode): string {
		return USER_SETTINGS.fromKeyCode(keyCode);
	}
}

function _asString(keybinding:number, labelProvider:IKeyBindingLabelProvider, Platform:ISimplifiedPlatform): string {
	let result:string[] = [],
		ctrlCmd = BinaryKeybindings.hasCtrlCmd(keybinding),
		shift = BinaryKeybindings.hasShift(keybinding),
		alt = BinaryKeybindings.hasAlt(keybinding),
		winCtrl = BinaryKeybindings.hasWinCtrl(keybinding),
		keyCode = BinaryKeybindings.extractKeyCode(keybinding);

	let keyLabel = labelProvider.getLabelForKey(keyCode);
	if (!keyLabel) {
		// cannot trigger this key code under this kb layout
		return '';
	}

	// translate modifier keys: Ctrl-Shift-Alt-Meta
	if ((ctrlCmd && !Platform.isMacintosh) || (winCtrl && Platform.isMacintosh)) {
		result.push(labelProvider.ctrlKeyLabel);
	}

	if (shift) {
		result.push(labelProvider.shiftKeyLabel);
	}

	if (alt) {
		result.push(labelProvider.altKeyLabel);
	}

	if (ctrlCmd && Platform.isMacintosh) {
		result.push(labelProvider.cmdKeyLabel);
	}

	if (winCtrl && !Platform.isMacintosh) {
		result.push(labelProvider.windowsKeyLabel);
	}

	// the actual key
	result.push(keyLabel);

	var actualResult = result.join(labelProvider.modifierSeparator);

	if (BinaryKeybindings.hasChord(keybinding)) {
		return actualResult + ' ' + _asString(BinaryKeybindings.extractChordPart(keybinding), labelProvider, Platform);
	}

	return actualResult;
}

function _pushKey(result:IHTMLContentElement[], str:string): void {
	if (result.length > 0) {
		result.push({
			tagName: 'span',
			text: '+'
		});
	}
	result.push({
		tagName: 'span',
		className: 'monaco-kbkey',
		text: str
	});
}

function _asHTML(keybinding:number, labelProvider:IKeyBindingLabelProvider, Platform:ISimplifiedPlatform, isChord:boolean = false): IHTMLContentElement[] {
	let result:IHTMLContentElement[] = [],
		ctrlCmd = BinaryKeybindings.hasCtrlCmd(keybinding),
		shift = BinaryKeybindings.hasShift(keybinding),
		alt = BinaryKeybindings.hasAlt(keybinding),
		winCtrl = BinaryKeybindings.hasWinCtrl(keybinding),
		keyCode = BinaryKeybindings.extractKeyCode(keybinding);

	let keyLabel = labelProvider.getLabelForKey(keyCode);
	if (!keyLabel) {
		// cannot trigger this key code under this kb layout
		return [];
	}

	// translate modifier keys: Ctrl-Shift-Alt-Meta
	if ((ctrlCmd && !Platform.isMacintosh) || (winCtrl && Platform.isMacintosh)) {
		_pushKey(result, labelProvider.ctrlKeyLabel);
	}

	if (shift) {
		_pushKey(result, labelProvider.shiftKeyLabel);
	}

	if (alt) {
		_pushKey(result, labelProvider.altKeyLabel);
	}

	if (ctrlCmd && Platform.isMacintosh) {
		_pushKey(result, labelProvider.cmdKeyLabel);
	}

	if (winCtrl && !Platform.isMacintosh) {
		_pushKey(result, labelProvider.windowsKeyLabel);
	}

	// the actual key
	_pushKey(result, keyLabel);

	let chordTo: IHTMLContentElement[] = null;

	if (BinaryKeybindings.hasChord(keybinding)) {
		chordTo = _asHTML(BinaryKeybindings.extractChordPart(keybinding), labelProvider, Platform, true);
		result.push({
			tagName: 'span',
			text: ' '
		});
		result = result.concat(chordTo);
	}

	if (isChord) {
		return result;
	}

	return [{
		tagName: 'span',
		className: 'monaco-kb',
		children: result
	}];
}
