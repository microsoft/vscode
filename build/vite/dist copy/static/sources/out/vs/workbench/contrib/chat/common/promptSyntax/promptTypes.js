/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
export const ALL_PROMPTS_LANGUAGE_SELECTOR = [PROMPT_LANGUAGE_ID, INSTRUCTIONS_LANGUAGE_ID, AGENT_LANGUAGE_ID, SKILL_LANGUAGE_ID];
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
export function getLanguageIdForPromptsType(type) {
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
export function getPromptsTypeForLanguageId(languageId) {
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
export var PromptsType;
(function (PromptsType) {
    PromptsType["instructions"] = "instructions";
    PromptsType["prompt"] = "prompt";
    PromptsType["agent"] = "agent";
    PromptsType["skill"] = "skill";
    PromptsType["hook"] = "hook";
})(PromptsType || (PromptsType = {}));
export function isValidPromptType(type) {
    return Object.values(PromptsType).includes(type);
}
export var Target;
(function (Target) {
    Target["VSCode"] = "vscode";
    Target["GitHubCopilot"] = "github-copilot";
    Target["Claude"] = "claude";
    Target["Undefined"] = "undefined";
})(Target || (Target = {}));
/**
 * Tracks where prompt files originate from.
 */
export var PromptFileSource;
(function (PromptFileSource) {
    PromptFileSource["GitHubWorkspace"] = "github-workspace";
    PromptFileSource["CopilotPersonal"] = "copilot-personal";
    PromptFileSource["ClaudePersonal"] = "claude-personal";
    PromptFileSource["ClaudeWorkspace"] = "claude-workspace";
    PromptFileSource["ClaudeWorkspaceLocal"] = "claude-workspace-local";
    PromptFileSource["AgentsWorkspace"] = "agents-workspace";
    PromptFileSource["AgentsPersonal"] = "agents-personal";
    PromptFileSource["ConfigWorkspace"] = "config-workspace";
    PromptFileSource["ConfigPersonal"] = "config-personal";
    PromptFileSource["ExtensionContribution"] = "extension-contribution";
    PromptFileSource["ExtensionAPI"] = "extension-api";
    PromptFileSource["Plugin"] = "plugin";
})(PromptFileSource || (PromptFileSource = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0VHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEc7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBRyw0Q0FBNEMsQ0FBQztBQUNyRixNQUFNLENBQUMsTUFBTSw4QkFBOEIsR0FBRyxnREFBZ0QsQ0FBQztBQUMvRixNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyw4Q0FBOEMsQ0FBQyxDQUFDLE9BQU87QUFDOUYsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsb0NBQW9DLENBQUM7QUFDNUUsbUNBQW1DO0FBQ25DLE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLGtDQUFrQyxDQUFDO0FBRXpFOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsUUFBUSxDQUFDO0FBRTNDOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsY0FBYyxDQUFDO0FBRXZEOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsV0FBVyxDQUFDO0FBRTdDOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsT0FBTyxDQUFDO0FBRXpDOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQXFCLENBQUMsa0JBQWtCLEVBQUUsd0JBQXdCLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztBQUVwSjs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLCtCQUErQixHQUFHLDJDQUEyQyxDQUFDO0FBRTNGOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sNENBQTRDLEdBQUcsdURBQXVELENBQUM7QUFFcEg7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