/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { ThemeSettings } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { COLOR_THEME_CONFIGURATION_SETTINGS_TAG, formatSettingAsLink } from 'vs/workbench/services/themes/common/themeConfiguration';
import { isLinux } from 'vs/base/common/platform';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	properties: {
		[ThemeSettings.SYSTEM_COLOR_THEME]: {
			type: 'string',
			enum: ['default', 'auto', 'light', 'dark'],
			enumDescriptions: [
				localize('window.systemColorTheme.default', "Native widget colors match the system colors."),
				localize('window.systemColorTheme.auto', "Use light native widget colors for light color themes and dark for dark color themes."),
				localize('window.systemColorTheme.light', "Use light native widget colors."),
				localize('window.systemColorTheme.dark', "Use dark native widget colors."),
			],
			markdownDescription: localize({ key: 'window.systemColorTheme', comment: ['{0} and {1} will become links to other settings.'] }, "Set the color mode for native UI elements such as native dialogs, menus and title bar. Even if your OS is configured in light color mode, you can select a dark system color theme for the window. You can also configure to automatically adjust based on the {0} setting.\n\nNote: This setting is ignored when {1} is enabled.", formatSettingAsLink(ThemeSettings.COLOR_THEME), formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
			default: 'default',
			included: !isLinux,
			scope: ConfigurationScope.APPLICATION,
			tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
		}
	}
});
