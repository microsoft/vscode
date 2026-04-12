/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ListView } from '../../../../browser/ui/list/listView.js';
import { range } from '../../../../common/arrays.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
suite('ListView', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('all rows get disposed', function () {
        const element = document.createElement('div');
        element.style.height = '200px';
        element.style.width = '200px';
        const delegate = {
            getHeight() { return 20; },
            getTemplateId() { return 'template'; }
        };
        let templatesCount = 0;
        const renderer = {
            templateId: 'template',
            renderTemplate() { templatesCount++; },
            renderElement() { },
            disposeTemplate() { templatesCount--; }
        };
        const listView = new ListView(element, delegate, [renderer]);
        listView.layout(200);
        assert.strictEqual(templatesCount, 0, 'no templates have been allocated');
        listView.splice(0, 0, range(100));
        assert.strictEqual(templatesCount, 10, 'some templates have been allocated');
        listView.dispose();
        assert.strictEqual(templatesCount, 0, 'all templates have been disposed');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlzdFZpZXcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9icm93c2VyL3VpL2xpc3QvbGlzdFZpZXcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUVuRixLQUFLLENBQUMsVUFBVSxFQUFFO0lBQ2pCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFO1FBQzdCLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDO1FBQy9CLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQztRQUU5QixNQUFNLFFBQVEsR0FBaUM7WUFDOUMsU0FBUyxLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxQixhQUFhLEtBQUssT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDO1NBQ3RDLENBQUM7UUFFRixJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUM7UUFFdkIsTUFBTSxRQUFRLEdBQWdDO1lBQzdDLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLGNBQWMsS0FBSyxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdEMsYUFBYSxLQUFLLENBQUM7WUFDbkIsZUFBZSxLQUFLLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztTQUN2QyxDQUFDO1FBRUYsTUFBTSxRQUFRLEdBQUcsSUFBSSxRQUFRLENBQVMsT0FBTyxFQUFFLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDckUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVyQixNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsRUFBRSxDQUFDLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztRQUMxRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsRUFBRSxFQUFFLG9DQUFvQyxDQUFDLENBQUM7UUFDN0UsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25CLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLENBQUMsRUFBRSxrQ0FBa0MsQ0FBQyxDQUFDO0lBQzNFLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==