/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyCode, KeyCodeUtils, KeyMod, SimpleKeybinding } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';

let KEY_CODE_MAP: { [keyCode: number]: KeyCode } = {};
(function () {
	KEY_CODE_MAP[3] = KeyCode.PauseBreak; // VK_CANCEL 0x03 Control-break processing
	KEY_CODE_MAP[8] = KeyCode.Backspace;
	KEY_CODE_MAP[9] = KeyCode.Tab;
	KEY_CODE_MAP[13] = KeyCode.Enter;
	KEY_CODE_MAP[16] = KeyCode.Shift;
	KEY_CODE_MAP[17] = KeyCode.Ctrl;
	KEY_CODE_MAP[18] = KeyCode.Alt;
	KEY_CODE_MAP[19] = KeyCode.PauseBreak;
	KEY_CODE_MAP[20] = KeyCode.CapsLock;
	KEY_CODE_MAP[27] = KeyCode.Escape;
	KEY_CODE_MAP[32] = KeyCode.Space;
	KEY_CODE_MAP[33] = KeyCode.PageUp;
	KEY_CODE_MAP[34] = KeyCode.PageDown;
	KEY_CODE_MAP[35] = KeyCode.End;
	KEY_CODE_MAP[36] = KeyCode.Home;
	KEY_CODE_MAP[37] = KeyCode.LeftArrow;
	KEY_CODE_MAP[38] = KeyCode.UpArrow;
	KEY_CODE_MAP[39] = KeyCode.RightArrow;
	KEY_CODE_MAP[40] = KeyCode.DownArrow;
	KEY_CODE_MAP[45] = KeyCode.Insert;
	KEY_CODE_MAP[46] = KeyCode.Delete;

	KEY_CODE_MAP[48] = KeyCode.KEY_0;
	KEY_CODE_MAP[49] = KeyCode.KEY_1;
	KEY_CODE_MAP[50] = KeyCode.KEY_2;
	KEY_CODE_MAP[51] = KeyCode.KEY_3;
	KEY_CODE_MAP[52] = KeyCode.KEY_4;
	KEY_CODE_MAP[53] = KeyCode.KEY_5;
	KEY_CODE_MAP[54] = KeyCode.KEY_6;
	KEY_CODE_MAP[55] = KeyCode.KEY_7;
	KEY_CODE_MAP[56] = KeyCode.KEY_8;
	KEY_CODE_MAP[57] = KeyCode.KEY_9;

	KEY_CODE_MAP[65] = KeyCode.KEY_A;
	KEY_CODE_MAP[66] = KeyCode.KEY_B;
	KEY_CODE_MAP[67] = KeyCode.KEY_C;
	KEY_CODE_MAP[68] = KeyCode.KEY_D;
	KEY_CODE_MAP[69] = KeyCode.KEY_E;
	KEY_CODE_MAP[70] = KeyCode.KEY_F;
	KEY_CODE_MAP[71] = KeyCode.KEY_G;
	KEY_CODE_MAP[72] = KeyCode.KEY_H;
	KEY_CODE_MAP[73] = KeyCode.KEY_I;
	KEY_CODE_MAP[74] = KeyCode.KEY_J;
	KEY_CODE_MAP[75] = KeyCode.KEY_K;
	KEY_CODE_MAP[76] = KeyCode.KEY_L;
	KEY_CODE_MAP[77] = KeyCode.KEY_M;
	KEY_CODE_MAP[78] = KeyCode.KEY_N;
	KEY_CODE_MAP[79] = KeyCode.KEY_O;
	KEY_CODE_MAP[80] = KeyCode.KEY_P;
	KEY_CODE_MAP[81] = KeyCode.KEY_Q;
	KEY_CODE_MAP[82] = KeyCode.KEY_R;
	KEY_CODE_MAP[83] = KeyCode.KEY_S;
	KEY_CODE_MAP[84] = KeyCode.KEY_T;
	KEY_CODE_MAP[85] = KeyCode.KEY_U;
	KEY_CODE_MAP[86] = KeyCode.KEY_V;
	KEY_CODE_MAP[87] = KeyCode.KEY_W;
	KEY_CODE_MAP[88] = KeyCode.KEY_X;
	KEY_CODE_MAP[89] = KeyCode.KEY_Y;
	KEY_CODE_MAP[90] = KeyCode.KEY_Z;

	KEY_CODE_MAP[93] = KeyCode.ContextMenu;

	KEY_CODE_MAP[96] = KeyCode.NUMPAD_0;
	KEY_CODE_MAP[97] = KeyCode.NUMPAD_1;
	KEY_CODE_MAP[98] = KeyCode.NUMPAD_2;
	KEY_CODE_MAP[99] = KeyCode.NUMPAD_3;
	KEY_CODE_MAP[100] = KeyCode.NUMPAD_4;
	KEY_CODE_MAP[101] = KeyCode.NUMPAD_5;
	KEY_CODE_MAP[102] = KeyCode.NUMPAD_6;
	KEY_CODE_MAP[103] = KeyCode.NUMPAD_7;
	KEY_CODE_MAP[104] = KeyCode.NUMPAD_8;
	KEY_CODE_MAP[105] = KeyCode.NUMPAD_9;
	KEY_CODE_MAP[106] = KeyCode.NUMPAD_MULTIPLY;
	KEY_CODE_MAP[107] = KeyCode.NUMPAD_ADD;
	KEY_CODE_MAP[108] = KeyCode.NUMPAD_SEPARATOR;
	KEY_CODE_MAP[109] = KeyCode.NUMPAD_SUBTRACT;
	KEY_CODE_MAP[110] = KeyCode.NUMPAD_DECIMAL;
	KEY_CODE_MAP[111] = KeyCode.NUMPAD_DIVIDE;

	KEY_CODE_MAP[112] = KeyCode.F1;
	KEY_CODE_MAP[113] = KeyCode.F2;
	KEY_CODE_MAP[114] = KeyCode.F3;
	KEY_CODE_MAP[115] = KeyCode.F4;
	KEY_CODE_MAP[116] = KeyCode.F5;
	KEY_CODE_MAP[117] = KeyCode.F6;
	KEY_CODE_MAP[118] = KeyCode.F7;
	KEY_CODE_MAP[119] = KeyCode.F8;
	KEY_CODE_MAP[120] = KeyCode.F9;
	KEY_CODE_MAP[121] = KeyCode.F10;
	KEY_CODE_MAP[122] = KeyCode.F11;
	KEY_CODE_MAP[123] = KeyCode.F12;
	KEY_CODE_MAP[124] = KeyCode.F13;
	KEY_CODE_MAP[125] = KeyCode.F14;
	KEY_CODE_MAP[126] = KeyCode.F15;
	KEY_CODE_MAP[127] = KeyCode.F16;
	KEY_CODE_MAP[128] = KeyCode.F17;
	KEY_CODE_MAP[129] = KeyCode.F18;
	KEY_CODE_MAP[130] = KeyCode.F19;

	KEY_CODE_MAP[144] = KeyCode.NumLock;
	KEY_CODE_MAP[145] = KeyCode.ScrollLock;

	KEY_CODE_MAP[186] = KeyCode.US_SEMICOLON;
	KEY_CODE_MAP[187] = KeyCode.US_EQUAL;
	KEY_CODE_MAP[188] = KeyCode.US_COMMA;
	KEY_CODE_MAP[189] = KeyCode.US_MINUS;
	KEY_CODE_MAP[190] = KeyCode.US_DOT;
	KEY_CODE_MAP[191] = KeyCode.US_SLASH;
	KEY_CODE_MAP[192] = KeyCode.US_BACKTICK;
	KEY_CODE_MAP[219] = KeyCode.US_OPEN_SQUARE_BRACKET;
	KEY_CODE_MAP[220] = KeyCode.US_BACKSLASH;
	KEY_CODE_MAP[221] = KeyCode.US_CLOSE_SQUARE_BRACKET;
	KEY_CODE_MAP[222] = KeyCode.US_QUOTE;
	KEY_CODE_MAP[223] = KeyCode.OEM_8;

	KEY_CODE_MAP[226] = KeyCode.OEM_102;

	if (browser.isIE) {
		KEY_CODE_MAP[91] = KeyCode.Meta;
	} else if (browser.isFirefox) {
		KEY_CODE_MAP[59] = KeyCode.US_SEMICOLON;
		KEY_CODE_MAP[107] = KeyCode.US_EQUAL;
		KEY_CODE_MAP[109] = KeyCode.US_MINUS;
		if (platform.isMacintosh) {
			KEY_CODE_MAP[224] = KeyCode.Meta;
		}
	} else if (browser.isWebKit) {
		KEY_CODE_MAP[91] = KeyCode.Meta;
		if (platform.isMacintosh) {
			// the two meta keys in the Mac have different key codes (91 and 93)
			KEY_CODE_MAP[93] = KeyCode.Meta;
		} else {
			KEY_CODE_MAP[92] = KeyCode.Meta;
		}
	}
})();

