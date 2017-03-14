/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';
import { SimpleKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import { KeyboardEventCode, KeyboardEventCodeUtils } from 'vs/workbench/services/keybinding/common/keyboardEventCode';
import { CharCode } from 'vs/base/common/charCode';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/abstractKeybindingService';

export interface IKeyMapping {
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;

	valueIsDeadKey?: boolean;
	withShiftIsDeadKey?: boolean;
	withAltGrIsDeadKey?: boolean;
	withShiftAltGrIsDeadKey?: boolean;
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

function cannotMapSimpleKeybinding(keybinding: SimpleKeybinding, OS: OperatingSystem, reason: string): void {
	let usLayout = new USLayoutResolvedKeybinding(keybinding, OS);
	log(`No key combination can produce desired simple keybinding: ${usLayout.getUserSettingsLabel()} - ${reason}.`);
}

/**
 * -1 if a KeyCode => keyboardEvent.code mapping depends on kb layout.
 */
const IMMUTABLE_KEY_CODE_TO_CODE: KeyboardEventCode[] = [];

/**
 * Chars that will be remapped.
 */
const REMAP_CHARS = [
	CharCode.a, CharCode.b, CharCode.c, CharCode.d, CharCode.e, CharCode.f, CharCode.g,
	CharCode.h, CharCode.i, CharCode.j, CharCode.k, CharCode.l, CharCode.m, CharCode.n,
	CharCode.o, CharCode.p, CharCode.q, CharCode.r, CharCode.s, CharCode.t, CharCode.u,
	CharCode.v, CharCode.w, CharCode.x, CharCode.y, CharCode.z,

	CharCode.A, CharCode.B, CharCode.C, CharCode.D, CharCode.E, CharCode.F, CharCode.G,
	CharCode.H, CharCode.I, CharCode.J, CharCode.K, CharCode.L, CharCode.M, CharCode.N,
	CharCode.O, CharCode.P, CharCode.Q, CharCode.R, CharCode.S, CharCode.T, CharCode.U,
	CharCode.V, CharCode.W, CharCode.X, CharCode.Y, CharCode.Z,

	CharCode.Semicolon, CharCode.Colon,
	CharCode.Equals, CharCode.Plus,
	CharCode.Comma, CharCode.LessThan,
	CharCode.Dash, CharCode.Underline,
	CharCode.Period, CharCode.GreaterThan,
	CharCode.Slash, CharCode.QuestionMark,
	CharCode.BackTick, CharCode.Tilde,
	CharCode.OpenSquareBracket, CharCode.OpenCurlyBrace,
	CharCode.Backslash, CharCode.Pipe,
	CharCode.CloseSquareBracket, CharCode.CloseCurlyBrace,
	CharCode.SingleQuote, CharCode.DoubleQuote,
];

const REMAP_KEYBOARD_EVENT_CODES = [
	KeyboardEventCode.KeyA,
	KeyboardEventCode.KeyB,
	KeyboardEventCode.KeyC,
	KeyboardEventCode.KeyD,
	KeyboardEventCode.KeyE,
	KeyboardEventCode.KeyF,
	KeyboardEventCode.KeyG,
	KeyboardEventCode.KeyH,
	KeyboardEventCode.KeyI,
	KeyboardEventCode.KeyJ,
	KeyboardEventCode.KeyK,
	KeyboardEventCode.KeyL,
	KeyboardEventCode.KeyM,
	KeyboardEventCode.KeyN,
	KeyboardEventCode.KeyO,
	KeyboardEventCode.KeyP,
	KeyboardEventCode.KeyQ,
	KeyboardEventCode.KeyR,
	KeyboardEventCode.KeyS,
	KeyboardEventCode.KeyT,
	KeyboardEventCode.KeyU,
	KeyboardEventCode.KeyV,
	KeyboardEventCode.KeyW,
	KeyboardEventCode.KeyX,
	KeyboardEventCode.KeyY,
	KeyboardEventCode.KeyZ,
	KeyboardEventCode.Digit1,
	KeyboardEventCode.Digit2,
	KeyboardEventCode.Digit3,
	KeyboardEventCode.Digit4,
	KeyboardEventCode.Digit5,
	KeyboardEventCode.Digit6,
	KeyboardEventCode.Digit7,
	KeyboardEventCode.Digit8,
	KeyboardEventCode.Digit9,
	KeyboardEventCode.Digit0,
	KeyboardEventCode.Minus,
	KeyboardEventCode.Equal,
	KeyboardEventCode.BracketLeft,
	KeyboardEventCode.BracketRight,
	KeyboardEventCode.Backslash,
	KeyboardEventCode.IntlHash,
	KeyboardEventCode.Semicolon,
	KeyboardEventCode.Quote,
	KeyboardEventCode.Backquote,
	KeyboardEventCode.Comma,
	KeyboardEventCode.Period,
	KeyboardEventCode.Slash,
	KeyboardEventCode.IntlBackslash
];

const enum ModifierState {
	None = 0,
	Shift = 1,
	AltGr = 2,
	ShiftAltGr = 3
}

export class HardwareKeyPress {
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly code: KeyboardEventCode;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, code: KeyboardEventCode) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.code = code;
	}
}

