/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IPromptsService, PromptsStorage, IPromptFileDiscoveryResult, PromptFileSkipReason, AgentFileType } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { basename, dirname, relativePath } from '../../../../../base/common/resources.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, IResolvedPromptSourceFolder } from '../../common/promptSyntax/config/promptFileLocations.js';
import { IUntitledTextEditorService } from '../../../../services/untitled/common/untitledTextEditorService.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';
import { ChatViewId } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { parseAllHookFiles, IParsedHook } from '../promptSyntax/hookUtils.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';

/**
 * URL encodes path segments for use in markdown links.
 * Encodes each segment individually to preserve path separators.
 */
function encodePathForMarkdown(path: string): string {
	return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

/**
 * Converts a URI to a relative path string for markdown links.
 * Tries to make the path relative to a workspace folder if possible.
 * The returned path is URL encoded for use in markdown link targets.
 */
function getRelativePath(uri: URI, workspaceFolders: readonly IWorkspaceFolder[]): string {
	// On desktop, vscode-userdata scheme maps 1:1 to file scheme paths via FileUserDataProvider.
	// Convert to file scheme so relativePath() can compute paths correctly.
	// On web, vscode-userdata uses IndexedDB so this conversion has no effect (different schemes won't match workspace folders).
	const normalizedUri = uri.scheme === Schemas.vscodeUserData ? uri.with({ scheme: Schemas.file }) : uri;

	for (const folder of workspaceFolders) {
		const relative = relativePath(folder.uri, normalizedUri);
		if (relative) {
			return encodePathForMarkdown(relative);
		}
	}
	// Fall back to fsPath if not under any workspace folder
	// Use forward slashes for consistency in markdown links
	return encodePathForMarkdown(normalizedUri.fsPath.replace(/\\/g, '/'));
}

// Tree prefixes
// allow-any-unicode-next-line
const TREE_BRANCH = '├─';
// allow-any-unicode-next-line
const TREE_END = '└─';
// allow-any-unicode-next-line
const ICON_ERROR = '❌';
// allow-any-unicode-next-line
const ICON_WARN = '⚠️';
// allow-any-unicode-next-line
const ICON_MANUAL = '🔧';
// allow-any-unicode-next-line
const ICON_HIDDEN = '👁️‍🗨️';

/**
 * Information about a file that was loaded or skipped.
 */
export interface IFileStatusInfo {
	uri: URI;
	status: 'loaded' | 'skipped' | 'overwritten';
	reason?: string;
	name?: string;
	storage: PromptsStorage;
	/** For overwritten files, the name of the file that took precedence */
	overwrittenBy?: string;
	/** Extension ID if this file comes from an extension */
	extensionId?: string;
	/** If true, hidden from / menu (user-invokable: false) */
	userInvokable?: boolean;
	/** If true, won't be auto-loaded by agent (disable-model-invocation: true) */
	disableModelInvocation?: boolean;
}

/**
 * Path information with scan order.
 */
export interface IPathInfo {
	uri: URI;
	exists: boolean;
	storage: PromptsStorage;
	/** 1-based scan order (lower = higher priority) */
	scanOrder: number;
	/** Original path string for display (e.g., '~/.copilot/agents' or '.github/agents') */
	displayPath: string;
	/** Whether this is a default folder (vs custom configured) */
	isDefault: boolean;
}

/**
 * Status information for a specific type of prompt files.
 */
export interface ITypeStatusInfo {
	type: PromptsType;
	paths: IPathInfo[];
	files: IFileStatusInfo[];
	enabled: boolean;
	/** For hooks only: parsed hooks grouped by lifecycle */
	parsedHooks?: IParsedHook[];
}

/**
 * Registers the Diagnostics action for the chat context menu.
 */
export function registerChatCustomizationDiagnosticsAction() {
	registerAction2(class DiagnosticsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.diagnostics',
				title: localize2('chat.diagnostics.label', "Diagnostics"),
				f1: false,
				category: CHAT_CATEGORY,
				menu: [{
					id: MenuId.ChatContext,
					group: 'z_clear',
					order: -1
				}, {
					id: CHAT_CONFIG_MENU_ID,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
					order: 14,
					group: '3_configure'
				}, {
					id: MenuId.ChatWelcomeContext,
					group: '2_settings',
					order: 0,
					when: ChatContextKeys.inChatEditor.negate()
				}]
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const promptsService = accessor.get(IPromptsService);
			const configurationService = accessor.get(IConfigurationService);
			const fileService = accessor.get(IFileService);
			const untitledTextEditorService = accessor.get(IUntitledTextEditorService);
			const commandService = accessor.get(ICommandService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const labelService = accessor.get(ILabelService);

			const token = CancellationToken.None;
			const workspaceFolders = workspaceContextService.getWorkspace().folders;
			const pathService = accessor.get(IPathService);

			// Collect status for each type
			const statusInfos: ITypeStatusInfo[] = [];

			// 1. Custom Agents
			const agentsStatus = await collectAgentsStatus(promptsService, fileService, token);
			statusInfos.push(agentsStatus);

			// 2. Instructions
			const instructionsStatus = await collectInstructionsStatus(promptsService, fileService, token);
			statusInfos.push(instructionsStatus);

			// 3. Prompt Files
			const promptsStatus = await collectPromptsStatus(promptsService, fileService, token);
			statusInfos.push(promptsStatus);

			// 4. Skills
			const skillsStatus = await collectSkillsStatus(promptsService, configurationService, fileService, token);
			statusInfos.push(skillsStatus);

			// 5. Hooks
			const hooksStatus = await collectHooksStatus(promptsService, fileService, labelService, pathService, workspaceContextService, token);
			statusInfos.push(hooksStatus);

			// 6. Special files (AGENTS.md, copilot-instructions.md)
			const specialFilesStatus = await collectSpecialFilesStatus(promptsService, configurationService, token);

			// Generate the markdown output
			const output = formatStatusOutput(statusInfos, specialFilesStatus, workspaceFolders);

			// Create an untitled markdown document with the content
			const untitledModel = untitledTextEditorService.create({
				initialValue: output,
				languageId: 'markdown'
			});

			// Open the markdown file in edit mode
			await commandService.executeCommand('vscode.open', untitledModel.resource);
		}
	});
}

