/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as defaultPlatform from 'vs/base/common/platform';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { Keybinding, SimpleKeybinding, KeyCode, KeyCodeUtils, USER_SETTINGS } from 'vs/base/common/keyCodes';

export interface ISimplifiedPlatform {
	isMacintosh: boolean;
	isWindows: boolean;
}

export class KeybindingLabels {

	private static _cachedKeybindingRegex: string = null;

	/**
	 * @internal
	 */
	public static getUserSettingsKeybindingRegex(): string {
		if (!this._cachedKeybindingRegex) {
			let numpadKey = 'numpad(0|1|2|3|4|5|6|7|8|9|_multiply|_add|_subtract|_decimal|_divide|_separator)';
			let oemKey = '`|\\-|=|\\[|\\]|\\\\\\\\|;|\'|,|\\.|\\/|oem_8|oem_102';
			let specialKey = 'left|up|right|down|pageup|pagedown|end|home|tab|enter|escape|space|backspace|delete|pausebreak|capslock|insert|contextmenu|numlock|scrolllock';
			let casualKey = '[a-z]|[0-9]|f(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19)';
			let key = '((' + [numpadKey, oemKey, specialKey, casualKey].join(')|(') + '))';
			let mod = '((ctrl|shift|alt|cmd|win|meta)\\+)*';
			let keybinding = '(' + mod + key + ')';

			this._cachedKeybindingRegex = '"\\s*(' + keybinding + '(\\s+' + keybinding + ')?' + ')\\s*"';
		}
		return this._cachedKeybindingRegex;
	}