function extractKeyCode(e: KeyboardEvent): KeyCode {
	if (e.charCode) {
		// "keypress" events mostly
		let char = String.fromCharCode(e.charCode).toUpperCase();
		return KeyCodeUtils.fromString(char);
	}
	return KEY_CODE_MAP[e.keyCode] || KeyCode.Unknown;
};

export interface IKeyboardEvent {
	readonly browserEvent: KeyboardEvent;
	readonly target: HTMLElement;

	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly keyCode: KeyCode;
	readonly code: string;

	/**
	 * @internal
	 */
	toKeybinding(): SimpleKeybinding;
	equals(keybinding: number): boolean;

	preventDefault(): void;
	stopPropagation(): void;
}

const ctrlKeyMod = (platform.isMacintosh ? KeyMod.WinCtrl : KeyMod.CtrlCmd);
const altKeyMod = KeyMod.Alt;
const shiftKeyMod = KeyMod.Shift;
const metaKeyMod = (platform.isMacintosh ? KeyMod.CtrlCmd : KeyMod.WinCtrl);

export class StandardKeyboardEvent implements IKeyboardEvent {

	public readonly browserEvent: KeyboardEvent;
	public readonly target: HTMLElement;

	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly metaKey: boolean;
	public readonly keyCode: KeyCode;
	public readonly code: string;

