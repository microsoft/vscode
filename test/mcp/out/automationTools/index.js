"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyWindowTools = exports.applyChatTools = exports.applyProfilerTools = exports.applyTaskTools = exports.applyLocalizationTools = exports.applyNotebookTools = exports.applyKeybindingsTools = exports.applySettingsTools = exports.applyProblemsTools = exports.applyStatusBarTools = exports.applySCMTools = exports.applyActivityBarTools = exports.applyExplorerTools = exports.applyQuickAccessTools = exports.applyExtensionsTools = exports.applySearchTools = exports.applyDebugTools = exports.applyTerminalTools = exports.applyEditorTools = exports.applyCoreTools = void 0;
exports.applyAllTools = applyAllTools;
// Import all tool modules
const core_js_1 = require("./core.js");
Object.defineProperty(exports, "applyCoreTools", { enumerable: true, get: function () { return core_js_1.applyCoreTools; } });
const editor_js_1 = require("./editor.js");
Object.defineProperty(exports, "applyEditorTools", { enumerable: true, get: function () { return editor_js_1.applyEditorTools; } });
const terminal_js_1 = require("./terminal.js");
Object.defineProperty(exports, "applyTerminalTools", { enumerable: true, get: function () { return terminal_js_1.applyTerminalTools; } });
const debug_js_1 = require("./debug.js");
Object.defineProperty(exports, "applyDebugTools", { enumerable: true, get: function () { return debug_js_1.applyDebugTools; } });
const search_js_1 = require("./search.js");
Object.defineProperty(exports, "applySearchTools", { enumerable: true, get: function () { return search_js_1.applySearchTools; } });
const extensions_js_1 = require("./extensions.js");
Object.defineProperty(exports, "applyExtensionsTools", { enumerable: true, get: function () { return extensions_js_1.applyExtensionsTools; } });
const quickAccess_js_1 = require("./quickAccess.js");
Object.defineProperty(exports, "applyQuickAccessTools", { enumerable: true, get: function () { return quickAccess_js_1.applyQuickAccessTools; } });
const explorer_js_1 = require("./explorer.js");
Object.defineProperty(exports, "applyExplorerTools", { enumerable: true, get: function () { return explorer_js_1.applyExplorerTools; } });
const activityBar_js_1 = require("./activityBar.js");
Object.defineProperty(exports, "applyActivityBarTools", { enumerable: true, get: function () { return activityBar_js_1.applyActivityBarTools; } });
const scm_js_1 = require("./scm.js");
Object.defineProperty(exports, "applySCMTools", { enumerable: true, get: function () { return scm_js_1.applySCMTools; } });
const statusbar_js_1 = require("./statusbar.js");
Object.defineProperty(exports, "applyStatusBarTools", { enumerable: true, get: function () { return statusbar_js_1.applyStatusBarTools; } });
const problems_js_1 = require("./problems.js");
Object.defineProperty(exports, "applyProblemsTools", { enumerable: true, get: function () { return problems_js_1.applyProblemsTools; } });
const settings_js_1 = require("./settings.js");
Object.defineProperty(exports, "applySettingsTools", { enumerable: true, get: function () { return settings_js_1.applySettingsTools; } });
const keybindings_js_1 = require("./keybindings.js");
Object.defineProperty(exports, "applyKeybindingsTools", { enumerable: true, get: function () { return keybindings_js_1.applyKeybindingsTools; } });
const notebook_js_1 = require("./notebook.js");
Object.defineProperty(exports, "applyNotebookTools", { enumerable: true, get: function () { return notebook_js_1.applyNotebookTools; } });
const localization_js_1 = require("./localization.js");
Object.defineProperty(exports, "applyLocalizationTools", { enumerable: true, get: function () { return localization_js_1.applyLocalizationTools; } });
const task_js_1 = require("./task.js");
Object.defineProperty(exports, "applyTaskTools", { enumerable: true, get: function () { return task_js_1.applyTaskTools; } });
const profiler_js_1 = require("./profiler.js");
Object.defineProperty(exports, "applyProfilerTools", { enumerable: true, get: function () { return profiler_js_1.applyProfilerTools; } });
const chat_js_1 = require("./chat.js");
Object.defineProperty(exports, "applyChatTools", { enumerable: true, get: function () { return chat_js_1.applyChatTools; } });
const windows_js_1 = require("./windows.js");
Object.defineProperty(exports, "applyWindowTools", { enumerable: true, get: function () { return windows_js_1.applyWindowTools; } });
/**
 * Apply all VS Code automation tools to the MCP server
 * @param server - The MCP server instance
 * @param appService - The application service instance
 * @returns The registered tools from the server
 */
function applyAllTools(server, appService) {
    let tools = [];
    // Core Application Management Tools
    tools = tools.concat((0, core_js_1.applyCoreTools)(server, appService));
    // Editor Management Tools
    tools = tools.concat((0, editor_js_1.applyEditorTools)(server, appService));
    // Terminal Management Tools
    tools = tools.concat((0, terminal_js_1.applyTerminalTools)(server, appService));
    // Debug Tools
    tools = tools.concat((0, debug_js_1.applyDebugTools)(server, appService));
    // Search Tools
    tools = tools.concat((0, search_js_1.applySearchTools)(server, appService));
    // Extensions Tools
    tools = tools.concat((0, extensions_js_1.applyExtensionsTools)(server, appService));
    // Command Palette and Quick Access Tools
    tools = tools.concat((0, quickAccess_js_1.applyQuickAccessTools)(server, appService));
    // Explorer and File Management Tools
    tools = tools.concat((0, explorer_js_1.applyExplorerTools)(server, appService));
    // Activity Bar Tools
    tools = tools.concat((0, activityBar_js_1.applyActivityBarTools)(server, appService));
    // Source Control Management Tools
    tools = tools.concat((0, scm_js_1.applySCMTools)(server, appService));
    // Status Bar Tools
    tools = tools.concat((0, statusbar_js_1.applyStatusBarTools)(server, appService));
    // Problems Panel Tools
    tools = tools.concat((0, problems_js_1.applyProblemsTools)(server, appService));
    // Settings Editor Tools
    tools = tools.concat((0, settings_js_1.applySettingsTools)(server, appService));
    // Keybindings Editor Tools
    tools = tools.concat((0, keybindings_js_1.applyKeybindingsTools)(server, appService));
    // Notebook Tools
    tools = tools.concat((0, notebook_js_1.applyNotebookTools)(server, appService));
    // Localization Tools
    tools = tools.concat((0, localization_js_1.applyLocalizationTools)(server, appService));
    // Task Tools
    tools = tools.concat((0, task_js_1.applyTaskTools)(server, appService));
    // Profiler Tools
    tools = tools.concat((0, profiler_js_1.applyProfilerTools)(server, appService));
    // Chat Tools
    tools = tools.concat((0, chat_js_1.applyChatTools)(server, appService));
    // Window Management Tools (for multi-window support)
    tools = tools.concat((0, windows_js_1.applyWindowTools)(server, appService));
    // Return all registered tools
    return tools;
}
//# sourceMappingURL=index.js.map