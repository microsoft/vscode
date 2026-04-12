/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CellFocusMode } from '../../browser/notebookBrowser.js';
import { NotebookCellAnchor } from '../../browser/view/notebookCellAnchor.js';
import { Emitter } from '../../../../../base/common/event.js';
import { CellKind, NotebookCellExecutionState, NotebookSetting } from '../../common/notebookCommon.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('NotebookCellAnchor', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let focusedCell;
    let config;
    let scrollEvent;
    let onDidStopExecution;
    let resizingCell;
    let cellAnchor;
    setup(() => {
        config = new TestConfigurationService();
        scrollEvent = new Emitter();
        onDidStopExecution = new Emitter();
        const executionService = {
            getCellExecution: () => { return { state: NotebookCellExecutionState.Executing }; },
        };
        resizingCell = {
            cellKind: CellKind.Code,
            onDidStopExecution: onDidStopExecution.event
        };
        focusedCell = {
            focusMode: CellFocusMode.Container
        };
        cellAnchor = store.add(new NotebookCellAnchor(executionService, config, scrollEvent.event));
    });
    // for the current implementation the code under test only cares about the focused cell
    // initial setup with focused cell at the bottom of the view
    class MockListView {
        constructor() {
            this.focusedCellTop = 100;
            this.focusedCellHeight = 50;
            this.renderTop = 0;
            this.renderHeight = 150;
        }
        element(_index) { return focusedCell; }
        elementTop(_index) { return this.focusedCellTop; }
        elementHeight(_index) { return this.focusedCellHeight; }
        getScrollTop() { return this.renderTop; }
    }
    test('Basic anchoring', async function () {
        focusedCell.focusMode = CellFocusMode.Editor;
        const listView = new MockListView();
        assert(cellAnchor.shouldAnchor(listView, 1, -10, resizingCell), 'should anchor if cell editor is focused');
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'should anchor if cell editor is focused');
        config.setUserConfiguration(NotebookSetting.scrollToRevealCell, 'none');
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'should anchor if cell editor is focused');
        config.setUserConfiguration(NotebookSetting.scrollToRevealCell, 'fullCell');
        focusedCell.focusMode = CellFocusMode.Container;
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'should anchor if cell is growing');
        focusedCell.focusMode = CellFocusMode.Output;
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'should anchor if cell is growing');
        assert(!cellAnchor.shouldAnchor(listView, 1, -10, resizingCell), 'should not anchor if not growing and editor not focused');
        config.setUserConfiguration(NotebookSetting.scrollToRevealCell, 'none');
        assert(!cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'should not anchor if scroll on execute is disabled');
    });
    test('Anchor during execution until user scrolls up', async function () {
        const listView = new MockListView();
        const scrollDown = { oldScrollTop: 100, scrollTop: 150 };
        const scrollUp = { oldScrollTop: 200, scrollTop: 150 };
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell));
        scrollEvent.fire(scrollDown);
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'cell should still be anchored after scrolling down');
        scrollEvent.fire(scrollUp);
        assert(!cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'cell should not be anchored after scrolling up');
        focusedCell.focusMode = CellFocusMode.Editor;
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'cell should anchor again if the editor is focused');
        focusedCell.focusMode = CellFocusMode.Container;
        onDidStopExecution.fire();
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'cell should anchor for new execution');
    });
    test('Only anchor during when the focused cell will be pushed out of view', async function () {
        const mockListView = new MockListView();
        mockListView.focusedCellTop = 50;
        const listView = mockListView;
        assert(!cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'should not anchor if focused cell will still be fully visible after resize');
        focusedCell.focusMode = CellFocusMode.Editor;
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'cell should always anchor if the editor is focused');
        // fully visible focused cell would be pushed partially out of view
        assert(cellAnchor.shouldAnchor(listView, 1, 150, resizingCell), 'cell should be anchored if focused cell will be pushed out of view');
        mockListView.focusedCellTop = 110;
        // partially visible focused cell would be pushed further out of view
        assert(cellAnchor.shouldAnchor(listView, 1, 10, resizingCell), 'cell should be anchored if focused cell will be pushed out of view');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsQW5jaG9yLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvbm90ZWJvb2tDZWxsQW5jaG9yLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSwwQkFBMEIsRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV2RyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUluRyxLQUFLLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO0lBRWhDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDeEQsSUFBSSxXQUE4QixDQUFDO0lBQ25DLElBQUksTUFBZ0MsQ0FBQztJQUNyQyxJQUFJLFdBQWlDLENBQUM7SUFDdEMsSUFBSSxrQkFBaUMsQ0FBQztJQUN0QyxJQUFJLFlBQStCLENBQUM7SUFFcEMsSUFBSSxVQUE4QixDQUFDO0lBRW5DLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixNQUFNLEdBQUcsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1FBQ3hDLFdBQVcsR0FBRyxJQUFJLE9BQU8sRUFBZSxDQUFDO1FBQ3pDLGtCQUFrQixHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFFekMsTUFBTSxn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