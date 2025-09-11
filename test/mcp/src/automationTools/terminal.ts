/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Terminal Management Tools
 */
export function applyTerminalTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];
	tools.push(server.tool(
		'vscode_automation_terminal_create',
		'Create a new terminal',
		{
			expectedLocation: z.enum(['editor', 'panel']).optional().describe('Expected location of terminal (editor or panel)')
		},
		async (args) => {
			const { expectedLocation } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.terminal.createTerminal(expectedLocation);
			return {
				content: [{
					type: 'text' as const,
					text: `Created new terminal${expectedLocation ? ` in ${expectedLocation}` : ''}`
				}]
			};
		}
	));

	tools.push(server.tool(
		'vscode_automation_terminal_run_command',
		'Run a command in the terminal',
		{
			command: z.string().describe('Command to run in the terminal'),
			skipEnter: z.boolean().optional().describe('Skip pressing enter after typing command')
		},
		async (args) => {
			const { command, skipEnter } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.terminal.runCommandInTerminal(command, skipEnter);
			return {
				content: [{
					type: 'text' as const,
					text: `Ran command in terminal: "${command}"`
				}]
			};
		}
	));

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_terminal_wait_for_text',
	// 	'Wait for specific text to appear in terminal output',
	// 	{
	// 		acceptFunction: z.string().describe('JavaScript function body that takes buffer array and returns boolean'),
	// 		message: z.string().optional().describe('Optional message for waiting'),
	// 		splitIndex: z.number().optional().describe('Split terminal index (0 or 1)')
	// 	},
	// 	async (args) => {
	// 		const { acceptFunction, message, splitIndex } = args;
	// 		// Create function from string
	// 		const acceptFn = new Function('buffer', acceptFunction) as (buffer: string[]) => boolean;
	// 		const terminalSplitIndex = splitIndex === 0 ? 0 : splitIndex === 1 ? 1 : undefined;
	// 		await app.workbench.terminal.waitForTerminalText(acceptFn, message, terminalSplitIndex);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Terminal text condition met: ${message || 'custom condition'}`
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_terminal_get_groups',
		'Get current terminal groups information',
		async () => {
			const app = await appService.getOrCreateApplication();
			const groups = await app.workbench.terminal.getTerminalGroups();
			return {
				content: [{
					type: 'text' as const,
					text: `Terminal groups:\n${JSON.stringify(groups, null, 2)}`
				}]
			};
		}
	));

	// Seems too niche and redundant with runCommand tool
	// server.tool(
	// 	'vscode_automation_terminal_run_command_by_id',
	// 	'Run a terminal command by ID',
	// 	{
	// 		commandId: z.enum([
	// 			'workbench.action.terminal.split',
	// 			'workbench.action.terminal.killAll',
	// 			'workbench.action.terminal.unsplit',
	// 			'workbench.action.terminal.join',
	// 			'workbench.action.terminal.toggleTerminal',
	// 			'workbench.action.createTerminalEditor',
	// 			'workbench.action.createTerminalEditorSide',
	// 			'workbench.action.terminal.moveToTerminalPanel',
	// 			'workbench.action.terminal.moveToEditor',
	// 			'workbench.action.terminal.newWithProfile',
	// 			'workbench.action.terminal.selectDefaultShell',
	// 			'workbench.action.terminal.detachSession',
	// 			'workbench.action.terminal.new'
	// 		]).describe('Terminal command ID to execute'),
	// 		expectedLocation: z.enum(['editor', 'panel']).optional().describe('Expected location after command')
	// 	},
	// 	async (args) => {
	// 		const { commandId, expectedLocation } = args;
	// 		await app.workbench.terminal.runCommand(commandId as any, expectedLocation);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Executed terminal command: ${commandId}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_terminal_split',
	// 	'Split the current terminal',
	// 	async () => {
	// 		await app.workbench.terminal.clickSplitButton();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Split terminal'
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
