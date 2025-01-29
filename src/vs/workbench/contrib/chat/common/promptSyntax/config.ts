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
 *   "chat.experimental.promptSnippets": [
 *     '.github/prompts',
 *     '.copilot/prompts',
 *     '/Users/legomushroom/repos/prompts',
 *   ],
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
 *     are treated as `boolean` above
 *   - any other `non-empty` string value is treated as a single prompt files source folder path
 * - `array`:
 *   - `string` items in the array are treated as prompt files source folder paths
 *   - all `non-string` items in the array are `ignored`
 *   - if the resulting array is empty, the feature is considered `enabled`, prompt files source
 *     folder locations fallback to defaults (see {@linkcode DEFAULT_LOCATION})
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
	const DEFAULT_LOCATION = ['.github/prompts'];

	/**
	 * Get value of the `prompt files` configuration setting.
	 */
	export const getValue = (
		configService: IConfigurationService,
	): string | readonly string[] | boolean | undefined => {
		const value = configService.getValue(CONFIG_KEY);

		if (value === undefined || value === null) {
			return undefined;
		}

		if (typeof value === 'string') {
			const cleanValue = value.trim().toLowerCase();
			if (cleanValue === 'true') {
				return true;
			}

			if (cleanValue === 'false') {
				return false;
			}

			if (!cleanValue) {
				return undefined;
			}

			return value;
		}

		if (typeof value === 'boolean') {
			return value;
		}

		if (Array.isArray(value)) {
			return value.filter((item) => {
				return typeof item === 'string';
			});
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
			return [value];
		}

		if (Array.isArray(value)) {
			if (value.length !== 0) {
				return value;
			}

			return DEFAULT_LOCATION;
		}

		return DEFAULT_LOCATION;
	};
}
