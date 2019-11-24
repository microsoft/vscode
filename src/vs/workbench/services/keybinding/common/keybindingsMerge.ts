/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { parse, findNodeAtLocation, parseTree, JSONPath } from 'vs/base/common/json';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModel } from 'vs/editor/common/model';
import { setProperty } from 'vs/base/common/jsonEdit';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Position } from 'vs/editor/common/core/position';
import { values, keys } from 'vs/base/common/map';
import { IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { firstIndex, equals } from 'vs/base/common/arrays';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IKeybindingsMergeService } from 'vs/platform/userDataSync/common/userDataSync';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export class KeybindingsMergeService implements IKeybindingsMergeService {

	_serviceBrand: undefined;

	constructor(
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
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
		const keybindingsPreviewModel = this.modelService.createModel(localContent, this.modeService.create('jsonc'));

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
				this.removeKeybindings(keybindingsPreviewModel, command);
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
				this.addKeybinding(keybindingsPreviewModel, command, remoteByCommand.get(command)!);
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
				this.updateKeybinding(keybindingsPreviewModel, command, remoteByCommand.get(command)!);
			}
		}

		const conflicts: { index: number, command: string }[] = [];
		const previewKeybindings = <IUserFriendlyKeybinding[]>parse(keybindingsPreviewModel.getValue());
		for (const command of values(conflictCommands)) {
			const index = firstIndex(previewKeybindings, keybinding => keybinding.command === command || keybinding.command === `-${command}`);
			if (index >= 0) {
				conflicts.push({ command, index });
			}
		}
		conflicts.sort((a, b) => b.index - a.index);

		// Move all entries with same command together
		for (const conflict of conflicts) {
			this.updateKeybinding(keybindingsPreviewModel, conflict.command, localByCommand.get(conflict.command)!);
		}

		const eol = keybindingsPreviewModel.getEOL();
		for (const conflict of conflicts) {
			const tree = parseTree(keybindingsPreviewModel.getValue());
			const valueNode = findNodeAtLocation(tree, [conflict.index]);
			const remoteContent = this.getRemoteContentForConflict(eol, remoteByCommand.get(conflict.command)!);
			if (valueNode) {
				// Updated in Local and Remote with different value
				const valueStartPosition = keybindingsPreviewModel.getPositionAt(valueNode.offset);
				const valueEndPosition = keybindingsPreviewModel.getPositionAt(valueNode.offset + valueNode.length);
				const editOperations = [
					EditOperation.insert(new Position(valueStartPosition.lineNumber - 1, keybindingsPreviewModel.getLineMaxColumn(valueStartPosition.lineNumber - 1)), `${eol}<<<<<<< local`),
					EditOperation.insert(new Position(valueEndPosition.lineNumber, keybindingsPreviewModel.getLineMaxColumn(valueEndPosition.lineNumber)), `${eol}=======${eol}${remoteContent}>>>>>>> remote`)
				];
				keybindingsPreviewModel.pushEditOperations([new Selection(valueStartPosition.lineNumber, valueStartPosition.column, valueStartPosition.lineNumber, valueStartPosition.column)], editOperations, () => []);
			} else {
				// Removed in Local, but updated in Remote
				const position = new Position(keybindingsPreviewModel.getLineCount() - 1, keybindingsPreviewModel.getLineMaxColumn(keybindingsPreviewModel.getLineCount() - 1));
				const editOperations = [
					EditOperation.insert(position, `${eol}<<<<<<< local${eol}=======${eol}${remoteContent}>>>>>>> remote`)
				];
				keybindingsPreviewModel.pushEditOperations([new Selection(position.lineNumber, position.column, position.lineNumber, position.column)], editOperations, () => []);
			}
		}

		return { mergeContent: keybindingsPreviewModel.getValue(), hasChanges: true, hasConflicts: conflicts.length > 0 };
	}

	private getRemoteContentForConflict(eol: string, keybindings: IUserFriendlyKeybinding[]): string {
		let content = `[${eol}${eol}]`;
		for (const keybinding of keybindings) {
			const edit = setProperty(content, [-1], keybinding, { tabSize: 4, insertSpaces: false, eol })[0];
			content = content.substring(0, edit.offset) + edit.content + content.substring(edit.offset + edit.length);
		}
		return content.substring(2, content.length - 2);
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

	private addKeybinding(model: ITextModel, command: string, keybindings: IUserFriendlyKeybinding[]): void {
		for (const keybinding of keybindings) {
			this.edit(model, [-1], keybinding);
		}
	}

	private removeKeybindings(model: ITextModel, command: string): void {
		const keybindings = <IUserFriendlyKeybinding[]>parse(model.getValue());
		for (let index = keybindings.length - 1; index >= 0; index--) {
			if (keybindings[index].command === command || keybindings[index].command === `-${command}`) {
				this.edit(model, [index], undefined);
			}
		}
	}

	private updateKeybinding(model: ITextModel, command: string, keybindings: IUserFriendlyKeybinding[]): void {
		const allKeybindings = <IUserFriendlyKeybinding[]>parse(model.getValue());
		const location = firstIndex(allKeybindings, keybinding => keybinding.command === command || keybinding.command === `-${command}`);
		// Remove all entries with this command
		for (let index = allKeybindings.length - 1; index >= 0; index--) {
			if (allKeybindings[index].command === command || allKeybindings[index].command === `-${command}`) {
				this.edit(model, [index], undefined);
			}
		}
		// add all entries at the same location where the entry with this command was located.
		for (let index = keybindings.length - 1; index >= 0; index--) {
			this.edit(model, [location], keybindings[index]);
		}
	}

	private edit(model: ITextModel, originalPath: JSONPath, value: any) {
		const edit = setProperty(model.getValue(), originalPath, value, { tabSize: 4, insertSpaces: false, eol: model.getEOL() })[0];
		if (edit) {
			const startPosition = model.getPositionAt(edit.offset);
			const endPosition = model.getPositionAt(edit.offset + edit.length);
			const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
			let currentText = model.getValueInRange(range);
			if (edit.content !== currentText) {
				const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
				model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
			}
		}
	}

}

registerSingleton(IKeybindingsMergeService, KeybindingsMergeService);
