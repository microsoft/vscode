/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr } from '../../contextkey/common/contextkey.js';
import type { IConfigurationService } from '../../configuration/common/configuration.js';
import { CONFIG_KEY, PROMPT_DEFAULT_SOURCE_FOLDER, INSTRUCTIONS_LOCATIONS_CONFIG_KEY, PROMPT_LOCATIONS_CONFIG_KEY, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER } from './constants.js';

/**
 * Configuration helper for the `reusable prompts` feature.
 * @see {@link CONFIG_KEY},  {@link PROMPT_LOCATIONS_CONFIG_KEY} and {@link INSTRUCTIONS_LOCATIONS_CONFIG_KEY}.
 *
 * ### Functions
 *
 * - {@link enabled} allows to check if the feature is enabled
 * - {@link getLocationsValue} allows to current read configuration value
 * - {@link promptSourceFolders} gets list of source folders for prompt files
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
 */
export namespace PromptsConfig {
	export const KEY = CONFIG_KEY;
	export const PROMPT_LOCATIONS_KEY = PROMPT_LOCATIONS_CONFIG_KEY;
	export const INSTRUCTIONS_LOCATION_KEY = INSTRUCTIONS_LOCATIONS_CONFIG_KEY;

	/**
	 * Checks if the feature is enabled.
	 * @see {@link CONFIG_KEY}.
	 */
	export const enabled = (
		configService: IConfigurationService,
	): boolean => {
		const enabledValue = configService.getValue(CONFIG_KEY);

		return asBoolean(enabledValue) ?? false;
	};

	/**
	 * Context key expression for the `reusable prompts` feature `enabled` status.
	 */
	export const enabledCtx = ContextKeyExpr.equals(`config.${CONFIG_KEY}`, true);

	/**
	 * Get value of the `reusable prompt locations` configuration setting.
	 * @see {@link PROMPT_LOCATIONS_CONFIG_KEY} or  {@link INSTRUCTIONS_LOCATIONS_CONFIG_KEY}.
	 */
	export const getLocationsValue = (
		configService: IConfigurationService,
		type: 'instructions' | 'prompt'
	): Record<string, boolean> | undefined => {
		const key = type === 'instructions' ? INSTRUCTIONS_LOCATIONS_CONFIG_KEY : PROMPT_LOCATIONS_CONFIG_KEY;
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
	};

	/**
	 * Gets list of source folders for prompt files.
	 * Defaults to {@link PROMPT_DEFAULT_SOURCE_FOLDER} or {@link INSTRUCTIONS_DEFAULT_SOURCE_FOLDER}.
	 */
	export const promptSourceFolders = (
		configService: IConfigurationService,
		type: 'instructions' | 'prompt'
	): string[] => {
		const value = getLocationsValue(configService, type);
		const defaultSourceFolder = type === 'instructions' ? INSTRUCTIONS_DEFAULT_SOURCE_FOLDER : PROMPT_DEFAULT_SOURCE_FOLDER;

		// note! the `value &&` part handles the `undefined`, `null`, and `false` cases
		if (value && (typeof value === 'object')) {
			const paths: string[] = [];

			// if the default source folder is not explicitly disabled, add it
			if (value[defaultSourceFolder] !== false) {
				paths.push(defaultSourceFolder);
			}

			// copy all the enabled paths to the result list
			for (const [path, enabled] of Object.entries(value)) {
				// we already added the default source folder, so skip it
				if ((enabled === false) || (path === defaultSourceFolder)) {
					continue;
				}

				paths.push(path);
			}

			return paths;
		}

		// `undefined`, `null`, and `false` cases
		return [];
	};
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
