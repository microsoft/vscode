/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { basename, dirname } from '../../../../../../base/common/path.js';
import { PromptsType } from '../promptTypes.js';
import { PromptsStorage } from '../service/promptsService.js';

/**
 * File extension for the reusable prompt files.
 */
export const PROMPT_FILE_EXTENSION = '.prompt.md';

/**
 * File extension for the reusable instruction files.
 */
export const INSTRUCTION_FILE_EXTENSION = '.instructions.md';

/**
 * File extension for the modes files.
 */
export const LEGACY_MODE_FILE_EXTENSION = '.chatmode.md';

/**
 * File extension for the agent files.
 */
export const AGENT_FILE_EXTENSION = '.agent.md';

/**
 * Skill file name (case insensitive).
 */
export const SKILL_FILENAME = 'SKILL.md';

/**
 * Copilot custom instructions file name.
 */
export const COPILOT_CUSTOM_INSTRUCTIONS_FILENAME = 'copilot-instructions.md';


/**
 * Default reusable prompt files source folder.
 */
export const PROMPT_DEFAULT_SOURCE_FOLDER = '.github/prompts';

/**
 * Default reusable instructions files source folder.
 */
export const INSTRUCTIONS_DEFAULT_SOURCE_FOLDER = '.github/instructions';

/**
 * Default modes source folder.
 */
export const LEGACY_MODE_DEFAULT_SOURCE_FOLDER = '.github/chatmodes';

/**
 * Agents folder.
 */
export const AGENTS_SOURCE_FOLDER = '.github/agents';

/**
 * Tracks where prompt files originate from.
 */
export enum PromptFileSource {
	GitHubWorkspace = 'github-workspace',
	CopilotPersonal = 'copilot-personal',
	ClaudePersonal = 'claude-personal',
	ClaudeWorkspace = 'claude-workspace',
	ConfigWorkspace = 'config-workspace',
	ConfigPersonal = 'config-personal',
	ExtensionContribution = 'extension-contribution',
	ExtensionAPI = 'extension-api',
}

/**
 * Prompt source folder path with source and storage type.
 */
export interface IPromptSourceFolder {
	readonly path: string;
	readonly source: PromptFileSource;
	readonly storage: PromptsStorage;
}

/**
 * Resolved prompt folder with source and storage type.
 */
export interface IResolvedPromptSourceFolder {
	readonly uri: URI;
	readonly source: PromptFileSource;
	readonly storage: PromptsStorage;
	/**
	 * The original path string before resolution (e.g., '~/.copilot/agents' or '.github/agents').
	 * Used for display purposes.
	 */
	readonly displayPath?: string;
	/**
	 * Whether this is a default location (vs user-configured).
	 */
	readonly isDefault?: boolean;
}

/**
 * Resolved prompt markdown file with source and storage type.
 */
export interface IResolvedPromptFile {
	readonly fileUri: URI;
	readonly source: PromptFileSource;
	readonly storage: PromptsStorage;
}

/**
 * All default skill source folders (both workspace and user home).
 */
