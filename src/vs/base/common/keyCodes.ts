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
export enum KeyCode {
	/**
	 * Placed first to cover the 0 value of the enum.
	 */
	Unknown,

	Backspace,
	Tab,
	Enter,
	Shift,
	Ctrl,
	Alt,
	PauseBreak,
	CapsLock,
	Escape,
	Space,
	PageUp,
	PageDown,
	End,
	Home,
	LeftArrow,
	UpArrow,
	RightArrow,
	DownArrow,
	Insert,
	Delete,

	KEY_0,
	KEY_1,
	KEY_2,
	KEY_3,
	KEY_4,
	KEY_5,
	KEY_6,
	KEY_7,
	KEY_8,
	KEY_9,

	KEY_A,
	KEY_B,
	KEY_C,
	KEY_D,
	KEY_E,
	KEY_F,
	KEY_G,
	KEY_H,
	KEY_I,
	KEY_J,
	KEY_K,
	KEY_L,
	KEY_M,
	KEY_N,
	KEY_O,
	KEY_P,
	KEY_Q,
	KEY_R,
	KEY_S,
	KEY_T,
	KEY_U,
	KEY_V,
	KEY_W,
	KEY_X,
	KEY_Y,
	KEY_Z,

	Meta,
	ContextMenu,

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
	F13,
	F14,
	F15,
	F16,
	F17,
	F18,
	F19,

	NumLock,
	ScrollLock,

	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ';:' key
	 */
	US_SEMICOLON,
	/**
	 * For any country/region, the '+' key
	 * For the US standard keyboard, the '=+' key
	 */
	US_EQUAL,
	/**
	 * For any country/region, the ',' key
	 * For the US standard keyboard, the ',<' key
	 */
	US_COMMA,
	/**
	 * For any country/region, the '-' key
	 * For the US standard keyboard, the '-_' key
	 */
	US_MINUS,
	/**
	 * For any country/region, the '.' key
	 * For the US standard keyboard, the '.>' key
	 */
	US_DOT,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '/?' key
	 */
	US_SLASH,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '`~' key
	 */
	US_BACKTICK,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '[{' key
	 */
	US_OPEN_SQUARE_BRACKET,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '\|' key
	 */
	US_BACKSLASH,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ']}' key
	 */
	US_CLOSE_SQUARE_BRACKET,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ''"' key
	 */
	US_QUOTE,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 */
	OEM_8,
	/**
	 * Either the angle bracket key or the backslash key on the RT 102-key keyboard.
	 */
	OEM_102,

	NUMPAD_0, // VK_NUMPAD0, 0x60, Numeric keypad 0 key
	NUMPAD_1, // VK_NUMPAD1, 0x61, Numeric keypad 1 key
	NUMPAD_2, // VK_NUMPAD2, 0x62, Numeric keypad 2 key
	NUMPAD_3, // VK_NUMPAD3, 0x63, Numeric keypad 3 key
	NUMPAD_4, // VK_NUMPAD4, 0x64, Numeric keypad 4 key
	NUMPAD_5, // VK_NUMPAD5, 0x65, Numeric keypad 5 key
	NUMPAD_6, // VK_NUMPAD6, 0x66, Numeric keypad 6 key
	NUMPAD_7, // VK_NUMPAD7, 0x67, Numeric keypad 7 key
	NUMPAD_8, // VK_NUMPAD8, 0x68, Numeric keypad 8 key
	NUMPAD_9, // VK_NUMPAD9, 0x69, Numeric keypad 9 key

	NUMPAD_MULTIPLY,	// VK_MULTIPLY, 0x6A, Multiply key
	NUMPAD_ADD,			// VK_ADD, 0x6B, Add key
	NUMPAD_SEPARATOR,	// VK_SEPARATOR, 0x6C, Separator key
	NUMPAD_SUBTRACT,	// VK_SUBTRACT, 0x6D, Subtract key
	NUMPAD_DECIMAL,		// VK_DECIMAL, 0x6E, Decimal key
	NUMPAD_DIVIDE,		// VK_DIVIDE, 0x6F,

