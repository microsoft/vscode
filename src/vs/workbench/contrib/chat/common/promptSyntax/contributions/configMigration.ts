/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../../base/common/assert.js';
import { asBoolean } from '../../../../../../platform/prompts/common/config.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

/**
 * TODO: @legomushroom
 */
export class ConfigMigration implements IWorkbenchContribution {
	constructor(
		@IConfigurationService configService: IConfigurationService,
	) {
		const value = configService.getValue('chat.promptFiles');
		const locationsValue = configService.getValue('chat.promptFilesLocations');

		// the setting split happened at the same time as the 'location'
		// setting was added, hence if the 'location' setting is present,
		// we don't need to do anything since user already has new settings
		if ((locationsValue !== undefined) && (locationsValue !== null)) {
			return;
		}

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

			configService.updateValue('chat.promptFiles', true);
			configService.updateValue('chat.promptFilesLocations', locationsValue);
			return;
		}

		// in the old setting logic an object was treated as a map
		// of `location -> boolean`, so we need to migrate that
		if (typeof value === 'object') {
			// TODO: @legomushroom
			assert(
				value !== null,
				'Object value must not be a null.',
			);


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

			configService.updateValue('chat.promptFiles', true);
			configService.updateValue('chat.promptFilesLocations', locationsValue);

			return;
		}

		// in the old setting logic a string was treated as a single
		// location path, so we need to migrate that
		if (typeof value === 'string') {
			// TODO: @legomushroom
			assert(
				asBoolean(value) === undefined,
				`String value must not be a boolean, got '${value}'.`,
			);

			configService.updateValue('chat.promptFiles', true);
			configService.updateValue('chat.promptFilesLocations', { [value]: true });
			return;
		}
	}
}
