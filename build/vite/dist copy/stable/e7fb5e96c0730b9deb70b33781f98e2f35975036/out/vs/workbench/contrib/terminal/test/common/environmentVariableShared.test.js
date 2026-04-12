/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual } from 'assert';
import { deserializeEnvironmentVariableCollection, serializeEnvironmentVariableCollection } from '../../../../../platform/terminal/common/environmentVariableShared.js';
import { EnvironmentVariableMutatorType } from '../../../../../platform/terminal/common/environmentVariable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('EnvironmentVariable - deserializeEnvironmentVariableCollection', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should construct correctly with 3 arguments', () => {
        const c = deserializeEnvironmentVariableCollection([
            ['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
            ['B', { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B' }],
            ['C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend, variable: 'C' }]
        ]);
        const keys = [...c.keys()];
        deepStrictEqual(keys, ['A', 'B', 'C']);
        deepStrictEqual(c.get('A'), { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' });
        deepStrictEqual(c.get('B'), { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B' });
        deepStrictEqual(c.get('C'), { value: 'c', type: EnvironmentVariableMutatorType.Prepend, variable: 'C' });
    });
});
suite('EnvironmentVariable - serializeEnvironmentVariableCollection', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should correctly serialize the object', () => {
        const collection = new Map();
        deepStrictEqual(serializeEnvironmentVariableCollection(collection), []);
        collection.set('A', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' });
        collection.set('B', { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B' });
        collection.set('C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend, variable: 'C' });
        deepStrictEqual(serializeEnvironmentVariableCollection(collection), [
            ['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
            ['B', { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B' }],
            ['C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend, variable: 'C' }]
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRWYXJpYWJsZVNoYXJlZC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvdGVzdC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZVNoYXJlZC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDekMsT0FBTyxFQUFFLHdDQUF3QyxFQUFFLHNDQUFzQyxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDeEssT0FBTyxFQUFFLDhCQUE4QixFQUErQixNQUFNLGdFQUFnRSxDQUFDO0FBQzdJLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLEtBQUssQ0FBQyxnRUFBZ0UsRUFBRSxHQUFHLEVBQUU7SUFDNUUsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1FBQ3hELE1BQU0sQ0FBQyxHQUFHLHdDQUF3QyxDQUFDO1lBQ2xELENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsOEJBQThCLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUNsRixDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLDhCQUE4QixDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUM7WUFDakYsQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSw4QkFBOEIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDO1NBQ2xGLENBQUMsQ0FBQztRQUNILE1BQU0sSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUMzQixlQUFlLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLGVBQWUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsOEJBQThCLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ3pHLGVBQWUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsOEJBQThCLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ3hHLGVBQWUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsOEJBQThCLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzFHLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxLQUFLLENBQUMsOERBQThELEVBQUUsR0FBRyxFQUFFO0lBQzFFLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtRQUNsRCxNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBdUMsQ0FBQztRQUNsRSxlQUFlLENBQUMsc0NBQXNDLENBQUMsVUFBVSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEUsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSw4QkFBOEIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDakcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSw4QkFBOEIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDaEcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSw4QkFBOEIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDakcsZUFBZSxDQUFDLHNDQUFzQyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQ25FLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsOEJBQThCLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUNsRixDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLDhCQUE4QixDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUM7WUFDakYsQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSw4QkFBOEIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDO1NBQ2xGLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==