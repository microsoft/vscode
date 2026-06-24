/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';
import { KeyCode, KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, ScanCode, ScanCodeUtils, NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE } from '../../../../base/common/keyCodes.js';
import { ResolvedKeybinding, KeyCodeChord, SingleModifierChord, ScanCodeChord, Keybinding, Chord } from '../../../../base/common/keybindings.js';
import { UILabelProvider } from '../../../../base/common/keybindingLabels.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { IKeyboardEvent } from '../../../../platform/keybinding/common/keybinding.js';
import { IKeyboardMapper } from '../../../../platform/keyboardLayout/common/keyboardMapper.js';
import { BaseResolvedKeybinding } from '../../../../platform/keybinding/common/baseResolvedKeybinding.js';
import { toEmptyArrayIfContainsNull } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { IWindowsKeyboardMapping } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';

const LOG = false;
function log(str: string): void {
	if (LOG) {
		console.info(str);
	}
}


export interface IScanCodeMapping {
	scanCode: ScanCode;
	keyCode: KeyCode;
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;
}

export class WindowsNativeResolvedKeybinding extends BaseResolvedKeybinding<KeyCodeChord> {

	private readonly _mapper: WindowsKeyboardMapper;

	constructor(mapper: WindowsKeyboardMapper, chords: KeyCodeChord[]) {
		super(OperatingSystem.Windows, chords);
		this._mapper = mapper;
	}

	protected _getLabel(chord: KeyCodeChord): string | null {
		if (chord.isDuplicateModifierCase()) {
			return '';
		}
		return this._mapper.getUILabelForKeyCode(chord.keyCode);
	}

	private _getUSLabelForKeybinding(chord: KeyCodeChord): string | null {
		if (chord.isDuplicateModifierCase()) {
			return '';
		}
		return KeyCodeUtils.toString(chord.keyCode);
	}

	public getUSLabel(): string | null {
		return UILabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getUSLabelForKeybinding(keybinding));
	}

	protected _getAriaLabel(chord: KeyCodeChord): string | null {
		if (chord.isDuplicateModifierCase()) {
			return '';
		}
		return this._mapper.getAriaLabelForKeyCode(chord.keyCode);
	}

	protected _getElectronAccelerator(chord: KeyCodeChord): string | null {
		return this._mapper.getElectronAcceleratorForKeyBinding(chord);
	}

	protected _getUserSettingsLabel(chord: KeyCodeChord): string | null {
		if (chord.isDuplicateModifierCase()) {
			return '';
		}
		const result = this._mapper.getUserSettingsLabelForKeyCode(chord.keyCode);
		return (result ? result.toLowerCase() : result);
	}

	protected _isWYSIWYG(chord: KeyCodeChord): boolean {
		return this.__isWYSIWYG(chord.keyCode);
	}

	private __isWYSIWYG(keyCode: KeyCode): boolean {
		if (
			keyCode === KeyCode.LeftArrow
			|| keyCode === KeyCode.UpArrow
			|| keyCode === KeyCode.RightArrow
			|| keyCode === KeyCode.DownArrow
		) {
			return true;
		}
		const ariaLabel = this._mapper.getAriaLabelForKeyCode(keyCode);
		const userSettingsLabel = this._mapper.getUserSettingsLabelForKeyCode(keyCode);
		return (ariaLabel === userSettingsLabel);
	}

	protected _getChordDispatch(chord: KeyCodeChord): string | null {
		if (chord.isModifierKey()) {
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
		result += KeyCodeUtils.toString(chord.keyCode);

		return result;
	}

	protected _getSingleModifierChordDispatch(chord: KeyCodeChord): SingleModifierChord | null {
		if (chord.keyCode === KeyCode.Ctrl && !chord.shiftKey && !chord.altKey && !chord.metaKey) {
			return 'ctrl';
		}
		if (chord.keyCode === KeyCode.Shift && !chord.ctrlKey && !chord.altKey && !chord.metaKey) {
			return 'shift';
		}
		if (chord.keyCode === KeyCode.Alt && !chord.ctrlKey && !chord.shiftKey && !chord.metaKey) {
			return 'alt';
		}
		if (chord.keyCode === KeyCode.Meta && !chord.ctrlKey && !chord.shiftKey && !chord.altKey) {
			return 'meta';
		}
		return null;
	}

	private static getProducedCharCode(chord: ScanCodeChord, mapping: IScanCodeMapping): string | null {
		if (!mapping) {
			return null;
		}
		if (chord.ctrlKey && chord.shiftKey && chord.altKey) {
			return mapping.withShiftAltGr;
		}
		if (chord.ctrlKey && chord.altKey) {
			return mapping.withAltGr;
		}
		if (chord.shiftKey) {
			return mapping.withShift;
		}
		return mapping.value;
	}

	public static getProducedChar(chord: ScanCodeChord, mapping: IScanCodeMapping): string {
		const char = this.getProducedCharCode(chord, mapping);
		if (char === null || char.length === 0) {
			return ' --- ';
		}
		return '  ' + char + '  ';
	}
}

