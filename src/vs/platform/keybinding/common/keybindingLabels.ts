/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { OperatingSystem } from 'vs/base/common/platform';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';

export interface ModifierLabels {
	readonly ctrlKey: string;
	readonly shiftKey: string;
	readonly altKey: string;
	readonly metaKey: string;
	readonly separator: string;
}

export interface Modifiers {
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
}

export class ModifierLabelProvider {

	private readonly _labels: ModifierLabels[];

	constructor(mac: ModifierLabels, windows: ModifierLabels, linux: ModifierLabels = windows) {
		this._labels = [null];
		this._labels[OperatingSystem.Macintosh] = mac;
		this._labels[OperatingSystem.Windows] = windows;
		this._labels[OperatingSystem.Linux] = linux;
	}

	public toLabel(firstPartMod: Modifiers, firstPartKey: string, chordPartMod: Modifiers, chordPartKey: string, OS: OperatingSystem): string {
		if (!firstPartKey && !chordPartKey) {
			return null;
		}
		return _asString(firstPartMod, firstPartKey, chordPartMod, chordPartKey, this._labels[OS]);
	}

	public toHTMLLabel(firstPartMod: Modifiers, firstPartKey: string, chordPartMod: Modifiers, chordPartKey: string, OS: OperatingSystem): IHTMLContentElement[] {
		if (!firstPartKey && !chordPartKey) {
			return null;
		}
		return _asHTML(firstPartMod, firstPartKey, chordPartMod, chordPartKey, this._labels[OS]);
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
		ctrlKey: 'ctrl',
		shiftKey: 'shift',
		altKey: 'alt',
		metaKey: 'cmd',
		separator: '+',
	},
	{
		ctrlKey: 'ctrl',
		shiftKey: 'shift',
		altKey: 'alt',
		metaKey: 'win',
		separator: '+',
	},
	{
		ctrlKey: 'ctrl',
		shiftKey: 'shift',
		altKey: 'alt',
		metaKey: 'meta',
		separator: '+',
	}
);

function _simpleAsString(modifiers: Modifiers, key: string, labels: ModifierLabels): string {
	if (!key) {
		return '';
	}

	let result: string[] = [];

	// translate modifier keys: Ctrl-Shift-Alt-Meta
	if (modifiers.ctrlKey) {
		result.push(labels.ctrlKey);
	}

	if (modifiers.shiftKey) {
		result.push(labels.shiftKey);
	}

	if (modifiers.altKey) {
		result.push(labels.altKey);
	}

	if (modifiers.metaKey) {
		result.push(labels.metaKey);
	}

	// the actual key
	result.push(key);

	return result.join(labels.separator);
}

function _asString(firstPartMod: Modifiers, firstPartKey: string, chordPartMod: Modifiers, chordPartKey: string, labels: ModifierLabels): string {
	let result = _simpleAsString(firstPartMod, firstPartKey, labels);

	if (chordPartKey) {
		result += ' ';
		result += _simpleAsString(chordPartMod, chordPartKey, labels);
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

function _simpleAsHTML(result: IHTMLContentElement[], modifiers: Modifiers, key: string, labels: ModifierLabels): void {
	if (!key) {
		return;
	}

	// translate modifier keys: Ctrl-Shift-Alt-Meta
	if (modifiers.ctrlKey) {
		_pushKey(result, labels.ctrlKey, labels.separator);
	}

	if (modifiers.shiftKey) {
		_pushKey(result, labels.shiftKey, labels.separator);
	}

	if (modifiers.altKey) {
		_pushKey(result, labels.altKey, labels.separator);
	}

	if (modifiers.metaKey) {
		_pushKey(result, labels.metaKey, labels.separator);
	}

	// the actual key
	_pushKey(result, key, null);
}

function _asHTML(firstPartMod: Modifiers, firstPartKey: string, chordPartMod: Modifiers, chordPartKey: string, labels: ModifierLabels): IHTMLContentElement[] {
	let result: IHTMLContentElement[] = [];
	_simpleAsHTML(result, firstPartMod, firstPartKey, labels);

	if (chordPartKey) {
		result.push({
			tagName: 'span',
			text: ' '
		});
		_simpleAsHTML(result, chordPartMod, chordPartKey, labels);
	}

	return [{
		tagName: 'span',
		className: 'monaco-kb',
		children: result
	}];
}
