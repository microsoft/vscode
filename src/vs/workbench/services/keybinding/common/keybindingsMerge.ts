/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { parse, findNodeAtLocation, parseTree, JSONPath } from 'vs/base/common/json';
import { setProperty } from 'vs/base/common/jsonEdit';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Position } from 'vs/editor/common/core/position';
import { values, keys } from 'vs/base/common/map';
import { IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { firstIndex as findFirstIndex, equals } from 'vs/base/common/arrays';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IKeybindingsMergeService } from 'vs/platform/userDataSync/common/userDataSync';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export class KeybindingsMergeService implements IKeybindingsMergeService {

	_serviceBrand: undefined;

	constructor(
		@IModelService private readonly modelService: IModelService
	) { }

	async merge(localContent: string, remoteContent: string, baseContent: string | null): Promise<{ mergeContent: string, hasChanges: boolean, hasConflicts: boolean }> {
		const local = <IUserFriendlyKeybinding[]>parse(localContent);
		const remote = <IUserFriendlyKeybinding[]>parse(remoteContent);
		const base = baseContent ? <IUserFriendlyKeybinding[]>parse(baseContent) : null;

		const byCommand = (keybindings: IUserFriendlyKeybinding[]) => {
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
		};

		const localByCommand = byCommand(local);
		const remoteByCommand = byCommand(remote);
		const baseByCommand = base ? byCommand(base) : null;

		const localToRemote = this.compare(localByCommand, remoteByCommand);
		if (localToRemote.added.size === 0 && localToRemote.removed.size === 0 && localToRemote.updated.size === 0) {
			// No changes found between local and remote.
			return { mergeContent: localContent, hasChanges: false, hasConflicts: false };
		}

		const conflictCommands: Set<string> = new Set<string>();
		const baseToLocal = baseByCommand ? this.compare(baseByCommand, localByCommand) : { added: keys(localByCommand).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
		const baseToRemote = baseByCommand ? this.compare(baseByCommand, remoteByCommand) : { added: keys(remoteByCommand).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
		let mergeContent = localContent;
		const eol = this.modelService.createModel(mergeContent, null).getEOL();

		// Removed commands in Local
		for (const command of values(baseToLocal.removed)) {
			// Got updated in remote
			if (baseToRemote.updated.has(command)) {
				conflictCommands.add(command);
			}
		}

		// Removed commands in Remote
		for (const command of values(baseToRemote.removed)) {
			if (conflictCommands.has(command)) {
				continue;
			}
			// Got updated in local
			if (baseToLocal.updated.has(command)) {
				conflictCommands.add(command);
			} else {
				// remove the command
				mergeContent = this.removeKeybindings(mergeContent, eol, command);
			}
		}

		// Added commands in Local
		for (const command of values(baseToLocal.added)) {
			if (conflictCommands.has(command)) {
				continue;
			}
			// Got added in remote
			if (baseToRemote.added.has(command)) {
				// Has different value
				if (localToRemote.updated.has(command)) {
					conflictCommands.add(command);
				}
			}
		}

		// Added commands in remote
		for (const command of values(baseToRemote.added)) {
			if (conflictCommands.has(command)) {
				continue;
			}
			// Got added in local
			if (baseToLocal.added.has(command)) {
				// Has different value
				if (localToRemote.updated.has(command)) {
					conflictCommands.add(command);
				}
			} else {
				mergeContent = this.addKeybinding(mergeContent, eol, command, remoteByCommand.get(command)!);
			}
		}

		// Updated commands in Local
		for (const command of values(baseToLocal.updated)) {
			if (conflictCommands.has(command)) {
				continue;
			}
			// Got updated in remote
			if (baseToRemote.updated.has(command)) {
				// Has different value
				if (localToRemote.updated.has(command)) {
					conflictCommands.add(command);
				}
			}
		}

		// Updated commands in Remote
		for (const command of values(baseToRemote.updated)) {
			if (conflictCommands.has(command)) {
				continue;
			}
			// Got updated in local
			if (baseToLocal.updated.has(command)) {
				// Has different value
				if (localToRemote.updated.has(command)) {
					conflictCommands.add(command);
				}
			} else {
				// update the command
				mergeContent = this.updateKeybinding(mergeContent, eol, command, remoteByCommand.get(command)!);
			}
		}

		const conflicts: { command: string, local: IUserFriendlyKeybinding[] | undefined, remote: IUserFriendlyKeybinding[] | undefined, firstIndex: number }[] = [];

		for (const command of values(conflictCommands)) {
			const local = localByCommand.get(command);
			const remote = remoteByCommand.get(command);
			mergeContent = this.updateKeybinding(mergeContent, eol, command, [...local || [], ...remote || []]);
			conflicts.push({ command, local, remote, firstIndex: -1 });
		}

		const allKeybindings = <IUserFriendlyKeybinding[]>parse(mergeContent);
		const tree = parseTree(mergeContent);
		for (const conflict of conflicts) {
			conflict.firstIndex = findFirstIndex(allKeybindings, keybinding => keybinding.command === conflict.command || keybinding.command === `-${conflict.command}`);
		}
		// Sort reverse so that conflicts content is added from last
		conflicts.sort((a, b) => b.firstIndex - a.firstIndex);

		const model = this.modelService.createModel(mergeContent, null);
		for (const { firstIndex, local, remote } of conflicts) {
			const firstNode = findNodeAtLocation(tree, [firstIndex])!;
			const fistNodePosition = model.getPositionAt(firstNode.offset);
			const startLocalOffset = model.getOffsetAt(new Position(fistNodePosition.lineNumber - 1, model.getLineMaxColumn(fistNodePosition.lineNumber - 1)));
			let endLocalOffset = startLocalOffset;
			let remoteOffset = endLocalOffset;
			if (local) {
				const lastLocalValueNode = findNodeAtLocation(tree, [firstIndex + local.length - 1])!;
				const lastLocalValueEndPosition = model.getPositionAt(lastLocalValueNode.offset + lastLocalValueNode.length);
				endLocalOffset = model.getOffsetAt(new Position(lastLocalValueEndPosition.lineNumber, model.getLineMaxColumn(lastLocalValueEndPosition.lineNumber)));
			}
			if (remote) {
				const lastRemoteValueNode = findNodeAtLocation(tree, [firstIndex + (local ? local.length : 0) + remote.length - 1])!;
				const lastRemoteValueEndPosition = model.getPositionAt(lastRemoteValueNode.offset + lastRemoteValueNode.length);
				remoteOffset = model.getOffsetAt(new Position(lastRemoteValueEndPosition.lineNumber, model.getLineMaxColumn(lastRemoteValueEndPosition.lineNumber)));
			}
			mergeContent = mergeContent.substring(0, startLocalOffset)
				+ `${eol}<<<<<<< local`
				+ mergeContent.substring(startLocalOffset, endLocalOffset)
				+ `${eol}=======`
				+ mergeContent.substring(endLocalOffset, remoteOffset)
				+ `${eol}>>>>>>> remote`
				+ mergeContent.substring(remoteOffset);
		}

		return { mergeContent, hasChanges: true, hasConflicts: conflicts.length > 0 };
	}

	private compare(from: Map<string, IUserFriendlyKeybinding[]>, to: Map<string, IUserFriendlyKeybinding[]>): { added: Set<string>, removed: Set<string>, updated: Set<string> } {
		const fromKeys = keys(from);
		const toKeys = keys(to);
		const added = toKeys.filter(key => fromKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const updated: Set<string> = new Set<string>();

		for (const key of fromKeys) {
			if (removed.has(key)) {
				continue;
			}
			const value1: IUserFriendlyKeybinding[] = from.get(key)!;
			const value2: IUserFriendlyKeybinding[] = to.get(key)!;
			if (!this.areSameKeybindings(value1, value2)) {
				updated.add(key);
			}
		}

		return { added, removed, updated };
	}

	private areSameKeybindings(value1: IUserFriendlyKeybinding[], value2: IUserFriendlyKeybinding[]): boolean {
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

	private addKeybinding(content: string, eol: string, command: string, keybindings: IUserFriendlyKeybinding[]): string {
		for (const keybinding of keybindings) {
			content = this.edit(content, eol, [-1], keybinding);
		}
		return content;
	}

	private removeKeybindings(content: string, eol: string, command: string): string {
		const keybindings = <IUserFriendlyKeybinding[]>parse(content);
		for (let index = keybindings.length - 1; index >= 0; index--) {
			if (keybindings[index].command === command || keybindings[index].command === `-${command}`) {
				content = this.edit(content, eol, [index], undefined);
			}
		}
		return content;
	}

	private updateKeybinding(content: string, eol: string, command: string, keybindings: IUserFriendlyKeybinding[]): string {
		const allKeybindings = <IUserFriendlyKeybinding[]>parse(content);
		const location = findFirstIndex(allKeybindings, keybinding => keybinding.command === command || keybinding.command === `-${command}`);
		// Remove all entries with this command
		for (let index = allKeybindings.length - 1; index >= 0; index--) {
			if (allKeybindings[index].command === command || allKeybindings[index].command === `-${command}`) {
				content = this.edit(content, eol, [index], undefined);
			}
		}
		// add all entries at the same location where the entry with this command was located.
		for (let index = keybindings.length - 1; index >= 0; index--) {
			content = this.edit(content, eol, [location], keybindings[index]);
		}
		return content;
	}

	private edit(content: string, eol: string, originalPath: JSONPath, value: any): string {
		const edit = setProperty(content, originalPath, value, { tabSize: 4, insertSpaces: false, eol })[0];
		if (edit) {
			content = content.substring(0, edit.offset) + edit.content + content.substring(edit.offset + edit.length);
		}
		return content;
	}

}

registerSingleton(IKeybindingsMergeService, KeybindingsMergeService);
