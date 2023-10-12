/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ScrollEvent } from 'vs/base/common/scrollable';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { CellFocusMode } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookCellAnchor } from 'vs/workbench/contrib/notebook/browser/view/notebookCellAnchor';
import { Emitter } from 'vs/base/common/event';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { CellKind, NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';


suite('NotebookCellAnchor', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const config = new TestConfigurationService();
	const scrollEvent = new Emitter<ScrollEvent>();
	const onDidStopExecution = new Emitter<void>();
	const executionService = {
		getCellExecution: () => { return { state: NotebookCellExecutionState.Executing }; },
	} as unknown as INotebookExecutionStateService;
	const cell = {
		cellKind: CellKind.Code,
		onDidStopExecution: onDidStopExecution.event
	} as unknown as CodeCellViewModel;

	test('Basic anchoring', async function () {
		const cellAnchor = store.add(new NotebookCellAnchor(executionService, config, scrollEvent.event));

		assert(cellAnchor.shouldAnchor(CellFocusMode.Editor, false, cell), 'should anchor if cell editor is focused');
		assert(cellAnchor.shouldAnchor(CellFocusMode.Editor, true, cell), 'should anchor if cell editor is focused');

		assert(cellAnchor.shouldAnchor(CellFocusMode.Container, true, cell), 'should anchor if cell is growing');
		assert(cellAnchor.shouldAnchor(CellFocusMode.Output, true, cell), 'should anchor if cell is growing');

		assert(!cellAnchor.shouldAnchor(CellFocusMode.Container, false, cell), 'should not focus if not growing and editor not focused');
	});

	test('Anchor during execution until user scrolls up', async function () {
		const cellAnchor = store.add(new NotebookCellAnchor(executionService, config, scrollEvent.event));

		assert(cellAnchor.shouldAnchor(CellFocusMode.Container, true, cell));

		scrollEvent.fire({ oldScrollTop: 100, scrollTop: 150 } as ScrollEvent);
		assert(cellAnchor.shouldAnchor(CellFocusMode.Container, true, cell), 'cell should still be anchored after scrolling down');

		scrollEvent.fire({ oldScrollTop: 150, scrollTop: 100 } as ScrollEvent);
		assert(!cellAnchor.shouldAnchor(CellFocusMode.Container, true, cell), 'cell should not be anchored after scrolling up');
		assert(cellAnchor.shouldAnchor(CellFocusMode.Editor, true, cell), 'cell should anchor again if the editor is focused');

		onDidStopExecution.fire();
		assert(cellAnchor.shouldAnchor(CellFocusMode.Container, true, cell), 'cell should anchor for new execution');
	});
});
