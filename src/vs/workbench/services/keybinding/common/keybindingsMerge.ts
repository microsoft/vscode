/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { parse } from 'vs/base/common/json';
import { values, keys } from 'vs/base/common/map';
import { IUserFriendlyKeybinding, IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { firstIndex as findFirstIndex, equals } from 'vs/base/common/arrays';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import * as contentUtil from 'vs/platform/userDataSync/common/content';
import { IKeybindingsMergeService } from 'vs/platform/userDataSync/common/userDataSync';

interface ICompareResult {
	added: Set<string>;
	removed: Set<string>;
	updated: Set<string>;
}

interface IMergeResult {
	hasLocalForwarded: boolean;
	hasRemoteForwarded: boolean;
	added: Set<string>;
	removed: Set<string>;
	updated: Set<string>;
	conflicts: Set<string>;
}

export class KeybindingsMergeService implements IKeybindingsMergeService {

	_serviceBrand: undefined;

	constructor(
		@IKeybindingService private readonly keybindingsService: IKeybindingService
	) { }

	public async merge(localContent: string, remoteContent: string, baseContent: string | null): Promise<{ mergeContent: string, hasChanges: boolean, hasConflicts: boolean }> {
		const local = <IUserFriendlyKeybinding[]>parse(localContent);
		const remote = <IUserFriendlyKeybinding[]>parse(remoteContent);
		const base = baseContent ? <IUserFriendlyKeybinding[]>parse(baseContent) : null;
		const normalizedKeys = this.getNormalizedKeys(local, remote, base);

		let keybindingsMergeResult = this.computeMergeResultByKeybinding(local, remote, base, normalizedKeys);

		if (!keybindingsMergeResult.hasLocalForwarded && !keybindingsMergeResult.hasRemoteForwarded) {
			// No changes found between local and remote.
			return { mergeContent: localContent, hasChanges: false, hasConflicts: false };
		}

		if (!keybindingsMergeResult.hasLocalForwarded && keybindingsMergeResult.hasRemoteForwarded) {
			return { mergeContent: remoteContent, hasChanges: true, hasConflicts: false };
		}

		if (keybindingsMergeResult.hasLocalForwarded && !keybindingsMergeResult.hasRemoteForwarded) {
			// Local has moved forward and remote has not. Return local.
			return { mergeContent: localContent, hasChanges: true, hasConflicts: false };
		}

		// Both local and remote has moved forward.
		const localByCommand = this.byCommand(local);
		const remoteByCommand = this.byCommand(remote);
		const baseByCommand = base ? this.byCommand(base) : null;
		const localToRemoteByCommand = this.compareByCommand(localByCommand, remoteByCommand, normalizedKeys);
		const baseToLocalByCommand = baseByCommand ? this.compareByCommand(baseByCommand, localByCommand, normalizedKeys) : { added: keys(localByCommand).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
		const baseToRemoteByCommand = baseByCommand ? this.compareByCommand(baseByCommand, remoteByCommand, normalizedKeys) : { added: keys(remoteByCommand).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };

		const commandsMergeResult = this.computeMergeResult(localToRemoteByCommand, baseToLocalByCommand, baseToRemoteByCommand);
		const eol = contentUtil.getEol(localContent);
		let mergeContent = localContent;
		let mergeContentChanged = false;

		// Removed commands in Remote
		for (const command of values(commandsMergeResult.removed)) {
			if (commandsMergeResult.conflicts.has(command)) {
				continue;
			}
			mergeContent = this.removeKeybindings(mergeContent, eol, command);
			mergeContentChanged = true;
		}

		if (mergeContentChanged) {
			keybindingsMergeResult = this.computeMergeResultByKeybinding(local, remote, parse(mergeContent), normalizedKeys);
		}
		mergeContentChanged = false;
		// Added commands in remote
		for (const command of values(commandsMergeResult.added)) {
			if (commandsMergeResult.conflicts.has(command)) {
				continue;
			}
			const keybindings = remoteByCommand.get(command)!;
			// Ignore negated commands
			if (keybindings.some(keybinding => keybinding.command !== `-${command}` && keybindingsMergeResult.conflicts.has(normalizedKeys.get(keybinding.key)!))) {
				commandsMergeResult.conflicts.add(command);
				continue;
			}
			mergeContent = this.addKeybindings(mergeContent, eol, keybindings);
			mergeContentChanged = true;
		}

		if (mergeContentChanged) {
			keybindingsMergeResult = this.computeMergeResultByKeybinding(local, remote, parse(mergeContent), normalizedKeys);
		}
		// Updated commands in Remote
		for (const command of values(commandsMergeResult.updated)) {
			if (commandsMergeResult.conflicts.has(command)) {
				continue;
			}
			const keybindings = remoteByCommand.get(command)!;
			// Ignore negated commands
			if (keybindings.some(keybinding => keybinding.command !== `-${command}` && keybindingsMergeResult.conflicts.has(normalizedKeys.get(keybinding.key)!))) {
				commandsMergeResult.conflicts.add(command);
				continue;
			}
			mergeContent = this.updateKeybindings(mergeContent, eol, command, keybindings);
		}

		const hasConflicts = commandsMergeResult.conflicts.size > 0;
		if (hasConflicts) {
			mergeContent = `<<<<<<< local${eol}`
				+ mergeContent
				+ `${eol}=======${eol}`
				+ remoteContent
				+ `${eol}>>>>>>> remote`;
		}

		return { mergeContent, hasChanges: true, hasConflicts };
	}

	private computeMergeResult(localToRemote: ICompareResult, baseToLocal: ICompareResult, baseToRemote: ICompareResult): { added: Set<string>, removed: Set<string>, updated: Set<string>, conflicts: Set<string> } {
		const added: Set<string> = new Set<string>();
		const removed: Set<string> = new Set<string>();
		const updated: Set<string> = new Set<string>();
		const conflicts: Set<string> = new Set<string>();

		// Removed keys in Local
		for (const key of values(baseToLocal.removed)) {
			// Got updated in remote
			if (baseToRemote.updated.has(key)) {
				conflicts.add(key);
			}
		}

		// Removed keys in Remote
		for (const key of values(baseToRemote.removed)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got updated in local
			if (baseToLocal.updated.has(key)) {
				conflicts.add(key);
			} else {
				// remove the key
				removed.add(key);
			}
		}

		// Added keys in Local
		for (const key of values(baseToLocal.added)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got added in remote
			if (baseToRemote.added.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			}
		}

		// Added keys in remote
		for (const key of values(baseToRemote.added)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got added in local
			if (baseToLocal.added.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				added.add(key);
			}
		}

		// Updated keys in Local
		for (const key of values(baseToLocal.updated)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got updated in remote
			if (baseToRemote.updated.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			}
		}

		// Updated keys in Remote
		for (const key of values(baseToRemote.updated)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got updated in local
			if (baseToLocal.updated.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				// updated key
				updated.add(key);
			}
		}
		return { added, removed, updated, conflicts };
	}

	private getNormalizedKeys(local: IUserFriendlyKeybinding[], remote: IUserFriendlyKeybinding[], base: IUserFriendlyKeybinding[] | null): Map<string, string> {
		const keys = new Map<string, string>();
		for (const keybinding of [...local, ...remote, ...(base || [])]) {
			keys.set(keybinding.key, this.keybindingsService.resolveUserBinding(keybinding.key).map(part => part.getUserSettingsLabel()).join(' '));
		}
		return keys;
	}

	private computeMergeResultByKeybinding(local: IUserFriendlyKeybinding[], remote: IUserFriendlyKeybinding[], base: IUserFriendlyKeybinding[] | null, normalizedKeys: Map<string, string>): IMergeResult {
		const empty = new Set<string>();
		const localByKeybinding = this.byKeybinding(local, normalizedKeys);
		const remoteByKeybinding = this.byKeybinding(remote, normalizedKeys);
		const baseByKeybinding = base ? this.byKeybinding(base, normalizedKeys) : null;

		const localToRemoteByKeybinding = this.compareByKeybinding(localByKeybinding, remoteByKeybinding);
		if (localToRemoteByKeybinding.added.size === 0 && localToRemoteByKeybinding.removed.size === 0 && localToRemoteByKeybinding.updated.size === 0) {
			return { hasLocalForwarded: false, hasRemoteForwarded: false, added: empty, removed: empty, updated: empty, conflicts: empty };
		}

		const baseToLocalByKeybinding = baseByKeybinding ? this.compareByKeybinding(baseByKeybinding, localByKeybinding) : { added: keys(localByKeybinding).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
		if (baseToLocalByKeybinding.added.size === 0 && baseToLocalByKeybinding.removed.size === 0 && baseToLocalByKeybinding.updated.size === 0) {
			// Remote has moved forward and local has not.
			return { hasLocalForwarded: false, hasRemoteForwarded: true, added: empty, removed: empty, updated: empty, conflicts: empty };
		}

		const baseToRemoteByKeybinding = baseByKeybinding ? this.compareByKeybinding(baseByKeybinding, remoteByKeybinding) : { added: keys(remoteByKeybinding).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
		if (baseToRemoteByKeybinding.added.size === 0 && baseToRemoteByKeybinding.removed.size === 0 && baseToRemoteByKeybinding.updated.size === 0) {
			return { hasLocalForwarded: true, hasRemoteForwarded: false, added: empty, removed: empty, updated: empty, conflicts: empty };
		}

		const { added, removed, updated, conflicts } = this.computeMergeResult(localToRemoteByKeybinding, baseToLocalByKeybinding, baseToRemoteByKeybinding);
		return { hasLocalForwarded: true, hasRemoteForwarded: true, added, removed, updated, conflicts };
	}

	private byKeybinding(keybindings: IUserFriendlyKeybinding[], keys: Map<string, string>) {
		const map: Map<string, IUserFriendlyKeybinding[]> = new Map<string, IUserFriendlyKeybinding[]>();
		for (const keybinding of keybindings) {
			const key = keys.get(keybinding.key)!;
			let value = map.get(key);
			if (!value) {
				value = [];
				map.set(key, value);
			}
			value.push(keybinding);

		}
		return map;
	}

	private byCommand(keybindings: IUserFriendlyKeybinding[]): Map<string, IUserFriendlyKeybinding[]> {
		const map: Map<string, IUserFriendlyKeybinding[]> = new Map<string, IUserFriendlyKeybinding[]>();
		for (const keybinding of keybindings) {
			const command = keybinding.command[0] === '-' ? keybinding.command.substring(1) : keybinding.command;
			let value = map.get(command);
			if (!value) {
				value = [];
				map.set(command, value);
			}
			value.push(keybinding);
		}
		return map;
	}


	private compareByKeybinding(from: Map<string, IUserFriendlyKeybinding[]>, to: Map<string, IUserFriendlyKeybinding[]>): ICompareResult {
		const fromKeys = keys(from);
		const toKeys = keys(to);
		const added = toKeys.filter(key => fromKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const updated: Set<string> = new Set<string>();

		for (const key of fromKeys) {
			if (removed.has(key)) {
				continue;
			}
			const value1: IUserFriendlyKeybinding[] = from.get(key)!.map(keybinding => ({ ...keybinding, ...{ key } }));
			const value2: IUserFriendlyKeybinding[] = to.get(key)!.map(keybinding => ({ ...keybinding, ...{ key } }));
			if (!equals(value1, value2, (a, b) => this.isSameKeybinding(a, b))) {
				updated.add(key);
			}
		}

		return { added, removed, updated };
	}

	private compareByCommand(from: Map<string, IUserFriendlyKeybinding[]>, to: Map<string, IUserFriendlyKeybinding[]>, normalizedKeys: Map<string, string>): ICompareResult {
		const fromKeys = keys(from);
		const toKeys = keys(to);
		const added = toKeys.filter(key => fromKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const updated: Set<string> = new Set<string>();

		for (const key of fromKeys) {
			if (removed.has(key)) {
				continue;
			}
			const value1: IUserFriendlyKeybinding[] = from.get(key)!.map(keybinding => ({ ...keybinding, ...{ key: normalizedKeys.get(keybinding.key)! } }));
			const value2: IUserFriendlyKeybinding[] = to.get(key)!.map(keybinding => ({ ...keybinding, ...{ key: normalizedKeys.get(keybinding.key)! } }));
			if (!this.areSameKeybindingsWithSameCommand(value1, value2)) {
				updated.add(key);
			}
		}

		return { added, removed, updated };
	}

	private areSameKeybindingsWithSameCommand(value1: IUserFriendlyKeybinding[], value2: IUserFriendlyKeybinding[]): boolean {
		// Compare entries adding keybindings
		if (!equals(value1.filter(({ command }) => command[0] !== '-'), value2.filter(({ command }) => command[0] !== '-'), (a, b) => this.isSameKeybinding(a, b))) {
			return false;
		}
		// Compare entries removing keybindings
		if (!equals(value1.filter(({ command }) => command[0] === '-'), value2.filter(({ command }) => command[0] === '-'), (a, b) => this.isSameKeybinding(a, b))) {
			return false;
		}
		return true;
	}

	private isSameKeybinding(a: IUserFriendlyKeybinding, b: IUserFriendlyKeybinding): boolean {
		if (a.command !== b.command) {
			return false;
		}
		if (a.key !== b.key) {
			return false;
		}
		const whenA = ContextKeyExpr.deserialize(a.when);
		const whenB = ContextKeyExpr.deserialize(b.when);
		if ((whenA && !whenB) || (!whenA && whenB)) {
			return false;
		}
		if (whenA && whenB && !whenA.equals(whenB)) {
			return false;
		}
		if (!objects.equals(a.args, b.args)) {
			return false;
		}
		return true;
	}

	private addKeybindings(content: string, eol: string, keybindings: IUserFriendlyKeybinding[]): string {
		for (const keybinding of keybindings) {
			content = contentUtil.edit(content, eol, [-1], keybinding);
		}
		return content;
	}

	private removeKeybindings(content: string, eol: string, command: string): string {
		const keybindings = <IUserFriendlyKeybinding[]>parse(content);
		for (let index = keybindings.length - 1; index >= 0; index--) {
			if (keybindings[index].command === command || keybindings[index].command === `-${command}`) {
				content = contentUtil.edit(content, eol, [index], undefined);
			}
		}
		return content;
	}

	private updateKeybindings(content: string, eol: string, command: string, keybindings: IUserFriendlyKeybinding[]): string {
		const allKeybindings = <IUserFriendlyKeybinding[]>parse(content);
		const location = findFirstIndex(allKeybindings, keybinding => keybinding.command === command || keybinding.command === `-${command}`);
		// Remove all entries with this command
		for (let index = allKeybindings.length - 1; index >= 0; index--) {
			if (allKeybindings[index].command === command || allKeybindings[index].command === `-${command}`) {
				content = contentUtil.edit(content, eol, [index], undefined);
			}
		}
		// add all entries at the same location where the entry with this command was located.
		for (let index = keybindings.length - 1; index >= 0; index--) {
			content = contentUtil.edit(content, eol, [location], keybindings[index]);
		}
		return content;
	}
}
