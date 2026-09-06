/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../base/common/charCode.js';
import { ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { ContextKeyExpression } from '../../contextkey/common/contextkey.js';

export class ResolvedKeybindingItem {
	_resolvedKeybindingItemBrand: void = undefined;

	public readonly resolvedKeybinding: ResolvedKeybinding | undefined;
	public readonly chords: string[];
	public readonly bubble: boolean;
	public readonly command: string | null;
	public readonly commandArgs: any;
	public readonly when: ContextKeyExpression | undefined;
	public readonly isDefault: boolean;
	public readonly extensionId: string | null;
	public readonly isBuiltinExtension: boolean;
	/**
	 * Whether this keybinding was declared as a system-wide (OS global) shortcut via
	 * `keybindings.json`. Only ever `true` for user keybindings; defaults/extension keybindings
	 * are always `false`.
	 */
	public readonly systemWide: boolean;

	constructor(resolvedKeybinding: ResolvedKeybinding | undefined, command: string | null, commandArgs: any, when: ContextKeyExpression | undefined, isDefault: boolean, extensionId: string | null, isBuiltinExtension: boolean, systemWide: boolean = false) {
		this.resolvedKeybinding = resolvedKeybinding;
		this.chords = resolvedKeybinding ? toEmptyArrayIfContainsNull(resolvedKeybinding.getDispatchChords()) : [];
		if (resolvedKeybinding && this.chords.length === 0) {
			// handle possible single modifier chord keybindings
			this.chords = toEmptyArrayIfContainsNull(resolvedKeybinding.getSingleModifierDispatchChords());
		}
		this.bubble = (command ? command.charCodeAt(0) === CharCode.Caret : false);
		this.command = this.bubble ? command!.substr(1) : command;
		this.commandArgs = commandArgs;
		this.when = when;
		this.isDefault = isDefault;
		this.extensionId = extensionId;
		this.isBuiltinExtension = isBuiltinExtension;
		this.systemWide = systemWide;
	}
}

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
