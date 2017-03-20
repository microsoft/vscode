/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';
import { KeyCode, ResolvedKeybinding, KeyCodeUtils, SimpleKeybinding, Keybinding, KeybindingType, USER_SETTINGS } from 'vs/base/common/keyCodes';
import { KeyboardEventCode, KeyboardEventCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE } from 'vs/workbench/services/keybinding/common/keyboardEventCode';
import { CharCode } from 'vs/base/common/charCode';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { UILabelProvider, AriaLabelProvider, UserSettingsLabelProvider, ElectronAcceleratorLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
import { IKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';

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

const CHAR_CODE_TO_KEY_CODE: { keyCode: KeyCode; shiftKey: boolean }[] = [];

export class HardwareKeypress {
	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly metaKey: boolean;
	public readonly code: KeyboardEventCode;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, code: KeyboardEventCode) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.code = code;
	}
}

export class NativeResolvedKeybinding extends ResolvedKeybinding {

	private readonly _mapper: MacLinuxKeyboardMapper;
	private readonly _OS: OperatingSystem;
	private readonly _firstPart: HardwareKeypress;
	private readonly _chordPart: HardwareKeypress;

	constructor(mapper: MacLinuxKeyboardMapper, OS: OperatingSystem, firstPart: HardwareKeypress, chordPart: HardwareKeypress) {
		super();
		this._mapper = mapper;
		this._OS = OS;
		this._firstPart = firstPart;
		this._chordPart = chordPart;
	}

	public getLabel(): string {
		let firstPart = this._firstPart ? this._mapper.getUILabelForHardwareCode(this._firstPart.code) : null;
		let chordPart = this._chordPart ? this._mapper.getUILabelForHardwareCode(this._chordPart.code) : null;
		return UILabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, this._OS);
	}

	public getAriaLabel(): string {
		let firstPart = this._firstPart ? this._mapper.getAriaLabelForHardwareCode(this._firstPart.code) : null;
		let chordPart = this._chordPart ? this._mapper.getAriaLabelForHardwareCode(this._chordPart.code) : null;
		return AriaLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, this._OS);
	}

	public getHTMLLabel(): IHTMLContentElement[] {
		let firstPart = this._firstPart ? this._mapper.getUILabelForHardwareCode(this._firstPart.code) : null;
		let chordPart = this._chordPart ? this._mapper.getUILabelForHardwareCode(this._chordPart.code) : null;
		return UILabelProvider.toHTMLLabel(this._firstPart, firstPart, this._chordPart, chordPart, this._OS);
	}

	public getElectronAccelerator(): string {
		if (this._chordPart !== null) {
			// Electron cannot handle chords
			return null;
		}

		let firstPart = this._firstPart ? this._mapper.getElectronLabelForHardwareCode(this._firstPart.code) : null;
		return ElectronAcceleratorLabelProvider.toLabel(this._firstPart, firstPart, null, null, this._OS);
	}

	public getUserSettingsLabel(): string {
		let firstPart = this._firstPart ? this._mapper.getUserSettingsLabel(this._firstPart.code) : null;
		let chordPart = this._chordPart ? this._mapper.getUserSettingsLabel(this._chordPart.code) : null;
		return UserSettingsLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, this._OS);
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
		let firstPart = this._firstPart ? this._mapper.getDispatchStrForHardwareKeypress(this._firstPart) : null;
		let chordPart = this._chordPart ? this._mapper.getDispatchStrForHardwareKeypress(this._chordPart) : null;
		return [firstPart, chordPart];
	}
}

interface IHardwareCodeMapping {
	code: KeyboardEventCode;
	value: number;
	withShift: number;
	withAltGr: number;
	withShiftAltGr: number;
}

export class MacLinuxKeyboardMapper implements IKeyboardMapper {

	private readonly _OS: OperatingSystem;
	private readonly _codeInfo: IHardwareCodeMapping[];
	private readonly _hwToKb: number[] = [];
	private readonly _hwToLabel: string[] = [];
	private readonly _hwToDispatch: string[] = [];
	private readonly _kbToHw: number[][] = [];

