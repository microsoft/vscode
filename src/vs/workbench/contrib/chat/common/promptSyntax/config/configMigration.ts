/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../../base/common/assert.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { asBoolean, PromptsConfig } from './config.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

/**
 * Contribution that migrates the old config setting value to a new one.
 *
 * Note! This is a temporary logic and can be removed on ~2026-04-29.
 */
export class ConfigMigration implements IWorkbenchContribution {
	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configService: IConfigurationService,
	) {
		// migrate the old config setting value to a new one
		this.migrateConfig()
			.catch((error) => {
				this.logService.warn('failed to migrate config setting value.', error);
			});
	}

	/**
	 * The main function that implements the migration logic.
	 */
	private async migrateConfig(): Promise<void> {
		const value = await this.configService.getValue(PromptsConfig.KEY);

		// if setting is not set, nothing to do
		if ((value === undefined) || (value === null)) {
			return;
		}

		// if the setting value is a boolean, we don't need to do
		// anything since it is already a valid configuration value
		if ((typeof value === 'boolean') || (asBoolean(value) !== undefined)) {
			return;
		}

		// in the old setting logic an array of strings was treated
		// as a list of locations, so we need to migrate that
		if (Array.isArray(value)) {

			// copy array values into a map of paths
			const locationsValue: Record<string, boolean> = {};
			for (const filePath of value) {
				if (typeof filePath !== 'string') {
					continue;
				}
				const trimmedValue = filePath.trim();
				if (!trimmedValue) {
					continue;
				}

				locationsValue[trimmedValue] = true;
			}

			await this.configService.updateValue(PromptsConfig.KEY, true);
			await this.configService.updateValue(PromptsConfig.PROMPT_LOCATIONS_KEY, locationsValue);
			return;
		}

		// in the old setting logic an object was treated as a map
		// of `location -> boolean`, so we need to migrate that
		if (typeof value === 'object') {
			// sanity check on the contents of value variable - while
			// we've handled the 'null' case above this assertion is
			// here to prevent churn when this block is moved around
			assert(
				value !== null,
				'Object value must not be a null.',
			);

			// copy object values into a map of paths
			const locationsValue: Record<string, boolean> = {};
			for (const [location, enabled] of Object.entries(value)) {
				// if the old location enabled value wasn't a boolean
				// then ignore it as it is not a valid value
				if ((typeof enabled !== 'boolean') || (asBoolean(enabled) === undefined)) {
					continue;
				}

				const trimmedValue = location.trim();
				if (!trimmedValue) {
					continue;
				}

				locationsValue[trimmedValue] = enabled;
			}

			await this.configService.updateValue(PromptsConfig.KEY, true);
			await this.configService.updateValue(PromptsConfig.PROMPT_LOCATIONS_KEY, locationsValue);

			return;
		}

		// in the old setting logic a string was treated as a single
		// location path, so we need to migrate that
		if (typeof value === 'string') {
			// sanity check on the contents of value variable - while
			// we've handled the 'boolean' case above this assertion is
			// here to prevent churn when this block is moved around
			assert(
				asBoolean(value) === undefined,
				`String value must not be a boolean, got '${value}'.`,
			);

			await this.configService.updateValue(PromptsConfig.KEY, true);
			await this.configService.updateValue(PromptsConfig.PROMPT_LOCATIONS_KEY, { [value]: true });
			return;
		}
	}
}
