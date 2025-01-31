/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
 *   "chat.experimental.promptSnippets": true,
 * }
 * ```
 *
 * Enable the feature, specifying a single prompt files source folder location:
 * ```json
 * {
 *   "chat.experimental.promptSnippets": '.github/prompts',
 * }
 * ```
 *
 * Enable the feature, specifying multiple prompt files source folder location:
 * ```json
 * {
 *   "chat.experimental.promptSnippets": {
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
 *   "chat.experimental.promptSnippets": [
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
 *   "chat.experimental.promptSnippets": {},
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
	 * Documentation link for the prompt snippets feature.
	 */
	export const DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-prompt-snippets';

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
			const cleanValue = configValue.trim().toLowerCase();

			if (!cleanValue) {
				return undefined;
			}

			if (asBoolean(cleanValue) !== undefined) {
				return asBoolean(cleanValue);
			}

			return cleanValue;
		}

		if (typeof configValue === 'boolean') {
			return configValue;
		}

		if (Array.isArray(configValue)) {
			return configValue.filter((item) => {
				return typeof item === 'string';
			});
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
