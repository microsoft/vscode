/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NotebookCellLayoutManager } from '../../browser/notebookCellLayoutManager.js';
suite('NotebookCellLayoutManager', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const mockCellViewModel = () => {
        return { handle: 'cell1' };
    };
    class MockList {
        constructor() {
            this._height = new Map();
            this.inRenderingTransaction = false;
            this.getViewIndexCalled = false;
            this.cells = [];
        }
        getViewIndex(cell) { return this.cells.indexOf(cell) < 0 ? undefined : this.cells.indexOf(cell); }
        elementHeight(cell) { return this._height.get(cell) ?? 100; }
        updateElementHeight2(cell, height) { this._height.set(cell, height); }
    }
    class MockLoggingService {
        debug() { }
        info() { }
        warn() { }
        error() { }
        trace() { }
    }
    class MockNotebookWidget {
        constructor() {
            this.viewModel = {
                hasCell: (cell) => true,
                getCellIndex: () => 0
            };
            this.visibleRanges = [{ start: 0, end: 0 }];
        }
        hasEditorFocus() { return true; }
        getAbsoluteTopOfElement() { return 0; }
        getLength() { return 1; }
        getDomNode() {
            return {
                style: {
                    height: '100px'
                }
            };
        }
    }
    test('should update cell height', async () => {
        const cell = mockCellViewModel();
        const cell2 = mockCellViewModel();
        const list = new MockList();
        list.cells.push(cell);
        list.cells.push(cell2);
        const widget = new MockNotebookWidget();
        const mgr = store.add(new NotebookCellLayoutManager(widget, list, new MockLoggingService()));
        mgr.layoutNotebookCell(cell, 200);
        mgr.layoutNotebookCell(cell2, 200);
        assert.strictEqual(list.elementHeight(cell), 200);
        assert.strictEqual(list.elementHeight(cell2), 200);
    });
    test('should schedule updates if already in a rendering transaction', async () => {
        const cell = mockCellViewModel();
        const cell2 = mockCellViewModel();
        const list = new MockList();
        list.inRenderingTransaction = true;
        list.cells.push(cell);
        list.cells.push(cell2);
        const widget = new MockNotebookWidget();
        const mgr = store.add(new NotebookCellLayoutManager(widget, list, new MockLoggingService()));
        const promise = mgr.layoutNotebookCell(cell, 200);
        mgr.layoutNotebookCell(cell2, 200);
        assert.strictEqual(list.elementHeight(cell), 100);
        assert.strictEqual(list.elementHeight(cell2), 100);
        list.inRenderingTransaction = false;
        await promise;
        assert.strictEqual(list.elementHeight(cell), 200);
        assert.strictEqual(list.elementHeight(cell2), 200);
    });
    test('should not update if cell is hidden', async () => {
        const cell = mockCellViewModel();
        const list = new MockList();
        const widget = new MockNotebookWidget();
        const mgr = store.add(new NotebookCellLayoutManager(widget, list, new MockLoggingService()));
        await mgr.layoutNotebookCell(cell, 200);
        assert.strictEqual(list.elementHeight(cell), 100);
    });
    test('should not update if height is unchanged', async () => {
        const cell = mockCellViewModel();
        const list = new MockList();
        list.cells.push(cell);
        const widget = new MockNotebookWidget();
        const mgr = store.add(new NotebookCellLayoutManager(widget, list, new MockLoggingService()));
        await mgr.layoutNotebookCell(cell, 100);
        assert.strictEqual(list.elementHeight(cell), 100);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsTGF5b3V0TWFuYWdlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL25vdGVib29rQ2VsbExheW91dE1hbmFnZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQU92RixLQUFLLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO0lBRXZDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsTUFBTSxpQkFBaUIsR0FBRyxHQUFHLEVBQUU7UUFDOUIsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQStCLENBQUM7SUFDekQsQ0FBQyxDQUFDO0lBRUYsTUFBTSxRQUFRO1FBQWQ7WUFDUyxZQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUc1QiwyQkFBc0IsR0FBRyxLQUFLLENBQUM7WUFFL0IsdUJBQWtCLEdBQUcsS0FBSyxDQUFDO1lBQzNCLFVBQUssR0FBcUIsRUFBRSxDQUFDO1FBQzlCLENBQUM7UUFOQSxZQUFZLENBQUMsSUFBb0IsSUFBSSxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEgsYUFBYSxDQUFDLElBQW9CLElBQUksT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRTdFLG9CQUFvQixDQUFDLElBQW9CLEVBQUUsTUFBYyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FHOUY7SUFDRCxNQUFNLGtCQUFrQjtRQUV2QixLQUFLLEtBQUssQ0FBQztRQUNYLElBQUksS0FBSyxDQUFDO1FBQ1YsSUFBSSxLQUFLLENBQUM7UUFDVixLQUFLLEtBQUssQ0FBQztRQUNYLEtBQUssS0FBSyxDQUFDO0tBQ1g7SUFDRCxNQUFNLGtCQUFrQjtRQUF4QjtZQUNDLGNBQVMsR0FBa0M7Z0JBQzFDLE9BQU8sRUFBRSxDQUFDLElBQW9CLEVBQUUsRUFBRSxDQUFDLElBQUk7Z0JBQ3ZDLFlBQVksRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO2FBQ1csQ0FBQztZQUlsQyxrQkFBYSxHQUFpQixDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQVF0RCxDQUFDO1FBWEEsY0FBYyxLQUFLLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNqQyx1QkFBdUIsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkMsU0FBUyxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV6QixVQUFVO1lBQ1QsT0FBTztnQkFDTixLQUFLLEVBQUU7b0JBQ04sTUFBTSxFQUFFLE9BQU87aUJBQ2Y7YUFDYyxDQUFDO1FBQ2xCLENBQUM7S0FDRDtJQUVELElBQUksQ0FBQywyQkFBMkIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1QyxNQUFNLElBQUksR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sS0FBSyxHQUFHLGlCQUFpQixFQUFFLENBQUM7UUFDbEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0QixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2QixNQUFNLE1BQU0sR0FBRyxJQUFJLGtCQUFrQixFQUFFLENBQUM7UUFDeEMsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHlCQUF5QixDQUFDLE1BQXlDLEVBQUUsSUFBb0MsRUFBRSxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hLLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNuQyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3BELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtEQUErRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2hGLE1BQU0sSUFBSSxHQUFHLGlCQUFpQixFQUFFLENBQUM7UUFDakMsTUFBTSxLQUFLLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztRQUNsQyxNQUFNLElBQUksR0FBRyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUM7UUFDbkMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdkIsTUFBTSxNQUFNLEdBQUcsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSx5QkFBeUIsQ0FBQyxNQUF5QyxFQUFFLElBQW9DLEVBQUUsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVoSyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2xELEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsc0JBQXNCLEdBQUcsS0FBSyxDQUFDO1FBRXBDLE1BQU0sT0FBTyxDQUFDO1FBRWQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNwRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN0RCxNQUFNLElBQUksR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sSUFBSSxHQUFHLElBQUksUUFBUSxFQUFFLENBQUM7UUFDNUIsTUFBTSxNQUFNLEdBQUcsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSx5QkFBeUIsQ0FBQyxNQUF5QyxFQUFFLElBQW9DLEVBQUUsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoSyxNQUFNLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ25ELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzNELE1BQU0sSUFBSSxHQUFHLGlCQUFpQixFQUFFLENBQUM7UUFDakMsTUFBTSxJQUFJLEdBQUcsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0QixNQUFNLE1BQU0sR0FBRyxJQUFJLGtCQUFrQixFQUFFLENBQUM7UUFDeEMsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHlCQUF5QixDQUFDLE1BQXlDLEVBQUUsSUFBb0MsRUFBRSxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hLLE1BQU0sR0FBRyxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDbkQsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9