export class KeyboardMapper {

	private readonly _OS: OperatingSystem;
	private readonly _remapChars2: HardwareKeyPress[][];

	constructor(mapping: IKeyboardMapping, OS: OperatingSystem) {

		this._remapChars2 = [];
		let maxCharCode = REMAP_CHARS.reduce((prev, curr) => Math.max(prev, curr));
		for (let i = 0; i <= maxCharCode; i++) {
			this._remapChars2[i] = null;
		}

		for (let strCode in mapping) {
			if (mapping.hasOwnProperty(strCode)) {
				const code = KeyboardEventCodeUtils.toEnum(strCode);
				if (code === KeyboardEventCode.None) {
					log(`Unknown code ${strCode} in mapping.`);
					continue;
				}

				const results = mapping[strCode];

				this._register(code, ModifierState.None, results.value);
				this._register(code, ModifierState.Shift, results.withShift);
				this._register(code, ModifierState.AltGr, results.withAltGr);
				this._register(code, ModifierState.ShiftAltGr, results.withShiftAltGr);
			}
		}

		this._OS = OS;

		for (let i = 0; i < REMAP_CHARS.length; i++) {
			const charCode = REMAP_CHARS[i];
			if (this._remapChars2[charCode] === null) {
				log(`Could not find any key combination producing '${String.fromCharCode(charCode)}'`);
			}
		}
	}

	private _register(code: KeyboardEventCode, mod: ModifierState, char: string): void {
		if (char.length === 0) {
			return;
		}
		const charCode = char.charCodeAt(0);

		if (REMAP_CHARS.indexOf(charCode) === -1) {
			return;
		}
		if (REMAP_KEYBOARD_EVENT_CODES.indexOf(code) === -1) {
			return;
		}

		let entry: HardwareKeyPress = null;
		if (mod === ModifierState.None) {
			entry = new HardwareKeyPress(false, false, false, false, code);
		} else if (mod === ModifierState.Shift) {
			entry = new HardwareKeyPress(false, true, false, false, code);
		} else if (mod === ModifierState.AltGr) {
			entry = new HardwareKeyPress(true, false, true, false, code);
		} else if (mod === ModifierState.ShiftAltGr) {
			entry = new HardwareKeyPress(true, true, true, false, code);
		} else {
			throw new Error('unexpected');
		}

		if (this._remapChars2[charCode] === null) {
			// no duplicates so far
			this._remapChars2[charCode] = [entry];
			return;
		}

		const list = this._remapChars2[charCode];
		// Do not register if it already sits under the same code
		for (let i = 0, len = list.length; i < len; i++) {
			if (list[i].code === code) {
				return;
			}
		}
		list.push(entry);
	}

	private _doMapSimpleKeybinding(source: SimpleKeybinding, keyCombo: HardwareKeyPress, ctrlKey: boolean, altKey: boolean, metaKey: boolean, charCode: number): HardwareKeyPress {
		if ((keyCombo.ctrlKey && ctrlKey) || (keyCombo.altKey && altKey)) {
			cannotMapSimpleKeybinding(source, this._OS, `ctrl or alt modifiers are needed to produce '${String.fromCharCode(charCode)}'`);
			return null;
		}

		const shiftKey = keyCombo.shiftKey;
		if (keyCombo.ctrlKey) {
			ctrlKey = true;
		}
		if (keyCombo.altKey) {
			altKey = true;
		}

		return new HardwareKeyPress(ctrlKey, shiftKey, altKey, metaKey, keyCombo.code);
	}

	private _mapSimpleKeybinding(source: SimpleKeybinding, ctrlKey: boolean, altKey: boolean, metaKey: boolean, charCode: number): HardwareKeyPress[] {
		const keyCombos = this._remapChars2[charCode];

		let result: HardwareKeyPress[] = [], resultLen = 0;
		if (keyCombos !== null) {
			for (let i = 0, len = keyCombos.length; i < len; i++) {
				const keyCombo = keyCombos[i];
				let oneResult = this._doMapSimpleKeybinding(source, keyCombo, ctrlKey, altKey, metaKey, charCode);
				if (oneResult !== null) {
					result[resultLen++] = oneResult;
				}
			}
		} else {
			cannotMapSimpleKeybinding(source, this._OS, `'${String.fromCharCode(charCode)}' cannot be produced`);
		}

		return result;
	}

