/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { basename, dirname } from '../../../../../../base/common/path.js';
import { PromptsType } from '../promptTypes.js';

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
 * Default agent skills workspace source folders.
 */
export const DEFAULT_AGENT_SKILLS_WORKSPACE_FOLDERS = [
	{ path: '.github/skills', type: 'github-workspace' },
	{ path: '.claude/skills', type: 'claude-workspace' }
] as const;

/**
 * Default agent skills user home source folders.
 */
export const DEFAULT_AGENT_SKILLS_USER_HOME_FOLDERS = [
	{ path: '.copilot/skills', type: 'copilot-personal' },
	{ path: '.claude/skills', type: 'claude-personal' }
] as const;

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

	// Check if it's a .md file in the .github/agents/ folder
	if (filename.endsWith('.md') && isInAgentsFolder(fileUri)) {
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
		default:
			throw new Error('Unknown prompt type');
	}
}

export function getPromptFileDefaultLocation(type: PromptsType): string {
	switch (type) {
		case PromptsType.instructions:
			return INSTRUCTIONS_DEFAULT_SOURCE_FOLDER;
		case PromptsType.prompt:
			return PROMPT_DEFAULT_SOURCE_FOLDER;
		case PromptsType.agent:
			return AGENTS_SOURCE_FOLDER;
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

	// For .md files in .github/agents/ folder, treat them as agent files
	if (fileName.endsWith('.md') && isInAgentsFolder(fileUri)) {
		return basename(fileUri.path, '.md');
	}

	// because we now rely on the `prompt` language ID that can be explicitly
	// set for any document in the editor, any file can be a "prompt" file, so
	// to account for that, we return the full file name including the file
	// extension for all other cases
	return basename(fileUri.path);
}
