/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { DOCUMENTATION_URL, PROMPT_FILE_EXTENSION } from './constants.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

/**
 * Configuration helper for the `prompt files` feature.
 * @see {@link CONFIG_KEY} and {@link DEFAULT_LOCATION}
 *
 * ### Functions
 *
 * - {@link getValue} allows to current read configuration value
 * - {@link enabled} allows to check if the feature is enabled
 * - {@link sourceLocations} gets the source folder locations for prompt files
 *
 * ### Configuration Examples
 *
 * Enable the feature, using defaults for prompt files source folder locations
 * (see {@link DEFAULT_LOCATION}):
 * ```json
 * {
 *   "chat.promptFiles": true,
 * }
 * ```
 *
 * Enable the feature, specifying a single prompt files source folder location:
 * ```json
 * {
 *   "chat.promptFiles": '.github/prompts',
 * }
 * ```
 *
 * Enable the feature, specifying multiple prompt files source folder location:
 * ```json
 * {
 *   "chat.promptFiles": {
 *     ".github/prompts" : true,
 *     ".copilot/prompts" : false,
 *     "/Users/legomushroom/repos/prompts" : true,
 *   },
 * }
 * ```
 *
 * Enable the feature, specifying multiple prompt files source folder location:
 * ```json
 * {
 *   "chat.promptFiles": [
 *     ".github/prompts",
 *     ".copilot/prompts",
 *     "/Users/legomushroom/repos/prompts",
 *   ],
 * }
 * ```
 *
 * The "array" case is similar to the "object" one, but there is one difference.
 * At the time of writing, configuration settings with the `array` value cannot
 * be merged into a single entry when the setting is specified in both the user
 * and the workspace settings. On the other hand, the "object" case is provides
 * flexibility - the settings are combined into a single object.
 *
 * Enable the feature, using defaults for prompt files source folder locations
 * (see {@link DEFAULT_LOCATION}):
 * ```json
 * {
 *   "chat.promptFiles": {},
 * }
 * ```
 *
 * See the next section for details on how we treat the config value.
 *
 * ### Possible Values
 *
 * - `undefined`/`null`: feature is disabled
 * - `boolean`:
 *   - `true`: feature is enabled, prompt files source folder locations
 *             fallback to {@link DEFAULT_LOCATION}
 *   - `false`: feature is disabled
 * - `string`:
 *   - values that can be mapped to `boolean`(`"true"`, `"FALSE", "TrUe"`, etc.)
 *     are treated the same as the `boolean` case above
 *   - any other `non-empty` string value is treated as a single prompt files source folder path
 *   - `empty` string value is treated the same as the `undefined`/`null` case above
 * - `object`:
 *   - expects the { "string": `boolean` } pairs, where the `string` is a path and the `boolean`
 *     is a flag that defines if the source folder location is enable or disabled
 *   - value of a record in the object can also be a `string`:
 *     - if the string can be clearly mapped to a `boolean` (e.g., `"true"`, `"FALSE", "TrUe"`, etc.),
 *       it is treated as `boolean` value
 *     - any other string value is treated as `false` and is effectively ignored
 *   - if the record key is an `empty` string, it is ignored
 *   - if the resulting object is empty, the feature is considered `enabled`, prompt files source
 *     folder locations fallback to {@link DEFAULT_LOCATION}
 * - `array`:
 *   - `string` items in the array are treated as prompt files source folder paths
 *   - all `non-string` items in the array are `ignored`
 *   - if the resulting array is empty, the feature is considered `enabled`, prompt files
 *     source folder locations fallback to {@link DEFAULT_LOCATION}
 *
 * ### File Paths Resolution
 *
 * We resolve only `*.prompt.md` files inside the resulting source folder locations and
 * all `relative` folder paths are resolved relative to:
 *
 * - the current workspace `root`, if applicable, in other words one of the workspace folders
 *   can be used as a prompt files source folder
 * - root of each top-level folder in the workspace (if there are multiple workspace folders)
 * - current root folder (if a single folder is open)
 */
export namespace PromptFilesConfig {
	/**
	 * Configuration key for the `prompt files` feature (also
	 * known as `prompt files`, `prompt instructions`, etc.).
	 */
	export const CONFIG_KEY: string = 'chat.promptFiles';

