/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';
import { SimpleKeybinding, KeyCode, ResolvedKeybinding, Keybinding, KeyCodeUtils, KeyMod } from 'vs/base/common/keyCodes';
import { KeyboardEventCode, KeyboardEventCodeUtils } from 'vs/workbench/services/keybinding/common/keyboardEventCode';
import { CharCode } from 'vs/base/common/charCode';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { PrintableKeypress, UILabelProvider, AriaLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';

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

/**
 * -1 if a HwCode => KeyCode mapping depends on kb layout.
 */
const IMMUTABLE_CODE_TO_KEY_CODE: KeyCode[] = [];
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

	public toPrintableKeypress(key: string): PrintableKeypress {
		return new PrintableKeypress(this.ctrlKey, this.shiftKey, this.altKey, this.metaKey, key);
	}
}

export class NativeResolvedKeybinding extends ResolvedKeybinding {

	private readonly _mapper: KeyboardMapper;
	private readonly _OS: OperatingSystem;
	private readonly _firstPart: HardwareKeypress;
	private readonly _chordPart: HardwareKeypress;

	constructor(mapper: KeyboardMapper, OS: OperatingSystem, firstPart: HardwareKeypress, chordPart: HardwareKeypress) {
		super();
		this._mapper = mapper;
		this._OS = OS;
		this._firstPart = firstPart;
		this._chordPart = chordPart;
	}

	public getLabel(): string {
		let firstPart = this._firstPart.toPrintableKeypress(this._mapper.getUILabelForHardwareCode(this._firstPart.code));
		let chordPart = this._chordPart ? this._chordPart.toPrintableKeypress(this._mapper.getUILabelForHardwareCode(this._chordPart.code)) : null;

		return UILabelProvider.toLabel2(firstPart, chordPart, this._OS);
	}

	public getAriaLabel(): string {
		let firstPart = this._firstPart.toPrintableKeypress(this._mapper.getAriaLabelForHardwareCode(this._firstPart.code));
		let chordPart = this._chordPart ? this._chordPart.toPrintableKeypress(this._mapper.getAriaLabelForHardwareCode(this._chordPart.code)) : null;

		return AriaLabelProvider.toLabel2(firstPart, chordPart, this._OS);
	}

	public getHTMLLabel(): IHTMLContentElement[] {
		let firstPart = this._firstPart.toPrintableKeypress(this._mapper.getUILabelForHardwareCode(this._firstPart.code));
		let chordPart = this._chordPart ? this._chordPart.toPrintableKeypress(this._mapper.getUILabelForHardwareCode(this._chordPart.code)) : null;

		return UILabelProvider.toHTMLLabel2(firstPart, chordPart, this._OS);
	}

	public getElectronAccelerator(): string {
		throw new Error('TODO!');
		// const usResolvedKeybinding = new USLayoutResolvedKeybinding(this._actual, OS);

		// if (OS === OperatingSystem.Windows) {
		// 	// electron menus always do the correct rendering on Windows
		// 	return usResolvedKeybinding.getElectronAccelerator();
		// }

		// let usLabel = usResolvedKeybinding.getLabel();
		// let label = this.getLabel();
		// if (usLabel !== label) {
		// 	// electron menus are incorrect in rendering (linux) and in rendering and interpreting (mac)
		// 	// for non US standard keyboard layouts
		// 	return null;
		// }

		// return usResolvedKeybinding.getElectronAccelerator();
	}

	public getUserSettingsLabel(): string {
		throw new Error('TODO!');
		// return KeybindingIO.writeKeybinding(this._actual, OS);
	}
}

interface IHardwareCodeMapping {
	code: KeyboardEventCode;
	value: number;
	withShift: number;
	withAltGr: number;
	withShiftAltGr: number;
}

export class KeyboardMapper {

	private readonly _OS: OperatingSystem;
	private readonly _codeInfo: IHardwareCodeMapping[];
	private readonly _hwToKb: number[] = [];
	private readonly _hwToLabel: string[] = [];
	private readonly _kbToHw: number[][] = [];

