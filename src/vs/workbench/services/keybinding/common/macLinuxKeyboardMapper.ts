/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';
import { KeyCode, KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, IMMUTABLE_KEY_CODE_TO_CODE, ScanCode, ScanCodeUtils, isModifierKey } from '../../../../base/common/keyCodes.js';
import { ResolvedKeybinding, KeyCodeChord, SingleModifierChord, ScanCodeChord, Keybinding, Chord } from '../../../../base/common/keybindings.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { IKeyboardEvent } from '../../../../platform/keybinding/common/keybinding.js';
import { IKeyboardMapper } from '../../../../platform/keyboardLayout/common/keyboardMapper.js';
import { BaseResolvedKeybinding } from '../../../../platform/keybinding/common/baseResolvedKeybinding.js';
import { IMacLinuxKeyboardMapping, IMacLinuxKeyMapping } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';

/**
 * A map from character to key codes.
 * e.g. Contains entries such as:
 *  - '/' => { keyCode: KeyCode.US_SLASH, shiftKey: false }
 *  - '?' => { keyCode: KeyCode.US_SLASH, shiftKey: true }
 */
const CHAR_CODE_TO_KEY_CODE: ({ keyCode: KeyCode; shiftKey: boolean } | null)[] = [];

export class NativeResolvedKeybinding extends BaseResolvedKeybinding<ScanCodeChord> {

	private readonly _mapper: MacLinuxKeyboardMapper;

	constructor(mapper: MacLinuxKeyboardMapper, os: OperatingSystem, chords: ScanCodeChord[]) {
		super(os, chords);
		this._mapper = mapper;
	}

	protected _getLabel(chord: ScanCodeChord): string | null {
		return this._mapper.getUILabelForScanCodeChord(chord);
	}

	protected _getAriaLabel(chord: ScanCodeChord): string | null {
		return this._mapper.getAriaLabelForScanCodeChord(chord);
	}

	protected _getElectronAccelerator(chord: ScanCodeChord): string | null {
		return this._mapper.getElectronAcceleratorLabelForScanCodeChord(chord);
	}

	protected _getUserSettingsLabel(chord: ScanCodeChord): string | null {
		return this._mapper.getUserSettingsLabelForScanCodeChord(chord);
	}

	protected _isWYSIWYG(binding: ScanCodeChord | null): boolean {
		if (!binding) {
			return true;
		}
		if (IMMUTABLE_CODE_TO_KEY_CODE[binding.scanCode] !== KeyCode.DependsOnKbLayout) {
			return true;
		}
		const a = this._mapper.getAriaLabelForScanCodeChord(binding);
		const b = this._mapper.getUserSettingsLabelForScanCodeChord(binding);

		if (!a && !b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return (a.toLowerCase() === b.toLowerCase());
	}

	protected _getChordDispatch(chord: ScanCodeChord): string | null {
		return this._mapper.getDispatchStrForScanCodeChord(chord);
	}

	protected _getSingleModifierChordDispatch(chord: ScanCodeChord): SingleModifierChord | null {
		if ((chord.scanCode === ScanCode.ControlLeft || chord.scanCode === ScanCode.ControlRight) && !chord.shiftKey && !chord.altKey && !chord.metaKey) {
			return 'ctrl';
		}
		if ((chord.scanCode === ScanCode.AltLeft || chord.scanCode === ScanCode.AltRight) && !chord.ctrlKey && !chord.shiftKey && !chord.metaKey) {
			return 'alt';
		}
		if ((chord.scanCode === ScanCode.ShiftLeft || chord.scanCode === ScanCode.ShiftRight) && !chord.ctrlKey && !chord.altKey && !chord.metaKey) {
			return 'shift';
		}
		if ((chord.scanCode === ScanCode.MetaLeft || chord.scanCode === ScanCode.MetaRight) && !chord.ctrlKey && !chord.shiftKey && !chord.altKey) {
			return 'meta';
		}
		return null;
	}
}

interface IScanCodeMapping {
	scanCode: ScanCode;
	value: number;
	withShift: number;
	withAltGr: number;
	withShiftAltGr: number;
}

class ScanCodeCombo {
	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly scanCode: ScanCode;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, scanCode: ScanCode) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.scanCode = scanCode;
	}

	public toString(): string {
		return `${this.ctrlKey ? 'Ctrl+' : ''}${this.shiftKey ? 'Shift+' : ''}${this.altKey ? 'Alt+' : ''}${ScanCodeUtils.toString(this.scanCode)}`;
	}

	public equals(other: ScanCodeCombo): boolean {
		return (
			this.ctrlKey === other.ctrlKey
			&& this.shiftKey === other.shiftKey
			&& this.altKey === other.altKey
			&& this.scanCode === other.scanCode
		);
	}

	private getProducedCharCode(mapping: IMacLinuxKeyMapping): string {
		if (!mapping) {
			return '';
		}
		if (this.ctrlKey && this.shiftKey && this.altKey) {
			return mapping.withShiftAltGr;
		}
		if (this.ctrlKey && this.altKey) {
			return mapping.withAltGr;
		}
		if (this.shiftKey) {
			return mapping.withShift;
		}
		return mapping.value;
	}

	public getProducedChar(mapping: IMacLinuxKeyMapping): string {
		const charCode = MacLinuxKeyboardMapper.getCharCode(this.getProducedCharCode(mapping));
		if (charCode === 0) {
			return ' --- ';
		}
		if (charCode >= CharCode.U_Combining_Grave_Accent && charCode <= CharCode.U_Combining_Latin_Small_Letter_X) {
			// combining
			return 'U+' + charCode.toString(16);
		}
		return '  ' + String.fromCharCode(charCode) + '  ';
	}
}

class KeyCodeCombo {
	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly keyCode: KeyCode;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, keyCode: KeyCode) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.keyCode = keyCode;
	}

	public toString(): string {
		return `${this.ctrlKey ? 'Ctrl+' : ''}${this.shiftKey ? 'Shift+' : ''}${this.altKey ? 'Alt+' : ''}${KeyCodeUtils.toString(this.keyCode)}`;
	}
}