/**
 * Collects status for custom agents.
 */
async function collectAgentsStatus(
	promptsService: IPromptsService,
	fileService: IFileService,
	token: CancellationToken
): Promise<ITypeStatusInfo> {
	const type = PromptsType.agent;
	const enabled = true; // Agents are always enabled

	// Get resolved source folders using the shared path resolution logic
	const resolvedFolders = await promptsService.getResolvedSourceFolders(type);
	const paths = await convertResolvedFoldersToPathInfo(resolvedFolders, fileService);

	// Get discovery info from the service (handles all duplicate detection and error tracking)
	const discoveryInfo = await promptsService.getPromptDiscoveryInfo(type, token);
	const files = discoveryInfo.files.map(convertDiscoveryResultToFileStatus);

	return { type, paths, files, enabled };
}

/**
 * Collects status for instructions files.
 */
async function collectInstructionsStatus(
	promptsService: IPromptsService,
	fileService: IFileService,
	token: CancellationToken
): Promise<ITypeStatusInfo> {
	const type = PromptsType.instructions;
	const enabled = true;

	// Get resolved source folders using the shared path resolution logic
	const resolvedFolders = await promptsService.getResolvedSourceFolders(type);
	const paths = await convertResolvedFoldersToPathInfo(resolvedFolders, fileService);

	// Get discovery info from the service
	// Filter out copilot-instructions.md files as they are handled separately in the special files section
	const discoveryInfo = await promptsService.getPromptDiscoveryInfo(type, token);
	const files = discoveryInfo.files
		.filter(f => basename(f.uri) !== COPILOT_CUSTOM_INSTRUCTIONS_FILENAME)
		.map(convertDiscoveryResultToFileStatus);

	return { type, paths, files, enabled };
}

/**
 * Collects status for prompt files.
 */
