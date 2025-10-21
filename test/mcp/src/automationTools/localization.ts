/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';

/**
 * Localization Tools
 */
export function applyLocalizationTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	// Seems too niche
	// server.tool(
	// 	'vscode_automation_localization_get_locale_info',
	// 	'Get current locale information',
	// 	async () => {
	// 		const localeInfo = await app.workbench.localization.getLocaleInfo();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Locale info:\n${JSON.stringify(localeInfo, null, 2)}`
	// 			}]
	// 		};
	// 	}
	// );

	// Seems too niche
	// server.tool(
	// 	'vscode_automation_localization_get_localized_strings',
	// 	'Get all localized strings',
	// 	async () => {
	// 		const localizedStrings = await app.workbench.localization.getLocalizedStrings();
	// 		return {
	// 			content: [{
	// 				type: 'text' as const,
	// 				text: `Localized strings:\n${JSON.stringify(localizedStrings, null, 2)}`
	// 			}]
	// 		};
	// 	}
	// );

	return tools;
}