	/**
	 * Format the binding to a format appropiate for the user settings file.
	 * @internal
	 */
	public static toUserSettingsLabel(keybinding: Keybinding, Platform: ISimplifiedPlatform = defaultPlatform): string {
		let result: string;
		if (Platform.isMacintosh) {
			result = MacUserSettingsLabelProvider._toUSLabel(keybinding);
		} else {
			result = ClassicUserSettingsLabelProvider._toUSLabel(keybinding);
		}

		result = result.toLowerCase();

		if (Platform.isMacintosh) {
			result = result.replace(/meta/g, 'cmd');
		} else if (Platform.isWindows) {
			result = result.replace(/meta/g, 'win');
		}

		return result;
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 * @internal
	 */
	public static _toUSLabel(keybinding: Keybinding, Platform: ISimplifiedPlatform = defaultPlatform): string {
		if (Platform.isMacintosh) {
			return MacUILabelProvider._toUSLabel(keybinding);
		}
		return ClassicUILabelProvider._toUSLabel(keybinding);
	}

	/**
	 * Format the binding to a format appropiate for placing in an aria-label.
	 * @internal
	 */
	public static _toUSAriaLabel(keybinding: Keybinding, Platform: ISimplifiedPlatform = defaultPlatform): string {
		if (Platform.isMacintosh) {
			return MacAriaLabelProvider._toUSLabel(keybinding);
		}
		return ClassicAriaLabelProvider._toUSLabel(keybinding);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 * @internal
	 */
	public static _toUSHTMLLabel(keybinding: Keybinding, Platform: ISimplifiedPlatform = defaultPlatform): IHTMLContentElement[] {
		if (Platform.isMacintosh) {
			return MacUILabelProvider._toUSHTMLLabel(keybinding);
		}
		return ClassicUILabelProvider._toUSHTMLLabel(keybinding);
	}

	/**
	 * This prints the binding in a format suitable for electron's accelerators.
	 * See https://github.com/electron/electron/blob/master/docs/api/accelerator.md
	 * @internal
	 */
	public static _toElectronAccelerator(keybinding: Keybinding, Platform: ISimplifiedPlatform = defaultPlatform): string {
		if (keybinding.isChord()) {
			// Electron cannot handle chords
			return null;
		}
		let keyCode = keybinding.getKeyCode();
		if (keyCode >= KeyCode.NUMPAD_0 && keyCode <= KeyCode.NUMPAD_DIVIDE) {
			// Electron cannot handle numpad keys
			return null;
		}
		if (Platform.isMacintosh) {
			return MacElectronAcceleratorLabelProvider._toUSLabel(keybinding);
		}
		return ClassicElectronAcceleratorLabelProvider._toUSLabel(keybinding);
	}
}

export interface IKeyCodeLabelProvider {
	(keyCode: KeyCode): string;
}

export interface ModifierLabels {
	readonly ctrlKey: string;
	readonly shiftKey: string;
	readonly altKey: string;
	readonly metaKey: string;
	readonly separator: string;
}

export class LabelProvider {

	private readonly _isMacintosh: boolean;
	private readonly _modifierLabels: ModifierLabels;
	private readonly _keyCodeLabel: (keyCode: KeyCode) => string;

	constructor(isMacintosh: boolean, modifierLabels: ModifierLabels, keyCodeLabel: (keyCode: KeyCode) => string) {
		this._isMacintosh = isMacintosh;
		this._modifierLabels = modifierLabels;
		this._keyCodeLabel = keyCodeLabel;
	}

	public _toUSLabel(keybinding: Keybinding): string {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(keybinding, this._keyCodeLabel, this._isMacintosh);
		return this.toLabel(firstPart, chordPart);
	}

	public toLabel(firstPart: PrintableKeypress, chordPart: PrintableKeypress): string {
		return _asString(firstPart, chordPart, this._modifierLabels);
	}

	public _toUSHTMLLabel(keybinding: Keybinding): IHTMLContentElement[] {
		const [firstPart, chordPart] = PrintableKeypress.fromKeybinding(keybinding, this._keyCodeLabel, this._isMacintosh);
		return this.toHTMLLabel(firstPart, chordPart);
	}

	public toHTMLLabel(firstPart: PrintableKeypress, chordPart: PrintableKeypress): IHTMLContentElement[] {
		return _asHTML(firstPart, chordPart, this._modifierLabels);
	}
}

export const MacUILabelProvider: LabelProvider = new LabelProvider(
	true,
	{
		ctrlKey: '⌃',
		shiftKey: '⇧',
		altKey: '⌥',
		metaKey: '⌘',
		separator: '',
	},
	(keyCode: KeyCode): string => {
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
		return KeyCodeUtils.toString(keyCode);
	}
);
export const ClassicUILabelProvider: LabelProvider = new LabelProvider(
	false,
	{
		ctrlKey: nls.localize('ctrlKey', "Ctrl"),
		shiftKey: nls.localize('shiftKey', "Shift"),
		altKey: nls.localize('altKey', "Alt"),
		metaKey: nls.localize('windowsKey', "Windows"),
		separator: '+',
	},
	(keyCode: KeyCode) => KeyCodeUtils.toString(keyCode)
);

export const MacAriaLabelProvider: LabelProvider = new LabelProvider(
	true,
	{
		ctrlKey: nls.localize('ctrlKey.long', "Control"),
		shiftKey: nls.localize('shiftKey.long', "Shift"),
		altKey: nls.localize('altKey.long', "Alt"),
		metaKey: nls.localize('cmdKey.long', "Command"),
		separator: '+',
	},
	(keyCode: KeyCode) => KeyCodeUtils.toString(keyCode)
);
export const ClassicAriaLabelProvider: LabelProvider = new LabelProvider(
	false,
	{
		ctrlKey: nls.localize('ctrlKey.long', "Control"),
		shiftKey: nls.localize('shiftKey.long', "Shift"),
		altKey: nls.localize('altKey.long', "Alt"),
		metaKey: nls.localize('windowsKey.long', "Windows"),
		separator: '+',
	},
	(keyCode: KeyCode) => KeyCodeUtils.toString(keyCode)
);

class AcceleratorLabelProvider extends LabelProvider {
	constructor(isMacintosh: boolean, modifierLabels: ModifierLabels) {
		super(
			isMacintosh,
			modifierLabels,
			(keyCode: KeyCode) => {
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
		);
	}
}
const MacElectronAcceleratorLabelProvider = new AcceleratorLabelProvider(
	true,
	{
		ctrlKey: 'Ctrl',
		shiftKey: 'Shift',
		altKey: 'Alt',
		metaKey: 'Cmd',
		separator: '+',
	}
);
const ClassicElectronAcceleratorLabelProvider = new AcceleratorLabelProvider(
	false,
	{
		ctrlKey: 'Ctrl',
		shiftKey: 'Shift',
		altKey: 'Alt',
		metaKey: 'Super',
		separator: '+',
	}
);

class UserSettingsLabelProvider extends LabelProvider {
	constructor(isMacintosh: boolean) {
		super(
			isMacintosh,
			{
				ctrlKey: 'Ctrl',
				shiftKey: 'Shift',
				altKey: 'Alt',
				metaKey: 'Meta',
				separator: '+',
			},
			(keyCode: KeyCode) => USER_SETTINGS.fromKeyCode(keyCode)
		);
	}
}
const MacUserSettingsLabelProvider = new UserSettingsLabelProvider(true);
const ClassicUserSettingsLabelProvider = new UserSettingsLabelProvider(false);

export class PrintableKeypress {

	public static fromSimpleKeybinding(keybinding: SimpleKeybinding, labelProvider: IKeyCodeLabelProvider, isMacintosh: boolean): PrintableKeypress {
		const ctrlCmd = keybinding.hasCtrlCmd();
		const winCtrl = keybinding.hasWinCtrl();

		const ctrlKey = isMacintosh ? winCtrl : ctrlCmd;
		const metaKey = isMacintosh ? ctrlCmd : winCtrl;
		const shiftKey = keybinding.hasShift();
		const altKey = keybinding.hasAlt();

		const keyCode = keybinding.getKeyCode();
		const keyLabel = labelProvider(keyCode) || '';

		return new PrintableKeypress(ctrlKey, shiftKey, altKey, metaKey, keyLabel);
	}

	public static fromKeybinding(keybinding: Keybinding, labelProvider: IKeyCodeLabelProvider, isMacintosh: boolean): [PrintableKeypress, PrintableKeypress] {
		if (keybinding.isChord()) {
			const firstPart = PrintableKeypress.fromSimpleKeybinding(keybinding.extractFirstPart(), labelProvider, isMacintosh);
			const chordPart = PrintableKeypress.fromSimpleKeybinding(keybinding.extractChordPart(), labelProvider, isMacintosh);
			return [firstPart, chordPart];
		} else {
			const printableKeypress = PrintableKeypress.fromSimpleKeybinding(keybinding, labelProvider, isMacintosh);
			return [printableKeypress, null];
		}
	}

	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly key: string;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, key: string) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.key = key;
	}
}

function _simpleAsString(keypress: PrintableKeypress, labels: ModifierLabels): string {
	if (!keypress.key) {
		return '';
	}

	let result: string[] = [];

	// translate modifier keys: Ctrl-Shift-Alt-Meta
	if (keypress.ctrlKey) {
		result.push(labels.ctrlKey);
	}

	if (keypress.shiftKey) {
		result.push(labels.shiftKey);
	}

	if (keypress.altKey) {
		result.push(labels.altKey);
	}

	if (keypress.metaKey) {
		result.push(labels.metaKey);
	}

	// the actual key
	result.push(keypress.key);

	return result.join(labels.separator);
}

function _asString(firstPart: PrintableKeypress, chordPart: PrintableKeypress, labels: ModifierLabels): string {
	let result = _simpleAsString(firstPart, labels);

	if (chordPart !== null) {
		result += ' ';
		result += _simpleAsString(chordPart, labels);
	}

	return result;
}

function _pushKey(result: IHTMLContentElement[], str: string, append: string): void {
	result.push({
		tagName: 'span',
		className: 'monaco-kbkey',
		text: str
	});
	if (append) {
		result.push({
			tagName: 'span',
			text: '+'
		});
	}
}

function _simpleAsHTML(result: IHTMLContentElement[], keypress: PrintableKeypress, labels: ModifierLabels): void {
	if (!keypress.key) {
		return;
	}

	// translate modifier keys: Ctrl-Shift-Alt-Meta
	if (keypress.ctrlKey) {
		_pushKey(result, labels.ctrlKey, labels.separator);
	}

	if (keypress.shiftKey) {
		_pushKey(result, labels.shiftKey, labels.separator);
	}

	if (keypress.altKey) {
		_pushKey(result, labels.altKey, labels.separator);
	}

	if (keypress.metaKey) {
		_pushKey(result, labels.metaKey, labels.separator);
	}

	// the actual key
	_pushKey(result, keypress.key, null);
}

function _asHTML(firstPart: PrintableKeypress, chordPart: PrintableKeypress, labels: ModifierLabels): IHTMLContentElement[] {
	let result: IHTMLContentElement[] = [];
	_simpleAsHTML(result, firstPart, labels);

	if (chordPart !== null) {
		result.push({
			tagName: 'span',
			text: ' '
		});
		_simpleAsHTML(result, chordPart, labels);
	}

	return [{
		tagName: 'span',
		className: 'monaco-kb',
		children: result
	}];
}
