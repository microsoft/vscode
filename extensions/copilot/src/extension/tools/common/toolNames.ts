/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cloneAndChange } from '../../../util/vs/base/common/objects';

/**
 * Categories for tool grouping in the virtual tools system
 */
export enum ToolCategory {
	JupyterNotebook = 'Jupyter Notebook Tools',
	WebInteraction = 'Web Interaction',
	VSCodeInteraction = 'VS Code Interaction',
	Testing = 'Testing',
	RedundantButSpecific = 'Redundant but Specific',
	// Core tools that should not be grouped
	Core = 'Core'
}

export enum ToolName {
	ApplyPatch = 'apply_patch',
	Codebase = 'semantic_search',
	VSCodeAPI = 'get_vscode_api',
	FindFiles = 'file_search',
	FindTextInFiles = 'grep_search',
	ReadFile = 'read_file',
	ViewImage = 'view_image',
	ListDirectory = 'list_dir',
	GetErrors = 'get_errors',
	GetScmChanges = 'get_changed_files',
	ReadProjectStructure = 'read_project_structure',
	CreateNewWorkspace = 'create_new_workspace',
	CreateNewJupyterNotebook = 'create_new_jupyter_notebook',
	SearchWorkspaceSymbols = 'search_workspace_symbols',
	EditFile = 'insert_edit_into_file',
	CreateFile = 'create_file',
	ReplaceString = 'replace_string_in_file',
	MultiReplaceString = 'multi_replace_string_in_file',
	EditNotebook = 'edit_notebook_file',
	RunNotebookCell = 'run_notebook_cell',
	GetNotebookSummary = 'copilot_getNotebookSummary',
	ReadCellOutput = 'read_notebook_cell_output',
	InstallExtension = 'install_extension',
	FetchWebPage = 'fetch_webpage',
	Memory = 'memory',
	FindTestFiles = 'test_search',
	GetProjectSetupInfo = 'get_project_setup_info',
	SearchViewResults = 'get_search_view_results',
	GithubRepo = 'github_repo',
	CreateDirectory = 'create_directory',
	RunVscodeCmd = 'run_vscode_command',
	CoreManageTodoList = 'manage_todo_list',
	CoreRunInTerminal = 'run_in_terminal',
	CoreGetTerminalOutput = 'get_terminal_output',
	CoreSendToTerminal = 'send_to_terminal',
	CoreKillTerminal = 'kill_terminal',
	CoreTerminalSelection = 'terminal_selection',
	CoreTerminalLastCommand = 'terminal_last_command',
	CoreCreateAndRunTask = 'create_and_run_task',
	CoreRunTask = 'run_task',
	CoreGetTaskOutput = 'get_task_output',
	CoreRunTest = 'runTests',
	CoreTestFailure = 'testFailure',
	EditFilesPlaceholder = 'edit_files',
	CoreRunSubagent = 'runSubagent',
	CoreConfirmationTool = 'vscode_get_confirmation',
	CoreConfirmationToolWithOptions = 'vscode_get_confirmation_with_options',
	CoreTerminalConfirmationTool = 'vscode_get_terminal_confirmation',
	SearchSubagent = 'search_subagent',
	CoreAskQuestions = 'vscode_askQuestions',
	SwitchAgent = 'switch_agent',
	ToolSearch = 'tool_search',
	ResolveMemoryFileUri = 'resolve_memory_file_uri',
	ExecutionSubagent = 'execution_subagent',
	SessionStoreSql = 'session_store_sql',
	CoreOpenBrowserPage = 'open_browser_page',
	CoreClickElement = 'click_element',
	CoreScreenshotPage = 'screenshot_page',
	CoreNavigatePage = 'navigate_page',
	CoreReadPage = 'read_page',
	CoreHoverElement = 'hover_element',
	CoreDragElement = 'drag_element',
	CoreTypeInPage = 'type_in_page',
	CoreHandleDialog = 'handle_dialog',
	CoreRunPlaywrightCode = 'run_playwright_code',
}

/**
 * Agentic browser tool IDs that are NOT the open_browser_page tool.
 */
export const agenticBrowserTools = [
	ToolName.CoreClickElement,
	ToolName.CoreScreenshotPage,
	ToolName.CoreNavigatePage,
	ToolName.CoreReadPage,
	ToolName.CoreHoverElement,
	ToolName.CoreDragElement,
	ToolName.CoreTypeInPage,
	ToolName.CoreHandleDialog,
	ToolName.CoreRunPlaywrightCode,
] as const;

