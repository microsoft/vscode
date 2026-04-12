/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { PromptFileSource, PromptsType } from '../promptTypes.js';
import { getPromptFileDefaultLocations } from './promptFileLocations.js';
import { PromptsStorage } from '../service/promptsService.js';
/**
 * Configuration helper for the `reusable prompts` feature.
 * @see {@link PromptsConfig.PROMPT_LOCATIONS_KEY}, {@link PromptsConfig.INSTRUCTIONS_LOCATION_KEY}, {@link PromptsConfig.MODE_LOCATION_KEY}, or {@link PromptsConfig.PROMPT_FILES_SUGGEST_KEY}.
 *
 * ### Functions
 *
 * - {@link getLocationsValue} allows to current read configuration value
 * - {@link promptSourceFolders} gets list of source folders for prompt files
 * - {@link getPromptFilesRecommendationsValue} gets prompt file recommendation configuration
 *
 * ### File Paths Resolution
 *
 * We resolve only `*.prompt.md` files inside the resulting source folders. Relative paths are resolved
 * relative to:
 *
 * - the current workspace `root`, if applicable, in other words one of the workspace folders
 *   can be used as a prompt files source folder
 * - root of each top-level folder in the workspace (if there are multiple workspace folders)
 * - current root folder (if a single folder is open)
 *
 * ### Prompt File Suggestions
 *
 * The `chat.promptFilesRecommendations` setting allows configuring which prompt files to suggest in different contexts:
 *
 * ```json
 * {
 *   "chat.promptFilesRecommendations": {
 *     "plan": true,                            // Always suggest
 *     "new-page": "resourceExtname == .js",    // Suggest for JavaScript files
 *     "draft-blog": "resourceLangId == markdown", // Suggest for Markdown files
 *     "debug": false                           // Never suggest
 *   }
 * }
 * ```
 */
