/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export class ResolvedKeybindingItem {
	_resolvedKeybindingItemBrand: void;

	public readonly resolvedKeybinding: ResolvedKeybinding | null;
	public readonly keypressFirstPart: string | null;
	public readonly keypressChordPart: string | null;
	public readonly bubble: boolean;
	public readonly command: string | null;
	public readonly commandArgs: any;
	public readonly when: ContextKeyExpr | null;
	public readonly isDefault: boolean;

	constructor(resolvedKeybinding: ResolvedKeybinding | null, command: string | null, commandArgs: any, when: ContextKeyExpr | null, isDefault: boolean) {
		this.resolvedKeybinding = resolvedKeybinding;
		if (resolvedKeybinding) {
			let [keypressFirstPart, keypressChordPart] = resolvedKeybinding.getDispatchParts();
			this.keypressFirstPart = keypressFirstPart;
			this.keypressChordPart = keypressChordPart;
		} else {
			this.keypressFirstPart = null;
			this.keypressChordPart = null;
		}
		this.bubble = (command ? command.charCodeAt(0) === CharCode.Caret : false);
		this.command = this.bubble ? command!.substr(1) : command;
		this.commandArgs = commandArgs;
		this.when = when;
		this.isDefault = isDefault;
	}
}
