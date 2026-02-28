/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';

/**
 * Keybindings Editor Tools
 */
export function applyKeybindingsTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	// Seems too niche
	// server.tool(
	// 	'vscode_automation_keybindings_update',
	// 	'Update a keybinding for a specific command',
	// 	{
	// 		command: z.string().describe('Command ID to update keybinding for'),
	// 		commandName: z.string().optional().describe('Optional command display name'),
	// 		keybinding: z.string().describe('New keybinding (e.g., "ctrl+k ctrl+c")'),
	// 		keybindingTitle: z.string().describe('Display title for the keybinding')
	// 	},
	// 	async (args) => {
	// 		const { command, commandName, keybinding, keybindingTitle } = args;
	// 		await app.workbench.keybindingsEditor.updateKeybinding(command, commandName, keybinding, keybindingTitle);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Updated keybinding for "${command}"${commandName ? ` (${commandName})` : ''}: ${keybinding} (${keybindingTitle})`
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
