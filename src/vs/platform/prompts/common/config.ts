/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr } from '../../contextkey/common/contextkey.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';

/**
 * Configuration helper for the `reusable prompts` feature.
 * @see {@link CONFIG_KEY} and {@link LOCATIONS_CONFIG_KEY}.
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
	/**
	 * Configuration key for the `reusable prompts` feature
	 * (also known as `prompt files`, `prompt instructions`, etc.).
	 */
	export const CONFIG_KEY: string = 'chat.promptFiles';

	/**
	 * Configuration key for the locations of reusable prompt files.
	 */
	export const LOCATIONS_CONFIG_KEY: string = 'chat.promptFilesLocations';

	/**
	 * Default reusable prompt files source folder.
	 */
	export const DEFAULT_SOURCE_FOLDER = '.github/prompts';

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
	 * @see {@link LOCATIONS_CONFIG_KEY}.
	 */
	export const getLocationsValue = (
		configService: IConfigurationService,
	): Record<string, boolean> | undefined => {
		const configValue = configService.getValue(LOCATIONS_CONFIG_KEY);

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
	 * Defaults to {@link DEFAULT_SOURCE_FOLDER}.
	 */
	export const promptSourceFolders = (
		configService: IConfigurationService,
	): string[] => {
		const value = getLocationsValue(configService);

		// note! the `value &&` part handles the `undefined`, `null`, and `false` cases
		if (value && (typeof value === 'object')) {
			const paths: string[] = [];

			// if the default source folder is not explicitly disabled, add it
			if (value[DEFAULT_SOURCE_FOLDER] !== false) {
				paths.push(DEFAULT_SOURCE_FOLDER);
			}

			// copy all the enabled paths to the result list
			for (const [path, enabled] of Object.entries(value)) {
				// we already added the default source folder, so skip it
				if ((enabled === false) || (path === DEFAULT_SOURCE_FOLDER)) {
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
