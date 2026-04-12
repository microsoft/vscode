/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename, dirname } from '../../../../../../base/common/resources.js';
import { PromptFileSource, PromptsType } from '../promptTypes.js';
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
 * Regex for valid skill names: lowercase alphanumeric and hyphens only.
 */
export const VALID_SKILL_NAME_REGEX = /^[a-z0-9-]+$/;
/**
 * AGENT file name
 */
export const AGENT_MD_FILENAME = 'AGENTS.md';
/**
 * Claude file name.
 */
export const CLAUDE_MD_FILENAME = 'CLAUDE.md';
/**
 * Claude local file name.
 */
export const CLAUDE_LOCAL_MD_FILENAME = 'CLAUDE.local.md';
/**
 * Claude configuration folder name.
 */
export const CLAUDE_CONFIG_FOLDER = '.claude';
/**
 * Copilot custom instructions file name.
 */
export const COPILOT_CUSTOM_INSTRUCTIONS_FILENAME = 'copilot-instructions.md';
/**
 * GitHub configuration folder name.
 */
export const GITHUB_CONFIG_FOLDER = '.github';
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
 * Claude agents folder.
 */
export const CLAUDE_AGENTS_SOURCE_FOLDER = '.claude/agents';
/**
 * Copilot user agents folder.
 */
export const COPILOT_USER_AGENTS_SOURCE_FOLDER = '~/.copilot/agents';
/**
 * Claude rules folder.
 */
export const CLAUDE_RULES_SOURCE_FOLDER = '.claude/rules';
/**
 * Hooks folder.
 */
export const HOOKS_SOURCE_FOLDER = '.github/hooks';
/**
 * All default skill source folders (both workspace and user home).
 */
