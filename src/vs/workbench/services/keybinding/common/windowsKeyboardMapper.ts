/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import { KeyCode, KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, ScanCode, ScanCodeUtils, NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE } from 'vs/base/common/keyCodes';
import { Keybinding, ResolvedKeybinding, SimpleKeybinding, KeybindingModifier, ScanCodeBinding } from 'vs/base/common/keybindings';
import { UILabelProvider } from 'vs/base/common/keybindingLabels';
import { OperatingSystem } from 'vs/base/common/platform';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { IKeyboardMapper } from 'vs/platform/keyboardLayout/common/keyboardMapper';
import { BaseResolvedKeybinding } from 'vs/platform/keybinding/common/baseResolvedKeybinding';
import { removeElementsAfterNulls } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { IWindowsKeyboardMapping } from 'vs/platform/keyboardLayout/common/keyboardLayout';

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

export class WindowsNativeResolvedKeybinding extends BaseResolvedKeybinding<SimpleKeybinding> {

	private readonly _mapper: WindowsKeyboardMapper;

	constructor(mapper: WindowsKeyboardMapper, parts: SimpleKeybinding[]) {
		super(OperatingSystem.Windows, parts);
		this._mapper = mapper;
	}

	protected _getLabel(keybinding: SimpleKeybinding): string | null {
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return this._mapper.getUILabelForKeyCode(keybinding.keyCode);
	}

	private _getUSLabelForKeybinding(keybinding: SimpleKeybinding): string | null {
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return KeyCodeUtils.toString(keybinding.keyCode);
	}

	public getUSLabel(): string | null {
		return UILabelProvider.toLabel(this._os, this._parts, (keybinding) => this._getUSLabelForKeybinding(keybinding));
	}

	protected _getAriaLabel(keybinding: SimpleKeybinding): string | null {
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return this._mapper.getAriaLabelForKeyCode(keybinding.keyCode);
	}

	protected _getElectronAccelerator(keybinding: SimpleKeybinding): string | null {
		return this._mapper.getElectronAcceleratorForKeyBinding(keybinding);
	}

	protected _getUserSettingsLabel(keybinding: SimpleKeybinding): string | null {
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		const result = this._mapper.getUserSettingsLabelForKeyCode(keybinding.keyCode);
		return (result ? result.toLowerCase() : result);
	}

	protected _isWYSIWYG(keybinding: SimpleKeybinding): boolean {
		return this.__isWYSIWYG(keybinding.keyCode);
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

	protected _getDispatchPart(keybinding: SimpleKeybinding): string | null {
		if (keybinding.isModifierKey()) {
			return null;
		}
		let result = '';

		if (keybinding.ctrlKey) {
			result += 'ctrl+';
		}
		if (keybinding.shiftKey) {
			result += 'shift+';
		}
		if (keybinding.altKey) {
			result += 'alt+';
		}
		if (keybinding.metaKey) {
			result += 'meta+';
		}
		result += KeyCodeUtils.toString(keybinding.keyCode);

		return result;
	}

	protected _getSingleModifierDispatchPart(keybinding: SimpleKeybinding): KeybindingModifier | null {
		if (keybinding.keyCode === KeyCode.Ctrl && !keybinding.shiftKey && !keybinding.altKey && !keybinding.metaKey) {
			return 'ctrl';
		}
		if (keybinding.keyCode === KeyCode.Shift && !keybinding.ctrlKey && !keybinding.altKey && !keybinding.metaKey) {
			return 'shift';
		}
		if (keybinding.keyCode === KeyCode.Alt && !keybinding.ctrlKey && !keybinding.shiftKey && !keybinding.metaKey) {
			return 'alt';
		}
		if (keybinding.keyCode === KeyCode.Meta && !keybinding.ctrlKey && !keybinding.shiftKey && !keybinding.altKey) {
			return 'meta';
		}
		return null;
	}

	private static getProducedCharCode(kb: ScanCodeBinding, mapping: IScanCodeMapping): string | null {
		if (!mapping) {
			return null;
		}
		if (kb.ctrlKey && kb.shiftKey && kb.altKey) {
			return mapping.withShiftAltGr;
		}
		if (kb.ctrlKey && kb.altKey) {
			return mapping.withAltGr;
		}
		if (kb.shiftKey) {
			return mapping.withShift;
		}
		return mapping.value;
	}

	public static getProducedChar(kb: ScanCodeBinding, mapping: IScanCodeMapping): string {
		const char = this.getProducedCharCode(kb, mapping);
		if (char === null || char.length === 0) {
			return ' --- ';
		}
		return '  ' + char + '  ';
	}
}

export class WindowsKeyboardMapper implements IKeyboardMapper {