export class WindowsKeyboardMapper implements IKeyboardMapper {

	private readonly _codeInfo: IScanCodeMapping[];
	private readonly _scanCodeToKeyCode: KeyCode[];
	private readonly _keyCodeToLabel: Array<string | null> = [];
	private readonly _keyCodeExists: boolean[];

	constructor(
		private readonly _isUSStandard: boolean,
		rawMappings: IWindowsKeyboardMapping,
		private readonly _mapAltGrToCtrlAlt: boolean
	) {
		this._scanCodeToKeyCode = [];
		this._keyCodeToLabel = [];
		this._keyCodeExists = [];
		this._keyCodeToLabel[KeyCode.Unknown] = KeyCodeUtils.toString(KeyCode.Unknown);

		for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
			const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
			if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
				this._scanCodeToKeyCode[scanCode] = immutableKeyCode;
				this._keyCodeToLabel[immutableKeyCode] = KeyCodeUtils.toString(immutableKeyCode);
				this._keyCodeExists[immutableKeyCode] = true;
			}
		}

		const producesLetter: boolean[] = [];
		let producesLetters = false;

		this._codeInfo = [];
		for (const strCode in rawMappings) {
			if (rawMappings.hasOwnProperty(strCode)) {
				const scanCode = ScanCodeUtils.toEnum(strCode);
				if (scanCode === ScanCode.None) {
					log(`Unknown scanCode ${strCode} in mapping.`);
					continue;
				}
				const rawMapping = rawMappings[strCode];

				const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
				if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
					const keyCode = NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || KeyCode.Unknown;
					if (keyCode === KeyCode.Unknown || immutableKeyCode === keyCode) {
						continue;
					}
					if (scanCode !== ScanCode.NumpadComma) {
						// Looks like ScanCode.NumpadComma doesn't always map to KeyCode.NUMPAD_SEPARATOR
						// e.g. on POR - PTB
						continue;
					}
				}

				const value = rawMapping.value;
				const withShift = rawMapping.withShift;
				const withAltGr = rawMapping.withAltGr;
				const withShiftAltGr = rawMapping.withShiftAltGr;
				const keyCode = NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || KeyCode.Unknown;

				const mapping: IScanCodeMapping = {
					scanCode: scanCode,
					keyCode: keyCode,
					value: value,
					withShift: withShift,
					withAltGr: withAltGr,
					withShiftAltGr: withShiftAltGr,
				};
				this._codeInfo[scanCode] = mapping;
				this._scanCodeToKeyCode[scanCode] = keyCode;

				if (keyCode === KeyCode.Unknown) {
					continue;
				}
				this._keyCodeExists[keyCode] = true;

				if (value.length === 0) {
					// This key does not produce strings
					this._keyCodeToLabel[keyCode] = null;
				}

				else if (value.length > 1) {
					// This key produces a letter representable with multiple UTF-16 code units.
					this._keyCodeToLabel[keyCode] = value;
				}

				else {
					const charCode = value.charCodeAt(0);

					if (charCode >= CharCode.a && charCode <= CharCode.z) {
						const upperCaseValue = CharCode.A + (charCode - CharCode.a);
						producesLetter[upperCaseValue] = true;
						producesLetters = true;
						this._keyCodeToLabel[keyCode] = String.fromCharCode(CharCode.A + (charCode - CharCode.a));
					}

					else if (charCode >= CharCode.A && charCode <= CharCode.Z) {
						producesLetter[charCode] = true;
						producesLetters = true;
						this._keyCodeToLabel[keyCode] = value;
					}

					else {
						this._keyCodeToLabel[keyCode] = value;
					}
				}
			}
		}

		// Handle keyboard layouts where latin characters are not produced e.g. Cyrillic
		const _registerLetterIfMissing = (charCode: CharCode, keyCode: KeyCode): void => {
			if (!producesLetter[charCode]) {
				this._keyCodeToLabel[keyCode] = String.fromCharCode(charCode);
			}
		};
		_registerLetterIfMissing(CharCode.A, KeyCode.KeyA);
		_registerLetterIfMissing(CharCode.B, KeyCode.KeyB);
		_registerLetterIfMissing(CharCode.C, KeyCode.KeyC);
		_registerLetterIfMissing(CharCode.D, KeyCode.KeyD);
		_registerLetterIfMissing(CharCode.E, KeyCode.KeyE);
		_registerLetterIfMissing(CharCode.F, KeyCode.KeyF);
		_registerLetterIfMissing(CharCode.G, KeyCode.KeyG);
		_registerLetterIfMissing(CharCode.H, KeyCode.KeyH);
		_registerLetterIfMissing(CharCode.I, KeyCode.KeyI);
		_registerLetterIfMissing(CharCode.J, KeyCode.KeyJ);
		_registerLetterIfMissing(CharCode.K, KeyCode.KeyK);
		_registerLetterIfMissing(CharCode.L, KeyCode.KeyL);
		_registerLetterIfMissing(CharCode.M, KeyCode.KeyM);
		_registerLetterIfMissing(CharCode.N, KeyCode.KeyN);
		_registerLetterIfMissing(CharCode.O, KeyCode.KeyO);
		_registerLetterIfMissing(CharCode.P, KeyCode.KeyP);
		_registerLetterIfMissing(CharCode.Q, KeyCode.KeyQ);
		_registerLetterIfMissing(CharCode.R, KeyCode.KeyR);
		_registerLetterIfMissing(CharCode.S, KeyCode.KeyS);
		_registerLetterIfMissing(CharCode.T, KeyCode.KeyT);
		_registerLetterIfMissing(CharCode.U, KeyCode.KeyU);
		_registerLetterIfMissing(CharCode.V, KeyCode.KeyV);
		_registerLetterIfMissing(CharCode.W, KeyCode.KeyW);
		_registerLetterIfMissing(CharCode.X, KeyCode.KeyX);
		_registerLetterIfMissing(CharCode.Y, KeyCode.KeyY);
		_registerLetterIfMissing(CharCode.Z, KeyCode.KeyZ);

		if (!producesLetters) {
			// Since this keyboard layout produces no latin letters at all, most of the UI will use the
			// US kb layout equivalent for UI labels, so also try to render other keys with the US labels
			// for consistency...
			const _registerLabel = (keyCode: KeyCode, charCode: CharCode): void => {
				// const existingLabel = this._keyCodeToLabel[keyCode];
				// const existingCharCode = (existingLabel ? existingLabel.charCodeAt(0) : CharCode.Null);
				// if (existingCharCode < 32 || existingCharCode > 126) {
				this._keyCodeToLabel[keyCode] = String.fromCharCode(charCode);
				// }
			};
			_registerLabel(KeyCode.Semicolon, CharCode.Semicolon);
			_registerLabel(KeyCode.Equal, CharCode.Equals);
			_registerLabel(KeyCode.Comma, CharCode.Comma);
			_registerLabel(KeyCode.Minus, CharCode.Dash);
			_registerLabel(KeyCode.Period, CharCode.Period);
			_registerLabel(KeyCode.Slash, CharCode.Slash);
			_registerLabel(KeyCode.Backquote, CharCode.BackTick);
			_registerLabel(KeyCode.BracketLeft, CharCode.OpenSquareBracket);
			_registerLabel(KeyCode.Backslash, CharCode.Backslash);
			_registerLabel(KeyCode.BracketRight, CharCode.CloseSquareBracket);
			_registerLabel(KeyCode.Quote, CharCode.SingleQuote);
		}
	}

	public dumpDebugInfo(): string {
		const result: string[] = [];

		const immutableSamples = [
			ScanCode.ArrowUp,
			ScanCode.Numpad0
		];

		let cnt = 0;
		result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
		for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
			if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
				if (immutableSamples.indexOf(scanCode) === -1) {
					continue;
				}
			}

			if (cnt % 6 === 0) {
				result.push(`|       HW Code combination      |  Key  |    KeyCode combination    |          UI label         |        User settings       | WYSIWYG |`);
				result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
			}
			cnt++;

			const mapping = this._codeInfo[scanCode];
			const strCode = ScanCodeUtils.toString(scanCode);

			const mods = [0b000, 0b010, 0b101, 0b111];
			for (const mod of mods) {
				const ctrlKey = (mod & 0b001) ? true : false;
				const shiftKey = (mod & 0b010) ? true : false;
				const altKey = (mod & 0b100) ? true : false;
				const scanCodeChord = new ScanCodeChord(ctrlKey, shiftKey, altKey, false, scanCode);
				const keyCodeChord = this._resolveChord(scanCodeChord);
				const strKeyCode = (keyCodeChord ? KeyCodeUtils.toString(keyCodeChord.keyCode) : null);
				const resolvedKb = (keyCodeChord ? new WindowsNativeResolvedKeybinding(this, [keyCodeChord]) : null);

				const outScanCode = `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${strCode}`;
				const ariaLabel = (resolvedKb ? resolvedKb.getAriaLabel() : null);
				const outUILabel = (ariaLabel ? ariaLabel.replace(/Control\+/, 'Ctrl+') : null);
				const outUserSettings = (resolvedKb ? resolvedKb.getUserSettingsLabel() : null);
				const outKey = WindowsNativeResolvedKeybinding.getProducedChar(scanCodeChord, mapping);
				const outKb = (strKeyCode ? `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${strKeyCode}` : null);
				const isWYSIWYG = (resolvedKb ? resolvedKb.isWYSIWYG() : false);
				const outWYSIWYG = (isWYSIWYG ? '       ' : '   NO  ');
				result.push(`| ${this._leftPad(outScanCode, 30)} | ${outKey} | ${this._leftPad(outKb, 25)} | ${this._leftPad(outUILabel, 25)} |  ${this._leftPad(outUserSettings, 25)} | ${outWYSIWYG} |`);
			}
			result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
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

	public getUILabelForKeyCode(keyCode: KeyCode): string {
		return this._getLabelForKeyCode(keyCode);
	}

	public getAriaLabelForKeyCode(keyCode: KeyCode): string {
		return this._getLabelForKeyCode(keyCode);
	}

	public getUserSettingsLabelForKeyCode(keyCode: KeyCode): string {
		if (this._isUSStandard) {
			return KeyCodeUtils.toUserSettingsUS(keyCode);
		}
		return KeyCodeUtils.toUserSettingsGeneral(keyCode);
	}

	public getElectronAcceleratorForKeyBinding(chord: KeyCodeChord): string | null {
		return KeyCodeUtils.toElectronAccelerator(chord.keyCode);
	}

	private _getLabelForKeyCode(keyCode: KeyCode): string {
		return this._keyCodeToLabel[keyCode] || KeyCodeUtils.toString(KeyCode.Unknown);
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): WindowsNativeResolvedKeybinding {
		const ctrlKey = keyboardEvent.ctrlKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
		const altKey = keyboardEvent.altKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
		const chord = new KeyCodeChord(ctrlKey, keyboardEvent.shiftKey, altKey, keyboardEvent.metaKey, keyboardEvent.keyCode);
		return new WindowsNativeResolvedKeybinding(this, [chord]);
	}

	private _resolveChord(chord: Chord | null): KeyCodeChord | null {
		if (!chord) {
			return null;
		}
		if (chord instanceof KeyCodeChord) {
			if (!this._keyCodeExists[chord.keyCode]) {
				return null;
			}
			return chord;
		}
		const keyCode = this._scanCodeToKeyCode[chord.scanCode] || KeyCode.Unknown;
		if (keyCode === KeyCode.Unknown || !this._keyCodeExists[keyCode]) {
			return null;
		}
		return new KeyCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, keyCode);
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] {
		const chords: KeyCodeChord[] = toEmptyArrayIfContainsNull(keybinding.chords.map(chord => this._resolveChord(chord)));
		if (chords.length > 0) {
			return [new WindowsNativeResolvedKeybinding(this, chords)];
		}
		return [];
	}
}
