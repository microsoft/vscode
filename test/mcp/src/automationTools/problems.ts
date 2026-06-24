/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Problems Panel Tools
 */
export function applyProblemsTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	tools.push(server.tool(
		'vscode_automation_problems_show',
		'Show the problems view',
		async () => {
			const app = await appService.getOrCreateApplication();
			await app.workbench.problems.showProblemsView();
			return {
				content: [{
					type: 'text' as const,
					text: 'Showed problems view'
				}]
			};
		}
	));

	tools.push(server.tool(
		'vscode_automation_problems_hide',
		'Hide the problems view',
		async () => {
			const app = await appService.getOrCreateApplication();
			await app.workbench.problems.hideProblemsView();
			return {
				content: [{
					type: 'text' as const,
					text: 'Hid problems view'
				}]
			};
		}
	));

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_problems_wait_for_view',
	// 	'Wait for the problems view to appear',
	// 	async () => {
	// 		await app.workbench.problems.waitForProblemsView();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Problems view is now visible'
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_problems_get_selector_in_view',
		'Get CSS selector for problems of a specific severity in the problems view',
		{
			severity: z.enum(['WARNING', 'ERROR']).describe('Problem severity (WARNING or ERROR)')
		},
		async (args) => {
			const { severity } = args;
			const severityMap: Record<string, number> = {
				'WARNING': 0,
				'ERROR': 1
			};

			// This is a static method that returns a selector, not an async operation
			const app = await appService.getOrCreateApplication();
			// eslint-disable-next-line local/code-no-any-casts
			const selector = (app.workbench.problems.constructor as any).getSelectorInProblemsView(severityMap[severity]);
			return {
				content: [{
					type: 'text' as const,
					text: `CSS selector for ${severity} problems in view: ${selector}`
				}]
			};
		}
	));

	// Seems too niche
	// server.tool(
	// 	'vscode_automation_problems_get_selector_in_editor',
	// 	'Get CSS selector for problems of a specific severity in the editor',
	// 	{
	// 		severity: z.enum(['WARNING', 'ERROR']).describe('Problem severity (WARNING or ERROR)')
	// 	},
	// 	async (args) => {
	// 		const { severity } = args;
	// 		const severityMap: Record<string, number> = {
	// 			'WARNING': 0,
	// 			'ERROR': 1
	// 		};

	// 		// This is a static method that returns a selector, not an async operation
	// 		const selector = (app.workbench.problems.constructor as any).getSelectorInEditor(severityMap[severity]);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `CSS selector for ${severity} problems in editor: ${selector}`
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
