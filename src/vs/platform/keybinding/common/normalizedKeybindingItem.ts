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
		return new NormalizedKeybindingItem(keybinding, source.command, source.commandArgs, when, isDefault);
	}

	constructor(keybinding: Keybinding, command: string, commandArgs: any, when: ContextKeyExpr, isDefault: boolean) {
		this.keybinding = keybinding;

		if (keybinding === null) {
			this.keypressFirstPart = null;
			this.keypressChordPart = null;
		} else if (keybinding.isChord()) {
			this.keypressFirstPart = keybinding.extractFirstPart().value.toString();
			this.keypressChordPart = keybinding.extractChordPart().value.toString();
		} else {
			this.keypressFirstPart = keybinding.value.toString();
			this.keypressChordPart = null;
		}

		this.bubble = (command ? command.charCodeAt(0) === CharCode.Caret : false);
		this.command = this.bubble ? command.substr(1) : command;
		this.commandArgs = commandArgs;
		this.when = when;
		this.isDefault = isDefault;
	}
}
