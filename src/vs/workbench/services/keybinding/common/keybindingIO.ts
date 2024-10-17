/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingParser } from '../../../../base/common/keybindingParser.js';
import { Keybinding } from '../../../../base/common/keybindings.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';

export interface IUserKeybindingItem {
	keybinding: Keybinding | null;
	command: string | null;
	commandArgs?: any;
	when: ContextKeyExpression | undefined;
	_sourceKey: string | undefined; /** captures `key` field from `keybindings.json`; `this.keybinding !== null` implies `_sourceKey !== null` */
}

export class KeybindingIO {

	public static writeKeybindingItem(out: OutputBuilder, item: ResolvedKeybindingItem): void {
		if (!item.resolvedKeybinding) {
			return;
		}
		const quotedSerializedKeybinding = JSON.stringify(item.resolvedKeybinding.getUserSettingsLabel());
		out.write(`{ "key": ${rightPaddedString(quotedSerializedKeybinding + ',', 25)} "command": `);

		const quotedSerializedWhen = item.when ? JSON.stringify(item.when.serialize()) : '';
		const quotedSerializeCommand = JSON.stringify(item.command);
		if (quotedSerializedWhen.length > 0) {
			out.write(`${quotedSerializeCommand},`);
			out.writeLine();
			out.write(`                                     "when": ${quotedSerializedWhen}`);
		} else {
			out.write(`${quotedSerializeCommand}`);
		}
		if (item.commandArgs) {
			out.write(',');
			out.writeLine();
			out.write(`                                     "args": ${JSON.stringify(item.commandArgs)}`);
		}
		out.write(' }');
	}

	public static readUserKeybindingItem(input: Object): IUserKeybindingItem {
		const keybinding = 'key' in input && typeof input.key === 'string'
			? KeybindingParser.parseKeybinding(input.key)
			: null;
		const when = 'when' in input && typeof input.when === 'string'
			? ContextKeyExpr.deserialize(input.when)
			: undefined;
		const command = 'command' in input && typeof input.command === 'string'
			? input.command
			: null;
		const commandArgs = 'args' in input && typeof input.args !== 'undefined'
			? input.args
			: undefined;
		return {
			keybinding,
			command,
			commandArgs,
			when,
			_sourceKey: 'key' in input && typeof input.key === 'string' ? input.key : undefined,
		};
	}
}

function rightPaddedString(str: string, minChars: number): string {
	if (str.length < minChars) {
		return str + (new Array(minChars - str.length).join(' '));
	}
	return str;
}

export class OutputBuilder {

	private _lines: string[] = [];
	private _currentLine: string = '';

	write(str: string): void {
		this._currentLine += str;
	}

	writeLine(str: string = ''): void {
		this._lines.push(this._currentLine + str);
		this._currentLine = '';
	}

	toString(): string {
		this.writeLine();
		return this._lines.join('\n');
	}
}
