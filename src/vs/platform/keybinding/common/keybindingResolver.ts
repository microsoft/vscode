/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Keybinding, BinaryKeybindings } from 'vs/base/common/keyCodes';
import { ISimplifiedPlatform, KeybindingLabels } from 'vs/base/common/keybinding';
import * as platform from 'vs/base/common/platform';
import { IKeybindingItem, IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export interface IResolveResult {
	enterChord: number;
	commandId: string;
	commandArgs: any;
}

export interface IBoundCommands {
	[commandId: string]: boolean;
}

interface ICommandMap {
	[partialKeybinding: number]: ICommandEntry[];
}

interface IChordsMap {
	[partialKeybinding: number]: ICommandMap;
}

interface ICommandEntry {
	when: ContextKeyExpr;
	keybinding: number;
	commandId: string;
	commandArgs: any;
}

export class NormalizedKeybindingItem {
	keybinding: number;
	command: string;
	commandArgs: any;
	when: ContextKeyExpr;
	isDefault: boolean;
	actualCommand: string;

	public static fromKeybindingItem(source: IKeybindingItem, isDefault: boolean): NormalizedKeybindingItem {
		let when: ContextKeyExpr = null;
		if (source.when) {
			when = source.when.normalize();
		}
		return new NormalizedKeybindingItem(source.keybinding, source.command, source.commandArgs, when, isDefault);
	}

	constructor(keybinding: number, command: string, commandArgs: any, when: ContextKeyExpr, isDefault: boolean) {
		this.keybinding = keybinding;
		this.command = command;
		this.commandArgs = commandArgs;
		this.actualCommand = this.command ? this.command.replace(/^\^/, '') : this.command;
		this.when = when;
		this.isDefault = isDefault;
	}
}

export class KeybindingResolver {
	private _defaultKeybindings: IKeybindingItem[];
	private _defaultBoundCommands: IBoundCommands;
	private _map: ICommandMap;
	private _chords: IChordsMap;
	private _lookupMap: Map<string, ArrayBuffer>;
	/**
	 * The value contains the keybinding or first part of a chord
	 */
	private _lookupMapUnreachable: Map<string, ArrayBuffer>;
	private _shouldWarnOnConflict: boolean;

	constructor(defaultKeybindings: IKeybindingItem[], overrides: IKeybindingItem[], shouldWarnOnConflict: boolean = true) {
		defaultKeybindings = defaultKeybindings.slice(0).sort(sorter);

		this._defaultKeybindings = defaultKeybindings;
		this._shouldWarnOnConflict = shouldWarnOnConflict;

		this._defaultBoundCommands = Object.create(null);
		for (let i = 0, len = defaultKeybindings.length; i < len; i++) {
			this._defaultBoundCommands[defaultKeybindings[i].command] = true;
		}

		this._map = Object.create(null);
		this._lookupMap = new Map<string, ArrayBuffer>();
		this._lookupMapUnreachable = new Map<string, ArrayBuffer>();
		this._chords = Object.create(null);

		let allKeybindings = KeybindingResolver.combine(defaultKeybindings, overrides);
		for (let i = 0, len = allKeybindings.length; i < len; i++) {
			let k = allKeybindings[i];
			if (k.keybinding === 0) {
				continue;
			}

			let entry: ICommandEntry = {
				when: k.when,
				keybinding: k.keybinding,
				commandId: k.command,
				commandArgs: k.commandArgs
			};

			if (BinaryKeybindings.hasChord(k.keybinding)) {
				// This is a chord
				let keybindingFirstPart = BinaryKeybindings.extractFirstPart(k.keybinding);
				let keybindingChordPart = BinaryKeybindings.extractChordPart(k.keybinding);

				this._chords[keybindingFirstPart] = this._chords[keybindingFirstPart] || Object.create(null);
				this._chords[keybindingFirstPart][keybindingChordPart] = this._chords[keybindingFirstPart][keybindingChordPart] || [];
				this._chords[keybindingFirstPart][keybindingChordPart].push(entry);

				this._addKeyPress(keybindingFirstPart, entry, k);

			} else {
				this._addKeyPress(k.keybinding, entry, k);

			}
		}
	}

	private static _isTargetedForRemoval(defaultKb: NormalizedKeybindingItem, keybinding: number, command: string, when: ContextKeyExpr): boolean {
		if (defaultKb.actualCommand !== command) {
			return false;
		}
		if (keybinding) {
			if (defaultKb.keybinding !== keybinding) {
				return false;
			}
		}
		if (when) {
			if (!defaultKb.when) {
				return false;
			}
			if (!when.equals(defaultKb.when)) {
				return false;
			}
		}
		return true;

	}

	public static combine(rawDefaults: IKeybindingItem[], rawOverrides: IKeybindingItem[]): NormalizedKeybindingItem[] {
		let defaults = rawDefaults.map(kb => NormalizedKeybindingItem.fromKeybindingItem(kb, true));
		let overrides: NormalizedKeybindingItem[] = [];
		for (let i = 0, len = rawOverrides.length; i < len; i++) {
			let override = NormalizedKeybindingItem.fromKeybindingItem(rawOverrides[i], false);
			if (!override.command || override.command.length === 0 || override.command.charAt(0) !== '-') {
				overrides.push(override);
				continue;
			}

			let commandToRemove = override.command.substr(1);
			let keybindingToRemove = override.keybinding;
			let whenToRemove = override.when;
			for (let j = defaults.length - 1; j >= 0; j--) {
				if (this._isTargetedForRemoval(defaults[j], keybindingToRemove, commandToRemove, whenToRemove)) {
					defaults.splice(j, 1);
				}
			}
		}
		return defaults.concat(overrides);
	}

	private _addKeyPress(keypress: number, entry: ICommandEntry, item: NormalizedKeybindingItem): void {

		if (!this._map[keypress]) {
			// There is no conflict so far
			this._map[keypress] = [entry];
			this._addToLookupMap(item);
			return;
		}

		let conflicts = this._map[keypress];

		for (let i = conflicts.length - 1; i >= 0; i--) {
			let conflict = conflicts[i];

			if (conflict.commandId === item.command) {
				continue;
			}

			if (BinaryKeybindings.hasChord(conflict.keybinding) && BinaryKeybindings.hasChord(entry.keybinding) && conflict.keybinding !== entry.keybinding) {
				// The conflict only shares the chord start with this command
				continue;
			}

			if (KeybindingResolver.whenIsEntirelyIncluded(true, conflict.when, item.when)) {
				// `item` completely overwrites `conflict`
				if (this._shouldWarnOnConflict && item.isDefault) {
					console.warn('Conflict detected, command `' + conflict.commandId + '` cannot be triggered by ' + KeybindingLabels.toUserSettingsLabel(keypress) + ' due to ' + item.command);
				}
				KeybindingResolver._push(this._lookupMapUnreachable, conflict.commandId, conflict.keybinding);
			}
		}

		conflicts.push(entry);
		this._addToLookupMap(item);
	}

	/**
	 * Returns true if `a` is completely covered by `b`.
	 * Returns true if `b` is a more relaxed `a`.
	 * Return true if (`a` === true implies `b` === true).
	 */
	public static whenIsEntirelyIncluded(inNormalizedForm: boolean, a: ContextKeyExpr, b: ContextKeyExpr): boolean {
		if (!inNormalizedForm) {
			a = a ? a.normalize() : null;
			b = b ? b.normalize() : null;
		}
		if (!b) {
			return true;
		}
		if (!a) {
			return false;
		}

		let aRulesArr = a.serialize().split(' && ');
		let bRulesArr = b.serialize().split(' && ');

		let aRules: { [rule: string]: boolean; } = Object.create(null);
		for (let i = 0, len = aRulesArr.length; i < len; i++) {
			aRules[aRulesArr[i]] = true;
		}

		for (let i = 0, len = bRulesArr.length; i < len; i++) {
			if (!aRules[bRulesArr[i]]) {
				return false;
			}
		}

		return true;
	}

	private static _push(map: Map<string, ArrayBuffer>, key: string, value: number): void {
		let oldRawEntries = map.get(key);
		if (typeof oldRawEntries === 'undefined') {
			let entries = new Uint32Array(1);
			entries[0] = value;
			map.set(key, entries.buffer);
		} else {
			let oldEntries = new Uint32Array(oldRawEntries);
			let newEntries = new Uint32Array(oldEntries.length + 1);
			newEntries.set(oldEntries, 0);
			newEntries[newEntries.length - 1] = value;
			map.set(key, newEntries.buffer);
		}
	}

	private static _read(map: Map<string, ArrayBuffer>, key: string): number[] {
		let arrBuff = map.get(key);
		if (typeof arrBuff === 'undefined') {
			return null;
		}

		let arr = new Uint32Array(arrBuff);
		let result: number[] = [];
		for (let i = 0, len = arr.length; i < len; i++) {
			result[i] = arr[i];
		}
		return result;
	}

	private _addToLookupMap(item: NormalizedKeybindingItem): void {
		if (!item.command) {
			return;
		}
		KeybindingResolver._push(this._lookupMap, item.command, item.keybinding);
	}

	public getDefaultBoundCommands(): IBoundCommands {
		return this._defaultBoundCommands;
	}

	public getDefaultKeybindings(): string {
		let out = new OutputBuilder();
		out.writeLine('[');

		let lastIndex = this._defaultKeybindings.length - 1;
		this._defaultKeybindings.forEach((k, index) => {
			IOSupport.writeKeybindingItem(out, k);
			if (index !== lastIndex) {
				out.writeLine(',');
			} else {
				out.writeLine();
			}
		});
		out.writeLine(']');
		return out.toString();
	}

	public lookupKeybinding(commandId: string): Keybinding[] {
		let possibleTriggers = KeybindingResolver._read(this._lookupMap, commandId);
		if (!possibleTriggers) {
			return [];
		}

		let remove = KeybindingResolver._read(this._lookupMapUnreachable, commandId);
		if (remove) {
			possibleTriggers = possibleTriggers.filter((possibleTrigger) => {
				return remove.indexOf(possibleTrigger) === -1;
			});
		}

		let seenKeys: number[] = [];
		let result = possibleTriggers.filter((possibleTrigger) => {
			if (seenKeys.indexOf(possibleTrigger) >= 0) {
				return false;
			}
			seenKeys.push(possibleTrigger);
			return true;
		});

		return result.map((trigger) => {
			return new Keybinding(trigger);
		}).reverse(); // sort most specific to the top
	}

	public resolve(context: any, currentChord: number, keypress: number): IResolveResult {
		// console.log('resolve: ' + Keybinding.toUserSettingsLabel(keypress));
		let lookupMap: ICommandEntry[] = null;

		if (currentChord !== 0) {
			let chords = this._chords[currentChord];
			if (!chords) {
				return null;
			}
			lookupMap = chords[keypress];
		} else {
			lookupMap = this._map[keypress];
		}


		let result = this._findCommand(context, lookupMap);
		if (!result) {
			return null;
		}

		if (currentChord === 0 && BinaryKeybindings.hasChord(result.keybinding)) {
			return {
				enterChord: keypress,
				commandId: null,
				commandArgs: null
			};
		}

		return {
			enterChord: 0,
			commandId: result.commandId,
			commandArgs: result.commandArgs
		};
	}

	private _findCommand(context: any, matches: ICommandEntry[]): ICommandEntry {
		if (!matches) {
			return null;
		}

		for (let i = matches.length - 1; i >= 0; i--) {
			let k = matches[i];

			if (!KeybindingResolver.contextMatchesRules(context, k.when)) {
				continue;
			}

			return k;
		}

		return null;
	}

	public static contextMatchesRules(context: any, rules: ContextKeyExpr): boolean {
		if (!rules) {
			return true;
		}
		return rules.evaluate(context);
	}
}

function rightPaddedString(str: string, minChars: number): string {
	if (str.length < minChars) {
		return str + (new Array(minChars - str.length).join(' '));
	}
	return str;
}

function sorter(a: IKeybindingItem, b: IKeybindingItem): number {
	if (a.weight1 !== b.weight1) {
		return a.weight1 - b.weight1;
	}
	if (a.command < b.command) {
		return -1;
	}
	if (a.command > b.command) {
		return 1;
	}
	return a.weight2 - b.weight2;
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

export class IOSupport {

	public static writeKeybindingItem(out: OutputBuilder, item: IKeybindingItem): void {
		let quotedSerializedKeybinding = JSON.stringify(IOSupport.writeKeybinding(item.keybinding));
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
			key = IOSupport.readKeybinding(input.key);
		}

		let when: ContextKeyExpr = null;
		if (typeof input.when === 'string') {
			when = IOSupport.readKeybindingWhen(input.when);
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

	public static writeKeybinding(input: number, Platform: ISimplifiedPlatform = platform): string {
		return KeybindingLabels.toUserSettingsLabel(input, Platform);
	}

	public static readKeybinding(input: string, Platform: ISimplifiedPlatform = platform): number {
		return KeybindingLabels.fromUserSettingsLabel(input, Platform);
	}

	public static readKeybindingWhen(input: string): ContextKeyExpr {
		return ContextKeyExpr.deserialize(input);
	}
}