export enum ContributedToolName {
	ApplyPatch = 'copilot_applyPatch',
	Codebase = 'copilot_searchCodebase',
	SearchWorkspaceSymbols = 'copilot_searchWorkspaceSymbols',
	VSCodeAPI = 'copilot_getVSCodeAPI',
	/** @deprecated moving to core soon */
	RunTests = 'copilot_runTests1',
	FindFiles = 'copilot_findFiles',
	FindTextInFiles = 'copilot_findTextInFiles',
	ReadFile = 'copilot_readFile',
	ViewImage = 'copilot_viewImage',
	ListDirectory = 'copilot_listDirectory',
	GetErrors = 'copilot_getErrors',
	GetScmChanges = 'copilot_getChangedFiles',
	ReadProjectStructure = 'copilot_readProjectStructure',
	CreateNewWorkspace = 'copilot_createNewWorkspace',
	CreateNewJupyterNotebook = 'copilot_createNewJupyterNotebook',
	EditFile = 'copilot_insertEdit',
	CreateFile = 'copilot_createFile',
	ReplaceString = 'copilot_replaceString',
	MultiReplaceString = 'copilot_multiReplaceString',
	EditNotebook = 'copilot_editNotebook',
	RunNotebookCell = 'copilot_runNotebookCell',
	GetNotebookSummary = 'copilot_getNotebookSummary',
	ReadCellOutput = 'copilot_readNotebookCellOutput',
	InstallExtension = 'copilot_installExtension',
	FetchWebPage = 'copilot_fetchWebPage',
	Memory = 'copilot_memory',
	FindTestFiles = 'copilot_findTestFiles',
	GetProjectSetupInfo = 'copilot_getProjectSetupInfo',
	SearchViewResults = 'copilot_getSearchResults',
	GithubRepo = 'copilot_githubRepo',
	CreateAndRunTask = 'copilot_createAndRunTask',
	CreateDirectory = 'copilot_createDirectory',
	RunVscodeCmd = 'copilot_runVscodeCommand',
	EditFilesPlaceholder = 'copilot_editFiles',
	SwitchAgent = 'copilot_switchAgent',
	ResolveMemoryFileUri = 'copilot_resolveMemoryFileUri',
	SessionStoreSql = 'copilot_sessionStoreSql',
}

export const byokEditToolNamesToToolNames = {
	'find-replace': ToolName.ReplaceString,
	'multi-find-replace': ToolName.MultiReplaceString,
	'apply-patch': ToolName.ApplyPatch,
	'code-rewrite': ToolName.EditFile,
} as const;

const toolNameToContributedToolNames = new Map<ToolName, ContributedToolName>();
const contributedToolNameToToolNames = new Map<ContributedToolName, ToolName>();
for (const [contributedNameKey, contributedName] of Object.entries(ContributedToolName)) {
	const toolName = ToolName[contributedNameKey as keyof typeof ToolName];
	if (toolName) {
		toolNameToContributedToolNames.set(toolName, contributedName);
		contributedToolNameToToolNames.set(contributedName, toolName);
	}
}

export function getContributedToolName(name: string | ToolName): string | ContributedToolName {
	return toolNameToContributedToolNames.get(name as ToolName) ?? name;
}

export function getToolName(name: string | ContributedToolName): string | ToolName {
	return contributedToolNameToToolNames.get(name as ContributedToolName) ?? name;
}

export function mapContributedToolNamesInString(str: string): string {
	contributedToolNameToToolNames.forEach((value, key) => {
		const re = new RegExp(`\\b${key}\\b`, 'g');
		str = str.replace(re, value);
	});
	return str;
}

export function mapContributedToolNamesInSchema(inputSchema: object): object {
	return cloneAndChange(inputSchema, value => typeof value === 'string' ? mapContributedToolNamesInString(value) : undefined);
}

/**
 * Type-safe mapping of all ToolName enum values to their categories.
 * This ensures that every tool is properly categorized and provides compile-time safety.
 * When new tools are added to ToolName, they must be added here or TypeScript will error.
 */
