/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { createManageTodoListToolData } from '../../../../common/tools/builtinTools/manageTodoListTool.js';
suite('ManageTodoListTool Schema', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function getSchemaProperties(toolData) {
        assert.ok(toolData.inputSchema);
        const schema = toolData.inputSchema;
        const todolistItems = schema?.properties?.todoList?.items;
        const properties = todolistItems?.properties;
        const required = todolistItems?.required;
        assert.ok(properties, 'Schema properties should be defined');
        assert.ok(required, 'Schema required fields should be defined');
        return { properties, required };
    }
    test('createManageTodoListToolData returns valid tool data with proper schema', () => {
        const toolData = createManageTodoListToolData();
        assert.ok(toolData.id, 'Tool should have an id');
        assert.ok(toolData.inputSchema, 'Tool should have an input schema');
        assert.strictEqual(toolData.inputSchema?.type, 'object', 'Schema should be an object type');
    });
    test('createManageTodoListToolData schema has required todoList field', () => {
        const toolData = createManageTodoListToolData();
        assert.ok(toolData.inputSchema?.required?.includes('todoList'), 'todoList should be required');
        assert.ok(toolData.inputSchema?.properties?.todoList, 'todoList property should exist');
    });
    test('createManageTodoListToolData todoList items have correct required fields', () => {
        const toolData = createManageTodoListToolData();
        const { properties, required } = getSchemaProperties(toolData);
        assert.ok('id' in properties, 'Schema should have id property');
        assert.ok('title' in properties, 'Schema should have title property');
        assert.ok('status' in properties, 'Schema should have status property');
        assert.deepStrictEqual(required, ['id', 'title', 'status'], 'Required fields should be id, title, status');
    });
    test('createManageTodoListToolData status has correct enum values', () => {
        const toolData = createManageTodoListToolData();
        const { properties } = getSchemaProperties(toolData);
        const statusProperty = properties['status'];
        assert.ok(statusProperty, 'Status property should exist');
        assert.deepStrictEqual(statusProperty.enum, ['not-started', 'in-progress', 'completed'], 'Status should have correct enum values');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuYWdlVG9kb0xpc3RUb29sLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9tYW5hZ2VUb2RvTGlzdFRvb2wudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFJM0csS0FBSyxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN2Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsbUJBQW1CLENBQUMsUUFBbUI7UUFDL0MsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDaEMsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQztRQUNwQyxNQUFNLGFBQWEsR0FBRyxNQUFNLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxLQUFnQyxDQUFDO1FBQ3JGLE1BQU0sVUFBVSxHQUFHLGFBQWEsRUFBRSxVQUFxRCxDQUFDO1FBQ3hGLE1BQU0sUUFBUSxHQUFHLGFBQWEsRUFBRSxRQUFRLENBQUM7UUFFekMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUUscUNBQXFDLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSwwQ0FBMEMsQ0FBQyxDQUFDO1FBRWhFLE9BQU8sRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLENBQUM7SUFDakMsQ0FBQztJQUVELElBQUksQ0FBQyx5RUFBeUUsRUFBRSxHQUFHLEVBQUU7UUFDcEYsTUFBTSxRQUFRLEdBQUcsNEJBQTRCLEVBQUUsQ0FBQztRQUVoRCxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztRQUNwRSxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO0lBQzdGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLEdBQUcsRUFBRTtRQUM1RSxNQUFNLFFBQVEsR0FBRyw0QkFBNEIsRUFBRSxDQUFDO1FBRWhELE1BQU0sQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLDZCQUE2QixDQUFDLENBQUM7UUFDL0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQztJQUN6RixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwRUFBMEUsRUFBRSxHQUFHLEVBQUU7UUFDckYsTUFBTSxRQUFRLEdBQUcsNEJBQTRCLEVBQUUsQ0FBQztRQUNoRCxNQUFNLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxHQUFHLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRS9ELE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLFVBQVUsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxJQUFJLFVBQVUsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sQ0FBQyxFQUFFLENBQUMsUUFBUSxJQUFJLFVBQVUsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsRUFBRSw2Q0FBNkMsQ0FBQyxDQUFDO0lBQzVHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZEQUE2RCxFQUFFLEdBQUcsRUFBRTtRQUN4RSxNQUFNLFFBQVEsR0FBRyw0QkFBNEIsRUFBRSxDQUFDO1FBQ2hELE1BQU0sRUFBRSxVQUFVLEVBQUUsR0FBRyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVyRCxNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxjQUFjLEVBQUUsOEJBQThCLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLFdBQVcsQ0FBQyxFQUFFLHdDQUF3QyxDQUFDLENBQUM7SUFDcEksQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9