	constructor(rawMappings: IKeyboardMapping, OS: OperatingSystem) {

		this._OS = OS;

		this._hwToKb = [];
		this._kbToHw = [];
		this._hwToLabel = [];

		for (let code = KeyboardEventCode.None; code < KeyboardEventCode.MAX_VALUE; code++) {
			const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[code];
			if (immutableKeyCode !== -1) {
				this._registerAllCombos1(false, false, false, code, immutableKeyCode);
				this._hwToLabel[code] = KeyCodeUtils.toString(immutableKeyCode);
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
				const value = KeyboardMapper._getCharCode(rawMapping.value);
				const withShift = KeyboardMapper._getCharCode(rawMapping.withShift);
				const withAltGr = KeyboardMapper._getCharCode(rawMapping.withAltGr);
				const withShiftAltGr = KeyboardMapper._getCharCode(rawMapping.withShiftAltGr);

				const mapping: IHardwareCodeMapping = {
					code: code,
					value: value,
					withShift: withShift,
					withAltGr: withAltGr,
					withShiftAltGr: withShiftAltGr,
				};
				mappings[mappingsLen++] = mapping;
				this._codeInfo[code] = mapping;

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
			this._registerCharCode(mapping.code, true, true, true, mapping.withShiftAltGr);
		}
		// Handle all `withAltGr` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			this._registerCharCode(mapping.code, true, false, true, mapping.withAltGr);
		}
		// Handle all `withShift` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			this._registerCharCode(mapping.code, false, true, false, mapping.withShift);
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
		for (let code = KeyboardEventCode.None; code < KeyboardEventCode.MAX_VALUE; code++) {
			if (IMMUTABLE_CODE_TO_KEY_CODE[code] !== -1) {
				continue;
			}

			if (cnt % 5 === 0) {
				result.push(`--------------------------------------------------------------------------------------------------`);
				result.push(`|       HW Code combination      |  Key  |    KeyCode combination    |          UI label         |`);
				result.push(`--------------------------------------------------------------------------------------------------`);
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

				result.push(`| ${this._leftPad(strHw, 30)} | ${strKey} | ${this._leftPad(strKb, 25)} | ${this._leftPad(uiHwLabel, 25)} |`);

			}
		}

		result.push(`--------------------------------------------------------------------------------------------------`);

		return result.join('\n');
	}

