/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Extensions Tools
 */
export function applyExtensionsTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_extensions_search',
	// 	'Search for an extension by ID',
	// 	{
	// 		extensionId: z.string().describe('Extension ID to search for (e.g., "ms-python.python")')
	// 	},
	// 	async (args) => {
	// 		const { extensionId } = args;
	// 		await app.workbench.extensions.searchForExtension(extensionId);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Searched for extension: ${extensionId}`
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_extensions_open',
		'Open an extension by ID',
		{
			extensionId: z.string().describe('Extension ID to open (e.g., "ms-python.python")')
		},
		async (args) => {
			const { extensionId } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.extensions.openExtension(extensionId);
			return {
				content: [{
					type: 'text' as const,
					text: `Opened extension: ${extensionId}`
				}]
			};
		}
	));

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_extensions_close',
	// 	'Close an extension tab by title',
	// 	{
	// 		title: z.string().describe('Extension title to close')
	// 	},
	// 	async (args) => {
	// 		const { title } = args;
	// 		await app.workbench.extensions.closeExtension(title);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Closed extension: ${title}`
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_extensions_install',
		'Install an extension by ID',
		{
			extensionId: z.string().describe('Extension ID to install (e.g., "ms-python.python")'),
			waitUntilEnabled: z.boolean().optional().default(true).describe('Whether to wait until the extension is enabled')
		},
		async (args) => {
			const { extensionId, waitUntilEnabled = true } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.extensions.installExtension(extensionId, waitUntilEnabled);
			return {
				content: [{
					type: 'text' as const,
					text: `Installed extension: ${extensionId}${waitUntilEnabled ? ' (waited until enabled)' : ''}`
				}]
			};
		}
	));

	return tools;
}
