/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Application } from '../../../automation';

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

/**
 * Apply all VS Code automation tools to the MCP server
 * @param server - The MCP server instance
 * @param app - The VS Code application instance
 */
export function applyAllTools(server: McpServer, app: Application): void {
	// Core Application Management Tools
	applyCoreTools(server, app);

	// Editor Management Tools
	applyEditorTools(server, app);

	// Terminal Management Tools
	applyTerminalTools(server, app);

	// Debug Tools
	applyDebugTools(server, app);

	// Search Tools
	applySearchTools(server, app);

	// Extensions Tools
	applyExtensionsTools(server, app);

	// Command Palette and Quick Access Tools
	applyQuickAccessTools(server, app);

	// Explorer and File Management Tools
	applyExplorerTools(server, app);

	// Activity Bar Tools
	applyActivityBarTools(server, app);

	// Source Control Management Tools
	applySCMTools(server, app);

	// Status Bar Tools
	applyStatusBarTools(server, app);

	// Problems Panel Tools
	applyProblemsTools(server, app);

	// Settings Editor Tools
	applySettingsTools(server, app);

	// Keybindings Editor Tools
	applyKeybindingsTools(server, app);

	// Notebook Tools
	applyNotebookTools(server, app);

	// Localization Tools
	applyLocalizationTools(server, app);

	// Task Tools
	applyTaskTools(server, app);

	// Profiler Tools
	applyProfilerTools(server, app);
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
	applyProfilerTools
};