export const DEFAULT_SKILL_SOURCE_FOLDERS: readonly IPromptSourceFolder[] = [
	{ path: '.github/skills', source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
	{ path: '.claude/skills', source: PromptFileSource.ClaudeWorkspace, storage: PromptsStorage.local },
	{ path: '~/.copilot/skills', source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user },
	{ path: '~/.claude/skills', source: PromptFileSource.ClaudePersonal, storage: PromptsStorage.user },
];

/**
 * Default instructions source folders.
 */
export const DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS: readonly IPromptSourceFolder[] = [
	{ path: INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
];

/**
 * Default prompt source folders.
 */
export const DEFAULT_PROMPT_SOURCE_FOLDERS: readonly IPromptSourceFolder[] = [
	{ path: PROMPT_DEFAULT_SOURCE_FOLDER, source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
];

/**
 * Default agent source folders.
 */
export const DEFAULT_AGENT_SOURCE_FOLDERS: readonly IPromptSourceFolder[] = [
	{ path: AGENTS_SOURCE_FOLDER, source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
];

/**
 * Helper function to check if a file is directly in the .github/agents/ folder (not in subfolders).
 */
function isInAgentsFolder(fileUri: URI): boolean {
	const dir = dirname(fileUri.path);
	return dir.endsWith('/' + AGENTS_SOURCE_FOLDER) || dir === AGENTS_SOURCE_FOLDER;
}

/**
 * Gets the prompt file type from the provided path.
 */
export function getPromptFileType(fileUri: URI): PromptsType | undefined {
	const filename = basename(fileUri.path);

	if (filename.endsWith(PROMPT_FILE_EXTENSION)) {
		return PromptsType.prompt;
	}

	if (filename.endsWith(INSTRUCTION_FILE_EXTENSION) || (filename === COPILOT_CUSTOM_INSTRUCTIONS_FILENAME)) {
		return PromptsType.instructions;
	}

	if (filename.endsWith(LEGACY_MODE_FILE_EXTENSION) || filename.endsWith(AGENT_FILE_EXTENSION)) {
		return PromptsType.agent;
	}

	if (filename.toLowerCase() === SKILL_FILENAME.toLowerCase()) {
		return PromptsType.skill;
	}

	// Check if it's a .md file in the .github/agents/ folder
	// Exclude README.md to allow documentation files
	if (filename.endsWith('.md') && filename !== 'README.md' && isInAgentsFolder(fileUri)) {
		return PromptsType.agent;
	}

	return undefined;
}

/**
 * Check if provided URI points to a file that with prompt file extension.
 */
export function isPromptOrInstructionsFile(fileUri: URI): boolean {
	return getPromptFileType(fileUri) !== undefined;
}

export function getPromptFileExtension(type: PromptsType): string {
	switch (type) {
		case PromptsType.instructions:
			return INSTRUCTION_FILE_EXTENSION;
		case PromptsType.prompt:
			return PROMPT_FILE_EXTENSION;
		case PromptsType.agent:
			return AGENT_FILE_EXTENSION;
		case PromptsType.skill:
			return SKILL_FILENAME;
		default:
			throw new Error('Unknown prompt type');
	}
}

export function getPromptFileDefaultLocations(type: PromptsType): readonly IPromptSourceFolder[] {
	switch (type) {
		case PromptsType.instructions:
			return DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS;
		case PromptsType.prompt:
			return DEFAULT_PROMPT_SOURCE_FOLDERS;
		case PromptsType.agent:
			return DEFAULT_AGENT_SOURCE_FOLDERS;
		case PromptsType.skill:
			return DEFAULT_SKILL_SOURCE_FOLDERS;
		default:
			throw new Error('Unknown prompt type');
	}
}


/**
 * Gets clean prompt name without file extension.
 */
export function getCleanPromptName(fileUri: URI): string {
	const fileName = basename(fileUri.path);

	const extensions = [
		PROMPT_FILE_EXTENSION,
		INSTRUCTION_FILE_EXTENSION,
		LEGACY_MODE_FILE_EXTENSION,
		AGENT_FILE_EXTENSION,
	];

	for (const ext of extensions) {
		if (fileName.endsWith(ext)) {
			return basename(fileUri.path, ext);
		}
	}

	if (fileName === COPILOT_CUSTOM_INSTRUCTIONS_FILENAME) {
		return basename(fileUri.path, '.md');
	}

	// For SKILL.md files (case insensitive), return 'SKILL'
	if (fileName.toLowerCase() === SKILL_FILENAME.toLowerCase()) {
		return basename(fileUri.path, '.md');
	}

	// For .md files in .github/agents/ folder, treat them as agent files
	// Exclude README.md to allow documentation files
	if (fileName.endsWith('.md') && fileName !== 'README.md' && isInAgentsFolder(fileUri)) {
		return basename(fileUri.path, '.md');
	}

	// because we now rely on the `prompt` language ID that can be explicitly
	// set for any document in the editor, any file can be a "prompt" file, so
	// to account for that, we return the full file name including the file
	// extension for all other cases
	return basename(fileUri.path);
}
