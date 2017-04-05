/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';

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

export interface IReverseMap {
	[str: string]: KeyCode;
}

export class Mapping {

	_fromKeyCode: string[];
	_toKeyCode: IReverseMap;

	constructor(fromKeyCode: string[], toKeyCode: IReverseMap) {
		this._fromKeyCode = fromKeyCode;
		this._toKeyCode = toKeyCode;
	}

	fromKeyCode(keyCode: KeyCode): string {
		return this._fromKeyCode[keyCode];
	}

	toKeyCode(str: string): KeyCode {
		if (this._toKeyCode.hasOwnProperty(str)) {
			return this._toKeyCode[str];
		}
		return KeyCode.Unknown;
	}

}

function createMapping(fill1: (map: string[]) => void, fill2: (reverseMap: IReverseMap) => void): Mapping {
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
	TO_STRING_MAP[KeyCode.Unknown] = 'unknown';

	TO_STRING_MAP[KeyCode.Backspace] = 'Backspace';
	TO_STRING_MAP[KeyCode.Tab] = 'Tab';
	TO_STRING_MAP[KeyCode.Enter] = 'Enter';
	TO_STRING_MAP[KeyCode.Shift] = 'Shift';
	TO_STRING_MAP[KeyCode.Ctrl] = 'Ctrl';
	TO_STRING_MAP[KeyCode.Alt] = 'Alt';
	TO_STRING_MAP[KeyCode.PauseBreak] = 'PauseBreak';
	TO_STRING_MAP[KeyCode.CapsLock] = 'CapsLock';
	TO_STRING_MAP[KeyCode.Escape] = 'Escape';
	TO_STRING_MAP[KeyCode.Space] = 'Space';
	TO_STRING_MAP[KeyCode.PageUp] = 'PageUp';
	TO_STRING_MAP[KeyCode.PageDown] = 'PageDown';
	TO_STRING_MAP[KeyCode.End] = 'End';
	TO_STRING_MAP[KeyCode.Home] = 'Home';
	TO_STRING_MAP[KeyCode.LeftArrow] = 'LeftArrow';
	TO_STRING_MAP[KeyCode.UpArrow] = 'UpArrow';
	TO_STRING_MAP[KeyCode.RightArrow] = 'RightArrow';
	TO_STRING_MAP[KeyCode.DownArrow] = 'DownArrow';
	TO_STRING_MAP[KeyCode.Insert] = 'Insert';
	TO_STRING_MAP[KeyCode.Delete] = 'Delete';

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

	TO_STRING_MAP[KeyCode.Meta] = 'Meta';
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


	TO_STRING_MAP[KeyCode.NumLock] = 'NumLock';
	TO_STRING_MAP[KeyCode.ScrollLock] = 'ScrollLock';

	TO_STRING_MAP[KeyCode.US_SEMICOLON] = ';';
	TO_STRING_MAP[KeyCode.US_EQUAL] = '=';
	TO_STRING_MAP[KeyCode.US_COMMA] = ',';
	TO_STRING_MAP[KeyCode.US_MINUS] = '-';
	TO_STRING_MAP[KeyCode.US_DOT] = '.';
	TO_STRING_MAP[KeyCode.US_SLASH] = '/';
	TO_STRING_MAP[KeyCode.US_BACKTICK] = '`';
	TO_STRING_MAP[KeyCode.US_OPEN_SQUARE_BRACKET] = '[';
	TO_STRING_MAP[KeyCode.US_BACKSLASH] = '\\';
	TO_STRING_MAP[KeyCode.US_CLOSE_SQUARE_BRACKET] = ']';
	TO_STRING_MAP[KeyCode.US_QUOTE] = '\'';
	TO_STRING_MAP[KeyCode.OEM_8] = 'OEM_8';
	TO_STRING_MAP[KeyCode.OEM_102] = 'OEM_102';

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


export let USER_SETTINGS = createMapping((TO_USER_SETTINGS_MAP) => {
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
	export function toString(key: KeyCode): string {
		return STRING.fromKeyCode(key);
	}
	export function fromString(key: string): KeyCode {
		return STRING.toKeyCode(key);
	}
}

/**
 * Binary encoding strategy:
 * ```
 *    1111 11
 *    5432 1098 7654 3210
 *    ---- CSAW KKKK KKKK
 *  C = bit 11 = ctrlCmd flag
 *  S = bit 10 = shift flag
 *  A = bit 9 = alt flag
 *  W = bit 8 = winCtrl flag
 *  K = bits 0-7 = key code
 * ```
 */
const enum BinaryKeybindingsMask {
	CtrlCmd = (1 << 11) >>> 0,
	Shift = (1 << 10) >>> 0,
	Alt = (1 << 9) >>> 0,
	WinCtrl = (1 << 8) >>> 0,
	KeyCode = 0x000000ff
}

export const enum KeyMod {
	CtrlCmd = (1 << 11) >>> 0,
	Shift = (1 << 10) >>> 0,
	Alt = (1 << 9) >>> 0,
	WinCtrl = (1 << 8) >>> 0,
}

export function KeyChord(firstPart: number, secondPart: number): number {
	let chordPart = ((secondPart & 0x0000ffff) << 16) >>> 0;
	return (firstPart | chordPart) >>> 0;
}

export function createKeybinding(keybinding: number, OS: OperatingSystem): Keybinding {
	if (keybinding === 0) {
		return null;
	}
	const firstPart = (keybinding & 0x0000ffff) >>> 0;
	const chordPart = (keybinding & 0xffff0000) >>> 16;
	if (chordPart !== 0) {
		return new ChordKeybinding(
			createSimpleKeybinding(firstPart, OS),
			createSimpleKeybinding(chordPart, OS),
		);
	}
	return createSimpleKeybinding(firstPart, OS);
}

export function createSimpleKeybinding(keybinding: number, OS: OperatingSystem): SimpleKeybinding {

	const ctrlCmd = (keybinding & BinaryKeybindingsMask.CtrlCmd ? true : false);
	const winCtrl = (keybinding & BinaryKeybindingsMask.WinCtrl ? true : false);

	const ctrlKey = (OS === OperatingSystem.Macintosh ? winCtrl : ctrlCmd);
	const shiftKey = (keybinding & BinaryKeybindingsMask.Shift ? true : false);
	const altKey = (keybinding & BinaryKeybindingsMask.Alt ? true : false);
	const metaKey = (OS === OperatingSystem.Macintosh ? ctrlCmd : winCtrl);
	const keyCode = (keybinding & BinaryKeybindingsMask.KeyCode);

	return new SimpleKeybinding(ctrlKey, shiftKey, altKey, metaKey, keyCode);
}

export const enum KeybindingType {
	Simple = 1,
	Chord = 2
}

export class SimpleKeybinding {
	public readonly type = KeybindingType.Simple;

	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly metaKey: boolean;
	public readonly keyCode: KeyCode;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, keyCode: KeyCode) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.keyCode = keyCode;
	}

	public equals(other: Keybinding): boolean {
		if (other.type !== KeybindingType.Simple) {
			return false;
		}
		return (
			this.ctrlKey === other.ctrlKey
			&& this.shiftKey === other.shiftKey
			&& this.altKey === other.altKey
			&& this.metaKey === other.metaKey
			&& this.keyCode === other.keyCode
		);
	}

	public isModifierKey(): boolean {
		return (
			this.keyCode === KeyCode.Unknown
			|| this.keyCode === KeyCode.Ctrl
			|| this.keyCode === KeyCode.Meta
			|| this.keyCode === KeyCode.Alt
			|| this.keyCode === KeyCode.Shift
		);
	}

	/**
	 * Does this keybinding refer to the key code of a modifier and it also has the modifier flag?
	 */
	public isDuplicateModifierCase(): boolean {
		return (
			(this.ctrlKey && this.keyCode === KeyCode.Ctrl)
			|| (this.shiftKey && this.keyCode === KeyCode.Shift)
			|| (this.altKey && this.keyCode === KeyCode.Alt)
			|| (this.metaKey && this.keyCode === KeyCode.Meta)
		);
	}
}

