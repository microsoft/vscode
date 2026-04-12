/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';

/**
 * Activity Bar Tools
 */
export function applyActivityBarTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	// Doesn't seem particularly useful
	// server.tool(
	// 	'vscode_automation_activitybar_wait_for_position',
	// 	'Wait for the activity bar to appear at a specific position',
	// 	{
	// 		position: z.enum(['LEFT', 'RIGHT']).describe('Position of the activity bar (LEFT or RIGHT)')
	// 	},
	// 	async (args) => {
	// 		const { position } = args;
	// 		const activityBarPosition = position === 'LEFT' ? 0 : 1; // ActivityBarPosition.LEFT = 0, RIGHT = 1
	// 		await app.workbench.activitybar.waitForActivityBar(activityBarPosition);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Activity bar found at position: ${position}`
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