async function collectPromptsStatus(
	promptsService: IPromptsService,
	fileService: IFileService,
	token: CancellationToken
): Promise<ITypeStatusInfo> {
	const type = PromptsType.prompt;
	const enabled = true;

	// Get resolved source folders using the shared path resolution logic
	const resolvedFolders = await promptsService.getResolvedSourceFolders(type);
	const paths = await convertResolvedFoldersToPathInfo(resolvedFolders, fileService);

	// Get discovery info from the service
	const discoveryInfo = await promptsService.getPromptDiscoveryInfo(type, token);
	const files = discoveryInfo.files.map(convertDiscoveryResultToFileStatus);

	return { type, paths, files, enabled };
}

/**
 * Collects status for skill files.
 */
async function collectSkillsStatus(
	promptsService: IPromptsService,
	configurationService: IConfigurationService,
	fileService: IFileService,
	token: CancellationToken
): Promise<ITypeStatusInfo> {
	const type = PromptsType.skill;
	const enabled = configurationService.getValue<boolean>(PromptsConfig.USE_AGENT_SKILLS) ?? false;

	// Get resolved source folders using the shared path resolution logic
	const resolvedFolders = await promptsService.getResolvedSourceFolders(type);
	const paths = await convertResolvedFoldersToPathInfo(resolvedFolders, fileService);

	// Get discovery info from the service (handles all duplicate detection and error tracking)
	const discoveryInfo = await promptsService.getPromptDiscoveryInfo(type, token);
	const files = discoveryInfo.files.map(convertDiscoveryResultToFileStatus);

	return { type, paths, files, enabled };
}

export interface ISpecialFilesStatus {
	agentsMd: { enabled: boolean; files: URI[] };
	copilotInstructions: { enabled: boolean; files: URI[] };
	claudeMd: { enabled: boolean; files: URI[] };
}

/**
 * Collects status for hook files.
 */
async function collectHooksStatus(
	promptsService: IPromptsService,
	fileService: IFileService,
	labelService: ILabelService,
	pathService: IPathService,
	workspaceContextService: IWorkspaceContextService,
	token: CancellationToken
): Promise<ITypeStatusInfo> {
	const type = PromptsType.hook;
	const enabled = true; // Hooks are always enabled

	// Get resolved source folders using the shared path resolution logic
	const resolvedFolders = await promptsService.getResolvedSourceFolders(type);
	const paths = await convertResolvedFoldersToPathInfo(resolvedFolders, fileService);

	// Get discovery info from the service (handles all duplicate detection and error tracking)
	const discoveryInfo = await promptsService.getPromptDiscoveryInfo(type, token);
	const files = discoveryInfo.files.map(convertDiscoveryResultToFileStatus);

	// Parse hook files to extract individual hooks grouped by lifecycle
	const parsedHooks = await parseHookFiles(promptsService, fileService, labelService, pathService, workspaceContextService, token);

	return { type, paths, files, enabled, parsedHooks };
}

/**
 * Parses all hook files and extracts individual hooks.
 */
async function parseHookFiles(
	promptsService: IPromptsService,
	fileService: IFileService,
	labelService: ILabelService,
	pathService: IPathService,
	workspaceContextService: IWorkspaceContextService,
	token: CancellationToken
): Promise<IParsedHook[]> {
	// Get workspace root and user home for path resolution
	const workspaceFolder = workspaceContextService.getWorkspace().folders[0];
	const workspaceRootUri = workspaceFolder?.uri;
	const userHomeUri = await pathService.userHome();
	const userHome = userHomeUri.fsPath ?? userHomeUri.path;

	// Use the shared helper
	return parseAllHookFiles(promptsService, fileService, labelService, workspaceRootUri, userHome, token);
}

/**
 * Collects status for special files like AGENTS.md and copilot-instructions.md.
 */
async function collectSpecialFilesStatus(
	promptsService: IPromptsService,
	configurationService: IConfigurationService,
	token: CancellationToken
): Promise<ISpecialFilesStatus> {
	const useAgentMd = configurationService.getValue<boolean>(PromptsConfig.USE_AGENT_MD) ?? false;
	const useClaudeMd = configurationService.getValue<boolean>(PromptsConfig.USE_CLAUDE_MD) ?? false;
	const useCopilotInstructions = configurationService.getValue<boolean>(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES) ?? false;

	const allFiles = await promptsService.listAgentInstructions(token);

	return {
		agentsMd: {
			enabled: useAgentMd,
			files: allFiles.filter(f => f.type === AgentFileType.agentsMd).map(f => f.uri)
		},
		claudeMd: {
			enabled: useClaudeMd,
			files: allFiles.filter(f => f.type === AgentFileType.claudeMd).map(f => f.uri)
		},
		copilotInstructions: {
			enabled: useCopilotInstructions,
			files: allFiles.filter(f => f.type === AgentFileType.copilotInstructionsMd).map(f => f.uri)
		}
	};
}

