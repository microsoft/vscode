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
import { IPromptsService, PromptsStorage, IPromptFileDiscoveryResult, PromptFileSkipReason } from '../../common/promptSyntax/service/promptsService.js';
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

			const token = CancellationToken.None;
			const workspaceFolders = workspaceContextService.getWorkspace().folders;

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

			// 5. Special files (AGENTS.md, copilot-instructions.md)
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

/**
 * Collects status for special files like AGENTS.md and copilot-instructions.md.
 */
async function collectSpecialFilesStatus(
	promptsService: IPromptsService,
	configurationService: IConfigurationService,
	token: CancellationToken
): Promise<{ agentsMd: { enabled: boolean; files: URI[] }; copilotInstructions: { enabled: boolean; files: URI[] } }> {
	// AGENTS.md
	const useAgentMd = configurationService.getValue<boolean>(PromptsConfig.USE_AGENT_MD) ?? false;
	let agentMdFiles: URI[] = [];
	if (useAgentMd) {
		agentMdFiles = await promptsService.listAgentMDs(token, false);
	}

	// copilot-instructions.md
	const useCopilotInstructions = configurationService.getValue<boolean>(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES) ?? false;
	let copilotInstructionsFiles: URI[] = [];
	if (useCopilotInstructions) {
		copilotInstructionsFiles = await promptsService.listCopilotInstructionsMDs(token);
	}

	return {
		agentsMd: { enabled: useAgentMd, files: agentMdFiles },
		copilotInstructions: { enabled: useCopilotInstructions, files: copilotInstructionsFiles }
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
			extensionId: result.extensionId
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
	specialFiles: { agentsMd: { enabled: boolean; files: URI[] }; copilotInstructions: { enabled: boolean; files: URI[] } },
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
		}

		lines.push(`**${typeName}**${enabledStatus}<br>`);

		// Show stats line - use "skills" for skills type, "files" for others
		const statsParts: string[] = [];
		if (loadedCount > 0) {
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
		let hasContent = false;
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
						lines.push(`${prefix} [\`${fileName}\`](${filePath})<br>`);
					} else if (file.status === 'overwritten') {
						lines.push(`${prefix} ${ICON_WARN} [\`${fileName}\`](${filePath}) - *${nls.localize('status.overwrittenByHigherPriority', 'Overwritten by higher priority file')}*<br>`);
					} else {
						lines.push(`${prefix} ${ICON_ERROR} [\`${fileName}\`](${filePath}) - *${file.reason}*<br>`);
					}
				}
			}
			hasContent = true;
		}

		// Render unmatched files (e.g., from extensions) - group by extension ID
		if (unmatchedFiles.length > 0) {
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
						lines.push(`${prefix} [\`${fileName}\`](${filePath})<br>`);
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

		if (!hasContent && info.enabled) {
			lines.push(`*${nls.localize('status.noFilesLoaded', 'No files loaded')}*`);
		}
		lines.push('');
	}

	return lines.join('\n');
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
		default:
			return type;
	}
}
