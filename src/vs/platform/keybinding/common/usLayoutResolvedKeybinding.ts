/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { ResolvedKeybinding, Keybinding, KeyCode, KeyCodeUtils, USER_SETTINGS } from 'vs/base/common/keyCodes';
import { PrintableKeypress, UILabelProvider, AriaLabelProvider, ElectronAcceleratorLabelProvider, UserSettingsLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
import { OperatingSystem } from 'vs/base/common/platform';

/**
 * Do not instantiate. Use KeybindingService to get a ResolvedKeybinding seeded with information about the current kb layout.
 */
export class USLayoutResolvedKeybinding extends ResolvedKeybinding {

	private readonly _actual: Keybinding;
	private readonly _os: OperatingSystem;

	constructor(actual: Keybinding, os: OperatingSystem) {
		super();
		this._actual = actual;
		this._os = os;
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
		if (this._actual.isChord()) {
			// Electron cannot handle chords
			return null;
		}

		let keyCode = this._actual.getKeyCode();
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
		return this._actual.isChord();
	}

	public hasCtrlModifier(): boolean {
		if (this._actual.isChord()) {
			return false;
		}
		if (this._os === OperatingSystem.Macintosh) {
			return this._actual.hasWinCtrl();
		} else {
			return this._actual.hasCtrlCmd();
		}
	}

	public hasShiftModifier(): boolean {
		if (this._actual.isChord()) {
			return false;
		}
		return this._actual.hasShift();
	}

	public hasAltModifier(): boolean {
		if (this._actual.isChord()) {
			return false;
		}
		return this._actual.hasAlt();
	}

	public hasMetaModifier(): boolean {
		if (this._actual.isChord()) {
			return false;
		}
		if (this._os === OperatingSystem.Macintosh) {
			return this._actual.hasCtrlCmd();
		} else {
			return this._actual.hasWinCtrl();
		}
	}

	public getDispatchParts(): [string, string] {
		let keypressFirstPart: string;
		let keypressChordPart: string;
		if (this._actual === null) {
			keypressFirstPart = null;
			keypressChordPart = null;
		} else if (this._actual.isChord()) {
			keypressFirstPart = this._actual.extractFirstPart().value.toString();
			keypressChordPart = this._actual.extractChordPart().value.toString();
		} else {
			keypressFirstPart = this._actual.value.toString();
			keypressChordPart = null;
		}
		return [keypressFirstPart, keypressChordPart];
	}
}
