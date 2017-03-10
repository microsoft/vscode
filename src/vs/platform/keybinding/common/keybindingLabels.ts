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
		let result = _asString(keybinding, UserSettingsKeyLabelProvider.INSTANCE, Platform);
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
		return _asString(keybinding, (Platform.isMacintosh ? MacUIKeyLabelProvider.INSTANCE : ClassicUIKeyLabelProvider.INSTANCE), Platform);
	}

	/**
	 * Format the binding to a format appropiate for placing in an aria-label.
	 * @internal
	 */
	public static _toUSAriaLabel(keybinding: Keybinding, Platform: ISimplifiedPlatform = defaultPlatform): string {
		return _asString(keybinding, AriaKeyLabelProvider.INSTANCE, Platform);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 * @internal
	 */
	public static _toUSHTMLLabel(keybinding: Keybinding, Platform: ISimplifiedPlatform = defaultPlatform): IHTMLContentElement[] {
		return _asHTML(keybinding, (Platform.isMacintosh ? MacUIKeyLabelProvider.INSTANCE : ClassicUIKeyLabelProvider.INSTANCE), Platform);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 * @internal
	 */
	public static toCustomLabel(keybinding: Keybinding, labelProvider: IKeyBindingLabelProvider, Platform: ISimplifiedPlatform = defaultPlatform): string {
		return _asString(keybinding, labelProvider, Platform);
	}

	/**
	 * Format the binding to a format appropiate for rendering in the UI
	 * @internal
	 */
	public static toCustomHTMLLabel(keybinding: Keybinding, labelProvider: IKeyBindingLabelProvider, Platform: ISimplifiedPlatform = defaultPlatform): IHTMLContentElement[] {
		return _asHTML(keybinding, labelProvider, Platform);
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
		return _asString(keybinding, ElectronAcceleratorLabelProvider.INSTANCE, Platform);
	}
}

export interface IKeyBindingLabelProvider {
	ctrlKeyLabel: string;
	shiftKeyLabel: string;
	altKeyLabel: string;
	cmdKeyLabel: string;
	windowsKeyLabel: string;
	modifierSeparator: string;
	getLabelForKey(keyCode: KeyCode): string;
}

/**
 * Print for Electron
 */
export class ElectronAcceleratorLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new ElectronAcceleratorLabelProvider();

	public ctrlKeyLabel = 'Ctrl';
	public shiftKeyLabel = 'Shift';
	public altKeyLabel = 'Alt';
	public cmdKeyLabel = 'Cmd';
	public windowsKeyLabel = 'Super';
	public modifierSeparator = '+';

	public getLabelForKey(keyCode: KeyCode): string {
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
}

/**
 * Print for Mac UI
 */
export class MacUIKeyLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new MacUIKeyLabelProvider();

	private static leftArrowUnicodeLabel = String.fromCharCode(8592);
	private static upArrowUnicodeLabel = String.fromCharCode(8593);
	private static rightArrowUnicodeLabel = String.fromCharCode(8594);
	private static downArrowUnicodeLabel = String.fromCharCode(8595);

	public ctrlKeyLabel = '\u2303';
	public shiftKeyLabel = '\u21E7';
	public altKeyLabel = '\u2325';
	public cmdKeyLabel = '\u2318';
	public windowsKeyLabel = nls.localize('windowsKey', "Windows");
	public modifierSeparator = '';

	public getLabelForKey(keyCode: KeyCode): string {
		switch (keyCode) {
			case KeyCode.LeftArrow:
				return MacUIKeyLabelProvider.leftArrowUnicodeLabel;
			case KeyCode.UpArrow:
				return MacUIKeyLabelProvider.upArrowUnicodeLabel;
			case KeyCode.RightArrow:
				return MacUIKeyLabelProvider.rightArrowUnicodeLabel;
			case KeyCode.DownArrow:
				return MacUIKeyLabelProvider.downArrowUnicodeLabel;
		}

		return KeyCodeUtils.toString(keyCode);
	}
}

/**
 * Aria label provider for Mac.
 */
export class AriaKeyLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new MacUIKeyLabelProvider();

	public ctrlKeyLabel = nls.localize('ctrlKey.long', "Control");
	public shiftKeyLabel = nls.localize('shiftKey.long', "Shift");
	public altKeyLabel = nls.localize('altKey.long', "Alt");
	public cmdKeyLabel = nls.localize('cmdKey.long', "Command");
	public windowsKeyLabel = nls.localize('windowsKey.long', "Windows");
	public modifierSeparator = '+';

	public getLabelForKey(keyCode: KeyCode): string {
		return KeyCodeUtils.toString(keyCode);
	}
}

/**
 * Print for Windows, Linux UI
 */
export class ClassicUIKeyLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new ClassicUIKeyLabelProvider();

	public ctrlKeyLabel = nls.localize('ctrlKey', "Ctrl");
	public shiftKeyLabel = nls.localize('shiftKey', "Shift");
	public altKeyLabel = nls.localize('altKey', "Alt");
	public cmdKeyLabel = nls.localize('cmdKey', "Command");
	public windowsKeyLabel = nls.localize('windowsKey', "Windows");
	public modifierSeparator = '+';

	public getLabelForKey(keyCode: KeyCode): string {
		return KeyCodeUtils.toString(keyCode);
	}
}

