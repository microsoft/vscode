/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Source Control Management Tools
 */
export function applySCMTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_scm_open',
	// 	'Open the Source Control Management viewlet',
	// 	async () => {
	// 		await app.workbench.scm.openSCMViewlet();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Opened SCM viewlet'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_scm_wait_for_change',
	// 	'Wait for a specific change to appear in SCM',
	// 	{
	// 		name: z.string().describe('Name of the file change to wait for'),
	// 		type: z.string().optional().describe('Type of change (optional)')
	// 	},
	// 	async (args) => {
	// 		const { name, type } = args;
	// 		await app.workbench.scm.waitForChange(name, type);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Change detected: ${name}${type ? ` (${type})` : ''}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_scm_refresh',
	// 	'Refresh the SCM viewlet',
	// 	async () => {
	// 		await app.workbench.scm.refreshSCMViewlet();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Refreshed SCM viewlet'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_scm_open_change',
	// 	'Open a specific change in the SCM viewlet',
	// 	{
	// 		name: z.string().describe('Name of the file change to open')
	// 	},
	// 	async (args) => {
	// 		const { name } = args;
	// 		await app.workbench.scm.openChange(name);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Opened change: ${name}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_scm_stage',
	// 	'Stage a specific file change',
	// 	{
	// 		name: z.string().describe('Name of the file to stage')
	// 	},
	// 	async (args) => {
	// 		const { name } = args;
	// 		await app.workbench.scm.stage(name);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Staged file: ${name}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_scm_unstage',
	// 	'Unstage a specific file change',
	// 	{
	// 		name: z.string().describe('Name of the file to unstage')
	// 	},
	// 	async (args) => {
	// 		const { name } = args;
	// 		await app.workbench.scm.unstage(name);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Unstaged file: ${name}`
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_scm_commit',
		'Commit staged changes with a message',
		{
			message: z.string().describe('Commit message')
		},
		async (args) => {
			const { message } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.scm.commit(message);
			return {
				content: [{
					type: 'text' as const,
					text: `Committed changes with message: "${message}"`
				}]
			};
		}
	));

	return tools;
}