class ScanCodeKeyCodeMapper {

	/**
	 * ScanCode combination => KeyCode combination.
	 * Only covers relevant modifiers ctrl, shift, alt (since meta does not influence the mappings).
	 */
	private readonly _scanCodeToKeyCode: number[][] = [];
	/**
	 * inverse of `_scanCodeToKeyCode`.
	 * KeyCode combination => ScanCode combination.
	 * Only covers relevant modifiers ctrl, shift, alt (since meta does not influence the mappings).
	 */
	private readonly _keyCodeToScanCode: number[][] = [];

	constructor() {
		this._scanCodeToKeyCode = [];
		this._keyCodeToScanCode = [];
	}

	public registrationComplete(): void {
		// IntlHash and IntlBackslash are rare keys, so ensure they don't end up being the preferred...
		this._moveToEnd(ScanCode.IntlHash);
		this._moveToEnd(ScanCode.IntlBackslash);
	}

	private _moveToEnd(scanCode: ScanCode): void {
		for (let mod = 0; mod < 8; mod++) {
			const encodedKeyCodeCombos = this._scanCodeToKeyCode[(scanCode << 3) + mod];
			if (!encodedKeyCodeCombos) {
				continue;
			}
			for (let i = 0, len = encodedKeyCodeCombos.length; i < len; i++) {
				const encodedScanCodeCombos = this._keyCodeToScanCode[encodedKeyCodeCombos[i]];
				if (encodedScanCodeCombos.length === 1) {
					continue;
				}
				for (let j = 0, len = encodedScanCodeCombos.length; j < len; j++) {
					const entry = encodedScanCodeCombos[j];
					const entryScanCode = (entry >>> 3);
					if (entryScanCode === scanCode) {
						// Move this entry to the end
						for (let k = j + 1; k < len; k++) {
							encodedScanCodeCombos[k - 1] = encodedScanCodeCombos[k];
						}
						encodedScanCodeCombos[len - 1] = entry;
					}
				}
			}
		}
	}

	public registerIfUnknown(scanCodeCombo: ScanCodeCombo, keyCodeCombo: KeyCodeCombo): void {
		if (keyCodeCombo.keyCode === KeyCode.Unknown) {
			return;
		}
		const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
		const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);

		const keyCodeIsDigit = (keyCodeCombo.keyCode >= KeyCode.Digit0 && keyCodeCombo.keyCode <= KeyCode.Digit9);
		const keyCodeIsLetter = (keyCodeCombo.keyCode >= KeyCode.KeyA && keyCodeCombo.keyCode <= KeyCode.KeyZ);

		const existingKeyCodeCombos = this._scanCodeToKeyCode[scanCodeComboEncoded];

		// Allow a scan code to map to multiple key codes if it is a digit or a letter key code
		if (keyCodeIsDigit || keyCodeIsLetter) {
			// Only check that we don't insert the same entry twice
			if (existingKeyCodeCombos) {
				for (let i = 0, len = existingKeyCodeCombos.length; i < len; i++) {
					if (existingKeyCodeCombos[i] === keyCodeComboEncoded) {
						// avoid duplicates
						return;
					}
				}
			}
		} else {
			// Don't allow multiples
			if (existingKeyCodeCombos && existingKeyCodeCombos.length !== 0) {
				return;
			}
		}

		this._scanCodeToKeyCode[scanCodeComboEncoded] = this._scanCodeToKeyCode[scanCodeComboEncoded] || [];
		this._scanCodeToKeyCode[scanCodeComboEncoded].unshift(keyCodeComboEncoded);