/**
 * Checks if a directory exists.
 */
async function checkDirectoryExists(fileService: IFileService, uri: URI): Promise<boolean> {
	try {
		const stat = await fileService.stat(uri);
		return stat.isDirectory;
	} catch {
		return false;
	}
}

/**
 * Converts resolved source folders to path info with existence checks.
 * This uses the shared path resolution logic from the prompts service.
 */
async function convertResolvedFoldersToPathInfo(
	resolvedFolders: readonly IResolvedPromptSourceFolder[],
	fileService: IFileService
): Promise<IPathInfo[]> {
	const paths: IPathInfo[] = [];
	let scanOrder = 1;

	for (const folder of resolvedFolders) {
		const exists = await checkDirectoryExists(fileService, folder.uri);
		paths.push({
			uri: folder.uri,
			exists,
			storage: folder.storage,
			scanOrder: scanOrder++,
			displayPath: folder.displayPath ?? folder.uri.path,
			isDefault: folder.isDefault ?? false
		});
	}

	return paths;
}

/**
 * Converts skip reason enum to user-friendly message.
 */
function getSkipReasonMessage(skipReason: PromptFileSkipReason | undefined, errorMessage: string | undefined): string {
	switch (skipReason) {
		case 'missing-name':
			return nls.localize('status.missingName', 'Missing name attribute');
		case 'missing-description':
			return nls.localize('status.skillMissingDescription', 'Missing description attribute');
		case 'name-mismatch':
			return errorMessage ?? nls.localize('status.skillNameMismatch2', 'Name does not match folder');
		case 'duplicate-name':
			return nls.localize('status.overwrittenByHigherPriority', 'Overwritten by higher priority file');
		case 'parse-error':
			return errorMessage ?? nls.localize('status.parseError', 'Parse error');
		case 'disabled':
			return nls.localize('status.typeDisabled', 'Disabled');
		default:
			return errorMessage ?? nls.localize('status.unknownError', 'Unknown error');
	}
}

/**
 * Converts IPromptFileDiscoveryResult to IFileStatusInfo for display.
 */
function convertDiscoveryResultToFileStatus(result: IPromptFileDiscoveryResult): IFileStatusInfo {
	if (result.status === 'loaded') {
		return {
			uri: result.uri,
			status: 'loaded',
			name: result.name,
			storage: result.storage,
			extensionId: result.extensionId,
			userInvokable: result.userInvokable,
			disableModelInvocation: result.disableModelInvocation
		};
	}

	// Handle skipped files
	if (result.skipReason === 'duplicate-name' && result.duplicateOf) {
		// This is an overwritten file
		return {
			uri: result.uri,
			status: 'overwritten',
			name: result.name,
			storage: result.storage,
			overwrittenBy: result.name,
			extensionId: result.extensionId
		};
	}

	// Regular skip
	return {
		uri: result.uri,
		status: 'skipped',
		name: result.name,
		reason: getSkipReasonMessage(result.skipReason, result.errorMessage),
		storage: result.storage,
		extensionId: result.extensionId
	};
}

/**
 * Formats the status output as a compact markdown string with tree structure.
 * Files are grouped under their parent paths.
 * Special files (AGENTS.md, copilot-instructions.md) are merged into their respective sections.
 */
