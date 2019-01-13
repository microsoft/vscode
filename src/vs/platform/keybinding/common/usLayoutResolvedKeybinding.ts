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
		let partKeys: string[] = [];
		for (let part of this._parts) {
			let key = this._getUILabelForKeybinding(part);
			if (key === null) {
				return null;
			}
			partKeys.push(key);
		}
		return UILabelProvider.toLabel(this._parts, partKeys, this._os);
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
		let partKeys: string[] = [];
		for (let part of this._parts) {
			let key = this._getAriaLabelForKeybinding(part);
			if (key === null) {
				return null;
			}
			partKeys.push(key);
		}
		return AriaLabelProvider.toLabel(this._parts, partKeys, this._os);
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

		let firstPart = this._getElectronAcceleratorLabelForKeybinding(this._parts[0]);
		if (firstPart === null) {
			return null;
		}
		return ElectronAcceleratorLabelProvider.toLabel(this._parts, [firstPart], this._os);
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
		let partKeys: string[] = [];
		for (let part of this._parts) {
			let key = this._getUserSettingsLabelForKeybinding(part);
			if (key === null) {
				return null;
			}
			partKeys.push(key);
		}
		let result = UserSettingsLabelProvider.toLabel(this._parts, partKeys, this._os);
		return (result ? result.toLowerCase() : result);
	}

	public isWYSIWYG(): boolean {
		return true;
	}

	public isChord(): boolean {
		return this._parts.length > 1;
	}

	public getParts(): ResolvedKeybindingPart[] {
		return this._parts.map(this._toResolvedKeybindingPart);
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
		return this._parts.map((chord) => USLayoutResolvedKeybinding.getDispatchStr(chord));
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