		this._keyCodeToScanCode[keyCodeComboEncoded] = this._keyCodeToScanCode[keyCodeComboEncoded] || [];
		this._keyCodeToScanCode[keyCodeComboEncoded].unshift(scanCodeComboEncoded);
	}

	public lookupKeyCodeCombo(keyCodeCombo: KeyCodeCombo): ScanCodeCombo[] {
		const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);
		const scanCodeCombosEncoded = this._keyCodeToScanCode[keyCodeComboEncoded];
		if (!scanCodeCombosEncoded || scanCodeCombosEncoded.length === 0) {
			return [];
		}

		const result: ScanCodeCombo[] = [];
		for (let i = 0, len = scanCodeCombosEncoded.length; i < len; i++) {
			const scanCodeComboEncoded = scanCodeCombosEncoded[i];

			const ctrlKey = (scanCodeComboEncoded & 0b001) ? true : false;
			const shiftKey = (scanCodeComboEncoded & 0b010) ? true : false;
			const altKey = (scanCodeComboEncoded & 0b100) ? true : false;
			const scanCode: ScanCode = (scanCodeComboEncoded >>> 3);

			result[i] = new ScanCodeCombo(ctrlKey, shiftKey, altKey, scanCode);
		}
		return result;
	}

	public lookupScanCodeCombo(scanCodeCombo: ScanCodeCombo): KeyCodeCombo[] {
		const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
		const keyCodeCombosEncoded = this._scanCodeToKeyCode[scanCodeComboEncoded];
		if (!keyCodeCombosEncoded || keyCodeCombosEncoded.length === 0) {
			return [];
		}

		const result: KeyCodeCombo[] = [];
		for (let i = 0, len = keyCodeCombosEncoded.length; i < len; i++) {
			const keyCodeComboEncoded = keyCodeCombosEncoded[i];

			const ctrlKey = (keyCodeComboEncoded & 0b001) ? true : false;
			const shiftKey = (keyCodeComboEncoded & 0b010) ? true : false;
			const altKey = (keyCodeComboEncoded & 0b100) ? true : false;
			const keyCode: KeyCode = (keyCodeComboEncoded >>> 3);

			result[i] = new KeyCodeCombo(ctrlKey, shiftKey, altKey, keyCode);
		}
		return result;
	}

	public guessStableKeyCode(scanCode: ScanCode): KeyCode {
		if (scanCode >= ScanCode.Digit1 && scanCode <= ScanCode.Digit0) {
			// digits are ok
			switch (scanCode) {
				case ScanCode.Digit1: return KeyCode.Digit1;
				case ScanCode.Digit2: return KeyCode.Digit2;
				case ScanCode.Digit3: return KeyCode.Digit3;
				case ScanCode.Digit4: return KeyCode.Digit4;
				case ScanCode.Digit5: return KeyCode.Digit5;
				case ScanCode.Digit6: return KeyCode.Digit6;
				case ScanCode.Digit7: return KeyCode.Digit7;
				case ScanCode.Digit8: return KeyCode.Digit8;
				case ScanCode.Digit9: return KeyCode.Digit9;
				case ScanCode.Digit0: return KeyCode.Digit0;
			}
		}

		// Lookup the scanCode with and without shift and see if the keyCode is stable
		const keyCodeCombos1 = this.lookupScanCodeCombo(new ScanCodeCombo(false, false, false, scanCode));
		const keyCodeCombos2 = this.lookupScanCodeCombo(new ScanCodeCombo(false, true, false, scanCode));
		if (keyCodeCombos1.length === 1 && keyCodeCombos2.length === 1) {
			const shiftKey1 = keyCodeCombos1[0].shiftKey;
			const keyCode1 = keyCodeCombos1[0].keyCode;
			const shiftKey2 = keyCodeCombos2[0].shiftKey;
			const keyCode2 = keyCodeCombos2[0].keyCode;
			if (keyCode1 === keyCode2 && shiftKey1 !== shiftKey2) {
				// This looks like a stable mapping
				return keyCode1;
			}
		}

		return KeyCode.DependsOnKbLayout;
	}

	private _encodeScanCodeCombo(scanCodeCombo: ScanCodeCombo): number {
		return this._encode(scanCodeCombo.ctrlKey, scanCodeCombo.shiftKey, scanCodeCombo.altKey, scanCodeCombo.scanCode);
	}

	private _encodeKeyCodeCombo(keyCodeCombo: KeyCodeCombo): number {
		return this._encode(keyCodeCombo.ctrlKey, keyCodeCombo.shiftKey, keyCodeCombo.altKey, keyCodeCombo.keyCode);
	}

	private _encode(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, principal: number): number {
		return (
			((ctrlKey ? 1 : 0) << 0)
			| ((shiftKey ? 1 : 0) << 1)
			| ((altKey ? 1 : 0) << 2)
			| principal << 3
		) >>> 0;
	}
}

export class MacLinuxKeyboardMapper implements IKeyboardMapper {

	/**
	 * used only for debug purposes.
	 */
	private readonly _codeInfo: IMacLinuxKeyMapping[];
	/**
	 * Maps ScanCode combos <-> KeyCode combos.
	 */
	private readonly _scanCodeKeyCodeMapper: ScanCodeKeyCodeMapper;
	/**
	 * UI label for a ScanCode.
	 */
	private readonly _scanCodeToLabel: Array<string | null> = [];
	/**
	 * Dispatching string for a ScanCode.
	 */
	private readonly _scanCodeToDispatch: Array<string | null> = [];

	constructor(
		private readonly _isUSStandard: boolean,
		rawMappings: IMacLinuxKeyboardMapping,
		private readonly _mapAltGrToCtrlAlt: boolean,
		private readonly _OS: OperatingSystem,
	) {
		this._codeInfo = [];
		this._scanCodeKeyCodeMapper = new ScanCodeKeyCodeMapper();
		this._scanCodeToLabel = [];
		this._scanCodeToDispatch = [];

		const _registerIfUnknown = (
			hwCtrlKey: 0 | 1, hwShiftKey: 0 | 1, hwAltKey: 0 | 1, scanCode: ScanCode,
			kbCtrlKey: 0 | 1, kbShiftKey: 0 | 1, kbAltKey: 0 | 1, keyCode: KeyCode,
		): void => {
			this._scanCodeKeyCodeMapper.registerIfUnknown(
				new ScanCodeCombo(hwCtrlKey ? true : false, hwShiftKey ? true : false, hwAltKey ? true : false, scanCode),
				new KeyCodeCombo(kbCtrlKey ? true : false, kbShiftKey ? true : false, kbAltKey ? true : false, keyCode)
			);
		};

		const _registerAllCombos = (_ctrlKey: 0 | 1, _shiftKey: 0 | 1, _altKey: 0 | 1, scanCode: ScanCode, keyCode: KeyCode): void => {
			for (let ctrlKey = _ctrlKey; ctrlKey <= 1; ctrlKey++) {
				for (let shiftKey = _shiftKey; shiftKey <= 1; shiftKey++) {
					for (let altKey = _altKey; altKey <= 1; altKey++) {
						_registerIfUnknown(
							ctrlKey, shiftKey, altKey, scanCode,
							ctrlKey, shiftKey, altKey, keyCode
						);
					}
				}
			}
		};

		// Initialize `_scanCodeToLabel`
		for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
			this._scanCodeToLabel[scanCode] = null;
		}

