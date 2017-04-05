/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';
import { KeyCode, ResolvedKeybinding, KeyCodeUtils, SimpleKeybinding, Keybinding, KeybindingType, USER_SETTINGS } from 'vs/base/common/keyCodes';
import { ScanCode, ScanCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, ScanCodeBinding } from 'vs/workbench/services/keybinding/common/scanCode';
import { CharCode } from 'vs/base/common/charCode';
import { UILabelProvider, AriaLabelProvider, UserSettingsLabelProvider, ElectronAcceleratorLabelProvider, NO_MODIFIERS } from 'vs/platform/keybinding/common/keybindingLabels';
import { IKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';

export interface IMacLinuxKeyMapping {
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;
}

function macLinuxKeyMappingEquals(a: IMacLinuxKeyMapping, b: IMacLinuxKeyMapping): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return (
		a.value === b.value
		&& a.withShift === b.withShift
		&& a.withAltGr === b.withAltGr
		&& a.withShiftAltGr === b.withShiftAltGr
	);
}

export interface IMacLinuxKeyboardMapping {
	[scanCode: string]: IMacLinuxKeyMapping;
}

export function macLinuxKeyboardMappingEquals(a: IMacLinuxKeyboardMapping, b: IMacLinuxKeyboardMapping): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	for (let scanCode = 0; scanCode < ScanCode.MAX_VALUE; scanCode++) {
		const strScanCode = ScanCodeUtils.toString(scanCode);
		const aEntry = a[strScanCode];
		const bEntry = b[strScanCode];
		if (!macLinuxKeyMappingEquals(aEntry, bEntry)) {
			return false;
		}
	}
	return true;
}

const LOG = false;
function log(str: string): void {
	if (LOG) {
		console.info(str);
	}
}

/**
 * A map from character to key codes.
 * e.g. Contains entries such as:
 *  - '/' => { keyCode: KeyCode.US_SLASH, shiftKey: false }
 *  - '?' => { keyCode: KeyCode.US_SLASH, shiftKey: true }
 */
const CHAR_CODE_TO_KEY_CODE: { keyCode: KeyCode; shiftKey: boolean }[] = [];

export class NativeResolvedKeybinding extends ResolvedKeybinding {

	private readonly _mapper: MacLinuxKeyboardMapper;
	private readonly _OS: OperatingSystem;
	private readonly _firstPart: ScanCodeBinding;
	private readonly _chordPart: ScanCodeBinding;

	constructor(mapper: MacLinuxKeyboardMapper, OS: OperatingSystem, firstPart: ScanCodeBinding, chordPart: ScanCodeBinding) {
		super();
		this._mapper = mapper;
		this._OS = OS;
		this._firstPart = firstPart;
		this._chordPart = chordPart;
	}

	private _getUILabelForScanCodeBinding(binding: ScanCodeBinding): string {
		if (!binding) {
			return null;
		}
		if (binding.isDuplicateModifierCase()) {
			return '';
		}
		return this._mapper.getUILabelForScanCode(binding.scanCode);
	}

