/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
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
