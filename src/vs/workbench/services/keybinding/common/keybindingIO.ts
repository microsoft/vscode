/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { USER_SETTINGS, Keybinding, SimpleKeybinding, ChordKeybinding } from 'vs/base/common/keyCodes';
import { OperatingSystem } from 'vs/base/common/platform';
import { IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { ScanCodeBinding, ScanCodeUtils } from 'vs/workbench/services/keybinding/common/scanCode';

export interface IUserKeybindingItem {
	firstPart: SimpleKeybinding | ScanCodeBinding;
	chordPart: SimpleKeybinding | ScanCodeBinding;
	command: string;
	commandArgs?: any;
	when: ContextKeyExpr;
}

export class KeybindingIO {

	public static writeKeybindingItem(out: OutputBuilder, item: ResolvedKeybindingItem, OS: OperatingSystem): void {
		let quotedSerializedKeybinding = JSON.stringify(item.resolvedKeybinding.getUserSettingsLabel());
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

	public static readUserKeybindingItem(input: IUserFriendlyKeybinding, OS: OperatingSystem): IUserKeybindingItem {
		const [firstPart, chordPart] = (typeof input.key === 'string' ? this._readUserBinding(input.key) : [null, null]);
		const when = (typeof input.when === 'string' ? ContextKeyExpr.deserialize(input.when) : null);
		const command = (typeof input.command === 'string' ? input.command : null);
		const commandArgs = (typeof input.args !== 'undefined' ? input.args : null);
		return {
			firstPart: firstPart,
			chordPart: chordPart,
			command: command,
			commandArgs: commandArgs,
			when: when
		};
	}

	private static _readModifiers(input: string) {
		input = input.toLowerCase().trim();

		let ctrl = false;
		let shift = false;
		let alt = false;
		let meta = false;

		let matchedModifier: boolean;

		do {
			matchedModifier = false;
			if (/^ctrl(\+|\-)/.test(input)) {
				ctrl = true;
				input = input.substr('ctrl-'.length);
				matchedModifier = true;
			}
			if (/^shift(\+|\-)/.test(input)) {
				shift = true;
				input = input.substr('shift-'.length);
				matchedModifier = true;
			}
			if (/^alt(\+|\-)/.test(input)) {
				alt = true;
				input = input.substr('alt-'.length);
				matchedModifier = true;
			}
			if (/^meta(\+|\-)/.test(input)) {
				meta = true;
				input = input.substr('meta-'.length);
				matchedModifier = true;
			}
			if (/^win(\+|\-)/.test(input)) {
				meta = true;
				input = input.substr('win-'.length);
				matchedModifier = true;
			}
			if (/^cmd(\+|\-)/.test(input)) {
				meta = true;
				input = input.substr('cmd-'.length);
				matchedModifier = true;
			}
		} while (matchedModifier);

		let key: string;

		const firstSpaceIdx = input.indexOf(' ');
		if (firstSpaceIdx > 0) {
			key = input.substring(0, firstSpaceIdx);
			input = input.substring(firstSpaceIdx);
		} else {
			key = input;
			input = '';
		}

		return {
			remains: input,
			ctrl,
			shift,
			alt,
			meta,
			key
		};
	}

	private static _readSimpleKeybinding(input: string): [SimpleKeybinding, string] {
		const mods = this._readModifiers(input);
		const keyCode = USER_SETTINGS.toKeyCode(mods.key);
		return [new SimpleKeybinding(mods.ctrl, mods.shift, mods.alt, mods.meta, keyCode), mods.remains];
	}

	public static readKeybinding(input: string, OS: OperatingSystem): Keybinding {
		if (!input) {
			return null;
		}

		let [firstPart, remains] = this._readSimpleKeybinding(input);
		let chordPart: SimpleKeybinding = null;
		if (remains.length > 0) {
			[chordPart] = this._readSimpleKeybinding(remains);
		}

		if (chordPart) {
			return new ChordKeybinding(firstPart, chordPart);
		}
		return firstPart;
	}

	private static _readSimpleUserBinding(input: string): [SimpleKeybinding | ScanCodeBinding, string] {
		const mods = this._readModifiers(input);
		const scanCodeMatch = mods.key.match(/^\[([^\]]+)\]$/);
		if (scanCodeMatch) {
			const strScanCode = scanCodeMatch[1];
			const scanCode = ScanCodeUtils.lowerCaseToEnum(strScanCode);
			return [new ScanCodeBinding(mods.ctrl, mods.shift, mods.alt, mods.meta, scanCode), mods.remains];
		}
		const keyCode = USER_SETTINGS.toKeyCode(mods.key);
		return [new SimpleKeybinding(mods.ctrl, mods.shift, mods.alt, mods.meta, keyCode), mods.remains];
	}

	static _readUserBinding(input: string): [SimpleKeybinding | ScanCodeBinding, SimpleKeybinding | ScanCodeBinding] {
		if (!input) {
			return [null, null];
		}

		let [firstPart, remains] = this._readSimpleUserBinding(input);
		let chordPart: SimpleKeybinding | ScanCodeBinding = null;
		if (remains.length > 0) {
			[chordPart] = this._readSimpleUserBinding(remains);
		}
		return [firstPart, chordPart];
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