/**
 * Print for the user settings file.
 */
class UserSettingsKeyLabelProvider implements IKeyBindingLabelProvider {
	public static INSTANCE = new UserSettingsKeyLabelProvider();

	public ctrlKeyLabel = 'Ctrl';
	public shiftKeyLabel = 'Shift';
	public altKeyLabel = 'Alt';
	public cmdKeyLabel = 'Meta';
	public windowsKeyLabel = 'Meta';

	public modifierSeparator = '+';

	public getLabelForKey(keyCode: KeyCode): string {
		return USER_SETTINGS.fromKeyCode(keyCode);
	}
}

function _simpleAsString(keybinding: SimpleKeybinding, labelProvider: IKeyBindingLabelProvider, Platform: ISimplifiedPlatform): string {
	let result: string[] = [];
	let ctrlCmd = keybinding.hasCtrlCmd();
	let shift = keybinding.hasShift();
	let alt = keybinding.hasAlt();
	let winCtrl = keybinding.hasWinCtrl();
	let keyCode = keybinding.getKeyCode();

	let keyLabel = labelProvider.getLabelForKey(keyCode);
	if (!keyLabel) {
		// cannot trigger this key code under this kb layout
		return '';
	}

	// translate modifier keys: Ctrl-Shift-Alt-Meta
	if ((ctrlCmd && !Platform.isMacintosh) || (winCtrl && Platform.isMacintosh)) {
		result.push(labelProvider.ctrlKeyLabel);
	}

	if (shift) {
		result.push(labelProvider.shiftKeyLabel);
	}

	if (alt) {
		result.push(labelProvider.altKeyLabel);
	}

	if (ctrlCmd && Platform.isMacintosh) {
		result.push(labelProvider.cmdKeyLabel);
	}

	if (winCtrl && !Platform.isMacintosh) {
		result.push(labelProvider.windowsKeyLabel);
	}

	// the actual key
	result.push(keyLabel);

	return result.join(labelProvider.modifierSeparator);
}

function _asString(keybinding: Keybinding, labelProvider: IKeyBindingLabelProvider, Platform: ISimplifiedPlatform): string {
	if (keybinding.isChord()) {
		let firstPart = _simpleAsString(keybinding.extractFirstPart(), labelProvider, Platform);
		let secondPart = _simpleAsString(keybinding.extractChordPart(), labelProvider, Platform);
		return firstPart + ' ' + secondPart;
	} else {
		return _simpleAsString(keybinding, labelProvider, Platform);
	}
}

function _pushKey(result: IHTMLContentElement[], str: string): void {
	if (result.length > 0) {
		result.push({
			tagName: 'span',
			text: '+'
		});
	}
	result.push({
		tagName: 'span',
		className: 'monaco-kbkey',
		text: str
	});
}

function _simpleAsHTML(keybinding: SimpleKeybinding, labelProvider: IKeyBindingLabelProvider, Platform: ISimplifiedPlatform, isChord: boolean = false): IHTMLContentElement[] {
	let result: IHTMLContentElement[] = [];
	let ctrlCmd = keybinding.hasCtrlCmd();
	let shift = keybinding.hasShift();
	let alt = keybinding.hasAlt();
	let winCtrl = keybinding.hasWinCtrl();
	let keyCode = keybinding.getKeyCode();

	let keyLabel = labelProvider.getLabelForKey(keyCode);
	if (!keyLabel) {
		// cannot trigger this key code under this kb layout
		return [];
	}

	// translate modifier keys: Ctrl-Shift-Alt-Meta
	if ((ctrlCmd && !Platform.isMacintosh) || (winCtrl && Platform.isMacintosh)) {
		_pushKey(result, labelProvider.ctrlKeyLabel);
	}

	if (shift) {
		_pushKey(result, labelProvider.shiftKeyLabel);
	}

	if (alt) {
		_pushKey(result, labelProvider.altKeyLabel);
	}

	if (ctrlCmd && Platform.isMacintosh) {
		_pushKey(result, labelProvider.cmdKeyLabel);
	}

	if (winCtrl && !Platform.isMacintosh) {
		_pushKey(result, labelProvider.windowsKeyLabel);
	}

	// the actual key
	_pushKey(result, keyLabel);

	return result;
}

function _asHTML(keybinding: Keybinding, labelProvider: IKeyBindingLabelProvider, Platform: ISimplifiedPlatform): IHTMLContentElement[] {
	let result: IHTMLContentElement[] = [];
	if (keybinding.isChord()) {
		result = result.concat(_simpleAsHTML(keybinding.extractFirstPart(), labelProvider, Platform));
		result.push({
			tagName: 'span',
			text: ' '
		});
		result = result.concat(_simpleAsHTML(keybinding.extractChordPart(), labelProvider, Platform));
	} else {
		result = result.concat(_simpleAsHTML(keybinding, labelProvider, Platform));
	}

	return [{
		tagName: 'span',
		className: 'monaco-kb',
		children: result
	}];
}
