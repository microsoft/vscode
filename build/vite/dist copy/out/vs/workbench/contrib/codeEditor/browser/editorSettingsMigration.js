/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorSettingMigration } from '../../../../editor/browser/config/migrateOptions.js';
import { Extensions } from '../../../common/configuration.js';
Registry.as(Extensions.ConfigurationMigration)
    .registerConfigurationMigrations(EditorSettingMigration.items.map(item => ({
    key: `editor.${item.key}`,
    migrateFn: (value, accessor) => {
        const configurationKeyValuePairs = [];
        const writer = (key, value) => configurationKeyValuePairs.push([`editor.${key}`, { value }]);
        item.migrate(value, key => accessor(`editor.${key}`), writer);
        return configurationKeyValuePairs;
    }
})));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yU2V0dGluZ3NNaWdyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb2RlRWRpdG9yL2Jyb3dzZXIvZWRpdG9yU2V0dGluZ3NNaWdyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxzQkFBc0IsRUFBbUIsTUFBTSxxREFBcUQsQ0FBQztBQUM5RyxPQUFPLEVBQThCLFVBQVUsRUFBbUMsTUFBTSxrQ0FBa0MsQ0FBQztBQUUzSCxRQUFRLENBQUMsRUFBRSxDQUFrQyxVQUFVLENBQUMsc0JBQXNCLENBQUM7S0FDN0UsK0JBQStCLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDMUUsR0FBRyxFQUFFLFVBQVUsSUFBSSxDQUFDLEdBQUcsRUFBRTtJQUN6QixTQUFTLEVBQUUsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUU7UUFDOUIsTUFBTSwwQkFBMEIsR0FBK0IsRUFBRSxDQUFDO1FBQ2xFLE1BQU0sTUFBTSxHQUFvQixDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsR0FBRyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzlELE9BQU8sMEJBQTBCLENBQUM7SUFDbkMsQ0FBQztDQUNELENBQUMsQ0FBQyxDQUFDLENBQUMifQ==