	/**
	 * Default prompt instructions source folder paths.
	 */
	const DEFAULT_LOCATION = Object.freeze(['.github/prompts']);

	/**
	 * Get value of the `prompt files` configuration setting.
	 */
	export const getValue = (
		configService: IConfigurationService,
	): string | readonly string[] | boolean | undefined => {
		const configValue = configService.getValue(CONFIG_KEY);

		if (configValue === undefined || configValue === null) {
			return undefined;
		}

		if (typeof configValue === 'string') {
			const trimmedValue = configValue.trim();
			const lowercasedValue = trimmedValue.toLowerCase();

			if (!lowercasedValue) {
				return undefined;
			}

			if (asBoolean(lowercasedValue) !== undefined) {
				return asBoolean(lowercasedValue);
			}

			return trimmedValue;
		}

		if (typeof configValue === 'boolean') {
			return configValue;
		}

		if (Array.isArray(configValue)) {
			const cleanArray = configValue.filter((item) => {
				return typeof item === 'string' && !!item.trim();
			});

			return Object.freeze(cleanArray);
		}

		// note! this would be also true for `null` and `array`,
		// 		 but those cases are already handled above
		if (typeof configValue === 'object') {
			const paths: string[] = [];

			for (const [path, value] of Object.entries(configValue)) {
				const cleanPath = path.trim();
				if (asBoolean(value) && cleanPath) {
					paths.push(cleanPath);
				}
			}

			return Object.freeze(paths);
		}

		return undefined;
	};

	/**
	 * Checks if feature is enabled.
	 */
	export const enabled = (
		configService: IConfigurationService,
	): boolean => {
		const value = getValue(configService);

		return value !== undefined && value !== false;
	};

	/**
	 * Gets the source folder locations for prompt files.
	 * Defaults to {@link DEFAULT_LOCATION}.
	 */
	export const sourceLocations = (
		configService: IConfigurationService,
	): readonly string[] => {
		const value = getValue(configService);

		if (value === undefined) {
			return DEFAULT_LOCATION;
		}

		if (typeof value === 'string') {
			return Object.freeze([value]);
		}

		if (Array.isArray(value) && value.length !== 0) {
			return value;
		}

		return DEFAULT_LOCATION;
	};

	const usageExample1 = nls.localize(
		`chat.promptFiles.config.description.example1`,
		"Enable with the default location of the prompt files (`{0}`):\n{1}",
		DEFAULT_LOCATION[0],
		`\`\`\`json\n{\n  "${CONFIG_KEY}": true,\n}\n\`\`\``,
	);
	const usageExample2 = nls.localize(
		`chat.promptFiles.config.description.example2`,
		"Specify custom location(s) of the prompt files:\n{0}",
		`\`\`\`json\n{\n  "${CONFIG_KEY}": {\n    ".github/prompts": true,\n    "/Users/vscode/prompts": true,\n}\n\`\`\``,
	);

	/**
	 * Configuration setting description to use in the settings UI.
	 */
	export const CONFIG_DESCRIPTION = nls.localize(
		'chat.promptFiles.config.description',
		"Enable support for attaching reusable prompt files (`*{0}`) for Chat, Edits, and Inline Chat sessions. [Learn More]({1}).\n\nSet to `true` or use the `{ \"/path/to/folder\": boolean }` notation to specify a different path (or a couple of them). Relative paths are resolved from the root folder(s) of your workspace, and the default value of `{2}` is used if no other paths provided.\n#### Examples\n{3}\n{4}",
		PROMPT_FILE_EXTENSION,
		DOCUMENTATION_URL,
		DEFAULT_LOCATION[0],
		usageExample1,
		usageExample2,
	);

	/**
	 * Configuration setting title to use in the settings UI.
	 */
	export const CONFIG_TITLE = nls.localize(
		`chat.promptFiles.config.title`,
		"Prompt Files",
	);
}

/**
 * Helper to parse an input value of `any` type into a boolean.
 *
 * @param value - input value to parse
 * @returns `true` if the value is a boolean `true` or a string that can
 * 			be clearly mapped to a boolean (e.g., `"true"`, `"TRUE"`, `"FaLSe"`, etc.),
 * 			`undefined` for rest of the values
 */
function asBoolean(value: any): boolean | undefined {
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
