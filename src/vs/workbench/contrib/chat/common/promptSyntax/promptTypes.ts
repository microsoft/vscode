/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageSelector } from '../../../../../editor/common/languageSelector.js';

/**
 * Documentation link for the reusable prompts feature.
 */
export const PROMPT_DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-prompt-snippets';
export const INSTRUCTIONS_DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-custom-instructions';
export const AGENT_DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-custom-chat-modes'; // todo
export const SKILL_DOCUMENTATION_URL = 'https://aka.ms/vscode-agent-skills';
// TODO: update link when available
export const HOOK_DOCUMENTATION_URL = 'https://aka.ms/vscode-chat-hooks';

/**
 * Language ID for the reusable prompt syntax.
 */
export const PROMPT_LANGUAGE_ID = 'prompt';

/**
 * Language ID for instructions syntax.
 */
export const INSTRUCTIONS_LANGUAGE_ID = 'instructions';

/**
 * Language ID for agent syntax.
 */
export const AGENT_LANGUAGE_ID = 'chatagent';

/**
 * Language ID for skill syntax.
 */
export const SKILL_LANGUAGE_ID = 'skill';

/**
 * Prompt and instructions files language selector.
 */
export const ALL_PROMPTS_LANGUAGE_SELECTOR: LanguageSelector = [PROMPT_LANGUAGE_ID, INSTRUCTIONS_LANGUAGE_ID, AGENT_LANGUAGE_ID, SKILL_LANGUAGE_ID];

/**
 * Configuration key for enabling the agent debug log feature.
 */
export const AGENT_DEBUG_LOG_ENABLED_SETTING = 'github.copilot.chat.agentDebugLog.enabled';

/**
 * Configuration key for enabling file logging for the agent debug log.
 */
export const AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING = 'github.copilot.chat.agentDebugLog.fileLogging.enabled';

/**
 * The name of the troubleshoot slash command / skill.
 */
export const TROUBLESHOOT_COMMAND_NAME = 'troubleshoot';

/**
 * URI scheme used by the Copilot extension for built-in skills.
 */
export const COPILOT_SKILL_URI_SCHEME = 'copilot-skill';

/**
 * Path fragment that identifies the troubleshoot skill in a URI.
 */
export const TROUBLESHOOT_SKILL_PATH = 'troubleshoot/SKILL.md';

/**
 * The language id for a prompts type.
 */
export function getLanguageIdForPromptsType(type: PromptsType): string {
	switch (type) {
		case PromptsType.prompt:
			return PROMPT_LANGUAGE_ID;
		case PromptsType.instructions:
			return INSTRUCTIONS_LANGUAGE_ID;
		case PromptsType.agent:
			return AGENT_LANGUAGE_ID;
		case PromptsType.skill:
			return SKILL_LANGUAGE_ID;
		case PromptsType.hook:
			// Hooks use JSONC syntax with schema validation
			return 'jsonc';
		default:
			throw new Error(`Unknown prompt type: ${type}`);
	}
}

export function getPromptsTypeForLanguageId(languageId: string): PromptsType | undefined {
	switch (languageId) {
		case PROMPT_LANGUAGE_ID:
			return PromptsType.prompt;
		case INSTRUCTIONS_LANGUAGE_ID:
			return PromptsType.instructions;
		case AGENT_LANGUAGE_ID:
			return PromptsType.agent;
		case SKILL_LANGUAGE_ID:
			return PromptsType.skill;
		// Note: hook uses 'jsonc' language ID which is shared, so we don't map it here
		default:
			return undefined;
	}
}


/**
 * What the prompt is used for.
 */
export enum PromptsType {
	instructions = 'instructions',
	prompt = 'prompt',
	agent = 'agent',
	skill = 'skill',
	hook = 'hook'
}
export function isValidPromptType(type: string): type is PromptsType {
	return Object.values(PromptsType).includes(type as PromptsType);
}

export enum Target {
	VSCode = 'vscode',
	GitHubCopilot = 'github-copilot',
	Claude = 'claude',
	Undefined = 'undefined',
}

/**
 * Tracks where prompt files originate from.
 */
export enum PromptFileSource {
	GitHubWorkspace = 'github-workspace',
	CopilotPersonal = 'copilot-personal',
	ClaudePersonal = 'claude-personal',
	ClaudeWorkspace = 'claude-workspace',
	ClaudeWorkspaceLocal = 'claude-workspace-local',
	AgentsWorkspace = 'agents-workspace',
	AgentsPersonal = 'agents-personal',
	ConfigWorkspace = 'config-workspace',
	ConfigPersonal = 'config-personal',
	ExtensionContribution = 'extension-contribution',
	ExtensionAPI = 'extension-api',
	Plugin = 'plugin',
}
