/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { isLinux } from 'vs/base/common/platform';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	'properties': {
		'window.systemColorTheme': {
			'type': 'string',
			'enum': ['default', 'auto', 'light', 'dark'],
			'enumDescriptions': [
				localize('window.systemColorTheme.default', "System color theme matches the configured OS theme."),
				localize('window.systemColorTheme.auto', "Enforce a light system color theme when a light workbench color theme is configured and the same for configured dark workbench color themes."),
				localize('window.systemColorTheme.light', "Enforce a light system color theme."),
				localize('window.systemColorTheme.dark', "Enforce a dark system color theme."),
			],
			'markdownDescription': localize('window.systemColorTheme', "The system color theme applies to native UI elements such as native dialogs, menus and title bar. Even if your OS is configured in light appearance mode, you can select a dark system color theme for the window. You can also configure to automatically adjust based on the `#workbench.colorTheme#` setting."),
			'default': 'default',
			'included': !isLinux, // not supported on Linux (https://github.com/electron/electron/issues/28887)
			'scope': ConfigurationScope.APPLICATION
		}
	}
});
