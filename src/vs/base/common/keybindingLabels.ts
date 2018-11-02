/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { OperatingSystem } from 'vs/base/common/platform';

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

	public readonly modifierLabels: ModifierLabels[];

	constructor(mac: ModifierLabels, windows: ModifierLabels, linux: ModifierLabels = windows) {
		this.modifierLabels = [null!]; // index 0 will never me accessed.
		this.modifierLabels[OperatingSystem.Macintosh] = mac;
		this.modifierLabels[OperatingSystem.Windows] = windows;
		this.modifierLabels[OperatingSystem.Linux] = linux;
	}

	public toLabel(firstPartMod: Modifiers | null, firstPartKey: string | null, chordPartMod: Modifiers | null, chordPartKey: string | null, OS: OperatingSystem): string | null {
		if (firstPartMod === null || firstPartKey === null) {
			return null;
		}
		return _asString(firstPartMod, firstPartKey, chordPartMod, chordPartKey, this.modifierLabels[OS]);
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
		ctrlKey: nls.localize({ key: 'ctrlKey', comment: ['This is the short form for the Control key on the keyboard'] }, "Ctrl"),
		shiftKey: nls.localize({ key: 'shiftKey', comment: ['This is the short form for the Shift key on the keyboard'] }, "Shift"),
		altKey: nls.localize({ key: 'altKey', comment: ['This is the short form for the Alt key on the keyboard'] }, "Alt"),
		metaKey: nls.localize({ key: 'windowsKey', comment: ['This is the short form for the Windows key on the keyboard'] }, "Windows"),
		separator: '+',
	},
	{
		ctrlKey: nls.localize({ key: 'ctrlKey', comment: ['This is the short form for the Control key on the keyboard'] }, "Ctrl"),
		shiftKey: nls.localize({ key: 'shiftKey', comment: ['This is the short form for the Shift key on the keyboard'] }, "Shift"),
		altKey: nls.localize({ key: 'altKey', comment: ['This is the short form for the Alt key on the keyboard'] }, "Alt"),
		metaKey: nls.localize({ key: 'superKey', comment: ['This is the short form for the Super key on the keyboard'] }, "Super"),
		separator: '+',
	}
);

/**
 * A label provider that prints modifiers in a suitable format for ARIA.
 */
export const AriaLabelProvider = new ModifierLabelProvider(
	{
		ctrlKey: nls.localize({ key: 'ctrlKey.long', comment: ['This is the long form for the Control key on the keyboard'] }, "Control"),
		shiftKey: nls.localize({ key: 'shiftKey.long', comment: ['This is the long form for the Shift key on the keyboard'] }, "Shift"),
		altKey: nls.localize({ key: 'altKey.long', comment: ['This is the long form for the Alt key on the keyboard'] }, "Alt"),
		metaKey: nls.localize({ key: 'cmdKey.long', comment: ['This is the long form for the Command key on the keyboard'] }, "Command"),
		separator: '+',
	},
	{
		ctrlKey: nls.localize({ key: 'ctrlKey.long', comment: ['This is the long form for the Control key on the keyboard'] }, "Control"),
		shiftKey: nls.localize({ key: 'shiftKey.long', comment: ['This is the long form for the Shift key on the keyboard'] }, "Shift"),
		altKey: nls.localize({ key: 'altKey.long', comment: ['This is the long form for the Alt key on the keyboard'] }, "Alt"),
		metaKey: nls.localize({ key: 'windowsKey.long', comment: ['This is the long form for the Windows key on the keyboard'] }, "Windows"),
		separator: '+',
	},
	{
		ctrlKey: nls.localize({ key: 'ctrlKey.long', comment: ['This is the long form for the Control key on the keyboard'] }, "Control"),
		shiftKey: nls.localize({ key: 'shiftKey.long', comment: ['This is the long form for the Shift key on the keyboard'] }, "Shift"),
		altKey: nls.localize({ key: 'altKey.long', comment: ['This is the long form for the Alt key on the keyboard'] }, "Alt"),
		metaKey: nls.localize({ key: 'superKey.long', comment: ['This is the long form for the Super key on the keyboard'] }, "Super"),
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
	if (key === null) {
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

function _asString(firstPartMod: Modifiers, firstPartKey: string, chordPartMod: Modifiers | null, chordPartKey: string | null, labels: ModifierLabels): string {
	let result = _simpleAsString(firstPartMod, firstPartKey, labels);

	if (chordPartMod !== null && chordPartKey !== null) {
		result += ' ';
		result += _simpleAsString(chordPartMod, chordPartKey, labels);
	}

	return result;
}