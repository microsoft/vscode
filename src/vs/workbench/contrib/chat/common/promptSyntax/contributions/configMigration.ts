/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
		// TODO: @legomushroom - merge object with potentially existent `promptFilesLocations` config
		const value = configService.getValue('chat.promptFiles');
		// const value2 = read('promptFiles');

		if ((value === undefined) || (value === null)) {
			return;
		}

		if (Array.isArray(value)) {
			configService.updateValue('chat.promptFiles', true);

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

			configService.updateValue('chat.promptFilesLocations', locationsValue);
			return;
		}

		if (typeof value === 'object') {
			configService.updateValue('chat.promptFiles', true);
			configService.updateValue('chat.promptFilesLocations', value);

			return;
		}

		if (typeof value === 'string') {
			const booleanValue = asBoolean(value);
			if (booleanValue !== undefined) {
				return;
			}

			configService.updateValue('chat.promptFiles', true);
			configService.updateValue('chat.promptFilesLocations', { [value]: true });
			return;
		}
	}
}
