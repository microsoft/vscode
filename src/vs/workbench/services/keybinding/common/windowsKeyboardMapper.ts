/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyCode, KeyCodeUtils, ResolvedKeybinding, Keybinding, SimpleKeybinding, KeybindingType, USER_SETTINGS } from 'vs/base/common/keyCodes';
import { ScanCode, ScanCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, ScanCodeBinding } from 'vs/workbench/services/keybinding/common/scanCode';
import { CharCode } from 'vs/base/common/charCode';
import { UILabelProvider, AriaLabelProvider, ElectronAcceleratorLabelProvider, UserSettingsLabelProvider, NO_MODIFIERS } from 'vs/platform/keybinding/common/keybindingLabels';
import { OperatingSystem } from 'vs/base/common/platform';
import { IKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';

export interface IWindowsKeyMapping {
	vkey: string;
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;
}

function windowsKeyMappingEquals(a: IWindowsKeyMapping, b: IWindowsKeyMapping): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return (
		a.vkey === b.vkey
		&& a.value === b.value
		&& a.withShift === b.withShift
		&& a.withAltGr === b.withAltGr
		&& a.withShiftAltGr === b.withShiftAltGr
	);
}

export interface IWindowsKeyboardMapping {
	[scanCode: string]: IWindowsKeyMapping;
}

