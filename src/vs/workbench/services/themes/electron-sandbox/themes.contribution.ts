/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { ENABLE_SYSTEM_COLOR_SCHEME_SETTING, ThemeSettings } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { COLOR_THEME_CONFIGURATION_SETTINGS_TAG, formatSettingAsLink } from 'vs/workbench/services/themes/common/themeConfiguration';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	properties: {
		[ThemeSettings.SYSTEM_COLOR_THEME]: {
			type: 'string',
			enum: ['default', 'matchColorTheme', 'light', 'dark'],
			enumDescriptions: [
				localize('window.systemColorTheme.default', "System color theme matches the configured OS theme."),
				localize('window.systemColorTheme.matchColorTheme', "Enforce a light system color theme when a light workbench color theme is configured and the same for configured dark workbench color themes."),
				localize('window.systemColorTheme.light', "Enforce a light system color theme."),
				localize('window.systemColorTheme.dark', "Enforce a dark system color theme."),
			],
			markdownDescription: localize({ key: 'window.systemColorTheme', comment: ['{0} and {1} will become links to other settings.'] }, "Overrides the system color theme that is used for native UI elements such as native dialogs, menus and title bar. Even if your OS is configured in light appearance mode, you can select a dark system color theme for the window. You can also configure to automatically adjust based on the {0} setting. Note: Using this setting will disable {1}", formatSettingAsLink(ThemeSettings.COLOR_THEME), formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
			default: 'default',
			included: ENABLE_SYSTEM_COLOR_SCHEME_SETTING,
			scope: ConfigurationScope.APPLICATION,
			tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
		}
	}
});
