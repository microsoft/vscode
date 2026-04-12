/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ThemeSettings } from '../common/workbenchThemeService.js';
import { COLOR_THEME_CONFIGURATION_SETTINGS_TAG, formatSettingAsLink } from '../common/themeConfiguration.js';
import { isLinux } from '../../../../base/common/platform.js';
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
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
            scope: 1 /* ConfigurationScope.APPLICATION */,
            tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWVzLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvZWxlY3Ryb24tYnJvd3Nlci90aGVtZXMuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUEwQixVQUFVLElBQUksdUJBQXVCLEVBQXNCLE1BQU0sb0VBQW9FLENBQUM7QUFDdkssT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxzQ0FBc0MsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzlHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU5RCxNQUFNLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQXlCLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ3pHLHFCQUFxQixDQUFDLHFCQUFxQixDQUFDO0lBQzNDLFVBQVUsRUFBRTtRQUNYLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLEVBQUU7WUFDbkMsSUFBSSxFQUFFLFFBQVE7WUFDZCxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUM7WUFDMUMsZ0JBQWdCLEVBQUU7Z0JBQ2pCLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSwrQ0FBK0MsQ0FBQztnQkFDNUYsUUFBUSxDQUFDLDhCQUE4QixFQUFFLHVGQUF1RixDQUFDO2dCQUNqSSxRQUFRLENBQUMsK0JBQStCLEVBQUUsaUNBQWlDLENBQUM7Z0JBQzVFLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxnQ0FBZ0MsQ0FBQzthQUMxRTtZQUNELG1CQUFtQixFQUFFLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSx5QkFBeUIsRUFBRSxPQUFPLEVBQUUsQ0FBQyxrREFBa0QsQ0FBQyxFQUFFLEVBQUUsbVVBQW1VLEVBQUUsbUJBQW1CLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxFQUFFLG1CQUFtQixDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBQzdpQixPQUFPLEVBQUUsU0FBUztZQUNsQixRQUFRLEVBQUUsQ0FBQyxPQUFPO1lBQ2xCLEtBQUssd0NBQWdDO1lBQ3JDLElBQUksRUFBRSxDQUFDLHNDQUFzQyxDQUFDO1NBQzlDO0tBQ0Q7Q0FDRCxDQUFDLENBQUMifQ==