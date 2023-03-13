/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import { KeyboundCommand, ResolvedKeybinding } from 'vs/base/common/keybindings';
import { ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';

export class ResolvedKeybindingItem {
	_resolvedKeybindingItemBrand: void = undefined;

	public readonly resolvedKeybinding: ResolvedKeybinding | undefined;
	public readonly chords: string[];
	public readonly bubble: boolean = false;
	public readonly commands: KeyboundCommand[];
	public readonly when: ContextKeyExpression | undefined;
	public readonly isDefault: boolean;
	public readonly extensionId: string | null;
	public readonly isBuiltinExtension: boolean;

	constructor(resolvedKeybinding: ResolvedKeybinding | undefined, commands: KeyboundCommand[], when: ContextKeyExpression | undefined, isDefault: boolean, extensionId: string | null, isBuiltinExtension: boolean) {
		this.resolvedKeybinding = resolvedKeybinding;
		this.chords = resolvedKeybinding ? toEmptyArrayIfContainsNull(resolvedKeybinding.getDispatchChords()) : [];
		if (resolvedKeybinding && this.chords.length === 0) {
			// handle possible single modifier chord keybindings
			this.chords = toEmptyArrayIfContainsNull(resolvedKeybinding.getSingleModifierDispatchChords());
		}
		const processedCommands = [...commands]; // we have to copy because we possibly need to mutate the first command in the array
		if (processedCommands.length === 1 && processedCommands[0].command.charCodeAt(0) === CharCode.Caret) { // to preserve old behavior // TODO@ulugbekna: should we remove support for `bubble`?
			this.bubble = true;
			processedCommands[0].command = processedCommands[0].command.substring(1);
		}
		this.commands = processedCommands;
		this.when = when;
		this.isDefault = isDefault;
		this.extensionId = extensionId;
		this.isBuiltinExtension = isBuiltinExtension;
	}
}

// TODO@ulugbekna: do we need to copy actually? could we do a faster copy?
export function toEmptyArrayIfContainsNull<T>(arr: (T | null)[]): T[] {
	const result: T[] = [];
	for (let i = 0, len = arr.length; i < len; i++) {
		const element = arr[i];
		if (!element) {
			return [];
		}
		result.push(element);
	}
	return result;
}
