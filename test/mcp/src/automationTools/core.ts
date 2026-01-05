/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';

/**
 * Core Application Management Tools
 */
export function applyCoreTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	// Playwright keeps using this as a start... maybe it needs some massaging
	// server.tool(
	// 	'vscode_automation_restart',
	// 	'Restart VS Code with optional workspace or folder and extra arguments',
	// 	{
	// 		workspaceOrFolder: z.string().optional().describe('Optional path to workspace or folder to open'),
	// 		extraArgs: z.array(z.string()).optional().describe('Optional extra command line arguments')
	// 	},
	// 	async (args) => {
	// 		const { workspaceOrFolder, extraArgs } = args;
	// 		await app.restart({ workspaceOrFolder, extraArgs });
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `VS Code restarted successfully${workspaceOrFolder ? ` with workspace: ${workspaceOrFolder}` : ''}`
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_stop',
		'Stop the VS Code application',
		async () => {
			const app = await appService.getOrCreateApplication();
			await app.stopTracing(undefined, true);
			await app.stop();
			return {
				content: [{
					type: 'text' as const,
					text: 'VS Code stopped successfully'
				}]
			};
		}
	));

	// This doesn't seem particularly useful
	// server.tool(
	// 	'vscode_automation_get_quality',
	// 	'Get the quality/build type of VS Code (Dev, Insiders, Stable, etc.)',
	// 	async () => {
	// 		const info = {
	// 			quality: app.quality,
	// 			remote: app.remote,
	// 			web: app.web,
	// 			workspacePathOrFolder: app.workspacePathOrFolder,
	// 			extensionsPath: app.extensionsPath,
	// 			userDataPath: app.userDataPath
	// 		};
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `VS Code Info:\n${JSON.stringify(info, null, 2)}`
	// 			}]
	// 		};
	// 	}
	// );

	// This doesn't seem particularly useful
	// server.tool(
	// 	'vscode_automation_wait_for_element',
	// 	'Wait for a UI element to appear using CSS selector - prefer using specific workbench methods when available',
	// 	{
	// 		selector: z.string().describe('CSS selector for the element to wait for'),
	// 		timeout: z.number().optional().default(20).describe('Timeout in seconds (default: 20)')
	// 	},
	// 	async (args) => {
	// 		const { selector, timeout = 20 } = args;
	// 		const retryCount = Math.floor((timeout * 1000) / 100); // 100ms intervals
	// 		const element = await app.code.waitForElement(selector, undefined, retryCount);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Element found: ${selector} (${!!element ? 'success' : 'not found'})`
	// 			}]
	// 		};
	// 	}
	// );

	// Defer to Playwright's tool
	// server.tool(
	// 	'vscode_automation_click_element',
	// 	'Click on a UI element - prefer using specific workbench methods when available',
	// 	{
	// 		selector: z.string().describe('CSS selector for the element to click'),
	// 		xOffset: z.number().optional().describe('Optional X offset from element center'),
	// 		yOffset: z.number().optional().describe('Optional Y offset from element center')
	// 	},
	// 	async (args) => {
	// 		const { selector, xOffset, yOffset } = args;
	// 		await app.code.waitAndClick(selector, xOffset, yOffset);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Clicked element: ${selector}${xOffset !== undefined ? ` (offset: ${xOffset}, ${yOffset})` : ''}`
	// 			}]
	// 		};
	// 	}
	// );

	// Defer to Playwright's tool
	// server.tool(
	// 	'vscode_automation_send_keybinding',
	// 	'Send a keybinding to VS Code (e.g., ctrl+shift+p, cmd+s)',
	// 	{
	// 		keybinding: z.string().describe('The keybinding to send (e.g., ctrl+shift+p, cmd+s, escape)'),
	// 		waitSelector: z.string().optional().describe('Optional CSS selector to wait for after sending the keybinding')
	// 	},
	// 	async (args) => {
	// 		const { keybinding, waitSelector } = args;
	// 		await app.code.dispatchKeybinding(keybinding, async () => {
	// 			if (waitSelector) {
	// 				await app.code.waitForElement(waitSelector);
	// 			}
	// 		});
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Sent keybinding: ${keybinding}${waitSelector ? ` (waited for: ${waitSelector})` : ''}`
	// 			}]
	// 		};
	// 	}
	// );

	// Defer to Playwright's tool
	// server.tool(
	// 	'vscode_automation_get_text_content',
	// 	'Get text content from a UI element using CSS selector',
	// 	{
	// 		selector: z.string().describe('CSS selector for the element'),
	// 		expectedText: z.string().optional().describe('Optional expected text to wait for')
	// 	},
	// 	async (args) => {
	// 		const { selector, expectedText } = args;
	// 		const text = await app.code.waitForTextContent(selector, expectedText);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Text content from ${selector}: "${text}"`
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