export const DEFAULT_SKILL_SOURCE_FOLDERS = [
    { path: '.github/skills', source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
    { path: '.agents/skills', source: PromptFileSource.AgentsWorkspace, storage: PromptsStorage.local },
    { path: '.claude/skills', source: PromptFileSource.ClaudeWorkspace, storage: PromptsStorage.local },
    { path: '~/.copilot/skills', source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user },
    { path: '~/.agents/skills', source: PromptFileSource.AgentsPersonal, storage: PromptsStorage.user },
    { path: '~/.claude/skills', source: PromptFileSource.ClaudePersonal, storage: PromptsStorage.user },
];
/**
 * Default instructions source folders.
 */
export const DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS = [
    { path: INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
    { path: CLAUDE_RULES_SOURCE_FOLDER, source: PromptFileSource.ClaudeWorkspace, storage: PromptsStorage.local },
    { path: '~/.copilot/instructions', source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user },
    { path: '~/' + CLAUDE_RULES_SOURCE_FOLDER, source: PromptFileSource.ClaudePersonal, storage: PromptsStorage.user },
];
/**
 * Default prompt source folders.
 */
export const DEFAULT_PROMPT_SOURCE_FOLDERS = [
    { path: PROMPT_DEFAULT_SOURCE_FOLDER, source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
];
/**
 * Default agent source folders.
 */
export const DEFAULT_AGENT_SOURCE_FOLDERS = [
    { path: AGENTS_SOURCE_FOLDER, source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
    { path: CLAUDE_AGENTS_SOURCE_FOLDER, source: PromptFileSource.ClaudeWorkspace, storage: PromptsStorage.local },
    { path: '~/' + CLAUDE_AGENTS_SOURCE_FOLDER, source: PromptFileSource.ClaudePersonal, storage: PromptsStorage.user },
    { path: COPILOT_USER_AGENTS_SOURCE_FOLDER, source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user },
];
/**
 * Default hook file paths.
 * Entries can be either a directory or a specific file path (.json)
 */
export const DEFAULT_HOOK_FILE_PATHS = [
    { path: '.github/hooks', source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
    { path: '.claude/settings.local.json', source: PromptFileSource.ClaudeWorkspaceLocal, storage: PromptsStorage.local },
    { path: '.claude/settings.json', source: PromptFileSource.ClaudeWorkspace, storage: PromptsStorage.local },
    { path: '~/.copilot/hooks', source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user },
    { path: '~/.claude/settings.json', source: PromptFileSource.ClaudePersonal, storage: PromptsStorage.user },
];
/**
 * Helper function to check if a file is directly in the .github/agents/ folder (not in subfolders).
 */
function isInAgentsFolder(fileUri) {
    const dir = dirname(fileUri).path;
    return dir.endsWith('/' + AGENTS_SOURCE_FOLDER) || dir.endsWith('/' + CLAUDE_AGENTS_SOURCE_FOLDER) || isInCopilotAgentsFolder(fileUri);
}
/**
 * Helper function to check if a file is directly in the .claude/agents/ folder.
 */
export function isInClaudeAgentsFolder(fileUri) {
    const dir = dirname(fileUri).path;
    return dir.endsWith('/' + CLAUDE_AGENTS_SOURCE_FOLDER);
}
/**
 * Helper function to check if a file is directly in the ~/.copilot/agents/ folder.
 */
export function isInCopilotAgentsFolder(fileUri) {
    const dir = dirname(fileUri).path;
    return dir.endsWith(COPILOT_USER_AGENTS_SOURCE_FOLDER.substring(1));
}
/**
 * Helper function to check if a file is inside the .claude/rules/ folder (including subfolders).
 * Claude rules files (.md) in this folder are treated as instruction files.
 */
export function isInClaudeRulesFolder(fileUri) {
    const path = fileUri.path;
    return path.includes('/' + CLAUDE_RULES_SOURCE_FOLDER + '/');
}
/**
 * Gets the prompt file type from the provided path.
 *
 * Note: This function assumes the URI is already known to be a prompt file
 * (e.g., from a configured prompt source folder). It does not validate that
 * arbitrary URIs are prompt files - for example, any .json file will return
 * PromptsType.hook regardless of its location.
 */
export function getPromptFileType(fileUri) {
    const filename = basename(fileUri);
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
    // Check if it's a .md file inside the .claude/rules/ folder (including subfolders)
    // These are treated as instruction files
    if (filename.endsWith('.md') && filename !== 'README.md' && isInClaudeRulesFolder(fileUri)) {
        return PromptsType.instructions;
    }
    // Any .json file is treated as a hook file.
    // The caller is responsible for only passing URIs from valid prompt source folders.
    if (filename.toLowerCase().endsWith('.json')) {
        return PromptsType.hook;
    }
    return undefined;
}
/**
 * Check if provided URI points to a file that with prompt file extension.
 */
export function isPromptOrInstructionsFile(fileUri) {
    return getPromptFileType(fileUri) !== undefined;
}
export function getPromptFileExtension(type) {
    switch (type) {
        case PromptsType.instructions:
            return INSTRUCTION_FILE_EXTENSION;
        case PromptsType.prompt:
            return PROMPT_FILE_EXTENSION;
        case PromptsType.agent:
            return AGENT_FILE_EXTENSION;
        case PromptsType.skill:
            return SKILL_FILENAME;
        case PromptsType.hook:
            return '.json';
        default:
            throw new Error('Unknown prompt type');
    }
}
export function getPromptFileDefaultLocations(type) {
    switch (type) {
        case PromptsType.instructions:
            return DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS;
        case PromptsType.prompt:
            return DEFAULT_PROMPT_SOURCE_FOLDERS;
        case PromptsType.agent:
            return DEFAULT_AGENT_SOURCE_FOLDERS;
        case PromptsType.skill:
            return DEFAULT_SKILL_SOURCE_FOLDERS;
        case PromptsType.hook:
            return DEFAULT_HOOK_FILE_PATHS;
        default:
            throw new Error('Unknown prompt type');
    }
}
export function getSkillFolderName(fileUri) {
    return basename(dirname(fileUri));
}
/**
 * Gets clean prompt name without file extension.
 */
export function getCleanPromptName(fileUri) {
    const fileName = basename(fileUri);
    const extensions = [
        PROMPT_FILE_EXTENSION,
        INSTRUCTION_FILE_EXTENSION,
        LEGACY_MODE_FILE_EXTENSION,
        AGENT_FILE_EXTENSION,
    ];
    for (const ext of extensions) {
        if (fileName.endsWith(ext)) {
            return basename(fileUri, ext);
        }
    }
    if (fileName === COPILOT_CUSTOM_INSTRUCTIONS_FILENAME) {
        return basename(fileUri, '.md');
    }
    // For SKILL.md files (case insensitive), return 'SKILL'
    if (fileName.toLowerCase() === SKILL_FILENAME.toLowerCase()) {
        return basename(fileUri, '.md');
    }
    // For .md files in .github/agents/ folder, treat them as agent files
    // Exclude README.md to allow documentation files
    if (fileName.endsWith('.md') && fileName !== 'README.md' && isInAgentsFolder(fileUri)) {
        return basename(fileUri, '.md');
    }
    // For .md files in .claude/rules/ folder, treat them as instruction files
    if (fileName.endsWith('.md') && fileName !== 'README.md' && isInClaudeRulesFolder(fileUri)) {
        return basename(fileUri, '.md');
    }
    // because we now rely on the `prompt` language ID that can be explicitly
    // set for any document in the editor, any file can be a "prompt" file, so
    // to account for that, we return the full file name including the file
    // extension for all other cases
    return basename(fileUri);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZUxvY2F0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxXQUFXLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFOUQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBRyxZQUFZLENBQUM7QUFFbEQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxrQkFBa0IsQ0FBQztBQUU3RDs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUFHLGNBQWMsQ0FBQztBQUV6RDs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLFdBQVcsQ0FBQztBQUVoRDs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUM7QUFFekM7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxjQUFjLENBQUM7QUFFckQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxXQUFXLENBQUM7QUFFN0M7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBRyxXQUFXLENBQUM7QUFFOUM7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBRyxpQkFBaUIsQ0FBQztBQUUxRDs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLG9C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