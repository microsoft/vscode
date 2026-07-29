/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Registry for commands that can trigger Inline Edits (NES) when invoked.
 */
export abstract class TriggerInlineEditCommandsRegistry {

	private static REGISTERED_COMMANDS = new Set<string>();

	public static getRegisteredCommands(): readonly string[] {
		return [...TriggerInlineEditCommandsRegistry.REGISTERED_COMMANDS];
	}

	public static registerCommand(commandId: string): void {
		TriggerInlineEditCommandsRegistry.REGISTERED_COMMANDS.add(commandId);
	}
}
