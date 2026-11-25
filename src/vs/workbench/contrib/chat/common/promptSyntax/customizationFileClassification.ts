/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { basename, IExtUri } from '../../../../../base/common/resources.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { AGENT_MD_FILENAME, CLAUDE_LOCAL_MD_FILENAME, CLAUDE_MD_FILENAME, getPromptFileType } from './config/promptFileLocations.js';
import { PromptsType } from './promptTypes.js';

/**
 * The kind of AI customization file, as reported in telemetry.
 */
export type CustomizationFileKind = 'instructions' | 'prompt' | 'agent' | 'skill' | 'hook' | 'command' | 'rule' | 'agentsMd' | 'claudeMd' | 'geminiMd' | 'mcpConfig' | 'agentSettings';

/**
 * The tool convention an AI customization file follows, derived from its folder or file name.
 */
export type CustomizationFileEcosystem = 'github' | 'copilot' | 'vscode' | 'claude' | 'agents' | 'codex' | 'cursor' | 'gemini' | 'other';

/**
 * Where an AI customization file is stored.
 */
export type CustomizationFileScope = 'workspace' | 'user' | 'other';

/**
 * The bounded description of an AI customization file. It never contains file or folder names.
 */
export interface ICustomizationFileClassification {
	readonly kind: CustomizationFileKind;
	readonly ecosystem: CustomizationFileEcosystem;
}

const GEMINI_MD_FILENAME = 'GEMINI.md';
const CURSOR_RULES_FILENAME = '.cursorrules';

const ecosystemFolders = new Map<string, CustomizationFileEcosystem>([
	['.github', 'github'],
	['.copilot', 'copilot'],
	['.vscode', 'vscode'],
	['.claude', 'claude'],
	['.agents', 'agents'],
	['.codex', 'codex'],
	['.cursor', 'cursor'],
	['.gemini', 'gemini'],
]);

const agentsMdFile: ICustomizationFileClassification = { kind: 'agentsMd', ecosystem: 'agents' };

const wellKnownFiles = new Map<string, ICustomizationFileClassification>([
	[CLAUDE_MD_FILENAME, { kind: 'claudeMd', ecosystem: 'claude' }],
	[CLAUDE_LOCAL_MD_FILENAME, { kind: 'claudeMd', ecosystem: 'claude' }],
	[GEMINI_MD_FILENAME, { kind: 'geminiMd', ecosystem: 'gemini' }],
	[CURSOR_RULES_FILENAME, { kind: 'rule', ecosystem: 'cursor' }],
]);

/**
 * Classifies a file as an AI customization file (Copilot, Claude, Codex, Cursor, Gemini or
 * shared `.agents` conventions) based on its file name and folders, or returns `undefined`
 * if it isn't one.
 */
export function classifyCustomizationFile(resource: URI): ICustomizationFileClassification | undefined {
	const name = basename(resource);
	const folders = resource.path.split('/').slice(0, -1);

	// AGENTS.md files are discovered regardless of their casing
	const wellKnown = equalsIgnoreCase(name, AGENT_MD_FILENAME) ? agentsMdFile : wellKnownFiles.get(name);
	if (wellKnown) {
		return { kind: wellKnown.kind, ecosystem: getFolderEcosystem(resource, folders) ?? wellKnown.ecosystem };
	}

	const kind = getConfigFileKind(name.toLowerCase(), folders) ?? getMarkdownFileKind(resource, name.toLowerCase(), folders);
	if (!kind) {
		return undefined;
	}

	return { kind, ecosystem: getFolderEcosystem(resource, folders) ?? 'other' };
}

/**
 * Returns whether a customization file is in a workspace folder, in the user's home or user data folder, or elsewhere.
 */
export function getCustomizationFileScope(resource: URI, isInWorkspace: boolean, userHome: URI, extUri: IExtUri): CustomizationFileScope {
	if (isInWorkspace) {
		return 'workspace';
	}

	if (resource.scheme === Schemas.vscodeUserData || extUri.isEqualOrParent(resource, userHome)) {
		return 'user';
	}

	return 'other';
}

function getConfigFileKind(name: string, folders: readonly string[]): CustomizationFileKind | undefined {
	const parent = folders.at(-1);

	if (name === '.mcp.json' || (name === 'mcp.json' && (parent === '.vscode' || parent === '.cursor')) || (name === 'mcp-config.json' && parent === '.copilot')) {
		return 'mcpConfig';
	}

	if (name.endsWith('.json') && parent === 'hooks' && (folders.at(-2) === '.github' || folders.at(-2) === '.copilot')) {
		return 'hook';
	}

	if ((parent === '.claude' && (name === 'settings.json' || name === 'settings.local.json')) || (parent === '.gemini' && name === 'settings.json') || (parent === '.codex' && name === 'config.toml')) {
		return 'agentSettings';
	}

	return undefined;
}

function getMarkdownFileKind(resource: URI, name: string, folders: readonly string[]): CustomizationFileKind | undefined {
	if (name.endsWith('.mdc')) {
		return hasFolderSequence(folders, '.cursor', 'rules') ? 'rule' : undefined;
	}

	if (!name.endsWith('.md') || name === 'readme.md') {
		return undefined;
	}

	if (hasFolderSequence(folders, '.claude', 'commands')) {
		return 'command';
	}

	if (hasFolderSequence(folders, '.codex', 'prompts')) {
		return 'prompt';
	}

	if (hasFolderSequence(folders, '.cursor', 'rules')) {
		return 'rule';
	}

	switch (getPromptFileType(resource)) {
		case PromptsType.prompt: return 'prompt';
		case PromptsType.instructions: return 'instructions';
		case PromptsType.agent: return 'agent';
		case PromptsType.skill: return 'skill';
		default: return undefined;
	}
}

function getFolderEcosystem(resource: URI, folders: readonly string[]): CustomizationFileEcosystem | undefined {
	// The closest configuration folder wins, for example `~/.copilot/skills/x/SKILL.md` is `copilot`.
	for (let i = folders.length - 1; i >= 0; i--) {
		const ecosystem = ecosystemFolders.get(folders[i]);
		if (ecosystem) {
			return ecosystem;
		}
	}

	return resource.scheme === Schemas.vscodeUserData ? 'vscode' : undefined;
}

function hasFolderSequence(folders: readonly string[], first: string, second: string): boolean {
	for (let i = 0; i < folders.length - 1; i++) {
		if (folders[i] === first && folders[i + 1] === second) {
			return true;
		}
	}

	return false;
}
