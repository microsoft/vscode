/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {BinaryKeybindings, ISimplifiedPlatform, Keybinding} from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import {IKeybindingItem, IUserFriendlyKeybinding, KbExpr} from 'vs/platform/keybinding/common/keybindingService';

export interface IResolveResult {
	enterChord: number;
	commandId: string;
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
	context: KbExpr;
	keybinding: number;
	commandId: string;
}

export class KeybindingResolver {
	private _defaultKeybindings: IKeybindingItem[];
	private _defaultBoundCommands: IBoundCommands;
	private _map: ICommandMap;
	private _chords: IChordsMap;
	private _lookupMap: {
		[commandId: string]: IKeybindingItem[];
	};
	private _lookupMapUnreachable: {
		// The value contains the keybinding or first part of a chord
		[commandId: string]: number[];
	};
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
		this._lookupMap = Object.create(null);
		this._lookupMapUnreachable = Object.create(null);
		this._chords = Object.create(null);

		let defaultKeybindingsCount = defaultKeybindings.length;
		let allKeybindings = defaultKeybindings.concat(overrides);
		for (let i = 0, len = allKeybindings.length; i < len; i++) {
			let k = allKeybindings[i];
			if (k.keybinding === 0) {
				continue;
			}
			if (k.context) {
				k.context = k.context.normalize();
			}

			let entry: ICommandEntry = {
				context: k.context,
				keybinding: k.keybinding,
				commandId: k.command
			};

			if (BinaryKeybindings.hasChord(k.keybinding)) {
				// This is a chord
				let keybindingFirstPart = BinaryKeybindings.extractFirstPart(k.keybinding);
				let keybindingChordPart = BinaryKeybindings.extractChordPart(k.keybinding);

				this._chords[keybindingFirstPart] = this._chords[keybindingFirstPart] || Object.create(null);
				this._chords[keybindingFirstPart][keybindingChordPart] = this._chords[keybindingFirstPart][keybindingChordPart] || [];
				this._chords[keybindingFirstPart][keybindingChordPart].push(entry);

				this._addKeyPress(keybindingFirstPart, entry, k, i < defaultKeybindingsCount);

			} else {
				this._addKeyPress(k.keybinding, entry, k, i < defaultKeybindingsCount);

			}
		}
	}

	private _addKeyPress(keypress: number, entry: ICommandEntry, item: IKeybindingItem, isDefault: boolean): void {

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

			if (KeybindingResolver.contextIsEntirelyIncluded(true, conflict.context, item.context)) {
				// `item` completely overwrites `conflict`
				if (this._shouldWarnOnConflict && isDefault) {
					console.warn('Conflict detected, command `' + conflict.commandId + '` cannot be triggered by ' + Keybinding.toUserSettingsLabel(keypress) + ' due to ' + item.command);
				}
				this._lookupMapUnreachable[conflict.commandId] = this._lookupMapUnreachable[conflict.commandId] || [];
				this._lookupMapUnreachable[conflict.commandId].push(conflict.keybinding);
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
	public static contextIsEntirelyIncluded(inNormalizedForm: boolean, a: KbExpr, b: KbExpr): boolean {
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

	private _addToLookupMap(item: IKeybindingItem): void {
		if (!item.command) {
			return;
		}
		this._lookupMap[item.command] = this._lookupMap[item.command] || [];
		this._lookupMap[item.command].push(item);
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
		let rawPossibleTriggers = this._lookupMap[commandId];
		if (!rawPossibleTriggers) {
			return [];
		}

		let possibleTriggers = rawPossibleTriggers.map(possibleTrigger => possibleTrigger.keybinding);

		let remove = this._lookupMapUnreachable[commandId];
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
		// console.log('resolve: ' + Keybinding.toLabel(keypress));
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
				commandId: null
			};
		}

		return {
			enterChord: 0,
			commandId: result.commandId
		};
	}

	private _findCommand(context: any, matches: ICommandEntry[]): ICommandEntry {
		if (!matches) {
			return null;
		}

		for (let i = matches.length - 1; i >= 0; i--) {
			let k = matches[i];

			if (!KeybindingResolver.contextMatchesRules(context, k.context)) {
				continue;
			}

			return k;
		}

		return null;
	}

	public static contextMatchesRules(context: any, rules: KbExpr): boolean {
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
		out.write('{ "key": ' + rightPaddedString('"' + IOSupport.writeKeybinding(item.keybinding).replace(/\\/g, '\\\\') + '",', 25) + ' "command": ');
		let serializedContext = item.context ? item.context.serialize() : '';
		if (serializedContext.length > 0) {
			out.write('"' + item.command + '",');
			out.writeLine();
			out.write('                                     "when": "');
			out.write(serializedContext);
			out.write('" ');
		} else {
			out.write('"' + item.command + '" ');
		}
		//		out.write(String(item.weight));
		out.write('}');
	}

	public static readKeybindingItem(input: IUserFriendlyKeybinding, index: number): IKeybindingItem {
		let key = IOSupport.readKeybinding(input.key);
		let context = IOSupport.readKeybindingContexts(input.when);
		return {
			keybinding: key,
			command: input.command,
			context: context,
			weight1: 1000,
			weight2: index
		};
	}

	public static writeKeybinding(input: number, Platform: ISimplifiedPlatform = platform): string {
		return Keybinding.toUserSettingsLabel(input, Platform);
	}

	public static readKeybinding(input: string, Platform: ISimplifiedPlatform = platform): number {
		return Keybinding.fromUserSettingsLabel(input, Platform);
	}

	public static readKeybindingContexts(input: string): KbExpr {
		return KbExpr.deserialize(input);
	}
}
