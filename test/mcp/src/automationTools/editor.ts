/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Editor Management Tools
 */
export function applyEditorTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];
	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_editor_open_file',
	// 	'Open a file in the VS Code editor through quick open',
	// 	{
	// 		fileName: z.string().describe('Name of the file to open (partial names work)')
	// 	},
	// 	async (args) => {
	// 		const { fileName } = args;
	// 		await app.workbench.quickaccess.openFileQuickAccessAndWait(fileName, fileName);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Opened file: ${fileName}`
	// 			}]
	// 		};
	// 	}
	// );

	// This one is critical as Playwright had trouble typing in monaco
	tools.push(server.tool(
		'vscode_automation_editor_type_text',
		'Type text in the currently active editor',
		{
			text: z.string().describe('The text to type'),
			filename: z.string().describe('Filename to target specific editor')
		},
		async (args) => {
			const { text, filename } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.editor.waitForTypeInEditor(filename, text);
			return {
				content: [{
					type: 'text' as const,
					text: `Typed text: "${text}"`
				}]
			};
		}
	));

	// Doesn't seem particularly useful
	// server.tool(
	// 	'vscode_automation_editor_get_selection',
	// 	'Get the current selection in the editor',
	// 	{
	// 		filename: z.string().describe('Filename to target specific editor')
	// 	},
	// 	async (args) => {
	// 		const { filename } = args;
	// 		return new Promise((resolve, reject) => {
	// 			const selectionHandler = (selection: { selectionStart: number; selectionEnd: number }) => {
	// 				resolve({
	// 					content: [{
	// 						type: 'text' as const,
	// 						text: `Selection: start=${selection.selectionStart}, end=${selection.selectionEnd}`
	// 					}]
	// 				});
	// 				return true;
	// 			};

	// 			app.workbench.editor.waitForEditorSelection(filename, selectionHandler).catch(reject);
	// 		});
	// 	}
	// );

	// Doesn't seem particularly useful
	// server.tool(
	// 	'vscode_automation_editor_go_to_definition',
	// 	'Go to definition of symbol at current cursor position',
	// 	{
	// 		filename: z.string().describe('File containing the symbol'),
	// 		term: z.string().describe('The symbol/term to go to definition for'),
	// 		line: z.number().describe('Line number where the symbol is located')
	// 	},
	// 	async (args) => {
	// 		const { filename, term, line } = args;
	// 		await app.workbench.editor.gotoDefinition(filename, term, line);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Navigated to definition of "${term}" in ${filename} at line ${line}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_editor_peek_definition',
	// 	'Peek definition of symbol at current cursor position',
	// 	{
	// 		filename: z.string().describe('File containing the symbol'),
	// 		term: z.string().describe('The symbol/term to peek definition for'),
	// 		line: z.number().describe('Line number where the symbol is located')
	// 	},
	// 	async (args) => {
	// 		const { filename, term, line } = args;
	// 		await app.workbench.editor.peekDefinition(filename, term, line);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Peeked definition of "${term}" in ${filename} at line ${line}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_editor_rename_symbol',
	// 	'Rename a symbol in the editor',
	// 	{
	// 		filename: z.string().describe('File containing the symbol'),
	// 		line: z.number().describe('Line number where the symbol is located'),
	// 		oldName: z.string().describe('Current name of the symbol'),
	// 		newName: z.string().describe('New name for the symbol')
	// 	},
	// 	async (args) => {
	// 		const { filename, line, oldName, newName } = args;
	// 		await app.workbench.editor.rename(filename, line, oldName, newName);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Renamed "${oldName}" to "${newName}" in ${filename} at line ${line}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_editor_find_references',
	// 	'Find all references to a symbol',
	// 	{
	// 		filename: z.string().describe('File containing the symbol'),
	// 		term: z.string().describe('The symbol/term to find references for'),
	// 		line: z.number().describe('Line number where the symbol is located')
	// 	},
	// 	async (args) => {
	// 		const { filename, term, line } = args;
	// 		await app.workbench.editor.findReferences(filename, term, line);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Found references for "${term}" in ${filename} at line ${line}`
	// 			}]
	// 		};
	// 	}
	// );

	// Editor File Management Tools
	tools.push(server.tool(
		'vscode_automation_editor_new_untitled_file',
		'Create a new untitled file',
		async () => {
			const app = await appService.getOrCreateApplication();
			await app.workbench.editors.newUntitledFile();
			return {
				content: [{
					type: 'text' as const,
					text: 'Created new untitled file'
				}]
			};
		}
	));

	tools.push(server.tool(
		'vscode_automation_editor_save_file',
		'Save the currently active file',
		async () => {
			const app = await appService.getOrCreateApplication();
			await app.workbench.editors.saveOpenedFile();
			return {
				content: [{
					type: 'text' as const,
					text: 'Saved active file'
				}]
			};
		}
	));

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_editor_select_tab',
	// 	'Select a specific tab by filename',
	// 	{
	// 		fileName: z.string().describe('Name of the file tab to select')
	// 	},
	// 	async (args) => {
	// 		const { fileName } = args;
	// 		await app.workbench.editors.selectTab(fileName);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Selected tab: ${fileName}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_editor_wait_for_tab',
	// 	'Wait for a specific tab to appear',
	// 	{
	// 		fileName: z.string().describe('Name of the file tab to wait for'),
	// 		isDirty: z.boolean().optional().describe('Whether to wait for the tab to be dirty (unsaved)')
	// 	},
	// 	async (args) => {
	// 		const { fileName, isDirty = false } = args;
	// 		await app.workbench.editors.waitForTab(fileName, isDirty);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Tab appeared: ${fileName}${isDirty ? ' (dirty)' : ''}`
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this out
	// server.tool(
	// 	'vscode_automation_editor_wait_for_focus',
	// 	'Wait for an editor to have focus',
	// 	{
	// 		fileName: z.string().describe('Name of the file to wait for focus'),
	// 		retryCount: z.number().optional().describe('Number of retries')
	// 	},
	// 	async (args) => {
	// 		const { fileName, retryCount } = args;
	// 		await app.workbench.editors.waitForEditorFocus(fileName, retryCount);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Editor has focus: ${fileName}`
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