	/**
	 * Placed last to cover the length of the enum.
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

export namespace KeyCode {
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

const BIN_CTRLCMD_MASK = 1 << 15;
const BIN_SHIFT_MASK = 1 << 14;
const BIN_ALT_MASK = 1 << 13;
const BIN_WINCTRL_MASK = 1 << 12;
const BIN_KEYCODE_MASK = 0x00000fff;

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
		return (keybinding & BIN_CTRLCMD_MASK ? true : false);
	}

	public static hasShift(keybinding:number): boolean {
		return (keybinding & BIN_SHIFT_MASK ? true : false);
	}

	public static hasAlt(keybinding:number): boolean {
		return (keybinding & BIN_ALT_MASK ? true : false);
	}

	public static hasWinCtrl(keybinding:number): boolean {
		return (keybinding & BIN_WINCTRL_MASK ? true : false);
	}

	public static extractKeyCode(keybinding:number): KeyCode {
		return (keybinding & BIN_KEYCODE_MASK);
	}
}



export class KeyMod {
	public static CtrlCmd = BIN_CTRLCMD_MASK;
	public static Shift = BIN_SHIFT_MASK;
	public static Alt = BIN_ALT_MASK;
	public static WinCtrl = BIN_WINCTRL_MASK;

	public static chord(firstPart:number, secondPart:number): number {
		return firstPart | ((secondPart & 0x0000ffff) << 16);
	}
}

/**
 * A set of usual keybindings that can be reused in code
 */
export class CommonKeybindings {

	public static ENTER: number = KeyCode.Enter;
	public static SHIFT_ENTER: number = KeyMod.Shift | KeyCode.Enter;
	public static CTRLCMD_ENTER: number = KeyMod.CtrlCmd | KeyCode.Enter;
	public static WINCTRL_ENTER: number = KeyMod.WinCtrl | KeyCode.Enter;

	public static TAB: number = KeyCode.Tab;
	public static SHIFT_TAB: number = KeyMod.Shift | KeyCode.Tab;
	public static ESCAPE: number = KeyCode.Escape;
	public static SPACE: number = KeyCode.Space;
	public static DELETE: number = KeyCode.Delete;
	public static SHIFT_DELETE: number = KeyMod.Shift | KeyCode.Delete;
	public static CTRLCMD_BACKSPACE: number = KeyMod.CtrlCmd | KeyCode.Backspace;

	public static UP_ARROW: number = KeyCode.UpArrow;
	public static SHIFT_UP_ARROW: number = KeyMod.Shift | KeyCode.UpArrow;
	public static CTRLCMD_UP_ARROW: number = KeyMod.CtrlCmd | KeyCode.UpArrow;

	public static DOWN_ARROW: number = KeyCode.DownArrow;
	public static SHIFT_DOWN_ARROW: number = KeyMod.Shift | KeyCode.DownArrow;
	public static CTRLCMD_DOWN_ARROW: number = KeyMod.CtrlCmd | KeyCode.DownArrow;

	public static LEFT_ARROW: number = KeyCode.LeftArrow;

	public static RIGHT_ARROW: number = KeyCode.RightArrow;

	public static PAGE_UP: number = KeyCode.PageUp;
	public static SHIFT_PAGE_UP: number = KeyMod.Shift | KeyCode.PageUp;

	public static PAGE_DOWN: number = KeyCode.PageDown;
	public static SHIFT_PAGE_DOWN: number = KeyMod.Shift | KeyCode.PageDown;

	public static F2: number = KeyCode.F2;

	public static CTRLCMD_S: number = KeyMod.CtrlCmd | KeyCode.KEY_S;
	public static CTRLCMD_C: number = KeyMod.CtrlCmd | KeyCode.KEY_C;
	public static CTRLCMD_V: number = KeyMod.CtrlCmd | KeyCode.KEY_V;
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
	 * See https://github.com/atom/electron/blob/master/docs/api/accelerator.md
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
		return KeyMod.chord(result, chord);
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
	 * See https://github.com/atom/electron/blob/master/docs/api/accelerator.md
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

		return KeyCode.toString(keyCode);
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

		return KeyCode.toString(keyCode);
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
		return KeyCode.toString(keyCode);
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
		return KeyCode.toString(keyCode);
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
