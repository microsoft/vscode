/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createKeybinding, Keybinding } from 'vs/base/common/keyCodes';
import { IKeybindingItem } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CharCode } from 'vs/base/common/charCode';

export class NormalizedKeybindingItem {
	_normalizedKeybindingItemBrand: void;

	public readonly keybinding: Keybinding;
	public readonly keypressFirstPart: string;
	public readonly keypressChordPart: string;
	public readonly bubble: boolean;
	public readonly command: string;
	public readonly commandArgs: any;
	public readonly when: ContextKeyExpr;
	public readonly isDefault: boolean;

	public static fromKeybindingItem(source: IKeybindingItem, isDefault: boolean): NormalizedKeybindingItem {
		let when: ContextKeyExpr = null;
		if (source.when) {
			when = source.when.normalize();
		}
		let keybinding: Keybinding = null;
		if (source.keybinding !== 0) {
			keybinding = createKeybinding(source.keybinding);
		}

		let keypressFirstPart: string;
		let keypressChordPart: string;
		if (keybinding === null) {
			keypressFirstPart = null;
			keypressChordPart = null;
		} else if (keybinding.isChord()) {
			keypressFirstPart = keybinding.extractFirstPart().value.toString();
			keypressChordPart = keybinding.extractChordPart().value.toString();
		} else {
			keypressFirstPart = keybinding.value.toString();
			keypressChordPart = null;
		}
		return new NormalizedKeybindingItem(keybinding, keypressFirstPart, keypressChordPart, source.command, source.commandArgs, when, isDefault);
	}

	constructor(keybinding: Keybinding, keypressFirstPart: string, keypressChordPart: string, command: string, commandArgs: any, when: ContextKeyExpr, isDefault: boolean) {
		this.keybinding = keybinding;
		this.keypressFirstPart = keypressFirstPart;
		this.keypressChordPart = keypressChordPart;
		this.bubble = (command ? command.charCodeAt(0) === CharCode.Caret : false);
		this.command = this.bubble ? command.substr(1) : command;
		this.commandArgs = commandArgs;
		this.when = when;
		this.isDefault = isDefault;
	}
}
