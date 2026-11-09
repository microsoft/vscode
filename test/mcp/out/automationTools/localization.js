"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyLocalizationTools = applyLocalizationTools;
/**
 * Localization Tools
 */
function applyLocalizationTools(server, appService) {
    const tools = [];
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
//# sourceMappingURL=localization.js.map