export const toolCategories: Record<ToolName, ToolCategory> = {
	// Core tools (not grouped - expanded by default)
	[ToolName.Codebase]: ToolCategory.Core,
	[ToolName.FindTextInFiles]: ToolCategory.Core,
	[ToolName.ReadFile]: ToolCategory.Core,
	[ToolName.ViewImage]: ToolCategory.Core,
	[ToolName.CreateFile]: ToolCategory.Core,
	[ToolName.ApplyPatch]: ToolCategory.Core,
	[ToolName.ReplaceString]: ToolCategory.Core,
	[ToolName.EditFile]: ToolCategory.Core,
	[ToolName.CoreRunInTerminal]: ToolCategory.Core,
	[ToolName.ListDirectory]: ToolCategory.Core,
	[ToolName.CoreGetTerminalOutput]: ToolCategory.Core,
	[ToolName.CoreSendToTerminal]: ToolCategory.Core,
	[ToolName.CoreKillTerminal]: ToolCategory.Core,
	[ToolName.CoreManageTodoList]: ToolCategory.Core,
	[ToolName.MultiReplaceString]: ToolCategory.Core,
	[ToolName.FindFiles]: ToolCategory.Core,
	[ToolName.CreateDirectory]: ToolCategory.Core,
	[ToolName.ReadProjectStructure]: ToolCategory.Core,
	[ToolName.CoreRunSubagent]: ToolCategory.Core,
	[ToolName.SearchSubagent]: ToolCategory.Core,
	[ToolName.ExecutionSubagent]: ToolCategory.Core,

	// already enabled only when tasks are enabled
	[ToolName.CoreRunTask]: ToolCategory.Core,
	[ToolName.CoreGetTaskOutput]: ToolCategory.Core,
	// never enabled, so it doesn't matter where it's categorized
	[ToolName.EditFilesPlaceholder]: ToolCategory.Core,

	// Jupyter Notebook Tools
	[ToolName.CreateNewJupyterNotebook]: ToolCategory.JupyterNotebook,
	[ToolName.EditNotebook]: ToolCategory.JupyterNotebook,
	[ToolName.RunNotebookCell]: ToolCategory.JupyterNotebook,
	[ToolName.GetNotebookSummary]: ToolCategory.JupyterNotebook,
	[ToolName.ReadCellOutput]: ToolCategory.JupyterNotebook,

	// Web Interaction
	[ToolName.FetchWebPage]: ToolCategory.WebInteraction,
	[ToolName.GithubRepo]: ToolCategory.WebInteraction,
	[ToolName.CoreOpenBrowserPage]: ToolCategory.WebInteraction,
	[ToolName.CoreClickElement]: ToolCategory.WebInteraction,
	[ToolName.CoreScreenshotPage]: ToolCategory.WebInteraction,
	[ToolName.CoreNavigatePage]: ToolCategory.WebInteraction,
	[ToolName.CoreReadPage]: ToolCategory.WebInteraction,
	[ToolName.CoreHoverElement]: ToolCategory.WebInteraction,
	[ToolName.CoreDragElement]: ToolCategory.WebInteraction,
	[ToolName.CoreTypeInPage]: ToolCategory.WebInteraction,
	[ToolName.CoreHandleDialog]: ToolCategory.WebInteraction,
	[ToolName.CoreRunPlaywrightCode]: ToolCategory.WebInteraction,

	// VS Code Interaction
	[ToolName.SearchWorkspaceSymbols]: ToolCategory.VSCodeInteraction,
	[ToolName.GetErrors]: ToolCategory.VSCodeInteraction,
	[ToolName.VSCodeAPI]: ToolCategory.VSCodeInteraction,
	[ToolName.GetScmChanges]: ToolCategory.VSCodeInteraction,
	[ToolName.CreateNewWorkspace]: ToolCategory.VSCodeInteraction,
	[ToolName.InstallExtension]: ToolCategory.VSCodeInteraction,
	[ToolName.GetProjectSetupInfo]: ToolCategory.VSCodeInteraction,
	[ToolName.CoreCreateAndRunTask]: ToolCategory.VSCodeInteraction,
	[ToolName.RunVscodeCmd]: ToolCategory.VSCodeInteraction,
	[ToolName.SearchViewResults]: ToolCategory.VSCodeInteraction,
	[ToolName.CoreTerminalSelection]: ToolCategory.VSCodeInteraction,
	[ToolName.CoreTerminalLastCommand]: ToolCategory.VSCodeInteraction,

	// Testing
	[ToolName.FindTestFiles]: ToolCategory.Testing,
	[ToolName.CoreRunTest]: ToolCategory.Testing,
	[ToolName.CoreTestFailure]: ToolCategory.Testing,

	// Other tools - categorize appropriately
	[ToolName.CoreConfirmationTool]: ToolCategory.VSCodeInteraction,
	[ToolName.CoreConfirmationToolWithOptions]: ToolCategory.VSCodeInteraction,
	[ToolName.CoreTerminalConfirmationTool]: ToolCategory.VSCodeInteraction,
	[ToolName.CoreAskQuestions]: ToolCategory.VSCodeInteraction,
	[ToolName.SwitchAgent]: ToolCategory.VSCodeInteraction,
	[ToolName.Memory]: ToolCategory.VSCodeInteraction,
	[ToolName.ToolSearch]: ToolCategory.Core,
	[ToolName.ResolveMemoryFileUri]: ToolCategory.Core,
	[ToolName.SessionStoreSql]: ToolCategory.Core,
} as const;



/**
 * Get the category for a tool, checking both ToolName enum and external tools.
 */
export function getToolCategory(toolName: string): ToolCategory | undefined {
	return toolCategories.hasOwnProperty(toolName) ? toolCategories[toolName as ToolName] : undefined;
}

/**
 * Get all tools for a specific category.
 */
export function getToolsForCategory(category: ToolCategory): string[] {
	const result: string[] = [];

	// Add tools from ToolName enum
	for (const [toolName, toolCategory] of Object.entries(toolCategories)) {
		if (toolCategory === category) {
			result.push(toolName);
		}
	}

	return result;
}