	private _asKeybinding: number;
	private _asRuntimeKeybinding: SimpleKeybinding;

	constructor(source: KeyboardEvent) {
		let e = <KeyboardEvent>source;

		this.browserEvent = e;
		this.target = <HTMLElement>e.target;

		this.ctrlKey = e.ctrlKey;
		this.shiftKey = e.shiftKey;
		this.altKey = e.altKey;
		this.metaKey = e.metaKey;
		this.keyCode = extractKeyCode(e);
		this.code = e.code;

		// console.info(e.type + ": keyCode: " + e.keyCode + ", which: " + e.which + ", charCode: " + e.charCode + ", detail: " + e.detail + " ====> " + this.keyCode + ' -- ' + KeyCode[this.keyCode]);

		this.ctrlKey = this.ctrlKey || this.keyCode === KeyCode.Ctrl;
		this.altKey = this.altKey || this.keyCode === KeyCode.Alt;
		this.shiftKey = this.shiftKey || this.keyCode === KeyCode.Shift;
		this.metaKey = this.metaKey || this.keyCode === KeyCode.Meta;

		this._asKeybinding = this._computeKeybinding();
		this._asRuntimeKeybinding = this._computeRuntimeKeybinding();

		// console.log(`code: ${e.code}, keyCode: ${e.keyCode}, key: ${e.key}`);
	}

	public preventDefault(): void {
		if (this.browserEvent && this.browserEvent.preventDefault) {
			this.browserEvent.preventDefault();
		}
	}

	public stopPropagation(): void {
		if (this.browserEvent && this.browserEvent.stopPropagation) {
			this.browserEvent.stopPropagation();
		}
	}

	public toKeybinding(): SimpleKeybinding {
		return this._asRuntimeKeybinding;
	}

	public equals(other: number): boolean {
		return this._asKeybinding === other;
	}

	private _computeKeybinding(): number {
		let key = KeyCode.Unknown;
		if (this.keyCode !== KeyCode.Ctrl && this.keyCode !== KeyCode.Shift && this.keyCode !== KeyCode.Alt && this.keyCode !== KeyCode.Meta) {
			key = this.keyCode;
		}

		let result = 0;
		if (this.ctrlKey) {
			result |= ctrlKeyMod;
		}
		if (this.altKey) {
			result |= altKeyMod;
		}
		if (this.shiftKey) {
			result |= shiftKeyMod;
		}
		if (this.metaKey) {
			result |= metaKeyMod;
		}
		result |= key;

		return result;
	}

	private _computeRuntimeKeybinding(): SimpleKeybinding {
		let key = KeyCode.Unknown;
		if (this.keyCode !== KeyCode.Ctrl && this.keyCode !== KeyCode.Shift && this.keyCode !== KeyCode.Alt && this.keyCode !== KeyCode.Meta) {
			key = this.keyCode;
		}
		return new SimpleKeybinding(this.ctrlKey, this.shiftKey, this.altKey, this.metaKey, key);
	}
}
