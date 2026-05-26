/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Command Palette and Quick Access Tools
 */
export function applyQuickAccessTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	tools.push(server.tool(
		'vscode_automation_command_run',
		'Run a command by name through the command palette',
		{
			command: z.string().describe('The command name to run'),
			exactMatch: z.boolean().optional().describe('Whether to require exact label match')
		},
		async (args) => {
			const { command, exactMatch } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.quickaccess.runCommand(command, { exactLabelMatch: exactMatch, keepOpen: true });
			return {
				content: [{
					type: 'text' as const,
					text: `Executed command: "${command}"`
				}]
			};
		}
	));

	tools.push(server.tool(
		'vscode_automation_quick_open_file',
		'Open quick file search and select a file',
		{
			fileName: z.string().describe('Name or pattern of file to search for'),
			exactFileName: z.string().optional().describe('Exact file name to select from results')
		},
		async (args) => {
			const { fileName, exactFileName } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.quickaccess.openFileQuickAccessAndWait(fileName, exactFileName || fileName);
			return {
				content: [{
					type: 'text' as const,
					text: `Opened file through quick open: "${fileName}"`
				}]
			};
		}
	));

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_quick_input_type',
	// 	'Type text into the currently open quick input',
	// 	{
	// 		text: z.string().describe('Text to type into quick input')
	// 	},
	// 	async (args) => {
	// 		const { text } = args;
	// 		await app.workbench.quickinput.type(text);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Typed in quick input: "${text}"`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_quick_input_select_item',
	// 	'Select an item from the quick input list',
	// 	{
	// 		index: z.number().optional().describe('Index of item to select (0-based)'),
	// 		keepOpen: z.boolean().optional().describe('Keep quick input open after selection')
	// 	},
	// 	async (args) => {
	// 		const { index = 0, keepOpen } = args;
	// 		await app.workbench.quickinput.selectQuickInputElement(index, keepOpen);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Selected quick input item at index ${index}`
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
