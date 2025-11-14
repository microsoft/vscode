/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Settings Editor Tools
 */
export function applySettingsTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	// I don't think we need this and the batch version
	// server.tool(
	// 	'vscode_automation_settings_add_user_setting',
	// 	'Add a single user setting key-value pair',
	// 	{
	// 		setting: z.string().describe('Setting key (e.g., "editor.fontSize")'),
	// 		value: z.string().describe('Setting value (as JSON string)')
	// 	},
	// 	async (args) => {
	// 		const { setting, value } = args;
	// 		await app.workbench.settingsEditor.addUserSetting(setting, value);
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Added user setting: ${setting} = ${value}`
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_settings_add_user_settings',
		'Add multiple user settings at once',
		{
			settings: z.array(z.array(z.string()).length(2)).describe('Array of [key, value] setting pairs')
		},
		async (args) => {
			const { settings } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.settingsEditor.addUserSettings(settings as [string, string][]);
			return {
				content: [{
					type: 'text' as const,
					text: `Added ${settings.length} user settings: ${settings.map(([k, v]) => `${k}=${v}`).join(', ')}`
				}]
			};
		}
	));

	tools.push(server.tool(
		'vscode_automation_settings_clear_user_settings',
		'Clear all user settings',
		async () => {
			const app = await appService.getOrCreateApplication();
			await app.workbench.settingsEditor.clearUserSettings();
			return {
				content: [{
					type: 'text' as const,
					text: 'Cleared all user settings'
				}]
			};
		}
	));

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_settings_open_user_file',
	// 	'Open the user settings JSON file',
	// 	async () => {
	// 		await app.workbench.settingsEditor.openUserSettingsFile();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Opened user settings file'
	// 			}]
	// 		};
	// 	}
	// );

	// Playwright can probably figure this one out
	// server.tool(
	// 	'vscode_automation_settings_open_user_ui',
	// 	'Open the user settings UI',
	// 	async () => {
	// 		await app.workbench.settingsEditor.openUserSettingsUI();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: 'Opened user settings UI'
	// 			}]
	// 		};
	// 	}
	// );

	tools.push(server.tool(
		'vscode_automation_settings_search_ui',
		'Search for settings in the settings UI',
		{
			query: z.string().describe('Search query for settings')
		},
		async (args) => {
			const { query } = args;
			const app = await appService.getOrCreateApplication();
			await app.workbench.settingsEditor.searchSettingsUI(query);
			return {
				content: [{
					type: 'text' as const,
					text: `Searched settings UI for: "${query}"`
				}]
			};
		}
	));

	return tools;
}