	constructor(rawMappings: IKeyboardMapping, OS: OperatingSystem) {

		this._OS = OS;

		this._hwToKb = [];
		this._kbToHw = [];
		this._hwToLabel = [];
		this._hwToDispatch = [];

		for (let code = KeyboardEventCode.None; code < KeyboardEventCode.MAX_VALUE; code++) {
			const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[code];
			if (immutableKeyCode !== -1) {
				this._registerAllCombos1(false, false, false, code, immutableKeyCode);
				this._hwToLabel[code] = KeyCodeUtils.toString(immutableKeyCode);

				if (immutableKeyCode === KeyCode.Unknown || immutableKeyCode === KeyCode.Ctrl || immutableKeyCode === KeyCode.Meta || immutableKeyCode === KeyCode.Alt || immutableKeyCode === KeyCode.Shift) {
					this._hwToDispatch[code] = null; // cannot dispatch on this hw code
				} else {
					this._hwToDispatch[code] = `[${KeyboardEventCodeUtils.toString(code)}]`;
				}
			}
		}

		this._codeInfo = [];
		let mappings: IHardwareCodeMapping[] = [], mappingsLen = 0;
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
				const value = MacLinuxKeyboardMapper._getCharCode(rawMapping.value);
				const withShift = MacLinuxKeyboardMapper._getCharCode(rawMapping.withShift);
				const withAltGr = MacLinuxKeyboardMapper._getCharCode(rawMapping.withAltGr);
				const withShiftAltGr = MacLinuxKeyboardMapper._getCharCode(rawMapping.withShiftAltGr);

				const mapping: IHardwareCodeMapping = {
					code: code,
					value: value,
					withShift: withShift,
					withAltGr: withAltGr,
					withShiftAltGr: withShiftAltGr,
				};
				mappings[mappingsLen++] = mapping;
				this._codeInfo[code] = mapping;

				this._hwToDispatch[code] = `[${KeyboardEventCodeUtils.toString(code)}]`;

				if (value >= CharCode.a && value <= CharCode.z) {
					this._hwToLabel[code] = String.fromCharCode(CharCode.A + (value - CharCode.a));
				} else if (value) {
					this._hwToLabel[code] = String.fromCharCode(value);
				} else {
					this._hwToLabel[code] = null;
				}
			}
		}

		// Handle all `withShiftAltGr` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const withShiftAltGr = mapping.withShiftAltGr;
			if (withShiftAltGr === mapping.withAltGr || withShiftAltGr === mapping.withShift || withShiftAltGr === mapping.value) {
				// handled below
				continue;
			}
			this._registerCharCode(mapping.code, true, true, true, withShiftAltGr);
		}
		// Handle all `withAltGr` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const withAltGr = mapping.withAltGr;
			if (withAltGr === mapping.withShift || withAltGr === mapping.value) {
				// handled below
				continue;
			}
			this._registerCharCode(mapping.code, true, false, true, withAltGr);
		}
		// Handle all `withShift` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const withShift = mapping.withShift;
			if (withShift === mapping.value) {
				// handled below
				continue;
			}
			this._registerCharCode(mapping.code, false, true, false, withShift);
		}
		// Handle all `value` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			this._registerCharCode(mapping.code, false, false, false, mapping.value);
		}
		// // Handle all left-over available digits
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit1, KeyCode.KEY_1);
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit2, KeyCode.KEY_2);
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit3, KeyCode.KEY_3);
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit4, KeyCode.KEY_4);
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit5, KeyCode.KEY_5);
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit6, KeyCode.KEY_6);
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit7, KeyCode.KEY_7);
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit8, KeyCode.KEY_8);
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit9, KeyCode.KEY_9);
		this._registerAllCombos1(false, false, false, KeyboardEventCode.Digit0, KeyCode.KEY_0);

		for (let i = 0; i < KeyboardEventCode.MAX_VALUE; i++) {
			let base = (i << 3);
			for (let j = 0; j < 8; j++) {
				let actual = base + j;
				let entry = this._hwToKb[actual];
				if (typeof entry === 'undefined') {
					log(`${KeyboardEventCodeUtils.toString(i)} - ${j.toString(2)} --- is missing`);
				}
			}
		}
	}

	public dumpDebugInfo(): string {
		let result: string[] = [];

		let cnt = 0;
		result.push(`-----------------------------------------------------------------------------------------------------------------------------------`);
		for (let code = KeyboardEventCode.None; code < KeyboardEventCode.MAX_VALUE; code++) {
			if (IMMUTABLE_CODE_TO_KEY_CODE[code] !== -1) {
				continue;
			}

			if (cnt % 4 === 0) {
				result.push(`|       HW Code combination      |  Key  |    KeyCode combination    |          UI label         |       Dispatching string       |`);
				result.push(`-----------------------------------------------------------------------------------------------------------------------------------`);
			}
			cnt++;

			const mapping = this._codeInfo[code];
			const strCode = KeyboardEventCodeUtils.toString(code);
			const uiLabel = this._hwToLabel[code];

			for (let mod = 0; mod < 8; mod++) {
				const hwCtrlKey = (mod & 0b0001) ? true : false;
				const hwShiftKey = (mod & 0b0010) ? true : false;
				const hwAltKey = (mod & 0b0100) ? true : false;
				const strHw = `${hwCtrlKey ? 'Ctrl+' : ''}${hwShiftKey ? 'Shift+' : ''}${hwAltKey ? 'Alt+' : ''}${strCode}`;
				const uiHwLabel = `${hwCtrlKey ? 'Ctrl+' : ''}${hwShiftKey ? 'Shift+' : ''}${hwAltKey ? 'Alt+' : ''}${uiLabel}`;

				let key = 0;
				if (mapping) {
					if (hwCtrlKey && hwShiftKey && hwAltKey) {
						key = mapping.withShiftAltGr;
					} else if (hwCtrlKey && hwAltKey) {
						key = mapping.withAltGr;
					} else if (hwShiftKey) {
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

				const hwEncoded = this._encode(hwCtrlKey, hwShiftKey, hwAltKey, code);
				const kbEncoded = this._hwToKb[hwEncoded];
				const kbCtrlKey = (kbEncoded & 0b0001) ? true : false;
				const kbShiftKey = (kbEncoded & 0b0010) ? true : false;
				const kbAltKey = (kbEncoded & 0b0100) ? true : false;
				const keyCode = (kbEncoded >>> 3);
				const strKb = `${kbCtrlKey ? 'Ctrl+' : ''}${kbShiftKey ? 'Shift+' : ''}${kbAltKey ? 'Alt+' : ''}${KeyCodeUtils.toString(keyCode)}`;

				const hwKeyPress = new HardwareKeypress(hwCtrlKey, hwShiftKey, hwAltKey, false, code);
				const dispatchStr = this.getDispatchStrForHardwareKeypress(hwKeyPress);

				result.push(`| ${this._leftPad(strHw, 30)} | ${strKey} | ${this._leftPad(strKb, 25)} | ${this._leftPad(uiHwLabel, 25)} | ${this._leftPad(dispatchStr, 30)} |`);

			}
			result.push(`-----------------------------------------------------------------------------------------------------------------------------------`);
		}

		return result.join('\n');
	}

	private _leftPad(str: string, cnt: number): string {
		if (str === null) {
			str = 'null';
		}
		while (str.length < cnt) {
			str = ' ' + str;
		}
		return str;
	}

	private _registerIfUnknown(
		hwCtrlKey: boolean, hwShiftKey: boolean, hwAltKey: boolean, code: KeyboardEventCode,
		kbCtrlKey: boolean, kbShiftKey: boolean, kbAltKey: boolean, keyCode: KeyCode,
	): void {
		let hwEncoded = this._encode(hwCtrlKey, hwShiftKey, hwAltKey, code);
		let kbEncoded = this._encode(kbCtrlKey, kbShiftKey, kbAltKey, keyCode);

		let existing = this._hwToKb[hwEncoded] | 0;
		let existingKeyCode = existing >>> 3;

		if (existingKeyCode !== 0) {
			return;
		}

		this._hwToKb[hwEncoded] = kbEncoded;

		if (keyCode !== KeyCode.Unknown) {
			// Do not save an inverse lookup for Unknown
			this._kbToHw[kbEncoded] = this._kbToHw[kbEncoded] || [];
			this._kbToHw[kbEncoded].unshift(hwEncoded);
		}
	}

	private _registerAllCombos1(
		_ctrlKey: boolean, _shiftKey: boolean, _altKey: boolean, code: KeyboardEventCode,
		keyCode: KeyCode,
	): void {
		for (let _ctrl = (_ctrlKey ? 1 : 0); _ctrl <= 1; _ctrl++) {
			const ctrlKey = (_ctrl ? true : false);
			for (let _shift = (_shiftKey ? 1 : 0); _shift <= 1; _shift++) {
				const shiftKey = (_shift ? true : false);
				for (let _alt = (_altKey ? 1 : 0); _alt <= 1; _alt++) {
					const altKey = (_alt ? true : false);
					this._registerIfUnknown(
						ctrlKey, shiftKey, altKey, code,
						ctrlKey, shiftKey, altKey, keyCode
					);
				}
			}
		}
	}

	private _registerAllCombos2(
		hwCtrlKey: boolean, hwShiftKey: boolean, hwAltKey: boolean, code: KeyboardEventCode,
		kbShiftKey: boolean, keyCode: KeyCode,
	): void {
		this._registerIfUnknown(
			hwCtrlKey, hwShiftKey, hwAltKey, code,
			false, kbShiftKey, false, keyCode
		);

		if (!kbShiftKey) {
			for (let _ctrl = (hwCtrlKey ? 1 : 0); _ctrl <= 1; _ctrl++) {
				const ctrlKey = (_ctrl ? true : false);
				for (let _alt = (hwAltKey ? 1 : 0); _alt <= 1; _alt++) {
					const altKey = (_alt ? true : false);
					this._registerIfUnknown(
						ctrlKey, hwShiftKey, altKey, code,
						ctrlKey, kbShiftKey, altKey, keyCode
					);
					this._registerIfUnknown(
						ctrlKey, true, altKey, code,
						ctrlKey, true, altKey, keyCode
					);
				}
			}
		} else {
			for (let _ctrl = (hwCtrlKey ? 1 : 0); _ctrl <= 1; _ctrl++) {
				const ctrlKey = (_ctrl ? true : false);
				for (let _alt = (hwAltKey ? 1 : 0); _alt <= 1; _alt++) {
					const altKey = (_alt ? true : false);
					this._registerIfUnknown(
						ctrlKey, hwShiftKey, altKey, code,
						ctrlKey, kbShiftKey, altKey, keyCode
					);
				}
			}
		}
	}

	private _registerCharCode(code: KeyboardEventCode, ctrlKey: boolean, shiftKey: boolean, altKey: boolean, charCode: number): void {

		let _kb = MacLinuxKeyboardMapper._charCodeToKb(charCode);
		let kb = _kb ? {
			ctrlKey: false,
			shiftKey: _kb.shiftKey,
			altKey: false,
			keyCode: _kb.keyCode
		} : null;

		if (!_kb) {
			this._registerAllCombos1(ctrlKey, shiftKey, altKey, code, KeyCode.Unknown);
			return;
		}

		this._registerAllCombos2(
			ctrlKey, shiftKey, altKey, code,
			kb.shiftKey, kb.keyCode
		);
	}

	public simpleKeybindingToHardwareKeypress(keybinding: SimpleKeybinding): HardwareKeypress[] {
		const kbEncoded = this._encode(keybinding.ctrlKey, keybinding.shiftKey, keybinding.altKey, keybinding.keyCode);
		const hwEncoded = this._kbToHw[kbEncoded];

		let result: HardwareKeypress[] = [];
		if (hwEncoded) {
			for (let i = 0, len = hwEncoded.length; i < len; i++) {
				result[i] = this._decodeHw(hwEncoded[i], keybinding.metaKey);
			}
		}
		return result;
	}

	public getUILabelForHardwareCode(code: KeyboardEventCode): string {
		if (this._OS === OperatingSystem.Macintosh) {
			switch (code) {
				case KeyboardEventCode.ArrowLeft:
					return '←';
				case KeyboardEventCode.ArrowUp:
					return '↑';
				case KeyboardEventCode.ArrowRight:
					return '→';
				case KeyboardEventCode.ArrowDown:
					return '↓';
			}
		}
		return this._hwToLabel[code];
	}

	public getAriaLabelForHardwareCode(code: KeyboardEventCode): string {
		return this._hwToLabel[code];
	}

	public getDispatchStrForHardwareKeypress(keypress: HardwareKeypress): string {
		const codeDispatch = this._hwToDispatch[keypress.code];
		if (!codeDispatch) {
			return null;
		}
		let result = '';

		if (keypress.ctrlKey) {
			result += 'ctrl+';
		}
		if (keypress.shiftKey) {
			result += 'shift+';
		}
		if (keypress.altKey) {
			result += 'alt+';
		}
		if (keypress.metaKey) {
			result += 'meta+';
		}
		result += codeDispatch;

		return result;
	}

	public getUserSettingsLabel(code: KeyboardEventCode): string {
		const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[code];
		if (immutableKeyCode !== -1) {
			return USER_SETTINGS.fromKeyCode(immutableKeyCode).toLowerCase();
		}

		// Check if this hw code always maps to the same kb code and back
		let constantKeyCode: KeyCode = this._getStableKeyCodeForHWCode(code);
		if (constantKeyCode !== -1) {
			return USER_SETTINGS.fromKeyCode(constantKeyCode).toLowerCase();
		}

		return this._hwToDispatch[code];
	}

	private _getElectronLabelForKeyCode(keyCode: KeyCode): string {
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

	public getElectronLabelForHardwareCode(code: KeyboardEventCode): string {
		const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[code];
		if (immutableKeyCode !== -1) {
			return this._getElectronLabelForKeyCode(immutableKeyCode);
		}

		// Check if this hw code always maps to the same kb code and back
		let constantKeyCode: KeyCode = this._getStableKeyCodeForHWCode(code);
		if (constantKeyCode !== -1) {
			return this._getElectronLabelForKeyCode(constantKeyCode);
		}

		return null;
	}

	private _getStableKeyCodeForHWCode(code: KeyboardEventCode): KeyCode {
		if (code >= KeyboardEventCode.Digit1 && code <= KeyboardEventCode.Digit0) {
			// digits are ok
			switch (code) {
				case KeyboardEventCode.Digit1: return KeyCode.KEY_1;
				case KeyboardEventCode.Digit2: return KeyCode.KEY_2;
				case KeyboardEventCode.Digit3: return KeyCode.KEY_3;
				case KeyboardEventCode.Digit4: return KeyCode.KEY_4;
				case KeyboardEventCode.Digit5: return KeyCode.KEY_5;
				case KeyboardEventCode.Digit6: return KeyCode.KEY_6;
				case KeyboardEventCode.Digit7: return KeyCode.KEY_7;
				case KeyboardEventCode.Digit8: return KeyCode.KEY_8;
				case KeyboardEventCode.Digit9: return KeyCode.KEY_9;
				case KeyboardEventCode.Digit0: return KeyCode.KEY_0;
			}
		}

		// Check if this hw code always maps to the same kb code and back
		let constantKeyCode: KeyCode = -1;
		for (let mod = 0; mod < 8; mod++) {
			const hwEncoded = ((code << 3) + mod) >>> 0;
			const kbEncoded = this._hwToKb[hwEncoded];
			const keyCode = (kbEncoded >>> 3);

			if (keyCode === KeyCode.Unknown) {
				// maps to unknown keyCode
				return -1;
			}

			if (constantKeyCode === -1) {
				constantKeyCode = keyCode;
			} else if (constantKeyCode !== keyCode) {
				// maps to different keyCode
				return -1;
			}

			// Check that the inverse is true
			const inverse = this._kbToHw[kbEncoded];
			if (inverse.length !== 1) {
				// multiple hw keypresses map to this kb
				return -1;
			}
		}

		return constantKeyCode;
	}

	public resolveKeybinding(keybinding: Keybinding): NativeResolvedKeybinding[] {
		let result: NativeResolvedKeybinding[] = [], resultLen = 0;

		if (keybinding.type === KeybindingType.Chord) {
			const firstParts = this.simpleKeybindingToHardwareKeypress(keybinding.firstPart);
			const chordParts = this.simpleKeybindingToHardwareKeypress(keybinding.chordPart);

			for (let i = 0, len = firstParts.length; i < len; i++) {
				const firstPart = firstParts[i];
				for (let j = 0, lenJ = chordParts.length; j < lenJ; j++) {
					const chordPart = chordParts[j];

					result[resultLen++] = new NativeResolvedKeybinding(this, this._OS, firstPart, chordPart);
				}
			}
		} else {
			const firstParts = this.simpleKeybindingToHardwareKeypress(keybinding);

			for (let i = 0, len = firstParts.length; i < len; i++) {
				const firstPart = firstParts[i];

				result[resultLen++] = new NativeResolvedKeybinding(this, this._OS, firstPart, null);
			}
		}

		return result;
	}

	private static _charCodeToKb(charCode: number): { keyCode: KeyCode; shiftKey: boolean } {
		if (charCode < CHAR_CODE_TO_KEY_CODE.length) {
			return CHAR_CODE_TO_KEY_CODE[charCode];
		}
		return null;
	}

	/**
	 * Attempt to map a combining character to a regular one that renders the same way.
	 *
	 * To the brave person following me: Good Luck!
	 * https://www.compart.com/en/unicode/bidiclass/NSM
	 */
	private static _getCharCode(char: string): number {
		if (char.length === 0) {
			return 0;
		}
		const charCode = char.charCodeAt(0);
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

	private _encode(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, principal: number): number {
		return (
			((ctrlKey ? 1 : 0) << 0)
			| ((shiftKey ? 1 : 0) << 1)
			| ((altKey ? 1 : 0) << 2)
			| principal << 3
		) >>> 0;
	}

	private _decodeHw(hwEncoded: number, metaKey: boolean): HardwareKeypress {
		const ctrlKey = (hwEncoded & 0b0001) ? true : false;
		const shiftKey = (hwEncoded & 0b0010) ? true : false;
		const altKey = (hwEncoded & 0b0100) ? true : false;
		const code = (hwEncoded >>> 3);

		return new HardwareKeypress(ctrlKey, shiftKey, altKey, metaKey, code);
	}
}

(function () {
	function define(charCode: number, keyCode: KeyCode, shiftKey: boolean): void {
		for (let i = CHAR_CODE_TO_KEY_CODE.length; i < charCode; i++) {
			CHAR_CODE_TO_KEY_CODE[i] = null;
		}
		CHAR_CODE_TO_KEY_CODE[charCode] = { keyCode: keyCode, shiftKey: shiftKey };
	}

	for (let chCode = CharCode.A; chCode <= CharCode.Z; chCode++) {
		define(chCode, KeyCode.KEY_A + (chCode - CharCode.A), true);
	}

	for (let chCode = CharCode.a; chCode <= CharCode.z; chCode++) {
		define(chCode, KeyCode.KEY_A + (chCode - CharCode.a), false);
	}

	define(CharCode.Semicolon, KeyCode.US_SEMICOLON, false);
	define(CharCode.Colon, KeyCode.US_SEMICOLON, true);

	define(CharCode.Equals, KeyCode.US_EQUAL, false);
	define(CharCode.Plus, KeyCode.US_EQUAL, true);

	define(CharCode.Comma, KeyCode.US_COMMA, false);
	define(CharCode.LessThan, KeyCode.US_COMMA, true);

	define(CharCode.Dash, KeyCode.US_MINUS, false);
	define(CharCode.Underline, KeyCode.US_MINUS, true);

	define(CharCode.Period, KeyCode.US_DOT, false);
	define(CharCode.GreaterThan, KeyCode.US_DOT, true);

	define(CharCode.Slash, KeyCode.US_SLASH, false);
	define(CharCode.QuestionMark, KeyCode.US_SLASH, true);

	define(CharCode.BackTick, KeyCode.US_BACKTICK, false);
	define(CharCode.Tilde, KeyCode.US_BACKTICK, true);

	define(CharCode.OpenSquareBracket, KeyCode.US_OPEN_SQUARE_BRACKET, false);
	define(CharCode.OpenCurlyBrace, KeyCode.US_OPEN_SQUARE_BRACKET, true);

	define(CharCode.Backslash, KeyCode.US_BACKSLASH, false);
	define(CharCode.Pipe, KeyCode.US_BACKSLASH, true);

	define(CharCode.CloseSquareBracket, KeyCode.US_CLOSE_SQUARE_BRACKET, false);
	define(CharCode.CloseCurlyBrace, KeyCode.US_CLOSE_SQUARE_BRACKET, true);

	define(CharCode.SingleQuote, KeyCode.US_QUOTE, false);
	define(CharCode.DoubleQuote, KeyCode.US_QUOTE, true);
})();
