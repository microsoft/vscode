/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Notebook Tools
 */
export function applyNotebookTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	tools.push(server.tool(
		'vscode_automation_notebook_open',
		'Open a notebook',
		async () => {
			const app = await appService.getOrCreateApplication();
			await app.workbench.notebook.openNotebook();
			return {
				content: [{
					type: 'text' as const,
					text: 'Opened notebook'
				}]
			};
		}
	));

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_notebook_focus_next_cell',
	// 	'Focus the next cell in the notebook',
	// 	async () => {
	// 		await app.workbench.notebook.focusNextCell();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Focused next cell'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_notebook_focus_first_cell',
	// 	'Focus the first cell in the notebook',
	// 	async () => {
	// 		await app.workbench.notebook.focusFirstCell();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Focused first cell'
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_notebook_edit_cell',
		'Enter edit mode for the current cell',
		async () => {
			const app = await appService.getOrCreateApplication();
			await app.workbench.notebook.editCell();
			return {
				content: [{
					type: 'text' as const,
					text: 'Entered cell edit mode'
				}]
			};
		}
	));

	// Seems too niche
	// server.tool(
	// 	'vscode_automation_notebook_stop_editing_cell',
	// 	'Exit edit mode for the current cell',
	// 	async () => {
	// 		await app.workbench.notebook.stopEditingCell();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Exited cell edit mode'
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_notebook_type_in_editor',
		'Type text in the notebook cell editor',
		{
			text: z.string().describe('Text to type in the cell editor')
		},
		async (args) => {
			const { text } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.notebook.waitForTypeInEditor(text);
			return {
				content: [{
					type: 'text' as const,
					text: `Typed in notebook cell: "${text}"`
				}]
			};
		}
	));

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_notebook_wait_for_cell_contents',
	// 	'Wait for specific contents in the active cell editor',
	// 	{
	// 		contents: z.string().describe('Expected contents in the active cell')
	// 	},
	// 	async (args) => {
	// 		const { contents } = args;
	// 		await app.workbench.notebook.waitForActiveCellEditorContents(contents);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Active cell contains expected contents: "${contents}"`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_notebook_wait_for_markdown_contents',
	// 	'Wait for specific text in markdown cell output',
	// 	{
	// 		markdownSelector: z.string().describe('CSS selector for the markdown element'),
	// 		text: z.string().describe('Expected text in the markdown output')
	// 	},
	// 	async (args) => {
	// 		const { markdownSelector, text } = args;
	// 		await app.workbench.notebook.waitForMarkdownContents(markdownSelector, text);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Markdown content found: "${text}" in ${markdownSelector}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_notebook_insert_cell',
	// 	'Insert a new cell of specified type',
	// 	{
	// 		kind: z.enum(['markdown', 'code']).describe('Type of cell to insert')
	// 	},
	// 	async (args) => {
	// 		const { kind } = args;
	// 		await app.workbench.notebook.insertNotebookCell(kind);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Inserted ${kind} cell`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_notebook_delete_active_cell',
	// 	'Delete the currently active cell',
	// 	async () => {
	// 		await app.workbench.notebook.deleteActiveCell();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Deleted active cell'
	// 			}]
	// 		};
	// 	}
	// );

	// Seems too niche
	// server.tool(
	// 	'vscode_automation_notebook_focus_in_cell_output',
	// 	'Focus inside cell output area',
	// 	async () => {
	// 		await app.workbench.notebook.focusInCellOutput();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Focused in cell output'
	// 			}]
	// 		};
	// 	}
	// );

	// Seems too niche
	// server.tool(
	// 	'vscode_automation_notebook_focus_out_cell_output',
	// 	'Focus outside cell output area',
	// 	async () => {
	// 		await app.workbench.notebook.focusOutCellOutput();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Focused out of cell output'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_notebook_execute_active_cell',
	// 	'Execute the currently active cell',
	// 	async () => {
	// 		await app.workbench.notebook.executeActiveCell();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Executed active cell'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_notebook_execute_cell_action',
	// 	'Execute a specific cell action using CSS selector',
	// 	{
	// 		selector: z.string().describe('CSS selector for the cell action to execute')
	// 	},
	// 	async (args) => {
	// 		const { selector } = args;
	// 		await app.workbench.notebook.executeCellAction(selector);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Executed cell action: ${selector}`
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
