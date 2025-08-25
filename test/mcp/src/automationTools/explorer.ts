/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Application } from '../../../automation';

/**
 * Explorer and File Management Tools
 */
export function applyExplorerTools(server: McpServer, app: Application) {
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
}
