/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { formatCellDuration, getRanges, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';

suite('notebookBrowser', () => {
	suite('getRanges', function () {
		const predicate = (cell: ICellViewModel) => cell.cellKind === CellKind.Code;

		test('all code', function () {
			const cells = [
				{ cellKind: CellKind.Code },
				{ cellKind: CellKind.Code },
			];
			assert.deepStrictEqual(getRanges(cells as ICellViewModel[], predicate), [{ start: 0, end: 2 }]);
		});

		test('none code', function () {
			const cells = [
				{ cellKind: CellKind.Markup },
				{ cellKind: CellKind.Markup },
			];
			assert.deepStrictEqual(getRanges(cells as ICellViewModel[], predicate), []);
		});

		test('start code', function () {
			const cells = [
				{ cellKind: CellKind.Code },
				{ cellKind: CellKind.Markup },
			];
			assert.deepStrictEqual(getRanges(cells as ICellViewModel[], predicate), [{ start: 0, end: 1 }]);
		});

		test('random', function () {
			const cells = [
				{ cellKind: CellKind.Code },
				{ cellKind: CellKind.Code },
				{ cellKind: CellKind.Markup },
				{ cellKind: CellKind.Code },
				{ cellKind: CellKind.Markup },
				{ cellKind: CellKind.Markup },
				{ cellKind: CellKind.Code },
			];
			assert.deepStrictEqual(getRanges(cells as ICellViewModel[], predicate), [{ start: 0, end: 2 }, { start: 3, end: 4 }, { start: 6, end: 7 }]);
		});
	});

	test('formatCellDuration', function () {
		assert.strictEqual(formatCellDuration(0), '0.0s');
		assert.strictEqual(formatCellDuration(10), '0.1s');
		assert.strictEqual(formatCellDuration(200), '0.2s');
		assert.strictEqual(formatCellDuration(3300), '3.3s');
		assert.strictEqual(formatCellDuration(180000), '3m 0.0s');
		assert.strictEqual(formatCellDuration(189412), '3m 9.4s');
	});
});
