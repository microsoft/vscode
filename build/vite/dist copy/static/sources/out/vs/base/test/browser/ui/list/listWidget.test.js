/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { List } from '../../../../browser/ui/list/listWidget.js';
import { range } from '../../../../common/arrays.js';
import { timeout } from '../../../../common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
suite('ListWidget', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('Page up and down', async function () {
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
        const listWidget = store.add(new List('test', element, delegate, [renderer]));
        listWidget.layout(200);
        assert.strictEqual(templatesCount, 0, 'no templates have been allocated');
        listWidget.splice(0, 0, range(100));
        listWidget.focusFirst();
        listWidget.focusNextPage();
        assert.strictEqual(listWidget.getFocus()[0], 9, 'first page down moves focus to element at bottom');
        // scroll to next page is async
        listWidget.focusNextPage();
        await timeout(0);
        assert.strictEqual(listWidget.getFocus()[0], 19, 'page down to next page');
        listWidget.focusPreviousPage();
        assert.strictEqual(listWidget.getFocus()[0], 10, 'first page up moves focus to element at top');
        // scroll to previous page is async
        listWidget.focusPreviousPage();
        await timeout(0);
        assert.strictEqual(listWidget.getFocus()[0], 0, 'page down to previous page');
    });
    test('Page up and down with item taller than viewport #149502', async function () {
        const element = document.createElement('div');
        element.style.height = '200px';
        element.style.width = '200px';
        const delegate = {
            getHeight() { return 200; },
            getTemplateId() { return 'template'; }
        };
        let templatesCount = 0;
        const renderer = {
            templateId: 'template',
            renderTemplate() { templatesCount++; },
            renderElement() { },
            disposeTemplate() { templatesCount--; }
        };
        const listWidget = store.add(new List('test', element, delegate, [renderer]));
        listWidget.layout(200);
        assert.strictEqual(templatesCount, 0, 'no templates have been allocated');
        listWidget.splice(0, 0, range(100));
        listWidget.focusFirst();
        assert.strictEqual(listWidget.getFocus()[0], 0, 'initial focus is first element');
        // scroll to next page is async
        listWidget.focusNextPage();
        await timeout(0);
        assert.strictEqual(listWidget.getFocus()[0], 1, 'page down to next page');
        // scroll to previous page is async
        listWidget.focusPreviousPage();
        await timeout(0);
        assert.strictEqual(listWidget.getFocus()[0], 0, 'page up to next page');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlzdFdpZGdldC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRW5GLEtBQUssQ0FBQyxZQUFZLEVBQUU7SUFDbkIsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsS0FBSztRQUM3QixNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQztRQUMvQixPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7UUFFOUIsTUFBTSxRQUFRLEdBQWlDO1lBQzlDLFNBQVMsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDMUIsYUFBYSxLQUFLLE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQztTQUN0QyxDQUFDO1FBRUYsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO1FBRXZCLE1BQU0sUUFBUSxHQUFnQztZQUM3QyxVQUFVLEVBQUUsVUFBVTtZQUN0QixjQUFjLEtBQUssY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLGFBQWEsS0FBSyxDQUFDO1lBQ25C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