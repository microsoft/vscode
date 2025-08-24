/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Application } from '../../../automation';
import { z } from 'zod';

/**
 * Command Palette and Quick Access Tools
 */
export function applyQuickAccessTools(server: McpServer, app: Application) {
	server.tool(
		'vscode_automation_command_run',
		'Run a command by name through the command palette',
		{
			command: z.string().describe('The command name to run'),
			exactMatch: z.boolean().optional().describe('Whether to require exact label match')
		},
		async (args) => {
			const { command, exactMatch } = args;
			await app.workbench.quickaccess.runCommand(command, { exactLabelMatch: exactMatch });
			return {
				content: [{
					type: 'text' as const,
					text: `Executed command: "${command}"`
				}]
			};
		}
	);

	server.tool(
		'vscode_automation_quick_open_file',
		'Open quick file search and select a file',
		{
			fileName: z.string().describe('Name or pattern of file to search for'),
			exactFileName: z.string().optional().describe('Exact file name to select from results')
		},
		async (args) => {
			const { fileName, exactFileName } = args;
			await app.workbench.quickaccess.openFileQuickAccessAndWait(fileName, exactFileName || fileName);
			return {
				content: [{
					type: 'text' as const,
					text: `Opened file through quick open: "${fileName}"`
				}]
			};
		}
	);

	server.tool(
		'vscode_automation_quick_input_type',
		'Type text into the currently open quick input',
		{
			text: z.string().describe('Text to type into quick input')
		},
		async (args) => {
			const { text } = args;
			await app.workbench.quickinput.type(text);
			return {
				content: [{
					type: 'text' as const,
					text: `Typed in quick input: "${text}"`
				}]
			};
		}
	);

	server.tool(
		'vscode_automation_quick_input_select_item',
		'Select an item from the quick input list',
		{
			index: z.number().optional().describe('Index of item to select (0-based)'),
			keepOpen: z.boolean().optional().describe('Keep quick input open after selection')
		},
		async (args) => {
			const { index = 0, keepOpen } = args;
			await app.workbench.quickinput.selectQuickInputElement(index, keepOpen);
			return {
				content: [{
					type: 'text' as const,
					text: `Selected quick input item at index ${index}`
				}]
			};
		}
	);
}
