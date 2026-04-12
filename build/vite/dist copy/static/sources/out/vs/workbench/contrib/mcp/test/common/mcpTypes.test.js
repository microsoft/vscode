/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpResourceURI, McpServerDefinition } from '../../common/mcpTypes.js';
import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
suite('MCP Types', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('McpResourceURI - round trips', () => {
        const roundTrip = (uri) => {
            const from = McpResourceURI.fromServer({ label: '', id: 'my-id' }, uri);
            const to = McpResourceURI.toServer(from);
            assert.strictEqual(to.definitionId, 'my-id');
            assert.strictEqual(to.resourceURL.toString(), uri, `expected to round trip ${uri}`);
        };
        roundTrip('file:///path/to/file.txt');
        roundTrip('custom-scheme://my-path/to/resource.txt');
        roundTrip('custom-scheme://my-path');
        roundTrip('custom-scheme://my-path/');
        roundTrip('custom-scheme://my-path/?with=query&params=here');
        roundTrip('custom-scheme:///my-path');
        roundTrip('custom-scheme:///my-path/foo/?with=query&params=here');
    });
    suite('McpServerDefinition.equals', () => {
        const createBasicDefinition = (overrides) => ({
            id: 'test-server',
            label: 'Test Server',
            cacheNonce: 'v1.0.0',
            launch: {
                type: 1 /* McpServerTransportType.Stdio */,
                cwd: undefined,
                command: 'test-command',
                args: [],
                env: {},
                envFile: undefined,
                sandbox: undefined
            },
            ...overrides
        });
        test('returns true for identical definitions', () => {
            const def1 = createBasicDefinition();
            const def2 = createBasicDefinition();
            assert.strictEqual(McpServerDefinition.equals(def1, def2), true);
        });
        test('returns false when cacheNonce differs', () => {
            const def1 = createBasicDefinition({ cacheNonce: 'v1.0.0' });
            const def2 = createBasicDefinition({ cacheNonce: 'v2.0.0' });
            assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
        });
        test('returns false when id differs', () => {
            const def1 = createBasicDefinition({ id: 'server-1' });
            const def2 = createBasicDefinition({ id: 'server-2' });
            assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
        });
        test('returns false when label differs', () => {
            const def1 = createBasicDefinition({ label: 'Server A' });
            const def2 = createBasicDefinition({ label: 'Server B' });
            assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
        });
        test('returns false when roots differ', () => {
            const def1 = createBasicDefinition({ roots: [URI.file('/path1')] });
            const def2 = createBasicDefinition({ roots: [URI.file('/path2')] });
            assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
        });
        test('returns true when roots are both undefined', () => {
            const def1 = createBasicDefinition({ roots: undefined });
            const def2 = createBasicDefinition({ roots: undefined });
            assert.strictEqual(McpServerDefinition.equals(def1, def2), true);
        });
        test('returns false when launch differs', () => {
            const def1 = createBasicDefinition({
                launch: {
                    type: 1 /* McpServerTransportType.Stdio */,
                    cwd: undefined,
                    command: 'command1',
                    args: [],
                    env: {},
                    envFile: undefined,
                    sandbox: undefined
                }
            });
            const def2 = createBasicDefinition({
                launch: {
                    type: 1 /* McpServerTransportType.Stdio */,
                    cwd: undefined,
                    command: 'command2',
                    args: [],
                    env: {},
                    envFile: undefined,
                    sandbox: undefined
                }
            });
            assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwVHlwZXMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC90ZXN0L2NvbW1vbi9tY3BUeXBlcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsbUJBQW1CLEVBQTBCLE1BQU0sMEJBQTBCLENBQUM7QUFDdkcsT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELEtBQUssQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO0lBQ3ZCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEdBQUcsRUFBRTtRQUN6QyxNQUFNLFNBQVMsR0FBRyxDQUFDLEdBQVcsRUFBRSxFQUFFO1lBQ2pDLE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUN4RSxNQUFNLEVBQUUsR0FBRyxjQUFjLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLEVBQUUsR0FBRyxFQUFFLDBCQUEwQixHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ3JGLENBQUMsQ0FBQztRQUVGLFNBQVMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3RDLFNBQVMsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1FBQ3JELFNBQVMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3JDLFNBQVMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3RDLFNBQVMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO1FBRTdELFNBQVMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3RDLFNBQVMsQ0FBQyxzREFBc0QsQ0FBQyxDQUFDO0lBQ25FLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtRQUN4QyxNQUFNLHFCQUFxQixHQUFHLENBQUMsU0FBd0MsRUFBdUIsRUFBRSxDQUFDLENBQUM7WUFDakcsRUFBRSxFQUFFLGFBQWE7WUFDakIsS0FBSyxFQUFFLGFBQWE7WUFDcEIsVUFBVSxFQUFFLFFBQVE7WUFDcEIsTUFBTSxFQUFFO2dCQUNQLElBQUksc0NBQThCO2dCQUNsQyxHQUFHLEVBQUUsU0FBUztnQkFDZCxPQUFPLEVBQUUsY0FBYztnQkFDdkIsSUFBSSxFQUFFLEVBQUU7Z0JBQ1IsR0FBRyxFQUFFLEVBQUU7Z0JBQ1AsT0FBTyxFQUFFLFNBQVM7Z0JBQ2xCLE9BQU8sRUFBRSxTQUFTO2FBQ2xCO1lBQ0QsR0FBRyxTQUFTO1NBQ1osQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtZQUNuRCxNQUFNLElBQUksR0FBRyxxQkFBcUIsRUFBRSxDQUFDO1lBQ3JDLE1BQU0sSUFBSSxHQUFHLHFCQUFxQixFQUFFLENBQUM7WUFDckMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2xFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtZQUNsRCxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQzdELE1BQU0sSUFBSSxHQUFHLHFCQUFxQixDQUFDLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25FLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtZQUMxQyxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZELE1BQU0sSUFBSSxHQUFHLHFCQUFxQixDQUFDLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDdkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25FLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLEdBQUcsRUFBRTtZQUM3QyxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQzFELE1BQU0sSUFBSSxHQUFHLHFCQUFxQixDQUFDLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25FLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtZQUM1QyxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDcEUsTUFBTSxJQUFJLEdBQUcscUJBQXFCLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7WUFDdkQsTUFBTSxJQUFJLEdBQUcscUJBQXFCLENBQUMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUN6RCxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ3pELE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7WUFDOUMsTUFBTSxJQUFJLEdBQUcscUJBQXFCLENBQUM7Z0JBQ2xDLE1BQU0sRUFBRTtvQkFDUCxJQUFJLHNDQUE4QjtvQkFDbEMsR0FBRyxFQUFFLFNBQVM7b0JBQ2QsT0FBTyxFQUFFLFVBQVU7b0JBQ25CLElBQUksRUFBRSxFQUFFO29CQUNSLEdBQUcsRUFBRSxFQUFFO29CQUNQLE9BQU8sRUFBRSxTQUFTO29CQUNsQixPQUFPLEVBQUUsU0FBUztpQkFDbEI7YUFDRCxDQUFDLENBQUM7WUFDSCxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQztnQkFDbEMsTUFBTSxFQUFFO29CQUNQLElBQUksc0NBQThCO29CQUNsQyxHQUFHLEVBQUUsU0FBUztvQkFDZCxPQUFPLEVBQUUsVUFBVTtvQkFDbkIsSUFBSSxFQUFFLEVBQUU7b0JBQ1IsR0FBRyxFQUFFLEVBQUU7b0JBQ1AsT0FBTyxFQUFFLFNBQVM7b0JBQ2xCLE9BQU8sRUFBRSxTQUFTO2lCQUNsQjthQUNELENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRSxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==