/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

// Import all tool modules
import { applyCoreTools } from './core.js';
import { applyEditorTools } from './editor.js';
import { applyTerminalTools } from './terminal.js';
import { applyDebugTools } from './debug.js';
import { applySearchTools } from './search.js';
import { applyExtensionsTools } from './extensions.js';
import { applyQuickAccessTools } from './quickAccess.js';
import { applyExplorerTools } from './explorer.js';
import { applyActivityBarTools } from './activityBar.js';
import { applySCMTools } from './scm.js';
import { applyStatusBarTools } from './statusbar.js';
import { applyProblemsTools } from './problems.js';
import { applySettingsTools } from './settings.js';
import { applyKeybindingsTools } from './keybindings.js';
import { applyNotebookTools } from './notebook.js';
import { applyLocalizationTools } from './localization.js';
import { applyTaskTools } from './task.js';
import { applyProfilerTools } from './profiler.js';
import { applyChatTools } from './chat.js';
import { ApplicationService } from '../application';

/**
 * Apply all VS Code automation tools to the MCP server
 * @param server - The MCP server instance
 * @param appService - The application service instance
 * @returns The registered tools from the server
 */
export function applyAllTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	let tools: RegisteredTool[] = [];

	// Core Application Management Tools
	tools = tools.concat(applyCoreTools(server, appService));

	// Editor Management Tools
	tools = tools.concat(applyEditorTools(server, appService));

	// Terminal Management Tools
	tools = tools.concat(applyTerminalTools(server, appService));

	// Debug Tools
	tools = tools.concat(applyDebugTools(server, appService));

	// Search Tools
	tools = tools.concat(applySearchTools(server, appService));

	// Extensions Tools
	tools = tools.concat(applyExtensionsTools(server, appService));

	// Command Palette and Quick Access Tools
	tools = tools.concat(applyQuickAccessTools(server, appService));

	// Explorer and File Management Tools
	tools = tools.concat(applyExplorerTools(server, appService));

	// Activity Bar Tools
	tools = tools.concat(applyActivityBarTools(server, appService));

	// Source Control Management Tools
	tools = tools.concat(applySCMTools(server, appService));

	// Status Bar Tools
	tools = tools.concat(applyStatusBarTools(server, appService));

	// Problems Panel Tools
	tools = tools.concat(applyProblemsTools(server, appService));

	// Settings Editor Tools
	tools = tools.concat(applySettingsTools(server, appService));

	// Keybindings Editor Tools
	tools = tools.concat(applyKeybindingsTools(server, appService));

	// Notebook Tools
	tools = tools.concat(applyNotebookTools(server, appService));

	// Localization Tools
	tools = tools.concat(applyLocalizationTools(server, appService));

	// Task Tools
	tools = tools.concat(applyTaskTools(server, appService));

	// Profiler Tools
	tools = tools.concat(applyProfilerTools(server, appService));

	// Chat Tools
	tools = tools.concat(applyChatTools(server, appService));

	// Return all registered tools
	return tools;
}

// Re-export individual tool functions for selective use
export {
	applyCoreTools,
	applyEditorTools,
	applyTerminalTools,
	applyDebugTools,
	applySearchTools,
	applyExtensionsTools,
	applyQuickAccessTools,
	applyExplorerTools,
	applyActivityBarTools,
	applySCMTools,
	applyStatusBarTools,
	applyProblemsTools,
	applySettingsTools,
	applyKeybindingsTools,
	applyNotebookTools,
	applyLocalizationTools,
	applyTaskTools,
	applyProfilerTools,
	applyChatTools
};
