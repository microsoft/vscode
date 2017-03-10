/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Keybinding, KeyMod, KeyChord, USER_SETTINGS } from 'vs/base/common/keyCodes';
import { ISimplifiedPlatform, KeybindingLabels } from 'vs/platform/keybinding/common/keybindingLabels';
import * as platform from 'vs/base/common/platform';
import { IKeybindingItem, IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { NormalizedKeybindingItem } from 'vs/platform/keybinding/common/normalizedKeybindingItem';

export class KeybindingIO {

	public static writeKeybindingItem(out: OutputBuilder, item: NormalizedKeybindingItem): void {
		let quotedSerializedKeybinding = JSON.stringify(KeybindingIO.writeKeybinding(item.keybinding));
		out.write(`{ "key": ${rightPaddedString(quotedSerializedKeybinding + ',', 25)} "command": `);

		let serializedWhen = item.when ? item.when.serialize() : '';
		let quotedSerializeCommand = JSON.stringify(item.command);
		if (serializedWhen.length > 0) {
			out.write(`${quotedSerializeCommand},`);
			out.writeLine();
			out.write(`                                     "when": "${serializedWhen}" `);
		} else {
			out.write(`${quotedSerializeCommand} `);
		}
		// out.write(String(item.weight1 + '-' + item.weight2));
		out.write('}');
	}

	public static readKeybindingItem(input: IUserFriendlyKeybinding, index: number): IKeybindingItem {
		let key: number = 0;
		if (typeof input.key === 'string') {
			key = KeybindingIO.readKeybinding(input.key);
		}

		let when: ContextKeyExpr = null;
		if (typeof input.when === 'string') {
			when = ContextKeyExpr.deserialize(input.when);
		}

		let command: string = null;
		if (typeof input.command === 'string') {
			command = input.command;
		}

		let commandArgs: any = null;
		if (typeof input.args !== 'undefined') {
			commandArgs = input.args;
		}

		return {
			keybinding: key,
			command: command,
			commandArgs: commandArgs,
			when: when,
			weight1: 1000,
			weight2: index
		};
	}

	public static writeKeybinding(keybinding: Keybinding, Platform: ISimplifiedPlatform = platform): string {
		return KeybindingLabels.toUserSettingsLabel(keybinding, Platform);
	}

	public static readKeybinding(input: string, Platform: ISimplifiedPlatform = platform): number {
		if (!input) {
			return null;
		}
		input = input.toLowerCase().trim();

		let ctrlCmd = false,
			shift = false,
			alt = false,
			winCtrl = false,
			key: string = '';

		while (/^(ctrl|shift|alt|meta|win|cmd)(\+|\-)/.test(input)) {
			if (/^ctrl(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					winCtrl = true;
				} else {
					ctrlCmd = true;
				}
				input = input.substr('ctrl-'.length);
			}
			if (/^shift(\+|\-)/.test(input)) {
				shift = true;
				input = input.substr('shift-'.length);
			}
			if (/^alt(\+|\-)/.test(input)) {
				alt = true;
				input = input.substr('alt-'.length);
			}
			if (/^meta(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					ctrlCmd = true;
				} else {
					winCtrl = true;
				}
				input = input.substr('meta-'.length);
			}
			if (/^win(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					ctrlCmd = true;
				} else {
					winCtrl = true;
				}
				input = input.substr('win-'.length);
			}
			if (/^cmd(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					ctrlCmd = true;
				} else {
					winCtrl = true;
				}
				input = input.substr('cmd-'.length);
			}
		}

		let chord: number = 0;

		let firstSpaceIdx = input.indexOf(' ');
		if (firstSpaceIdx > 0) {
			key = input.substring(0, firstSpaceIdx);
			chord = KeybindingIO.readKeybinding(input.substring(firstSpaceIdx), Platform);
		} else {
			key = input;
		}

		let keyCode = USER_SETTINGS.toKeyCode(key);

		let result = 0;
		if (ctrlCmd) {
			result |= KeyMod.CtrlCmd;
		}
		if (shift) {
			result |= KeyMod.Shift;
		}
		if (alt) {
			result |= KeyMod.Alt;
		}
		if (winCtrl) {
			result |= KeyMod.WinCtrl;
		}
		result |= keyCode;
		return KeyChord(result, chord);
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
