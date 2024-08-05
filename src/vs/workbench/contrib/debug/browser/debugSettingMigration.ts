/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IConfigurationMigrationRegistry } from 'vs/workbench/common/configuration';

Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: 'debug.autoExpandLazyVariables',
		migrateFn: (value: boolean) => {
			let newValue: string | undefined;
			if (value === true) {
				newValue = 'on';
			} else if (value === false) {
				newValue = 'off';
			}
			return [
				['debug.autoExpandLazyVariables', { value: newValue }],
			];
		}
	}]);
