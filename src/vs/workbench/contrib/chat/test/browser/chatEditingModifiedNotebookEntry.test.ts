/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { adjustCellDiffAndOriginalModelBasedOnCellMovements } from '../../browser/chatEditing/chatEditingModifiedNotebookEntry.js';
import { ICellDiffInfo } from '../../browser/chatEditing/chatEditingNotebookEditorIntegration.js';
import { nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { ObservablePromise, observableValue } from '../../../../../base/common/observable.js';
import { CellEditType, NotebookCellsChangeType } from '../../../notebook/common/notebookCommon.js';
import { ITextModel } from '../../../../../editor/common/model.js';

suite('ChatEditingModifiedNotebookEntry Cell Movements', function () {

	const store = new DisposableStore();
	const keep = () => Promise.resolve(true);
	const undo = () => Promise.resolve(true);
	const diff = observableValue('cell1', nullDocumentDiff);
	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
	function createModifiedModel(id: string): ObservablePromise<ITextModel> {
		return `Modified:${id}` as any;

	}
	function createOriginalModel(id: string): ObservablePromise<ITextModel> {
		return `Original:${id}` as any;

	}
	test('Swap first two inserted cells in a previously empty notebook', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			}
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 0, length: 1, newIdx: 1
		}, cellsDiffInfo);

		assert.ok(result);
		assert.strictEqual(result[1].length, 0);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
			},
		]);
	});
	test('Swap first two inserted cells in a notebook that had 2 cells', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('3'),
			}
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 0, length: 1, newIdx: 1
		}, cellsDiffInfo);

		assert.ok(result);
		assert.strictEqual(result[1].length, 0);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('3'),
			}
		]);
	});
	test('Move first inserted cell to the very bottom of notebook that had 2 cells', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('3'),
			}
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 0, length: 1, newIdx: 3
		}, cellsDiffInfo);

		assert.ok(result);
		assert.strictEqual(result[1].length, 0);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('3'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('0'),
			},
		]);
	});
	test('Move last cell to top of notebook after 2 cells were inserted', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('3'),
			}
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 3, length: 1, newIdx: 0
		}, cellsDiffInfo);

		assert.ok(result);
		assert.deepStrictEqual(result[1], [
			{
				editType: CellEditType.Move,
				index: 1,
				length: 1,
				newIdx: 0
			}
		]);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 0,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('3'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 1,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('2'),
			},
		]);
	});

	test('Move second inserted cell to the very bottom of notebook that had 2 cells', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('3'),
			}
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 1, length: 1, newIdx: 3
		}, cellsDiffInfo);

		assert.ok(result);
		assert.strictEqual(result[1].length, 0);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('3'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('1'),
			},
		]);
	});
	test('Move second inserted cell to the second last position of notebook that had 2 cells', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('3'),
			}
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 1, length: 1, newIdx: 2
		}, cellsDiffInfo);

		assert.ok(result);
		assert.strictEqual(result[1].length, 0);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('3'),
			}
		]);
	});
	test('Move first cell to the last position of notebook that had 3 cells deleted from the middle', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('2'), originalCellIndex: 2,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('3'), originalCellIndex: 3,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('4'), originalCellIndex: 4,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 5,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
			},
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 0, length: 1, newIdx: 2
		}, cellsDiffInfo);

		assert.ok(result);
		assert.deepStrictEqual(result[1], [
			{
				editType: CellEditType.Move,
				index: 0,
				length: 1,
				newIdx: 5
			}
		]);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 0,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('2'), originalCellIndex: 1,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('3'), originalCellIndex: 2,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('4'), originalCellIndex: 3,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 4,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 5,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('0'),
			},
		]);
	});
	test('Move second cell to the last position of notebook that had 3 cells deleted from the middle', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('2'), originalCellIndex: 2,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('3'), originalCellIndex: 3,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('4'), originalCellIndex: 4,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 5,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
			},
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 1, length: 1, newIdx: 2
		}, cellsDiffInfo);

		assert.ok(result);
		assert.deepStrictEqual(result[1], [
			{
				editType: CellEditType.Move,
				index: 1,
				length: 1,
				newIdx: 5
			}
		]);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('2'), originalCellIndex: 1,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('3'), originalCellIndex: 2,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('4'), originalCellIndex: 3,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 4,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('2'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 5,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
			},
		]);
	});

	test('Move second cell to the last position of notebook that had 3 cells deleted from middle and 1 inserted in the middle', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('2'), originalCellIndex: 2,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('3'), originalCellIndex: 3,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('4'), originalCellIndex: 4,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('New1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 5,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('5'),
			},
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 1, length: 1, newIdx: 3
		}, cellsDiffInfo);

		assert.ok(result);
		assert.deepStrictEqual(result[1], [
			{
				editType: CellEditType.Move,
				index: 1,
				length: 1,
				newIdx: 5
			}
		]);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('2'), originalCellIndex: 1,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('3'), originalCellIndex: 2,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('4'), originalCellIndex: 3,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('New1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 4,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('5'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 5,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('1'),
			},
		]);
	});
	test('Move last cell to the second position of notebook that had 3 cells deleted from middle and 1 inserted in the middle', async function () {
		const cellsDiffInfo: ICellDiffInfo[] = [
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('2'), originalCellIndex: 2,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('3'), originalCellIndex: 3,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('4'), originalCellIndex: 4,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('New1'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 5,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('5'),
			},
		];
		const result = adjustCellDiffAndOriginalModelBasedOnCellMovements({
			cells: [], kind: NotebookCellsChangeType.Move,
			index: 3, length: 1, newIdx: 1
		}, cellsDiffInfo);

		assert.ok(result);
		assert.deepStrictEqual(result[1], [
			{
				editType: CellEditType.Move,
				index: 5,
				length: 1,
				newIdx: 1
			}
		]);
		assert.deepStrictEqual(result[0], [
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
				modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 1,
				modifiedCellIndex: 1, modifiedModel: createModifiedModel('5'),
			},
			{
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 2,
				modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('2'), originalCellIndex: 3,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('3'), originalCellIndex: 4,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'delete', originalModel: createOriginalModel('4'), originalCellIndex: 5,
				modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
			},
			{
				diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
				modifiedCellIndex: 3, modifiedModel: createModifiedModel('New1'),
			},
		]);
	});
});
