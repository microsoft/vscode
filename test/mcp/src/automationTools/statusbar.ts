/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Application } from '../../../automation';
import { z } from 'zod';

/**
 * Status Bar Tools
 */
export function applyStatusBarTools(server: McpServer, app: Application) {
	server.tool(
		'vscode_automation_statusbar_wait_for_element',
		'Wait for a specific status bar element to appear',
		{
			element: z.enum([
				'BRANCH_STATUS',
				'SYNC_STATUS',
				'PROBLEMS_STATUS',
				'SELECTION_STATUS',
				'INDENTATION_STATUS',
				'ENCODING_STATUS',
				'EOL_STATUS',
				'LANGUAGE_STATUS'
			]).describe('Status bar element to wait for')
		},
		async (args) => {
			const { element } = args;
			// Map string to enum value
			const elementMap: Record<string, number> = {
				'BRANCH_STATUS': 0,
				'SYNC_STATUS': 1,
				'PROBLEMS_STATUS': 2,
				'SELECTION_STATUS': 3,
				'INDENTATION_STATUS': 4,
				'ENCODING_STATUS': 5,
				'EOL_STATUS': 6,
				'LANGUAGE_STATUS': 7
			};

			await app.workbench.statusbar.waitForStatusbarElement(elementMap[element]);
			return {
				content: [{
					type: 'text' as const,
					text: `Status bar element found: ${element}`
				}]
			};
		}
	);

	server.tool(
		'vscode_automation_statusbar_click',
		'Click on a specific status bar element',
		{
			element: z.enum([
				'BRANCH_STATUS',
				'SYNC_STATUS',
				'PROBLEMS_STATUS',
				'SELECTION_STATUS',
				'INDENTATION_STATUS',
				'ENCODING_STATUS',
				'EOL_STATUS',
				'LANGUAGE_STATUS'
			]).describe('Status bar element to click')
		},
		async (args) => {
			const { element } = args;
			// Map string to enum value
			const elementMap: Record<string, number> = {
				'BRANCH_STATUS': 0,
				'SYNC_STATUS': 1,
				'PROBLEMS_STATUS': 2,
				'SELECTION_STATUS': 3,
				'INDENTATION_STATUS': 4,
				'ENCODING_STATUS': 5,
				'EOL_STATUS': 6,
				'LANGUAGE_STATUS': 7
			};

			await app.workbench.statusbar.clickOn(elementMap[element]);
			return {
				content: [{
					type: 'text' as const,
					text: `Clicked status bar element: ${element}`
				}]
			};
		}
	);

	server.tool(
		'vscode_automation_statusbar_wait_for_eol',
		'Wait for a specific End of Line (EOL) type in the status bar',
		{
			eol: z.string().describe('EOL type to wait for (e.g., "LF", "CRLF")')
		},
		async (args) => {
			const { eol } = args;
			const result = await app.workbench.statusbar.waitForEOL(eol);
			return {
				content: [{
					type: 'text' as const,
					text: `EOL status found: ${result}`
				}]
			};
		}
	);

	server.tool(
		'vscode_automation_statusbar_wait_for_text',
		'Wait for specific text to appear in a status bar element',
		{
			title: z.string().describe('Title/identifier of the status bar element'),
			text: z.string().describe('Text to wait for in the status bar element')
		},
		async (args) => {
			const { title, text } = args;
			await app.workbench.statusbar.waitForStatusbarText(title, text);
			return {
				content: [{
					type: 'text' as const,
					text: `Status bar text found - ${title}: "${text}"`
				}]
			};
		}
	);
}
