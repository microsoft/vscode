/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../../../base/common/uri.js';
import { PromptsType } from '../promptTypes.js';
import { INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, PROMPT_DEFAULT_SOURCE_FOLDER, getPromptFileDefaultLocation } from './promptFileLocations.js';

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
export namespace PromptsConfig {
	/**
	 * Configuration key for the locations of reusable prompt files.
	 */
	export const PROMPT_LOCATIONS_KEY = 'chat.promptFilesLocations';

	/**
	 * Configuration key for the locations of instructions files.
	 */
	export const INSTRUCTIONS_LOCATION_KEY = 'chat.instructionsFilesLocations';
	/**
	 * Configuration key for the locations of mode files.
	 */
	export const MODE_LOCATION_KEY = 'chat.modeFilesLocations';

	/**
	 * Configuration key for prompt file suggestions.
	 */
	export const PROMPT_FILES_SUGGEST_KEY = 'chat.promptFilesRecommendations';

	/**
	 * Configuration key for use of the copilot instructions file.
	 */
	export const USE_COPILOT_INSTRUCTION_FILES = 'github.copilot.chat.codeGeneration.useInstructionFiles';

	/**
	 * Configuration key for the AGENTS.md.
	 */
	export const USE_AGENT_MD = 'chat.useAgentsMdFile';

	/**
	 * Configuration key for nested AGENTS.md files.
	 */
	export const USE_NESTED_AGENT_MD = 'chat.useNestedAgentsMdFiles';

	/**
	 * Get value of the `reusable prompt locations` configuration setting.
	 * @see {@link PROMPT_LOCATIONS_CONFIG_KEY}, {@link INSTRUCTIONS_LOCATIONS_CONFIG_KEY}, {@link MODE_LOCATIONS_CONFIG_KEY}.
	 */
	export function getLocationsValue(configService: IConfigurationService, type: PromptsType): Record<string, boolean> | undefined {
		const key = getPromptFileLocationsConfigKey(type);
		const configValue = configService.getValue(key);

		if (configValue === undefined || configValue === null || Array.isArray(configValue)) {
			return undefined;
		}

		// note! this would be also true for `null` and `array`,
		// 		 but those cases are already handled above
		if (typeof configValue === 'object') {
			const paths: Record<string, boolean> = {};

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

	/**
	 * Gets list of source folders for prompt files.
	 * Defaults to {@link PROMPT_DEFAULT_SOURCE_FOLDER}, {@link INSTRUCTIONS_DEFAULT_SOURCE_FOLDER} or {@link MODE_DEFAULT_SOURCE_FOLDER}.
	 */
	export function promptSourceFolders(configService: IConfigurationService, type: PromptsType): string[] {
		const value = getLocationsValue(configService, type);
		const defaultSourceFolder = getPromptFileDefaultLocation(type);

		// note! the `value &&` part handles the `undefined`, `null`, and `false` cases
		if (value && (typeof value === 'object')) {
			const paths: string[] = [];

			// if the default source folder is not explicitly disabled, add it
			if (value[defaultSourceFolder] !== false) {
				paths.push(defaultSourceFolder);
			}

			// copy all the enabled paths to the result list
			for (const [path, enabledValue] of Object.entries(value)) {
				// we already added the default source folder, so skip it
				if ((enabledValue === false) || (path === defaultSourceFolder)) {
					continue;
				}

				paths.push(path);
			}

			return paths;
		}

		// `undefined`, `null`, and `false` cases
		return [];
	}

	/**
	 * Get value of the prompt file recommendations configuration setting.
	 * @param configService Configuration service instance
	 * @param resource Optional resource URI to get workspace folder-specific settings
	 * @see {@link PROMPT_FILES_SUGGEST_KEY}.
	 */
	export function getPromptFilesRecommendationsValue(configService: IConfigurationService, resource?: URI): Record<string, boolean | string> | undefined {
		// Get the merged configuration value (VS Code automatically merges all levels: default → user → workspace → folder)
		const configValue = configService.getValue(PromptsConfig.PROMPT_FILES_SUGGEST_KEY, { resource });

		if (!configValue || typeof configValue !== 'object' || Array.isArray(configValue)) {
			return undefined;
		}

		const suggestions: Record<string, boolean | string> = {};

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

}

export function getPromptFileLocationsConfigKey(type: PromptsType): string {
	switch (type) {
		case PromptsType.instructions:
			return PromptsConfig.INSTRUCTIONS_LOCATION_KEY;
		case PromptsType.prompt:
			return PromptsConfig.PROMPT_LOCATIONS_KEY;
		case PromptsType.agent:
			return PromptsConfig.MODE_LOCATION_KEY;
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
export function asBoolean(value: unknown): boolean | undefined {
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