		// Initialize `_scanCodeToDispatch`
		for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
			this._scanCodeToDispatch[scanCode] = null;
		}

		// Handle immutable mappings
		for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
			const keyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
			if (keyCode !== KeyCode.DependsOnKbLayout) {
				_registerAllCombos(0, 0, 0, scanCode, keyCode);
				this._scanCodeToLabel[scanCode] = KeyCodeUtils.toString(keyCode);

				if (keyCode === KeyCode.Unknown || isModifierKey(keyCode)) {
					this._scanCodeToDispatch[scanCode] = null; // cannot dispatch on this ScanCode
				} else {
					this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;
				}
			}
		}

		// Try to identify keyboard layouts where characters A-Z are missing
		// and forcibly map them to their corresponding scan codes if that is the case
		const missingLatinLettersOverride: { [scanCode: string]: IMacLinuxKeyMapping } = {};

		{
			const producesLatinLetter: boolean[] = [];
			for (const strScanCode in rawMappings) {
				if (rawMappings.hasOwnProperty(strScanCode)) {
					const scanCode = ScanCodeUtils.toEnum(strScanCode);
					if (scanCode === ScanCode.None) {
						continue;
					}
					if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
						continue;
					}

					const rawMapping = rawMappings[strScanCode];
					const value = MacLinuxKeyboardMapper.getCharCode(rawMapping.value);

					if (value >= CharCode.a && value <= CharCode.z) {
						const upperCaseValue = CharCode.A + (value - CharCode.a);
						producesLatinLetter[upperCaseValue] = true;
					}
				}
			}

			const _registerLetterIfMissing = (charCode: CharCode, scanCode: ScanCode, value: string, withShift: string): void => {
				if (!producesLatinLetter[charCode]) {
					missingLatinLettersOverride[ScanCodeUtils.toString(scanCode)] = {
						value: value,
						withShift: withShift,
						withAltGr: '',
						withShiftAltGr: ''
					};
				}
			};

			// Ensure letters are mapped
			_registerLetterIfMissing(CharCode.A, ScanCode.KeyA, 'a', 'A');
			_registerLetterIfMissing(CharCode.B, ScanCode.KeyB, 'b', 'B');
			_registerLetterIfMissing(CharCode.C, ScanCode.KeyC, 'c', 'C');
			_registerLetterIfMissing(CharCode.D, ScanCode.KeyD, 'd', 'D');
			_registerLetterIfMissing(CharCode.E, ScanCode.KeyE, 'e', 'E');
			_registerLetterIfMissing(CharCode.F, ScanCode.KeyF, 'f', 'F');
			_registerLetterIfMissing(CharCode.G, ScanCode.KeyG, 'g', 'G');
			_registerLetterIfMissing(CharCode.H, ScanCode.KeyH, 'h', 'H');
			_registerLetterIfMissing(CharCode.I, ScanCode.KeyI, 'i', 'I');
			_registerLetterIfMissing(CharCode.J, ScanCode.KeyJ, 'j', 'J');
			_registerLetterIfMissing(CharCode.K, ScanCode.KeyK, 'k', 'K');
			_registerLetterIfMissing(CharCode.L, ScanCode.KeyL, 'l', 'L');
			_registerLetterIfMissing(CharCode.M, ScanCode.KeyM, 'm', 'M');
			_registerLetterIfMissing(CharCode.N, ScanCode.KeyN, 'n', 'N');
			_registerLetterIfMissing(CharCode.O, ScanCode.KeyO, 'o', 'O');
			_registerLetterIfMissing(CharCode.P, ScanCode.KeyP, 'p', 'P');
			_registerLetterIfMissing(CharCode.Q, ScanCode.KeyQ, 'q', 'Q');
			_registerLetterIfMissing(CharCode.R, ScanCode.KeyR, 'r', 'R');
			_registerLetterIfMissing(CharCode.S, ScanCode.KeyS, 's', 'S');
			_registerLetterIfMissing(CharCode.T, ScanCode.KeyT, 't', 'T');
			_registerLetterIfMissing(CharCode.U, ScanCode.KeyU, 'u', 'U');
			_registerLetterIfMissing(CharCode.V, ScanCode.KeyV, 'v', 'V');
			_registerLetterIfMissing(CharCode.W, ScanCode.KeyW, 'w', 'W');
			_registerLetterIfMissing(CharCode.X, ScanCode.KeyX, 'x', 'X');
			_registerLetterIfMissing(CharCode.Y, ScanCode.KeyY, 'y', 'Y');
			_registerLetterIfMissing(CharCode.Z, ScanCode.KeyZ, 'z', 'Z');
		}

		const mappings: IScanCodeMapping[] = [];
		let mappingsLen = 0;
		for (const strScanCode in rawMappings) {
			if (rawMappings.hasOwnProperty(strScanCode)) {
				const scanCode = ScanCodeUtils.toEnum(strScanCode);
				if (scanCode === ScanCode.None) {
					continue;
				}
				if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
					continue;
				}

				this._codeInfo[scanCode] = rawMappings[strScanCode];

				const rawMapping = missingLatinLettersOverride[strScanCode] || rawMappings[strScanCode];
				const value = MacLinuxKeyboardMapper.getCharCode(rawMapping.value);
				const withShift = MacLinuxKeyboardMapper.getCharCode(rawMapping.withShift);
				const withAltGr = MacLinuxKeyboardMapper.getCharCode(rawMapping.withAltGr);
				const withShiftAltGr = MacLinuxKeyboardMapper.getCharCode(rawMapping.withShiftAltGr);

				const mapping: IScanCodeMapping = {
					scanCode: scanCode,
					value: value,
					withShift: withShift,
					withAltGr: withAltGr,
					withShiftAltGr: withShiftAltGr,
				};
				mappings[mappingsLen++] = mapping;

				this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;

				if (value >= CharCode.a && value <= CharCode.z) {
					const upperCaseValue = CharCode.A + (value - CharCode.a);
					this._scanCodeToLabel[scanCode] = String.fromCharCode(upperCaseValue);
				} else if (value >= CharCode.A && value <= CharCode.Z) {
					this._scanCodeToLabel[scanCode] = String.fromCharCode(value);
				} else if (value) {
					this._scanCodeToLabel[scanCode] = String.fromCharCode(value);
				} else {
					this._scanCodeToLabel[scanCode] = null;
				}
			}
		}

		// Handle all `withShiftAltGr` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const scanCode = mapping.scanCode;
			const withShiftAltGr = mapping.withShiftAltGr;
			if (withShiftAltGr === mapping.withAltGr || withShiftAltGr === mapping.withShift || withShiftAltGr === mapping.value) {
				// handled below
				continue;
			}
			const kb = MacLinuxKeyboardMapper._charCodeToKb(withShiftAltGr);
			if (!kb) {
				continue;
			}
			const kbShiftKey = kb.shiftKey;
			const keyCode = kb.keyCode;

			if (kbShiftKey) {
				// Ctrl+Shift+Alt+ScanCode => Shift+KeyCode
				_registerIfUnknown(1, 1, 1, scanCode, 0, 1, 0, keyCode); //       Ctrl+Alt+ScanCode =>          Shift+KeyCode
			} else {
				// Ctrl+Shift+Alt+ScanCode => KeyCode
				_registerIfUnknown(1, 1, 1, scanCode, 0, 0, 0, keyCode); //       Ctrl+Alt+ScanCode =>                KeyCode
			}
		}
		// Handle all `withAltGr` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const scanCode = mapping.scanCode;
			const withAltGr = mapping.withAltGr;
			if (withAltGr === mapping.withShift || withAltGr === mapping.value) {
				// handled below
				continue;
			}
			const kb = MacLinuxKeyboardMapper._charCodeToKb(withAltGr);
			if (!kb) {
				continue;
			}
			const kbShiftKey = kb.shiftKey;
			const keyCode = kb.keyCode;

			if (kbShiftKey) {
				// Ctrl+Alt+ScanCode => Shift+KeyCode
				_registerIfUnknown(1, 0, 1, scanCode, 0, 1, 0, keyCode); //       Ctrl+Alt+ScanCode =>          Shift+KeyCode
			} else {
				// Ctrl+Alt+ScanCode => KeyCode
				_registerIfUnknown(1, 0, 1, scanCode, 0, 0, 0, keyCode); //       Ctrl+Alt+ScanCode =>                KeyCode
			}
		}
		// Handle all `withShift` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const scanCode = mapping.scanCode;
			const withShift = mapping.withShift;
			if (withShift === mapping.value) {
				// handled below
				continue;
			}
			const kb = MacLinuxKeyboardMapper._charCodeToKb(withShift);
			if (!kb) {
				continue;
			}
			const kbShiftKey = kb.shiftKey;
			const keyCode = kb.keyCode;

			if (kbShiftKey) {
				// Shift+ScanCode => Shift+KeyCode
				_registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode); //          Shift+ScanCode =>          Shift+KeyCode
				_registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode); //      Shift+Alt+ScanCode =>      Shift+Alt+KeyCode
				_registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode); //     Ctrl+Shift+ScanCode =>     Ctrl+Shift+KeyCode
				_registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode); // Ctrl+Shift+Alt+ScanCode => Ctrl+Shift+Alt+KeyCode
			} else {
				// Shift+ScanCode => KeyCode
				_registerIfUnknown(0, 1, 0, scanCode, 0, 0, 0, keyCode); //          Shift+ScanCode =>                KeyCode
				_registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode); //          Shift+ScanCode =>          Shift+KeyCode
				_registerIfUnknown(0, 1, 1, scanCode, 0, 0, 1, keyCode); //      Shift+Alt+ScanCode =>            Alt+KeyCode
				_registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode); //      Shift+Alt+ScanCode =>      Shift+Alt+KeyCode
				_registerIfUnknown(1, 1, 0, scanCode, 1, 0, 0, keyCode); //     Ctrl+Shift+ScanCode =>           Ctrl+KeyCode
				_registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode); //     Ctrl+Shift+ScanCode =>     Ctrl+Shift+KeyCode
				_registerIfUnknown(1, 1, 1, scanCode, 1, 0, 1, keyCode); // Ctrl+Shift+Alt+ScanCode =>       Ctrl+Alt+KeyCode
				_registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode); // Ctrl+Shift+Alt+ScanCode => Ctrl+Shift+Alt+KeyCode
			}
		}
		// Handle all `value` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const scanCode = mapping.scanCode;
			const kb = MacLinuxKeyboardMapper._charCodeToKb(mapping.value);
			if (!kb) {
				continue;
			}
			const kbShiftKey = kb.shiftKey;
			const keyCode = kb.keyCode;

			if (kbShiftKey) {
				// ScanCode => Shift+KeyCode
				_registerIfUnknown(0, 0, 0, scanCode, 0, 1, 0, keyCode); //                ScanCode =>          Shift+KeyCode
				_registerIfUnknown(0, 0, 1, scanCode, 0, 1, 1, keyCode); //            Alt+ScanCode =>      Shift+Alt+KeyCode
				_registerIfUnknown(1, 0, 0, scanCode, 1, 1, 0, keyCode); //           Ctrl+ScanCode =>     Ctrl+Shift+KeyCode
				_registerIfUnknown(1, 0, 1, scanCode, 1, 1, 1, keyCode); //       Ctrl+Alt+ScanCode => Ctrl+Shift+Alt+KeyCode
			} else {
				// ScanCode => KeyCode
				_registerIfUnknown(0, 0, 0, scanCode, 0, 0, 0, keyCode); //                ScanCode =>                KeyCode
				_registerIfUnknown(0, 0, 1, scanCode, 0, 0, 1, keyCode); //            Alt+ScanCode =>            Alt+KeyCode
				_registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode); //          Shift+ScanCode =>          Shift+KeyCode
				_registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode); //      Shift+Alt+ScanCode =>      Shift+Alt+KeyCode
				_registerIfUnknown(1, 0, 0, scanCode, 1, 0, 0, keyCode); //           Ctrl+ScanCode =>           Ctrl+KeyCode
				_registerIfUnknown(1, 0, 1, scanCode, 1, 0, 1, keyCode); //       Ctrl+Alt+ScanCode =>       Ctrl+Alt+KeyCode
				_registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode); //     Ctrl+Shift+ScanCode =>     Ctrl+Shift+KeyCode
				_registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode); // Ctrl+Shift+Alt+ScanCode => Ctrl+Shift+Alt+KeyCode
			}
		}
		// Handle all left-over available digits
		_registerAllCombos(0, 0, 0, ScanCode.Digit1, KeyCode.Digit1);
		_registerAllCombos(0, 0, 0, ScanCode.Digit2, KeyCode.Digit2);
		_registerAllCombos(0, 0, 0, ScanCode.Digit3, KeyCode.Digit3);
		_registerAllCombos(0, 0, 0, ScanCode.Digit4, KeyCode.Digit4);
		_registerAllCombos(0, 0, 0, ScanCode.Digit5, KeyCode.Digit5);
		_registerAllCombos(0, 0, 0, ScanCode.Digit6, KeyCode.Digit6);
		_registerAllCombos(0, 0, 0, ScanCode.Digit7, KeyCode.Digit7);
		_registerAllCombos(0, 0, 0, ScanCode.Digit8, KeyCode.Digit8);
		_registerAllCombos(0, 0, 0, ScanCode.Digit9, KeyCode.Digit9);
		_registerAllCombos(0, 0, 0, ScanCode.Digit0, KeyCode.Digit0);

		this._scanCodeKeyCodeMapper.registrationComplete();
	}

	public dumpDebugInfo(): string {
		const result: string[] = [];

		const immutableSamples = [
			ScanCode.ArrowUp,
			ScanCode.Numpad0
		];

		let cnt = 0;
		result.push(`isUSStandard: ${this._isUSStandard}`);
		result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
		for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
			if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
				if (immutableSamples.indexOf(scanCode) === -1) {
					continue;
				}
			}

			if (cnt % 4 === 0) {
				result.push(`|       HW Code combination      |  Key  |    KeyCode combination    | Pri |          UI label         |         User settings          |    Electron accelerator   |       Dispatching string       | WYSIWYG |`);
				result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
			}
			cnt++;

			const mapping = this._codeInfo[scanCode];

			for (let mod = 0; mod < 8; mod++) {
				const hwCtrlKey = (mod & 0b001) ? true : false;
				const hwShiftKey = (mod & 0b010) ? true : false;
				const hwAltKey = (mod & 0b100) ? true : false;
				const scanCodeCombo = new ScanCodeCombo(hwCtrlKey, hwShiftKey, hwAltKey, scanCode);
				const resolvedKb = this.resolveKeyboardEvent({
					_standardKeyboardEventBrand: true,
					ctrlKey: scanCodeCombo.ctrlKey,
					shiftKey: scanCodeCombo.shiftKey,
					altKey: scanCodeCombo.altKey,
					metaKey: false,
					altGraphKey: false,
					keyCode: KeyCode.DependsOnKbLayout,
					code: ScanCodeUtils.toString(scanCode)
				});

				const outScanCodeCombo = scanCodeCombo.toString();
				const outKey = scanCodeCombo.getProducedChar(mapping);
				const ariaLabel = resolvedKb.getAriaLabel();
				const outUILabel = (ariaLabel ? ariaLabel.replace(/Control\+/, 'Ctrl+') : null);
				const outUserSettings = resolvedKb.getUserSettingsLabel();
				const outElectronAccelerator = resolvedKb.getElectronAccelerator();
				const outDispatchStr = resolvedKb.getDispatchChords()[0];

				const isWYSIWYG = (resolvedKb ? resolvedKb.isWYSIWYG() : false);
				const outWYSIWYG = (isWYSIWYG ? '       ' : '   NO  ');

				const kbCombos = this._scanCodeKeyCodeMapper.lookupScanCodeCombo(scanCodeCombo);
				if (kbCombos.length === 0) {
					result.push(`| ${this._leftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._leftPad('', 25)} | ${this._leftPad('', 3)} | ${this._leftPad(outUILabel, 25)} | ${this._leftPad(outUserSettings, 30)} | ${this._leftPad(outElectronAccelerator, 25)} | ${this._leftPad(outDispatchStr, 30)} | ${outWYSIWYG} |`);
				} else {
					for (let i = 0, len = kbCombos.length; i < len; i++) {
						const kbCombo = kbCombos[i];
						// find out the priority of this scan code for this key code
						let colPriority: string;

						const scanCodeCombos = this._scanCodeKeyCodeMapper.lookupKeyCodeCombo(kbCombo);
						if (scanCodeCombos.length === 1) {
							// no need for priority, this key code combo maps to precisely this scan code combo
							colPriority = '';
						} else {
							let priority = -1;
							for (let j = 0; j < scanCodeCombos.length; j++) {
								if (scanCodeCombos[j].equals(scanCodeCombo)) {
									priority = j + 1;
									break;
								}
							}
							colPriority = String(priority);
						}

						const outKeybinding = kbCombo.toString();
						if (i === 0) {
							result.push(`| ${this._leftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._leftPad(outKeybinding, 25)} | ${this._leftPad(colPriority, 3)} | ${this._leftPad(outUILabel, 25)} | ${this._leftPad(outUserSettings, 30)} | ${this._leftPad(outElectronAccelerator, 25)} | ${this._leftPad(outDispatchStr, 30)} | ${outWYSIWYG} |`);
						} else {
							// secondary keybindings
							result.push(`| ${this._leftPad('', 30)} |       | ${this._leftPad(outKeybinding, 25)} | ${this._leftPad(colPriority, 3)} | ${this._leftPad('', 25)} | ${this._leftPad('', 30)} | ${this._leftPad('', 25)} | ${this._leftPad('', 30)} |         |`);
						}
					}
				}

			}
			result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
		}

		return result.join('\n');
	}

	private _leftPad(str: string | null, cnt: number): string {
		if (str === null) {
			str = 'null';
		}
		while (str.length < cnt) {
			str = ' ' + str;
		}
		return str;
	}

	public keyCodeChordToScanCodeChord(chord: KeyCodeChord): ScanCodeChord[] {
		// Avoid double Enter bindings (both ScanCode.NumpadEnter and ScanCode.Enter point to KeyCode.Enter)
		if (chord.keyCode === KeyCode.Enter) {
			return [new ScanCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, ScanCode.Enter)];
		}

		const scanCodeCombos = this._scanCodeKeyCodeMapper.lookupKeyCodeCombo(
			new KeyCodeCombo(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.keyCode)
		);

		const result: ScanCodeChord[] = [];
		for (let i = 0, len = scanCodeCombos.length; i < len; i++) {
			const scanCodeCombo = scanCodeCombos[i];
			result[i] = new ScanCodeChord(scanCodeCombo.ctrlKey, scanCodeCombo.shiftKey, scanCodeCombo.altKey, chord.metaKey, scanCodeCombo.scanCode);
		}
		return result;
	}

	public getUILabelForScanCodeChord(chord: ScanCodeChord | null): string | null {
		if (!chord) {
			return null;
		}
		if (chord.isDuplicateModifierCase()) {
			return '';
		}
		if (this._OS === OperatingSystem.Macintosh) {
			switch (chord.scanCode) {
				case ScanCode.ArrowLeft:
					return '←';
				case ScanCode.ArrowUp:
					return '↑';
				case ScanCode.ArrowRight:
					return '→';
				case ScanCode.ArrowDown:
					return '↓';
			}
		}
		return this._scanCodeToLabel[chord.scanCode];
	}

	public getAriaLabelForScanCodeChord(chord: ScanCodeChord | null): string | null {
		if (!chord) {
			return null;
		}
		if (chord.isDuplicateModifierCase()) {
			return '';
		}
		return this._scanCodeToLabel[chord.scanCode];
	}

	public getDispatchStrForScanCodeChord(chord: ScanCodeChord): string | null {
		const codeDispatch = this._scanCodeToDispatch[chord.scanCode];
		if (!codeDispatch) {
			return null;
		}
		let result = '';

		if (chord.ctrlKey) {
			result += 'ctrl+';
		}
		if (chord.shiftKey) {
			result += 'shift+';
		}
		if (chord.altKey) {
			result += 'alt+';
		}
		if (chord.metaKey) {
			result += 'meta+';
		}
		result += codeDispatch;

		return result;
	}

	public getUserSettingsLabelForScanCodeChord(chord: ScanCodeChord | null): string | null {
		if (!chord) {
			return null;
		}
		if (chord.isDuplicateModifierCase()) {
			return '';
		}

		const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[chord.scanCode];
		if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
			return KeyCodeUtils.toUserSettingsUS(immutableKeyCode).toLowerCase();
		}

		// Check if this scanCode always maps to the same keyCode and back
		const constantKeyCode: KeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(chord.scanCode);
		if (constantKeyCode !== KeyCode.DependsOnKbLayout) {
			// Verify that this is a good key code that can be mapped back to the same scan code
			const reverseChords = this.keyCodeChordToScanCodeChord(new KeyCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, constantKeyCode));
			for (let i = 0, len = reverseChords.length; i < len; i++) {
				const reverseChord = reverseChords[i];
				if (reverseChord.scanCode === chord.scanCode) {
					return KeyCodeUtils.toUserSettingsUS(constantKeyCode).toLowerCase();
				}
			}
		}

		return this._scanCodeToDispatch[chord.scanCode];
	}

	public getElectronAcceleratorLabelForScanCodeChord(chord: ScanCodeChord | null): string | null {
		if (!chord) {
			return null;
		}

		const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[chord.scanCode];
		if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
			return KeyCodeUtils.toElectronAccelerator(immutableKeyCode);
		}

		// Check if this scanCode always maps to the same keyCode and back
		const constantKeyCode: KeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(chord.scanCode);

		if (this._OS === OperatingSystem.Linux && !this._isUSStandard) {
			// [Electron Accelerators] On Linux, Electron does not handle correctly OEM keys.
			// when using a different keyboard layout than US Standard.
			// See https://github.com/microsoft/vscode/issues/23706
			// See https://github.com/microsoft/vscode/pull/134890#issuecomment-941671791
			const isOEMKey = (
				constantKeyCode === KeyCode.Semicolon
				|| constantKeyCode === KeyCode.Equal
				|| constantKeyCode === KeyCode.Comma
				|| constantKeyCode === KeyCode.Minus
				|| constantKeyCode === KeyCode.Period
				|| constantKeyCode === KeyCode.Slash
				|| constantKeyCode === KeyCode.Backquote
				|| constantKeyCode === KeyCode.BracketLeft
				|| constantKeyCode === KeyCode.Backslash
				|| constantKeyCode === KeyCode.BracketRight
			);

			if (isOEMKey) {
				return null;
			}
		}

		if (constantKeyCode !== KeyCode.DependsOnKbLayout) {
			return KeyCodeUtils.toElectronAccelerator(constantKeyCode);
		}

		return null;
	}

	private _toResolvedKeybinding(chordParts: ScanCodeChord[][]): NativeResolvedKeybinding[] {
		if (chordParts.length === 0) {
			return [];
		}
		const result: NativeResolvedKeybinding[] = [];
		this._generateResolvedKeybindings(chordParts, 0, [], result);
		return result;
	}

	private _generateResolvedKeybindings(chordParts: ScanCodeChord[][], currentIndex: number, previousParts: ScanCodeChord[], result: NativeResolvedKeybinding[]) {
		const chordPart = chordParts[currentIndex];
		const isFinalIndex = currentIndex === chordParts.length - 1;
		for (let i = 0, len = chordPart.length; i < len; i++) {
			const chords = [...previousParts, chordPart[i]];
			if (isFinalIndex) {
				result.push(new NativeResolvedKeybinding(this, this._OS, chords));
			} else {
				this._generateResolvedKeybindings(chordParts, currentIndex + 1, chords, result);
			}
		}
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): NativeResolvedKeybinding {
		let code = ScanCodeUtils.toEnum(keyboardEvent.code);

		// Treat NumpadEnter as Enter
		if (code === ScanCode.NumpadEnter) {
			code = ScanCode.Enter;
		}

		const keyCode = keyboardEvent.keyCode;

		if (
			(keyCode === KeyCode.LeftArrow)
			|| (keyCode === KeyCode.UpArrow)
			|| (keyCode === KeyCode.RightArrow)
			|| (keyCode === KeyCode.DownArrow)
			|| (keyCode === KeyCode.Delete)
			|| (keyCode === KeyCode.Insert)
			|| (keyCode === KeyCode.Home)
			|| (keyCode === KeyCode.End)
			|| (keyCode === KeyCode.PageDown)
			|| (keyCode === KeyCode.PageUp)
			|| (keyCode === KeyCode.Backspace)
		) {
			// "Dispatch" on keyCode for these key codes to workaround issues with remote desktoping software
			// where the scan codes appear to be incorrect (see https://github.com/microsoft/vscode/issues/24107)
			const immutableScanCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
			if (immutableScanCode !== ScanCode.DependsOnKbLayout) {
				code = immutableScanCode;
			}

		} else {

			if (
				(code === ScanCode.Numpad1)
				|| (code === ScanCode.Numpad2)
				|| (code === ScanCode.Numpad3)
				|| (code === ScanCode.Numpad4)
				|| (code === ScanCode.Numpad5)
				|| (code === ScanCode.Numpad6)
				|| (code === ScanCode.Numpad7)
				|| (code === ScanCode.Numpad8)
				|| (code === ScanCode.Numpad9)
				|| (code === ScanCode.Numpad0)
				|| (code === ScanCode.NumpadDecimal)
			) {
				// "Dispatch" on keyCode for all numpad keys in order for NumLock to work correctly
				if (keyCode >= 0) {
					const immutableScanCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
					if (immutableScanCode !== ScanCode.DependsOnKbLayout) {
						code = immutableScanCode;
					}
				}
			}
		}

		const ctrlKey = keyboardEvent.ctrlKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
		const altKey = keyboardEvent.altKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
		const chord = new ScanCodeChord(ctrlKey, keyboardEvent.shiftKey, altKey, keyboardEvent.metaKey, code);
		return new NativeResolvedKeybinding(this, this._OS, [chord]);
	}

	private _resolveChord(chord: Chord | null): ScanCodeChord[] {
		if (!chord) {
			return [];
		}
		if (chord instanceof ScanCodeChord) {
			return [chord];
		}
		return this.keyCodeChordToScanCodeChord(chord);
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] {
		const chords: ScanCodeChord[][] = keybinding.chords.map(chord => this._resolveChord(chord));
		return this._toResolvedKeybinding(chords);
	}

	private static _redirectCharCode(charCode: number): number {
		switch (charCode) {
			// allow-any-unicode-next-line
			// CJK: 。 「 」 【 】 ； ，
			// map: . [ ] [ ] ; ,
			case CharCode.U_IDEOGRAPHIC_FULL_STOP: return CharCode.Period;
			case CharCode.U_LEFT_CORNER_BRACKET: return CharCode.OpenSquareBracket;
			case CharCode.U_RIGHT_CORNER_BRACKET: return CharCode.CloseSquareBracket;
			case CharCode.U_LEFT_BLACK_LENTICULAR_BRACKET: return CharCode.OpenSquareBracket;
			case CharCode.U_RIGHT_BLACK_LENTICULAR_BRACKET: return CharCode.CloseSquareBracket;
			case CharCode.U_FULLWIDTH_SEMICOLON: return CharCode.Semicolon;
			case CharCode.U_FULLWIDTH_COMMA: return CharCode.Comma;
		}
		return charCode;
	}

	private static _charCodeToKb(charCode: number): { keyCode: KeyCode; shiftKey: boolean } | null {
		charCode = this._redirectCharCode(charCode);
		if (charCode < CHAR_CODE_TO_KEY_CODE.length) {
			return CHAR_CODE_TO_KEY_CODE[charCode];
		}
		return null;
	}

	/**
	 * Attempt to map a combining character to a regular one that renders the same way.
	 *
	 * https://www.compart.com/en/unicode/bidiclass/NSM
	 */
	public static getCharCode(char: string): number {
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
}

