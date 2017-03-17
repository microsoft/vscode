/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { OperatingSystem } from 'vs/base/common/platform';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { KeyCode, Keybinding, KeybindingType, SimpleKeybinding } from 'vs/base/common/keyCodes';

export interface IKeyCodeLabelProvider {
	(keyCode: KeyCode, OS: OperatingSystem): string;
}

export class PrintableKeypress {

	private static _fromSimpleKeybinding(k: SimpleKeybinding, labelProvider: IKeyCodeLabelProvider, OS: OperatingSystem): PrintableKeypress {
		const keyLabel = labelProvider(k.keyCode, OS) || '';
		return new PrintableKeypress(k.ctrlKey, k.shiftKey, k.altKey, k.metaKey, keyLabel);
	}

	public static fromKeybinding(keybinding: Keybinding, labelProvider: IKeyCodeLabelProvider, OS: OperatingSystem): [PrintableKeypress, PrintableKeypress] {
		if (keybinding.type === KeybindingType.Chord) {
			const firstPart = PrintableKeypress._fromSimpleKeybinding(keybinding.firstPart, labelProvider, OS);
			const chordPart = PrintableKeypress._fromSimpleKeybinding(keybinding.chordPart, labelProvider, OS);
			return [firstPart, chordPart];
		} else {
			const printableKeypress = PrintableKeypress._fromSimpleKeybinding(keybinding, labelProvider, OS);
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

export interface ModifierLabels {
	readonly ctrlKey: string;
	readonly shiftKey: string;
	readonly altKey: string;
	readonly metaKey: string;
	readonly separator: string;
}

export class ModifierLabelProvider {

	private readonly _labels: ModifierLabels[];

	constructor(mac: ModifierLabels, windows: ModifierLabels, linux: ModifierLabels = windows) {
		this._labels = [null];
		this._labels[OperatingSystem.Macintosh] = mac;
		this._labels[OperatingSystem.Windows] = windows;
		this._labels[OperatingSystem.Linux] = linux;
	}

	public toLabel2(firstPart: PrintableKeypress, chordPart: PrintableKeypress, OS: OperatingSystem): string {
		return _asString(firstPart, chordPart, this._labels[OS]);
	}

	public toHTMLLabel2(firstPart: PrintableKeypress, chordPart: PrintableKeypress, OS: OperatingSystem): IHTMLContentElement[] {
		return _asHTML(firstPart, chordPart, this._labels[OS]);
	}
}

/**
 * A label provider that prints modifiers in a suitable format for displaying in the UI.
 */
export const UILabelProvider = new ModifierLabelProvider(
	{
		ctrlKey: '⌃',
		shiftKey: '⇧',
		altKey: '⌥',
		metaKey: '⌘',
		separator: '',
	},
	{
		ctrlKey: nls.localize('ctrlKey', "Ctrl"),
		shiftKey: nls.localize('shiftKey', "Shift"),
		altKey: nls.localize('altKey', "Alt"),
		metaKey: nls.localize('windowsKey', "Windows"),
		separator: '+',
	}
);

/**
 * A label provider that prints modifiers in a suitable format for ARIA.
 */
export const AriaLabelProvider = new ModifierLabelProvider(
	{
		ctrlKey: nls.localize('ctrlKey.long', "Control"),
		shiftKey: nls.localize('shiftKey.long', "Shift"),
		altKey: nls.localize('altKey.long', "Alt"),
		metaKey: nls.localize('cmdKey.long', "Command"),
		separator: '+',
	},
	{
		ctrlKey: nls.localize('ctrlKey.long', "Control"),
		shiftKey: nls.localize('shiftKey.long', "Shift"),
		altKey: nls.localize('altKey.long', "Alt"),
		metaKey: nls.localize('windowsKey.long', "Windows"),
		separator: '+',
	}
);

/**
 * A label provider that prints modifiers in a suitable format for Electron Accelerators.
 * See https://github.com/electron/electron/blob/master/docs/api/accelerator.md
 */
export const ElectronAcceleratorLabelProvider = new ModifierLabelProvider(
	{
		ctrlKey: 'Ctrl',
		shiftKey: 'Shift',
		altKey: 'Alt',
		metaKey: 'Cmd',
		separator: '+',
	},
	{
		ctrlKey: 'Ctrl',
		shiftKey: 'Shift',
		altKey: 'Alt',
		metaKey: 'Super',
		separator: '+',
	}
);

/**
 * A label provider that prints modifiers in a suitable format for user settings.
 */
export const UserSettingsLabelProvider = new ModifierLabelProvider(
	{
		ctrlKey: 'Ctrl',
		shiftKey: 'Shift',
		altKey: 'Alt',
		metaKey: 'Cmd',
		separator: '+',
	},
	{
		ctrlKey: 'Ctrl',
		shiftKey: 'Shift',
		altKey: 'Alt',
		metaKey: 'Win',
		separator: '+',
	},
	{
		ctrlKey: 'Ctrl',
		shiftKey: 'Shift',
		altKey: 'Alt',
		metaKey: 'Meta',
		separator: '+',
	}
);

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
