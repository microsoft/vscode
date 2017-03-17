/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { ResolvedKeybinding, KeyCode, KeyCodeUtils, USER_SETTINGS, RuntimeKeybinding, RuntimeKeybindingType, SimpleRuntimeKeybinding } from 'vs/base/common/keyCodes';
import { PrintableKeypress, UILabelProvider, AriaLabelProvider, ElectronAcceleratorLabelProvider, UserSettingsLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
import { OperatingSystem } from 'vs/base/common/platform';

/**
 * Do not instantiate. Use KeybindingService to get a ResolvedKeybinding seeded with information about the current kb layout.
 */
export class USLayoutResolvedKeybinding extends ResolvedKeybinding {

	private readonly _actual: RuntimeKeybinding;
	private readonly _os: OperatingSystem;

	constructor(actual: RuntimeKeybinding, OS: OperatingSystem) {
		super();
		this._actual = actual;
		this._os = OS;
	}

	private static _usKeyCodeToUILabel(keyCode: KeyCode, OS: OperatingSystem): string {
		if (OS === OperatingSystem.Macintosh) {
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

	private static _usKeyCodeToAriaLabel(keyCode: KeyCode, OS: OperatingSystem): string {
		return KeyCodeUtils.toString(keyCode);
	}

	public getLabel(): string {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToUILabel, this._os);
		return UILabelProvider.toLabel2(firstPart, chordPart, this._os);
	}

	public getAriaLabel(): string {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToAriaLabel, this._os);
		return AriaLabelProvider.toLabel2(firstPart, chordPart, this._os);
	}

	public getHTMLLabel(): IHTMLContentElement[] {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToUILabel, this._os);
		return UILabelProvider.toHTMLLabel2(firstPart, chordPart, this._os);
	}

	private static _usKeyCodeToElectronAccelerator(keyCode: KeyCode, OS: OperatingSystem): string {
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

	public getElectronAccelerator(): string {
		if (this._actual.type === RuntimeKeybindingType.Chord) {
			// Electron cannot handle chords
			return null;
		}

		let keyCode = this._actual.keyCode;
		if (keyCode >= KeyCode.NUMPAD_0 && keyCode <= KeyCode.NUMPAD_DIVIDE) {
			// Electron cannot handle numpad keys
			return null;
		}

		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToElectronAccelerator, this._os);
		return ElectronAcceleratorLabelProvider.toLabel2(firstPart, chordPart, this._os);
	}

	private static _usKeyCodeToUserSettings(keyCode: KeyCode, OS: OperatingSystem): string {
		return USER_SETTINGS.fromKeyCode(keyCode);
	}

	public getUserSettingsLabel(): string {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(this._actual, USLayoutResolvedKeybinding._usKeyCodeToUserSettings, this._os);

		let result = UserSettingsLabelProvider.toLabel2(firstPart, chordPart, this._os);
		return result.toLowerCase();
	}

	public isChord(): boolean {
		return (this._actual.type === RuntimeKeybindingType.Chord);
	}

	public hasCtrlModifier(): boolean {
		if (this._actual.type === RuntimeKeybindingType.Chord) {
			return false;
		}
		return this._actual.ctrlKey;
	}

	public hasShiftModifier(): boolean {
		if (this._actual.type === RuntimeKeybindingType.Chord) {
			return false;
		}
		return this._actual.shiftKey;
	}

	public hasAltModifier(): boolean {
		if (this._actual.type === RuntimeKeybindingType.Chord) {
			return false;
		}
		return this._actual.altKey;
	}

	public hasMetaModifier(): boolean {
		if (this._actual.type === RuntimeKeybindingType.Chord) {
			return false;
		}
		return this._actual.metaKey;
	}

	public getDispatchParts(): [string, string] {
		let keypressFirstPart: string;
		let keypressChordPart: string;
		if (this._actual === null) {
			keypressFirstPart = null;
			keypressChordPart = null;
		} else if (this._actual.type === RuntimeKeybindingType.Chord) {
			keypressFirstPart = USLayoutResolvedKeybinding.getDispatchStr(this._actual.firstPart);
			keypressChordPart = USLayoutResolvedKeybinding.getDispatchStr(this._actual.chordPart);
		} else {
			keypressFirstPart = USLayoutResolvedKeybinding.getDispatchStr(this._actual);
			keypressChordPart = null;
		}
		return [keypressFirstPart, keypressChordPart];
	}

	public static getDispatchStr(keybinding: SimpleRuntimeKeybinding): string {
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