	private _leftPad(str: string, cnt: number): string {
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

		this._kbToHw[kbEncoded] = this._kbToHw[kbEncoded] || [];
		this._kbToHw[kbEncoded].unshift(hwEncoded);
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

	private _registerAllCombos(
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

		let _kb = KeyboardMapper._charCodeToKb(charCode);
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

		this._registerAllCombos(
			ctrlKey, shiftKey, altKey, code,
			kb.shiftKey, kb.keyCode
		);
	}

	public simpleKeybindingToHardwareKeypress(keybinding: SimpleKeybinding): HardwareKeypress[] {
		const ctrlCmd = keybinding.hasCtrlCmd();
		const winCtrl = keybinding.hasWinCtrl();
		const ctrlKey = (this._OS === OperatingSystem.Macintosh ? winCtrl : ctrlCmd);
		const metaKey = (this._OS === OperatingSystem.Macintosh ? ctrlCmd : winCtrl);
		const shiftKey = keybinding.hasShift();
		const altKey = keybinding.hasAlt();
		const keyCode = keybinding.getKeyCode();

		const kbEncoded = this._encode(ctrlKey, shiftKey, altKey, keyCode);
		const hwEncoded = this._kbToHw[kbEncoded];

		let result: HardwareKeypress[] = [];
		if (hwEncoded) {
			for (let i = 0, len = hwEncoded.length; i < len; i++) {
				result[i] = this._decodeHw(hwEncoded[i], metaKey);
			}
		}
		return result;
	}

	public hardwareKeypressToSimpleKeybinding(keypress: HardwareKeypress): SimpleKeybinding {
		const hwEncoded = this._encode(keypress.ctrlKey, keypress.shiftKey, keypress.altKey, keypress.code);
		const kbEncoded = this._hwToKb[hwEncoded];
		if (!kbEncoded) {
			return null;
		}

		return this._decodeKb(kbEncoded, keypress.metaKey);
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

	public resolveKeybinding(keybinding: Keybinding): NativeResolvedKeybinding[] {
		let result: NativeResolvedKeybinding[] = [], resultLen = 0;

		if (keybinding.isChord()) {
			const firstParts = this.simpleKeybindingToHardwareKeypress(keybinding.extractFirstPart());
			const chordParts = this.simpleKeybindingToHardwareKeypress(keybinding.extractChordPart());

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

	private _decodeKb(kbEncoded: number, metaKey: boolean): SimpleKeybinding {
		const ctrlKey = (kbEncoded & 0b001) ? true : false;
		const shiftKey = (kbEncoded & 0b010) ? true : false;
		const altKey = (kbEncoded & 0b100) ? true : false;
		const keyCode = (kbEncoded >>> 3);

		const ctrlCmd = (this._OS === OperatingSystem.Macintosh ? metaKey : ctrlKey);
		const winCtrl = (this._OS === OperatingSystem.Macintosh ? ctrlKey : metaKey);

		return new SimpleKeybinding(
			(ctrlCmd ? KeyMod.CtrlCmd : 0)
			| (winCtrl ? KeyMod.WinCtrl : 0)
			| (shiftKey ? KeyMod.Shift : 0)
			| (altKey ? KeyMod.Alt : 0)
			| keyCode
		);
	}
}

(function () {
	for (let i = 0; i <= KeyboardEventCode.MAX_VALUE; i++) {
		IMMUTABLE_CODE_TO_KEY_CODE[i] = -1;
	}

	function define(code: KeyboardEventCode, keyCode: KeyCode): void {
		IMMUTABLE_CODE_TO_KEY_CODE[code] = keyCode;
	}

	define(KeyboardEventCode.None, KeyCode.Unknown);
	define(KeyboardEventCode.Hyper, KeyCode.Unknown);
	define(KeyboardEventCode.Super, KeyCode.Unknown);
	define(KeyboardEventCode.Fn, KeyCode.Unknown);
	define(KeyboardEventCode.FnLock, KeyCode.Unknown);
	define(KeyboardEventCode.Suspend, KeyCode.Unknown);
	define(KeyboardEventCode.Resume, KeyCode.Unknown);
	define(KeyboardEventCode.Turbo, KeyCode.Unknown);
	define(KeyboardEventCode.Sleep, KeyCode.Unknown);
	define(KeyboardEventCode.WakeUp, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyA, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyB, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyC, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyD, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyE, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyF, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyG, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyH, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyI, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyJ, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyK, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyL, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyM, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyN, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyO, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyP, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyQ, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyR, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyS, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyT, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyU, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyV, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyW, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyX, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyY, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyZ, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit1, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit2, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit3, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit4, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit5, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit6, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit7, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit8, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit9, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit0, KeyCode.Unknown);
	define(KeyboardEventCode.Enter, KeyCode.Enter);
	define(KeyboardEventCode.Escape, KeyCode.Escape);
	define(KeyboardEventCode.Backspace, KeyCode.Backspace);
	define(KeyboardEventCode.Tab, KeyCode.Tab);
	define(KeyboardEventCode.Space, KeyCode.Space);
	// define(KeyboardEventCode.Minus, KeyCode.Unknown);
	// define(KeyboardEventCode.Equal, KeyCode.Unknown);
	// define(KeyboardEventCode.BracketLeft, KeyCode.Unknown);
	// define(KeyboardEventCode.BracketRight, KeyCode.Unknown);
	// define(KeyboardEventCode.Backslash, KeyCode.Unknown);
	// define(KeyboardEventCode.IntlHash, KeyCode.Unknown);
	// define(KeyboardEventCode.Semicolon, KeyCode.Unknown);
	// define(KeyboardEventCode.Quote, KeyCode.Unknown);
	// define(KeyboardEventCode.Backquote, KeyCode.Unknown);
	// define(KeyboardEventCode.Comma, KeyCode.Unknown);
	// define(KeyboardEventCode.Period, KeyCode.Unknown);
	// define(KeyboardEventCode.Slash, KeyCode.Unknown);
	define(KeyboardEventCode.CapsLock, KeyCode.CapsLock);
	define(KeyboardEventCode.F1, KeyCode.F1);
	define(KeyboardEventCode.F2, KeyCode.F2);
	define(KeyboardEventCode.F3, KeyCode.F3);
	define(KeyboardEventCode.F4, KeyCode.F4);
	define(KeyboardEventCode.F5, KeyCode.F5);
	define(KeyboardEventCode.F6, KeyCode.F6);
	define(KeyboardEventCode.F7, KeyCode.F7);
	define(KeyboardEventCode.F8, KeyCode.F8);
	define(KeyboardEventCode.F9, KeyCode.F9);
	define(KeyboardEventCode.F10, KeyCode.F10);
	define(KeyboardEventCode.F11, KeyCode.F11);
	define(KeyboardEventCode.F12, KeyCode.F12);
	define(KeyboardEventCode.PrintScreen, KeyCode.Unknown);
	define(KeyboardEventCode.ScrollLock, KeyCode.ScrollLock);
	define(KeyboardEventCode.Pause, KeyCode.PauseBreak);
	define(KeyboardEventCode.Insert, KeyCode.Insert);
	define(KeyboardEventCode.Home, KeyCode.Home);
	define(KeyboardEventCode.PageUp, KeyCode.PageUp);
	define(KeyboardEventCode.Delete, KeyCode.Delete);
	define(KeyboardEventCode.End, KeyCode.End);
	define(KeyboardEventCode.PageDown, KeyCode.PageDown);
	define(KeyboardEventCode.ArrowRight, KeyCode.RightArrow);
	define(KeyboardEventCode.ArrowLeft, KeyCode.LeftArrow);
	define(KeyboardEventCode.ArrowDown, KeyCode.DownArrow);
	define(KeyboardEventCode.ArrowUp, KeyCode.UpArrow);
	define(KeyboardEventCode.NumLock, KeyCode.NumLock);
	define(KeyboardEventCode.NumpadDivide, KeyCode.NUMPAD_DIVIDE);
	define(KeyboardEventCode.NumpadMultiply, KeyCode.NUMPAD_MULTIPLY);
	define(KeyboardEventCode.NumpadSubtract, KeyCode.NUMPAD_SUBTRACT);
	define(KeyboardEventCode.NumpadAdd, KeyCode.NUMPAD_ADD);
	define(KeyboardEventCode.NumpadEnter, KeyCode.Enter); // TODO
	define(KeyboardEventCode.Numpad1, KeyCode.NUMPAD_1);
	define(KeyboardEventCode.Numpad2, KeyCode.NUMPAD_2);
	define(KeyboardEventCode.Numpad3, KeyCode.NUMPAD_3);
	define(KeyboardEventCode.Numpad4, KeyCode.NUMPAD_4);
	define(KeyboardEventCode.Numpad5, KeyCode.NUMPAD_5);
	define(KeyboardEventCode.Numpad6, KeyCode.NUMPAD_6);
	define(KeyboardEventCode.Numpad7, KeyCode.NUMPAD_7);
	define(KeyboardEventCode.Numpad8, KeyCode.NUMPAD_8);
	define(KeyboardEventCode.Numpad9, KeyCode.NUMPAD_9);
	define(KeyboardEventCode.Numpad0, KeyCode.NUMPAD_0);
	define(KeyboardEventCode.NumpadDecimal, KeyCode.NUMPAD_DECIMAL);
	// define(KeyboardEventCode.IntlBackslash, KeyCode.Unknown);
	define(KeyboardEventCode.ContextMenu, KeyCode.ContextMenu);
	define(KeyboardEventCode.Power, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadEqual, KeyCode.Unknown);
	define(KeyboardEventCode.F13, KeyCode.F13);
	define(KeyboardEventCode.F14, KeyCode.F14);
	define(KeyboardEventCode.F15, KeyCode.F15);
	define(KeyboardEventCode.F16, KeyCode.F16);
	define(KeyboardEventCode.F17, KeyCode.F17);
	define(KeyboardEventCode.F18, KeyCode.F18);
	define(KeyboardEventCode.F19, KeyCode.F19);
	define(KeyboardEventCode.F20, KeyCode.Unknown);
	define(KeyboardEventCode.F21, KeyCode.Unknown);
	define(KeyboardEventCode.F22, KeyCode.Unknown);
	define(KeyboardEventCode.F23, KeyCode.Unknown);
	define(KeyboardEventCode.F24, KeyCode.Unknown);
	define(KeyboardEventCode.Open, KeyCode.Unknown);
	define(KeyboardEventCode.Help, KeyCode.Unknown);
	define(KeyboardEventCode.Select, KeyCode.Unknown);
	define(KeyboardEventCode.Again, KeyCode.Unknown);
	define(KeyboardEventCode.Undo, KeyCode.Unknown);
	define(KeyboardEventCode.Cut, KeyCode.Unknown);
	define(KeyboardEventCode.Copy, KeyCode.Unknown);
	define(KeyboardEventCode.Paste, KeyCode.Unknown);
	define(KeyboardEventCode.Find, KeyCode.Unknown);
	define(KeyboardEventCode.AudioVolumeMute, KeyCode.Unknown);
	define(KeyboardEventCode.AudioVolumeUp, KeyCode.Unknown);
	define(KeyboardEventCode.AudioVolumeDown, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadComma, KeyCode.NUMPAD_SEPARATOR);
	define(KeyboardEventCode.IntlRo, KeyCode.Unknown);
	define(KeyboardEventCode.KanaMode, KeyCode.Unknown);
	define(KeyboardEventCode.IntlYen, KeyCode.Unknown);
	define(KeyboardEventCode.Convert, KeyCode.Unknown);
	define(KeyboardEventCode.NonConvert, KeyCode.Unknown);
	define(KeyboardEventCode.Lang1, KeyCode.Unknown);
	define(KeyboardEventCode.Lang2, KeyCode.Unknown);
	define(KeyboardEventCode.Lang3, KeyCode.Unknown);
	define(KeyboardEventCode.Lang4, KeyCode.Unknown);
	define(KeyboardEventCode.Lang5, KeyCode.Unknown);
	define(KeyboardEventCode.Abort, KeyCode.Unknown);
	define(KeyboardEventCode.Props, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadParenLeft, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadParenRight, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadBackspace, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemoryStore, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemoryRecall, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemoryClear, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemoryAdd, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemorySubtract, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadClear, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadClearEntry, KeyCode.Unknown);
	define(KeyboardEventCode.ControlLeft, KeyCode.Ctrl); // TODO
	define(KeyboardEventCode.ShiftLeft, KeyCode.Shift); // TODO
	define(KeyboardEventCode.AltLeft, KeyCode.Alt); // TODO
	define(KeyboardEventCode.MetaLeft, KeyCode.Meta); // TODO
	define(KeyboardEventCode.ControlRight, KeyCode.Ctrl); // TODO
	define(KeyboardEventCode.ShiftRight, KeyCode.Shift); // TODO
	define(KeyboardEventCode.AltRight, KeyCode.Alt); // TODO
	define(KeyboardEventCode.MetaRight, KeyCode.Meta); // TODO
	define(KeyboardEventCode.BrightnessUp, KeyCode.Unknown);
	define(KeyboardEventCode.BrightnessDown, KeyCode.Unknown);
	define(KeyboardEventCode.MediaPlay, KeyCode.Unknown);
	define(KeyboardEventCode.MediaRecord, KeyCode.Unknown);
	define(KeyboardEventCode.MediaFastForward, KeyCode.Unknown);
	define(KeyboardEventCode.MediaRewind, KeyCode.Unknown);
	define(KeyboardEventCode.MediaTrackNext, KeyCode.Unknown);
	define(KeyboardEventCode.MediaTrackPrevious, KeyCode.Unknown);
	define(KeyboardEventCode.MediaStop, KeyCode.Unknown);
	define(KeyboardEventCode.Eject, KeyCode.Unknown);
	define(KeyboardEventCode.MediaPlayPause, KeyCode.Unknown);
	define(KeyboardEventCode.MediaSelect, KeyCode.Unknown);
	define(KeyboardEventCode.LaunchMail, KeyCode.Unknown);
	define(KeyboardEventCode.LaunchApp2, KeyCode.Unknown);
	define(KeyboardEventCode.LaunchApp1, KeyCode.Unknown);
	define(KeyboardEventCode.SelectTask, KeyCode.Unknown);
	define(KeyboardEventCode.LaunchScreenSaver, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserSearch, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserHome, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserBack, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserForward, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserStop, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserRefresh, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserFavorites, KeyCode.Unknown);
	define(KeyboardEventCode.ZoomToggle, KeyCode.Unknown);
	define(KeyboardEventCode.MailReply, KeyCode.Unknown);
	define(KeyboardEventCode.MailForward, KeyCode.Unknown);
	define(KeyboardEventCode.MailSend, KeyCode.Unknown);
})();

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
