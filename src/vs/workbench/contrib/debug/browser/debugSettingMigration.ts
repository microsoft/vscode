/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';

Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: 'debug.autoExpandLazyVariables',
		migrateFn: (value: boolean) => {
			if (value === true) {
				return { value: 'on' };
			} else if (value === false) {
				return { value: 'off' };
			}

			return [];
		}
	}]);
