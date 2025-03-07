/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorSettingMigration, ISettingsWriter } from '../../../../editor/browser/config/migrateOptions.js';
import { ConfigurationKeyValuePairs, Extensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';

Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration)
	.registerConfigurationMigrations(EditorSettingMigration.items.map(item => ({
		key: `editor.${item.key}`,
		migrateFn: (value, accessor) => {
			const configurationKeyValuePairs: ConfigurationKeyValuePairs = [];
			const writer: ISettingsWriter = (key, value) => configurationKeyValuePairs.push([`editor.${key}`, { value }]);
			item.migrate(value, key => accessor(`editor.${key}`), writer);
			return configurationKeyValuePairs;
		}
	})));
