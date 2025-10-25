/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';

/**
 * Explorer and File Management Tools
 */
export function applyExplorerTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_explorer_open',
	// 	'Open the file explorer viewlet',
	// 	async () => {
	// 		await app.workbench.explorer.openExplorerView();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Opened file explorer'
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
