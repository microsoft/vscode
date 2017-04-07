/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { ContextKeyExpr, IContext } from 'vs/platform/contextkey/common/contextkey';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { CommandsRegistry, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';

export interface IResolveResult {
	enterChord: boolean;
	commandId: string;
	commandArgs: any;
	bubble: boolean;
}

export class KeybindingResolver {
	private readonly _defaultKeybindings: ResolvedKeybindingItem[];
	private readonly _keybindings: ResolvedKeybindingItem[];
	private readonly _shouldWarnOnConflict: boolean;
	private readonly _defaultBoundCommands: Map<string, boolean>;
	private readonly _map: Map<string, ResolvedKeybindingItem[]>;
	private readonly _lookupMap: Map<string, ResolvedKeybindingItem[]>;

	constructor(defaultKeybindings: ResolvedKeybindingItem[], overrides: ResolvedKeybindingItem[], shouldWarnOnConflict: boolean = true) {
		this._defaultKeybindings = defaultKeybindings;
		this._shouldWarnOnConflict = shouldWarnOnConflict;

		this._defaultBoundCommands = new Map<string, boolean>();
		for (let i = 0, len = defaultKeybindings.length; i < len; i++) {
			const command = defaultKeybindings[i].command;
			this._defaultBoundCommands.set(command, true);
		}

		this._map = new Map<string, ResolvedKeybindingItem[]>();
		this._lookupMap = new Map<string, ResolvedKeybindingItem[]>();

		this._keybindings = KeybindingResolver.combine(defaultKeybindings, overrides);
		for (let i = 0, len = this._keybindings.length; i < len; i++) {
			let k = this._keybindings[i];
			if (k.keypressFirstPart === null) {
				// unbound
				continue;
			}

			this._addKeyPress(k.keypressFirstPart, k);
		}
	}

	private static _isTargetedForRemoval(defaultKb: ResolvedKeybindingItem, keypressFirstPart: string, keypressChordPart: string, command: string, when: ContextKeyExpr): boolean {
		if (defaultKb.command !== command) {
			return false;
		}
		if (keypressFirstPart && defaultKb.keypressFirstPart !== keypressFirstPart) {
			return false;
		}
		if (keypressChordPart && defaultKb.keypressChordPart !== keypressChordPart) {
			return false;
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

	/**
	 * Looks for rules containing -command in `overrides` and removes them directly from `defaults`.
	 */
	public static combine(defaults: ResolvedKeybindingItem[], rawOverrides: ResolvedKeybindingItem[]): ResolvedKeybindingItem[] {
		defaults = defaults.slice(0);
		let overrides: ResolvedKeybindingItem[] = [];
		for (let i = 0, len = rawOverrides.length; i < len; i++) {
			const override = rawOverrides[i];
			if (!override.command || override.command.length === 0 || override.command.charAt(0) !== '-') {
				overrides.push(override);
				continue;
			}

			const command = override.command.substr(1);
			const keypressFirstPart = override.keypressFirstPart;
			const keypressChordPart = override.keypressChordPart;
			const when = override.when;
			for (let j = defaults.length - 1; j >= 0; j--) {
				if (this._isTargetedForRemoval(defaults[j], keypressFirstPart, keypressChordPart, command, when)) {
					defaults.splice(j, 1);
				}
			}
		}
		return defaults.concat(overrides);
	}

	private _addKeyPress(keypress: string, item: ResolvedKeybindingItem): void {

		const conflicts = this._map.get(keypress);

		if (typeof conflicts === 'undefined') {
			// There is no conflict so far
			this._map.set(keypress, [item]);
			this._addToLookupMap(item);
			return;
		}

		for (let i = conflicts.length - 1; i >= 0; i--) {
			let conflict = conflicts[i];

			if (conflict.command === item.command) {
				continue;
			}

			const conflictIsChord = (conflict.keypressChordPart !== null);
			const itemIsChord = (item.keypressChordPart !== null);

			if (conflictIsChord && itemIsChord && conflict.keypressChordPart !== item.keypressChordPart) {
				// The conflict only shares the chord start with this command
				continue;
			}

			if (KeybindingResolver.whenIsEntirelyIncluded(true, conflict.when, item.when)) {
				// `item` completely overwrites `conflict`
				if (this._shouldWarnOnConflict && item.isDefault) {
					console.warn('Conflict detected, command `' + conflict.command + '` cannot be triggered due to ' + item.command);
				}

				// Remove conflict from the lookupMap
				this._removeFromLookupMap(conflict);
			}
		}

		conflicts.push(item);
		this._addToLookupMap(item);
	}

	private _addToLookupMap(item: ResolvedKeybindingItem): void {
		if (!item.command) {
			return;
		}

		let arr = this._lookupMap.get(item.command);
		if (typeof arr === 'undefined') {
			arr = [item];
			this._lookupMap.set(item.command, arr);
		} else {
			arr.push(item);
		}
	}

	private _removeFromLookupMap(item: ResolvedKeybindingItem): void {
		let arr = this._lookupMap.get(item.command);
		if (typeof arr === 'undefined') {
			return;
		}
		for (let i = 0, len = arr.length; i < len; i++) {
			if (arr[i] === item) {
				arr.splice(i, 1);
				return;
			}
		}
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

	public getDefaultBoundCommands(): Map<string, boolean> {
		return this._defaultBoundCommands;
	}

	public getDefaultKeybindings(): ResolvedKeybindingItem[] {
		return this._defaultKeybindings;
	}

	public getKeybindings(): ResolvedKeybindingItem[] {
		return this._keybindings;
	}

	public lookupKeybindings(commandId: string): ResolvedKeybindingItem[] {
		let items = this._lookupMap.get(commandId);
		if (typeof items === 'undefined' || items.length === 0) {
			return [];
		}

		// Reverse to get the most specific item first
		let result: ResolvedKeybindingItem[] = [], resultLen = 0;
		for (let i = items.length - 1; i >= 0; i--) {
			result[resultLen++] = items[i];
		}
		return result;
	}

	public lookupPrimaryKeybinding(commandId: string): ResolvedKeybindingItem {
		let items = this._lookupMap.get(commandId);
		if (typeof items === 'undefined' || items.length === 0) {
			return null;
		}

		return items[items.length - 1];
	}

	public resolve(context: IContext, currentChord: string, keypress: string): IResolveResult {
		let lookupMap: ResolvedKeybindingItem[] = null;

		if (currentChord !== null) {
			// Fetch all chord bindings for `currentChord`

			const candidates = this._map.get(currentChord);
			if (typeof candidates === 'undefined') {
				// No chords starting with `currentChord`
				return null;
			}

			lookupMap = [];
			for (let i = 0, len = candidates.length; i < len; i++) {
				let candidate = candidates[i];
				if (candidate.keypressChordPart === keypress) {
					lookupMap.push(candidate);
				}
			}
		} else {
			const candidates = this._map.get(keypress);
			if (typeof candidates === 'undefined') {
				// No bindings with `keypress`
				return null;
			}

			lookupMap = candidates;
		}

		let result = this._findCommand(context, lookupMap);
		if (!result) {
			return null;
		}

		if (currentChord === null && result.keypressChordPart !== null) {
			return {
				enterChord: true,
				commandId: null,
				commandArgs: null,
				bubble: false
			};
		}

		return {
			enterChord: false,
			commandId: result.command,
			commandArgs: result.commandArgs,
			bubble: result.bubble
		};
	}

	private _findCommand(context: IContext, matches: ResolvedKeybindingItem[]): ResolvedKeybindingItem {
		for (let i = matches.length - 1; i >= 0; i--) {
			let k = matches[i];

			if (!KeybindingResolver.contextMatchesRules(context, k.when)) {
				continue;
			}

			return k;
		}

		return null;
	}

	public static contextMatchesRules(context: IContext, rules: ContextKeyExpr): boolean {
		if (!rules) {
			return true;
		}
		return rules.evaluate(context);
	}

	public static getAllUnboundCommands(boundCommands: Map<string, boolean>): string[] {
		const commands = CommandsRegistry.getCommands();
		const unboundCommands: string[] = [];

		for (let id in commands) {
			if (id[0] === '_' || id.indexOf('vscode.') === 0) { // private command
				continue;
			}
			if (typeof commands[id].description === 'object'
				&& !isFalsyOrEmpty((<ICommandHandlerDescription>commands[id].description).args)) { // command with args
				continue;
			}
			if (boundCommands.get(id) === true) {
				continue;
			}
			unboundCommands.push(id);
		}

		return unboundCommands;
	}
}
