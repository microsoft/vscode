/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../common/configuration.js';
Registry.as(Extensions.ConfigurationMigration)
    .registerConfigurationMigrations([{
        key: 'debug.autoExpandLazyVariables',
        migrateFn: (value) => {
            if (value === true) {
                return { value: 'on' };
            }
            else if (value === false) {
                return { value: 'off' };
            }
            return [];
        }
    }]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdTZXR0aW5nTWlncmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Z1NldHRpbmdNaWdyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQW1DLE1BQU0sa0NBQWtDLENBQUM7QUFFL0YsUUFBUSxDQUFDLEVBQUUsQ0FBa0MsVUFBVSxDQUFDLHNCQUFzQixDQUFDO0tBQzdFLCtCQUErQixDQUFDLENBQUM7UUFDakMsR0FBRyxFQUFFLCtCQUErQjtRQUNwQyxTQUFTLEVBQUUsQ0FBQyxLQUFjLEVBQUUsRUFBRTtZQUM3QixJQUFJLEtBQUssS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDcEIsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQztZQUN4QixDQUFDO2lCQUFNLElBQUksS0FBSyxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUM1QixPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDO1lBQ3pCLENBQUM7WUFFRCxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7S0FDRCxDQUFDLENBQUMsQ0FBQyJ9