export var PromptsConfig;
(function (PromptsConfig) {
    /**
     * Configuration key for the locations of reusable prompt files.
     */
    PromptsConfig.PROMPT_LOCATIONS_KEY = 'chat.promptFilesLocations';
    /**
     * Configuration key for the locations of instructions files.
     */
    PromptsConfig.INSTRUCTIONS_LOCATION_KEY = 'chat.instructionsFilesLocations';
    /**
     * Configuration key for the locations of mode files.
     * @deprecated Use {@link AGENTS_LOCATION_KEY} instead
     */
    PromptsConfig.MODE_LOCATION_KEY = 'chat.modeFilesLocations';
    /**
     * Configuration key for the locations of agent files (with simplified path support).
     */
    PromptsConfig.AGENTS_LOCATION_KEY = 'chat.agentFilesLocations';
    /**
     * Configuration key for the locations of skill folders.
     */
    PromptsConfig.SKILLS_LOCATION_KEY = 'chat.agentSkillsLocations';
    /**
     * Configuration key for the locations of hook files.
     */
    PromptsConfig.HOOKS_LOCATION_KEY = 'chat.hookFilesLocations';
    /**
     * Configuration key for prompt file suggestions.
     */
    PromptsConfig.PROMPT_FILES_SUGGEST_KEY = 'chat.promptFilesRecommendations';
    /**
     * Configuration key for use of the copilot instructions file.
     */
    PromptsConfig.USE_COPILOT_INSTRUCTION_FILES = 'github.copilot.chat.codeGeneration.useInstructionFiles';
    /**
     * Configuration key for the AGENTS.md.
     */
    PromptsConfig.USE_AGENT_MD = 'chat.useAgentsMdFile';
    /**
     * Configuration key for nested AGENTS.md files.
     */
    PromptsConfig.USE_NESTED_AGENT_MD = 'chat.useNestedAgentsMdFiles';
    /**
     * Configuration key for the CLAUDE.md.
     */
    PromptsConfig.USE_CLAUDE_MD = 'chat.useClaudeMdFile';
    /**
     * Configuration key for agent skills usage.
     */
    PromptsConfig.USE_AGENT_SKILLS = 'chat.useAgentSkills';
    /**
     * Configuration key for chat hooks usage.
     */
    PromptsConfig.USE_CHAT_HOOKS = 'chat.useHooks';
    /**
     * Configuration key for enabling Claude hooks.
     */
    PromptsConfig.USE_CLAUDE_HOOKS = 'chat.useClaudeHooks';
    /**
     * Configuration key for enabling hooks defined in custom agent frontmatter.
     */
    PromptsConfig.USE_CUSTOM_AGENT_HOOKS = 'chat.useCustomAgentHooks';
    /**
     * Configuration key for enabling stronger skill adherence prompt (experimental).
     */
    PromptsConfig.USE_SKILL_ADHERENCE_PROMPT = 'chat.experimental.useSkillAdherencePrompt';
    /**
     * Configuration key for including applying instructions.
     */
    PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS = 'chat.includeApplyingInstructions';
    /**
     * Configuration key for including referenced instructions.
     */
    PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS = 'chat.includeReferencedInstructions';
    /**
     * Search for configuration files in parent repositories of the workspace folder
     */
    PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS = 'chat.useCustomizationsInParentRepositories';
    /**
     * Get value of the `reusable prompt locations` configuration setting.
     * @see {@link PROMPT_LOCATIONS_CONFIG_KEY}, {@link INSTRUCTIONS_LOCATIONS_CONFIG_KEY}, {@link MODE_LOCATIONS_CONFIG_KEY}, {@link SKILLS_LOCATION_KEY}.
     */
    function getLocationsValue(configService, type) {
        const key = getPromptFileLocationsConfigKey(type);
        const configValue = configService.getValue(key);
        if (configValue === undefined || configValue === null || Array.isArray(configValue)) {
            return undefined;
        }
        // note! this would be also true for `null` and `array`,
        // 		 but those cases are already handled above
        if (typeof configValue === 'object') {
            const paths = {};
            for (const [path, value] of Object.entries(configValue)) {
                const cleanPath = path.trim();
                const booleanValue = asBoolean(value);
                // if value can be mapped to a boolean, and the clean
                // path is not empty, add it to the map
                if ((booleanValue !== undefined) && cleanPath) {
                    paths[cleanPath] = booleanValue;
                }
            }
            return paths;
        }
        return undefined;
    }
    PromptsConfig.getLocationsValue = getLocationsValue;
    /**
     * Gets list of source folders for prompt files.
     * Defaults to {@link PROMPT_DEFAULT_SOURCE_FOLDER}, {@link INSTRUCTIONS_DEFAULT_SOURCE_FOLDER}, {@link MODE_DEFAULT_SOURCE_FOLDER} or {@link SKILLS_LOCATION_KEY}.
     */
    function promptSourceFolders(configService, type) {
        const value = getLocationsValue(configService, type);
        const defaultSourceFolders = getPromptFileDefaultLocations(type);
        // note! the `value &&` part handles the `undefined`, `null`, and `false` cases
        if (value && (typeof value === 'object')) {
            const paths = [];
            const defaultFolderPathsSet = new Set(defaultSourceFolders.map(f => f.path));
            // add default source folders that are not explicitly disabled
            for (const defaultFolder of defaultSourceFolders) {
                if (value[defaultFolder.path] !== false) {
                    paths.push(defaultFolder);
                }
            }
            // copy all the enabled paths to the result list
            for (const [path, enabledValue] of Object.entries(value)) {
                // we already added the default source folders, so skip them
                if ((enabledValue === false) || defaultFolderPathsSet.has(path)) {
                    continue;
                }
                // determine location type in the general case
                const storage = isTildePath(path) ? PromptsStorage.user : PromptsStorage.local;
                paths.push({ path, source: storage === PromptsStorage.local ? PromptFileSource.ConfigPersonal : PromptFileSource.ConfigWorkspace, storage });
            }
            return paths;
        }
        // `undefined`, `null`, and `false` cases
        return [];
    }
    PromptsConfig.promptSourceFolders = promptSourceFolders;
    /**
     * Get value of the prompt file recommendations configuration setting.
     * @param configService Configuration service instance
     * @param resource Optional resource URI to get workspace folder-specific settings
     * @see {@link PROMPT_FILES_SUGGEST_KEY}.
     */
    function getPromptFilesRecommendationsValue(configService, resource) {
        // Get the merged configuration value (VS Code automatically merges all levels: default → user → workspace → folder)
        const configValue = configService.getValue(PromptsConfig.PROMPT_FILES_SUGGEST_KEY, { resource });
        if (!configValue || typeof configValue !== 'object' || Array.isArray(configValue)) {
            return undefined;
        }
        const suggestions = {};
        for (const [promptName, value] of Object.entries(configValue)) {
            const cleanPromptName = promptName.trim();
            // Skip empty prompt names
            if (!cleanPromptName) {
                continue;
            }
            // Accept boolean values directly
            if (typeof value === 'boolean') {
                suggestions[cleanPromptName] = value;
                continue;
            }
            // Accept string values as when clauses
            if (typeof value === 'string') {
                const cleanValue = value.trim();
                if (cleanValue) {
                    suggestions[cleanPromptName] = cleanValue;
                }
                continue;
            }
            // Convert other truthy/falsy values to boolean
            const booleanValue = asBoolean(value);
            if (booleanValue !== undefined) {
                suggestions[cleanPromptName] = booleanValue;
            }
        }
        // Return undefined if no valid suggestions were found
        return Object.keys(suggestions).length > 0 ? suggestions : undefined;
    }
    PromptsConfig.getPromptFilesRecommendationsValue = getPromptFilesRecommendationsValue;
})(PromptsConfig || (PromptsConfig = {}));
export function getPromptFileLocationsConfigKey(type) {
    switch (type) {
        case PromptsType.instructions:
            return PromptsConfig.INSTRUCTIONS_LOCATION_KEY;
        case PromptsType.prompt:
            return PromptsConfig.PROMPT_LOCATIONS_KEY;
        case PromptsType.agent:
            return PromptsConfig.AGENTS_LOCATION_KEY;
        case PromptsType.skill:
            return PromptsConfig.SKILLS_LOCATION_KEY;
        case PromptsType.hook:
            return PromptsConfig.HOOKS_LOCATION_KEY;
        default:
            throw new Error('Unknown prompt type');
    }
}
/**
 * Helper to parse an input value of `any` type into a boolean.
 *
 * @param value - input value to parse
 * @returns `true` if the value is the boolean `true` value or a string that can
 * 			be clearly mapped to a boolean (e.g., `"true"`, `"TRUE"`, `"FaLSe"`, etc.),
 * 			`undefined` for rest of the values
 */
