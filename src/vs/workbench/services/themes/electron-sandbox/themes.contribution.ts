/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	'properties': {
		'window.systemColorTheme': {
			'type': 'string',
			'enum': ['default', 'light', 'dark'],
			'enumDescriptions': [
				localize('window.systemColorTheme.default', "System color theme matches the configured OS theme."),
				localize('window.systemColorTheme.light', "Enforce a light system color theme."),
				localize('window.systemColorTheme.dark', "Enforce a dark system color theme."),
			],
			'description': localize('window.systemColorTheme', "The system color theme applies to native UI elements such as dialogs and menus. Even if your OS is configured in light mode, you can select a dark system color theme."),
			'default': 'default',
			'scope': ConfigurationScope.APPLICATION
		}
	}
});
