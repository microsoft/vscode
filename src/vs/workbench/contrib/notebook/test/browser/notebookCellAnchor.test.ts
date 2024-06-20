/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ScrollEvent } from 'vs/base/common/scrollable';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { CellFocusMode } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookCellAnchor } from 'vs/workbench/contrib/notebook/browser/view/notebookCellAnchor';
import { Emitter } from 'vs/base/common/event';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { CellKind, NotebookCellExecutionState, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IListView } from 'vs/base/browser/ui/list/listView';


suite('NotebookCellAnchor', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let focusedCell: CodeCellViewModel;
	let config: TestConfigurationService;
	let scrollEvent: Emitter<ScrollEvent>;
	let onDidStopExecution: Emitter<void>;
	let resizingCell: CodeCellViewModel;

	let cellAnchor: NotebookCellAnchor;

	setup(() => {
		config = new TestConfigurationService();
		scrollEvent = new Emitter<ScrollEvent>();
		onDidStopExecution = new Emitter<void>();

		const executionService = {
			getCellExecution: () => { return { state: NotebookCellExecutionState.Executing }; },
		} as unknown as INotebookExecutionStateService;

		resizingCell = {
			cellKind: CellKind.Code,
			onDidStopExecution: onDidStopExecution.event
		} as unknown as CodeCellViewModel;

		focusedCell = {
			focusMode: CellFocusMode.Container
		} as CodeCellViewModel;

		cellAnchor = store.add(new NotebookCellAnchor(executionService, config, scrollEvent.event));
	});

	// for the current implementation the code under test only cares about the focused cell
	// initial setup with focused cell at the bottom of the view
	class MockListView {
		focusedCellTop = 100;
		focusedCellHeight = 50;
		renderTop = 0;
		renderHeight = 150;
		element(_index: number) { return focusedCell; }
		elementTop(_index: number) { return this.focusedCellTop; }
		elementHeight(_index: number) { return this.focusedCellHeight; }
		getScrollTop() { return this.renderTop; }
	}

	test('Basic anchoring', async function () {

		focusedCell.focusMode = CellFocusMode.Editor;
		const listView = new MockListView() as unknown as IListView<CodeCellViewModel>;
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
		const listView = new MockListView() as unknown as IListView<CodeCellViewModel>;
		const scrollDown = { oldScrollTop: 100, scrollTop: 150 } as ScrollEvent;
		const scrollUp = { oldScrollTop: 200, scrollTop: 150 } as ScrollEvent;

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
		const listView = mockListView as unknown as IListView<CodeCellViewModel>;

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