export function asBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const cleanValue = value.trim().toLowerCase();
        if (cleanValue === 'true') {
            return true;
        }
        if (cleanValue === 'false') {
            return false;
        }
        return undefined;
    }
    return undefined;
}
/**
 * Helper to check if a path starts with tilde (user home).
 * Only supports Unix-style (`~/`) paths for cross-platform sharing.
 * Backslash paths (`~\`) are not supported to ensure paths are shareable in repos.
 *
 * @param path - path to check
 * @returns `true` if the path starts with `~/`
 */
export function isTildePath(path) {
    return path.startsWith('~/');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSw2QkFBNkIsRUFBdUIsTUFBTSwwQkFBMEIsQ0FBQztBQUM5RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFOUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FrQ0c7QUFDSCxNQUFNLEtBQVcsYUFBYSxDQTJON0I7QUEzTkQsV0FBaUIsYUFBYTtJQUM3Qjs7T0FFRztJQUNVLGtDQUFvQixHQUFHLDJCQUEyQixDQUFDO0lBRWhFOztPQUVHO0lBQ1UsdUNBQXlCLEdBQUcsaUNBQWlDLENBQUM7SUFDM0U7OztPQUdHO0lBQ1UsK0JBQWlCLEdBQUcseUJBQXlCLENBQUM7SUFFM0Q7O09BRUc7SUFDVSxpQ0FBbUIsR0FBRywwQkFBMEIsQ0FBQztJQUU5RDs7T0FFRztJQUNVLGlDQUFtQixHQUFHLDJCQUEyQixDQUFDO0lBRS9EOztPQUVHO0lBQ1UsZ0NBQWtCLEdBQUcseUJBQXlCLENBQUM7SUFFNUQ7O09BRUc7SUFDVSxzQ0FBd0IsR0FBRyxpQ0FBaUMsQ0FBQztJQUUxRTs7T0FFRztJQUNVLDJDQUE2QixHQUFHLHdEQUF3RCxDQUFDO0lBRXRHOztPQUVHO0lBQ1UsMEJBQVksR0FBRyxzQkFBc0IsQ0FBQztJQUVuRDs7T0FFRztJQUNVLGlDQUFtQixHQUFHLDZCQUE2QixDQUFDO0lBRWpFOztPQUVHO0lBQ1UsMkJBQWEsR0FBRyxzQkFBc0IsQ0FBQztJQUVwRDs7T0FFRztJQUNV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