export class ChordKeybinding {
	public readonly type = KeybindingType.Chord;

	public readonly firstPart: SimpleKeybinding;
	public readonly chordPart: SimpleKeybinding;

	constructor(firstPart: SimpleKeybinding, chordPart: SimpleKeybinding) {
		this.firstPart = firstPart;
		this.chordPart = chordPart;
	}
}

export type Keybinding = SimpleKeybinding | ChordKeybinding;

/**
 * A resolved keybinding.
 */
export abstract class ResolvedKeybinding {
	/**
	 * This prints the binding in a format suitable for displaying in the UI.
	 */
	public abstract getLabel(): string;
	/**
	 * Returns the UI label of the binding without modifiers
	 */
	public abstract getLabelWithoutModifiers(): string;
	/**
	 * This prints the binding in a format suitable for ARIA.
	 */
	public abstract getAriaLabel(): string;
	/**
	 * Returns the ARIA label of the bindings without modifiers
	 */
	public abstract getAriaLabelWithoutModifiers(): string;
	/**
	 * This prints the binding in a format suitable for electron's accelerators.
	 * See https://github.com/electron/electron/blob/master/docs/api/accelerator.md
	 */
	public abstract getElectronAccelerator(): string;
	/**
	 * This prints the binding in a format suitable for user settings.
	 */
	public abstract getUserSettingsLabel(): string;
	/**
	 * Is the user settings label reflecting the label?
	 */
	public abstract isWYSIWYG(): boolean;

	/**
	 * Is the binding a chord?
	 */
	public abstract isChord(): boolean;
	/**
	 * Does this binding use the ctrl modifier key.
	 * If it is a chord, it always returns false.
	 */
	public abstract hasCtrlModifier(): boolean;
	/**
	 * Does this binding use the shift modifier key.
	 * If it is a chord, it always returns false.
	 */
	public abstract hasShiftModifier(): boolean;
	/**
	 * Does this binding use the alt modifier key.
	 * If it is a chord, it always returns false.
	 */
	public abstract hasAltModifier(): boolean;
	/**
	 * Does this binding use the meta modifier key.
	 * If it is a chord, it always returns false.
	 */
	public abstract hasMetaModifier(): boolean;

	/**
	 * Returns the firstPart, chordPart that should be used for dispatching.
	 */
	public abstract getDispatchParts(): [string, string];
	/**
	 * Returns the firstPart, chordPart of the keybinding
	 */
	public abstract getParts(): [ResolvedKeybinding, ResolvedKeybinding];
}
