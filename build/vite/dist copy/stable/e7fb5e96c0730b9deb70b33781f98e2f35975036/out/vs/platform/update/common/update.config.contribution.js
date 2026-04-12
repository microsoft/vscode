/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isWeb, isWindows } from '../../../base/common/platform.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import { localize } from '../../../nls.js';
import { Extensions as ConfigurationExtensions } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
    id: 'update',
    order: 15,
    title: localize('updateConfigurationTitle', "Update"),
    type: 'object',
    properties: {
        'update.mode': {
            type: 'string',
            enum: ['none', 'manual', 'start', 'default'],
            default: 'default',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            description: localize('updateMode', "Configure whether you receive automatic updates. Requires a restart after change. The updates are fetched from a Microsoft online service."),
            tags: ['usesOnlineServices'],
            enumDescriptions: [
                localize('none', "Disable updates."),
                localize('manual', "Disable automatic background update checks. Updates will be available if you manually check for updates."),
                localize('start', "Check for updates only on startup. Disable automatic background update checks."),
                localize('default', "Enable automatic update checks. Code will check for updates automatically and periodically.")
            ],
            policy: {
                name: 'UpdateMode',
                category: PolicyCategory.Update,
                minimumVersion: '1.67',
                localization: {
                    description: { key: 'updateMode', value: localize('updateMode', "Configure whether you receive automatic updates. Requires a restart after change. The updates are fetched from a Microsoft online service."), },
                    enumDescriptions: [
                        {
                            key: 'none',
                            value: localize('none', "Disable updates."),
                        },
                        {
                            key: 'manual',
                            value: localize('manual', "Disable automatic background update checks. Updates will be available if you manually check for updates."),
                        },
                        {
                            key: 'start',
                            value: localize('start', "Check for updates only on startup. Disable automatic background update checks."),
                        },
                        {
                            key: 'default',
                            value: localize('default', "Enable automatic update checks. Code will check for updates automatically and periodically."),
                        }
                    ]
                },
            }
        },
        'update.channel': {
            type: 'string',
            default: 'default',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            description: localize('updateMode', "Configure whether you receive automatic updates. Requires a restart after change. The updates are fetched from a Microsoft online service."),
            deprecationMessage: localize('deprecated', "This setting is deprecated, please use '{0}' instead.", 'update.mode')
        },
        'update.enableWindowsBackgroundUpdates': {
            type: 'boolean',
            default: true,
            scope: 1 /* ConfigurationScope.APPLICATION */,
            title: localize('enableWindowsBackgroundUpdatesTitle', "Enable Background Updates"),
            description: localize('enableWindowsBackgroundUpdates', "Enable to download and install new VS Code versions in the background."),
            included: isWindows && !isWeb
        },
        'update.showReleaseNotes': {
            type: 'boolean',
            default: true,
            scope: 1 /* ConfigurationScope.APPLICATION */,
            description: localize('showReleaseNotes', "Show Release Notes after an update. The Release Notes are fetched from a Microsoft online service."),
            tags: ['usesOnlineServices']
        },
        'update.showPostInstallInfo': {
            type: 'boolean',
            default: true,
            scope: 1 /* ConfigurationScope.APPLICATION */,
            description: localize('showPostInstallInfo', "Show update information tooltip in the title bar after a new version is installed."),
            included: false,
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLmNvbmZpZy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5jb25maWcuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQXNCLFVBQVUsSUFBSSx1QkFBdUIsRUFBMEIsTUFBTSxxREFBcUQsQ0FBQztBQUN4SixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFN0QsTUFBTSxxQkFBcUIsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUF5Qix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUN6RyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQztJQUMzQyxFQUFFLEVBQUUsUUFBUTtJQUNaLEtBQUssRUFBRSxFQUFFO0lBQ1QsS0FBSyxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxRQUFRLENBQUM7SUFDckQsSUFBSSxFQUFFLFFBQVE7SUFDZCxVQUFVLEVBQUU7UUFDWCxhQUFhLEVBQUU7WUFDZCxJQUFJLEVBQUUsUUFBUTtZQUNkLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFNBQVMsQ0FBQztZQUM1QyxPQUFPLEVBQUUsU0FBUztZQUNsQixLQUFLLHdDQUFnQztZQUNyQyxXQUFXLEVBQUUsUUFBUSxDQUFDLFlBQVksRUFBRSw0SUFBNEksQ0FBQztZQUNqTCxJQUFJLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQztZQUM1QixnQkFBZ0IsRUFBRTtnQkFDakIsUUFBUSxDQUFDLE1BQU0sRUFBRSxrQkFBa0IsQ0FBQztnQkFDcEMsUUFBUSxDQUFDLFFBQVEsRUFBRSwwR0FBMEcsQ0FBQztnQkFDOUgsUUFBUSxDQUFDLE9BQU8sRUFBRSxnRkFBZ0YsQ0FBQztnQkFDbkcsUUFBUSxDQUFDLFNBQVMsRUFBRSw2RkFBNkYsQ0FBQzthQUNsSDtZQUNELE1BQU0sRUFBRTtnQkFDUCxJQUFJLEVBQUUsWUFBWTtnQkFDbEIsUUFBUSxFQUFFLGNBQWMsQ0FBQyxNQUFNO2dCQUMvQixjQUFjLEVBQUUsTUFBTTtnQkFDdEIsWUFBWSxFQUFFO29CQUNiLFdBQVcsRUFBRSxFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxZQUFZLEVBQUUsNElBQTRJLENBQUMsR0FBRztvQkFDaE4sZ0JBQWdCLEVBQUU7d0JBQ2pCOzRCQUNDLEdBQUcsRUFBRSxNQUFNOzRCQUNYLEtBQUssRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLGtCQUFrQixDQUFDO3lCQUMzQzt3QkFDRDs0QkFDQyxHQUFHLEVBQUUsUUFBUTs0QkFDYixLQUFLLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSwwR0FBMEcsQ0FBQzt5QkFDckk7d0JBQ0Q7NEJBQ0MsR0FBRyxFQUFFLE9BQU87NEJBQ1osS0FBSyxFQUFFLFFBQVEsQ0FBQyxPQUFPLEVBQUUsZ0ZBQWdGLENBQUM7eUJBQzFHO3dCQUNEOzRCQUNDLEdBQUcsRUFBRSxTQUFTOzRCQUNkLEtBQUssRUFBRSxRQUFRLENBQUMsU0FBUyxFQUFFLDZGQUE2RixDQUFDO3lCQUN6SDtxQkFDRDtpQkFDRDthQUNEO1NBQ0Q7UUFDRCxnQkFBZ0IsRUFBRTtZQUNqQixJQUFJLEVBQUUsUUFBUTtZQUNkLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLEtBQUssd0NBQWdDO1lBQ3JDLFdBQVcsRUFBRSxRQUFRLENBQUMsWUFBWSxFQUFFLDRJQUE0SSxDQUFDO1lBQ2pMLGtCQUFrQixFQUFFLFFBQVEsQ0FBQyxZQUFZLEVBQUUsdURBQXVELEVBQUUsYUFBYSxDQUFDO1NBQ2xIO1FBQ0QsdUNBQXVDLEVBQUU7WUFDeEMsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsSUFBSTtZQUNiLEtBQUssd0NBQWdDO1lBQ3JDLEtBQUssRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsMkJBQTJCLENBQUM7WUFDbkYsV0FBVyxFQUFFLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSx3RUFBd0UsQ0FBQztZQUNqSSxRQUFRLEVBQUUsU0FBUyxJQUFJLENBQUMsS0FBSztTQUM3QjtRQUNELHlCQUF5QixFQUFFO1lBQzFCLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLElBQUk7WUFDYixLQUFLLHdDQUFnQztZQUNyQyxXQUFXLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixFQUFFLG9HQUFvRyxDQUFDO1lBQy9JLElBQUksRUFBRSxDQUFDLG9CQUFvQixDQUFDO1NBQzVCO1FBQ0QsNEJBQTRCLEVBQUU7WUFDN0IsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsSUFBSTtZQUNiLEtBQUssd0NBQWdDO1lBQ3JDLFdBQVcsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUsb0ZBQW9GLENBQUM7WUFDbEksUUFBUSxFQUFFLEtBQUs7U0FDZjtLQUNEO0NBQ0QsQ0FBQyxDQUFDIn0=