export function formatStatusOutput(
	statusInfos: ITypeStatusInfo[],
	specialFiles: ISpecialFilesStatus,
	workspaceFolders: readonly IWorkspaceFolder[]
): string {
	const lines: string[] = [];

	lines.push(`## ${nls.localize('status.title', 'Chat Customization Diagnostics')}`);
	lines.push(`*${nls.localize('status.sensitiveWarning', 'WARNING: This file may contain sensitive information.')}*`);
	lines.push('');

	for (const info of statusInfos) {
		const typeName = getTypeName(info.type);

		// Special handling for disabled skills
		if (info.type === PromptsType.skill && !info.enabled) {
			lines.push(`**${typeName}**`);
			lines.push(`*${nls.localize('status.skillsDisabled', 'Skills are disabled. Enable them by setting `chat.useAgentSkills` to `true` in your settings.')}*`);
			lines.push('');
			continue;
		}

		const enabledStatus = info.enabled
			? ''
			: ` *(${nls.localize('status.disabled', 'disabled')})*`;

		// Count loaded and skipped files (overwritten counts as skipped)
		let loadedCount = info.files.filter(f => f.status === 'loaded').length;
		const skippedCount = info.files.filter(f => f.status === 'skipped' || f.status === 'overwritten').length;
		// Include special files in the loaded count for instructions
		if (info.type === PromptsType.instructions) {
			if (specialFiles.agentsMd.enabled) {
				loadedCount += specialFiles.agentsMd.files.length;
			}
			if (specialFiles.copilotInstructions.enabled) {
				loadedCount += specialFiles.copilotInstructions.files.length;
			}
			if (specialFiles.claudeMd.enabled) {
				loadedCount += specialFiles.claudeMd.files.length;
			}
		}

		lines.push(`**${typeName}**${enabledStatus}<br>`);

		// Show stats line - use "skills" for skills type, "hooks" for hooks type, "files" for others
		const statsParts: string[] = [];
		if (info.type === PromptsType.hook) {
			// For hooks, show both file count and individual hook count
			if (loadedCount > 0) {
				statsParts.push(loadedCount === 1
					? nls.localize('status.fileLoaded', '1 file loaded')
					: nls.localize('status.filesLoaded', '{0} files loaded', loadedCount));
			}
			if (info.parsedHooks && info.parsedHooks.length > 0) {
				const hookCount = info.parsedHooks.length;
				statsParts.push(hookCount === 1
					? nls.localize('status.hookLoaded', '1 hook loaded')
					: nls.localize('status.hooksLoaded', '{0} hooks loaded', hookCount));
			}
		} else if (loadedCount > 0) {
			if (info.type === PromptsType.skill) {
				statsParts.push(loadedCount === 1
					? nls.localize('status.skillLoaded', '1 skill loaded')
					: nls.localize('status.skillsLoaded', '{0} skills loaded', loadedCount));
			} else {
				statsParts.push(loadedCount === 1
					? nls.localize('status.fileLoaded', '1 file loaded')
					: nls.localize('status.filesLoaded', '{0} files loaded', loadedCount));
			}
		}
		if (skippedCount > 0) {
			statsParts.push(nls.localize('status.skippedCount', '{0} skipped', skippedCount));
		}
		if (statsParts.length > 0) {
			lines.push(`*${statsParts.join(', ')}*`);
		}
		lines.push('');

		const allPaths = info.paths;
		const allFiles = info.files;

		// Group files by their parent path
		const filesByPath = new Map<string, IFileStatusInfo[]>();
		const unmatchedFiles: IFileStatusInfo[] = [];

		for (const file of allFiles) {
			let matched = false;
			for (const path of allPaths) {
				if (isFileUnderPath(file.uri, path.uri)) {
					const key = path.uri.toString();
					if (!filesByPath.has(key)) {
						filesByPath.set(key, []);
					}
					filesByPath.get(key)!.push(file);
					matched = true;
					break;
				}
			}
			if (!matched) {
				unmatchedFiles.push(file);
			}
		}

		// Render each path with its files as a tree
		// Skip for hooks since we show files with their hooks below
		let hasContent = false;
		if (info.type !== PromptsType.hook) {
			for (const path of allPaths) {
				const pathFiles = filesByPath.get(path.uri.toString()) || [];

				if (path.exists) {
					lines.push(`${path.displayPath}<br>`);
				} else if (path.isDefault) {
					// Default folders that don't exist - no error icon
					lines.push(`${path.displayPath}<br>`);
				} else {
					// Custom folders that don't exist - show error
					lines.push(`${ICON_ERROR} ${path.displayPath} - *${nls.localize('status.folderNotFound', 'Folder does not exist')}*<br>`);
				}

				if (path.exists && pathFiles.length > 0) {
					for (let i = 0; i < pathFiles.length; i++) {
						const file = pathFiles[i];
						// Show the file ID: skill name for skills, basename for others
						let fileName: string;
						if (info.type === PromptsType.skill) {
							fileName = file.name || `${basename(dirname(file.uri))}`;
						} else {
							fileName = basename(file.uri);
						}
						const isLast = i === pathFiles.length - 1;
						const prefix = isLast ? TREE_END : TREE_BRANCH;
						const filePath = getRelativePath(file.uri, workspaceFolders);
						if (file.status === 'loaded') {
							const flags = getSkillFlags(file, info.type);
							lines.push(`${prefix} [\`${fileName}\`](${filePath})${flags}<br>`);
						} else if (file.status === 'overwritten') {
							lines.push(`${prefix} ${ICON_WARN} [\`${fileName}\`](${filePath}) - *${nls.localize('status.overwrittenByHigherPriority', 'Overwritten by higher priority file')}*<br>`);
						} else {
							lines.push(`${prefix} ${ICON_ERROR} [\`${fileName}\`](${filePath}) - *${file.reason}*<br>`);
						}
					}
				}
				hasContent = true;
			}
		}

		// Render unmatched files (e.g., from extensions) - group by extension ID
		// Skip for hooks since we show files with their hooks below
		if (info.type !== PromptsType.hook && unmatchedFiles.length > 0) {
			// Group files by extension ID
			const filesByExtension = new Map<string, IFileStatusInfo[]>();
			for (const file of unmatchedFiles) {
				const extId = file.extensionId || 'unknown';
				if (!filesByExtension.has(extId)) {
					filesByExtension.set(extId, []);
				}
				filesByExtension.get(extId)!.push(file);
			}

			// Render each extension group
			for (const [extId, extFiles] of filesByExtension) {
				lines.push(`${nls.localize('status.extension', 'Extension')}: ${extId}<br>`);
				for (let i = 0; i < extFiles.length; i++) {
					const file = extFiles[i];
					// Show the file ID: skill name for skills, basename for others
					let fileName: string;
					if (info.type === PromptsType.skill) {
						fileName = file.name || `${basename(dirname(file.uri))}`;
					} else {
						fileName = basename(file.uri);
					}
					const isLast = i === extFiles.length - 1;
					const prefix = isLast ? TREE_END : TREE_BRANCH;
					const filePath = getRelativePath(file.uri, workspaceFolders);
					if (file.status === 'loaded') {
						const flags = getSkillFlags(file, info.type);
						lines.push(`${prefix} [\`${fileName}\`](${filePath})${flags}<br>`);
					} else if (file.status === 'overwritten') {
						lines.push(`${prefix} ${ICON_WARN} [\`${fileName}\`](${filePath}) - *${nls.localize('status.overwrittenByHigherPriority', 'Overwritten by higher priority file')}*<br>`);
					} else {
						lines.push(`${prefix} ${ICON_ERROR} [\`${fileName}\`](${filePath}) - *${file.reason}*<br>`);
					}
				}
			}
			hasContent = true;
		}

		// Add special files for instructions (AGENTS.md and copilot-instructions.md)
		if (info.type === PromptsType.instructions) {
			// AGENTS.md
			if (specialFiles.agentsMd.enabled && specialFiles.agentsMd.files.length > 0) {
				lines.push(`AGENTS.md<br>`);
				for (let i = 0; i < specialFiles.agentsMd.files.length; i++) {
					const file = specialFiles.agentsMd.files[i];
					const fileName = basename(file);
					const isLast = i === specialFiles.agentsMd.files.length - 1;
					const prefix = isLast ? TREE_END : TREE_BRANCH;
					const filePath = getRelativePath(file, workspaceFolders);
					lines.push(`${prefix} [\`${fileName}\`](${filePath})<br>`);
				}
				hasContent = true;
			} else if (!specialFiles.agentsMd.enabled) {
				lines.push(`AGENTS.md -<br>`);
				hasContent = true;
			}

			// copilot-instructions.md
			if (specialFiles.copilotInstructions.enabled && specialFiles.copilotInstructions.files.length > 0) {
				lines.push(`${COPILOT_CUSTOM_INSTRUCTIONS_FILENAME}<br>`);
				for (let i = 0; i < specialFiles.copilotInstructions.files.length; i++) {
					const file = specialFiles.copilotInstructions.files[i];
					const fileName = basename(file);
					const isLast = i === specialFiles.copilotInstructions.files.length - 1;
					const prefix = isLast ? TREE_END : TREE_BRANCH;
					const filePath = getRelativePath(file, workspaceFolders);
					lines.push(`${prefix} [\`${fileName}\`](${filePath})<br>`);
				}
				hasContent = true;
			} else if (!specialFiles.copilotInstructions.enabled) {
				lines.push(`${COPILOT_CUSTOM_INSTRUCTIONS_FILENAME} -<br>`);
				hasContent = true;
			}
		}

		// Special handling for hooks - display grouped by file, then by lifecycle
		if (info.type === PromptsType.hook && info.parsedHooks && info.parsedHooks.length > 0) {
			// Group hooks first by file, then by lifecycle within each file
			const hooksByFile = new Map<string, IParsedHook[]>();
			for (const hook of info.parsedHooks) {
				const fileKey = hook.fileUri.toString();
				const existing = hooksByFile.get(fileKey) ?? [];
				existing.push(hook);
				hooksByFile.set(fileKey, existing);
			}

			// Display hooks grouped by file
			const fileUris = Array.from(hooksByFile.keys());
			for (let fileIdx = 0; fileIdx < fileUris.length; fileIdx++) {
				const fileKey = fileUris[fileIdx];
				const fileHooks = hooksByFile.get(fileKey)!;
				const firstHook = fileHooks[0];
				const filePath = getRelativePath(firstHook.fileUri, workspaceFolders);

				// File as clickable link
				lines.push(`[${firstHook.filePath}](${filePath})<br>`);

				// Flatten hooks with their lifecycle label
				for (let i = 0; i < fileHooks.length; i++) {
					const hook = fileHooks[i];
					const isLast = i === fileHooks.length - 1;
					const prefix = isLast ? TREE_END : TREE_BRANCH;
					lines.push(`${prefix} ${hook.hookTypeLabel}: \`${hook.commandLabel}\`<br>`);
				}
			}
			hasContent = true;
		}

		if (!hasContent && info.enabled) {
			lines.push(`*${nls.localize('status.noFilesLoaded', 'No files loaded')}*`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Gets flag annotations for skills based on their visibility settings.
 * Returns an empty string for non-skill types or skills with default settings.
 */
function getSkillFlags(file: IFileStatusInfo, type: PromptsType): string {
	if (type !== PromptsType.skill) {
		return '';
	}

	const flags: string[] = [];

	// disableModelInvocation: true means agent won't auto-load, only manual /name trigger
	if (file.disableModelInvocation) {
		flags.push(`${ICON_MANUAL} *${nls.localize('status.skill.manualOnly', 'manual only')}*`);
	}

	// userInvokable: false means hidden from / menu
	if (file.userInvokable === false) {
		flags.push(`${ICON_HIDDEN} *${nls.localize('status.skill.hiddenFromMenu', 'hidden from menu')}*`);
	}

	if (flags.length === 0) {
		return '';
	}

	return ` - ${flags.join(', ')}`;
}

/**
 * Checks if a file URI is under a given path URI.
 */
function isFileUnderPath(fileUri: URI, pathUri: URI): boolean {
	const filePath = fileUri.toString();
	const folderPath = pathUri.toString();
	return filePath.startsWith(folderPath + '/') || filePath.startsWith(folderPath + '\\');
}

/**
 * Gets a human-readable name for a prompt type.
 */
function getTypeName(type: PromptsType): string {
	switch (type) {
		case PromptsType.agent:
			return nls.localize('status.type.agents', 'Custom Agents');
		case PromptsType.instructions:
			return nls.localize('status.type.instructions', 'Instructions');
		case PromptsType.prompt:
			return nls.localize('status.type.prompts', 'Prompt Files');
		case PromptsType.skill:
			return nls.localize('status.type.skills', 'Skills');
		case PromptsType.hook:
			return nls.localize('status.type.hooks', 'Hooks');
		default:
			return type;
	}
}
