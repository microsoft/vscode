/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry, ICommandMetadata } from '../../../../platform/commands/common/commands.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { MenuRegistry, MenuId, isIMenuItem } from '../../../../platform/actions/common/actions.js';

export function getAllUnboundCommands(boundCommands: Map<string, boolean>): string[] {
	const unboundCommands: string[] = [];
	const seenMap: Map<string, boolean> = new Map<string, boolean>();
	const addCommand = (id: string, includeCommandWithArgs: boolean) => {
		if (seenMap.has(id)) {
			return;
		}
		seenMap.set(id, true);
		if (id[0] === '_' || id.indexOf('vscode.') === 0) { // private command
			return;
		}
		if (boundCommands.get(id) === true) {
			return;
		}
		if (!includeCommandWithArgs) {
			const command = CommandsRegistry.getCommand(id);
			if (command && typeof command.metadata === 'object'
				&& isNonEmptyArray((<ICommandMetadata>command.metadata).args)) { // command with args
				return;
			}
		}
		unboundCommands.push(id);
	};

	// Add all commands from Command Palette
	for (const menuItem of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
		if (isIMenuItem(menuItem)) {
			addCommand(menuItem.command.id, true);
		}
	}

	// Add all editor actions
	for (const editorAction of EditorExtensionsRegistry.getEditorActions()) {
		addCommand(editorAction.id, true);
	}

	for (const id of CommandsRegistry.getCommands().keys()) {
		addCommand(id, false);
	}

	return unboundCommands;
}
