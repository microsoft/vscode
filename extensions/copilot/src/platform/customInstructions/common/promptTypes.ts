/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What the prompt is used for.
 */
export enum PromptsType {
	instructions = 'instructions',
	prompt = 'prompt',
	agent = 'agent',
	skill = 'skill'
}

export const INSTRUCTIONS_LOCATION_KEY = 'chat.instructionsFilesLocations';
export const SKILLS_LOCATION_KEY = 'chat.agentSkillsLocations';

export const WORKSPACE_SKILL_FOLDERS = ['.github/skills', '.claude/skills'];
export const PERSONAL_SKILL_FOLDERS = ['.copilot/skills', '.claude/skills'];
export const USE_AGENT_SKILLS_SETTING = 'chat.useAgentSkills';
export const USE_SKILL_ADHERENCE_PROMPT_SETTING = 'chat.experimental.useSkillAdherencePrompt';

export const COPILOT_INSTRUCTIONS_PATH = '.github/copilot-instructions.md';

/**
 * File extension for the reusable prompt files.
 */
export const PROMPT_FILE_EXTENSION = '.prompt.md';

/**
 * File extension for the reusable instruction files.
 */
export const INSTRUCTION_FILE_EXTENSION = '.instructions.md';

/**
 * File extension for the agent files.
 */
export const AGENT_FILE_EXTENSION = '.agent.md';

/**
 * Skill file name (case insensitive).
 */
export const SKILL_FILENAME = 'SKILL.md';
