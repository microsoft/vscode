"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyExplorerTools = applyExplorerTools;
/**
 * Explorer and File Management Tools
 */
function applyExplorerTools(server, appService) {
    const tools = [];
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
    return tools;
}
//# sourceMappingURL=explorer.js.map