export function windowsKeyboardMappingEquals(a: IWindowsKeyboardMapping, b: IWindowsKeyboardMapping): boolean {
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
		if (!windowsKeyMappingEquals(aEntry, bEntry)) {
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

const NATIVE_KEY_CODE_TO_KEY_CODE: { [nativeKeyCode: string]: KeyCode; } = _getNativeMap();

export interface IScanCodeMapping {
	scanCode: ScanCode;
	keyCode: KeyCode;
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;
}

export class WindowsNativeResolvedKeybinding extends ResolvedKeybinding {

	private readonly _mapper: WindowsKeyboardMapper;
	private readonly _firstPart: SimpleKeybinding;
	private readonly _chordPart: SimpleKeybinding;

	constructor(mapper: WindowsKeyboardMapper, firstPart: SimpleKeybinding, chordPart: SimpleKeybinding) {
		super();
		this._mapper = mapper;
		this._firstPart = firstPart;
		this._chordPart = chordPart;
	}

	private _getUILabelForKeybinding(keybinding: SimpleKeybinding): string {
		if (!keybinding) {
			return null;
		}
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return this._mapper.getUILabelForKeyCode(keybinding.keyCode);
	}

	public getLabel(): string {
		let firstPart = this._getUILabelForKeybinding(this._firstPart);
		let chordPart = this._getUILabelForKeybinding(this._chordPart);
		return UILabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, OperatingSystem.Windows);
	}

	public getLabelWithoutModifiers(): string {
		let firstPart = this._getUILabelForKeybinding(this._firstPart);
		let chordPart = this._getUILabelForKeybinding(this._chordPart);
		return UILabelProvider.toLabel(NO_MODIFIERS, firstPart, NO_MODIFIERS, chordPart, OperatingSystem.Windows);
	}

	private _getAriaLabelForKeybinding(keybinding: SimpleKeybinding): string {
		if (!keybinding) {
			return null;
		}
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return this._mapper.getAriaLabelForKeyCode(keybinding.keyCode);
	}

	public getAriaLabel(): string {
		let firstPart = this._getAriaLabelForKeybinding(this._firstPart);
		let chordPart = this._getAriaLabelForKeybinding(this._chordPart);
		return AriaLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, OperatingSystem.Windows);
	}

	public getAriaLabelWithoutModifiers(): string {
		let firstPart = this._getAriaLabelForKeybinding(this._firstPart);
		let chordPart = this._getAriaLabelForKeybinding(this._chordPart);
		return AriaLabelProvider.toLabel(NO_MODIFIERS, firstPart, NO_MODIFIERS, chordPart, OperatingSystem.Windows);
	}

	private _keyCodeToElectronAccelerator(keyCode: KeyCode): string {
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

	private _getElectronAcceleratorLabelForKeybinding(keybinding: SimpleKeybinding): string {
		if (!keybinding) {
			return null;
		}
		if (keybinding.isDuplicateModifierCase()) {
			return null;
		}
		return this._keyCodeToElectronAccelerator(keybinding.keyCode);
	}

	public getElectronAccelerator(): string {
		if (this._chordPart !== null) {
			// Electron cannot handle chords
			return null;
		}

		let firstPart = this._getElectronAcceleratorLabelForKeybinding(this._firstPart);
		return ElectronAcceleratorLabelProvider.toLabel(this._firstPart, firstPart, null, null, OperatingSystem.Windows);
	}

	private _getUserSettingsLabelForKeybinding(keybinding: SimpleKeybinding): string {
		if (!keybinding) {
			return null;
		}
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return USER_SETTINGS.fromKeyCode(keybinding.keyCode);
	}

	public getUserSettingsLabel(): string {
		let firstPart = this._getUserSettingsLabelForKeybinding(this._firstPart);
		let chordPart = this._getUserSettingsLabelForKeybinding(this._chordPart);
		let result = UserSettingsLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, OperatingSystem.Windows);
		return (result ? result.toLowerCase() : result);
	}

	public isWYSIWYG(): boolean {
		let firstPart1 = this._firstPart ? this._mapper.getAriaLabelForKeyCode(this._firstPart.keyCode) : null;
		let chordPart1 = this._chordPart ? this._mapper.getAriaLabelForKeyCode(this._chordPart.keyCode) : null;

		let firstPart2 = this._firstPart ? KeyCodeUtils.toString(this._firstPart.keyCode) : null;
		let chordPart2 = this._chordPart ? KeyCodeUtils.toString(this._chordPart.keyCode) : null;

		return (firstPart1 === firstPart2 && chordPart1 === chordPart2);
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
		return [new WindowsNativeResolvedKeybinding(this._mapper, this._firstPart, null), this._chordPart ? new WindowsNativeResolvedKeybinding(this._mapper, this._chordPart, null) : null];
	}

	public getDispatchParts(): [string, string] {
		let firstPart = this._firstPart ? this._getDispatchStr(this._firstPart) : null;
		let chordPart = this._chordPart ? this._getDispatchStr(this._chordPart) : null;
		return [firstPart, chordPart];
	}

	private _getDispatchStr(keybinding: SimpleKeybinding): string {
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

	private static getProducedCharCode(kb: ScanCodeBinding, mapping: IScanCodeMapping): string {
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

	private readonly _codeInfo: IScanCodeMapping[];
	private readonly _scanCodeToKeyCode: KeyCode[];
	private readonly _keyCodeToLabel: string[] = [];
	private readonly _keyCodeExists: boolean[];

	constructor(rawMappings: IWindowsKeyboardMapping) {
		this._scanCodeToKeyCode = [];
		this._keyCodeToLabel = [];
		this._keyCodeExists = [];
		this._keyCodeToLabel[KeyCode.Unknown] = KeyCodeUtils.toString(KeyCode.Unknown);

		for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
			const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
			if (immutableKeyCode !== -1) {
				this._scanCodeToKeyCode[scanCode] = immutableKeyCode;
				this._keyCodeToLabel[immutableKeyCode] = KeyCodeUtils.toString(immutableKeyCode);
				this._keyCodeExists[immutableKeyCode] = true;
			}
		}

		this._codeInfo = [];
		for (let strCode in rawMappings) {
			if (rawMappings.hasOwnProperty(strCode)) {
				const scanCode = ScanCodeUtils.toEnum(strCode);
				if (scanCode === ScanCode.None) {
					log(`Unknown scanCode ${strCode} in mapping.`);
					continue;
				}
				if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== -1) {
					continue;
				}

				const rawMapping = rawMappings[strCode];
				const value = rawMapping.value;
				const withShift = rawMapping.withShift;
				const withAltGr = rawMapping.withAltGr;
				const withShiftAltGr = rawMapping.withShiftAltGr;
				const keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || KeyCode.Unknown;

				const mapping: IScanCodeMapping = {
					scanCode: scanCode,
					keyCode: keyCode,
					value: value,
					withShift: withShift,
					withAltGr: withAltGr,
					withShiftAltGr: withShiftAltGr,
				};
				this._codeInfo[scanCode] = mapping;

				if (keyCode !== KeyCode.Unknown) {
					this._keyCodeExists[keyCode] = true;
					if (value.length === 0) {
						this._keyCodeToLabel[keyCode] = null;
					} else if (value.length === 1) {
						const charCode = value.charCodeAt(0);
						if (charCode >= CharCode.a && charCode <= CharCode.z) {
							this._keyCodeToLabel[keyCode] = String.fromCharCode(CharCode.A + (charCode - CharCode.a));
						} else {
							this._keyCodeToLabel[keyCode] = value;
						}
					} else {
						this._keyCodeToLabel[keyCode] = value;
					}
				}
				this._scanCodeToKeyCode[scanCode] = keyCode;
			}
		}
	}

	public dumpDebugInfo(): string {
		let result: string[] = [];

		let immutableSamples = [
			ScanCode.ArrowUp,
			ScanCode.Numpad0
		];

		let cnt = 0;
		result.push(`------------------------------------------------------------------------------------------------------------`);
		for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
			if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== -1) {
				if (immutableSamples.indexOf(scanCode) === -1) {
					continue;
				}
			}

			if (cnt % 6 === 0) {
				result.push(`|       HW Code combination      |  Key  |    KeyCode combination    |          UI label         | WYSIWYG |`);
				result.push(`------------------------------------------------------------------------------------------------------------`);
			}
			cnt++;

			const mapping = this._codeInfo[scanCode];
			const strCode = ScanCodeUtils.toString(scanCode);

			let mods = [0b000, 0b010, 0b101, 0b111];
			for (let modIndex = 0; modIndex < mods.length; modIndex++) {
				const mod = mods[modIndex];
				const ctrlKey = (mod & 0b001) ? true : false;
				const shiftKey = (mod & 0b010) ? true : false;
				const altKey = (mod & 0b100) ? true : false;
				const scanCodeBinding = new ScanCodeBinding(ctrlKey, shiftKey, altKey, false, scanCode);
				const kb = this._resolveSimpleUserBinding(scanCodeBinding);
				const strKeyCode = (kb ? KeyCodeUtils.toString(kb.keyCode) : null);
				const resolvedKb = (kb ? new WindowsNativeResolvedKeybinding(this, kb, null) : null);

				const outScanCode = `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${strCode}`;
				const ariaLabel = (resolvedKb ? resolvedKb.getAriaLabel() : null);
				const outUILabel = (ariaLabel ? ariaLabel.replace(/Control\+/, 'Ctrl+') : null);
				const outKey = WindowsNativeResolvedKeybinding.getProducedChar(scanCodeBinding, mapping);
				const outKb = (strKeyCode ? `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${strKeyCode}` : null);
				const isWYSIWYG = (resolvedKb ? resolvedKb.isWYSIWYG() : false);
				const outWYSIWYG = (isWYSIWYG ? '       ' : '   NO  ');
				result.push(`| ${this._leftPad(outScanCode, 30)} | ${outKey} | ${this._leftPad(outKb, 25)} | ${this._leftPad(outUILabel, 25)} | ${outWYSIWYG} |`);
			}
			result.push(`------------------------------------------------------------------------------------------------------------`);
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

	public getUILabelForKeyCode(keyCode: KeyCode): string {
		return this._getLabelForKeyCode(keyCode);
	}

	public getAriaLabelForKeyCode(keyCode: KeyCode): string {
		return this._getLabelForKeyCode(keyCode);
	}

	private _getLabelForKeyCode(keyCode: KeyCode): string {
		return this._keyCodeToLabel[keyCode] || KeyCodeUtils.toString(KeyCode.Unknown);
	}

	public resolveKeybinding(keybinding: Keybinding): WindowsNativeResolvedKeybinding[] {
		if (keybinding.type === KeybindingType.Chord) {
			const firstPartKeyCode = keybinding.firstPart.keyCode;
			const chordPartKeyCode = keybinding.chordPart.keyCode;
			if (!this._keyCodeExists[firstPartKeyCode] || !this._keyCodeExists[chordPartKeyCode]) {
				return [];
			}
			return [new WindowsNativeResolvedKeybinding(this, keybinding.firstPart, keybinding.chordPart)];
		} else {
			if (!this._keyCodeExists[keybinding.keyCode]) {
				return [];
			}
			return [new WindowsNativeResolvedKeybinding(this, keybinding, null)];
		}
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): WindowsNativeResolvedKeybinding {
		const keybinding = new SimpleKeybinding(keyboardEvent.ctrlKey, keyboardEvent.shiftKey, keyboardEvent.altKey, keyboardEvent.metaKey, keyboardEvent.keyCode);
		return new WindowsNativeResolvedKeybinding(this, keybinding, null);
	}

	private _resolveSimpleUserBinding(binding: SimpleKeybinding | ScanCodeBinding): SimpleKeybinding {
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

	public resolveUserBinding(firstPart: SimpleKeybinding | ScanCodeBinding, chordPart: SimpleKeybinding | ScanCodeBinding): ResolvedKeybinding[] {
		const _firstPart = this._resolveSimpleUserBinding(firstPart);
		const _chordPart = this._resolveSimpleUserBinding(chordPart);
		if (_firstPart && _chordPart) {
			return [new WindowsNativeResolvedKeybinding(this, _firstPart, _chordPart)];
		}
		if (_firstPart) {
			return [new WindowsNativeResolvedKeybinding(this, _firstPart, null)];
		}
		return [];
	}
}


// See https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
// See https://github.com/Microsoft/node-native-keymap/blob/master/deps/chromium/keyboard_codes_win.h
function _getNativeMap() {
	return {
		VK_BACK: KeyCode.Backspace,
		VK_TAB: KeyCode.Tab,
		VK_CLEAR: KeyCode.Unknown, // MISSING
		VK_RETURN: KeyCode.Enter,
		VK_SHIFT: KeyCode.Shift,
		VK_CONTROL: KeyCode.Ctrl,
		VK_MENU: KeyCode.Alt,
		VK_PAUSE: KeyCode.PauseBreak,
		VK_CAPITAL: KeyCode.CapsLock,
		VK_KANA: KeyCode.Unknown, // MISSING
		VK_HANGUL: KeyCode.Unknown, // MISSING
		VK_JUNJA: KeyCode.Unknown, // MISSING
		VK_FINAL: KeyCode.Unknown, // MISSING
		VK_HANJA: KeyCode.Unknown, // MISSING
		VK_KANJI: KeyCode.Unknown, // MISSING
		VK_ESCAPE: KeyCode.Escape,
		VK_CONVERT: KeyCode.Unknown, // MISSING
		VK_NONCONVERT: KeyCode.Unknown, // MISSING
		VK_ACCEPT: KeyCode.Unknown, // MISSING
		VK_MODECHANGE: KeyCode.Unknown, // MISSING
		VK_SPACE: KeyCode.Space,
		VK_PRIOR: KeyCode.PageUp,
		VK_NEXT: KeyCode.PageDown,
		VK_END: KeyCode.End,
		VK_HOME: KeyCode.Home,
		VK_LEFT: KeyCode.LeftArrow,
		VK_UP: KeyCode.UpArrow,
		VK_RIGHT: KeyCode.RightArrow,
		VK_DOWN: KeyCode.DownArrow,
		VK_SELECT: KeyCode.Unknown, // MISSING
		VK_PRINT: KeyCode.Unknown, // MISSING
		VK_EXECUTE: KeyCode.Unknown, // MISSING
		VK_SNAPSHOT: KeyCode.Unknown, // MISSING
		VK_INSERT: KeyCode.Insert,
		VK_DELETE: KeyCode.Delete,
		VK_HELP: KeyCode.Unknown, // MISSING

		VK_0: KeyCode.KEY_0,
		VK_1: KeyCode.KEY_1,
		VK_2: KeyCode.KEY_2,
		VK_3: KeyCode.KEY_3,
		VK_4: KeyCode.KEY_4,
		VK_5: KeyCode.KEY_5,
		VK_6: KeyCode.KEY_6,
		VK_7: KeyCode.KEY_7,
		VK_8: KeyCode.KEY_8,
		VK_9: KeyCode.KEY_9,
		VK_A: KeyCode.KEY_A,
		VK_B: KeyCode.KEY_B,
		VK_C: KeyCode.KEY_C,
		VK_D: KeyCode.KEY_D,
		VK_E: KeyCode.KEY_E,
		VK_F: KeyCode.KEY_F,
		VK_G: KeyCode.KEY_G,
		VK_H: KeyCode.KEY_H,
		VK_I: KeyCode.KEY_I,
		VK_J: KeyCode.KEY_J,
		VK_K: KeyCode.KEY_K,
		VK_L: KeyCode.KEY_L,
		VK_M: KeyCode.KEY_M,
		VK_N: KeyCode.KEY_N,
		VK_O: KeyCode.KEY_O,
		VK_P: KeyCode.KEY_P,
		VK_Q: KeyCode.KEY_Q,
		VK_R: KeyCode.KEY_R,
		VK_S: KeyCode.KEY_S,
		VK_T: KeyCode.KEY_T,
		VK_U: KeyCode.KEY_U,
		VK_V: KeyCode.KEY_V,
		VK_W: KeyCode.KEY_W,
		VK_X: KeyCode.KEY_X,
		VK_Y: KeyCode.KEY_Y,
		VK_Z: KeyCode.KEY_Z,

		VK_LWIN: KeyCode.Meta,
		VK_COMMAND: KeyCode.Meta,
		VK_RWIN: KeyCode.Meta,
		VK_APPS: KeyCode.Unknown, // MISSING
		VK_SLEEP: KeyCode.Unknown, // MISSING
		VK_NUMPAD0: KeyCode.NUMPAD_0,
		VK_NUMPAD1: KeyCode.NUMPAD_1,
		VK_NUMPAD2: KeyCode.NUMPAD_2,
		VK_NUMPAD3: KeyCode.NUMPAD_3,
		VK_NUMPAD4: KeyCode.NUMPAD_4,
		VK_NUMPAD5: KeyCode.NUMPAD_5,
		VK_NUMPAD6: KeyCode.NUMPAD_6,
		VK_NUMPAD7: KeyCode.NUMPAD_7,
		VK_NUMPAD8: KeyCode.NUMPAD_8,
		VK_NUMPAD9: KeyCode.NUMPAD_9,
		VK_MULTIPLY: KeyCode.NUMPAD_MULTIPLY,
		VK_ADD: KeyCode.NUMPAD_ADD,
		VK_SEPARATOR: KeyCode.NUMPAD_SEPARATOR,
		VK_SUBTRACT: KeyCode.NUMPAD_SUBTRACT,
		VK_DECIMAL: KeyCode.NUMPAD_DECIMAL,
		VK_DIVIDE: KeyCode.NUMPAD_DIVIDE,
		VK_F1: KeyCode.F1,
		VK_F2: KeyCode.F2,
		VK_F3: KeyCode.F3,
		VK_F4: KeyCode.F4,
		VK_F5: KeyCode.F5,
		VK_F6: KeyCode.F6,
		VK_F7: KeyCode.F7,
		VK_F8: KeyCode.F8,
		VK_F9: KeyCode.F9,
		VK_F10: KeyCode.F10,
		VK_F11: KeyCode.F11,
		VK_F12: KeyCode.F12,
		VK_F13: KeyCode.F13,
		VK_F14: KeyCode.F14,
		VK_F15: KeyCode.F15,
		VK_F16: KeyCode.F16,
		VK_F17: KeyCode.F17,
		VK_F18: KeyCode.F18,
		VK_F19: KeyCode.F19,
		VK_F20: KeyCode.Unknown, // MISSING
		VK_F21: KeyCode.Unknown, // MISSING
		VK_F22: KeyCode.Unknown, // MISSING
		VK_F23: KeyCode.Unknown, // MISSING
		VK_F24: KeyCode.Unknown, // MISSING
		VK_NUMLOCK: KeyCode.NumLock,
		VK_SCROLL: KeyCode.ScrollLock,
		VK_LSHIFT: KeyCode.Shift,
		VK_RSHIFT: KeyCode.Shift,
		VK_LCONTROL: KeyCode.Ctrl,
		VK_RCONTROL: KeyCode.Ctrl,
		VK_LMENU: KeyCode.Unknown, // MISSING
		VK_RMENU: KeyCode.Unknown, // MISSING
		VK_BROWSER_BACK: KeyCode.Unknown, // MISSING
		VK_BROWSER_FORWARD: KeyCode.Unknown, // MISSING
		VK_BROWSER_REFRESH: KeyCode.Unknown, // MISSING
		VK_BROWSER_STOP: KeyCode.Unknown, // MISSING
		VK_BROWSER_SEARCH: KeyCode.Unknown, // MISSING
		VK_BROWSER_FAVORITES: KeyCode.Unknown, // MISSING
		VK_BROWSER_HOME: KeyCode.Unknown, // MISSING
		VK_VOLUME_MUTE: KeyCode.Unknown, // MISSING
		VK_VOLUME_DOWN: KeyCode.Unknown, // MISSING
		VK_VOLUME_UP: KeyCode.Unknown, // MISSING
		VK_MEDIA_NEXT_TRACK: KeyCode.Unknown, // MISSING
		VK_MEDIA_PREV_TRACK: KeyCode.Unknown, // MISSING
		VK_MEDIA_STOP: KeyCode.Unknown, // MISSING
		VK_MEDIA_PLAY_PAUSE: KeyCode.Unknown, // MISSING
		VK_MEDIA_LAUNCH_MAIL: KeyCode.Unknown, // MISSING
		VK_MEDIA_LAUNCH_MEDIA_SELECT: KeyCode.Unknown, // MISSING
		VK_MEDIA_LAUNCH_APP1: KeyCode.Unknown, // MISSING
		VK_MEDIA_LAUNCH_APP2: KeyCode.Unknown, // MISSING
		VK_OEM_1: KeyCode.US_SEMICOLON,
		VK_OEM_PLUS: KeyCode.US_EQUAL,
		VK_OEM_COMMA: KeyCode.US_COMMA,
		VK_OEM_MINUS: KeyCode.US_MINUS,
		VK_OEM_PERIOD: KeyCode.US_DOT,
		VK_OEM_2: KeyCode.US_SLASH,
		VK_OEM_3: KeyCode.US_BACKTICK,
		VK_OEM_4: KeyCode.US_OPEN_SQUARE_BRACKET,
		VK_OEM_5: KeyCode.US_BACKSLASH,
		VK_OEM_6: KeyCode.US_CLOSE_SQUARE_BRACKET,
		VK_OEM_7: KeyCode.US_QUOTE,
		VK_OEM_8: KeyCode.OEM_8,
		VK_OEM_102: KeyCode.OEM_102,
		VK_PROCESSKEY: KeyCode.Unknown, // MISSING
		VK_PACKET: KeyCode.Unknown, // MISSING
		VK_DBE_SBCSCHAR: KeyCode.Unknown, // MISSING
		VK_DBE_DBCSCHAR: KeyCode.Unknown, // MISSING
		VK_ATTN: KeyCode.Unknown, // MISSING
		VK_CRSEL: KeyCode.Unknown, // MISSING
		VK_EXSEL: KeyCode.Unknown, // MISSING
		VK_EREOF: KeyCode.Unknown, // MISSING
		VK_PLAY: KeyCode.Unknown, // MISSING
		VK_ZOOM: KeyCode.Unknown, // MISSING
		VK_NONAME: KeyCode.Unknown, // MISSING
		VK_PA1: KeyCode.Unknown, // MISSING
		VK_OEM_CLEAR: KeyCode.Unknown, // MISSING
		VK_UNKNOWN: KeyCode.Unknown,
	};
}
