/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ToggleCellToolbarPositionAction } from '../../../browser/contrib/layout/layoutActions.js';
suite('Notebook Layout Actions', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Toggle Cell Toolbar Position', async function () {
        const action = new ToggleCellToolbarPositionAction();
        // "notebook.cellToolbarLocation": "right"
        assert.deepStrictEqual(action.togglePosition('test-nb', 'right'), {
            default: 'right',
            'test-nb': 'left'
        });
        // "notebook.cellToolbarLocation": "left"
        assert.deepStrictEqual(action.togglePosition('test-nb', 'left'), {
            default: 'left',
            'test-nb': 'right'
        });
        // "notebook.cellToolbarLocation": "hidden"
        assert.deepStrictEqual(action.togglePosition('test-nb', 'hidden'), {
            default: 'hidden',
            'test-nb': 'right'
        });
        // invalid
        assert.deepStrictEqual(action.togglePosition('test-nb', ''), {
            default: 'right',
            'test-nb': 'left'
        });
        // no user config, default value
        assert.deepStrictEqual(action.togglePosition('test-nb', {
            default: 'right'
        }), {
            default: 'right',
            'test-nb': 'left'
        });
        // user config, default to left
        assert.deepStrictEqual(action.togglePosition('test-nb', {
            default: 'left'
        }), {
            default: 'left',
            'test-nb': 'right'
        });
        // user config, default to hidden
        assert.deepStrictEqual(action.togglePosition('test-nb', {
            default: 'hidden'
        }), {
            default: 'hidden',
            'test-nb': 'right'
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0QWN0aW9ucy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL2NvbnRyaWIvbGF5b3V0QWN0aW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVuRyxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO0lBQ3JDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEtBQUs7UUFDekMsTUFBTSxNQUFNLEdBQUcsSUFBSSwrQkFBK0IsRUFBRSxDQUFDO1FBRXJELDBDQUEwQztRQUMxQyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxFQUFFO1lBQ2pFLE9BQU8sRUFBRSxPQUFPO1lBQ2hCLFNBQVMsRUFBRSxNQUFNO1NBQ2pCLENBQUMsQ0FBQztRQUVILHlDQUF5QztRQUN6QyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxFQUFFO1lBQ2hFLE9BQU8sRUFBRSxNQUFNO1lBQ2YsU0FBUyxFQUFFLE9BQU87U0FDbEIsQ0FBQyxDQUFDO1FBRUgsMkNBQTJDO1FBQzNDLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLEVBQUU7WUFDbEUsT0FBTyxFQUFFLFFBQVE7WUFDakIsU0FBUyxFQUFFLE9BQU87U0FDbEIsQ0FBQyxDQUFDO1FBRUgsVUFBVTtRQUNWLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUU7WUFDNUQsT0FBTyxFQUFFLE9BQU87WUFDaEIsU0FBUyxFQUFFLE1BQU07U0FDakIsQ0FBQyxDQUFDO1FBRUgsZ0NBQWdDO1FBQ2hDLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUU7WUFDdkQsT0FBTyxFQUFFLE9BQU87U0FDaEIsQ0FBQyxFQUFFO1lBQ0gsT0FBTyxFQUFFLE9BQU87WUFDaEIsU0FBUyxFQUFFLE1BQU07U0FDakIsQ0FBQyxDQUFDO1FBRUgsK0JBQStCO1FBQy9CLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUU7WUFDdkQsT0FBTyxFQUFFLE1BQU07U0FDZixDQUFDLEVBQUU7WUFDSCxPQUFPLEVBQUUsTUFBTTtZQUNmLFNBQVMsRUFBRSxPQUFPO1NBQ2xCLENBQUMsQ0FBQztRQUVILGlDQUFpQztRQUNqQyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFO1lBQ3ZELE9BQU8sRUFBRSxRQUFRO1NBQ2pCLENBQUMsRUFBRTtZQUNILE9BQU8sRUFBRSxRQUFRO1lBQ2pCLFNBQVMsRUFBRSxPQUFPO1NBQ2xCLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==