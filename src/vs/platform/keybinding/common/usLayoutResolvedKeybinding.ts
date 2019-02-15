/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyCodeUtils, Keybinding, ResolvedKeybinding, ResolvedKeybindingPart, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { AriaLabelProvider, ElectronAcceleratorLabelProvider, UILabelProvider, UserSettingsLabelProvider } from 'vs/base/common/keybindingLabels';
import { OperatingSystem } from 'vs/base/common/platform';

/**
 * Do not instantiate. Use KeybindingService to get a ResolvedKeybinding seeded with information about the current kb layout.
 */
export class USLayoutResolvedKeybinding extends ResolvedKeybinding {

	private readonly _os: OperatingSystem;
	private readonly _parts: SimpleKeybinding[];

	constructor(actual: Keybinding, OS: OperatingSystem) {
		super();
		this._os = OS;
		if (!actual) {
			throw new Error(`Invalid USLayoutResolvedKeybinding`);
		} else {
			this._parts = actual.parts;
		}
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

	private _getUILabelForKeybinding(keybinding: SimpleKeybinding | null): string | null {
		if (!keybinding) {
			return null;
		}
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return this._keyCodeToUILabel(keybinding.keyCode);
	}

	public getLabel(): string | null {
		return UILabelProvider.toLabel(this._os, this._parts, (keybinding) => this._getUILabelForKeybinding(keybinding));
	}

	private _getAriaLabelForKeybinding(keybinding: SimpleKeybinding | null): string | null {
		if (!keybinding) {
			return null;
		}
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return KeyCodeUtils.toString(keybinding.keyCode);
	}

	public getAriaLabel(): string | null {
		return AriaLabelProvider.toLabel(this._os, this._parts, (keybinding) => this._getAriaLabelForKeybinding(keybinding));
	}

	private _keyCodeToElectronAccelerator(keyCode: KeyCode): string | null {
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

		return KeyCodeUtils.toString(keyCode);
	}

	private _getElectronAcceleratorLabelForKeybinding(keybinding: SimpleKeybinding | null): string | null {
		if (!keybinding) {
			return null;
		}
		if (keybinding.isDuplicateModifierCase()) {
			return null;
		}
		return this._keyCodeToElectronAccelerator(keybinding.keyCode);
	}

	public getElectronAccelerator(): string | null {
		if (this._parts.length > 1) {
			// Electron cannot handle chords
			return null;
		}

		return ElectronAcceleratorLabelProvider.toLabel(this._os, this._parts, (keybinding) => this._getElectronAcceleratorLabelForKeybinding(keybinding));
	}

	private _getUserSettingsLabelForKeybinding(keybinding: SimpleKeybinding | null): string | null {
		if (!keybinding) {
			return null;
		}
		if (keybinding.isDuplicateModifierCase()) {
			return '';
		}
		return KeyCodeUtils.toUserSettingsUS(keybinding.keyCode);
	}

	public getUserSettingsLabel(): string | null {
		const result = UserSettingsLabelProvider.toLabel(this._os, this._parts, (keybinding) => this._getUserSettingsLabelForKeybinding(keybinding));
		return (result ? result.toLowerCase() : result);
	}

	public isWYSIWYG(): boolean {
		return true;
	}

	public isChord(): boolean {
		return (this._parts.length > 1);
	}

	public getParts(): ResolvedKeybindingPart[] {
		return this._parts.map((keybinding) => this._toResolvedKeybindingPart(keybinding));
	}

	private _toResolvedKeybindingPart(keybinding: SimpleKeybinding): ResolvedKeybindingPart {
		return new ResolvedKeybindingPart(
			keybinding.ctrlKey,
			keybinding.shiftKey,
			keybinding.altKey,
			keybinding.metaKey,
			this._getUILabelForKeybinding(keybinding),
			this._getAriaLabelForKeybinding(keybinding)
		);
	}

	public getDispatchParts(): (string | null)[] {
		return this._parts.map((keybinding) => USLayoutResolvedKeybinding.getDispatchStr(keybinding));
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
}