	public mapSimpleKeybinding(keybinding: SimpleKeybinding): HardwareKeyPress[] {
		const ctrlCmd = keybinding.hasCtrlCmd();
		const winCtrl = keybinding.hasWinCtrl();

		const ctrlKey = (this._OS === OperatingSystem.Macintosh ? winCtrl : ctrlCmd);
		const metaKey = (this._OS === OperatingSystem.Macintosh ? ctrlCmd : winCtrl);
		const shiftKey = keybinding.hasShift();
		const altKey = keybinding.hasAlt();
		const keyCode = keybinding.getKeyCode();

		if (IMMUTABLE_KEY_CODE_TO_CODE[keyCode] !== -1) {
			const keyboardEventCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
			return [new HardwareKeyPress(ctrlKey, shiftKey, altKey, metaKey, keyboardEventCode)];
		}

		let desiredCharCode = 0;

		if (keyCode >= KeyCode.KEY_A && keyCode <= KeyCode.KEY_Z) {
			if (shiftKey) {
				desiredCharCode = CharCode.A + (keyCode - KeyCode.KEY_A);
			} else {
				desiredCharCode = CharCode.a + (keyCode - KeyCode.KEY_A);
			}
		} else {
			switch (keyCode) {
				case KeyCode.US_SEMICOLON:
					desiredCharCode = (!shiftKey ? CharCode.Semicolon : CharCode.Colon);
					break;
				case KeyCode.US_EQUAL:
					desiredCharCode = (!shiftKey ? CharCode.Equals : CharCode.Plus);
					break;
				case KeyCode.US_COMMA:
					desiredCharCode = (!shiftKey ? CharCode.Comma : CharCode.LessThan);
					break;
				case KeyCode.US_MINUS:
					desiredCharCode = (!shiftKey ? CharCode.Dash : CharCode.Underline);
					break;
				case KeyCode.US_DOT:
					desiredCharCode = (!shiftKey ? CharCode.Period : CharCode.GreaterThan);
					break;
				case KeyCode.US_SLASH:
					desiredCharCode = (!shiftKey ? CharCode.Slash : CharCode.QuestionMark);
					break;
				case KeyCode.US_BACKTICK:
					desiredCharCode = (!shiftKey ? CharCode.BackTick : CharCode.Tilde);
					break;
				case KeyCode.US_OPEN_SQUARE_BRACKET:
					desiredCharCode = (!shiftKey ? CharCode.OpenSquareBracket : CharCode.OpenCurlyBrace);
					break;
				case KeyCode.US_BACKSLASH:
					desiredCharCode = (!shiftKey ? CharCode.Backslash : CharCode.Pipe);
					break;
				case KeyCode.US_CLOSE_SQUARE_BRACKET:
					desiredCharCode = (!shiftKey ? CharCode.CloseSquareBracket : CharCode.CloseCurlyBrace);
					break;
				case KeyCode.US_QUOTE:
					desiredCharCode = (!shiftKey ? CharCode.SingleQuote : CharCode.DoubleQuote);
					break;
			}
		}

		if (desiredCharCode === 0) {
			// OEM_8 = 91,
			// OEM_102 = 92,
			cannotMapSimpleKeybinding(keybinding, this._OS, `unknown character`);
			return null;
		}

		return this._mapSimpleKeybinding(keybinding, ctrlKey, altKey, metaKey, desiredCharCode);
	}
}

