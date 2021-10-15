/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChordKeybinding, Keybinding, KeybindingModifier, KeyCode, KeyCodeUtils, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { OperatingSystem } from 'vs/base/common/platform';
import { IMMUTABLE_CODE_TO_KEY_CODE, ScanCode, ScanCodeBinding } from 'vs/base/common/scanCode';
import { BaseResolvedKeybinding } from 'vs/platform/keybinding/common/baseResolvedKeybinding';
import { removeElementsAfterNulls } from 'vs/platform/keybinding/common/resolvedKeybindingItem';

/**
 * Do not instantiate. Use KeybindingService to get a ResolvedKeybinding seeded with information about the current kb layout.
 */
export class USLayoutResolvedKeybinding extends BaseResolvedKeybinding<SimpleKeybinding> {

	constructor(actual: Keybinding, os: OperatingSystem) {
		super(os, actual.parts);
	}

	private _keyCodeToUILabel(keyCode: KeyCode): string {
		if (this._os === OperatingSystem.Macintosh) {
			switch (keyCode) {
				case KeyCode.LeftArrow:
					return '←';
				case KeyCode.UpArrow:
					return '↑';
				case KeyCode.RightArrow:
					return '→';
				case KeyCode.DownArrow:
					return '↓';
			}
		}
		return KeyCodeUtils.toString(keyCode);
	}

	protected _getLabel(keybinding: SimpleKeybinding): string | null {
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return this._keyCodeToUILabel(keybinding.keyCode);
	}

	protected _getAriaLabel(keybinding: SimpleKeybinding): string | null {
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return KeyCodeUtils.toString(keybinding.keyCode);
	}

	protected _getElectronAccelerator(keybinding: SimpleKeybinding): string | null {
		return KeyCodeUtils.toElectronAccelerator(keybinding.keyCode);
	}

	protected _getUserSettingsLabel(keybinding: SimpleKeybinding): string | null {
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		const result = KeyCodeUtils.toUserSettingsUS(keybinding.keyCode);
		return (result ? result.toLowerCase() : result);
	}

	protected _isWYSIWYG(): boolean {
		return true;
	}

	protected _getDispatchPart(keybinding: SimpleKeybinding): string | null {
		return USLayoutResolvedKeybinding.getDispatchStr(keybinding);
	}

	public static getDispatchStr(keybinding: SimpleKeybinding): string | null {
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

	/**
	 * *NOTE*: Check return value for `KeyCode.Unknown`.
	 */
	private static _scanCodeToKeyCode(scanCode: ScanCode): KeyCode {
		const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
		if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
			return immutableKeyCode;
		}

		switch (scanCode) {
			case ScanCode.KeyA: return KeyCode.KEY_A;
			case ScanCode.KeyB: return KeyCode.KEY_B;
			case ScanCode.KeyC: return KeyCode.KEY_C;
			case ScanCode.KeyD: return KeyCode.KEY_D;
			case ScanCode.KeyE: return KeyCode.KEY_E;
			case ScanCode.KeyF: return KeyCode.KEY_F;
			case ScanCode.KeyG: return KeyCode.KEY_G;
			case ScanCode.KeyH: return KeyCode.KEY_H;
			case ScanCode.KeyI: return KeyCode.KEY_I;
			case ScanCode.KeyJ: return KeyCode.KEY_J;
			case ScanCode.KeyK: return KeyCode.KEY_K;
			case ScanCode.KeyL: return KeyCode.KEY_L;
			case ScanCode.KeyM: return KeyCode.KEY_M;
			case ScanCode.KeyN: return KeyCode.KEY_N;
			case ScanCode.KeyO: return KeyCode.KEY_O;
			case ScanCode.KeyP: return KeyCode.KEY_P;
			case ScanCode.KeyQ: return KeyCode.KEY_Q;
			case ScanCode.KeyR: return KeyCode.KEY_R;
			case ScanCode.KeyS: return KeyCode.KEY_S;
			case ScanCode.KeyT: return KeyCode.KEY_T;
			case ScanCode.KeyU: return KeyCode.KEY_U;
			case ScanCode.KeyV: return KeyCode.KEY_V;
			case ScanCode.KeyW: return KeyCode.KEY_W;
			case ScanCode.KeyX: return KeyCode.KEY_X;
			case ScanCode.KeyY: return KeyCode.KEY_Y;
			case ScanCode.KeyZ: return KeyCode.KEY_Z;
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
			case ScanCode.Minus: return KeyCode.US_MINUS;
			case ScanCode.Equal: return KeyCode.US_EQUAL;
			case ScanCode.BracketLeft: return KeyCode.US_OPEN_SQUARE_BRACKET;
			case ScanCode.BracketRight: return KeyCode.US_CLOSE_SQUARE_BRACKET;
			case ScanCode.Backslash: return KeyCode.US_BACKSLASH;
			case ScanCode.IntlHash: return KeyCode.Unknown; // missing
			case ScanCode.Semicolon: return KeyCode.US_SEMICOLON;
			case ScanCode.Quote: return KeyCode.US_QUOTE;
			case ScanCode.Backquote: return KeyCode.US_BACKTICK;
			case ScanCode.Comma: return KeyCode.US_COMMA;
			case ScanCode.Period: return KeyCode.US_DOT;
			case ScanCode.Slash: return KeyCode.US_SLASH;
			case ScanCode.IntlBackslash: return KeyCode.OEM_102;
		}
		return KeyCode.Unknown;
	}

	private static _resolveSimpleUserBinding(binding: SimpleKeybinding | ScanCodeBinding | null): SimpleKeybinding | null {
		if (!binding) {
			return null;
		}
		if (binding instanceof SimpleKeybinding) {
			return binding;
		}
		const keyCode = this._scanCodeToKeyCode(binding.scanCode);
		if (keyCode === KeyCode.Unknown) {
			return null;
		}
		return new SimpleKeybinding(binding.ctrlKey, binding.shiftKey, binding.altKey, binding.metaKey, keyCode);
	}

	public static resolveUserBinding(input: (SimpleKeybinding | ScanCodeBinding)[], os: OperatingSystem): USLayoutResolvedKeybinding[] {
		const parts: SimpleKeybinding[] = removeElementsAfterNulls(input.map(keybinding => this._resolveSimpleUserBinding(keybinding)));
		if (parts.length > 0) {
			return [new USLayoutResolvedKeybinding(new ChordKeybinding(parts), os)];
		}
		return [];
	}
}
