/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Debug Tools
 */
export function applyDebugTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];
	tools.push(server.tool(
		'vscode_automation_debug_open',
		'Open the debug viewlet',
		async () => {
			const app = await appService.getOrCreateApplication();
			await app.workbench.debug.openDebugViewlet();
			return {
				content: [{
					type: 'text' as const,
					text: 'Opened debug viewlet'
				}]
			};
		}
	));

	tools.push(server.tool(
		'vscode_automation_debug_set_breakpoint',
		'Set a breakpoint on a specific line',
		{
			lineNumber: z.number().describe('Line number to set breakpoint on')
		},
		async (args) => {
			const { lineNumber } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.debug.setBreakpointOnLine(lineNumber);
			return {
				content: [{
					type: 'text' as const,
					text: `Set breakpoint on line ${lineNumber}`
				}]
			};
		}
	));

	tools.push(server.tool(
		'vscode_automation_debug_start',
		'Start debugging',
		async () => {
			const app = await appService.getOrCreateApplication();
			const result = await app.workbench.debug.startDebugging();
			return {
				content: [{
					type: 'text' as const,
					text: `Started debugging (result: ${result})`
				}]
			};
		}
	));

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_debug_stop',
	// 	'Stop debugging',
	// 	async () => {
	// 		await app.workbench.debug.stopDebugging();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Stopped debugging'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_debug_step_over',
	// 	'Step over in debugger',
	// 	async () => {
	// 		await app.workbench.debug.stepOver();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Stepped over'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_debug_step_in',
	// 	'Step into in debugger',
	// 	async () => {
	// 		await app.workbench.debug.stepIn();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Stepped in'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_debug_step_out',
	// 	'Step out in debugger',
	// 	async () => {
	// 		await app.workbench.debug.stepOut();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Stepped out'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_debug_continue',
	// 	'Continue execution in debugger',
	// 	async () => {
	// 		await app.workbench.debug.continue();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Continued execution'
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
