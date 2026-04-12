/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../nls.js';
import { Extensions as ConfigurationExtensions } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
    id: 'network',
    order: 14,
    title: localize('networkConfigurationTitle', "Network"),
    type: 'object',
    properties: {
        'network.meteredConnection': {
            type: 'string',
            enum: ['auto', 'on', 'off'],
            enumDescriptions: [
                localize('meteredConnection.auto', "Automatically detect metered connections using the operating system's network status."),
                localize('meteredConnection.on', "Always treat the network connection as metered. Automatic updates and downloads will be postponed."),
                localize('meteredConnection.off', "Never treat the network connection as metered.")
            ],
            default: 'auto',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            description: localize('meteredConnection', "Controls whether the current network connection should be treated as metered. When metered, automatic updates, extension downloads, and other background network activity will be postponed to reduce data usage."),
            tags: ['usesOnlineServices']
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZENvbm5lY3Rpb24uY29uZmlnLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5jb25maWcuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQXNCLFVBQVUsSUFBSSx1QkFBdUIsRUFBMEIsTUFBTSxxREFBcUQsQ0FBQztBQUN4SixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFN0QsTUFBTSxxQkFBcUIsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUF5Qix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUN6RyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQztJQUMzQyxFQUFFLEVBQUUsU0FBUztJQUNiLEtBQUssRUFBRSxFQUFFO0lBQ1QsS0FBSyxFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxTQUFTLENBQUM7SUFDdkQsSUFBSSxFQUFFLFFBQVE7SUFDZCxVQUFVLEVBQUU7UUFDWCwyQkFBMkIsRUFBRTtZQUM1QixJQUFJLEVBQUUsUUFBUTtZQUNkLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDO1lBQzNCLGdCQUFnQixFQUFFO2dCQUNqQixRQUFRLENBQUMsd0JBQXdCLEVBQUUsdUZBQXVGLENBQUM7Z0JBQzNILFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxvR0FBb0csQ0FBQztnQkFDdEksUUFBUSxDQUFDLHVCQUF1QixFQUFFLGdEQUFnRCxDQUFDO2FBQ25GO1lBQ0QsT0FBTyxFQUFFLE1BQU07WUFDZixLQUFLLHdDQUFnQztZQUNyQyxXQUFXLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLG1OQUFtTixDQUFDO1lBQy9QLElBQUksRUFBRSxDQUFDLG9CQUFvQixDQUFDO1NBQzVCO0tBQ0Q7Q0FDRCxDQUFDLENBQUMifQ==