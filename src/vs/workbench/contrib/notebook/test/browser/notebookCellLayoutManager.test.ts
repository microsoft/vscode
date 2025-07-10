/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICellViewModel } from '../../browser/notebookBrowser.js';
import { NotebookCellLayoutManager } from '../../browser/notebookCellLayoutManager.js';

suite('NotebookCellLayoutManager', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const mockCellViewModel = () => {
		return { handle: 'cell1' } as unknown as ICellViewModel;
	};

	class MockList {
		private _height = new Map();
		getViewIndex(cell: ICellViewModel) { return this.cells.indexOf(cell); }
		elementHeight(cell: ICellViewModel) { return this._height.get(cell) ?? 100; }
		inRenderingTransaction = false;
		updateElementHeight2(cell: ICellViewModel, height: number) { this._height.set(cell, height); }
		getViewIndexCalled = false;
		cells: ICellViewModel[] = [];
	}
	class MockLoggingService { debug() { } }
	class MockNotebookWidget {
		viewModel = { hasCell: (cell: ICellViewModel) => true, getCellIndex: () => 0 };
		hasEditorFocus() { return true; }
		getAbsoluteTopOfElement() { return 0; }
		getLength() { return 1; }
		visibleRanges = [{ start: 0 }];
		getDomNode(): HTMLElement {
			return {
				style: {
					height: '100px'
				}
			} as HTMLElement;
		}
	}

	test('should update cell height', async () => {
		const cell = mockCellViewModel();
		const cell2 = mockCellViewModel();
		const list = new MockList();
		list.cells.push(cell);
		list.cells.push(cell2);
		const widget = new MockNotebookWidget();
		const mgr = store.add(new NotebookCellLayoutManager(widget as any, list as any, new MockLoggingService() as any));
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
		const mgr = store.add(new NotebookCellLayoutManager(widget as any, list as any, new MockLoggingService() as any));

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
		const mgr = store.add(new NotebookCellLayoutManager(widget as any, list as any, new MockLoggingService() as any));
		await mgr.layoutNotebookCell(cell, 200);
		assert.strictEqual(list.elementHeight(cell), 100);
	});

	test('should not update if height is unchanged', async () => {
		const cell = mockCellViewModel();
		const list = new MockList();
		list.cells.push(cell);
		const widget = new MockNotebookWidget();
		const mgr = store.add(new NotebookCellLayoutManager(widget as any, list as any, new MockLoggingService() as any));
		await mgr.layoutNotebookCell(cell, 100);
		assert.strictEqual(list.elementHeight(cell), 100);
	});
});