(function () {
	let currentLength = 0;
	function d(keyCode: KeyCode, code: KeyboardEventCode): void {
		if (keyCode > currentLength) {
			for (let i = currentLength; i < keyCode; i++) {
				IMMUTABLE_KEY_CODE_TO_CODE[i] = -1;
			}
		}
		IMMUTABLE_KEY_CODE_TO_CODE[keyCode] = code;
		currentLength = keyCode + 1;
	}

	// Unknown = 0,

	d(KeyCode.Backspace, KeyboardEventCode.Backspace);
	d(KeyCode.Tab, KeyboardEventCode.Tab);
	d(KeyCode.Enter, KeyboardEventCode.Enter);

	d(KeyCode.Shift, KeyboardEventCode.ShiftLeft);
	// TODO => ShiftLeft, ShiftRight

	d(KeyCode.Ctrl, KeyboardEventCode.ControlLeft);
	// TODO => ControlLeft, ControlRight

	d(KeyCode.Alt, KeyboardEventCode.AltLeft);
	// TODO => AltLeft, AltRight

	d(KeyCode.PauseBreak, KeyboardEventCode.Pause);
	d(KeyCode.CapsLock, KeyboardEventCode.CapsLock);
	d(KeyCode.Escape, KeyboardEventCode.Escape);
	d(KeyCode.Space, KeyboardEventCode.Space);
	d(KeyCode.PageUp, KeyboardEventCode.PageUp);
	d(KeyCode.PageDown, KeyboardEventCode.PageDown);
	d(KeyCode.End, KeyboardEventCode.End);
	d(KeyCode.Home, KeyboardEventCode.Home);
	d(KeyCode.LeftArrow, KeyboardEventCode.ArrowLeft);
	d(KeyCode.UpArrow, KeyboardEventCode.ArrowUp);
	d(KeyCode.RightArrow, KeyboardEventCode.ArrowRight);
	d(KeyCode.DownArrow, KeyboardEventCode.ArrowDown);
	d(KeyCode.Insert, KeyboardEventCode.Insert);
	d(KeyCode.Delete, KeyboardEventCode.Delete);

	d(KeyCode.KEY_0, KeyboardEventCode.Digit0);
	d(KeyCode.KEY_1, KeyboardEventCode.Digit1);
	d(KeyCode.KEY_2, KeyboardEventCode.Digit2);
	d(KeyCode.KEY_3, KeyboardEventCode.Digit3);
	d(KeyCode.KEY_4, KeyboardEventCode.Digit4);
	d(KeyCode.KEY_5, KeyboardEventCode.Digit5);
	d(KeyCode.KEY_6, KeyboardEventCode.Digit6);
	d(KeyCode.KEY_7, KeyboardEventCode.Digit7);
	d(KeyCode.KEY_8, KeyboardEventCode.Digit8);
	d(KeyCode.KEY_9, KeyboardEventCode.Digit9);

	d(KeyCode.Meta, KeyboardEventCode.MetaLeft);
	// TODO => MetaLeft, MetaRight
	d(KeyCode.ContextMenu, KeyboardEventCode.ContextMenu);

	d(KeyCode.F1, KeyboardEventCode.F1);
	d(KeyCode.F2, KeyboardEventCode.F2);
	d(KeyCode.F3, KeyboardEventCode.F3);
	d(KeyCode.F4, KeyboardEventCode.F4);
	d(KeyCode.F5, KeyboardEventCode.F5);
	d(KeyCode.F6, KeyboardEventCode.F6);
	d(KeyCode.F7, KeyboardEventCode.F7);
	d(KeyCode.F8, KeyboardEventCode.F8);
	d(KeyCode.F9, KeyboardEventCode.F9);
	d(KeyCode.F10, KeyboardEventCode.F10);
	d(KeyCode.F11, KeyboardEventCode.F11);
	d(KeyCode.F12, KeyboardEventCode.F12);
	d(KeyCode.F13, KeyboardEventCode.F13);
	d(KeyCode.F14, KeyboardEventCode.F14);
	d(KeyCode.F15, KeyboardEventCode.F15);
	d(KeyCode.F16, KeyboardEventCode.F16);
	d(KeyCode.F17, KeyboardEventCode.F17);
	d(KeyCode.F18, KeyboardEventCode.F18);
	d(KeyCode.F19, KeyboardEventCode.F19);

	d(KeyCode.NumLock, KeyboardEventCode.NumLock);
	d(KeyCode.ScrollLock, KeyboardEventCode.ScrollLock);

	d(KeyCode.NUMPAD_0, KeyboardEventCode.Numpad0);
	d(KeyCode.NUMPAD_1, KeyboardEventCode.Numpad1);
	d(KeyCode.NUMPAD_2, KeyboardEventCode.Numpad2);
	d(KeyCode.NUMPAD_3, KeyboardEventCode.Numpad3);
	d(KeyCode.NUMPAD_4, KeyboardEventCode.Numpad4);
	d(KeyCode.NUMPAD_5, KeyboardEventCode.Numpad5);
	d(KeyCode.NUMPAD_6, KeyboardEventCode.Numpad6);
	d(KeyCode.NUMPAD_7, KeyboardEventCode.Numpad7);
	d(KeyCode.NUMPAD_8, KeyboardEventCode.Numpad8);
	d(KeyCode.NUMPAD_9, KeyboardEventCode.Numpad9);

	d(KeyCode.NUMPAD_MULTIPLY, KeyboardEventCode.NumpadMultiply);
	d(KeyCode.NUMPAD_ADD, KeyboardEventCode.NumpadAdd);
	d(KeyCode.NUMPAD_SEPARATOR, KeyboardEventCode.NumpadComma);
	d(KeyCode.NUMPAD_SUBTRACT, KeyboardEventCode.NumpadSubtract);
	d(KeyCode.NUMPAD_DECIMAL, KeyboardEventCode.NumpadDecimal);
	d(KeyCode.NUMPAD_DIVIDE, KeyboardEventCode.NumpadDivide);
})();