(function () {
	function define(charCode: number, keyCode: KeyCode, shiftKey: boolean): void {
		for (let i = CHAR_CODE_TO_KEY_CODE.length; i < charCode; i++) {
			CHAR_CODE_TO_KEY_CODE[i] = null;
		}
		CHAR_CODE_TO_KEY_CODE[charCode] = { keyCode: keyCode, shiftKey: shiftKey };
	}

	for (let chCode = CharCode.A; chCode <= CharCode.Z; chCode++) {
		define(chCode, KeyCode.KeyA + (chCode - CharCode.A), true);
	}

	for (let chCode = CharCode.a; chCode <= CharCode.z; chCode++) {
		define(chCode, KeyCode.KeyA + (chCode - CharCode.a), false);
	}

	define(CharCode.Semicolon, KeyCode.Semicolon, false);
	define(CharCode.Colon, KeyCode.Semicolon, true);

	define(CharCode.Equals, KeyCode.Equal, false);
	define(CharCode.Plus, KeyCode.Equal, true);

	define(CharCode.Comma, KeyCode.Comma, false);
	define(CharCode.LessThan, KeyCode.Comma, true);

	define(CharCode.Dash, KeyCode.Minus, false);
	define(CharCode.Underline, KeyCode.Minus, true);

	define(CharCode.Period, KeyCode.Period, false);
	define(CharCode.GreaterThan, KeyCode.Period, true);

	define(CharCode.Slash, KeyCode.Slash, false);
	define(CharCode.QuestionMark, KeyCode.Slash, true);

	define(CharCode.BackTick, KeyCode.Backquote, false);
	define(CharCode.Tilde, KeyCode.Backquote, true);

	define(CharCode.OpenSquareBracket, KeyCode.BracketLeft, false);
	define(CharCode.OpenCurlyBrace, KeyCode.BracketLeft, true);

	define(CharCode.Backslash, KeyCode.Backslash, false);
	define(CharCode.Pipe, KeyCode.Backslash, true);

	define(CharCode.CloseSquareBracket, KeyCode.BracketRight, false);
	define(CharCode.CloseCurlyBrace, KeyCode.BracketRight, true);

	define(CharCode.SingleQuote, KeyCode.Quote, false);
	define(CharCode.DoubleQuote, KeyCode.Quote, true);
})();