	public getLabel(): string {
		let firstPart = this._getUILabelForScanCodeBinding(this._firstPart);
		let chordPart = this._getUILabelForScanCodeBinding(this._chordPart);
		return UILabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, this._OS);
	}

	public getLabelWithoutModifiers(): string {
		let firstPart = this._getUILabelForScanCodeBinding(this._firstPart);
		let chordPart = this._getUILabelForScanCodeBinding(this._chordPart);
		return UILabelProvider.toLabel(NO_MODIFIERS, firstPart, NO_MODIFIERS, chordPart, this._OS);
	}

	private _getAriaLabelForScanCodeBinding(binding: ScanCodeBinding): string {
		if (!binding) {
			return null;
		}
		if (binding.isDuplicateModifierCase()) {
			return '';
		}
		return this._mapper.getAriaLabelForScanCode(binding.scanCode);
	}

	public getAriaLabel(): string {
		let firstPart = this._getAriaLabelForScanCodeBinding(this._firstPart);
		let chordPart = this._getAriaLabelForScanCodeBinding(this._chordPart);
		return AriaLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, this._OS);
	}

	public getAriaLabelWithoutModifiers(): string {
		let firstPart = this._getAriaLabelForScanCodeBinding(this._firstPart);
		let chordPart = this._getAriaLabelForScanCodeBinding(this._chordPart);
		return AriaLabelProvider.toLabel(NO_MODIFIERS, firstPart, NO_MODIFIERS, chordPart, this._OS);
	}

	private _getElectronAcceleratorLabelForScanCodeBinding(binding: ScanCodeBinding): string {
		if (!binding) {
			return null;
		}
		if (binding.isDuplicateModifierCase()) {
			return null;
		}
		return this._mapper.getElectronLabelForScanCode(binding.scanCode);
	}

	public getElectronAccelerator(): string {
		if (this._chordPart !== null) {
			// Electron cannot handle chords
			return null;
		}

		let firstPart = this._getElectronAcceleratorLabelForScanCodeBinding(this._firstPart);
		return ElectronAcceleratorLabelProvider.toLabel(this._firstPart, firstPart, null, null, this._OS);
	}

	private _getUserSettingsLabelForScanCodeBinding(binding: ScanCodeBinding): string {
		if (!binding) {
			return null;
		}
		if (binding.isDuplicateModifierCase()) {
			return '';
		}
		return this._mapper.getUserSettingsLabel(binding.scanCode);
	}

	public getUserSettingsLabel(): string {
		let firstPart = this._getUserSettingsLabelForScanCodeBinding(this._firstPart);
		let chordPart = this._getUserSettingsLabelForScanCodeBinding(this._chordPart);
		return UserSettingsLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, this._OS);
	}

	private _isWYSIWYG(scanCode: ScanCode): boolean {
		if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== -1) {
			return true;
		}
		let a = this._mapper.getAriaLabelForScanCode(scanCode);
		let b = this._mapper.getUserSettingsLabel(scanCode);

		if (!a && !b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return (a.toLowerCase() === b.toLowerCase());
	}

	public isWYSIWYG(): boolean {
		let result = true;
		result = result && (this._firstPart ? this._isWYSIWYG(this._firstPart.scanCode) : true);
		result = result && (this._chordPart ? this._isWYSIWYG(this._chordPart.scanCode) : true);
		return result;
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

	public getParts(): [ResolvedKeybinding, ResolvedKeybinding] {
		return [new NativeResolvedKeybinding(this._mapper, this._OS, this._firstPart, null), this._chordPart ? new NativeResolvedKeybinding(this._mapper, this._OS, this._chordPart, null) : null];
	}

	public getDispatchParts(): [string, string] {
		let firstPart = this._firstPart ? this._mapper.getDispatchStrForScanCodeBinding(this._firstPart) : null;
		let chordPart = this._chordPart ? this._mapper.getDispatchStrForScanCodeBinding(this._chordPart) : null;
		return [firstPart, chordPart];
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

	private getProducedCharCode(mapping: IScanCodeMapping): number {
		if (!mapping) {
			return 0;
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

	public getProducedChar(mapping: IScanCodeMapping): string {
		const charCode = this.getProducedCharCode(mapping);
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
		for (let i = 0; i < ScanCode.MAX_VALUE; i++) {
			let base = (i << 3);
			for (let j = 0; j < 8; j++) {
				let actual = base + j;
				let entry = this._scanCodeToKeyCode[actual];
				if (typeof entry === 'undefined') {
					log(`${ScanCodeUtils.toString(i)} - ${j.toString(2)} --- is missing`);
				}
			}
		}

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

		const keyCodeIsDigit = (keyCodeCombo.keyCode >= KeyCode.KEY_0 && keyCodeCombo.keyCode <= KeyCode.KEY_9);
		const keyCodeIsLetter = (keyCodeCombo.keyCode >= KeyCode.KEY_A && keyCodeCombo.keyCode <= KeyCode.KEY_Z);

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

		let result: ScanCodeCombo[] = [];
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

		let result: KeyCodeCombo[] = [];
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
				case ScanCode.Digit1: return KeyCode.KEY_1;
				case ScanCode.Digit2: return KeyCode.KEY_2;
				case ScanCode.Digit3: return KeyCode.KEY_3;
				case ScanCode.Digit4: return KeyCode.KEY_4;
				case ScanCode.Digit5: return KeyCode.KEY_5;
				case ScanCode.Digit6: return KeyCode.KEY_6;
				case ScanCode.Digit7: return KeyCode.KEY_7;
				case ScanCode.Digit8: return KeyCode.KEY_8;
				case ScanCode.Digit9: return KeyCode.KEY_9;
				case ScanCode.Digit0: return KeyCode.KEY_0;
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

		return -1;
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
	 * OS (can be Linux or Macintosh)
	 */
	private readonly _isUSStandard: boolean;
	/**
	 * OS (can be Linux or Macintosh)
	 */
	private readonly _OS: OperatingSystem;
	/**
	 * used only for debug purposes.
	 */
	private readonly _codeInfo: IScanCodeMapping[];
	/**
	 * Maps ScanCode combos <-> KeyCode combos.
	 */
	private readonly _scanCodeKeyCodeMapper: ScanCodeKeyCodeMapper;
	/**
	 * UI label for a ScanCode.
	 */
	private readonly _scanCodeToLabel: string[] = [];
	/**
	 * Dispatching string for a ScanCode.
	 */
	private readonly _scanCodeToDispatch: string[] = [];

	constructor(isUSStandard: boolean, rawMappings: IMacLinuxKeyboardMapping, OS: OperatingSystem) {
		this._isUSStandard = isUSStandard;
		this._OS = OS;
		this._codeInfo = [];
		this._scanCodeKeyCodeMapper = new ScanCodeKeyCodeMapper();
		this._scanCodeToLabel = [];
		this._scanCodeToDispatch = [];

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
			if (keyCode !== -1) {
				this._registerAllCombos1(false, false, false, scanCode, keyCode);
				this._scanCodeToLabel[scanCode] = KeyCodeUtils.toString(keyCode);

				if (keyCode === KeyCode.Unknown || keyCode === KeyCode.Ctrl || keyCode === KeyCode.Meta || keyCode === KeyCode.Alt || keyCode === KeyCode.Shift) {
					this._scanCodeToDispatch[scanCode] = null; // cannot dispatch on this ScanCode
				} else {
					this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;
				}
			}
		}

		let mappings: IScanCodeMapping[] = [], mappingsLen = 0;
		for (let strScanCode in rawMappings) {
			if (rawMappings.hasOwnProperty(strScanCode)) {
				const scanCode = ScanCodeUtils.toEnum(strScanCode);
				if (scanCode === ScanCode.None) {
					log(`Unknown ScanCode ${strScanCode} in mapping.`);
					continue;
				}
				if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== -1) {
					continue;
				}

				const rawMapping = rawMappings[strScanCode];
				const value = MacLinuxKeyboardMapper._getCharCode(rawMapping.value);
				const withShift = MacLinuxKeyboardMapper._getCharCode(rawMapping.withShift);
				const withAltGr = MacLinuxKeyboardMapper._getCharCode(rawMapping.withAltGr);
				const withShiftAltGr = MacLinuxKeyboardMapper._getCharCode(rawMapping.withShiftAltGr);

				const mapping: IScanCodeMapping = {
					scanCode: scanCode,
					value: value,
					withShift: withShift,
					withAltGr: withAltGr,
					withShiftAltGr: withShiftAltGr,
				};
				mappings[mappingsLen++] = mapping;
				this._codeInfo[scanCode] = mapping;

				if (scanCode === ScanCode.IntlHash) {
					console.log('here i am');
				}

				this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;

				if (value >= CharCode.a && value <= CharCode.z) {
					this._scanCodeToLabel[scanCode] = String.fromCharCode(CharCode.A + (value - CharCode.a));
				} else if (value) {
					this._scanCodeToLabel[scanCode] = String.fromCharCode(value);
				} else {
					console.log(`_scanCodeToLabel[${ScanCodeUtils.toString(scanCode)}] => null.`);
					this._scanCodeToLabel[scanCode] = null;
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
			this._registerCharCode(mapping.scanCode, true, true, true, withShiftAltGr);
		}
		// Handle all `withAltGr` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const withAltGr = mapping.withAltGr;
			if (withAltGr === mapping.withShift || withAltGr === mapping.value) {
				// handled below
				continue;
			}
			this._registerCharCode(mapping.scanCode, true, false, true, withAltGr);
		}
		// Handle all `withShift` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const withShift = mapping.withShift;
			if (withShift === mapping.value) {
				// handled below
				continue;
			}
			this._registerCharCode(mapping.scanCode, false, true, false, withShift);
		}
		// Handle all `value` entries
		for (let i = mappings.length - 1; i >= 0; i--) {
			const mapping = mappings[i];
			this._registerCharCode(mapping.scanCode, false, false, false, mapping.value);
		}
		// Handle all left-over available digits
		this._registerAllCombos1(false, false, false, ScanCode.Digit1, KeyCode.KEY_1);
		this._registerAllCombos1(false, false, false, ScanCode.Digit2, KeyCode.KEY_2);
		this._registerAllCombos1(false, false, false, ScanCode.Digit3, KeyCode.KEY_3);
		this._registerAllCombos1(false, false, false, ScanCode.Digit4, KeyCode.KEY_4);
		this._registerAllCombos1(false, false, false, ScanCode.Digit5, KeyCode.KEY_5);
		this._registerAllCombos1(false, false, false, ScanCode.Digit6, KeyCode.KEY_6);
		this._registerAllCombos1(false, false, false, ScanCode.Digit7, KeyCode.KEY_7);
		this._registerAllCombos1(false, false, false, ScanCode.Digit8, KeyCode.KEY_8);
		this._registerAllCombos1(false, false, false, ScanCode.Digit9, KeyCode.KEY_9);
		this._registerAllCombos1(false, false, false, ScanCode.Digit0, KeyCode.KEY_0);

		this._scanCodeKeyCodeMapper.registrationComplete();
	}

	public dumpDebugInfo(): string {
		let result: string[] = [];

		let immutableSamples = [
			ScanCode.ArrowUp,
			ScanCode.Numpad0
		];

		let cnt = 0;
		result.push(`isUSStandard: ${this._isUSStandard}`);
		result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
		for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
			if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== -1) {
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
					ctrlKey: scanCodeCombo.ctrlKey,
					shiftKey: scanCodeCombo.shiftKey,
					altKey: scanCodeCombo.altKey,
					metaKey: false,
					keyCode: -1,
					code: ScanCodeUtils.toString(scanCode)
				});

				const outScanCodeCombo = scanCodeCombo.toString();
				const outKey = scanCodeCombo.getProducedChar(mapping);
				const ariaLabel = resolvedKb.getAriaLabel();
				const outUILabel = (ariaLabel ? ariaLabel.replace(/Control\+/, 'Ctrl+') : null);
				const outUserSettings = resolvedKb.getUserSettingsLabel();
				const outElectronAccelerator = resolvedKb.getElectronAccelerator();
				const outDispatchStr = resolvedKb.getDispatchParts()[0];

				const isWYSIWYG = (resolvedKb ? resolvedKb.isWYSIWYG() : false);
				const outWYSIWYG = (isWYSIWYG ? '       ' : '   NO  ');

				const kbCombos = this._scanCodeKeyCodeMapper.lookupScanCodeCombo(scanCodeCombo);
				if (kbCombos.length === 0) {
					result.push(`| ${this._leftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._leftPad('', 25)} | ${this._leftPad('', 3)} | ${this._leftPad(outUILabel, 25)} | ${this._leftPad(outUserSettings, 30)} | ${this._leftPad(outElectronAccelerator, 25)} | ${this._leftPad(outDispatchStr, 30)} | ${outWYSIWYG} |`);
				} else {
					for (let i = 0, len = kbCombos.length; i < len; i++) {
						const kbCombo = kbCombos[i];
						// find out the priority of this scan code for this key code
						let colPriority = '-';

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
		hwCtrlKey: boolean, hwShiftKey: boolean, hwAltKey: boolean, scanCode: ScanCode,
		kbCtrlKey: boolean, kbShiftKey: boolean, kbAltKey: boolean, keyCode: KeyCode,
	): void {
		this._scanCodeKeyCodeMapper.registerIfUnknown(
			new ScanCodeCombo(hwCtrlKey, hwShiftKey, hwAltKey, scanCode),
			new KeyCodeCombo(kbCtrlKey, kbShiftKey, kbAltKey, keyCode)
		);
	}

	private _registerAllCombos1(
		_ctrlKey: boolean, _shiftKey: boolean, _altKey: boolean, scanCode: ScanCode,
		keyCode: KeyCode,
	): void {
		for (let _ctrl = (_ctrlKey ? 1 : 0); _ctrl <= 1; _ctrl++) {
			const ctrlKey = (_ctrl ? true : false);
			for (let _shift = (_shiftKey ? 1 : 0); _shift <= 1; _shift++) {
				const shiftKey = (_shift ? true : false);
				for (let _alt = (_altKey ? 1 : 0); _alt <= 1; _alt++) {
					const altKey = (_alt ? true : false);
					this._registerIfUnknown(
						ctrlKey, shiftKey, altKey, scanCode,
						ctrlKey, shiftKey, altKey, keyCode
					);
				}
			}
		}
	}

	private _registerAllCombos2(
		hwCtrlKey: boolean, hwShiftKey: boolean, hwAltKey: boolean, scanCode: ScanCode,
		kbShiftKey: boolean, keyCode: KeyCode,
	): void {
		this._registerIfUnknown(
			hwCtrlKey, hwShiftKey, hwAltKey, scanCode,
			false, kbShiftKey, false, keyCode
		);

		if (!kbShiftKey) {
			for (let _ctrl = (hwCtrlKey ? 1 : 0); _ctrl <= 1; _ctrl++) {
				const ctrlKey = (_ctrl ? true : false);
				for (let _alt = (hwAltKey ? 1 : 0); _alt <= 1; _alt++) {
					const altKey = (_alt ? true : false);
					this._registerIfUnknown(
						ctrlKey, hwShiftKey, altKey, scanCode,
						ctrlKey, kbShiftKey, altKey, keyCode
					);
					this._registerIfUnknown(
						ctrlKey, true, altKey, scanCode,
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
						ctrlKey, hwShiftKey, altKey, scanCode,
						ctrlKey, kbShiftKey, altKey, keyCode
					);
				}
			}
		}
	}

	private _registerCharCode(scanCode: ScanCode, ctrlKey: boolean, shiftKey: boolean, altKey: boolean, charCode: number): void {

		let _kb = MacLinuxKeyboardMapper._charCodeToKb(charCode);
		let kb = _kb ? {
			ctrlKey: false,
			shiftKey: _kb.shiftKey,
			altKey: false,
			keyCode: _kb.keyCode
		} : null;

		if (!_kb) {
			this._registerAllCombos1(ctrlKey, shiftKey, altKey, scanCode, KeyCode.Unknown);
			return;
		}

		this._registerAllCombos2(
			ctrlKey, shiftKey, altKey, scanCode,
			kb.shiftKey, kb.keyCode
		);
	}

	public simpleKeybindingToScanCodeBinding(keybinding: SimpleKeybinding): ScanCodeBinding[] {
		// Avoid double Enter bindings (both ScanCode.NumpadEnter and ScanCode.Enter point to KeyCode.Enter)
		if (keybinding.keyCode === KeyCode.Enter) {
			return [new ScanCodeBinding(keybinding.ctrlKey, keybinding.shiftKey, keybinding.altKey, keybinding.metaKey, ScanCode.Enter)];
		}

		const scanCodeCombos = this._scanCodeKeyCodeMapper.lookupKeyCodeCombo(
			new KeyCodeCombo(keybinding.ctrlKey, keybinding.shiftKey, keybinding.altKey, keybinding.keyCode)
		);

		let result: ScanCodeBinding[] = [];
		for (let i = 0, len = scanCodeCombos.length; i < len; i++) {
			const scanCodeCombo = scanCodeCombos[i];
			result[i] = new ScanCodeBinding(scanCodeCombo.ctrlKey, scanCodeCombo.shiftKey, scanCodeCombo.altKey, keybinding.metaKey, scanCodeCombo.scanCode);
		}
		return result;
	}

	public getUILabelForScanCode(scanCode: ScanCode): string {
		if (this._OS === OperatingSystem.Macintosh) {
			switch (scanCode) {
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
		return this._scanCodeToLabel[scanCode];
	}

	public getAriaLabelForScanCode(scanCode: ScanCode): string {
		return this._scanCodeToLabel[scanCode];
	}

	public getDispatchStrForScanCodeBinding(keypress: ScanCodeBinding): string {
		const codeDispatch = this._scanCodeToDispatch[keypress.scanCode];
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

	public getUserSettingsLabel(scanCode: ScanCode): string {
		const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
		if (immutableKeyCode !== -1) {
			return USER_SETTINGS.fromKeyCode(immutableKeyCode).toLowerCase();
		}

		// Check if this scanCode always maps to the same keyCode and back
		let constantKeyCode: KeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(scanCode);
		if (constantKeyCode !== -1) {
			return USER_SETTINGS.fromKeyCode(constantKeyCode).toLowerCase();
		}

		return this._scanCodeToDispatch[scanCode];
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

	public getElectronLabelForScanCode(scanCode: ScanCode): string {
		const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
		if (immutableKeyCode !== -1) {
			return this._getElectronLabelForKeyCode(immutableKeyCode);
		}

		// Check if this scanCode always maps to the same keyCode and back
		let constantKeyCode: KeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(scanCode);

		if (!this._isUSStandard) {
			// Electron cannot handle these key codes on anything else than standard US
			const isOEMKey = (
				constantKeyCode === KeyCode.US_SEMICOLON
				|| constantKeyCode === KeyCode.US_EQUAL
				|| constantKeyCode === KeyCode.US_COMMA
				|| constantKeyCode === KeyCode.US_MINUS
				|| constantKeyCode === KeyCode.US_DOT
				|| constantKeyCode === KeyCode.US_SLASH
				|| constantKeyCode === KeyCode.US_BACKTICK
				|| constantKeyCode === KeyCode.US_OPEN_SQUARE_BRACKET
				|| constantKeyCode === KeyCode.US_BACKSLASH
				|| constantKeyCode === KeyCode.US_CLOSE_SQUARE_BRACKET
			);

			if (isOEMKey) {
				return null;
			}
		}

		if (constantKeyCode !== -1) {
			return this._getElectronLabelForKeyCode(constantKeyCode);
		}

		return null;
	}

	public resolveKeybinding(keybinding: Keybinding): NativeResolvedKeybinding[] {
		let result: NativeResolvedKeybinding[] = [], resultLen = 0;

		if (keybinding.type === KeybindingType.Chord) {
			const firstParts = this.simpleKeybindingToScanCodeBinding(keybinding.firstPart);
			const chordParts = this.simpleKeybindingToScanCodeBinding(keybinding.chordPart);

			for (let i = 0, len = firstParts.length; i < len; i++) {
				const firstPart = firstParts[i];
				for (let j = 0, lenJ = chordParts.length; j < lenJ; j++) {
					const chordPart = chordParts[j];

					result[resultLen++] = new NativeResolvedKeybinding(this, this._OS, firstPart, chordPart);
				}
			}
		} else {
			const firstParts = this.simpleKeybindingToScanCodeBinding(keybinding);

			for (let i = 0, len = firstParts.length; i < len; i++) {
				const firstPart = firstParts[i];

				result[resultLen++] = new NativeResolvedKeybinding(this, this._OS, firstPart, null);
			}
		}

		return result;
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): NativeResolvedKeybinding {
		let code = ScanCodeUtils.toEnum(keyboardEvent.code);
		// Treat NumpadEnter as Enter
		if (code === ScanCode.NumpadEnter) {
			code = ScanCode.Enter;
		}
		const keypress = new ScanCodeBinding(keyboardEvent.ctrlKey, keyboardEvent.shiftKey, keyboardEvent.altKey, keyboardEvent.metaKey, code);
		return new NativeResolvedKeybinding(this, this._OS, keypress, null);
	}

	private _resolveSimpleUserBinding(binding: SimpleKeybinding | ScanCodeBinding): ScanCodeBinding[] {
		if (!binding) {
			return [];
		}
		if (binding instanceof ScanCodeBinding) {
			return [binding];
		}
		return this.simpleKeybindingToScanCodeBinding(binding);
	}

	public resolveUserBinding(_firstPart: SimpleKeybinding | ScanCodeBinding, _chordPart: SimpleKeybinding | ScanCodeBinding): ResolvedKeybinding[] {
		const firstParts = this._resolveSimpleUserBinding(_firstPart);
		const chordParts = this._resolveSimpleUserBinding(_chordPart);

		let result: NativeResolvedKeybinding[] = [], resultLen = 0;
		for (let i = 0, len = firstParts.length; i < len; i++) {
			const firstPart = firstParts[i];
			if (_chordPart) {
				for (let j = 0, lenJ = chordParts.length; j < lenJ; j++) {
					const chordPart = chordParts[j];

					result[resultLen++] = new NativeResolvedKeybinding(this, this._OS, firstPart, chordPart);
				}
			} else {
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