	public readonly isUSStandard: boolean;
	private readonly _codeInfo: IScanCodeMapping[];
	private readonly _scanCodeToKeyCode: KeyCode[];
	private readonly _keyCodeToLabel: Array<string | null> = [];
	private readonly _keyCodeExists: boolean[];

	constructor(isUSStandard: boolean, rawMappings: IWindowsKeyboardMapping) {
		this.isUSStandard = isUSStandard;
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

		let producesLetter: boolean[] = [];
		let producesLetters = false;

		this._codeInfo = [];
		for (let strCode in rawMappings) {
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
		let result: string[] = [];

		let immutableSamples = [
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
				const scanCodeBinding = new ScanCodeBinding(ctrlKey, shiftKey, altKey, false, scanCode);
				const kb = this._resolveSimpleUserBinding(scanCodeBinding);
				const strKeyCode = (kb ? KeyCodeUtils.toString(kb.keyCode) : null);
				const resolvedKb = (kb ? new WindowsNativeResolvedKeybinding(this, [kb]) : null);

				const outScanCode = `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${strCode}`;
				const ariaLabel = (resolvedKb ? resolvedKb.getAriaLabel() : null);
				const outUILabel = (ariaLabel ? ariaLabel.replace(/Control\+/, 'Ctrl+') : null);
				const outUserSettings = (resolvedKb ? resolvedKb.getUserSettingsLabel() : null);
				const outKey = WindowsNativeResolvedKeybinding.getProducedChar(scanCodeBinding, mapping);
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
		if (this.isUSStandard) {
			return KeyCodeUtils.toUserSettingsUS(keyCode);
		}
		return KeyCodeUtils.toUserSettingsGeneral(keyCode);
	}

	public getElectronAcceleratorForKeyBinding(keybinding: SimpleKeybinding): string | null {
		return KeyCodeUtils.toElectronAccelerator(keybinding.keyCode);
	}

	private _getLabelForKeyCode(keyCode: KeyCode): string {
		return this._keyCodeToLabel[keyCode] || KeyCodeUtils.toString(KeyCode.Unknown);
	}

	public resolveKeybinding(keybinding: Keybinding): WindowsNativeResolvedKeybinding[] {
		const parts = keybinding.parts;
		for (let i = 0, len = parts.length; i < len; i++) {
			const part = parts[i];
			if (!this._keyCodeExists[part.keyCode]) {
				return [];
			}
		}
		return [new WindowsNativeResolvedKeybinding(this, parts)];
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): WindowsNativeResolvedKeybinding {
		const keybinding = new SimpleKeybinding(keyboardEvent.ctrlKey, keyboardEvent.shiftKey, keyboardEvent.altKey, keyboardEvent.metaKey, keyboardEvent.keyCode);
		return new WindowsNativeResolvedKeybinding(this, [keybinding]);
	}

	private _resolveSimpleUserBinding(binding: SimpleKeybinding | ScanCodeBinding | null): SimpleKeybinding | null {
		if (!binding) {
			return null;
		}
		if (binding instanceof SimpleKeybinding) {
			if (!this._keyCodeExists[binding.keyCode]) {
				return null;
			}
			return binding;
		}
		const keyCode = this._scanCodeToKeyCode[binding.scanCode] || KeyCode.Unknown;
		if (keyCode === KeyCode.Unknown || !this._keyCodeExists[keyCode]) {
			return null;
		}
		return new SimpleKeybinding(binding.ctrlKey, binding.shiftKey, binding.altKey, binding.metaKey, keyCode);
	}

	public resolveUserBinding(input: (SimpleKeybinding | ScanCodeBinding)[]): ResolvedKeybinding[] {
		const parts: SimpleKeybinding[] = removeElementsAfterNulls(input.map(keybinding => this._resolveSimpleUserBinding(keybinding)));
		if (parts.length > 0) {
			return [new WindowsNativeResolvedKeybinding(this, parts)];
		}
		return [];
	}
}
