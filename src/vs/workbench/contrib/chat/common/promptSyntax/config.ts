/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { DOCUMENTATION_URL, PROMPT_FILE_EXTENSION } from './constants.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

/**
 * `!Note!` This doc comment is deprecated and is set to be updated during `debt` week.
 *         The configuration value can now be one of `{ '/path/to/folder': boolean }` or 'null' types.
 *         This comment is tracked by [#13119](https://github.com/microsoft/vscode-copilot/issues/13119).
 *
 * Configuration helper for the `prompt files` feature.
 * @see {@link CONFIG_KEY} and {@link DEFAULT_SOURCE_FOLDER}
 *
 * ### Functions
 *
 * - {@link getValue} allows to current read configuration value
 * - {@link enabled} allows to check if the feature is enabled
 * - {@link promptSourceFolders} gets list of source folders for prompt files
 *
 * ### Configuration Examples
 *
 * Enable the feature, using defaults for prompt files source folders
 * (see {@link DEFAULT_SOURCE_FOLDER}):
 * ```json
 * {
 *   "chat.promptFiles": true,
 * }
 * ```
 *
 * Enable the feature, specifying a single prompt files source folders,
 * in addition to the default `'.github/prompts'` one:
 * ```json
 * {
 *   "chat.promptFiles": '.copilot/prompts',
 * }
 * ```
 *
 * Enable the feature, specifying multiple prompt files source folders,
 * in addition to the default `'.github/prompts'` one:
 * ```json
 * {
 *   "chat.promptFiles": {
 *     ".copilot/prompts" : false,
 *     "/Users/legomushroom/repos/prompts" : true,
 *   },
 * }
 * ```
 *
 * Enable the feature, specifying multiple prompt files source folders,
 * in addition to the default `'.github/prompts'` one:
 * ```json
 * {
 *   "chat.promptFiles": [
 *     ".copilot/prompts",
 *     "/Users/legomushroom/repos/prompts",
 *   ],
 * }
 * ```
 *
 * The "array" case is similar to the "object" one, but there is one difference.
 * At the time of writing, configuration settings with the `array` value cannot
 * be merged into a single entry when the setting is specified in both the `user`
 * and the `workspace` settings. On the other hand, the "object" case provides
 * more flexibility - the settings are combined into a single object.
 *
 * Enable the feature, using defaults for prompt files source folders
 * (see {@link DEFAULT_SOURCE_FOLDER}):
 * ```jsonc
 * {
 *   "chat.promptFiles": {}, // same as setting to `true`
 * }
 * ```
 *
 * See the next section for details on how we treat the config value.
 *
 * ### Possible Values
 *
 * - `undefined`/`null`: feature is disabled
 * - `boolean`:
 *   - `true`: feature is enabled, prompt files source folders
 *             fallback to {@link DEFAULT_SOURCE_FOLDER}
 *   - `false`: feature is disabled
 * - `string`:
 *   - values that can be mapped to `boolean`(`"true"`, `"FALSE", "TrUe"`, etc.)
 *     are treated the same as the `boolean` case above
 *   - any other `non-empty` string value is treated as a single prompt files source folder path,
 *     which is used in addition to the default {@link DEFAULT_SOURCE_FOLDER}
 *   - `empty` string value is treated the same as the `undefined`/`null` case above (disabled)
 * - `object`:
 *   - expects the { "string": `boolean` } pairs, where the `string` is a path and the `boolean`
 *     is a flag that defines if this additional source folder is enabled or disabled;
 *     enabled source folders are used in addition to the default {@link DEFAULT_SOURCE_FOLDER} path
 *     you can explicitly disable the default source folder by setting it to `false` in the object
 *   - value of a record in the object can also be a `string`:
 *     - if the string can be clearly mapped to a `boolean` (e.g., `"true"`, `"FALSE", "TrUe"`, etc.),
 *       it is treated as `boolean` value
 *     - any other string value is treated as `false` and is effectively ignored
 *   - if the record `key` is an `empty` string, it is ignored
 *   - if the resulting object is empty, the feature is considered `enabled`, prompt files source
 *     folders fallback to {@link DEFAULT_SOURCE_FOLDER}
 * - `array`:
 *   - `string` items(non-empty) in the array are treated as prompt files source folder paths,
 *     in addition to the default {@link DEFAULT_SOURCE_FOLDER} folder
 *   - all `non-string` items in the array are `ignored`
 *   - if the resulting array is empty, the feature is considered `enabled`, prompt files
 *     source folders fallback to {@link DEFAULT_SOURCE_FOLDER}
 *
 * ### File Paths Resolution
 *
 * We resolve only `*.prompt.md` files inside the resulting source folders and
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
	 * Default reusable prompt files source folder.
	 */
	export const DEFAULT_SOURCE_FOLDER = '.github/prompts';

	/**
	 * Get value of the `prompt files` configuration setting.
	 */
	export const getValue = (
		configService: IConfigurationService,
	): string | string[] | Record<string, boolean> | boolean | undefined => {
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

			return cleanArray;
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
	};

	/**
	 * Checks if the feature is enabled.
	 */
	export const enabled = (
		configService: IConfigurationService,
	): boolean => {
		const value = getValue(configService);

		return value !== undefined && value !== false;
	};

	/**
	 * Gets list of source folders for prompt files.
	 * Defaults to {@link DEFAULT_SOURCE_FOLDER}.
	 */
	export const promptSourceFolders = (
		configService: IConfigurationService,
	): string[] => {
		const value = getValue(configService);

		if (value === true) {
			return [DEFAULT_SOURCE_FOLDER];
		}

		if (typeof value === 'string') {
			const result = [DEFAULT_SOURCE_FOLDER];
			const trimmedValue = value.trim();

			if (trimmedValue !== DEFAULT_SOURCE_FOLDER) {
				result.push(trimmedValue);
			}

			return result;
		}

		if (Array.isArray(value)) {
			const result = [DEFAULT_SOURCE_FOLDER];

			return [
				...result,
				...value.filter((item) => {
					return item !== DEFAULT_SOURCE_FOLDER;
				}),
			];
		}

		// note! the `value &&` part handles the `undefined`, `null`, and `false` cases
		if (value && (typeof value === 'object')) {
			const paths: string[] = [];

			// if the default source folder is not explicitly disabled, add it
			if (value[DEFAULT_SOURCE_FOLDER] !== false) {
				paths.push(DEFAULT_SOURCE_FOLDER);
			}

			// copy all the enabled paths to the result list
			for (const [path, enabled] of Object.entries(value)) {
				if (enabled && path !== DEFAULT_SOURCE_FOLDER) {
					paths.push(path);
				}
			}

			return paths;
		}

		// `undefined`, `null`, and `false` cases
		return [];
	};

	/**
	 * Configuration setting description to use in the settings UI.
	 */
	export const CONFIG_DESCRIPTION = nls.localize(
		'chat.promptFiles.config.description',
		"Specify location(s) of reusable prompt files (`*{0}`) that can be attached in Chat, Edits, and Inline Chat sessions. [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.",
		PROMPT_FILE_EXTENSION,
		DOCUMENTATION_URL,
	);

	/**
	 * Configuration setting title to use in the settings UI.
	 */
	export const CONFIG_TITLE = nls.localize(
		'chat.promptFiles.config.title',
		"Prompt Files",
	);
}

/**
 * Helper to parse an input value of `any` type into a boolean.
 *
 * @param value - input value to parse
 * @returns `true` if the value is the boolean `true` value or a string that can
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
