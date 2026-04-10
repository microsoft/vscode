/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Mimes } from '../../../../../../base/common/mime.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CellKind, IMainCellDto, IOutputDto, NotebookCellMetadata } from '../../../common/notebookCommon.js';
import { matchCellBasedOnSimilarties } from '../../../common/services/notebookCellMatching.js';
import { NotebookWorker } from '../../../common/services/notebookWebWorker.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IDiffChange } from '../../../../../../base/common/diff/diff.js';


suite('NotebookDiff Diff Service', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let worker: NotebookWorker;
	suiteSetup(() => {
		worker = new NotebookWorker();
	});
	suiteTeardown(() => {
		worker.dispose();
	});

	test('No changes', async () => {
		const { mapping, diff } = await mapCells([
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes.length, 0);
	});

	test('diff different source', async () => {
		const { mapping, diff } = await mapCells([
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange
		]);
	});

	test('diff different source (2 cells)', async () => {
		const { mapping, diff } = await mapCells([
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			[['z'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 1, originalLength: 1, modifiedStart: 1, modifiedLength: 1 } satisfies IDiffChange
		]);
	});

	test('diff different source (first cell changed)', async () => {
		const { mapping, diff } = await mapCells([
			[['import sys'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			[['import pandas'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange
		]);
	});


	test('diff test small source', async () => {
		const { mapping, diff } = await mapCells([
			[['123456789'], 'javascript', CellKind.Code, [], {}]
		], [
			[['987654321'], 'javascript', CellKind.Code, [], {}],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange
		]);
	});

	test('diff test data single cell', async () => {
		const { mapping, diff } = await mapCells([
			[[
				'# This version has a bug\n',
				'def mult(a, b):\n',
				'    return a / b'
			], 'javascript', CellKind.Code, [], {}]
		], [
			[[
				'def mult(a, b):\n',
				'    \'This version is debugged.\'\n',
				'    return a * b'
			], 'javascript', CellKind.Code, [], {}],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange
		]);
	});

	test('diff foo/foe (swapped cells)', async () => {
		const { mapping, diff } = await mapCells([
			[['def foe(x, y):\n', '    return x + y\n', 'foe(3, 2)'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
			[['def foo(x, y):\n', '    return x * y\n', 'foo(1, 2)'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
			[[''], 'javascript', CellKind.Code, [], {}]
		], [
			[['def foo(x, y):\n', '    return x * y\n', 'foo(1, 2)'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
			[['def foe(x, y):\n', '    return x + y\n', 'foe(3, 2)'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
			[[''], 'javascript', CellKind.Code, [], {}]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 1 },
			{ modified: 1, original: 0 },
			{ modified: 2, original: 2 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 0, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 1, originalLength: 1, modifiedStart: 2, modifiedLength: 0 } satisfies IDiffChange,
			// { originalStart: 1, originalLength: 1, modifiedStart: 2, modifiedLength: 0 } satisfies IDiffChange
		]);
	});

	test('diff foo/foe (swapped cells with changes in output)', async () => {
		const { mapping, diff } = await mapCells([
			[['def foe(x, y):\n', '    return x + y\n', 'foe(3, 2)'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
			[['def foo(x, y):\n', '    return x * y\n', 'foo(1, 2)'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
			[[''], 'javascript', CellKind.Code, [], {}]
		], [
			[['def foo(x, y):\n', '    return x * y\n', 'foo(1, 2)'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
			[['def foe(x, y):\n', '    return x + y\n', 'foe(3, 2)'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
			[[''], 'javascript', CellKind.Code, [], {}]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 1 },
			{ modified: 1, original: 0 },
			{ modified: 2, original: 2 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 2, modifiedStart: 0, modifiedLength: 2 } satisfies IDiffChange,
		]);
	});

	test('diff markdown', async () => {
		const { mapping, diff } = await mapCells([
			[['This is a test notebook with only markdown cells'], 'markdown', CellKind.Markup, [], {}],
			[['Lorem ipsum dolor sit amet'], 'markdown', CellKind.Markup, [], {}],
			[['In other news'], 'markdown', CellKind.Markup, [], {}],
		], [
			[['This is a test notebook with markdown cells only'], 'markdown', CellKind.Markup, [], {}],
			[['Lorem ipsum dolor sit amet'], 'markdown', CellKind.Markup, [], {}],
			[['In the news'], 'markdown', CellKind.Markup, [], {}],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('diff insert 1 at the top', async () => {
		const { mapping, diff } = await mapCells([
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}]
		], [
			[['var h = 8;'], 'javascript', CellKind.Code, [], {}],
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: -1 },
			{ modified: 1, original: 0 },
			{ modified: 2, original: 1 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 0, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('diff insert 1 at the top with lots of cells', async () => {

		const { mapping, diff } = await mapCells([
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}],
			[['var c = 3;'], 'javascript', CellKind.Code, [], {}],
			[['var d = 4;'], 'javascript', CellKind.Code, [], {}],
			[['var e = 5;'], 'javascript', CellKind.Code, [], {}],
			[['var f = 6;'], 'javascript', CellKind.Code, [], {}],
			[['var g = 7;'], 'javascript', CellKind.Code, [], {}],
		], [
			[['var h = 8;'], 'javascript', CellKind.Code, [], {}],
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}],
			[['var c = 3;'], 'javascript', CellKind.Code, [], {}],
			[['var d = 4;'], 'javascript', CellKind.Code, [], {}],
			[['var e = 5;'], 'javascript', CellKind.Code, [], {}],
			[['var f = 6;'], 'javascript', CellKind.Code, [], {}],
			[['var g = 7;'], 'javascript', CellKind.Code, [], {}],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: -1 },
			{ modified: 1, original: 0 },
			{ modified: 2, original: 1 },
			{ modified: 3, original: 2 },
			{ modified: 4, original: 3 },
			{ modified: 5, original: 4 },
			{ modified: 6, original: 5 },
			{ modified: 7, original: 6 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 0, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('diff insert 3 at the top with lots of cells', async () => {

		const { mapping, diff } = await mapCells([
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}],
			[['var c = 3;'], 'javascript', CellKind.Code, [], {}],
			[['var d = 4;'], 'javascript', CellKind.Code, [], {}],
			[['var e = 5;'], 'javascript', CellKind.Code, [], {}],
			[['var f = 6;'], 'javascript', CellKind.Code, [], {}],
			[['var g = 7;'], 'javascript', CellKind.Code, [], {}],
		], [
			[['var h = 8;'], 'javascript', CellKind.Code, [], {}],
			[['var i = 8;'], 'javascript', CellKind.Code, [], {}],
			[['var j = 8;'], 'javascript', CellKind.Code, [], {}],
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}],
			[['var c = 3;'], 'javascript', CellKind.Code, [], {}],
			[['var d = 4;'], 'javascript', CellKind.Code, [], {}],
			[['var e = 5;'], 'javascript', CellKind.Code, [], {}],
			[['var f = 6;'], 'javascript', CellKind.Code, [], {}],
			[['var g = 7;'], 'javascript', CellKind.Code, [], {}],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: -1 },
			{ modified: 1, original: -1 },
			{ modified: 2, original: -1 },
			{ modified: 3, original: 0 },
			{ modified: 4, original: 1 },
			{ modified: 5, original: 2 },
			{ modified: 6, original: 3 },
			{ modified: 7, original: 4 },
			{ modified: 8, original: 5 },
			{ modified: 9, original: 6 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 0, modifiedStart: 0, modifiedLength: 3 } satisfies IDiffChange,
		]);
	});

	test('diff insert 1 in the middle', async () => {

		const { mapping, diff } = await mapCells([
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}],
			[['var c = 3;'], 'javascript', CellKind.Code, [], {}],
			[['var d = 4;'], 'javascript', CellKind.Code, [], {}],
			[['var e = 5;'], 'javascript', CellKind.Code, [], {}],
			[['var f = 6;'], 'javascript', CellKind.Code, [], {}],
			[['var g = 7;'], 'javascript', CellKind.Code, [], {}],
		], [
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}],
			[['var c = 3;'], 'javascript', CellKind.Code, [], {}],
			[['var d = 4;'], 'javascript', CellKind.Code, [], {}],
			[['var h = 8;'], 'javascript', CellKind.Code, [], {}],
			[['var e = 5;'], 'javascript', CellKind.Code, [], {}],
			[['var f = 6;'], 'javascript', CellKind.Code, [], {}],
			[['var g = 7;'], 'javascript', CellKind.Code, [], {}],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: -1 },
			{ modified: 5, original: 4 },
			{ modified: 6, original: 5 },
			{ modified: 7, original: 6 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 4, originalLength: 0, modifiedStart: 4, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('LCS (swap cells with outputs)', async () => {
		const { mapping, diff } = await mapCells([
			[['# Description'], 'markdown', CellKind.Markup, [], { metadata: {} }],
			[['x = 3'], 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }]
		], [
			[['# Description'], 'markdown', CellKind.Markup, [], { metadata: {} }],
			[['x = 3'], 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }],
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 3, originalLength: 1, modifiedStart: 3, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('LCS (outputs changed)', async () => {
		const { mapping, diff } = await mapCells([
			[['# Description'], 'markdown', CellKind.Markup, [], { metadata: {} }],
			[['x = 3'], 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
			[['y'], 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }]
		], [
			[['# Description'], 'markdown', CellKind.Markup, [], { metadata: {} }],
			[['x = 3'], 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [], { metadata: { collapsed: true } }],
			[['y'], 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('Swap cells with output and with same code in each cell', async () => {
		const { mapping, diff } = await mapCells([
			[['# Description'], 'markdown', CellKind.Markup, [], { metadata: {} }],
			[['x = 3'], 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }],
			[['x = 5'], 'javascript', CellKind.Code, [], {}],
			[['x'], 'javascript', CellKind.Code, [], {}],
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}],
		], [
			[['# Description'], 'markdown', CellKind.Markup, [], { metadata: {} }],
			[['x = 3'], 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }],
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
			[['x = 5'], 'javascript', CellKind.Code, [], {}],
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}],
			[['x'], 'javascript', CellKind.Code, [], {}],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 3, originalLength: 1, modifiedStart: 3, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 5, originalLength: 1, modifiedStart: 5, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 6, originalLength: 1, modifiedStart: 6, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('Change outputs of cells', async () => {
		const { mapping, diff } = await mapCells([
			[['# Description'], 'markdown', CellKind.Markup, [], { metadata: {} }],
			[['x = 3'], 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
			[['y'], 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }],
			[['x = 5'], 'javascript', CellKind.Code, [], {}],
			[['x'], 'javascript', CellKind.Code, [], {}],
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}],
		], [
			[['# Description'], 'markdown', CellKind.Markup, [], { metadata: {} }],
			[['x = 3'], 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			[['x'], 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }],
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
			[['x = 5'], 'javascript', CellKind.Code, [], {}],
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}],
			[['y'], 'javascript', CellKind.Code, [], {}],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 2, modifiedStart: 2, modifiedLength: 2 } satisfies IDiffChange,
			{ originalStart: 5, originalLength: 2, modifiedStart: 5, modifiedLength: 2 } satisfies IDiffChange,
		]);
	});

	test('Insert a new cell', async () => {
		const { mapping, diff } = await mapCells([
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}],
			[['var c = 3;'], 'javascript', CellKind.Code, [], {}],
			[['var d = 4;'], 'javascript', CellKind.Code, [], {}],
			[['var e = 5;'], 'javascript', CellKind.Code, [], {}],
			[['var f = 6;'], 'javascript', CellKind.Code, [], {}],
			[['var g = 7;'], 'javascript', CellKind.Code, [], {}],
		], [
			[['var a = 1;'], 'javascript', CellKind.Code, [], {}],
			[['var b = 2;'], 'javascript', CellKind.Code, [], {}],
			[['var c = 3;'], 'javascript', CellKind.Code, [], {}],
			[['var d = 4;'], 'javascript', CellKind.Code, [], {}],
			[['var h = 8;'], 'javascript', CellKind.Code, [], {}],
			[['var e = 5;'], 'javascript', CellKind.Code, [], {}],
			[['var f = 6;'], 'javascript', CellKind.Code, [], {}],
			[['var g = 7;'], 'javascript', CellKind.Code, [], {}],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: -1 },//
			{ modified: 5, original: 4 },
			{ modified: 6, original: 5 },
			{ modified: 7, original: 6 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 4, originalLength: 0, modifiedStart: 4, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('diff output', async () => {
		const { mapping, diff } = await mapCells([
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([4])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 1, originalLength: 1, modifiedStart: 1, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('diff output fast check', async () => {
		const { mapping, diff } = await mapCells([
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([4])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			[['x'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			[['y'], 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 1, originalLength: 1, modifiedStart: 1, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('No cells', async () => {
		const { mapping, diff } = await mapCells([
		], [
		]);

		assert.deepStrictEqual(mapping, [
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
		]);
	});
	test('No cells and add 1 cell', async () => {
		const { mapping, diff } = await mapCells([
		], [
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: -1 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 0, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('One cells and delete 1 cell', async () => {
		const { mapping, diff } = await mapCells([
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		], [
		]);

		assert.deepStrictEqual(mapping, [
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 0 } satisfies IDiffChange,
		]);
	});
	test('No changes with 1 cell', async () => {
		const { mapping, diff } = await mapCells([
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		], [
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			// { originalStart: 0, originalLength: 0, modifiedStart: 0, modifiedLength: 0 } satisfies IDiffChange,
		]);
	});
	test('One changes with 1 cell', async () => {
		const { mapping, diff } = await mapCells([
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		],
			[
				[['print("Foo Bar")'], 'python', CellKind.Code, [], undefined]
			]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('No changes with 2 cells', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		], [
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			// { originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('One changes with 2 cells, 1st cell changed', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		], [
			[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('2 cells, 1st cell deleted', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		], [
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 1 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 0 } satisfies IDiffChange,
		]);
	});
	test('2 cells, inserted a cell in the middle', async () => {
		const { mapping, diff } = await mapCells([
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['print("Foo Bar")'], 'python', CellKind.Code, [], undefined]
		], [
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['print("Bar Baz")'], 'python', CellKind.Code, [], undefined],
			[['print("Foo Bar")'], 'python', CellKind.Code, [], undefined]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: -1 },
			{ modified: 2, original: 1 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 1, originalLength: 0, modifiedStart: 1, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('One changes with 2 cells, 2nd cell changed', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		], [
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Foo Bar")'], 'python', CellKind.Code, [], undefined]
		]);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 1, originalLength: 1, modifiedStart: 1, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('Two cells, all cells changed', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined]
		]
			, [
				[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Foo Bar")'], 'python', CellKind.Code, [], undefined]
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 2, modifiedStart: 0, modifiedLength: 2 } satisfies IDiffChange,
		]);
	});
	test('Insert a md cell and modify the next code cell (few cells)', async () => {
		const { mapping, diff } = await mapCells([
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
		]
			, [
				[['# Description'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Hello worldz")'], 'python', CellKind.Code, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: -1 },
			{ modified: 1, original: 0 },
			{ modified: 2, original: 1 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 0, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 0, originalLength: 1, modifiedStart: 1, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('Insert a md cell and modify the next code cell', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			[['print("bar baz1234")'], 'python', CellKind.Code, [], undefined]
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
				[['# New Markdown cell'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo baz")'], 'python', CellKind.Code, [], undefined],
				[['print("bar baz1234")'], 'python', CellKind.Code, [], undefined]
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: -1 },
			{ modified: 4, original: 3 },
			{ modified: 5, original: 4 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 3, originalLength: 0, modifiedStart: 3, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 3, originalLength: 1, modifiedStart: 4, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('Delete code cell and insert MD cell, both will not match', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['import sys'], 'python', CellKind.Code, [], undefined],
			[['sys.executable'], 'python', CellKind.Code, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['import sys'], 'python', CellKind.Code, [], undefined],
				[['# Header'], 'python', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: -1 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('Delete MD cell and insert code cell, both will not match', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['import sys'], 'python', CellKind.Code, [], undefined],
			[['sys.executable'], 'python', CellKind.Code, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['import sys'], 'python', CellKind.Code, [], undefined],
				[['# Header'], 'python', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: -1 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('Insert a md cell and modify the next 2 code cells', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Foo Bar")'], 'python', CellKind.Code, [], undefined],
			[['print("bar baz")'], 'python', CellKind.Code, [], undefined]
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
				[['# New Markdown cell'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Foo BaZ")'], 'python', CellKind.Code, [], undefined],
				[['print("bar baz Modified")'], 'python', CellKind.Code, [], undefined]
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: -1 },
			{ modified: 4, original: 3 },
			{ modified: 5, original: 4 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 3, originalLength: 0, modifiedStart: 3, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 3, originalLength: 1, modifiedStart: 4, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 4, originalLength: 1, modifiedStart: 5, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});

	test('Insert a md cell, delete a cell and modify the next 2 code cells', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Foo Bar")'], 'python', CellKind.Code, [], undefined],
			[['print("bar baz")'], 'python', CellKind.Code, [], undefined],
			[['print("Fox Trot")'], 'python', CellKind.Code, [], undefined]
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
				[['# New Markdown cell'], 'markdown', CellKind.Markup, [], undefined],
				// [['print("Foo BaZ")'], 'python', CellKind.Code, [], undefined],
				[['print("bar baz Modified")'], 'python', CellKind.Code, [], undefined],
				[['print("Fox Trots")'], 'python', CellKind.Code, [], undefined]
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: -1 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 3, originalLength: 1, modifiedStart: 3, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 4, originalLength: 1, modifiedStart: 4, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 5, originalLength: 1, modifiedStart: 5, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('Insert a md cell, delete a code cell and modify the next 2 code cells (deleted and inserted lineup)', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['import sys'], 'python', CellKind.Code, [], undefined],
			[['print("Foo Bar")'], 'python', CellKind.Code, [], undefined],
			[['print("bar baz")'], 'python', CellKind.Code, [], undefined],
			[['print("Fox Trot")'], 'python', CellKind.Code, [], undefined]
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['import sys'], 'python', CellKind.Code, [], undefined],
				[['sys.executable'], 'python', CellKind.Code, [], undefined],
				// [['print("Foo BaZ")'], 'python', CellKind.Code, [], undefined],
				[['print("bar baz Modified")'], 'python', CellKind.Code, [], undefined],
				[['print("Fox Trot")'], 'python', CellKind.Code, [], undefined]
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 3, originalLength: 2, modifiedStart: 3, modifiedLength: 2 } satisfies IDiffChange,
		]);
	});

	test('Insert a few md cells and modify the next few code cells', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			[['# Another MD cell'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			[['# Yet another MD cell'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
				[['# New 1'], 'markdown', CellKind.Markup, [], undefined],
				[['# New 2'], 'markdown', CellKind.Markup, [], undefined],
				[['# Another MD cell (modified1)'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
				[['# Another MD cell (modified)'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: -1 },
			{ modified: 5, original: -1 },
			{ modified: 6, original: 4 },
			{ modified: 7, original: 5 },
			{ modified: 8, original: 6 },
			{ modified: 9, original: 7 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 4, originalLength: 0, modifiedStart: 4, modifiedLength: 2 } satisfies IDiffChange,
			{ originalStart: 4, originalLength: 1, modifiedStart: 6, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 6, originalLength: 1, modifiedStart: 8, modifiedLength: 1 } satisfies IDiffChange,
			// { originalStart: 5, originalLength: 1, modifiedStart: 5, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('Insert & delete a few md cells and modify the next few code cells', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			[['# Another MD cell'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			[['# Yet another MD cell'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
				[['# New 1'], 'markdown', CellKind.Markup, [], undefined],
				[['# New 2'], 'markdown', CellKind.Markup, [], undefined],
				[['# Another MD cell (modified1)'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
				[['# Another MD cell (modified)'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: -1 },
			{ modified: 5, original: -1 },
			{ modified: 6, original: 4 },
			{ modified: 7, original: 5 },
			{ modified: 8, original: 6 },
			{ modified: 9, original: 7 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 4, originalLength: 0, modifiedStart: 4, modifiedLength: 2 } satisfies IDiffChange,
			{ originalStart: 4, originalLength: 1, modifiedStart: 6, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 6, originalLength: 1, modifiedStart: 8, modifiedLength: 1 } satisfies IDiffChange,
			// { originalStart: 5, originalLength: 1, modifiedStart: 5, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('Modify, then insert ', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			[['# Another MD cell'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			[['# Yet another MD cell'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['# Foo BaZ'], 'markdown', CellKind.Markup, [], undefined],
				[['# Header'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
				[['# Another MD cell'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
				[['# Yet another MD cell'], 'markdown', CellKind.Markup, [], undefined],
				[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: -1 },
			{ modified: 4, original: 3 },
			{ modified: 5, original: 4 },
			{ modified: 6, original: 5 },
			{ modified: 7, original: 6 },
			{ modified: 8, original: 7 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 3, originalLength: 0, modifiedStart: 3, modifiedLength: 1 } satisfies IDiffChange,
			// { originalStart: 6, originalLength: 1, modifiedStart: 8, modifiedLength: 1 } satisfies IDiffChange,
			// { originalStart: 5, originalLength: 1, modifiedStart: 5, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('Modify, then delete ', async () => {
		const { mapping, diff } = await mapCells([
			[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
			[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
			[['# Foo Bar'], 'markdown', CellKind.Markup, [], undefined],
			[['print("foo bar")'], 'python', CellKind.Code, [], undefined],
			[['# Another MD cell'], 'markdown', CellKind.Markup, [], undefined],
			[['import sys'], 'python', CellKind.Code, [], undefined],
			[['# Yet another MD cell'], 'markdown', CellKind.Markup, [], undefined],
			[['sys.executable'], 'python', CellKind.Code, [], undefined],
		]
			, [
				[['# Hello World'], 'markdown', CellKind.Markup, [], undefined],
				[['print("Hello world")'], 'python', CellKind.Code, [], undefined],
				[['# Foo BaZ'], 'markdown', CellKind.Markup, [], undefined],
				[['# Another MD cell'], 'markdown', CellKind.Markup, [], undefined],
				[['import sys'], 'python', CellKind.Code, [], undefined],
				[['# Yet another MD cell'], 'markdown', CellKind.Markup, [], undefined],
				[['sys.executable'], 'python', CellKind.Code, [], undefined],
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 4 },
			{ modified: 4, original: 5 },
			{ modified: 5, original: 6 },
			{ modified: 6, original: 7 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 3, originalLength: 1, modifiedStart: 3, modifiedLength: 0 } satisfies IDiffChange,
			// { originalStart: 6, originalLength: 1, modifiedStart: 8, modifiedLength: 1 } satisfies IDiffChange,
			// { originalStart: 5, originalLength: 1, modifiedStart: 5, modifiedLength: 1 } satisfies IDiffChange,
		]);
	});
	test('Update code cell', async () => {
		const { mapping, diff } = await mapCells([
			[
				[
					'# This is a simple notebook\n',
					'\n',
					`There's nothing special here, I am just writing some text and plotting a function`
				], 'markdown', CellKind.Markup, [], undefined],
			[
				[
					'import numpy as np\n',
					'import matplotlib.pyplot as plt\n',
					'import pandas as pd\n',
					'\n',
					'%matplotlib inline'
				], 'python', CellKind.Code, [], undefined],
			[
				[
					'x = np.linspace(0, 4*np.pi,50)\n',
					'y = np.sin(x)\n',
					'\n',
					'plt.plot(x, y)'
				], 'python', CellKind.Code, [], undefined],
			[
				[
					'df = pd.DataFrame({f"column_{c}": np.random.normal(size=100) for c in range(100)})\n',
					'df'
				], 'python', CellKind.Code, [], undefined],
			[
				[
					'You could actually do some neat stuff with it, pandas like changing the colors (values above 1 should be green)'
				], 'python', CellKind.Markup, [], undefined],
			[
				[
					'df.style.applymap(lambda x: "background-color: green" if x>1 else "background-color: white")'
				], 'python', CellKind.Code, [], undefined],
			[
				[], 'python', CellKind.Code, [], undefined],
		]
			, [
				[
					[
						'# This is a simple notebook\n',
						'\n',
						`There's nothing special here, I am just writing some text and plotting a function`
					], 'markdown', CellKind.Markup, [], undefined],
				[
					[
						'import numpy as np\n',
						'import matplotlib.pyplot as plt\n',
						'import pandas as pd\n',
						'\n',
						'%matplotlib inline'
					], 'python', CellKind.Code, [], undefined],
				[
					[
						'x = np.linspace(0, 4*np.pi,50)\n',
						'y = 2 * np.sin(x)\n',
						'\n',
						'plt.plot(x, y)'
					], 'python', CellKind.Code, [], undefined],
				[
					[
						'df = pd.DataFrame({f"column_{c}": np.random.normal(size=100) for c in range(100)})\n',
						'df'
					], 'python', CellKind.Code, [], undefined],
				[
					[
						'You could actually do some neat stuff with it, pandas like changing the colors (values above 1 should be green)'
					], 'python', CellKind.Markup, [], undefined],
				[
					[
						'df.style.applymap(lambda x: "background-color: green" if x>1 else "background-color: white")'
					], 'python', CellKind.Code, [], undefined],
				[
					[], 'python', CellKind.Code, [], undefined],
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
		]);

	});
	test('Update code cell 1', async () => {
		const { mapping, diff } = await mapCells([
			[
				[
					'# Hello World'
				], 'markdown', CellKind.Markup, [], undefined],
			[
				[
					'import os\n',
					'from pprint import pprint \n',
					'from sklearn.preprocessing import LabelEncoder\n',
					'import ast\n',
					'import pandas as pd\n',
					'from clipper import clipper\n',
					'import ffmpeg'
				], 'python', CellKind.Code, [], undefined],
			[
				[
					`data_dir = '../../../app/data/'\n`,
					`output_dir = 'output/'\n`,
					`video_dir = 'videos/'\n`,
					'\n',
					'file_path = data_dir+output_dir+data_file\n',
					'video_path = data_dir+video_dir+video_file\n',
					'\n',
					'df = pd.read_csv(file_path)\n',
					'df.head()'
				], 'python', CellKind.Code, [], undefined],
			[
				[
					'# convert the string representation of results to a list\n',
					`df['list_categories'] = df['categories'].apply(ast.literal_eval)\n`,
					'\n',
					'# get most likely label from each list\n',
					`df['label'] = df['list_categories'].apply(lambda x: x[0] if x else None)`
				], 'python', CellKind.Code, [], undefined],
			[
				[
					'# initialize the LabelEncoder\n',
					'label_encoder = LabelEncoder()\n',
					'\n',
					'# fit and transform the label to a numerical value\n',
					`numerical_data = label_encoder.fit_transform(df['label'])\n`,
					'\n',
					`df['label_value'] = numerical_data`
				], 'python', CellKind.Markup, [], undefined],
		]
			, [
				[
					[
						'# Updated markdown cell'
					], 'markdown', CellKind.Markup, [], undefined],
				[
					[
						'from sklearn.preprocessing import LabelEncoder\n',
						'import ast\n',
						'import pandas as pd\n',
						'from clipper import clipper\n',
						'import ffmpeg'
					], 'python', CellKind.Code, [], undefined],
				[
					[
						`data_dir = '../../../app/data/'\n`,
						`output_dir = 'output/'\n`,
						`video_dir = 'videos/'\n`,
						'\n',
						'file_path = data_dir+output_dir+data_file\n',
						'video_path = data_dir+video_dir+video_file\n',
						'\n',
						'df = pd.read_csv(file_path)\n',
						'df.head()'
					], 'python', CellKind.Code, [], undefined],
				[
					[
						'# convert the string representation of results to a list\n',
						`df['list_categories'] = df['categories'].apply(ast.literal_eval)\n`,
						'\n',
						'# get most likely label from each list\n',
						`df['label'] = df['list_categories'].apply(lambda x: x[0] if x else None)`
					], 'python', CellKind.Code, [], undefined],
				[
					[
						'# initialize the LabelEncoder\n',
						'label_encoder = LabelEncoder()\n',
						'\n',
						'# fit and transform the label to a numerical value\n',
						`numerical_data = label_encoder.fit_transform(df['label'])\n`,
						'\n',
						`df['label_value'] = numerical_data`
					], 'python', CellKind.Markup, [], undefined],
			]
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 2, modifiedStart: 0, modifiedLength: 2 } satisfies IDiffChange,
		]);
	});
	test('Detect modification and insertion of cells', async () => {
		const { mapping, diff } = await mapCells(
			[
				{
					'cell_type': 'markdown',
					'source': [
						'# Live 3D Human Pose Estimation with OpenVINO\n',
						'\n',
						'This notebook demonstrates live 3D Human Pose Estimation with OpenVINO via a webcam. We utilize the model [human-pose-estimation-3d-0001](https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001) from [Open Model Zoo](https://github.com/openvinotoolkit/open_model_zoo/). At the end of this notebook, you will see live inference results from your webcam (if available). Alternatively, you can also upload a video file to test out the algorithms.\n',
						'**Make sure you have properly installed the [Jupyter extension](https://github.com/jupyter-widgets/pythreejs#jupyterlab) and been using JupyterLab to run the demo as suggested in the `README.md`**\n',
						'\n',
						'> **NOTE**: _To use a webcam, you must run this Jupyter notebook on a computer with a webcam. If you run on a remote server, the webcam will not work. However, you can still do inference on a video file in the final step. This demo utilizes the Python interface in `Three.js` integrated with WebGL to process data from the model inference. These results are processed and displayed in the notebook._\n',
						'\n',
						'_To ensure that the results are displayed correctly, run the code in a recommended browser on one of the following operating systems:_\n',
						'_Ubuntu, Windows: Chrome_\n',
						'_macOS: Safari_\n',
						'\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Prerequisites](#Prerequisites)\n',
						'- [Imports](#Imports)\n',
						'- [The model](#The-model)\n',
						'    - [Download the model](#Download-the-model)\n',
						'    - [Convert Model to OpenVINO IR format](#Convert-Model-to-OpenVINO-IR-format)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Load the model](#Load-the-model)\n',
						'- [Processing](#Processing)\n',
						'    - [Model Inference](#Model-Inference)\n',
						'    - [Draw 2D Pose Overlays](#Draw-2D-Pose-Overlays)\n',
						'    - [Main Processing Function](#Main-Processing-Function)\n',
						'- [Run](#Run)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'Make sure your [Jupyter extension](https://github.com/jupyter-widgets/pythreejs#jupyterlab) is working properly.\n',
						'To avoid errors that may arise from the version of the dependency package, it is recommended to use the **JupyterLab** instead of the Jupyter notebook to display image results.\n',
						'```\n',
						'- pip install --upgrade pip && pip install -r requirements.txt\n',
						'- jupyter labextension install --no-build @jupyter-widgets/jupyterlab-manager\n',
						'- jupyter labextension install --no-build jupyter-datawidgets/extension\n',
						'- jupyter labextension install jupyter-threejs\n',
						'- jupyter labextension list\n',
						'```\n',
						'\n',
						'You should see:\n',
						'```\n',
						'JupyterLab v...\n',
						'  ...\n',
						'    jupyterlab-datawidgets v... enabled OK\n',
						'    @jupyter-widgets/jupyterlab-manager v... enabled OK\n',
						'    jupyter-threejs v... enabled OK\n',
						'```\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/3D-pose-estimation-webcam/3D-pose-estimation.ipynb" />\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'**The `pythreejs` extension may not display properly when using a Jupyter Notebook release. Therefore, it is recommended to use Jupyter Lab instead.**'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install pythreejs "openvino-dev>=2024.0.0" "opencv-python" "torch" "onnx<1.16.2" --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Imports\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import collections\n',
						'import time\n',
						'from pathlib import Path\n',
						'\n',
						'import cv2\n',
						'import ipywidgets as widgets\n',
						'import numpy as np\n',
						'from IPython.display import clear_output, display\n',
						'import openvino as ov\n',
						'\n',
						'# Fetch `notebook_utils` module\n',
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'with open("notebook_utils.py", "w") as f:\n',
						'    f.write(r.text)\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/engine3js.py",\n',
						')\n',
						'with open("engine3js.py", "w") as f:\n',
						'    f.write(r.text)\n',
						'\n',
						'import notebook_utils as utils\n',
						'import engine3js as engine'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## The model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Download the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We use `omz_downloader`, which is a command line tool from the `openvino-dev` package. `omz_downloader` automatically creates a directory structure and downloads the selected model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# directory where model will be downloaded\n',
						'base_model_dir = "model"\n',
						'\n',
						'# model name as named in Open Model Zoo\n',
						'model_name = "human-pose-estimation-3d-0001"\n',
						'# selected precision (FP32, FP16)\n',
						'precision = "FP32"\n',
						'\n',
						'BASE_MODEL_NAME = f"{base_model_dir}/public/{model_name}/{model_name}"\n',
						'model_path = Path(BASE_MODEL_NAME).with_suffix(".pth")\n',
						'onnx_path = Path(BASE_MODEL_NAME).with_suffix(".onnx")\n',
						'\n',
						'ir_model_path = Path(f"model/public/{model_name}/{precision}/{model_name}.xml")\n',
						'model_weights_path = Path(f"model/public/{model_name}/{precision}/{model_name}.bin")\n',
						'\n',
						'if not model_path.exists():\n',
						'    download_command = f"omz_downloader " f"--name {model_name} " f"--output_dir {base_model_dir}"\n',
						'    ! $download_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Convert Model to OpenVINO IR format\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'The selected model comes from the public directory, which means it must be converted into OpenVINO Intermediate Representation (OpenVINO IR). We use `omz_converter` to convert the ONNX format model to the OpenVINO IR format.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'if not onnx_path.exists():\n',
						'    convert_command = (\n',
						'        f"omz_converter " f"--name {model_name} " f"--precisions {precision} " f"--download_dir {base_model_dir} " f"--output_dir {base_model_dir}"\n',
						'    )\n',
						'    ! $convert_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'device = utils.device_widget()\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Converted models are located in a fixed structure, which indicates vendor, model name and precision.\n',
						'\n',
						'First, initialize the inference engine, OpenVINO Runtime. Then, read the network architecture and model weights from the `.bin` and `.xml` files to compile for the desired device. An inference request is then created to infer the compiled model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# initialize inference engine\n',
						'core = ov.Core()\n',
						'# read the network and corresponding weights from file\n',
						'model = core.read_model(model=ir_model_path, weights=model_weights_path)\n',
						'# load the model on the specified device\n',
						'compiled_model = core.compile_model(model=model, device_name=device.value)\n',
						'infer_request = compiled_model.create_infer_request()\n',
						'input_tensor_name = model.inputs[0].get_any_name()\n',
						'\n',
						'# get input and output names of nodes\n',
						'input_layer = compiled_model.input(0)\n',
						'output_layers = list(compiled_model.outputs)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The input for the model is data from the input image and the outputs are heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'input_layer.any_name, [o.any_name for o in output_layers]'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Processing\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Model Inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Frames captured from video files or the live webcam are used as the input for the 3D model. This is how you obtain the output heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def model_infer(scaled_img, stride):\n',
						'    """\n',
						'    Run model inference on the input image\n',
						'\n',
						'    Parameters:\n',
						'        scaled_img: resized image according to the input size of the model\n',
						'        stride: int, the stride of the window\n',
						'    """\n',
						'\n',
						'    # Remove excess space from the picture\n',
						'    img = scaled_img[\n',
						'        0 : scaled_img.shape[0] - (scaled_img.shape[0] % stride),\n',
						'        0 : scaled_img.shape[1] - (scaled_img.shape[1] % stride),\n',
						'    ]\n',
						'\n',
						'    img = np.transpose(img, (2, 0, 1))[None,]\n',
						'    infer_request.infer({input_tensor_name: img})\n',
						'    # A set of three inference results is obtained\n',
						'    results = {name: infer_request.get_tensor(name).data[:] for name in {"features", "heatmaps", "pafs"}}\n',
						'    # Get the results\n',
						'    results = (results["features"][0], results["heatmaps"][0], results["pafs"][0])\n',
						'\n',
						'    return results'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Draw 2D Pose Overlays\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We need to define some connections between the joints in advance, so that we can draw the structure of the human body in the resulting image after obtaining the inference results.\n',
						'Joints are drawn as circles and limbs are drawn as lines. The code is based on the [3D Human Pose Estimation Demo](https://github.com/openvinotoolkit/open_model_zoo/tree/master/demos/human_pose_estimation_3d_demo/python) from Open Model Zoo.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# 3D edge index array\n',
						'body_edges = np.array(\n',
						'    [\n',
						'        [0, 1],\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [1, 15],\n',
						'        [15, 16],  # nose - l_eye - l_ear\n',
						'        [1, 17],\n',
						'        [17, 18],  # nose - r_eye - r_ear\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'body_edges_2d = np.array(\n',
						'    [\n',
						'        [0, 1],  # neck - nose\n',
						'        [1, 16],\n',
						'        [16, 18],  # nose - l_eye - l_ear\n',
						'        [1, 15],\n',
						'        [15, 17],  # nose - r_eye - r_ear\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'def draw_poses(frame, poses_2d, scaled_img, use_popup):\n',
						'    """\n',
						'    Draw 2D pose overlays on the image to visualize estimated poses.\n',
						'    Joints are drawn as circles and limbs are drawn as lines.\n',
						'\n',
						'    :param frame: the input image\n',
						'    :param poses_2d: array of human joint pairs\n',
						'    """\n',
						'    for pose in poses_2d:\n',
						'        pose = np.array(pose[0:-1]).reshape((-1, 3)).transpose()\n',
						'        was_found = pose[2] > 0\n',
						'\n',
						'        pose[0], pose[1] = (\n',
						'            pose[0] * frame.shape[1] / scaled_img.shape[1],\n',
						'            pose[1] * frame.shape[0] / scaled_img.shape[0],\n',
						'        )\n',
						'\n',
						'        # Draw joints.\n',
						'        for edge in body_edges_2d:\n',
						'            if was_found[edge[0]] and was_found[edge[1]]:\n',
						'                cv2.line(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, edge[0]].astype(np.int32)),\n',
						'                    tuple(pose[0:2, edge[1]].astype(np.int32)),\n',
						'                    (255, 255, 0),\n',
						'                    4,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'        # Draw limbs.\n',
						'        for kpt_id in range(pose.shape[1]):\n',
						'            if pose[2, kpt_id] != -1:\n',
						'                cv2.circle(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, kpt_id].astype(np.int32)),\n',
						'                    3,\n',
						'                    (0, 255, 255),\n',
						'                    -1,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'\n',
						'    return frame'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Main Processing Function\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run 3D pose estimation on the specified source. It could be either a webcam feed or a video file.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def run_pose_estimation(source=0, flip=False, use_popup=False, skip_frames=0):\n',
						'    """\n',
						'    2D image as input, using OpenVINO as inference backend,\n',
						'    get joints 3D coordinates, and draw 3D human skeleton in the scene\n',
						'\n',
						'    :param source:      The webcam number to feed the video stream with primary webcam set to "0", or the video path.\n',
						'    :param flip:        To be used by VideoPlayer function for flipping capture image.\n',
						'    :param use_popup:   False for showing encoded frames over this notebook, True for creating a popup window.\n',
						'    :param skip_frames: Number of frames to skip at the beginning of the video.\n',
						'    """\n',
						'\n',
						'    focal_length = -1  # default\n',
						'    stride = 8\n',
						'    player = None\n',
						'    skeleton_set = None\n',
						'\n',
						'    try:\n',
						'        # create video player to play with target fps  video_path\n',
						'        # get the frame from camera\n',
						`        # You can skip first N frames to fast forward video. change 'skip_first_frames'\n`,
						'        player = utils.VideoPlayer(source, flip=flip, fps=30, skip_first_frames=skip_frames)\n',
						'        # start capturing\n',
						'        player.start()\n',
						'\n',
						'        input_image = player.next()\n',
						'        # set the window size\n',
						'        resize_scale = 450 / input_image.shape[1]\n',
						'        windows_width = int(input_image.shape[1] * resize_scale)\n',
						'        windows_height = int(input_image.shape[0] * resize_scale)\n',
						'\n',
						'        # use visualization library\n',
						'        engine3D = engine.Engine3js(grid=True, axis=True, view_width=windows_width, view_height=windows_height)\n',
						'\n',
						'        if use_popup:\n',
						'            # display the 3D human pose in this notebook, and origin frame in popup window\n',
						'            display(engine3D.renderer)\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(title, cv2.WINDOW_KEEPRATIO | cv2.WINDOW_AUTOSIZE)\n',
						'        else:\n',
						'            # set the 2D image box, show both human pose and image in the notebook\n',
						'            imgbox = widgets.Image(format="jpg", height=windows_height, width=windows_width)\n',
						'            display(widgets.HBox([engine3D.renderer, imgbox]))\n',
						'\n',
						'        skeleton = engine.Skeleton(body_edges=body_edges)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'\n',
						'        while True:\n',
						'            # grab the frame\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'\n',
						'            # resize image and change dims to fit neural network input\n',
						'            # (see https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001)\n',
						'            scaled_img = cv2.resize(frame, dsize=(model.inputs[0].shape[3], model.inputs[0].shape[2]))\n',
						'\n',
						'            if focal_length < 0:  # Focal length is unknown\n',
						'                focal_length = np.float32(0.8 * scaled_img.shape[1])\n',
						'\n',
						'            # inference start\n',
						'            start_time = time.time()\n',
						'            # get results\n',
						'            inference_result = model_infer(scaled_img, stride)\n',
						'\n',
						'            # inference stop\n',
						'            stop_time = time.time()\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Process the point to point coordinates of the data\n',
						'            poses_3d, poses_2d = engine.parse_poses(inference_result, 1, stride, focal_length, True)\n',
						'\n',
						'            # use processing times from last 200 frames\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'\n',
						'            if len(poses_3d) > 0:\n',
						'                # From here, you can rotate the 3D point positions using the function "draw_poses",\n',
						'                # or you can directly make the correct mapping below to properly display the object image on the screen\n',
						'                poses_3d_copy = poses_3d.copy()\n',
						'                x = poses_3d_copy[:, 0::4]\n',
						'                y = poses_3d_copy[:, 1::4]\n',
						'                z = poses_3d_copy[:, 2::4]\n',
						'                poses_3d[:, 0::4], poses_3d[:, 1::4], poses_3d[:, 2::4] = (\n',
						'                    -z + np.ones(poses_3d[:, 2::4].shape) * 200,\n',
						'                    -y + np.ones(poses_3d[:, 2::4].shape) * 100,\n',
						'                    -x,\n',
						'                )\n',
						'\n',
						'                poses_3d = poses_3d.reshape(poses_3d.shape[0], 19, -1)[:, :, 0:3]\n',
						'                people = skeleton(poses_3d=poses_3d)\n',
						'\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'                engine3D.scene_add(people)\n',
						'                skeleton_set = people\n',
						'\n',
						'                # draw 2D\n',
						'                frame = draw_poses(frame, poses_2d, scaled_img, use_popup)\n',
						'\n',
						'            else:\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                    skeleton_set = None\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'            cv2.putText(\n',
						'                frame,\n',
						'                f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                (10, 30),\n',
						'                cv2.FONT_HERSHEY_COMPLEX,\n',
						'                0.7,\n',
						'                (0, 0, 255),\n',
						'                1,\n',
						'                cv2.LINE_AA,\n',
						'            )\n',
						'\n',
						'            if use_popup:\n',
						'                cv2.imshow(title, frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27, use ESC to exit\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # encode numpy array to jpg\n',
						'                imgbox.value = cv2.imencode(\n',
						'                    ".jpg",\n',
						'                    frame,\n',
						'                    params=[cv2.IMWRITE_JPEG_QUALITY, 90],\n',
						'                )[1].tobytes()\n',
						'\n',
						'            engine3D.renderer.render(engine3D.scene, engine3D.cam)\n',
						'\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        clear_output()\n',
						'        if player is not None:\n',
						'            # stop capturing\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()\n',
						'        if skeleton_set:\n',
						'            engine3D.scene_remove(skeleton_set)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Run\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run, using a webcam as the video input. By default, the primary webcam is set with `source=0`. If you have multiple webcams, each one will be assigned a consecutive number starting at 0. Set `flip=True` when using a front-facing camera. Some web browsers, especially Mozilla Firefox, may cause flickering. If you experience flickering, set `use_popup=True`.\n',
						'\n',
						'> **NOTE**:\n',
						'>\n',
						'> *1. To use this notebook with a webcam, you need to run the notebook on a computer with a webcam. If you run the notebook on a server (e.g. Binder), the webcam will not work.*\n',
						'>\n',
						'> *2. Popup mode may not work if you run this notebook on a remote computer (e.g. Binder).*\n',
						'\n',
						'If you do not have a webcam, you can still run this demo with a video file. Any [format supported by OpenCV](https://docs.opencv.org/4.5.1/dd/d43/tutorial_py_video_display.html) will work.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Using the following method, you can click and move your mouse over the picture on the left to interact.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'USE_WEBCAM = False\n',
						'\n',
						'cam_id = 0\n',
						'video_path = "https://storage.openvinotoolkit.org/data/test_data/videos/face-demographics-walking.mp4"\n',
						'\n',
						'source = cam_id if USE_WEBCAM else video_path\n',
						'\n',
						'run_pose_estimation(source=source, flip=isinstance(source, int), use_popup=False)'
					]
				}
			].map(fromJupyterCell)
			, [
				{
					'cell_type': 'markdown',
					'source': [
						'# Live 3D Human Pose Estimation with OpenVINO\n',
						'\n',
						'This notebook demonstrates live 3D Human Pose Estimation with OpenVINO via a webcam. We utilize the model [human-pose-estimation-3d-0001](https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001) from [Open Model Zoo](https://github.com/openvinotoolkit/open_model_zoo/). At the end of this notebook, you will see live inference results from your webcam (if available). Alternatively, you can also upload a video file to test out the algorithms.\n',
						'**Make sure you have properly installed the [Jupyter extension](https://github.com/jupyter-widgets/pythreejs#jupyterlab) and been using JupyterLab to run the demo as suggested in the `README.md`**\n',
						'\n',
						'> **NOTE**: _To use a webcam, you must run this Jupyter notebook on a computer with a webcam. If you run on a remote server, the webcam will not work. However, you can still do inference on a video file in the final step. This demo utilizes the Python interface in `Three.js` integrated with WebGL to process data from the model inference. These results are processed and displayed in the notebook._\n',
						'\n',
						'_To ensure that the results are displayed correctly, run the code in a recommended browser on one of the following operating systems:_\n',
						'_Ubuntu, Windows: Chrome_\n',
						'_macOS: Safari_\n',
						'\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Prerequisites](#Prerequisites)\n',
						'- [Imports](#Imports)\n',
						'- [The model](#The-model)\n',
						'    - [Download the model](#Download-the-model)\n',
						'    - [Convert Model to OpenVINO IR format](#Convert-Model-to-OpenVINO-IR-format)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Load the model](#Load-the-model)\n',
						'- [Processing](#Processing)\n',
						'    - [Model Inference](#Model-Inference)\n',
						'    - [Draw 2D Pose Overlays](#Draw-2D-Pose-Overlays)\n',
						'    - [Main Processing Function](#Main-Processing-Function)\n',
						'- [Run](#Run)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'Make sure your [Jupyter extension](https://github.com/jupyter-widgets/pythreejs#jupyterlab) is working properly.\n',
						'To avoid errors that may arise from the version of the dependency package, it is recommended to use the **JupyterLab** instead of the Jupyter notebook to display image results.\n',
						'```\n',
						'- pip install --upgrade pip && pip install -r requirements.txt\n',
						'- jupyter labextension install --no-build @jupyter-widgets/jupyterlab-manager\n',
						'- jupyter labextension install --no-build jupyter-datawidgets/extension\n',
						'- jupyter labextension install jupyter-threejs\n',
						'- jupyter labextension list\n',
						'```\n',
						'\n',
						'You should see:\n',
						'```\n',
						'JupyterLab v...\n',
						'  ...\n',
						'    jupyterlab-datawidgets v... enabled OK\n',
						'    @jupyter-widgets/jupyterlab-manager v... enabled OK\n',
						'    jupyter-threejs v... enabled OK\n',
						'```\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/3D-pose-estimation-webcam/3D-pose-estimation.ipynb" />\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'**The `pythreejs` extension may not display properly when using a Jupyter Notebook release. Therefore, it is recommended to use Jupyter Lab instead.**'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install pythreejs "openvino>=2024.4.0" "opencv-python" "torch" --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Imports\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import collections\n',
						'import time\n',
						'from pathlib import Path\n',
						'\n',
						'import cv2\n',
						'import ipywidgets as widgets\n',
						'import numpy as np\n',
						'from IPython.display import clear_output, display\n',
						'import openvino as ov\n',
						'\n',
						'# Fetch `notebook_utils` module\n',
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'with open("notebook_utils.py", "w") as f:\n',
						'    f.write(r.text)\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/engine3js.py",\n',
						')\n',
						'with open("engine3js.py", "w") as f:\n',
						'    f.write(r.text)\n',
						'\n',
						'import notebook_utils as utils\n',
						'import engine3js as engine'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## The model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Download the model\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'from notebook_utils import download_file\n',
						'import tarfile\n',
						'\n',
						'\n',
						'# directory where model will be downloaded\n',
						'base_model_dir = Path("model")\n',
						'\n',
						'download_file("https://storage.openvinotoolkit.org/repositories/open_model_zoo/public/2022.1/human-pose-estimation-3d-0001/human-pose-estimation-3d.tar.gz", directory=base_model_dir)\n',
						'\n',
						'ckpt_file =  base_model_dir / "human-pose-estimation-3d-0001.pth"\n',
						'\n',
						'if not ckpt_file.exists():\n',
						'    with tarfile.open(base_model_dir / "human-pose-estimation-3d.tar.gz") as f:\n',
						'        f.extractall(base_model_dir)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Convert Model to OpenVINO IR format\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import torch\n',
						'import openvino as ov\n',
						'\n',
						'ov_model_path = Path(base_model_dir) / "human-pose-estimation-3d-0001.xml"\n',
						'\n',
						'if not ov_model_path.exists():\n',
						'    from model.model import PoseEstimationWithMobileNet\n',
						'\n',
						'    pose_estimation_model = PoseEstimationWithMobileNet(is_convertible_by_mo=True)\n',
						'    pose_estimation_model.loas_state_dict(torch.load(ckpt_file, map_location="cpu"))\n',
						'    pose_estimation_model.eval()\n',
						'\n',
						'    with torch.no_grad():\n',
						'        ov_model = ov.convert_model(pose_estimation_model, example_input=torch.zeros([1, 3, 256, 448]), input=[1, 3, 256, 448])\n',
						'        ov.save_model(ov_model, ov_model_path)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'device = utils.device_widget()\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Converted models are located in a fixed structure, which indicates vendor, model name and precision.\n',
						'\n',
						'First, initialize the inference engine, OpenVINO Runtime. Then, read the network architecture and model weights from the `.bin` and `.xml` files to compile for the desired device. An inference request is then created to infer the compiled model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# initialize inference engine\n',
						'core = ov.Core()\n',
						'# read the network and corresponding weights from file\n',
						'model = core.read_model(ov_model_path)\n',
						'# load the model on the specified device\n',
						'compiled_model = core.compile_model(model=model, device_name=device.value)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Processing\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Model Inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Frames captured from video files or the live webcam are used as the input for the 3D model. This is how you obtain the output heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def model_infer(scaled_img, stride):\n',
						'    """\n',
						'    Run model inference on the input image\n',
						'\n',
						'    Parameters:\n',
						'        scaled_img: resized image according to the input size of the model\n',
						'        stride: int, the stride of the window\n',
						'    """\n',
						'\n',
						'    # Remove excess space from the picture\n',
						'    img = scaled_img[\n',
						'        0 : scaled_img.shape[0] - (scaled_img.shape[0] % stride),\n',
						'        0 : scaled_img.shape[1] - (scaled_img.shape[1] % stride),\n',
						'    ]\n',
						'\n',
						'    mean_value = 128.0\n',
						'    scale_value = 255.0\n',
						'\n',
						'    img = (img - mean_value) / scale_value\n',
						'\n',
						'    img = np.transpose(img, (2, 0, 1))[None,]\n',
						'    result = compiled_model(img)\n',
						'    # Get the results\n',
						'    results = (result[0][0], results[1][0], results[2][0])\n',
						'\n',
						'    return results'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Draw 2D Pose Overlays\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We need to define some connections between the joints in advance, so that we can draw the structure of the human body in the resulting image after obtaining the inference results.\n',
						'Joints are drawn as circles and limbs are drawn as lines. The code is based on the [3D Human Pose Estimation Demo](https://github.com/openvinotoolkit/open_model_zoo/tree/master/demos/human_pose_estimation_3d_demo/python) from Open Model Zoo.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# 3D edge index array\n',
						'body_edges = np.array(\n',
						'    [\n',
						'        [0, 1],\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [1, 15],\n',
						'        [15, 16],  # nose - l_eye - l_ear\n',
						'        [1, 17],\n',
						'        [17, 18],  # nose - r_eye - r_ear\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'body_edges_2d = np.array(\n',
						'    [\n',
						'        [0, 1],  # neck - nose\n',
						'        [1, 16],\n',
						'        [16, 18],  # nose - l_eye - l_ear\n',
						'        [1, 15],\n',
						'        [15, 17],  # nose - r_eye - r_ear\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'def draw_poses(frame, poses_2d, scaled_img, use_popup):\n',
						'    """\n',
						'    Draw 2D pose overlays on the image to visualize estimated poses.\n',
						'    Joints are drawn as circles and limbs are drawn as lines.\n',
						'\n',
						'    :param frame: the input image\n',
						'    :param poses_2d: array of human joint pairs\n',
						'    """\n',
						'    for pose in poses_2d:\n',
						'        pose = np.array(pose[0:-1]).reshape((-1, 3)).transpose()\n',
						'        was_found = pose[2] > 0\n',
						'\n',
						'        pose[0], pose[1] = (\n',
						'            pose[0] * frame.shape[1] / scaled_img.shape[1],\n',
						'            pose[1] * frame.shape[0] / scaled_img.shape[0],\n',
						'        )\n',
						'\n',
						'        # Draw joints.\n',
						'        for edge in body_edges_2d:\n',
						'            if was_found[edge[0]] and was_found[edge[1]]:\n',
						'                cv2.line(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, edge[0]].astype(np.int32)),\n',
						'                    tuple(pose[0:2, edge[1]].astype(np.int32)),\n',
						'                    (255, 255, 0),\n',
						'                    4,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'        # Draw limbs.\n',
						'        for kpt_id in range(pose.shape[1]):\n',
						'            if pose[2, kpt_id] != -1:\n',
						'                cv2.circle(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, kpt_id].astype(np.int32)),\n',
						'                    3,\n',
						'                    (0, 255, 255),\n',
						'                    -1,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'\n',
						'    return frame'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Main Processing Function\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run 3D pose estimation on the specified source. It could be either a webcam feed or a video file.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'tags': []
					},
					'source': [
						'def run_pose_estimation(source=0, flip=False, use_popup=False, skip_frames=0):\n',
						'    """\n',
						'    2D image as input, using OpenVINO as inference backend,\n',
						'    get joints 3D coordinates, and draw 3D human skeleton in the scene\n',
						'\n',
						'    :param source:      The webcam number to feed the video stream with primary webcam set to "0", or the video path.\n',
						'    :param flip:        To be used by VideoPlayer function for flipping capture image.\n',
						'    :param use_popup:   False for showing encoded frames over this notebook, True for creating a popup window.\n',
						'    :param skip_frames: Number of frames to skip at the beginning of the video.\n',
						'    """\n',
						'\n',
						'    focal_length = -1  # default\n',
						'    stride = 8\n',
						'    player = None\n',
						'    skeleton_set = None\n',
						'\n',
						'    try:\n',
						'        # create video player to play with target fps  video_path\n',
						'        # get the frame from camera\n',
						`        # You can skip first N frames to fast forward video. change 'skip_first_frames'\n`,
						'        player = utils.VideoPlayer(source, flip=flip, fps=30, skip_first_frames=skip_frames)\n',
						'        # start capturing\n',
						'        player.start()\n',
						'\n',
						'        input_image = player.next()\n',
						'        # set the window size\n',
						'        resize_scale = 450 / input_image.shape[1]\n',
						'        windows_width = int(input_image.shape[1] * resize_scale)\n',
						'        windows_height = int(input_image.shape[0] * resize_scale)\n',
						'\n',
						'        # use visualization library\n',
						'        engine3D = engine.Engine3js(grid=True, axis=True, view_width=windows_width, view_height=windows_height)\n',
						'\n',
						'        if use_popup:\n',
						'            # display the 3D human pose in this notebook, and origin frame in popup window\n',
						'            display(engine3D.renderer)\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(title, cv2.WINDOW_KEEPRATIO | cv2.WINDOW_AUTOSIZE)\n',
						'        else:\n',
						'            # set the 2D image box, show both human pose and image in the notebook\n',
						'            imgbox = widgets.Image(format="jpg", height=windows_height, width=windows_width)\n',
						'            display(widgets.HBox([engine3D.renderer, imgbox]))\n',
						'\n',
						'        skeleton = engine.Skeleton(body_edges=body_edges)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'\n',
						'        while True:\n',
						'            # grab the frame\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'\n',
						'            # resize image and change dims to fit neural network input\n',
						'            # (see https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001)\n',
						'            scaled_img = cv2.resize(frame, dsize=(model.inputs[0].shape[3], model.inputs[0].shape[2]))\n',
						'\n',
						'            if focal_length < 0:  # Focal length is unknown\n',
						'                focal_length = np.float32(0.8 * scaled_img.shape[1])\n',
						'\n',
						'            # inference start\n',
						'            start_time = time.time()\n',
						'            # get results\n',
						'            inference_result = model_infer(scaled_img, stride)\n',
						'\n',
						'            # inference stop\n',
						'            stop_time = time.time()\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Process the point to point coordinates of the data\n',
						'            poses_3d, poses_2d = engine.parse_poses(inference_result, 1, stride, focal_length, True)\n',
						'\n',
						'            # use processing times from last 200 frames\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'\n',
						'            if len(poses_3d) > 0:\n',
						'                # From here, you can rotate the 3D point positions using the function "draw_poses",\n',
						'                # or you can directly make the correct mapping below to properly display the object image on the screen\n',
						'                poses_3d_copy = poses_3d.copy()\n',
						'                x = poses_3d_copy[:, 0::4]\n',
						'                y = poses_3d_copy[:, 1::4]\n',
						'                z = poses_3d_copy[:, 2::4]\n',
						'                poses_3d[:, 0::4], poses_3d[:, 1::4], poses_3d[:, 2::4] = (\n',
						'                    -z + np.ones(poses_3d[:, 2::4].shape) * 200,\n',
						'                    -y + np.ones(poses_3d[:, 2::4].shape) * 100,\n',
						'                    -x,\n',
						'                )\n',
						'\n',
						'                poses_3d = poses_3d.reshape(poses_3d.shape[0], 19, -1)[:, :, 0:3]\n',
						'                people = skeleton(poses_3d=poses_3d)\n',
						'\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'                engine3D.scene_add(people)\n',
						'                skeleton_set = people\n',
						'\n',
						'                # draw 2D\n',
						'                frame = draw_poses(frame, poses_2d, scaled_img, use_popup)\n',
						'\n',
						'            else:\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                    skeleton_set = None\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'            cv2.putText(\n',
						'                frame,\n',
						'                f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                (10, 30),\n',
						'                cv2.FONT_HERSHEY_COMPLEX,\n',
						'                0.7,\n',
						'                (0, 0, 255),\n',
						'                1,\n',
						'                cv2.LINE_AA,\n',
						'            )\n',
						'\n',
						'            if use_popup:\n',
						'                cv2.imshow(title, frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27, use ESC to exit\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # encode numpy array to jpg\n',
						'                imgbox.value = cv2.imencode(\n',
						'                    ".jpg",\n',
						'                    frame,\n',
						'                    params=[cv2.IMWRITE_JPEG_QUALITY, 90],\n',
						'                )[1].tobytes()\n',
						'\n',
						'            engine3D.renderer.render(engine3D.scene, engine3D.cam)\n',
						'\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        clear_output()\n',
						'        if player is not None:\n',
						'            # stop capturing\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()\n',
						'        if skeleton_set:\n',
						'            engine3D.scene_remove(skeleton_set)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Run\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run, using a webcam as the video input. By default, the primary webcam is set with `source=0`. If you have multiple webcams, each one will be assigned a consecutive number starting at 0. Set `flip=True` when using a front-facing camera. Some web browsers, especially Mozilla Firefox, may cause flickering. If you experience flickering, set `use_popup=True`.\n',
						'\n',
						'> **NOTE**:\n',
						'>\n',
						'> *1. To use this notebook with a webcam, you need to run the notebook on a computer with a webcam. If you run the notebook on a server (e.g. Binder), the webcam will not work.*\n',
						'>\n',
						'> *2. Popup mode may not work if you run this notebook on a remote computer (e.g. Binder).*\n',
						'\n',
						'If you do not have a webcam, you can still run this demo with a video file. Any [format supported by OpenCV](https://docs.opencv.org/4.5.1/dd/d43/tutorial_py_video_display.html) will work.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Using the following method, you can click and move your mouse over the picture on the left to interact.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'USE_WEBCAM = False\n',
						'\n',
						'cam_id = 0\n',
						'video_path = "https://storage.openvinotoolkit.org/data/test_data/videos/face-demographics-walking.mp4"\n',
						'\n',
						'source = cam_id if USE_WEBCAM else video_path\n',
						'\n',
						'run_pose_estimation(source=source, flip=isinstance(source, int), use_popup=False)'
					]
				}
			].map(fromJupyterCell)
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 },
			{ modified: 7, original: 7 },
			{ modified: 8, original: 8 },
			{ modified: 9, original: 9 },
			{ modified: 10, original: 10 },
			{ modified: 11, original: 11 },
			{ modified: 12, original: 12 },
			{ modified: 13, original: 15 },
			{ modified: 14, original: 16 },
			{ modified: 15, original: 17 },
			{ modified: 16, original: 18 },
			{ modified: 17, original: 19 },
			{ modified: 18, original: 20 },
			{ modified: 19, original: 21 },
			{ modified: 20, original: 22 },
			{ modified: 21, original: 23 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 2, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 5, originalLength: 1, modifiedStart: 5, modifiedLength: 1 } satisfies IDiffChange,
			{
				modifiedLength: 1,
				modifiedStart: 6,
				originalLength: 1,
				originalStart: 6
			},
			{
				modifiedLength: 1,
				modifiedStart: 7,
				originalLength: 1,
				originalStart: 7
			},
			{
				modifiedLength: 1,
				modifiedStart: 8,
				originalLength: 1,
				originalStart: 8
			},
			{
				modifiedLength: 1,
				modifiedStart: 12,
				originalLength: 1,
				originalStart: 12
			},
			{
				modifiedLength: 0,
				modifiedStart: 13,
				originalLength: 2,
				originalStart: 13
			},
			{
				modifiedLength: 1,
				modifiedStart: 14,
				originalLength: 1,
				originalStart: 16
			}
		]);
	});
	test('Detect modification in 2 cells', async () => {
		const { mapping, diff } = await mapCells(
			[
				{
					'cell_type': 'markdown',
					'source': [
						'# Live 3D Human Pose Estimation with OpenVINO\n',
						'\n',
						'This notebook demonstrates live 3D Human Pose Estimation with OpenVINO via a webcam. We utilize the model [human-pose-estimation-3d-0001](https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001) from [Open Model Zoo](https://github.com/openvinotoolkit/open_model_zoo/). At the end of this notebook, you will see live inference results from your webcam (if available). Alternatively, you can also upload a video file to test out the algorithms.\n',
						'**Make sure you have properly installed the [Jupyter extension](https://github.com/jupyter-widgets/pythreejs#jupyterlab) and been using JupyterLab to run the demo as suggested in the `README.md`**\n',
						'\n',
						'> **NOTE**: _To use a webcam, you must run this Jupyter notebook on a computer with a webcam. If you run on a remote server, the webcam will not work. However, you can still do inference on a video file in the final step. This demo utilizes the Python interface in `Three.js` integrated with WebGL to process data from the model inference. These results are processed and displayed in the notebook._\n',
						'\n',
						'_To ensure that the results are displayed correctly, run the code in a recommended browser on one of the following operating systems:_\n',
						'_Ubuntu, Windows: Chrome_\n',
						'_macOS: Safari_\n',
						'\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Prerequisites](#Prerequisites)\n',
						'- [Imports](#Imports)\n',
						'- [The model](#The-model)\n',
						'    - [Download the model](#Download-the-model)\n',
						'    - [Convert Model to OpenVINO IR format](#Convert-Model-to-OpenVINO-IR-format)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Load the model](#Load-the-model)\n',
						'- [Processing](#Processing)\n',
						'    - [Model Inference](#Model-Inference)\n',
						'    - [Draw 2D Pose Overlays](#Draw-2D-Pose-Overlays)\n',
						'    - [Main Processing Function](#Main-Processing-Function)\n',
						'- [Run](#Run)\n',
						'\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'**The `pythreejs` extension may not display properly when using the latest Jupyter Notebook release (2.4.1). Therefore, it is recommended to use Jupyter Lab instead.**'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install pythreejs "openvino-dev>=2024.0.0" "opencv-python" "torch" "onnx" --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Imports\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import collections\n',
						'import sys\n',
						'import time\n',
						'from pathlib import Path\n',
						'\n',
						'import cv2\n',
						'import ipywidgets as widgets\n',
						'import numpy as np\n',
						'from IPython.display import clear_output, display\n',
						'import openvino as ov\n',
						'\n',
						'# Fetch `notebook_utils` module\n',
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'open("notebook_utils.py", "w").write(r.text)\n',
						'import notebook_utils as utils\n',
						'\n',
						'sys.path.append("./engine")\n',
						'import engine.engine3js as engine\n',
						'from engine.parse_poses import parse_poses'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## The model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Download the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We use `omz_downloader`, which is a command line tool from the `openvino-dev` package. `omz_downloader` automatically creates a directory structure and downloads the selected model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# directory where model will be downloaded\n',
						'base_model_dir = "model"\n',
						'\n',
						'# model name as named in Open Model Zoo\n',
						'model_name = "human-pose-estimation-3d-0001"\n',
						'# selected precision (FP32, FP16)\n',
						'precision = "FP32"\n',
						'\n',
						'BASE_MODEL_NAME = f"{base_model_dir}/public/{model_name}/{model_name}"\n',
						'model_path = Path(BASE_MODEL_NAME).with_suffix(".pth")\n',
						'onnx_path = Path(BASE_MODEL_NAME).with_suffix(".onnx")\n',
						'\n',
						'ir_model_path = f"model/public/{model_name}/{precision}/{model_name}.xml"\n',
						'model_weights_path = f"model/public/{model_name}/{precision}/{model_name}.bin"\n',
						'\n',
						'if not model_path.exists():\n',
						'    download_command = f"omz_downloader " f"--name {model_name} " f"--output_dir {base_model_dir}"\n',
						'    ! $download_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Convert Model to OpenVINO IR format\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'The selected model comes from the public directory, which means it must be converted into OpenVINO Intermediate Representation (OpenVINO IR). We use `omz_converter` to convert the ONNX format model to the OpenVINO IR format.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'if not onnx_path.exists():\n',
						'    convert_command = (\n',
						'        f"omz_converter " f"--name {model_name} " f"--precisions {precision} " f"--download_dir {base_model_dir} " f"--output_dir {base_model_dir}"\n',
						'    )\n',
						'    ! $convert_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'core = ov.Core()\n',
						'\n',
						'device = widgets.Dropdown(\n',
						'    options=core.available_devices + ["AUTO"],\n',
						'    value="AUTO",\n',
						'    description="Device:",\n',
						'    disabled=False,\n',
						')\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Converted models are located in a fixed structure, which indicates vendor, model name and precision.\n',
						'\n',
						'First, initialize the inference engine, OpenVINO Runtime. Then, read the network architecture and model weights from the `.bin` and `.xml` files to compile for the desired device. An inference request is then created to infer the compiled model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# initialize inference engine\n',
						'core = ov.Core()\n',
						'# read the network and corresponding weights from file\n',
						'model = core.read_model(model=ir_model_path, weights=model_weights_path)\n',
						'# load the model on the specified device\n',
						'compiled_model = core.compile_model(model=model, device_name=device.value)\n',
						'infer_request = compiled_model.create_infer_request()\n',
						'input_tensor_name = model.inputs[0].get_any_name()\n',
						'\n',
						'# get input and output names of nodes\n',
						'input_layer = compiled_model.input(0)\n',
						'output_layers = list(compiled_model.outputs)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The input for the model is data from the input image and the outputs are heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'input_layer.any_name, [o.any_name for o in output_layers]'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Processing\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Model Inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Frames captured from video files or the live webcam are used as the input for the 3D model. This is how you obtain the output heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def model_infer(scaled_img, stride):\n',
						'    """\n',
						'    Run model inference on the input image\n',
						'\n',
						'    Parameters:\n',
						'        scaled_img: resized image according to the input size of the model\n',
						'        stride: int, the stride of the window\n',
						'    """\n',
						'\n',
						'    # Remove excess space from the picture\n',
						'    img = scaled_img[\n',
						'        0 : scaled_img.shape[0] - (scaled_img.shape[0] % stride),\n',
						'        0 : scaled_img.shape[1] - (scaled_img.shape[1] % stride),\n',
						'    ]\n',
						'\n',
						'    img = np.transpose(img, (2, 0, 1))[None,]\n',
						'    infer_request.infer({input_tensor_name: img})\n',
						'    # A set of three inference results is obtained\n',
						'    results = {name: infer_request.get_tensor(name).data[:] for name in {"features", "heatmaps", "pafs"}}\n',
						'    # Get the results\n',
						'    results = (results["features"][0], results["heatmaps"][0], results["pafs"][0])\n',
						'\n',
						'    return results'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Draw 2D Pose Overlays\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We need to define some connections between the joints in advance, so that we can draw the structure of the human body in the resulting image after obtaining the inference results.\n',
						'Joints are drawn as circles and limbs are drawn as lines. The code is based on the [3D Human Pose Estimation Demo](https://github.com/openvinotoolkit/open_model_zoo/tree/master/demos/human_pose_estimation_3d_demo/python) from Open Model Zoo.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# 3D edge index array\n',
						'body_edges = np.array(\n',
						'    [\n',
						'        [0, 1],\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [1, 15],\n',
						'        [15, 16],  # nose - l_eye - l_ear\n',
						'        [1, 17],\n',
						'        [17, 18],  # nose - r_eye - r_ear\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'body_edges_2d = np.array(\n',
						'    [\n',
						'        [0, 1],  # neck - nose\n',
						'        [1, 16],\n',
						'        [16, 18],  # nose - l_eye - l_ear\n',
						'        [1, 15],\n',
						'        [15, 17],  # nose - r_eye - r_ear\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'def draw_poses(frame, poses_2d, scaled_img, use_popup):\n',
						'    """\n',
						'    Draw 2D pose overlays on the image to visualize estimated poses.\n',
						'    Joints are drawn as circles and limbs are drawn as lines.\n',
						'\n',
						'    :param frame: the input image\n',
						'    :param poses_2d: array of human joint pairs\n',
						'    """\n',
						'    for pose in poses_2d:\n',
						'        pose = np.array(pose[0:-1]).reshape((-1, 3)).transpose()\n',
						'        was_found = pose[2] > 0\n',
						'\n',
						'        pose[0], pose[1] = (\n',
						'            pose[0] * frame.shape[1] / scaled_img.shape[1],\n',
						'            pose[1] * frame.shape[0] / scaled_img.shape[0],\n',
						'        )\n',
						'\n',
						'        # Draw joints.\n',
						'        for edge in body_edges_2d:\n',
						'            if was_found[edge[0]] and was_found[edge[1]]:\n',
						'                cv2.line(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, edge[0]].astype(np.int32)),\n',
						'                    tuple(pose[0:2, edge[1]].astype(np.int32)),\n',
						'                    (255, 255, 0),\n',
						'                    4,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'        # Draw limbs.\n',
						'        for kpt_id in range(pose.shape[1]):\n',
						'            if pose[2, kpt_id] != -1:\n',
						'                cv2.circle(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, kpt_id].astype(np.int32)),\n',
						'                    3,\n',
						'                    (0, 255, 255),\n',
						'                    -1,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'\n',
						'    return frame'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Main Processing Function\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run 3D pose estimation on the specified source. It could be either a webcam feed or a video file.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'tags': []
					},
					'source': [
						'def run_pose_estimation(source=0, flip=False, use_popup=False, skip_frames=0):\n',
						'    """\n',
						'    2D image as input, using OpenVINO as inference backend,\n',
						'    get joints 3D coordinates, and draw 3D human skeleton in the scene\n',
						'\n',
						'    :param source:      The webcam number to feed the video stream with primary webcam set to "0", or the video path.\n',
						'    :param flip:        To be used by VideoPlayer function for flipping capture image.\n',
						'    :param use_popup:   False for showing encoded frames over this notebook, True for creating a popup window.\n',
						'    :param skip_frames: Number of frames to skip at the beginning of the video.\n',
						'    """\n',
						'\n',
						'    focal_length = -1  # default\n',
						'    stride = 8\n',
						'    player = None\n',
						'    skeleton_set = None\n',
						'\n',
						'    try:\n',
						'        # create video player to play with target fps  video_path\n',
						'        # get the frame from camera\n',
						`        # You can skip first N frames to fast forward video. change 'skip_first_frames'\n`,
						'        player = utils.VideoPlayer(source, flip=flip, fps=30, skip_first_frames=skip_frames)\n',
						'        # start capturing\n',
						'        player.start()\n',
						'\n',
						'        input_image = player.next()\n',
						'        # set the window size\n',
						'        resize_scale = 450 / input_image.shape[1]\n',
						'        windows_width = int(input_image.shape[1] * resize_scale)\n',
						'        windows_height = int(input_image.shape[0] * resize_scale)\n',
						'\n',
						'        # use visualization library\n',
						'        engine3D = engine.Engine3js(grid=True, axis=True, view_width=windows_width, view_height=windows_height)\n',
						'\n',
						'        if use_popup:\n',
						'            # display the 3D human pose in this notebook, and origin frame in popup window\n',
						'            display(engine3D.renderer)\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(title, cv2.WINDOW_KEEPRATIO | cv2.WINDOW_AUTOSIZE)\n',
						'        else:\n',
						'            # set the 2D image box, show both human pose and image in the notebook\n',
						'            imgbox = widgets.Image(format="jpg", height=windows_height, width=windows_width)\n',
						'            display(widgets.HBox([engine3D.renderer, imgbox]))\n',
						'\n',
						'        skeleton = engine.Skeleton(body_edges=body_edges)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'\n',
						'        while True:\n',
						'            # grab the frame\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'\n',
						'            # resize image and change dims to fit neural network input\n',
						'            # (see https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001)\n',
						'            scaled_img = cv2.resize(frame, dsize=(model.inputs[0].shape[3], model.inputs[0].shape[2]))\n',
						'\n',
						'            if focal_length < 0:  # Focal length is unknown\n',
						'                focal_length = np.float32(0.8 * scaled_img.shape[1])\n',
						'\n',
						'            # inference start\n',
						'            start_time = time.time()\n',
						'            # get results\n',
						'            inference_result = model_infer(scaled_img, stride)\n',
						'\n',
						'            # inference stop\n',
						'            stop_time = time.time()\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Process the point to point coordinates of the data\n',
						'            poses_3d, poses_2d = parse_poses(inference_result, 1, stride, focal_length, True)\n',
						'\n',
						'            # use processing times from last 200 frames\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'\n',
						'            if len(poses_3d) > 0:\n',
						'                # From here, you can rotate the 3D point positions using the function "draw_poses",\n',
						'                # or you can directly make the correct mapping below to properly display the object image on the screen\n',
						'                poses_3d_copy = poses_3d.copy()\n',
						'                x = poses_3d_copy[:, 0::4]\n',
						'                y = poses_3d_copy[:, 1::4]\n',
						'                z = poses_3d_copy[:, 2::4]\n',
						'                poses_3d[:, 0::4], poses_3d[:, 1::4], poses_3d[:, 2::4] = (\n',
						'                    -z + np.ones(poses_3d[:, 2::4].shape) * 200,\n',
						'                    -y + np.ones(poses_3d[:, 2::4].shape) * 100,\n',
						'                    -x,\n',
						'                )\n',
						'\n',
						'                poses_3d = poses_3d.reshape(poses_3d.shape[0], 19, -1)[:, :, 0:3]\n',
						'                people = skeleton(poses_3d=poses_3d)\n',
						'\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'                engine3D.scene_add(people)\n',
						'                skeleton_set = people\n',
						'\n',
						'                # draw 2D\n',
						'                frame = draw_poses(frame, poses_2d, scaled_img, use_popup)\n',
						'\n',
						'            else:\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                    skeleton_set = None\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'            cv2.putText(\n',
						'                frame,\n',
						'                f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                (10, 30),\n',
						'                cv2.FONT_HERSHEY_COMPLEX,\n',
						'                0.7,\n',
						'                (0, 0, 255),\n',
						'                1,\n',
						'                cv2.LINE_AA,\n',
						'            )\n',
						'\n',
						'            if use_popup:\n',
						'                cv2.imshow(title, frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27, use ESC to exit\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # encode numpy array to jpg\n',
						'                imgbox.value = cv2.imencode(\n',
						'                    ".jpg",\n',
						'                    frame,\n',
						'                    params=[cv2.IMWRITE_JPEG_QUALITY, 90],\n',
						'                )[1].tobytes()\n',
						'\n',
						'            engine3D.renderer.render(engine3D.scene, engine3D.cam)\n',
						'\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        clear_output()\n',
						'        if player is not None:\n',
						'            # stop capturing\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()\n',
						'        if skeleton_set:\n',
						'            engine3D.scene_remove(skeleton_set)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Run\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run, using a webcam as the video input. By default, the primary webcam is set with `source=0`. If you have multiple webcams, each one will be assigned a consecutive number starting at 0. Set `flip=True` when using a front-facing camera. Some web browsers, especially Mozilla Firefox, may cause flickering. If you experience flickering, set `use_popup=True`.\n',
						'\n',
						'> **NOTE**:\n',
						'>\n',
						'> *1. To use this notebook with a webcam, you need to run the notebook on a computer with a webcam. If you run the notebook on a server (e.g. Binder), the webcam will not work.*\n',
						'>\n',
						'> *2. Popup mode may not work if you run this notebook on a remote computer (e.g. Binder).*\n',
						'\n',
						'If you do not have a webcam, you can still run this demo with a video file. Any [format supported by OpenCV](https://docs.opencv.org/4.5.1/dd/d43/tutorial_py_video_display.html) will work.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Using the following method, you can click and move your mouse over the picture on the left to interact.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'tags': []
					},
					'source': [
						'USE_WEBCAM = False\n',
						'\n',
						'cam_id = 0\n',
						'video_path = "https://github.com/intel-iot-devkit/sample-videos/raw/master/face-demographics-walking.mp4"\n',
						'\n',
						'source = cam_id if USE_WEBCAM else video_path\n',
						'\n',
						'run_pose_estimation(source=source, flip=isinstance(source, int), use_popup=False)'
					]
				}
			].map(fromJupyterCell)
			, [
				{
					'cell_type': 'markdown',
					'source': [
						'# Live 3D Human Pose Estimation with OpenVINO\n',
						'\n',
						'This notebook demonstrates live 3D Human Pose Estimation with OpenVINO via a webcam. We utilize the model [human-pose-estimation-3d-0001](https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001) from [Open Model Zoo](https://github.com/openvinotoolkit/open_model_zoo/). At the end of this notebook, you will see live inference results from your webcam (if available). Alternatively, you can also upload a video file to test out the algorithms.\n',
						'**Make sure you have properly installed the [Jupyter extension](https://github.com/jupyter-widgets/pythreejs#jupyterlab) and been using JupyterLab to run the demo as suggested in the `README.md`**\n',
						'\n',
						'> **NOTE**: _To use a webcam, you must run this Jupyter notebook on a computer with a webcam. If you run on a remote server, the webcam will not work. However, you can still do inference on a video file in the final step. This demo utilizes the Python interface in `Three.js` integrated with WebGL to process data from the model inference. These results are processed and displayed in the notebook._\n',
						'\n',
						'_To ensure that the results are displayed correctly, run the code in a recommended browser on one of the following operating systems:_\n',
						'_Ubuntu, Windows: Chrome_\n',
						'_macOS: Safari_\n',
						'\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Prerequisites](#Prerequisites)\n',
						'- [Imports](#Imports)\n',
						'- [The model](#The-model)\n',
						'    - [Download the model](#Download-the-model)\n',
						'    - [Convert Model to OpenVINO IR format](#Convert-Model-to-OpenVINO-IR-format)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Load the model](#Load-the-model)\n',
						'- [Processing](#Processing)\n',
						'    - [Model Inference](#Model-Inference)\n',
						'    - [Draw 2D Pose Overlays](#Draw-2D-Pose-Overlays)\n',
						'    - [Main Processing Function](#Main-Processing-Function)\n',
						'- [Run](#Run)\n',
						'\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'**The `pythreejs` extension may not display properly when using a Jupyter Notebook release. Therefore, it is recommended to use Jupyter Lab instead.**'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install pythreejs "openvino-dev>=2024.0.0" "opencv-python" "torch" "onnx" --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Imports\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import collections\n',
						'import time\n',
						'from pathlib import Path\n',
						'\n',
						'import cv2\n',
						'import ipywidgets as widgets\n',
						'import numpy as np\n',
						'from IPython.display import clear_output, display\n',
						'import openvino as ov\n',
						'\n',
						'# Fetch `notebook_utils` module\n',
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'with open("notebook_utils.py", "w") as f:\n',
						'    f.write(r.text)\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/engine3js.py",\n',
						')\n',
						'with open("engine3js.py", "w") as f:\n',
						'    f.write(r.text)\n',
						'\n',
						'import notebook_utils as utils\n',
						'import engine3js as engine'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## The model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Download the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We use `omz_downloader`, which is a command line tool from the `openvino-dev` package. `omz_downloader` automatically creates a directory structure and downloads the selected model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# directory where model will be downloaded\n',
						'base_model_dir = "model"\n',
						'\n',
						'# model name as named in Open Model Zoo\n',
						'model_name = "human-pose-estimation-3d-0001"\n',
						'# selected precision (FP32, FP16)\n',
						'precision = "FP32"\n',
						'\n',
						'BASE_MODEL_NAME = f"{base_model_dir}/public/{model_name}/{model_name}"\n',
						'model_path = Path(BASE_MODEL_NAME).with_suffix(".pth")\n',
						'onnx_path = Path(BASE_MODEL_NAME).with_suffix(".onnx")\n',
						'\n',
						'ir_model_path = f"model/public/{model_name}/{precision}/{model_name}.xml"\n',
						'model_weights_path = f"model/public/{model_name}/{precision}/{model_name}.bin"\n',
						'\n',
						'if not model_path.exists():\n',
						'    download_command = f"omz_downloader " f"--name {model_name} " f"--output_dir {base_model_dir}"\n',
						'    ! $download_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Convert Model to OpenVINO IR format\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'The selected model comes from the public directory, which means it must be converted into OpenVINO Intermediate Representation (OpenVINO IR). We use `omz_converter` to convert the ONNX format model to the OpenVINO IR format.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'if not onnx_path.exists():\n',
						'    convert_command = (\n',
						'        f"omz_converter " f"--name {model_name} " f"--precisions {precision} " f"--download_dir {base_model_dir} " f"--output_dir {base_model_dir}"\n',
						'    )\n',
						'    ! $convert_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'core = ov.Core()\n',
						'\n',
						'device = widgets.Dropdown(\n',
						'    options=core.available_devices + ["AUTO"],\n',
						'    value="AUTO",\n',
						'    description="Device:",\n',
						'    disabled=False,\n',
						')\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Converted models are located in a fixed structure, which indicates vendor, model name and precision.\n',
						'\n',
						'First, initialize the inference engine, OpenVINO Runtime. Then, read the network architecture and model weights from the `.bin` and `.xml` files to compile for the desired device. An inference request is then created to infer the compiled model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# initialize inference engine\n',
						'core = ov.Core()\n',
						'# read the network and corresponding weights from file\n',
						'model = core.read_model(model=ir_model_path, weights=model_weights_path)\n',
						'# load the model on the specified device\n',
						'compiled_model = core.compile_model(model=model, device_name=device.value)\n',
						'infer_request = compiled_model.create_infer_request()\n',
						'input_tensor_name = model.inputs[0].get_any_name()\n',
						'\n',
						'# get input and output names of nodes\n',
						'input_layer = compiled_model.input(0)\n',
						'output_layers = list(compiled_model.outputs)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The input for the model is data from the input image and the outputs are heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'input_layer.any_name, [o.any_name for o in output_layers]'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Processing\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Model Inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Frames captured from video files or the live webcam are used as the input for the 3D model. This is how you obtain the output heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def model_infer(scaled_img, stride):\n',
						'    """\n',
						'    Run model inference on the input image\n',
						'\n',
						'    Parameters:\n',
						'        scaled_img: resized image according to the input size of the model\n',
						'        stride: int, the stride of the window\n',
						'    """\n',
						'\n',
						'    # Remove excess space from the picture\n',
						'    img = scaled_img[\n',
						'        0 : scaled_img.shape[0] - (scaled_img.shape[0] % stride),\n',
						'        0 : scaled_img.shape[1] - (scaled_img.shape[1] % stride),\n',
						'    ]\n',
						'\n',
						'    img = np.transpose(img, (2, 0, 1))[None,]\n',
						'    infer_request.infer({input_tensor_name: img})\n',
						'    # A set of three inference results is obtained\n',
						'    results = {name: infer_request.get_tensor(name).data[:] for name in {"features", "heatmaps", "pafs"}}\n',
						'    # Get the results\n',
						'    results = (results["features"][0], results["heatmaps"][0], results["pafs"][0])\n',
						'\n',
						'    return results'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Draw 2D Pose Overlays\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We need to define some connections between the joints in advance, so that we can draw the structure of the human body in the resulting image after obtaining the inference results.\n',
						'Joints are drawn as circles and limbs are drawn as lines. The code is based on the [3D Human Pose Estimation Demo](https://github.com/openvinotoolkit/open_model_zoo/tree/master/demos/human_pose_estimation_3d_demo/python) from Open Model Zoo.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# 3D edge index array\n',
						'body_edges = np.array(\n',
						'    [\n',
						'        [0, 1],\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [1, 15],\n',
						'        [15, 16],  # nose - l_eye - l_ear\n',
						'        [1, 17],\n',
						'        [17, 18],  # nose - r_eye - r_ear\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'body_edges_2d = np.array(\n',
						'    [\n',
						'        [0, 1],  # neck - nose\n',
						'        [1, 16],\n',
						'        [16, 18],  # nose - l_eye - l_ear\n',
						'        [1, 15],\n',
						'        [15, 17],  # nose - r_eye - r_ear\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'def draw_poses(frame, poses_2d, scaled_img, use_popup):\n',
						'    """\n',
						'    Draw 2D pose overlays on the image to visualize estimated poses.\n',
						'    Joints are drawn as circles and limbs are drawn as lines.\n',
						'\n',
						'    :param frame: the input image\n',
						'    :param poses_2d: array of human joint pairs\n',
						'    """\n',
						'    for pose in poses_2d:\n',
						'        pose = np.array(pose[0:-1]).reshape((-1, 3)).transpose()\n',
						'        was_found = pose[2] > 0\n',
						'\n',
						'        pose[0], pose[1] = (\n',
						'            pose[0] * frame.shape[1] / scaled_img.shape[1],\n',
						'            pose[1] * frame.shape[0] / scaled_img.shape[0],\n',
						'        )\n',
						'\n',
						'        # Draw joints.\n',
						'        for edge in body_edges_2d:\n',
						'            if was_found[edge[0]] and was_found[edge[1]]:\n',
						'                cv2.line(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, edge[0]].astype(np.int32)),\n',
						'                    tuple(pose[0:2, edge[1]].astype(np.int32)),\n',
						'                    (255, 255, 0),\n',
						'                    4,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'        # Draw limbs.\n',
						'        for kpt_id in range(pose.shape[1]):\n',
						'            if pose[2, kpt_id] != -1:\n',
						'                cv2.circle(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, kpt_id].astype(np.int32)),\n',
						'                    3,\n',
						'                    (0, 255, 255),\n',
						'                    -1,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'\n',
						'    return frame'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Main Processing Function\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run 3D pose estimation on the specified source. It could be either a webcam feed or a video file.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'tags': []
					},
					'source': [
						'def run_pose_estimation(source=0, flip=False, use_popup=False, skip_frames=0):\n',
						'    """\n',
						'    2D image as input, using OpenVINO as inference backend,\n',
						'    get joints 3D coordinates, and draw 3D human skeleton in the scene\n',
						'\n',
						'    :param source:      The webcam number to feed the video stream with primary webcam set to "0", or the video path.\n',
						'    :param flip:        To be used by VideoPlayer function for flipping capture image.\n',
						'    :param use_popup:   False for showing encoded frames over this notebook, True for creating a popup window.\n',
						'    :param skip_frames: Number of frames to skip at the beginning of the video.\n',
						'    """\n',
						'\n',
						'    focal_length = -1  # default\n',
						'    stride = 8\n',
						'    player = None\n',
						'    skeleton_set = None\n',
						'\n',
						'    try:\n',
						'        # create video player to play with target fps  video_path\n',
						'        # get the frame from camera\n',
						`        # You can skip first N frames to fast forward video. change 'skip_first_frames'\n`,
						'        player = utils.VideoPlayer(source, flip=flip, fps=30, skip_first_frames=skip_frames)\n',
						'        # start capturing\n',
						'        player.start()\n',
						'\n',
						'        input_image = player.next()\n',
						'        # set the window size\n',
						'        resize_scale = 450 / input_image.shape[1]\n',
						'        windows_width = int(input_image.shape[1] * resize_scale)\n',
						'        windows_height = int(input_image.shape[0] * resize_scale)\n',
						'\n',
						'        # use visualization library\n',
						'        engine3D = engine.Engine3js(grid=True, axis=True, view_width=windows_width, view_height=windows_height)\n',
						'\n',
						'        if use_popup:\n',
						'            # display the 3D human pose in this notebook, and origin frame in popup window\n',
						'            display(engine3D.renderer)\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(title, cv2.WINDOW_KEEPRATIO | cv2.WINDOW_AUTOSIZE)\n',
						'        else:\n',
						'            # set the 2D image box, show both human pose and image in the notebook\n',
						'            imgbox = widgets.Image(format="jpg", height=windows_height, width=windows_width)\n',
						'            display(widgets.HBox([engine3D.renderer, imgbox]))\n',
						'\n',
						'        skeleton = engine.Skeleton(body_edges=body_edges)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'\n',
						'        while True:\n',
						'            # grab the frame\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'\n',
						'            # resize image and change dims to fit neural network input\n',
						'            # (see https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001)\n',
						'            scaled_img = cv2.resize(frame, dsize=(model.inputs[0].shape[3], model.inputs[0].shape[2]))\n',
						'\n',
						'            if focal_length < 0:  # Focal length is unknown\n',
						'                focal_length = np.float32(0.8 * scaled_img.shape[1])\n',
						'\n',
						'            # inference start\n',
						'            start_time = time.time()\n',
						'            # get results\n',
						'            inference_result = model_infer(scaled_img, stride)\n',
						'\n',
						'            # inference stop\n',
						'            stop_time = time.time()\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Process the point to point coordinates of the data\n',
						'            poses_3d, poses_2d = engine.parse_poses(inference_result, 1, stride, focal_length, True)\n',
						'\n',
						'            # use processing times from last 200 frames\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'\n',
						'            if len(poses_3d) > 0:\n',
						'                # From here, you can rotate the 3D point positions using the function "draw_poses",\n',
						'                # or you can directly make the correct mapping below to properly display the object image on the screen\n',
						'                poses_3d_copy = poses_3d.copy()\n',
						'                x = poses_3d_copy[:, 0::4]\n',
						'                y = poses_3d_copy[:, 1::4]\n',
						'                z = poses_3d_copy[:, 2::4]\n',
						'                poses_3d[:, 0::4], poses_3d[:, 1::4], poses_3d[:, 2::4] = (\n',
						'                    -z + np.ones(poses_3d[:, 2::4].shape) * 200,\n',
						'                    -y + np.ones(poses_3d[:, 2::4].shape) * 100,\n',
						'                    -x,\n',
						'                )\n',
						'\n',
						'                poses_3d = poses_3d.reshape(poses_3d.shape[0], 19, -1)[:, :, 0:3]\n',
						'                people = skeleton(poses_3d=poses_3d)\n',
						'\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'                engine3D.scene_add(people)\n',
						'                skeleton_set = people\n',
						'\n',
						'                # draw 2D\n',
						'                frame = draw_poses(frame, poses_2d, scaled_img, use_popup)\n',
						'\n',
						'            else:\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                    skeleton_set = None\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'            cv2.putText(\n',
						'                frame,\n',
						'                f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                (10, 30),\n',
						'                cv2.FONT_HERSHEY_COMPLEX,\n',
						'                0.7,\n',
						'                (0, 0, 255),\n',
						'                1,\n',
						'                cv2.LINE_AA,\n',
						'            )\n',
						'\n',
						'            if use_popup:\n',
						'                cv2.imshow(title, frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27, use ESC to exit\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # encode numpy array to jpg\n',
						'                imgbox.value = cv2.imencode(\n',
						'                    ".jpg",\n',
						'                    frame,\n',
						'                    params=[cv2.IMWRITE_JPEG_QUALITY, 90],\n',
						'                )[1].tobytes()\n',
						'\n',
						'            engine3D.renderer.render(engine3D.scene, engine3D.cam)\n',
						'\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        clear_output()\n',
						'        if player is not None:\n',
						'            # stop capturing\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()\n',
						'        if skeleton_set:\n',
						'            engine3D.scene_remove(skeleton_set)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Run\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run, using a webcam as the video input. By default, the primary webcam is set with `source=0`. If you have multiple webcams, each one will be assigned a consecutive number starting at 0. Set `flip=True` when using a front-facing camera. Some web browsers, especially Mozilla Firefox, may cause flickering. If you experience flickering, set `use_popup=True`.\n',
						'\n',
						'> **NOTE**:\n',
						'>\n',
						'> *1. To use this notebook with a webcam, you need to run the notebook on a computer with a webcam. If you run the notebook on a server (e.g. Binder), the webcam will not work.*\n',
						'>\n',
						'> *2. Popup mode may not work if you run this notebook on a remote computer (e.g. Binder).*\n',
						'\n',
						'If you do not have a webcam, you can still run this demo with a video file. Any [format supported by OpenCV](https://docs.opencv.org/4.5.1/dd/d43/tutorial_py_video_display.html) will work.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Using the following method, you can click and move your mouse over the picture on the left to interact.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'USE_WEBCAM = False\n',
						'\n',
						'cam_id = 0\n',
						'video_path = "https://github.com/intel-iot-devkit/sample-videos/raw/master/face-demographics-walking.mp4"\n',
						'\n',
						'source = cam_id if USE_WEBCAM else video_path\n',
						'\n',
						'run_pose_estimation(source=source, flip=isinstance(source, int), use_popup=False)'
					]
				}
			].map(fromJupyterCell)
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 },
			{ modified: 7, original: 7 },
			{ modified: 8, original: 8 },
			{ modified: 9, original: 9 },
			{ modified: 10, original: 10 },
			{ modified: 11, original: 11 },
			{ modified: 12, original: 12 },
			{ modified: 13, original: 13 },
			{ modified: 14, original: 14 },
			{ modified: 15, original: 15 },
			{ modified: 16, original: 16 },
			{ modified: 17, original: 17 },
			{ modified: 18, original: 18 },
			{ modified: 19, original: 19 },
			{ modified: 20, original: 20 },
			{ modified: 21, original: 21 },
			{ modified: 22, original: 22 },
			{ modified: 23, original: 23 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 1, originalLength: 1, modifiedStart: 1, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 4, originalLength: 1, modifiedStart: 4, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 20, originalLength: 1, modifiedStart: 20, modifiedLength: 1 } satisfies IDiffChange,
		]);

	});
	test('Detect modification in multiple cells', async () => {
		const { mapping, diff } = await mapCells(
			[
				{
					'cell_type': 'markdown',
					'source': [
						'# Live 3D Human Pose Estimation with OpenVINO\n',
						'\n',
						'This notebook demonstrates live 3D Human Pose Estimation with OpenVINO via a webcam. We utilize the model [human-pose-estimation-3d-0001](https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001) from [Open Model Zoo](https://github.com/openvinotoolkit/open_model_zoo/). At the end of this notebook, you will see live inference results from your webcam (if available). Alternatively, you can also upload a video file to test out the algorithms.\n',
						'**Make sure you have properly installed the [Jupyter extension](https://github.com/jupyter-widgets/pythreejs#jupyterlab) and been using JupyterLab to run the demo as suggested in the `README.md`**\n',
						'\n',
						'> **NOTE**: _To use a webcam, you must run this Jupyter notebook on a computer with a webcam. If you run on a remote server, the webcam will not work. However, you can still do inference on a video file in the final step. This demo utilizes the Python interface in `Three.js` integrated with WebGL to process data from the model inference. These results are processed and displayed in the notebook._\n',
						'\n',
						'_To ensure that the results are displayed correctly, run the code in a recommended browser on one of the following operating systems:_\n',
						'_Ubuntu, Windows: Chrome_\n',
						'_macOS: Safari_\n',
						'\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Prerequisites](#Prerequisites)\n',
						'- [Imports](#Imports)\n',
						'- [The model](#The-model)\n',
						'    - [Download the model](#Download-the-model)\n',
						'    - [Convert Model to OpenVINO IR format](#Convert-Model-to-OpenVINO-IR-format)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Load the model](#Load-the-model)\n',
						'- [Processing](#Processing)\n',
						'    - [Model Inference](#Model-Inference)\n',
						'    - [Draw 2D Pose Overlays](#Draw-2D-Pose-Overlays)\n',
						'    - [Main Processing Function](#Main-Processing-Function)\n',
						'- [Run](#Run)\n',
						'\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'**The `pythreejs` extension may not display properly when using the latest Jupyter Notebook release (2.4.1). Therefore, it is recommended to use Jupyter Lab instead.**'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install pythreejs "openvino-dev>=2024.0.0" "opencv-python" "torch" "onnx" --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Imports\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import collections\n',
						'import sys\n',
						'import time\n',
						'from pathlib import Path\n',
						'\n',
						'import cv2\n',
						'import ipywidgets as widgets\n',
						'import numpy as np\n',
						'from IPython.display import clear_output, display\n',
						'import openvino as ov\n',
						'\n',
						'# Fetch `notebook_utils` module\n',
						'import requests\n',
						'r = requests.get(\n',
						`    url='https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py',\n`,
						')\n',
						`open('notebook_utils.py', 'w').write(r.text)\n`,
						'import notebook_utils as utils\n',
						'\n',
						'sys.path.append("./engine")\n',
						'import engine.engine3js as engine\n',
						'from engine.parse_poses import parse_poses'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## The model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Download the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We use `omz_downloader`, which is a command line tool from the `openvino-dev` package. `omz_downloader` automatically creates a directory structure and downloads the selected model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# directory where model will be downloaded\n',
						'base_model_dir = "model"\n',
						'\n',
						'# model name as named in Open Model Zoo\n',
						'model_name = "human-pose-estimation-3d-0001"\n',
						'# selected precision (FP32, FP16)\n',
						'precision = "FP32"\n',
						'\n',
						'BASE_MODEL_NAME = f"{base_model_dir}/public/{model_name}/{model_name}"\n',
						'model_path = Path(BASE_MODEL_NAME).with_suffix(".pth")\n',
						'onnx_path = Path(BASE_MODEL_NAME).with_suffix(".onnx")\n',
						'\n',
						'ir_model_path = f"model/public/{model_name}/{precision}/{model_name}.xml"\n',
						'model_weights_path = f"model/public/{model_name}/{precision}/{model_name}.bin"\n',
						'\n',
						'if not model_path.exists():\n',
						'    download_command = (\n',
						'        f"omz_downloader " f"--name {model_name} " f"--output_dir {base_model_dir}"\n',
						'    )\n',
						'    ! $download_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Convert Model to OpenVINO IR format\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'The selected model comes from the public directory, which means it must be converted into OpenVINO Intermediate Representation (OpenVINO IR). We use `omz_converter` to convert the ONNX format model to the OpenVINO IR format.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'if not onnx_path.exists():\n',
						'    convert_command = (\n',
						'        f"omz_converter "\n',
						'        f"--name {model_name} "\n',
						'        f"--precisions {precision} "\n',
						'        f"--download_dir {base_model_dir} "\n',
						'        f"--output_dir {base_model_dir}"\n',
						'    )\n',
						'    ! $convert_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'core = ov.Core()\n',
						'\n',
						'device = widgets.Dropdown(\n',
						'    options=core.available_devices + ["AUTO"],\n',
						`    value='AUTO',\n`,
						`    description='Device:',\n`,
						'    disabled=False,\n',
						')\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Converted models are located in a fixed structure, which indicates vendor, model name and precision.\n',
						'\n',
						'First, initialize the inference engine, OpenVINO Runtime. Then, read the network architecture and model weights from the `.bin` and `.xml` files to compile for the desired device. An inference request is then created to infer the compiled model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# initialize inference engine\n',
						'core = ov.Core()\n',
						'# read the network and corresponding weights from file\n',
						'model = core.read_model(model=ir_model_path, weights=model_weights_path)\n',
						'# load the model on the specified device\n',
						'compiled_model = core.compile_model(model=model, device_name=device.value)\n',
						'infer_request = compiled_model.create_infer_request()\n',
						'input_tensor_name = model.inputs[0].get_any_name()\n',
						'\n',
						'# get input and output names of nodes\n',
						'input_layer = compiled_model.input(0)\n',
						'output_layers = list(compiled_model.outputs)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The input for the model is data from the input image and the outputs are heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'input_layer.any_name, [o.any_name for o in output_layers]'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Processing\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Model Inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Frames captured from video files or the live webcam are used as the input for the 3D model. This is how you obtain the output heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def model_infer(scaled_img, stride):\n',
						'    """\n',
						'    Run model inference on the input image\n',
						'\n',
						'    Parameters:\n',
						'        scaled_img: resized image according to the input size of the model\n',
						'        stride: int, the stride of the window\n',
						'    """\n',
						'\n',
						'    # Remove excess space from the picture\n',
						'    img = scaled_img[\n',
						'        0 : scaled_img.shape[0] - (scaled_img.shape[0] % stride),\n',
						'        0 : scaled_img.shape[1] - (scaled_img.shape[1] % stride),\n',
						'    ]\n',
						'\n',
						'    img = np.transpose(img, (2, 0, 1))[\n',
						'        None,\n',
						'    ]\n',
						'    infer_request.infer({input_tensor_name: img})\n',
						'    # A set of three inference results is obtained\n',
						'    results = {\n',
						'        name: infer_request.get_tensor(name).data[:]\n',
						'        for name in {"features", "heatmaps", "pafs"}\n',
						'    }\n',
						'    # Get the results\n',
						'    results = (results["features"][0], results["heatmaps"][0], results["pafs"][0])\n',
						'\n',
						'    return results'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Draw 2D Pose Overlays\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We need to define some connections between the joints in advance, so that we can draw the structure of the human body in the resulting image after obtaining the inference results.\n',
						'Joints are drawn as circles and limbs are drawn as lines. The code is based on the [3D Human Pose Estimation Demo](https://github.com/openvinotoolkit/open_model_zoo/tree/master/demos/human_pose_estimation_3d_demo/python) from Open Model Zoo.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# 3D edge index array\n',
						'body_edges = np.array(\n',
						'    [\n',
						'        [0, 1], \n',
						'        [0, 9], [9, 10], [10, 11],    # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 3], [3, 4], [4, 5],       # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [1, 15], [15, 16],            # nose - l_eye - l_ear\n',
						'        [1, 17], [17, 18],            # nose - r_eye - r_ear\n',
						'        [0, 6], [6, 7], [7, 8],       # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12], [12, 13], [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'body_edges_2d = np.array(\n',
						'    [\n',
						'        [0, 1],                       # neck - nose\n',
						'        [1, 16], [16, 18],            # nose - l_eye - l_ear\n',
						'        [1, 15], [15, 17],            # nose - r_eye - r_ear\n',
						'        [0, 3], [3, 4], [4, 5],       # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [0, 9], [9, 10], [10, 11],    # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 6], [6, 7], [7, 8],       # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12], [12, 13], [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')  \n',
						'\n',
						'\n',
						'def draw_poses(frame, poses_2d, scaled_img, use_popup):\n',
						'    """\n',
						'    Draw 2D pose overlays on the image to visualize estimated poses.\n',
						'    Joints are drawn as circles and limbs are drawn as lines.\n',
						'\n',
						'    :param frame: the input image\n',
						'    :param poses_2d: array of human joint pairs\n',
						'    """\n',
						'    for pose in poses_2d:\n',
						'        pose = np.array(pose[0:-1]).reshape((-1, 3)).transpose()\n',
						'        was_found = pose[2] > 0\n',
						'\n',
						'        pose[0], pose[1] = (\n',
						'            pose[0] * frame.shape[1] / scaled_img.shape[1],\n',
						'            pose[1] * frame.shape[0] / scaled_img.shape[0],\n',
						'        )\n',
						'\n',
						'        # Draw joints.\n',
						'        for edge in body_edges_2d:\n',
						'            if was_found[edge[0]] and was_found[edge[1]]:\n',
						'                cv2.line(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, edge[0]].astype(np.int32)),\n',
						'                    tuple(pose[0:2, edge[1]].astype(np.int32)),\n',
						'                    (255, 255, 0),\n',
						'                    4,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'        # Draw limbs.\n',
						'        for kpt_id in range(pose.shape[1]):\n',
						'            if pose[2, kpt_id] != -1:\n',
						'                cv2.circle(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, kpt_id].astype(np.int32)),\n',
						'                    3,\n',
						'                    (0, 255, 255),\n',
						'                    -1,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'\n',
						'    return frame'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Main Processing Function\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run 3D pose estimation on the specified source. It could be either a webcam feed or a video file.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'tags': []
					},
					'source': [
						'def run_pose_estimation(source=0, flip=False, use_popup=False, skip_frames=0):\n',
						'    """\n',
						'    2D image as input, using OpenVINO as inference backend,\n',
						'    get joints 3D coordinates, and draw 3D human skeleton in the scene\n',
						'\n',
						'    :param source:      The webcam number to feed the video stream with primary webcam set to "0", or the video path.\n',
						'    :param flip:        To be used by VideoPlayer function for flipping capture image.\n',
						'    :param use_popup:   False for showing encoded frames over this notebook, True for creating a popup window.\n',
						'    :param skip_frames: Number of frames to skip at the beginning of the video.\n',
						'    """\n',
						'\n',
						'    focal_length = -1  # default\n',
						'    stride = 8\n',
						'    player = None\n',
						'    skeleton_set = None\n',
						'\n',
						'    try:\n',
						'        # create video player to play with target fps  video_path\n',
						'        # get the frame from camera\n',
						`        # You can skip first N frames to fast forward video. change 'skip_first_frames'\n`,
						'        player = utils.VideoPlayer(source, flip=flip, fps=30, skip_first_frames=skip_frames)\n',
						'        # start capturing\n',
						'        player.start()\n',
						'\n',
						'        input_image = player.next()\n',
						'        # set the window size\n',
						'        resize_scale = 450 / input_image.shape[1]\n',
						'        windows_width = int(input_image.shape[1] * resize_scale)\n',
						'        windows_height = int(input_image.shape[0] * resize_scale)\n',
						'\n',
						'        # use visualization library\n',
						'        engine3D = engine.Engine3js(grid=True, axis=True, view_width=windows_width, view_height=windows_height)\n',
						'\n',
						'        if use_popup:\n',
						'            # display the 3D human pose in this notebook, and origin frame in popup window\n',
						'            display(engine3D.renderer)\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(title, cv2.WINDOW_KEEPRATIO | cv2.WINDOW_AUTOSIZE)\n',
						'        else:\n',
						'            # set the 2D image box, show both human pose and image in the notebook\n',
						'            imgbox = widgets.Image(\n',
						'                format="jpg", height=windows_height, width=windows_width\n',
						'            )\n',
						'            display(widgets.HBox([engine3D.renderer, imgbox]))\n',
						'\n',
						'        skeleton = engine.Skeleton(body_edges=body_edges)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'\n',
						'        while True:\n',
						'            # grab the frame\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'\n',
						'            # resize image and change dims to fit neural network input\n',
						'            # (see https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001)\n',
						'            scaled_img = cv2.resize(frame, dsize=(model.inputs[0].shape[3], model.inputs[0].shape[2]))\n',
						'\n',
						'            if focal_length < 0:  # Focal length is unknown\n',
						'                focal_length = np.float32(0.8 * scaled_img.shape[1])\n',
						'\n',
						'            # inference start\n',
						'            start_time = time.time()\n',
						'            # get results\n',
						'            inference_result = model_infer(scaled_img, stride)\n',
						'\n',
						'            # inference stop\n',
						'            stop_time = time.time()\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Process the point to point coordinates of the data\n',
						'            poses_3d, poses_2d = parse_poses(inference_result, 1, stride, focal_length, True)\n',
						'\n',
						'            # use processing times from last 200 frames\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'\n',
						'            if len(poses_3d) > 0:\n',
						'                # From here, you can rotate the 3D point positions using the function "draw_poses",\n',
						'                # or you can directly make the correct mapping below to properly display the object image on the screen\n',
						'                poses_3d_copy = poses_3d.copy()\n',
						'                x = poses_3d_copy[:, 0::4]\n',
						'                y = poses_3d_copy[:, 1::4]\n',
						'                z = poses_3d_copy[:, 2::4]\n',
						'                poses_3d[:, 0::4], poses_3d[:, 1::4], poses_3d[:, 2::4] = (\n',
						'                    -z + np.ones(poses_3d[:, 2::4].shape) * 200,\n',
						'                    -y + np.ones(poses_3d[:, 2::4].shape) * 100,\n',
						'                    -x,\n',
						'                )\n',
						'\n',
						'                poses_3d = poses_3d.reshape(poses_3d.shape[0], 19, -1)[:, :, 0:3]\n',
						'                people = skeleton(poses_3d=poses_3d)\n',
						'\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'                engine3D.scene_add(people)\n',
						'                skeleton_set = people\n',
						'\n',
						'                # draw 2D\n',
						'                frame = draw_poses(frame, poses_2d, scaled_img, use_popup)\n',
						'\n',
						'            else:\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                    skeleton_set = None\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'            cv2.putText(\n',
						'                frame,\n',
						'                f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                (10, 30),\n',
						'                cv2.FONT_HERSHEY_COMPLEX,\n',
						'                0.7,\n',
						'                (0, 0, 255),\n',
						'                1,\n',
						'                cv2.LINE_AA,\n',
						'            )\n',
						'\n',
						'            if use_popup:\n',
						'                cv2.imshow(title, frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27, use ESC to exit\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # encode numpy array to jpg\n',
						'                imgbox.value = cv2.imencode(\n',
						'                    ".jpg",\n',
						'                    frame,\n',
						'                    params=[cv2.IMWRITE_JPEG_QUALITY, 90],\n',
						'                )[1].tobytes()\n',
						'\n',
						'            engine3D.renderer.render(engine3D.scene, engine3D.cam)\n',
						'\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        clear_output()\n',
						'        if player is not None:\n',
						'            # stop capturing\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()\n',
						'        if skeleton_set:\n',
						'            engine3D.scene_remove(skeleton_set)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Run\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run, using a webcam as the video input. By default, the primary webcam is set with `source=0`. If you have multiple webcams, each one will be assigned a consecutive number starting at 0. Set `flip=True` when using a front-facing camera. Some web browsers, especially Mozilla Firefox, may cause flickering. If you experience flickering, set `use_popup=True`.\n',
						'\n',
						'> **NOTE**:\n',
						'>\n',
						'> *1. To use this notebook with a webcam, you need to run the notebook on a computer with a webcam. If you run the notebook on a server (e.g. Binder), the webcam will not work.*\n',
						'>\n',
						'> *2. Popup mode may not work if you run this notebook on a remote computer (e.g. Binder).*\n',
						'\n',
						'If you do not have a webcam, you can still run this demo with a video file. Any [format supported by OpenCV](https://docs.opencv.org/4.5.1/dd/d43/tutorial_py_video_display.html) will work.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Using the following method, you can click and move your mouse over the picture on the left to interact.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'USE_WEBCAM = False\n',
						'\n',
						'cam_id = 0\n',
						'video_path = "https://github.com/intel-iot-devkit/sample-videos/raw/master/face-demographics-walking.mp4"\n',
						'\n',
						'source = cam_id if USE_WEBCAM else video_path\n',
						'\n',
						'run_pose_estimation(source=source, flip=isinstance(source, int), use_popup=False)'
					]
				}
			].map(fromJupyterCell)
			, [
				{
					'cell_type': 'markdown',
					'source': [
						'# Live 3D Human Pose Estimation with OpenVINO\n',
						'\n',
						'This notebook demonstrates live 3D Human Pose Estimation with OpenVINO via a webcam. We utilize the model [human-pose-estimation-3d-0001](https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001) from [Open Model Zoo](https://github.com/openvinotoolkit/open_model_zoo/). At the end of this notebook, you will see live inference results from your webcam (if available). Alternatively, you can also upload a video file to test out the algorithms.\n',
						'**Make sure you have properly installed the [Jupyter extension](https://github.com/jupyter-widgets/pythreejs#jupyterlab) and been using JupyterLab to run the demo as suggested in the `README.md`**\n',
						'\n',
						'> **NOTE**: _To use a webcam, you must run this Jupyter notebook on a computer with a webcam. If you run on a remote server, the webcam will not work. However, you can still do inference on a video file in the final step. This demo utilizes the Python interface in `Three.js` integrated with WebGL to process data from the model inference. These results are processed and displayed in the notebook._\n',
						'\n',
						'_To ensure that the results are displayed correctly, run the code in a recommended browser on one of the following operating systems:_\n',
						'_Ubuntu, Windows: Chrome_\n',
						'_macOS: Safari_\n',
						'\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Prerequisites](#Prerequisites)\n',
						'- [Imports](#Imports)\n',
						'- [The model](#The-model)\n',
						'    - [Download the model](#Download-the-model)\n',
						'    - [Convert Model to OpenVINO IR format](#Convert-Model-to-OpenVINO-IR-format)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Load the model](#Load-the-model)\n',
						'- [Processing](#Processing)\n',
						'    - [Model Inference](#Model-Inference)\n',
						'    - [Draw 2D Pose Overlays](#Draw-2D-Pose-Overlays)\n',
						'    - [Main Processing Function](#Main-Processing-Function)\n',
						'- [Run](#Run)\n',
						'\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'**The `pythreejs` extension may not display properly when using the latest Jupyter Notebook release (2.4.1). Therefore, it is recommended to use Jupyter Lab instead.**'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install pythreejs "openvino-dev>=2024.0.0" "opencv-python" "torch" "onnx" --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Imports\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import collections\n',
						'import sys\n',
						'import time\n',
						'from pathlib import Path\n',
						'\n',
						'import cv2\n',
						'import ipywidgets as widgets\n',
						'import numpy as np\n',
						'from IPython.display import clear_output, display\n',
						'import openvino as ov\n',
						'\n',
						'# Fetch `notebook_utils` module\n',
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'open("notebook_utils.py", "w").write(r.text)\n',
						'import notebook_utils as utils\n',
						'\n',
						'sys.path.append("./engine")\n',
						'import engine.engine3js as engine\n',
						'from engine.parse_poses import parse_poses'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## The model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Download the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We use `omz_downloader`, which is a command line tool from the `openvino-dev` package. `omz_downloader` automatically creates a directory structure and downloads the selected model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# directory where model will be downloaded\n',
						'base_model_dir = "model"\n',
						'\n',
						'# model name as named in Open Model Zoo\n',
						'model_name = "human-pose-estimation-3d-0001"\n',
						'# selected precision (FP32, FP16)\n',
						'precision = "FP32"\n',
						'\n',
						'BASE_MODEL_NAME = f"{base_model_dir}/public/{model_name}/{model_name}"\n',
						'model_path = Path(BASE_MODEL_NAME).with_suffix(".pth")\n',
						'onnx_path = Path(BASE_MODEL_NAME).with_suffix(".onnx")\n',
						'\n',
						'ir_model_path = f"model/public/{model_name}/{precision}/{model_name}.xml"\n',
						'model_weights_path = f"model/public/{model_name}/{precision}/{model_name}.bin"\n',
						'\n',
						'if not model_path.exists():\n',
						'    download_command = (\n',
						'        f"omz_downloader " f"--name {model_name} " f"--output_dir {base_model_dir}"\n',
						'    )\n',
						'    ! $download_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Convert Model to OpenVINO IR format\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'The selected model comes from the public directory, which means it must be converted into OpenVINO Intermediate Representation (OpenVINO IR). We use `omz_converter` to convert the ONNX format model to the OpenVINO IR format.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'if not onnx_path.exists():\n',
						'    convert_command = (\n',
						'        f"omz_converter "\n',
						'        f"--name {model_name} "\n',
						'        f"--precisions {precision} "\n',
						'        f"--download_dir {base_model_dir} "\n',
						'        f"--output_dir {base_model_dir}"\n',
						'    )\n',
						'    ! $convert_command'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'core = ov.Core()\n',
						'\n',
						'device = widgets.Dropdown(\n',
						'    options=core.available_devices + ["AUTO"],\n',
						'    value="AUTO",\n',
						'    description="Device:",\n',
						'    disabled=False,\n',
						')\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Converted models are located in a fixed structure, which indicates vendor, model name and precision.\n',
						'\n',
						'First, initialize the inference engine, OpenVINO Runtime. Then, read the network architecture and model weights from the `.bin` and `.xml` files to compile for the desired device. An inference request is then created to infer the compiled model.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# initialize inference engine\n',
						'core = ov.Core()\n',
						'# read the network and corresponding weights from file\n',
						'model = core.read_model(model=ir_model_path, weights=model_weights_path)\n',
						'# load the model on the specified device\n',
						'compiled_model = core.compile_model(model=model, device_name=device.value)\n',
						'infer_request = compiled_model.create_infer_request()\n',
						'input_tensor_name = model.inputs[0].get_any_name()\n',
						'\n',
						'# get input and output names of nodes\n',
						'input_layer = compiled_model.input(0)\n',
						'output_layers = list(compiled_model.outputs)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The input for the model is data from the input image and the outputs are heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'input_layer.any_name, [o.any_name for o in output_layers]'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Processing\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'### Model Inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Frames captured from video files or the live webcam are used as the input for the 3D model. This is how you obtain the output heat maps, PAF (part affinity fields) and features.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def model_infer(scaled_img, stride):\n',
						'    """\n',
						'    Run model inference on the input image\n',
						'\n',
						'    Parameters:\n',
						'        scaled_img: resized image according to the input size of the model\n',
						'        stride: int, the stride of the window\n',
						'    """\n',
						'\n',
						'    # Remove excess space from the picture\n',
						'    img = scaled_img[\n',
						'        0 : scaled_img.shape[0] - (scaled_img.shape[0] % stride),\n',
						'        0 : scaled_img.shape[1] - (scaled_img.shape[1] % stride),\n',
						'    ]\n',
						'\n',
						'    img = np.transpose(img, (2, 0, 1))[None,]\n',
						'    infer_request.infer({input_tensor_name: img})\n',
						'    # A set of three inference results is obtained\n',
						'    results = {\n',
						'        name: infer_request.get_tensor(name).data[:]\n',
						'        for name in {"features", "heatmaps", "pafs"}\n',
						'    }\n',
						'    # Get the results\n',
						'    results = (results["features"][0], results["heatmaps"][0], results["pafs"][0])\n',
						'\n',
						'    return results'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Draw 2D Pose Overlays\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We need to define some connections between the joints in advance, so that we can draw the structure of the human body in the resulting image after obtaining the inference results.\n',
						'Joints are drawn as circles and limbs are drawn as lines. The code is based on the [3D Human Pose Estimation Demo](https://github.com/openvinotoolkit/open_model_zoo/tree/master/demos/human_pose_estimation_3d_demo/python) from Open Model Zoo.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# 3D edge index array\n',
						'body_edges = np.array(\n',
						'    [\n',
						'        [0, 1],\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [1, 15],\n',
						'        [15, 16],  # nose - l_eye - l_ear\n',
						'        [1, 17],\n',
						'        [17, 18],  # nose - r_eye - r_ear\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'body_edges_2d = np.array(\n',
						'    [\n',
						'        [0, 1],  # neck - nose\n',
						'        [1, 16],\n',
						'        [16, 18],  # nose - l_eye - l_ear\n',
						'        [1, 15],\n',
						'        [15, 17],  # nose - r_eye - r_ear\n',
						'        [0, 3],\n',
						'        [3, 4],\n',
						'        [4, 5],  # neck - l_shoulder - l_elbow - l_wrist\n',
						'        [0, 9],\n',
						'        [9, 10],\n',
						'        [10, 11],  # neck - r_shoulder - r_elbow - r_wrist\n',
						'        [0, 6],\n',
						'        [6, 7],\n',
						'        [7, 8],  # neck - l_hip - l_knee - l_ankle\n',
						'        [0, 12],\n',
						'        [12, 13],\n',
						'        [13, 14],  # neck - r_hip - r_knee - r_ankle\n',
						'    ]\n',
						')\n',
						'\n',
						'\n',
						'def draw_poses(frame, poses_2d, scaled_img, use_popup):\n',
						'    """\n',
						'    Draw 2D pose overlays on the image to visualize estimated poses.\n',
						'    Joints are drawn as circles and limbs are drawn as lines.\n',
						'\n',
						'    :param frame: the input image\n',
						'    :param poses_2d: array of human joint pairs\n',
						'    """\n',
						'    for pose in poses_2d:\n',
						'        pose = np.array(pose[0:-1]).reshape((-1, 3)).transpose()\n',
						'        was_found = pose[2] > 0\n',
						'\n',
						'        pose[0], pose[1] = (\n',
						'            pose[0] * frame.shape[1] / scaled_img.shape[1],\n',
						'            pose[1] * frame.shape[0] / scaled_img.shape[0],\n',
						'        )\n',
						'\n',
						'        # Draw joints.\n',
						'        for edge in body_edges_2d:\n',
						'            if was_found[edge[0]] and was_found[edge[1]]:\n',
						'                cv2.line(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, edge[0]].astype(np.int32)),\n',
						'                    tuple(pose[0:2, edge[1]].astype(np.int32)),\n',
						'                    (255, 255, 0),\n',
						'                    4,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'        # Draw limbs.\n',
						'        for kpt_id in range(pose.shape[1]):\n',
						'            if pose[2, kpt_id] != -1:\n',
						'                cv2.circle(\n',
						'                    frame,\n',
						'                    tuple(pose[0:2, kpt_id].astype(np.int32)),\n',
						'                    3,\n',
						'                    (0, 255, 255),\n',
						'                    -1,\n',
						'                    cv2.LINE_AA,\n',
						'                )\n',
						'\n',
						'    return frame'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Main Processing Function\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run 3D pose estimation on the specified source. It could be either a webcam feed or a video file.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'tags': []
					},
					'source': [
						'def run_pose_estimation(source=0, flip=False, use_popup=False, skip_frames=0):\n',
						'    """\n',
						'    2D image as input, using OpenVINO as inference backend,\n',
						'    get joints 3D coordinates, and draw 3D human skeleton in the scene\n',
						'\n',
						'    :param source:      The webcam number to feed the video stream with primary webcam set to "0", or the video path.\n',
						'    :param flip:        To be used by VideoPlayer function for flipping capture image.\n',
						'    :param use_popup:   False for showing encoded frames over this notebook, True for creating a popup window.\n',
						'    :param skip_frames: Number of frames to skip at the beginning of the video.\n',
						'    """\n',
						'\n',
						'    focal_length = -1  # default\n',
						'    stride = 8\n',
						'    player = None\n',
						'    skeleton_set = None\n',
						'\n',
						'    try:\n',
						'        # create video player to play with target fps  video_path\n',
						'        # get the frame from camera\n',
						`        # You can skip first N frames to fast forward video. change 'skip_first_frames'\n`,
						'        player = utils.VideoPlayer(\n',
						'            source, flip=flip, fps=30, skip_first_frames=skip_frames\n',
						'        )\n',
						'        # start capturing\n',
						'        player.start()\n',
						'\n',
						'        input_image = player.next()\n',
						'        # set the window size\n',
						'        resize_scale = 450 / input_image.shape[1]\n',
						'        windows_width = int(input_image.shape[1] * resize_scale)\n',
						'        windows_height = int(input_image.shape[0] * resize_scale)\n',
						'\n',
						'        # use visualization library\n',
						'        engine3D = engine.Engine3js(\n',
						'            grid=True, axis=True, view_width=windows_width, view_height=windows_height\n',
						'        )\n',
						'\n',
						'        if use_popup:\n',
						'            # display the 3D human pose in this notebook, and origin frame in popup window\n',
						'            display(engine3D.renderer)\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(title, cv2.WINDOW_KEEPRATIO | cv2.WINDOW_AUTOSIZE)\n',
						'        else:\n',
						'            # set the 2D image box, show both human pose and image in the notebook\n',
						'            imgbox = widgets.Image(\n',
						'                format="jpg", height=windows_height, width=windows_width\n',
						'            )\n',
						'            display(widgets.HBox([engine3D.renderer, imgbox]))\n',
						'\n',
						'        skeleton = engine.Skeleton(body_edges=body_edges)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'\n',
						'        while True:\n',
						'            # grab the frame\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'\n',
						'            # resize image and change dims to fit neural network input\n',
						'            # (see https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/public/human-pose-estimation-3d-0001)\n',
						'            scaled_img = cv2.resize(\n',
						'                frame, dsize=(model.inputs[0].shape[3], model.inputs[0].shape[2])\n',
						'            )\n',
						'\n',
						'            if focal_length < 0:  # Focal length is unknown\n',
						'                focal_length = np.float32(0.8 * scaled_img.shape[1])\n',
						'\n',
						'            # inference start\n',
						'            start_time = time.time()\n',
						'            # get results\n',
						'            inference_result = model_infer(scaled_img, stride)\n',
						'\n',
						'            # inference stop\n',
						'            stop_time = time.time()\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Process the point to point coordinates of the data\n',
						'            poses_3d, poses_2d = parse_poses(\n',
						'                inference_result, 1, stride, focal_length, True\n',
						'            )\n',
						'\n',
						'            # use processing times from last 200 frames\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'\n',
						'            if len(poses_3d) > 0:\n',
						'                # From here, you can rotate the 3D point positions using the function "draw_poses",\n',
						'                # or you can directly make the correct mapping below to properly display the object image on the screen\n',
						'                poses_3d_copy = poses_3d.copy()\n',
						'                x = poses_3d_copy[:, 0::4]\n',
						'                y = poses_3d_copy[:, 1::4]\n',
						'                z = poses_3d_copy[:, 2::4]\n',
						'                poses_3d[:, 0::4], poses_3d[:, 1::4], poses_3d[:, 2::4] = (\n',
						'                    -z + np.ones(poses_3d[:, 2::4].shape) * 200,\n',
						'                    -y + np.ones(poses_3d[:, 2::4].shape) * 100,\n',
						'                    -x,\n',
						'                )\n',
						'\n',
						'                poses_3d = poses_3d.reshape(poses_3d.shape[0], 19, -1)[:, :, 0:3]\n',
						'                people = skeleton(poses_3d=poses_3d)\n',
						'\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'                engine3D.scene_add(people)\n',
						'                skeleton_set = people\n',
						'\n',
						'                # draw 2D\n',
						'                frame = draw_poses(frame, poses_2d, scaled_img, use_popup)\n',
						'\n',
						'            else:\n',
						'                try:\n',
						'                    engine3D.scene_remove(skeleton_set)\n',
						'                    skeleton_set = None\n',
						'                except Exception:\n',
						'                    pass\n',
						'\n',
						'            cv2.putText(\n',
						'                frame,\n',
						'                f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                (10, 30),\n',
						'                cv2.FONT_HERSHEY_COMPLEX,\n',
						'                0.7,\n',
						'                (0, 0, 255),\n',
						'                1,\n',
						'                cv2.LINE_AA,\n',
						'            )\n',
						'\n',
						'            if use_popup:\n',
						'                cv2.imshow(title, frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27, use ESC to exit\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # encode numpy array to jpg\n',
						'                imgbox.value = cv2.imencode(\n',
						'                    ".jpg",\n',
						'                    frame,\n',
						'                    params=[cv2.IMWRITE_JPEG_QUALITY, 90],\n',
						'                )[1].tobytes()\n',
						'\n',
						'            engine3D.renderer.render(engine3D.scene, engine3D.cam)\n',
						'\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        clear_output()\n',
						'        if player is not None:\n',
						'            # stop capturing\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()\n',
						'        if skeleton_set:\n',
						'            engine3D.scene_remove(skeleton_set)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Run\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Run, using a webcam as the video input. By default, the primary webcam is set with `source=0`. If you have multiple webcams, each one will be assigned a consecutive number starting at 0. Set `flip=True` when using a front-facing camera. Some web browsers, especially Mozilla Firefox, may cause flickering. If you experience flickering, set `use_popup=True`.\n',
						'\n',
						'> **NOTE**:\n',
						'>\n',
						'> *1. To use this notebook with a webcam, you need to run the notebook on a computer with a webcam. If you run the notebook on a server (e.g. Binder), the webcam will not work.*\n',
						'>\n',
						'> *2. Popup mode may not work if you run this notebook on a remote computer (e.g. Binder).*\n',
						'\n',
						'If you do not have a webcam, you can still run this demo with a video file. Any [format supported by OpenCV](https://docs.opencv.org/4.5.1/dd/d43/tutorial_py_video_display.html) will work.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Using the following method, you can click and move your mouse over the picture on the left to interact.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'tags': []
					},
					'source': [
						'USE_WEBCAM = False\n',
						'\n',
						'cam_id = 0\n',
						'video_path = "https://github.com/intel-iot-devkit/sample-videos/raw/master/face-demographics-walking.mp4"\n',
						'\n',
						'source = cam_id if USE_WEBCAM else video_path\n',
						'\n',
						'run_pose_estimation(source=source, flip=isinstance(source, int), use_popup=False)'
					]
				}
			].map(fromJupyterCell)
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 },
			{ modified: 7, original: 7 },
			{ modified: 8, original: 8 },
			{ modified: 9, original: 9 },
			{ modified: 10, original: 10 },
			{ modified: 11, original: 11 },
			{ modified: 12, original: 12 },
			{ modified: 13, original: 13 },
			{ modified: 14, original: 14 },
			{ modified: 15, original: 15 },
			{ modified: 16, original: 16 },
			{ modified: 17, original: 17 },
			{ modified: 18, original: 18 },
			{ modified: 19, original: 19 },
			{ modified: 20, original: 20 },
			{ modified: 21, original: 21 },
			{ modified: 22, original: 22 },
			{ modified: 23, original: 23 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 4, originalLength: 1, modifiedStart: 4, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 10, originalLength: 1, modifiedStart: 10, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 16, originalLength: 1, modifiedStart: 16, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 18, originalLength: 1, modifiedStart: 18, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 20, originalLength: 1, modifiedStart: 20, modifiedLength: 1 } satisfies IDiffChange,
		]);

	});
	test('Modification with Insertion, detected as deletion of a cell', async () => {
		const { mapping, diff } = await mapCells(
			[
				{
					'cell_type': 'markdown',
					'source': [
						'# Video generation with ZeroScope and OpenVINO\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Install and import required packages](#Install-and-import-required-packages)\n',
						'- [Load the model](#Load-the-model)\n',
						'- [Convert the model](#Convert-the-model)\n',
						'    - [Define the conversion function](#Define-the-conversion-function)\n',
						'    - [UNet](#UNet)\n',
						'    - [VAE](#VAE)\n',
						'    - [Text encoder](#Text-encoder)\n',
						'- [Build a pipeline](#Build-a-pipeline)\n',
						'- [Inference with OpenVINO](#Inference-with-OpenVINO)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Define a prompt](#Define-a-prompt)\n',
						'    - [Video generation](#Video-generation)\n',
						'- [Interactive demo](#Interactive-demo)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/zeroscope-text2video/zeroscope-text2video.ipynb" />\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The ZeroScope model is a free and open-source text-to-video model that can generate realistic and engaging videos from text descriptions. It is based on the [Modelscope](https://modelscope.cn/models/damo/text-to-video-synthesis/summary) model, but it has been improved to produce higher-quality videos with a 16:9 aspect ratio and no Shutterstock watermark. The ZeroScope model is available in two versions: ZeroScope_v2 576w, which is optimized for rapid content creation at a resolution of 576x320 pixels, and ZeroScope_v2 XL, which upscales videos to a high-definition resolution of 1024x576.\n',
						'\n',
						'The ZeroScope model is trained on a dataset of over 9,000 videos and 29,000 tagged frames. It uses a diffusion model to generate videos, which means that it starts with a random noise image and gradually adds detail to it until it matches the text description. The ZeroScope model is still under development, but it has already been used to create some impressive videos. For example, it has been used to create videos of people dancing, playing sports, and even driving cars.\n',
						'\n',
						'The ZeroScope model is a powerful tool that can be used to create various videos, from simple animations to complex scenes. It is still under development, but it has the potential to revolutionize the way we create and consume video content.\n',
						'\n',
						'Both versions of the ZeroScope model are available on Hugging Face:\n',
						' - [ZeroScope_v2 576w](https://huggingface.co/cerspense/zeroscope_v2_576w)\n',
						' - [ZeroScope_v2 XL](https://huggingface.co/cerspense/zeroscope_v2_XL)\n',
						'\n',
						'We will use the first one.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'<div class="alert alert-block alert-warning">\n',
						'    This tutorial requires at least 24GB of free memory to generate a video with a frame size of 432x240 and 16 frames. Increasing either of these values will require more memory and take more time.\n',
						'</div>'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Install and import required packages\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'To work with text-to-video synthesis model, we will use Hugging Face\'s [Diffusers](https://github.com/huggingface/diffusers) library. It provides already pretrained model from `cerspense`.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install -q --extra-index-url https://download.pytorch.org/whl/cpu  "diffusers>=0.18.0" "torch>=2.1" transformers "openvino>=2023.1.0" numpy "gradio>=4.19"'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import gc\n',
						'from typing import Optional, Union, List, Callable\n',
						'import base64\n',
						'import tempfile\n',
						'import warnings\n',
						'\n',
						'import diffusers\n',
						'import transformers\n',
						'import numpy as np\n',
						'import IPython\n',
						'import torch\n',
						'import PIL\n',
						'import gradio as gr\n',
						'\n',
						'import openvino as ov'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						`Original 576x320 inference requires a lot of RAM (>100GB), so let's run our example on a smaller frame size, keeping the same aspect ratio. Try reducing values below to reduce the memory consumption.`
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'WIDTH = 432  # must be divisible by 8\n',
						'HEIGHT = 240  # must be divisible by 8\n',
						'NUM_FRAMES = 16'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The model is loaded from HuggingFace using `.from_pretrained` method of `diffusers.DiffusionPipeline`.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'pipe = diffusers.DiffusionPipeline.from_pretrained("cerspense/zeroscope_v2_576w")'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'unet = pipe.unet\n',
						'unet.eval()\n',
						'vae = pipe.vae\n',
						'vae.eval()\n',
						'text_encoder = pipe.text_encoder\n',
						'text_encoder.eval()\n',
						'tokenizer = pipe.tokenizer\n',
						'scheduler = pipe.scheduler\n',
						'vae_scale_factor = pipe.vae_scale_factor\n',
						'unet_in_channels = pipe.unet.config.in_channels\n',
						'sample_width = WIDTH // vae_scale_factor\n',
						'sample_height = HEIGHT // vae_scale_factor\n',
						'del pipe\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Convert the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						`The architecture for generating videos from text comprises three distinct sub-networks: one for extracting text features, another for translating text features into the video latent space using a diffusion model, and a final one for mapping the video latent space to the visual space. The collective parameters of the entire model amount to approximately 1.7 billion. It's capable of processing English input. The diffusion model is built upon the Unet3D model and achieves video generation by iteratively denoising a starting point of pure Gaussian noise video.`
					]
				},
				{
					'cell_type': 'markdown',
					'source': []
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Define the conversion function\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Model components are PyTorch modules, that can be converted with `ov.convert_model` function directly. We also use `ov.save_model` function to serialize the result of conversion.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'warnings.filterwarnings("ignore", category=torch.jit.TracerWarning)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'from pathlib import Path\n',
						'\n',
						'\n',
						'def convert(model: torch.nn.Module, xml_path: str, **convert_kwargs) -> Path:\n',
						'    xml_path = Path(xml_path)\n',
						'    if not xml_path.exists():\n',
						'        xml_path.parent.mkdir(parents=True, exist_ok=True)\n',
						'        with torch.no_grad():\n',
						'            converted_model = ov.convert_model(model, **convert_kwargs)\n',
						'        ov.save_model(converted_model, xml_path)\n',
						'        del converted_model\n',
						'        gc.collect()\n',
						'        torch._C._jit_clear_class_registry()\n',
						'        torch.jit._recursive.concrete_type_store = torch.jit._recursive.ConcreteTypeStore()\n',
						'        torch.jit._state._clear_class_state()\n',
						'    return xml_path'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### UNet\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Text-to-video generation pipeline main component is a conditional 3D UNet model that takes a noisy sample, conditional state, and a timestep and returns a sample shaped output.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'unet_xml_path = convert(\n',
						'    unet,\n',
						'    "models/unet.xml",\n',
						'    example_input={\n',
						'        "sample": torch.randn(2, 4, 2, int(sample_height // 2), int(sample_width // 2)),\n',
						'        "timestep": torch.tensor(1),\n',
						'        "encoder_hidden_states": torch.randn(2, 77, 1024),\n',
						'    },\n',
						'    input=[\n',
						'        ("sample", (2, 4, NUM_FRAMES, sample_height, sample_width)),\n',
						'        ("timestep", ()),\n',
						'        ("encoder_hidden_states", (2, 77, 1024)),\n',
						'    ],\n',
						')\n',
						'del unet\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### VAE\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Variational autoencoder (VAE) uses UNet output to decode latents to visual representations. Our VAE model has KL loss for encoding images into latents and decoding latent representations into images. For inference, we need only decoder part.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'class VaeDecoderWrapper(torch.nn.Module):\n',
						'    def __init__(self, vae):\n',
						'        super().__init__()\n',
						'        self.vae = vae\n',
						'\n',
						'    def forward(self, z: torch.FloatTensor):\n',
						'        return self.vae.decode(z)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'vae_decoder_xml_path = convert(\n',
						'    VaeDecoderWrapper(vae),\n',
						'    "models/vae.xml",\n',
						'    example_input=torch.randn(2, 4, 32, 32),\n',
						'    input=((NUM_FRAMES, 4, sample_height, sample_width)),\n',
						')\n',
						'del vae\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Text encoder\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Text encoder is used to encode the input prompt to tensor. Default tensor length is 77.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'text_encoder_xml = convert(\n',
						'    text_encoder,\n',
						'    "models/text_encoder.xml",\n',
						'    example_input=torch.ones(1, 77, dtype=torch.int64),\n',
						'    input=((1, 77), ov.Type.i64),\n',
						')\n',
						'del text_encoder\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Build a pipeline\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def tensor2vid(video: torch.Tensor, mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]) -> List[np.ndarray]:\n',
						'    # This code is copied from https://github.com/modelscope/modelscope/blob/1509fdb973e5871f37148a4b5e5964cafd43e64d/modelscope/pipelines/multi_modal/text_to_video_synthesis_pipeline.py#L78\n',
						'    # reshape to ncfhw\n',
						'    mean = torch.tensor(mean, device=video.device).reshape(1, -1, 1, 1, 1)\n',
						'    std = torch.tensor(std, device=video.device).reshape(1, -1, 1, 1, 1)\n',
						'    # unnormalize back to [0,1]\n',
						'    video = video.mul_(std).add_(mean)\n',
						'    video.clamp_(0, 1)\n',
						'    # prepare the final outputs\n',
						'    i, c, f, h, w = video.shape\n',
						'    images = video.permute(2, 3, 0, 4, 1).reshape(f, h, i * w, c)  # 1st (frames, h, batch_size, w, c) 2nd (frames, h, batch_size * w, c)\n',
						'    images = images.unbind(dim=0)  # prepare a list of indvidual (consecutive frames)\n',
						'    images = [(image.cpu().numpy() * 255).astype("uint8") for image in images]  # f h w c\n',
						'    return images'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'try:\n',
						'    from diffusers.utils import randn_tensor\n',
						'except ImportError:\n',
						'    from diffusers.utils.torch_utils import randn_tensor\n',
						'\n',
						'\n',
						'class OVTextToVideoSDPipeline(diffusers.DiffusionPipeline):\n',
						'    def __init__(\n',
						'        self,\n',
						'        vae_decoder: ov.CompiledModel,\n',
						'        text_encoder: ov.CompiledModel,\n',
						'        tokenizer: transformers.CLIPTokenizer,\n',
						'        unet: ov.CompiledModel,\n',
						'        scheduler: diffusers.schedulers.DDIMScheduler,\n',
						'    ):\n',
						'        super().__init__()\n',
						'\n',
						'        self.vae_decoder = vae_decoder\n',
						'        self.text_encoder = text_encoder\n',
						'        self.tokenizer = tokenizer\n',
						'        self.unet = unet\n',
						'        self.scheduler = scheduler\n',
						'        self.vae_scale_factor = vae_scale_factor\n',
						'        self.unet_in_channels = unet_in_channels\n',
						'        self.width = WIDTH\n',
						'        self.height = HEIGHT\n',
						'        self.num_frames = NUM_FRAMES\n',
						'\n',
						'    def __call__(\n',
						'        self,\n',
						'        prompt: Union[str, List[str]] = None,\n',
						'        num_inference_steps: int = 50,\n',
						'        guidance_scale: float = 9.0,\n',
						'        negative_prompt: Optional[Union[str, List[str]]] = None,\n',
						'        eta: float = 0.0,\n',
						'        generator: Optional[Union[torch.Generator, List[torch.Generator]]] = None,\n',
						'        latents: Optional[torch.FloatTensor] = None,\n',
						'        prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        negative_prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        output_type: Optional[str] = "np",\n',
						'        return_dict: bool = True,\n',
						'        callback: Optional[Callable[[int, int, torch.FloatTensor], None]] = None,\n',
						'        callback_steps: int = 1,\n',
						'    ):\n',
						'        r"""\n',
						'        Function invoked when calling the pipeline for generation.\n',
						'\n',
						'        Args:\n',
						'            prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts to guide the video generation. If not defined, one has to pass `prompt_embeds`.\n',
						'                instead.\n',
						'            num_inference_steps (`int`, *optional*, defaults to 50):\n',
						'                The number of denoising steps. More denoising steps usually lead to a higher quality videos at the\n',
						'                expense of slower inference.\n',
						'            guidance_scale (`float`, *optional*, defaults to 7.5):\n',
						'                Guidance scale as defined in [Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598).\n',
						'                `guidance_scale` is defined as `w` of equation 2. of [Imagen\n',
						'                Paper](https://arxiv.org/pdf/2205.11487.pdf). Guidance scale is enabled by setting `guidance_scale >\n',
						'                1`. Higher guidance scale encourages to generate videos that are closely linked to the text `prompt`,\n',
						'                usually at the expense of lower video quality.\n',
						'            negative_prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts not to guide the video generation. If not defined, one has to pass\n',
						'                `negative_prompt_embeds` instead. Ignored when not using guidance (i.e., ignored if `guidance_scale` is\n',
						'                less than `1`).\n',
						'            eta (`float`, *optional*, defaults to 0.0):\n',
						'                Corresponds to parameter eta (η) in the DDIM paper: https://arxiv.org/abs/2010.02502. Only applies to\n',
						'                [`schedulers.DDIMScheduler`], will be ignored for others.\n',
						'            generator (`torch.Generator` or `List[torch.Generator]`, *optional*):\n',
						'                One or a list of [torch generator(s)](https://pytorch.org/docs/stable/generated/torch.Generator.html)\n',
						'                to make generation deterministic.\n',
						'            latents (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated noisy latents, sampled from a Gaussian distribution, to be used as inputs for video\n',
						'                generation. Can be used to tweak the same generation with different prompts. If not provided, a latents\n',
						'                tensor will ge generated by sampling using the supplied random `generator`. Latents should be of shape\n',
						'                `(batch_size, num_channel, num_frames, height, width)`.\n',
						'            prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt weighting. If not\n',
						'                provided, text embeddings will be generated from `prompt` input argument.\n',
						'            negative_prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated negative text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt\n',
						'                weighting. If not provided, negative_prompt_embeds will be generated from `negative_prompt` input\n',
						'                argument.\n',
						'            output_type (`str`, *optional*, defaults to `"np"`):\n',
						'                The output format of the generate video. Choose between `torch.FloatTensor` or `np.array`.\n',
						'            return_dict (`bool`, *optional*, defaults to `True`):\n',
						'                Whether or not to return a [`~pipelines.stable_diffusion.TextToVideoSDPipelineOutput`] instead of a\n',
						'                plain tuple.\n',
						'            callback (`Callable`, *optional*):\n',
						'                A function that will be called every `callback_steps` steps during inference. The function will be\n',
						'                called with the following arguments: `callback(step: int, timestep: int, latents: torch.FloatTensor)`.\n',
						'            callback_steps (`int`, *optional*, defaults to 1):\n',
						'                The frequency at which the `callback` function will be called. If not specified, the callback will be\n',
						'                called at every step.\n',
						'\n',
						'        Returns:\n',
						'            `List[np.ndarray]`: generated video frames\n',
						'        """\n',
						'\n',
						'        num_images_per_prompt = 1\n',
						'\n',
						'        # 1. Check inputs. Raise error if not correct\n',
						'        self.check_inputs(\n',
						'            prompt,\n',
						'            callback_steps,\n',
						'            negative_prompt,\n',
						'            prompt_embeds,\n',
						'            negative_prompt_embeds,\n',
						'        )\n',
						'\n',
						'        # 2. Define call parameters\n',
						'        if prompt is not None and isinstance(prompt, str):\n',
						'            batch_size = 1\n',
						'        elif prompt is not None and isinstance(prompt, list):\n',
						'            batch_size = len(prompt)\n',
						'        else:\n',
						'            batch_size = prompt_embeds.shape[0]\n',
						'\n',
						'        # here `guidance_scale` is defined analog to the guidance weight `w` of equation (2)\n',
						'        # of the Imagen paper: https://arxiv.org/pdf/2205.11487.pdf . `guidance_scale = 1`\n',
						'        # corresponds to doing no classifier free guidance.\n',
						'        do_classifier_free_guidance = guidance_scale > 1.0\n',
						'\n',
						'        # 3. Encode input prompt\n',
						'        prompt_embeds = self._encode_prompt(\n',
						'            prompt,\n',
						'            num_images_per_prompt,\n',
						'            do_classifier_free_guidance,\n',
						'            negative_prompt,\n',
						'            prompt_embeds=prompt_embeds,\n',
						'            negative_prompt_embeds=negative_prompt_embeds,\n',
						'        )\n',
						'\n',
						'        # 4. Prepare timesteps\n',
						'        self.scheduler.set_timesteps(num_inference_steps)\n',
						'        timesteps = self.scheduler.timesteps\n',
						'\n',
						'        # 5. Prepare latent variables\n',
						'        num_channels_latents = self.unet_in_channels\n',
						'        latents = self.prepare_latents(\n',
						'            batch_size * num_images_per_prompt,\n',
						'            num_channels_latents,\n',
						'            prompt_embeds.dtype,\n',
						'            generator,\n',
						'            latents,\n',
						'        )\n',
						'\n',
						'        # 6. Prepare extra step kwargs. TODO: Logic should ideally just be moved out of the pipeline\n',
						'        extra_step_kwargs = {"generator": generator, "eta": eta}\n',
						'\n',
						'        # 7. Denoising loop\n',
						'        num_warmup_steps = len(timesteps) - num_inference_steps * self.scheduler.order\n',
						'        with self.progress_bar(total=num_inference_steps) as progress_bar:\n',
						'            for i, t in enumerate(timesteps):\n',
						'                # expand the latents if we are doing classifier free guidance\n',
						'                latent_model_input = torch.cat([latents] * 2) if do_classifier_free_guidance else latents\n',
						'                latent_model_input = self.scheduler.scale_model_input(latent_model_input, t)\n',
						'\n',
						'                # predict the noise residual\n',
						'                noise_pred = self.unet(\n',
						'                    {\n',
						'                        "sample": latent_model_input,\n',
						'                        "timestep": t,\n',
						'                        "encoder_hidden_states": prompt_embeds,\n',
						'                    }\n',
						'                )[0]\n',
						'                noise_pred = torch.tensor(noise_pred)\n',
						'\n',
						'                # perform guidance\n',
						'                if do_classifier_free_guidance:\n',
						'                    noise_pred_uncond, noise_pred_text = noise_pred.chunk(2)\n',
						'                    noise_pred = noise_pred_uncond + guidance_scale * (noise_pred_text - noise_pred_uncond)\n',
						'\n',
						'                # reshape latents\n',
						'                bsz, channel, frames, width, height = latents.shape\n',
						'                latents = latents.permute(0, 2, 1, 3, 4).reshape(bsz * frames, channel, width, height)\n',
						'                noise_pred = noise_pred.permute(0, 2, 1, 3, 4).reshape(bsz * frames, channel, width, height)\n',
						'\n',
						'                # compute the previous noisy sample x_t -> x_t-1\n',
						'                latents = self.scheduler.step(noise_pred, t, latents, **extra_step_kwargs).prev_sample\n',
						'\n',
						'                # reshape latents back\n',
						'                latents = latents[None, :].reshape(bsz, frames, channel, width, height).permute(0, 2, 1, 3, 4)\n',
						'\n',
						'                # call the callback, if provided\n',
						'                if i == len(timesteps) - 1 or ((i + 1) > num_warmup_steps and (i + 1) % self.scheduler.order == 0):\n',
						'                    progress_bar.update()\n',
						'                    if callback is not None and i % callback_steps == 0:\n',
						'                        callback(i, t, latents)\n',
						'\n',
						'        video_tensor = self.decode_latents(latents)\n',
						'\n',
						'        if output_type == "pt":\n',
						'            video = video_tensor\n',
						'        else:\n',
						'            video = tensor2vid(video_tensor)\n',
						'\n',
						'        if not return_dict:\n',
						'            return (video,)\n',
						'\n',
						'        return {"frames": video}\n',
						'\n',
						'    # Copied from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion.StableDiffusionPipeline._encode_prompt\n',
						'    def _encode_prompt(\n',
						'        self,\n',
						'        prompt,\n',
						'        num_images_per_prompt,\n',
						'        do_classifier_free_guidance,\n',
						'        negative_prompt=None,\n',
						'        prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        negative_prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'    ):\n',
						'        r"""\n',
						'        Encodes the prompt into text encoder hidden states.\n',
						'\n',
						'        Args:\n',
						'             prompt (`str` or `List[str]`, *optional*):\n',
						'                prompt to be encoded\n',
						'            num_images_per_prompt (`int`):\n',
						'                number of images that should be generated per prompt\n',
						'            do_classifier_free_guidance (`bool`):\n',
						'                whether to use classifier free guidance or not\n',
						'            negative_prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts not to guide the image generation. If not defined, one has to pass\n',
						'                `negative_prompt_embeds` instead. Ignored when not using guidance (i.e., ignored if `guidance_scale` is\n',
						'                less than `1`).\n',
						'            prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt weighting. If not\n',
						'                provided, text embeddings will be generated from `prompt` input argument.\n',
						'            negative_prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated negative text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt\n',
						'                weighting. If not provided, negative_prompt_embeds will be generated from `negative_prompt` input\n',
						'                argument.\n',
						'        """\n',
						'        if prompt is not None and isinstance(prompt, str):\n',
						'            batch_size = 1\n',
						'        elif prompt is not None and isinstance(prompt, list):\n',
						'            batch_size = len(prompt)\n',
						'        else:\n',
						'            batch_size = prompt_embeds.shape[0]\n',
						'\n',
						'        if prompt_embeds is None:\n',
						'            text_inputs = self.tokenizer(\n',
						'                prompt,\n',
						'                padding="max_length",\n',
						'                max_length=self.tokenizer.model_max_length,\n',
						'                truncation=True,\n',
						'                return_tensors="pt",\n',
						'            )\n',
						'            text_input_ids = text_inputs.input_ids\n',
						'            untruncated_ids = self.tokenizer(prompt, padding="longest", return_tensors="pt").input_ids\n',
						'\n',
						'            if untruncated_ids.shape[-1] >= text_input_ids.shape[-1] and not torch.equal(text_input_ids, untruncated_ids):\n',
						'                removed_text = self.tokenizer.batch_decode(untruncated_ids[:, self.tokenizer.model_max_length - 1 : -1])\n',
						'                print(\n',
						'                    "The following part of your input was truncated because CLIP can only handle sequences up to"\n',
						'                    f" {self.tokenizer.model_max_length} tokens: {removed_text}"\n',
						'                )\n',
						'\n',
						'            prompt_embeds = self.text_encoder(text_input_ids)\n',
						'            prompt_embeds = prompt_embeds[0]\n',
						'            prompt_embeds = torch.tensor(prompt_embeds)\n',
						'\n',
						'        bs_embed, seq_len, _ = prompt_embeds.shape\n',
						'        # duplicate text embeddings for each generation per prompt, using mps friendly method\n',
						'        prompt_embeds = prompt_embeds.repeat(1, num_images_per_prompt, 1)\n',
						'        prompt_embeds = prompt_embeds.view(bs_embed * num_images_per_prompt, seq_len, -1)\n',
						'\n',
						'        # get unconditional embeddings for classifier free guidance\n',
						'        if do_classifier_free_guidance and negative_prompt_embeds is None:\n',
						'            uncond_tokens: List[str]\n',
						'            if negative_prompt is None:\n',
						'                uncond_tokens = [""] * batch_size\n',
						'            elif type(prompt) is not type(negative_prompt):\n',
						'                raise TypeError(f"`negative_prompt` should be the same type to `prompt`, but got {type(negative_prompt)} !=" f" {type(prompt)}.")\n',
						'            elif isinstance(negative_prompt, str):\n',
						'                uncond_tokens = [negative_prompt]\n',
						'            elif batch_size != len(negative_prompt):\n',
						'                raise ValueError(\n',
						'                    f"`negative_prompt`: {negative_prompt} has batch size {len(negative_prompt)}, but `prompt`:"\n',
						'                    f" {prompt} has batch size {batch_size}. Please make sure that passed `negative_prompt` matches"\n',
						'                    " the batch size of `prompt`."\n',
						'                )\n',
						'            else:\n',
						'                uncond_tokens = negative_prompt\n',
						'\n',
						'            max_length = prompt_embeds.shape[1]\n',
						'            uncond_input = self.tokenizer(\n',
						'                uncond_tokens,\n',
						'                padding="max_length",\n',
						'                max_length=max_length,\n',
						'                truncation=True,\n',
						'                return_tensors="pt",\n',
						'            )\n',
						'\n',
						'            negative_prompt_embeds = self.text_encoder(uncond_input.input_ids)\n',
						'            negative_prompt_embeds = negative_prompt_embeds[0]\n',
						'            negative_prompt_embeds = torch.tensor(negative_prompt_embeds)\n',
						'\n',
						'        if do_classifier_free_guidance:\n',
						'            # duplicate unconditional embeddings for each generation per prompt, using mps friendly method\n',
						'            seq_len = negative_prompt_embeds.shape[1]\n',
						'\n',
						'            negative_prompt_embeds = negative_prompt_embeds.repeat(1, num_images_per_prompt, 1)\n',
						'            negative_prompt_embeds = negative_prompt_embeds.view(batch_size * num_images_per_prompt, seq_len, -1)\n',
						'\n',
						'            # For classifier free guidance, we need to do two forward passes.\n',
						'            # Here we concatenate the unconditional and text embeddings into a single batch\n',
						'            # to avoid doing two forward passes\n',
						'            prompt_embeds = torch.cat([negative_prompt_embeds, prompt_embeds])\n',
						'\n',
						'        return prompt_embeds\n',
						'\n',
						'    def prepare_latents(\n',
						'        self,\n',
						'        batch_size,\n',
						'        num_channels_latents,\n',
						'        dtype,\n',
						'        generator,\n',
						'        latents=None,\n',
						'    ):\n',
						'        shape = (\n',
						'            batch_size,\n',
						'            num_channels_latents,\n',
						'            self.num_frames,\n',
						'            self.height // self.vae_scale_factor,\n',
						'            self.width // self.vae_scale_factor,\n',
						'        )\n',
						'        if isinstance(generator, list) and len(generator) != batch_size:\n',
						'            raise ValueError(\n',
						'                f"You have passed a list of generators of length {len(generator)}, but requested an effective batch"\n',
						'                f" size of {batch_size}. Make sure the batch size matches the length of the generators."\n',
						'            )\n',
						'\n',
						'        if latents is None:\n',
						'            latents = randn_tensor(shape, generator=generator, dtype=dtype)\n',
						'\n',
						'        # scale the initial noise by the standard deviation required by the scheduler\n',
						'        latents = latents * self.scheduler.init_noise_sigma\n',
						'        return latents\n',
						'\n',
						'    def check_inputs(\n',
						'        self,\n',
						'        prompt,\n',
						'        callback_steps,\n',
						'        negative_prompt=None,\n',
						'        prompt_embeds=None,\n',
						'        negative_prompt_embeds=None,\n',
						'    ):\n',
						'        if self.height % 8 != 0 or self.width % 8 != 0:\n',
						'            raise ValueError(f"`height` and `width` have to be divisible by 8 but are {self.height} and {self.width}.")\n',
						'\n',
						'        if (callback_steps is None) or (callback_steps is not None and (not isinstance(callback_steps, int) or callback_steps <= 0)):\n',
						'            raise ValueError(f"`callback_steps` has to be a positive integer but is {callback_steps} of type" f" {type(callback_steps)}.")\n',
						'\n',
						'        if prompt is not None and prompt_embeds is not None:\n',
						'            raise ValueError(\n',
						'                f"Cannot forward both `prompt`: {prompt} and `prompt_embeds`: {prompt_embeds}. Please make sure to" " only forward one of the two."\n',
						'            )\n',
						'        elif prompt is None and prompt_embeds is None:\n',
						'            raise ValueError("Provide either `prompt` or `prompt_embeds`. Cannot leave both `prompt` and `prompt_embeds` undefined.")\n',
						'        elif prompt is not None and (not isinstance(prompt, str) and not isinstance(prompt, list)):\n',
						'            raise ValueError(f"`prompt` has to be of type `str` or `list` but is {type(prompt)}")\n',
						'\n',
						'        if negative_prompt is not None and negative_prompt_embeds is not None:\n',
						'            raise ValueError(\n',
						'                f"Cannot forward both `negative_prompt`: {negative_prompt} and `negative_prompt_embeds`:"\n',
						'                f" {negative_prompt_embeds}. Please make sure to only forward one of the two."\n',
						'            )\n',
						'\n',
						'        if prompt_embeds is not None and negative_prompt_embeds is not None:\n',
						'            if prompt_embeds.shape != negative_prompt_embeds.shape:\n',
						'                raise ValueError(\n',
						'                    "`prompt_embeds` and `negative_prompt_embeds` must have the same shape when passed directly, but"\n',
						'                    f" got: `prompt_embeds` {prompt_embeds.shape} != `negative_prompt_embeds`"\n',
						'                    f" {negative_prompt_embeds.shape}."\n',
						'                )\n',
						'\n',
						'    def decode_latents(self, latents):\n',
						'        scale_factor = 0.18215\n',
						'        latents = 1 / scale_factor * latents\n',
						'\n',
						'        batch_size, channels, num_frames, height, width = latents.shape\n',
						'        latents = latents.permute(0, 2, 1, 3, 4).reshape(batch_size * num_frames, channels, height, width)\n',
						'        image = self.vae_decoder(latents)[0]\n',
						'        image = torch.tensor(image)\n',
						'        video = (\n',
						'            image[None, :]\n',
						'            .reshape(\n',
						'                (\n',
						'                    batch_size,\n',
						'                    num_frames,\n',
						'                    -1,\n',
						'                )\n',
						'                + image.shape[2:]\n',
						'            )\n',
						'            .permute(0, 2, 1, 3, 4)\n',
						'        )\n',
						'        # we always cast to float32 as this does not cause significant overhead and is compatible with bfloat16\n',
						'        video = video.float()\n',
						'        return video'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Inference with OpenVINO\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'core = ov.Core()'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'open("notebook_utils.py", "w").write(r.text)\n',
						'\n',
						'from notebook_utils import device_widget\n',
						'\n',
						'device = device_widget()\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_unet = core.compile_model(unet_xml_path, device_name=device.value)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_vae_decoder = core.compile_model(vae_decoder_xml_path, device_name=device.value)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_text_encoder = core.compile_model(text_encoder_xml, device_name=device.value)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Here we replace the pipeline parts with versions converted to OpenVINO IR and compiled to specific device. Note that we use original pipeline tokenizer and scheduler.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'ov_pipe = OVTextToVideoSDPipeline(ov_vae_decoder, ov_text_encoder, tokenizer, ov_unet, scheduler)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Define a prompt\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'prompt = "A panda eating bamboo on a rock."'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Let\'s generate a video for our prompt. For full list of arguments, see `__call__` function definition of `OVTextToVideoSDPipeline` class in [Build a pipeline](#Build-a-pipeline) section.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Video generation\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'frames = ov_pipe(prompt, num_inference_steps=25)["frames"]'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'images = [PIL.Image.fromarray(frame) for frame in frames]\n',
						'images[0].save("output.gif", save_all=True, append_images=images[1:], duration=125, loop=0)\n',
						'with open("output.gif", "rb") as gif_file:\n',
						'    b64 = f"data:image/gif;base64,{base64.b64encode(gif_file.read()).decode()}"\n',
						`IPython.display.HTML(f'<img src="{b64}" />')`
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Interactive demo\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def generate(prompt, seed, num_inference_steps, _=gr.Progress(track_tqdm=True)):\n',
						'    generator = torch.Generator().manual_seed(seed)\n',
						'    frames = ov_pipe(\n',
						'        prompt,\n',
						'        num_inference_steps=num_inference_steps,\n',
						'        generator=generator,\n',
						'    )["frames"]\n',
						'    out_file = tempfile.NamedTemporaryFile(suffix=".gif", delete=False)\n',
						'    images = [PIL.Image.fromarray(frame) for frame in frames]\n',
						'    images[0].save(out_file, save_all=True, append_images=images[1:], duration=125, loop=0)\n',
						'    return out_file.name\n',
						'\n',
						'\n',
						'demo = gr.Interface(\n',
						'    generate,\n',
						'    [\n',
						'        gr.Textbox(label="Prompt"),\n',
						'        gr.Slider(0, 1000000, value=42, label="Seed", step=1),\n',
						'        gr.Slider(10, 50, value=25, label="Number of inference steps", step=1),\n',
						'    ],\n',
						'    gr.Image(label="Result"),\n',
						'    examples=[\n',
						'        ["An astronaut riding a horse.", 0, 25],\n',
						'        ["A panda eating bamboo on a rock.", 0, 25],\n',
						'        ["Spiderman is surfing.", 0, 25],\n',
						'    ],\n',
						'    allow_flagging="never",\n',
						')\n',
						'\n',
						'try:\n',
						'    demo.queue().launch(debug=True)\n',
						'except Exception:\n',
						'    demo.queue().launch(share=True, debug=True)\n',
						'# if you are launching remotely, specify server_name and server_port\n',
						`# demo.launch(server_name='your server name', server_port='server port in int')\n`,
						'# Read more in the docs: https://gradio.app/docs/'
					]
				}
			].map(fromJupyterCell)
			,
			[
				{
					'cell_type': 'markdown',
					'source': [
						'# Video generation with ZeroScope and OpenVINO\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Install and import required packages](#Install-and-import-required-packages)\n',
						'- [Load the model](#Load-the-model)\n',
						'- [Convert the model](#Convert-the-model)\n',
						'    - [Define the conversion function](#Define-the-conversion-function)\n',
						'    - [UNet](#UNet)\n',
						'    - [VAE](#VAE)\n',
						'    - [Text encoder](#Text-encoder)\n',
						'- [Build a pipeline](#Build-a-pipeline)\n',
						'- [Inference with OpenVINO](#Inference-with-OpenVINO)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Define a prompt](#Define-a-prompt)\n',
						'    - [Video generation](#Video-generation)\n',
						'- [Interactive demo](#Interactive-demo)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/zeroscope-text2video/zeroscope-text2video.ipynb" />\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The ZeroScope model is a free and open-source text-to-video model that can generate realistic and engaging videos from text descriptions. It is based on the [Modelscope](https://modelscope.cn/models/damo/text-to-video-synthesis/summary) model, but it has been improved to produce higher-quality videos with a 16:9 aspect ratio and no Shutterstock watermark. The ZeroScope model is available in two versions: ZeroScope_v2 576w, which is optimized for rapid content creation at a resolution of 576x320 pixels, and ZeroScope_v2 XL, which upscales videos to a high-definition resolution of 1024x576.\n',
						'\n',
						'The ZeroScope model is trained on a dataset of over 9,000 videos and 29,000 tagged frames. It uses a diffusion model to generate videos, which means that it starts with a random noise image and gradually adds detail to it until it matches the text description. The ZeroScope model is still under development, but it has already been used to create some impressive videos. For example, it has been used to create videos of people dancing, playing sports, and even driving cars.\n',
						'\n',
						'The ZeroScope model is a powerful tool that can be used to create various videos, from simple animations to complex scenes. It is still under development, but it has the potential to revolutionize the way we create and consume video content.\n',
						'\n',
						'Both versions of the ZeroScope model are available on Hugging Face:\n',
						' - [ZeroScope_v2 576w](https://huggingface.co/cerspense/zeroscope_v2_576w)\n',
						' - [ZeroScope_v2 XL](https://huggingface.co/cerspense/zeroscope_v2_XL)\n',
						'\n',
						'We will use the first one.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'<div class="alert alert-block alert-warning">\n',
						'    This tutorial requires at least 24GB of free memory to generate a video with a frame size of 432x240 and 16 frames. Increasing either of these values will require more memory and take more time.\n',
						'</div>'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Install and import required packages\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'To work with text-to-video synthesis model, we will use Hugging Face\'s [Diffusers](https://github.com/huggingface/diffusers) library. It provides already pretrained model from `cerspense`.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install -q --extra-index-url https://download.pytorch.org/whl/cpu  "diffusers>=0.18.0" "torch>=2.1" transformers "openvino>=2023.1.0" numpy "gradio>=4.19"'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import gc\n',
						'from typing import Optional, Union, List, Callable\n',
						'import base64\n',
						'import tempfile\n',
						'import warnings\n',
						'\n',
						'import diffusers\n',
						'import transformers\n',
						'import numpy as np\n',
						'import IPython\n',
						'import torch\n',
						'import PIL\n',
						'import gradio as gr\n',
						'\n',
						'import openvino as ov'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						`Original 576x320 inference requires a lot of RAM (>100GB), so let's run our example on a smaller frame size, keeping the same aspect ratio. Try reducing values below to reduce the memory consumption.`
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'WIDTH = 432  # must be divisible by 8\n',
						'HEIGHT = 240  # must be divisible by 8\n',
						'NUM_FRAMES = 16'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The model is loaded from HuggingFace using `.from_pretrained` method of `diffusers.DiffusionPipeline`.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'pipe = diffusers.DiffusionPipeline.from_pretrained("cerspense/zeroscope_v2_576w")'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'unet = pipe.unet\n',
						'unet.eval()\n',
						'vae = pipe.vae\n',
						'vae.eval()\n',
						'text_encoder = pipe.text_encoder\n',
						'text_encoder.eval()\n',
						'tokenizer = pipe.tokenizer\n',
						'scheduler = pipe.scheduler\n',
						'vae_scale_factor = pipe.vae_scale_factor\n',
						'unet_in_channels = pipe.unet.config.in_channels\n',
						'sample_width = WIDTH // vae_scale_factor\n',
						'sample_height = HEIGHT // vae_scale_factor\n',
						'del pipe\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Convert the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						`The architecture for generating videos from text comprises three distinct sub-networks: one for extracting text features, another for translating text features into the video latent space using a diffusion model, and a final one for mapping the video latent space to the visual space. The collective parameters of the entire model amount to approximately 1.7 billion. It's capable of processing English input. The diffusion model is built upon the Unet3D model and achieves video generation by iteratively denoising a starting point of pure Gaussian noise video.`
					]
				},
				{
					'cell_type': 'markdown',
					'source': []
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Define the conversion function\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Model components are PyTorch modules, that can be converted with `ov.convert_model` function directly. We also use `ov.save_model` function to serialize the result of conversion.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'warnings.filterwarnings("ignore", category=torch.jit.TracerWarning)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'from pathlib import Path\n',
						'\n',
						'\n',
						'def convert(model: torch.nn.Module, xml_path: str, **convert_kwargs) -> Path:\n',
						'    xml_path = Path(xml_path)\n',
						'    if not xml_path.exists():\n',
						'        xml_path.parent.mkdir(parents=True, exist_ok=True)\n',
						'        with torch.no_grad():\n',
						'            converted_model = ov.convert_model(model, **convert_kwargs)\n',
						'        ov.save_model(converted_model, xml_path)\n',
						'        del converted_model\n',
						'        gc.collect()\n',
						'        torch._C._jit_clear_class_registry()\n',
						'        torch.jit._recursive.concrete_type_store = torch.jit._recursive.ConcreteTypeStore()\n',
						'        torch.jit._state._clear_class_state()\n',
						'    return xml_path'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### UNet\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Text-to-video generation pipeline main component is a conditional 3D UNet model that takes a noisy sample, conditional state, and a timestep and returns a sample shaped output.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'unet_xml_path = convert(\n',
						'    unet,\n',
						'    "models/unet.xml",\n',
						'    example_input={\n',
						'        "sample": torch.randn(2, 4, 2, int(sample_height // 2), int(sample_width // 2)),\n',
						'        "timestep": torch.tensor(1),\n',
						'        "encoder_hidden_states": torch.randn(2, 77, 1024),\n',
						'    },\n',
						'    input=[\n',
						'        ("sample", (2, 4, NUM_FRAMES, sample_height, sample_width)),\n',
						'        ("timestep", ()),\n',
						'        ("encoder_hidden_states", (2, 77, 1024)),\n',
						'    ],\n',
						')\n',
						'del unet\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### VAE\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Variational autoencoder (VAE) uses UNet output to decode latents to visual representations. Our VAE model has KL loss for encoding images into latents and decoding latent representations into images. For inference, we need only decoder part.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'class VaeDecoderWrapper(torch.nn.Module):\n',
						'    def __init__(self, vae):\n',
						'        super().__init__()\n',
						'        self.vae = vae\n',
						'\n',
						'    def forward(self, z: torch.FloatTensor):\n',
						'        return self.vae.decode(z)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'vae_decoder_xml_path = convert(\n',
						'    VaeDecoderWrapper(vae),\n',
						'    "models/vae.xml",\n',
						'    example_input=torch.randn(2, 4, 32, 32),\n',
						'    input=((NUM_FRAMES, 4, sample_height, sample_width)),\n',
						')\n',
						'del vae\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Text encoder\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Text encoder is used to encode the input prompt to tensor. Default tensor length is 77.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'text_encoder_xml = convert(\n',
						'    text_encoder,\n',
						'    "models/text_encoder.xml",\n',
						'    example_input=torch.ones(1, 77, dtype=torch.int64),\n',
						'    input=((1, 77), ov.Type.i64),\n',
						')\n',
						'del text_encoder\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Build a pipeline\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def tensor2vid(video: torch.Tensor, mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]) -> List[np.ndarray]:\n',
						'    # This code is copied from https://github.com/modelscope/modelscope/blob/1509fdb973e5871f37148a4b5e5964cafd43e64d/modelscope/pipelines/multi_modal/text_to_video_synthesis_pipeline.py#L78\n',
						'    # reshape to ncfhw\n',
						'    mean = torch.tensor(mean, device=video.device).reshape(1, -1, 1, 1, 1)\n',
						'    std = torch.tensor(std, device=video.device).reshape(1, -1, 1, 1, 1)\n',
						'    # unnormalize back to [0,1]\n',
						'    video = video.mul_(std).add_(mean)\n',
						'    video.clamp_(0, 1)\n',
						'    # prepare the final outputs\n',
						'    i, c, f, h, w = video.shape\n',
						'    images = video.permute(2, 3, 0, 4, 1).reshape(f, h, i * w, c)  # 1st (frames, h, batch_size, w, c) 2nd (frames, h, batch_size * w, c)\n',
						'    images = images.unbind(dim=0)  # prepare a list of indvidual (consecutive frames)\n',
						'    images = [(image.cpu().numpy() * 255).astype("uint8") for image in images]  # f h w c\n',
						'    return images'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'try:\n',
						'    from diffusers.utils import randn_tensor\n',
						'except ImportError:\n',
						'    from diffusers.utils.torch_utils import randn_tensor\n',
						'\n',
						'\n',
						'class OVTextToVideoSDPipeline(diffusers.DiffusionPipeline):\n',
						'    def __init__(\n',
						'        self,\n',
						'        vae_decoder: ov.CompiledModel,\n',
						'        text_encoder: ov.CompiledModel,\n',
						'        tokenizer: transformers.CLIPTokenizer,\n',
						'        unet: ov.CompiledModel,\n',
						'        scheduler: diffusers.schedulers.DDIMScheduler,\n',
						'    ):\n',
						'        super().__init__()\n',
						'\n',
						'        self.vae_decoder = vae_decoder\n',
						'        self.text_encoder = text_encoder\n',
						'        self.tokenizer = tokenizer\n',
						'        self.unet = unet\n',
						'        self.scheduler = scheduler\n',
						'        self.vae_scale_factor = vae_scale_factor\n',
						'        self.unet_in_channels = unet_in_channels\n',
						'        self.width = WIDTH\n',
						'        self.height = HEIGHT\n',
						'        self.num_frames = NUM_FRAMES\n',
						'\n',
						'    def __call__(\n',
						'        self,\n',
						'        prompt: Union[str, List[str]] = None,\n',
						'        num_inference_steps: int = 50,\n',
						'        guidance_scale: float = 9.0,\n',
						'        negative_prompt: Optional[Union[str, List[str]]] = None,\n',
						'        eta: float = 0.0,\n',
						'        generator: Optional[Union[torch.Generator, List[torch.Generator]]] = None,\n',
						'        latents: Optional[torch.FloatTensor] = None,\n',
						'        prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        negative_prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        output_type: Optional[str] = "np",\n',
						'        return_dict: bool = True,\n',
						'        callback: Optional[Callable[[int, int, torch.FloatTensor], None]] = None,\n',
						'        callback_steps: int = 1,\n',
						'    ):\n',
						'        r"""\n',
						'        Function invoked when calling the pipeline for generation.\n',
						'\n',
						'        Args:\n',
						'            prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts to guide the video generation. If not defined, one has to pass `prompt_embeds`.\n',
						'                instead.\n',
						'            num_inference_steps (`int`, *optional*, defaults to 50):\n',
						'                The number of denoising steps. More denoising steps usually lead to a higher quality videos at the\n',
						'                expense of slower inference.\n',
						'            guidance_scale (`float`, *optional*, defaults to 7.5):\n',
						'                Guidance scale as defined in [Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598).\n',
						'                `guidance_scale` is defined as `w` of equation 2. of [Imagen\n',
						'                Paper](https://arxiv.org/pdf/2205.11487.pdf). Guidance scale is enabled by setting `guidance_scale >\n',
						'                1`. Higher guidance scale encourages to generate videos that are closely linked to the text `prompt`,\n',
						'                usually at the expense of lower video quality.\n',
						'            negative_prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts not to guide the video generation. If not defined, one has to pass\n',
						'                `negative_prompt_embeds` instead. Ignored when not using guidance (i.e., ignored if `guidance_scale` is\n',
						'                less than `1`).\n',
						'            eta (`float`, *optional*, defaults to 0.0):\n',
						'                Corresponds to parameter eta (η) in the DDIM paper: https://arxiv.org/abs/2010.02502. Only applies to\n',
						'                [`schedulers.DDIMScheduler`], will be ignored for others.\n',
						'            generator (`torch.Generator` or `List[torch.Generator]`, *optional*):\n',
						'                One or a list of [torch generator(s)](https://pytorch.org/docs/stable/generated/torch.Generator.html)\n',
						'                to make generation deterministic.\n',
						'            latents (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated noisy latents, sampled from a Gaussian distribution, to be used as inputs for video\n',
						'                generation. Can be used to tweak the same generation with different prompts. If not provided, a latents\n',
						'                tensor will ge generated by sampling using the supplied random `generator`. Latents should be of shape\n',
						'                `(batch_size, num_channel, num_frames, height, width)`.\n',
						'            prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt weighting. If not\n',
						'                provided, text embeddings will be generated from `prompt` input argument.\n',
						'            negative_prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated negative text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt\n',
						'                weighting. If not provided, negative_prompt_embeds will be generated from `negative_prompt` input\n',
						'                argument.\n',
						'            output_type (`str`, *optional*, defaults to `"np"`):\n',
						'                The output format of the generate video. Choose between `torch.FloatTensor` or `np.array`.\n',
						'            return_dict (`bool`, *optional*, defaults to `True`):\n',
						'                Whether or not to return a [`~pipelines.stable_diffusion.TextToVideoSDPipelineOutput`] instead of a\n',
						'                plain tuple.\n',
						'            callback (`Callable`, *optional*):\n',
						'                A function that will be called every `callback_steps` steps during inference. The function will be\n',
						'                called with the following arguments: `callback(step: int, timestep: int, latents: torch.FloatTensor)`.\n',
						'            callback_steps (`int`, *optional*, defaults to 1):\n',
						'                The frequency at which the `callback` function will be called. If not specified, the callback will be\n',
						'                called at every step.\n',
						'\n',
						'        Returns:\n',
						'            `List[np.ndarray]`: generated video frames\n',
						'        """\n',
						'\n',
						'        num_images_per_prompt = 1\n',
						'\n',
						'        # 1. Check inputs. Raise error if not correct\n',
						'        self.check_inputs(\n',
						'            prompt,\n',
						'            callback_steps,\n',
						'            negative_prompt,\n',
						'            prompt_embeds,\n',
						'            negative_prompt_embeds,\n',
						'        )\n',
						'\n',
						'        # 2. Define call parameters\n',
						'        if prompt is not None and isinstance(prompt, str):\n',
						'            batch_size = 1\n',
						'        elif prompt is not None and isinstance(prompt, list):\n',
						'            batch_size = len(prompt)\n',
						'        else:\n',
						'            batch_size = prompt_embeds.shape[0]\n',
						'\n',
						'        # here `guidance_scale` is defined analog to the guidance weight `w` of equation (2)\n',
						'        # of the Imagen paper: https://arxiv.org/pdf/2205.11487.pdf . `guidance_scale = 1`\n',
						'        # corresponds to doing no classifier free guidance.\n',
						'        do_classifier_free_guidance = guidance_scale > 1.0\n',
						'\n',
						'        # 3. Encode input prompt\n',
						'        prompt_embeds = self._encode_prompt(\n',
						'            prompt,\n',
						'            num_images_per_prompt,\n',
						'            do_classifier_free_guidance,\n',
						'            negative_prompt,\n',
						'            prompt_embeds=prompt_embeds,\n',
						'            negative_prompt_embeds=negative_prompt_embeds,\n',
						'        )\n',
						'\n',
						'        # 4. Prepare timesteps\n',
						'        self.scheduler.set_timesteps(num_inference_steps)\n',
						'        timesteps = self.scheduler.timesteps\n',
						'\n',
						'        # 5. Prepare latent variables\n',
						'        num_channels_latents = self.unet_in_channels\n',
						'        latents = self.prepare_latents(\n',
						'            batch_size * num_images_per_prompt,\n',
						'            num_channels_latents,\n',
						'            prompt_embeds.dtype,\n',
						'            generator,\n',
						'            latents,\n',
						'        )\n',
						'\n',
						'        # 6. Prepare extra step kwargs. TODO: Logic should ideally just be moved out of the pipeline\n',
						'        extra_step_kwargs = {"generator": generator, "eta": eta}\n',
						'\n',
						'        # 7. Denoising loop\n',
						'        num_warmup_steps = len(timesteps) - num_inference_steps * self.scheduler.order\n',
						'        with self.progress_bar(total=num_inference_steps) as progress_bar:\n',
						'            for i, t in enumerate(timesteps):\n',
						'                # expand the latents if we are doing classifier free guidance\n',
						'                latent_model_input = torch.cat([latents] * 2) if do_classifier_free_guidance else latents\n',
						'                latent_model_input = self.scheduler.scale_model_input(latent_model_input, t)\n',
						'\n',
						'                # predict the noise residual\n',
						'                noise_pred = self.unet(\n',
						'                    {\n',
						'                        "sample": latent_model_input,\n',
						'                        "timestep": t,\n',
						'                        "encoder_hidden_states": prompt_embeds,\n',
						'                    }\n',
						'                )[0]\n',
						'                noise_pred = torch.tensor(noise_pred)\n',
						'\n',
						'                # perform guidance\n',
						'                if do_classifier_free_guidance:\n',
						'                    noise_pred_uncond, noise_pred_text = noise_pred.chunk(2)\n',
						'                    noise_pred = noise_pred_uncond + guidance_scale * (noise_pred_text - noise_pred_uncond)\n',
						'\n',
						'                # reshape latents\n',
						'                bsz, channel, frames, width, height = latents.shape\n',
						'                latents = latents.permute(0, 2, 1, 3, 4).reshape(bsz * frames, channel, width, height)\n',
						'                noise_pred = noise_pred.permute(0, 2, 1, 3, 4).reshape(bsz * frames, channel, width, height)\n',
						'\n',
						'                # compute the previous noisy sample x_t -> x_t-1\n',
						'                latents = self.scheduler.step(noise_pred, t, latents, **extra_step_kwargs).prev_sample\n',
						'\n',
						'                # reshape latents back\n',
						'                latents = latents[None, :].reshape(bsz, frames, channel, width, height).permute(0, 2, 1, 3, 4)\n',
						'\n',
						'                # call the callback, if provided\n',
						'                if i == len(timesteps) - 1 or ((i + 1) > num_warmup_steps and (i + 1) % self.scheduler.order == 0):\n',
						'                    progress_bar.update()\n',
						'                    if callback is not None and i % callback_steps == 0:\n',
						'                        callback(i, t, latents)\n',
						'\n',
						'        video_tensor = self.decode_latents(latents)\n',
						'\n',
						'        if output_type == "pt":\n',
						'            video = video_tensor\n',
						'        else:\n',
						'            video = tensor2vid(video_tensor)\n',
						'\n',
						'        if not return_dict:\n',
						'            return (video,)\n',
						'\n',
						'        return {"frames": video}\n',
						'\n',
						'    # Copied from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion.StableDiffusionPipeline._encode_prompt\n',
						'    def _encode_prompt(\n',
						'        self,\n',
						'        prompt,\n',
						'        num_images_per_prompt,\n',
						'        do_classifier_free_guidance,\n',
						'        negative_prompt=None,\n',
						'        prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        negative_prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'    ):\n',
						'        r"""\n',
						'        Encodes the prompt into text encoder hidden states.\n',
						'\n',
						'        Args:\n',
						'             prompt (`str` or `List[str]`, *optional*):\n',
						'                prompt to be encoded\n',
						'            num_images_per_prompt (`int`):\n',
						'                number of images that should be generated per prompt\n',
						'            do_classifier_free_guidance (`bool`):\n',
						'                whether to use classifier free guidance or not\n',
						'            negative_prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts not to guide the image generation. If not defined, one has to pass\n',
						'                `negative_prompt_embeds` instead. Ignored when not using guidance (i.e., ignored if `guidance_scale` is\n',
						'                less than `1`).\n',
						'            prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt weighting. If not\n',
						'                provided, text embeddings will be generated from `prompt` input argument.\n',
						'            negative_prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated negative text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt\n',
						'                weighting. If not provided, negative_prompt_embeds will be generated from `negative_prompt` input\n',
						'                argument.\n',
						'        """\n',
						'        if prompt is not None and isinstance(prompt, str):\n',
						'            batch_size = 1\n',
						'        elif prompt is not None and isinstance(prompt, list):\n',
						'            batch_size = len(prompt)\n',
						'        else:\n',
						'            batch_size = prompt_embeds.shape[0]\n',
						'\n',
						'        if prompt_embeds is None:\n',
						'            text_inputs = self.tokenizer(\n',
						'                prompt,\n',
						'                padding="max_length",\n',
						'                max_length=self.tokenizer.model_max_length,\n',
						'                truncation=True,\n',
						'                return_tensors="pt",\n',
						'            )\n',
						'            text_input_ids = text_inputs.input_ids\n',
						'            untruncated_ids = self.tokenizer(prompt, padding="longest", return_tensors="pt").input_ids\n',
						'\n',
						'            if untruncated_ids.shape[-1] >= text_input_ids.shape[-1] and not torch.equal(text_input_ids, untruncated_ids):\n',
						'                removed_text = self.tokenizer.batch_decode(untruncated_ids[:, self.tokenizer.model_max_length - 1 : -1])\n',
						'                print(\n',
						'                    "The following part of your input was truncated because CLIP can only handle sequences up to"\n',
						'                    f" {self.tokenizer.model_max_length} tokens: {removed_text}"\n',
						'                )\n',
						'\n',
						'            prompt_embeds = self.text_encoder(text_input_ids)\n',
						'            prompt_embeds = prompt_embeds[0]\n',
						'            prompt_embeds = torch.tensor(prompt_embeds)\n',
						'\n',
						'        bs_embed, seq_len, _ = prompt_embeds.shape\n',
						'        # duplicate text embeddings for each generation per prompt, using mps friendly method\n',
						'        prompt_embeds = prompt_embeds.repeat(1, num_images_per_prompt, 1)\n',
						'        prompt_embeds = prompt_embeds.view(bs_embed * num_images_per_prompt, seq_len, -1)\n',
						'\n',
						'        # get unconditional embeddings for classifier free guidance\n',
						'        if do_classifier_free_guidance and negative_prompt_embeds is None:\n',
						'            uncond_tokens: List[str]\n',
						'            if negative_prompt is None:\n',
						'                uncond_tokens = [""] * batch_size\n',
						'            elif type(prompt) is not type(negative_prompt):\n',
						'                raise TypeError(f"`negative_prompt` should be the same type to `prompt`, but got {type(negative_prompt)} !=" f" {type(prompt)}.")\n',
						'            elif isinstance(negative_prompt, str):\n',
						'                uncond_tokens = [negative_prompt]\n',
						'            elif batch_size != len(negative_prompt):\n',
						'                raise ValueError(\n',
						'                    f"`negative_prompt`: {negative_prompt} has batch size {len(negative_prompt)}, but `prompt`:"\n',
						'                    f" {prompt} has batch size {batch_size}. Please make sure that passed `negative_prompt` matches"\n',
						'                    " the batch size of `prompt`."\n',
						'                )\n',
						'            else:\n',
						'                uncond_tokens = negative_prompt\n',
						'\n',
						'            max_length = prompt_embeds.shape[1]\n',
						'            uncond_input = self.tokenizer(\n',
						'                uncond_tokens,\n',
						'                padding="max_length",\n',
						'                max_length=max_length,\n',
						'                truncation=True,\n',
						'                return_tensors="pt",\n',
						'            )\n',
						'\n',
						'            negative_prompt_embeds = self.text_encoder(uncond_input.input_ids)\n',
						'            negative_prompt_embeds = negative_prompt_embeds[0]\n',
						'            negative_prompt_embeds = torch.tensor(negative_prompt_embeds)\n',
						'\n',
						'        if do_classifier_free_guidance:\n',
						'            # duplicate unconditional embeddings for each generation per prompt, using mps friendly method\n',
						'            seq_len = negative_prompt_embeds.shape[1]\n',
						'\n',
						'            negative_prompt_embeds = negative_prompt_embeds.repeat(1, num_images_per_prompt, 1)\n',
						'            negative_prompt_embeds = negative_prompt_embeds.view(batch_size * num_images_per_prompt, seq_len, -1)\n',
						'\n',
						'            # For classifier free guidance, we need to do two forward passes.\n',
						'            # Here we concatenate the unconditional and text embeddings into a single batch\n',
						'            # to avoid doing two forward passes\n',
						'            prompt_embeds = torch.cat([negative_prompt_embeds, prompt_embeds])\n',
						'\n',
						'        return prompt_embeds\n',
						'\n',
						'    def prepare_latents(\n',
						'        self,\n',
						'        batch_size,\n',
						'        num_channels_latents,\n',
						'        dtype,\n',
						'        generator,\n',
						'        latents=None,\n',
						'    ):\n',
						'        shape = (\n',
						'            batch_size,\n',
						'            num_channels_latents,\n',
						'            self.num_frames,\n',
						'            self.height // self.vae_scale_factor,\n',
						'            self.width // self.vae_scale_factor,\n',
						'        )\n',
						'        if isinstance(generator, list) and len(generator) != batch_size:\n',
						'            raise ValueError(\n',
						'                f"You have passed a list of generators of length {len(generator)}, but requested an effective batch"\n',
						'                f" size of {batch_size}. Make sure the batch size matches the length of the generators."\n',
						'            )\n',
						'\n',
						'        if latents is None:\n',
						'            latents = randn_tensor(shape, generator=generator, dtype=dtype)\n',
						'\n',
						'        # scale the initial noise by the standard deviation required by the scheduler\n',
						'        latents = latents * self.scheduler.init_noise_sigma\n',
						'        return latents\n',
						'\n',
						'    def check_inputs(\n',
						'        self,\n',
						'        prompt,\n',
						'        callback_steps,\n',
						'        negative_prompt=None,\n',
						'        prompt_embeds=None,\n',
						'        negative_prompt_embeds=None,\n',
						'    ):\n',
						'        if self.height % 8 != 0 or self.width % 8 != 0:\n',
						'            raise ValueError(f"`height` and `width` have to be divisible by 8 but are {self.height} and {self.width}.")\n',
						'\n',
						'        if (callback_steps is None) or (callback_steps is not None and (not isinstance(callback_steps, int) or callback_steps <= 0)):\n',
						'            raise ValueError(f"`callback_steps` has to be a positive integer but is {callback_steps} of type" f" {type(callback_steps)}.")\n',
						'\n',
						'        if prompt is not None and prompt_embeds is not None:\n',
						'            raise ValueError(\n',
						'                f"Cannot forward both `prompt`: {prompt} and `prompt_embeds`: {prompt_embeds}. Please make sure to" " only forward one of the two."\n',
						'            )\n',
						'        elif prompt is None and prompt_embeds is None:\n',
						'            raise ValueError("Provide either `prompt` or `prompt_embeds`. Cannot leave both `prompt` and `prompt_embeds` undefined.")\n',
						'        elif prompt is not None and (not isinstance(prompt, str) and not isinstance(prompt, list)):\n',
						'            raise ValueError(f"`prompt` has to be of type `str` or `list` but is {type(prompt)}")\n',
						'\n',
						'        if negative_prompt is not None and negative_prompt_embeds is not None:\n',
						'            raise ValueError(\n',
						'                f"Cannot forward both `negative_prompt`: {negative_prompt} and `negative_prompt_embeds`:"\n',
						'                f" {negative_prompt_embeds}. Please make sure to only forward one of the two."\n',
						'            )\n',
						'\n',
						'        if prompt_embeds is not None and negative_prompt_embeds is not None:\n',
						'            if prompt_embeds.shape != negative_prompt_embeds.shape:\n',
						'                raise ValueError(\n',
						'                    "`prompt_embeds` and `negative_prompt_embeds` must have the same shape when passed directly, but"\n',
						'                    f" got: `prompt_embeds` {prompt_embeds.shape} != `negative_prompt_embeds`"\n',
						'                    f" {negative_prompt_embeds.shape}."\n',
						'                )\n',
						'\n',
						'    def decode_latents(self, latents):\n',
						'        scale_factor = 0.18215\n',
						'        latents = 1 / scale_factor * latents\n',
						'\n',
						'        batch_size, channels, num_frames, height, width = latents.shape\n',
						'        latents = latents.permute(0, 2, 1, 3, 4).reshape(batch_size * num_frames, channels, height, width)\n',
						'        image = self.vae_decoder(latents)[0]\n',
						'        image = torch.tensor(image)\n',
						'        video = (\n',
						'            image[None, :]\n',
						'            .reshape(\n',
						'                (\n',
						'                    batch_size,\n',
						'                    num_frames,\n',
						'                    -1,\n',
						'                )\n',
						'                + image.shape[2:]\n',
						'            )\n',
						'            .permute(0, 2, 1, 3, 4)\n',
						'        )\n',
						'        # we always cast to float32 as this does not cause significant overhead and is compatible with bfloat16\n',
						'        video = video.float()\n',
						'        return video'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Inference with OpenVINO\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'core = ov.Core()'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'open("notebook_utils.py", "w").write(r.text)\n',
						'\n',
						'from notebook_utils import device_widget\n',
						'\n',
						'device = device_widget()\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_unet = core.compile_model(unet_xml_path, device_name=device.value)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_vae_decoder = core.compile_model(vae_decoder_xml_path, device_name=device.value)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_text_encoder = core.compile_model(text_encoder_xml, device_name=device.value)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Here we replace the pipeline parts with versions converted to OpenVINO IR and compiled to specific device. Note that we use original pipeline tokenizer and scheduler.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'ov_pipe = OVTextToVideoSDPipeline(ov_vae_decoder, ov_text_encoder, tokenizer, ov_unet, scheduler)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Define a prompt\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'prompt = "A panda eating bamboo on a rock."'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Let\'s generate a video for our prompt. For full list of arguments, see `__call__` function definition of `OVTextToVideoSDPipeline` class in [Build a pipeline](#Build-a-pipeline) section.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Video generation\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'frames = ov_pipe(prompt, num_inference_steps=25)["frames"]'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'images = [PIL.Image.fromarray(frame) for frame in frames]\n',
						'images[0].save("output.gif", save_all=True, append_images=images[1:], duration=125, loop=0)\n',
						'with open("output.gif", "rb") as gif_file:\n',
						'    b64 = f"data:image/gif;base64,{base64.b64encode(gif_file.read()).decode()}"\n',
						`IPython.display.HTML(f'<img src="{b64}" />')`
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Interactive demo\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'test_replace': {
							'    demo.queue().launch(debug=True)': '    demo.queue.launch()',
							'    demo.queue().launch(share=True, debug=True)': '    demo.queue().launch(share=True)'
						}
					},
					'source': [
						'def generate(prompt, seed, num_inference_steps, _=gr.Progress(track_tqdm=True)):\n',
						'    generator = torch.Generator().manual_seed(seed)\n',
						'    frames = ov_pipe(\n',
						'        prompt,\n',
						'        num_inference_steps=num_inference_steps,\n',
						'        generator=generator,\n',
						'    )["frames"]\n',
						'    out_file = tempfile.NamedTemporaryFile(suffix=".gif", delete=False)\n',
						'    images = [PIL.Image.fromarray(frame) for frame in frames]\n',
						'    images[0].save(out_file, save_all=True, append_images=images[1:], duration=125, loop=0)\n',
						'    return out_file.name'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'outputs': [],
					'source': [
						'if not Path("gradio_helper.py").exists():\n',
						'    r = requests.get(url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/notebooks/zeroscope-text2video/gradio_helper.py")\n',
						'    open("gradio_helper.py", "w").write(r.text)\n',
						'\n',
						'from gradio_helper import make_demo\n',
						'\n',
						'demo = make_demo(fn=generate)\n',
						'\n',
						'try:\n',
						'    demo.queue().launch(debug=True)\n',
						'except Exception:\n',
						'    demo.queue().launch(share=True, debug=True)\n',
						'# If you are launching remotely, specify server_name and server_port\n',
						'# EXAMPLE: `demo.launch(server_name=\'your server name\', server_port=\'server port in int\')`\n',
						'# To learn more please refer to the Gradio docs: https://gradio.app/docs/'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'# please uncomment and run this cell for stopping gradio interface\n',
						'# demo.close()'
					]
				}
			].map(fromJupyterCell)
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 },
			{ modified: 7, original: 7 },
			{ modified: 8, original: 8 },
			{ modified: 9, original: 9 },
			{ modified: 10, original: 10 },
			{ modified: 11, original: 11 },
			{ modified: 12, original: 12 },
			{ modified: 13, original: 13 },
			{ modified: 14, original: 14 },
			{ modified: 15, original: 15 },
			{ modified: 16, original: 16 },
			{ modified: 17, original: 17 },
			{ modified: 18, original: 18 },
			{ modified: 19, original: 19 },
			{ modified: 20, original: 20 },
			{ modified: 21, original: 21 },
			{ modified: 22, original: 22 },
			{ modified: 23, original: 23 },
			{ modified: 24, original: 24 },
			{ modified: 25, original: 25 },
			{ modified: 26, original: 26 },
			{ modified: 27, original: 27 },
			{ modified: 28, original: 28 },
			{ modified: 29, original: 29 },
			{ modified: 30, original: 30 },
			{ modified: 31, original: 31 },
			{ modified: 32, original: 32 },
			{ modified: 33, original: 33 },
			{ modified: 34, original: 34 },
			{ modified: 35, original: 35 },
			{ modified: 36, original: 36 },
			{ modified: 37, original: 37 },
			{ modified: 38, original: 38 },
			{ modified: 39, original: 39 },
			{ modified: 40, original: 40 },
			{ modified: 41, original: 41 },
			{ modified: 42, original: 42 },
			{ modified: 43, original: 43 },
			{ modified: 44, original: 44 },
			{ modified: 45, original: 45 },
			{ modified: 46, original: 46 },
			{ modified: 47, original: 47 },
			{ modified: 48, original: 48 },
			{ modified: 49, original: 49 },
			{ modified: 50, original: -1 },
			{ modified: 51, original: -1 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 49, originalLength: 1, modifiedStart: 49, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 50, originalLength: 0, modifiedStart: 50, modifiedLength: 2 } satisfies IDiffChange,
		]);
	});
	test('Modification of three cells', async () => {
		const { mapping, diff } = await mapCells(
			[
				{
					'cell_type': 'markdown',
					'source': [
						'# Video generation with ZeroScope and OpenVINO\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Install and import required packages](#Install-and-import-required-packages)\n',
						'- [Load the model](#Load-the-model)\n',
						'- [Convert the model](#Convert-the-model)\n',
						'    - [Define the conversion function](#Define-the-conversion-function)\n',
						'    - [UNet](#UNet)\n',
						'    - [VAE](#VAE)\n',
						'    - [Text encoder](#Text-encoder)\n',
						'- [Build a pipeline](#Build-a-pipeline)\n',
						'- [Inference with OpenVINO](#Inference-with-OpenVINO)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Define a prompt](#Define-a-prompt)\n',
						'    - [Video generation](#Video-generation)\n',
						'- [Interactive demo](#Interactive-demo)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/zeroscope-text2video/zeroscope-text2video.ipynb" />\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The ZeroScope model is a free and open-source text-to-video model that can generate realistic and engaging videos from text descriptions. It is based on the [Modelscope](https://modelscope.cn/models/damo/text-to-video-synthesis/summary) model, but it has been improved to produce higher-quality videos with a 16:9 aspect ratio and no Shutterstock watermark. The ZeroScope model is available in two versions: ZeroScope_v2 576w, which is optimized for rapid content creation at a resolution of 576x320 pixels, and ZeroScope_v2 XL, which upscales videos to a high-definition resolution of 1024x576.\n',
						'\n',
						'The ZeroScope model is trained on a dataset of over 9,000 videos and 29,000 tagged frames. It uses a diffusion model to generate videos, which means that it starts with a random noise image and gradually adds detail to it until it matches the text description. The ZeroScope model is still under development, but it has already been used to create some impressive videos. For example, it has been used to create videos of people dancing, playing sports, and even driving cars.\n',
						'\n',
						'The ZeroScope model is a powerful tool that can be used to create various videos, from simple animations to complex scenes. It is still under development, but it has the potential to revolutionize the way we create and consume video content.\n',
						'\n',
						'Both versions of the ZeroScope model are available on Hugging Face:\n',
						' - [ZeroScope_v2 576w](https://huggingface.co/cerspense/zeroscope_v2_576w)\n',
						' - [ZeroScope_v2 XL](https://huggingface.co/cerspense/zeroscope_v2_XL)\n',
						'\n',
						'We will use the first one.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'<div class="alert alert-block alert-warning">\n',
						'    This tutorial requires at least 24GB of free memory to generate a video with a frame size of 432x240 and 16 frames. Increasing either of these values will require more memory and take more time.\n',
						'</div>'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Install and import required packages\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'To work with text-to-video synthesis model, we will use Hugging Face\'s [Diffusers](https://github.com/huggingface/diffusers) library. It provides already pretrained model from `cerspense`.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install -q --extra-index-url https://download.pytorch.org/whl/cpu  "diffusers>=0.18.0" "torch>=2.1" transformers "openvino>=2023.1.0" numpy "gradio>=4.19"'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import gc\n',
						'from typing import Optional, Union, List, Callable\n',
						'import base64\n',
						'import tempfile\n',
						'import warnings\n',
						'\n',
						'import diffusers\n',
						'import transformers\n',
						'import numpy as np\n',
						'import IPython\n',
						'import ipywidgets as widgets\n',
						'import torch\n',
						'import PIL\n',
						'import gradio as gr\n',
						'\n',
						'import openvino as ov'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						`Original 576x320 inference requires a lot of RAM (>100GB), so let's run our example on a smaller frame size, keeping the same aspect ratio. Try reducing values below to reduce the memory consumption.`
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'WIDTH = 432  # must be divisible by 8\n',
						'HEIGHT = 240  # must be divisible by 8\n',
						'NUM_FRAMES = 16'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The model is loaded from HuggingFace using `.from_pretrained` method of `diffusers.DiffusionPipeline`.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'pipe = diffusers.DiffusionPipeline.from_pretrained("cerspense/zeroscope_v2_576w")'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'unet = pipe.unet\n',
						'unet.eval()\n',
						'vae = pipe.vae\n',
						'vae.eval()\n',
						'text_encoder = pipe.text_encoder\n',
						'text_encoder.eval()\n',
						'tokenizer = pipe.tokenizer\n',
						'scheduler = pipe.scheduler\n',
						'vae_scale_factor = pipe.vae_scale_factor\n',
						'unet_in_channels = pipe.unet.config.in_channels\n',
						'sample_width = WIDTH // vae_scale_factor\n',
						'sample_height = HEIGHT // vae_scale_factor\n',
						'del pipe\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Convert the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						`The architecture for generating videos from text comprises three distinct sub-networks: one for extracting text features, another for translating text features into the video latent space using a diffusion model, and a final one for mapping the video latent space to the visual space. The collective parameters of the entire model amount to approximately 1.7 billion. It's capable of processing English input. The diffusion model is built upon the Unet3D model and achieves video generation by iteratively denoising a starting point of pure Gaussian noise video.`
					]
				},
				{
					'cell_type': 'markdown',
					'source': []
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Define the conversion function\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Model components are PyTorch modules, that can be converted with `ov.convert_model` function directly. We also use `ov.save_model` function to serialize the result of conversion.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'warnings.filterwarnings("ignore", category=torch.jit.TracerWarning)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'from pathlib import Path\n',
						'\n',
						'\n',
						'def convert(model: torch.nn.Module, xml_path: str, **convert_kwargs) -> Path:\n',
						'    xml_path = Path(xml_path)\n',
						'    if not xml_path.exists():\n',
						'        xml_path.parent.mkdir(parents=True, exist_ok=True)\n',
						'        with torch.no_grad():\n',
						'            converted_model = ov.convert_model(model, **convert_kwargs)\n',
						'        ov.save_model(converted_model, xml_path)\n',
						'        del converted_model\n',
						'        gc.collect()\n',
						'        torch._C._jit_clear_class_registry()\n',
						'        torch.jit._recursive.concrete_type_store = torch.jit._recursive.ConcreteTypeStore()\n',
						'        torch.jit._state._clear_class_state()\n',
						'    return xml_path'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### UNet\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Text-to-video generation pipeline main component is a conditional 3D UNet model that takes a noisy sample, conditional state, and a timestep and returns a sample shaped output.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'unet_xml_path = convert(\n',
						'    unet,\n',
						'    "models/unet.xml",\n',
						'    example_input={\n',
						'        "sample": torch.randn(2, 4, 2, int(sample_height // 2), int(sample_width // 2)),\n',
						'        "timestep": torch.tensor(1),\n',
						'        "encoder_hidden_states": torch.randn(2, 77, 1024),\n',
						'    },\n',
						'    input=[\n',
						'        ("sample", (2, 4, NUM_FRAMES, sample_height, sample_width)),\n',
						'        ("timestep", ()),\n',
						'        ("encoder_hidden_states", (2, 77, 1024)),\n',
						'    ],\n',
						')\n',
						'del unet\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### VAE\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Variational autoencoder (VAE) uses UNet output to decode latents to visual representations. Our VAE model has KL loss for encoding images into latents and decoding latent representations into images. For inference, we need only decoder part.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'class VaeDecoderWrapper(torch.nn.Module):\n',
						'    def __init__(self, vae):\n',
						'        super().__init__()\n',
						'        self.vae = vae\n',
						'\n',
						'    def forward(self, z: torch.FloatTensor):\n',
						'        return self.vae.decode(z)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'vae_decoder_xml_path = convert(\n',
						'    VaeDecoderWrapper(vae),\n',
						'    "models/vae.xml",\n',
						'    example_input=torch.randn(2, 4, 32, 32),\n',
						'    input=((NUM_FRAMES, 4, sample_height, sample_width)),\n',
						')\n',
						'del vae\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Text encoder\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Text encoder is used to encode the input prompt to tensor. Default tensor length is 77.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'text_encoder_xml = convert(\n',
						'    text_encoder,\n',
						'    "models/text_encoder.xml",\n',
						'    example_input=torch.ones(1, 77, dtype=torch.int64),\n',
						'    input=((1, 77), ov.Type.i64),\n',
						')\n',
						'del text_encoder\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Build a pipeline\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def tensor2vid(video: torch.Tensor, mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]) -> List[np.ndarray]:\n',
						'    # This code is copied from https://github.com/modelscope/modelscope/blob/1509fdb973e5871f37148a4b5e5964cafd43e64d/modelscope/pipelines/multi_modal/text_to_video_synthesis_pipeline.py#L78\n',
						'    # reshape to ncfhw\n',
						'    mean = torch.tensor(mean, device=video.device).reshape(1, -1, 1, 1, 1)\n',
						'    std = torch.tensor(std, device=video.device).reshape(1, -1, 1, 1, 1)\n',
						'    # unnormalize back to [0,1]\n',
						'    video = video.mul_(std).add_(mean)\n',
						'    video.clamp_(0, 1)\n',
						'    # prepare the final outputs\n',
						'    i, c, f, h, w = video.shape\n',
						'    images = video.permute(2, 3, 0, 4, 1).reshape(f, h, i * w, c)  # 1st (frames, h, batch_size, w, c) 2nd (frames, h, batch_size * w, c)\n',
						'    images = images.unbind(dim=0)  # prepare a list of indvidual (consecutive frames)\n',
						'    images = [(image.cpu().numpy() * 255).astype("uint8") for image in images]  # f h w c\n',
						'    return images'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'try:\n',
						'    from diffusers.utils import randn_tensor\n',
						'except ImportError:\n',
						'    from diffusers.utils.torch_utils import randn_tensor\n',
						'\n',
						'\n',
						'class OVTextToVideoSDPipeline(diffusers.DiffusionPipeline):\n',
						'    def __init__(\n',
						'        self,\n',
						'        vae_decoder: ov.CompiledModel,\n',
						'        text_encoder: ov.CompiledModel,\n',
						'        tokenizer: transformers.CLIPTokenizer,\n',
						'        unet: ov.CompiledModel,\n',
						'        scheduler: diffusers.schedulers.DDIMScheduler,\n',
						'    ):\n',
						'        super().__init__()\n',
						'\n',
						'        self.vae_decoder = vae_decoder\n',
						'        self.text_encoder = text_encoder\n',
						'        self.tokenizer = tokenizer\n',
						'        self.unet = unet\n',
						'        self.scheduler = scheduler\n',
						'        self.vae_scale_factor = vae_scale_factor\n',
						'        self.unet_in_channels = unet_in_channels\n',
						'        self.width = WIDTH\n',
						'        self.height = HEIGHT\n',
						'        self.num_frames = NUM_FRAMES\n',
						'\n',
						'    def __call__(\n',
						'        self,\n',
						'        prompt: Union[str, List[str]] = None,\n',
						'        num_inference_steps: int = 50,\n',
						'        guidance_scale: float = 9.0,\n',
						'        negative_prompt: Optional[Union[str, List[str]]] = None,\n',
						'        eta: float = 0.0,\n',
						'        generator: Optional[Union[torch.Generator, List[torch.Generator]]] = None,\n',
						'        latents: Optional[torch.FloatTensor] = None,\n',
						'        prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        negative_prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        output_type: Optional[str] = "np",\n',
						'        return_dict: bool = True,\n',
						'        callback: Optional[Callable[[int, int, torch.FloatTensor], None]] = None,\n',
						'        callback_steps: int = 1,\n',
						'    ):\n',
						'        r"""\n',
						'        Function invoked when calling the pipeline for generation.\n',
						'\n',
						'        Args:\n',
						'            prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts to guide the video generation. If not defined, one has to pass `prompt_embeds`.\n',
						'                instead.\n',
						'            num_inference_steps (`int`, *optional*, defaults to 50):\n',
						'                The number of denoising steps. More denoising steps usually lead to a higher quality videos at the\n',
						'                expense of slower inference.\n',
						'            guidance_scale (`float`, *optional*, defaults to 7.5):\n',
						'                Guidance scale as defined in [Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598).\n',
						'                `guidance_scale` is defined as `w` of equation 2. of [Imagen\n',
						'                Paper](https://arxiv.org/pdf/2205.11487.pdf). Guidance scale is enabled by setting `guidance_scale >\n',
						'                1`. Higher guidance scale encourages to generate videos that are closely linked to the text `prompt`,\n',
						'                usually at the expense of lower video quality.\n',
						'            negative_prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts not to guide the video generation. If not defined, one has to pass\n',
						'                `negative_prompt_embeds` instead. Ignored when not using guidance (i.e., ignored if `guidance_scale` is\n',
						'                less than `1`).\n',
						'            eta (`float`, *optional*, defaults to 0.0):\n',
						'                Corresponds to parameter eta (η) in the DDIM paper: https://arxiv.org/abs/2010.02502. Only applies to\n',
						'                [`schedulers.DDIMScheduler`], will be ignored for others.\n',
						'            generator (`torch.Generator` or `List[torch.Generator]`, *optional*):\n',
						'                One or a list of [torch generator(s)](https://pytorch.org/docs/stable/generated/torch.Generator.html)\n',
						'                to make generation deterministic.\n',
						'            latents (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated noisy latents, sampled from a Gaussian distribution, to be used as inputs for video\n',
						'                generation. Can be used to tweak the same generation with different prompts. If not provided, a latents\n',
						'                tensor will ge generated by sampling using the supplied random `generator`. Latents should be of shape\n',
						'                `(batch_size, num_channel, num_frames, height, width)`.\n',
						'            prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt weighting. If not\n',
						'                provided, text embeddings will be generated from `prompt` input argument.\n',
						'            negative_prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated negative text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt\n',
						'                weighting. If not provided, negative_prompt_embeds will be generated from `negative_prompt` input\n',
						'                argument.\n',
						'            output_type (`str`, *optional*, defaults to `"np"`):\n',
						'                The output format of the generate video. Choose between `torch.FloatTensor` or `np.array`.\n',
						'            return_dict (`bool`, *optional*, defaults to `True`):\n',
						'                Whether or not to return a [`~pipelines.stable_diffusion.TextToVideoSDPipelineOutput`] instead of a\n',
						'                plain tuple.\n',
						'            callback (`Callable`, *optional*):\n',
						'                A function that will be called every `callback_steps` steps during inference. The function will be\n',
						'                called with the following arguments: `callback(step: int, timestep: int, latents: torch.FloatTensor)`.\n',
						'            callback_steps (`int`, *optional*, defaults to 1):\n',
						'                The frequency at which the `callback` function will be called. If not specified, the callback will be\n',
						'                called at every step.\n',
						'\n',
						'        Returns:\n',
						'            `List[np.ndarray]`: generated video frames\n',
						'        """\n',
						'\n',
						'        num_images_per_prompt = 1\n',
						'\n',
						'        # 1. Check inputs. Raise error if not correct\n',
						'        self.check_inputs(\n',
						'            prompt,\n',
						'            callback_steps,\n',
						'            negative_prompt,\n',
						'            prompt_embeds,\n',
						'            negative_prompt_embeds,\n',
						'        )\n',
						'\n',
						'        # 2. Define call parameters\n',
						'        if prompt is not None and isinstance(prompt, str):\n',
						'            batch_size = 1\n',
						'        elif prompt is not None and isinstance(prompt, list):\n',
						'            batch_size = len(prompt)\n',
						'        else:\n',
						'            batch_size = prompt_embeds.shape[0]\n',
						'\n',
						'        # here `guidance_scale` is defined analog to the guidance weight `w` of equation (2)\n',
						'        # of the Imagen paper: https://arxiv.org/pdf/2205.11487.pdf . `guidance_scale = 1`\n',
						'        # corresponds to doing no classifier free guidance.\n',
						'        do_classifier_free_guidance = guidance_scale > 1.0\n',
						'\n',
						'        # 3. Encode input prompt\n',
						'        prompt_embeds = self._encode_prompt(\n',
						'            prompt,\n',
						'            num_images_per_prompt,\n',
						'            do_classifier_free_guidance,\n',
						'            negative_prompt,\n',
						'            prompt_embeds=prompt_embeds,\n',
						'            negative_prompt_embeds=negative_prompt_embeds,\n',
						'        )\n',
						'\n',
						'        # 4. Prepare timesteps\n',
						'        self.scheduler.set_timesteps(num_inference_steps)\n',
						'        timesteps = self.scheduler.timesteps\n',
						'\n',
						'        # 5. Prepare latent variables\n',
						'        num_channels_latents = self.unet_in_channels\n',
						'        latents = self.prepare_latents(\n',
						'            batch_size * num_images_per_prompt,\n',
						'            num_channels_latents,\n',
						'            prompt_embeds.dtype,\n',
						'            generator,\n',
						'            latents,\n',
						'        )\n',
						'\n',
						'        # 6. Prepare extra step kwargs. TODO: Logic should ideally just be moved out of the pipeline\n',
						'        extra_step_kwargs = {"generator": generator, "eta": eta}\n',
						'\n',
						'        # 7. Denoising loop\n',
						'        num_warmup_steps = len(timesteps) - num_inference_steps * self.scheduler.order\n',
						'        with self.progress_bar(total=num_inference_steps) as progress_bar:\n',
						'            for i, t in enumerate(timesteps):\n',
						'                # expand the latents if we are doing classifier free guidance\n',
						'                latent_model_input = torch.cat([latents] * 2) if do_classifier_free_guidance else latents\n',
						'                latent_model_input = self.scheduler.scale_model_input(latent_model_input, t)\n',
						'\n',
						'                # predict the noise residual\n',
						'                noise_pred = self.unet(\n',
						'                    {\n',
						'                        "sample": latent_model_input,\n',
						'                        "timestep": t,\n',
						'                        "encoder_hidden_states": prompt_embeds,\n',
						'                    }\n',
						'                )[0]\n',
						'                noise_pred = torch.tensor(noise_pred)\n',
						'\n',
						'                # perform guidance\n',
						'                if do_classifier_free_guidance:\n',
						'                    noise_pred_uncond, noise_pred_text = noise_pred.chunk(2)\n',
						'                    noise_pred = noise_pred_uncond + guidance_scale * (noise_pred_text - noise_pred_uncond)\n',
						'\n',
						'                # reshape latents\n',
						'                bsz, channel, frames, width, height = latents.shape\n',
						'                latents = latents.permute(0, 2, 1, 3, 4).reshape(bsz * frames, channel, width, height)\n',
						'                noise_pred = noise_pred.permute(0, 2, 1, 3, 4).reshape(bsz * frames, channel, width, height)\n',
						'\n',
						'                # compute the previous noisy sample x_t -> x_t-1\n',
						'                latents = self.scheduler.step(noise_pred, t, latents, **extra_step_kwargs).prev_sample\n',
						'\n',
						'                # reshape latents back\n',
						'                latents = latents[None, :].reshape(bsz, frames, channel, width, height).permute(0, 2, 1, 3, 4)\n',
						'\n',
						'                # call the callback, if provided\n',
						'                if i == len(timesteps) - 1 or ((i + 1) > num_warmup_steps and (i + 1) % self.scheduler.order == 0):\n',
						'                    progress_bar.update()\n',
						'                    if callback is not None and i % callback_steps == 0:\n',
						'                        callback(i, t, latents)\n',
						'\n',
						'        video_tensor = self.decode_latents(latents)\n',
						'\n',
						'        if output_type == "pt":\n',
						'            video = video_tensor\n',
						'        else:\n',
						'            video = tensor2vid(video_tensor)\n',
						'\n',
						'        if not return_dict:\n',
						'            return (video,)\n',
						'\n',
						'        return {"frames": video}\n',
						'\n',
						'    # Copied from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion.StableDiffusionPipeline._encode_prompt\n',
						'    def _encode_prompt(\n',
						'        self,\n',
						'        prompt,\n',
						'        num_images_per_prompt,\n',
						'        do_classifier_free_guidance,\n',
						'        negative_prompt=None,\n',
						'        prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        negative_prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'    ):\n',
						'        r"""\n',
						'        Encodes the prompt into text encoder hidden states.\n',
						'\n',
						'        Args:\n',
						'             prompt (`str` or `List[str]`, *optional*):\n',
						'                prompt to be encoded\n',
						'            num_images_per_prompt (`int`):\n',
						'                number of images that should be generated per prompt\n',
						'            do_classifier_free_guidance (`bool`):\n',
						'                whether to use classifier free guidance or not\n',
						'            negative_prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts not to guide the image generation. If not defined, one has to pass\n',
						'                `negative_prompt_embeds` instead. Ignored when not using guidance (i.e., ignored if `guidance_scale` is\n',
						'                less than `1`).\n',
						'            prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt weighting. If not\n',
						'                provided, text embeddings will be generated from `prompt` input argument.\n',
						'            negative_prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated negative text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt\n',
						'                weighting. If not provided, negative_prompt_embeds will be generated from `negative_prompt` input\n',
						'                argument.\n',
						'        """\n',
						'        if prompt is not None and isinstance(prompt, str):\n',
						'            batch_size = 1\n',
						'        elif prompt is not None and isinstance(prompt, list):\n',
						'            batch_size = len(prompt)\n',
						'        else:\n',
						'            batch_size = prompt_embeds.shape[0]\n',
						'\n',
						'        if prompt_embeds is None:\n',
						'            text_inputs = self.tokenizer(\n',
						'                prompt,\n',
						'                padding="max_length",\n',
						'                max_length=self.tokenizer.model_max_length,\n',
						'                truncation=True,\n',
						'                return_tensors="pt",\n',
						'            )\n',
						'            text_input_ids = text_inputs.input_ids\n',
						'            untruncated_ids = self.tokenizer(prompt, padding="longest", return_tensors="pt").input_ids\n',
						'\n',
						'            if untruncated_ids.shape[-1] >= text_input_ids.shape[-1] and not torch.equal(text_input_ids, untruncated_ids):\n',
						'                removed_text = self.tokenizer.batch_decode(untruncated_ids[:, self.tokenizer.model_max_length - 1 : -1])\n',
						'                print(\n',
						'                    "The following part of your input was truncated because CLIP can only handle sequences up to"\n',
						'                    f" {self.tokenizer.model_max_length} tokens: {removed_text}"\n',
						'                )\n',
						'\n',
						'            prompt_embeds = self.text_encoder(text_input_ids)\n',
						'            prompt_embeds = prompt_embeds[0]\n',
						'            prompt_embeds = torch.tensor(prompt_embeds)\n',
						'\n',
						'        bs_embed, seq_len, _ = prompt_embeds.shape\n',
						'        # duplicate text embeddings for each generation per prompt, using mps friendly method\n',
						'        prompt_embeds = prompt_embeds.repeat(1, num_images_per_prompt, 1)\n',
						'        prompt_embeds = prompt_embeds.view(bs_embed * num_images_per_prompt, seq_len, -1)\n',
						'\n',
						'        # get unconditional embeddings for classifier free guidance\n',
						'        if do_classifier_free_guidance and negative_prompt_embeds is None:\n',
						'            uncond_tokens: List[str]\n',
						'            if negative_prompt is None:\n',
						'                uncond_tokens = [""] * batch_size\n',
						'            elif type(prompt) is not type(negative_prompt):\n',
						'                raise TypeError(f"`negative_prompt` should be the same type to `prompt`, but got {type(negative_prompt)} !=" f" {type(prompt)}.")\n',
						'            elif isinstance(negative_prompt, str):\n',
						'                uncond_tokens = [negative_prompt]\n',
						'            elif batch_size != len(negative_prompt):\n',
						'                raise ValueError(\n',
						'                    f"`negative_prompt`: {negative_prompt} has batch size {len(negative_prompt)}, but `prompt`:"\n',
						'                    f" {prompt} has batch size {batch_size}. Please make sure that passed `negative_prompt` matches"\n',
						'                    " the batch size of `prompt`."\n',
						'                )\n',
						'            else:\n',
						'                uncond_tokens = negative_prompt\n',
						'\n',
						'            max_length = prompt_embeds.shape[1]\n',
						'            uncond_input = self.tokenizer(\n',
						'                uncond_tokens,\n',
						'                padding="max_length",\n',
						'                max_length=max_length,\n',
						'                truncation=True,\n',
						'                return_tensors="pt",\n',
						'            )\n',
						'\n',
						'            negative_prompt_embeds = self.text_encoder(uncond_input.input_ids)\n',
						'            negative_prompt_embeds = negative_prompt_embeds[0]\n',
						'            negative_prompt_embeds = torch.tensor(negative_prompt_embeds)\n',
						'\n',
						'        if do_classifier_free_guidance:\n',
						'            # duplicate unconditional embeddings for each generation per prompt, using mps friendly method\n',
						'            seq_len = negative_prompt_embeds.shape[1]\n',
						'\n',
						'            negative_prompt_embeds = negative_prompt_embeds.repeat(1, num_images_per_prompt, 1)\n',
						'            negative_prompt_embeds = negative_prompt_embeds.view(batch_size * num_images_per_prompt, seq_len, -1)\n',
						'\n',
						'            # For classifier free guidance, we need to do two forward passes.\n',
						'            # Here we concatenate the unconditional and text embeddings into a single batch\n',
						'            # to avoid doing two forward passes\n',
						'            prompt_embeds = torch.cat([negative_prompt_embeds, prompt_embeds])\n',
						'\n',
						'        return prompt_embeds\n',
						'\n',
						'    def prepare_latents(\n',
						'        self,\n',
						'        batch_size,\n',
						'        num_channels_latents,\n',
						'        dtype,\n',
						'        generator,\n',
						'        latents=None,\n',
						'    ):\n',
						'        shape = (\n',
						'            batch_size,\n',
						'            num_channels_latents,\n',
						'            self.num_frames,\n',
						'            self.height // self.vae_scale_factor,\n',
						'            self.width // self.vae_scale_factor,\n',
						'        )\n',
						'        if isinstance(generator, list) and len(generator) != batch_size:\n',
						'            raise ValueError(\n',
						'                f"You have passed a list of generators of length {len(generator)}, but requested an effective batch"\n',
						'                f" size of {batch_size}. Make sure the batch size matches the length of the generators."\n',
						'            )\n',
						'\n',
						'        if latents is None:\n',
						'            latents = randn_tensor(shape, generator=generator, dtype=dtype)\n',
						'\n',
						'        # scale the initial noise by the standard deviation required by the scheduler\n',
						'        latents = latents * self.scheduler.init_noise_sigma\n',
						'        return latents\n',
						'\n',
						'    def check_inputs(\n',
						'        self,\n',
						'        prompt,\n',
						'        callback_steps,\n',
						'        negative_prompt=None,\n',
						'        prompt_embeds=None,\n',
						'        negative_prompt_embeds=None,\n',
						'    ):\n',
						'        if self.height % 8 != 0 or self.width % 8 != 0:\n',
						'            raise ValueError(f"`height` and `width` have to be divisible by 8 but are {self.height} and {self.width}.")\n',
						'\n',
						'        if (callback_steps is None) or (callback_steps is not None and (not isinstance(callback_steps, int) or callback_steps <= 0)):\n',
						'            raise ValueError(f"`callback_steps` has to be a positive integer but is {callback_steps} of type" f" {type(callback_steps)}.")\n',
						'\n',
						'        if prompt is not None and prompt_embeds is not None:\n',
						'            raise ValueError(\n',
						'                f"Cannot forward both `prompt`: {prompt} and `prompt_embeds`: {prompt_embeds}. Please make sure to" " only forward one of the two."\n',
						'            )\n',
						'        elif prompt is None and prompt_embeds is None:\n',
						'            raise ValueError("Provide either `prompt` or `prompt_embeds`. Cannot leave both `prompt` and `prompt_embeds` undefined.")\n',
						'        elif prompt is not None and (not isinstance(prompt, str) and not isinstance(prompt, list)):\n',
						'            raise ValueError(f"`prompt` has to be of type `str` or `list` but is {type(prompt)}")\n',
						'\n',
						'        if negative_prompt is not None and negative_prompt_embeds is not None:\n',
						'            raise ValueError(\n',
						'                f"Cannot forward both `negative_prompt`: {negative_prompt} and `negative_prompt_embeds`:"\n',
						'                f" {negative_prompt_embeds}. Please make sure to only forward one of the two."\n',
						'            )\n',
						'\n',
						'        if prompt_embeds is not None and negative_prompt_embeds is not None:\n',
						'            if prompt_embeds.shape != negative_prompt_embeds.shape:\n',
						'                raise ValueError(\n',
						'                    "`prompt_embeds` and `negative_prompt_embeds` must have the same shape when passed directly, but"\n',
						'                    f" got: `prompt_embeds` {prompt_embeds.shape} != `negative_prompt_embeds`"\n',
						'                    f" {negative_prompt_embeds.shape}."\n',
						'                )\n',
						'\n',
						'    def decode_latents(self, latents):\n',
						'        scale_factor = 0.18215\n',
						'        latents = 1 / scale_factor * latents\n',
						'\n',
						'        batch_size, channels, num_frames, height, width = latents.shape\n',
						'        latents = latents.permute(0, 2, 1, 3, 4).reshape(batch_size * num_frames, channels, height, width)\n',
						'        image = self.vae_decoder(latents)[0]\n',
						'        image = torch.tensor(image)\n',
						'        video = (\n',
						'            image[None, :]\n',
						'            .reshape(\n',
						'                (\n',
						'                    batch_size,\n',
						'                    num_frames,\n',
						'                    -1,\n',
						'                )\n',
						'                + image.shape[2:]\n',
						'            )\n',
						'            .permute(0, 2, 1, 3, 4)\n',
						'        )\n',
						'        # we always cast to float32 as this does not cause significant overhead and is compatible with bfloat16\n',
						'        video = video.float()\n',
						'        return video'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Inference with OpenVINO\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'core = ov.Core()'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'device = widgets.Dropdown(\n',
						'    options=core.available_devices + ["AUTO"],\n',
						'    value="AUTO",\n',
						'    description="Device:",\n',
						'    disabled=False,\n',
						')\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_unet = core.compile_model(unet_xml_path, device_name=device.value)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_vae_decoder = core.compile_model(vae_decoder_xml_path, device_name=device.value)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_text_encoder = core.compile_model(text_encoder_xml, device_name=device.value)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Here we replace the pipeline parts with versions converted to OpenVINO IR and compiled to specific device. Note that we use original pipeline tokenizer and scheduler.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'ov_pipe = OVTextToVideoSDPipeline(ov_vae_decoder, ov_text_encoder, tokenizer, ov_unet, scheduler)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Define a prompt\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'prompt = "A panda eating bamboo on a rock."'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Let\'s generate a video for our prompt. For full list of arguments, see `__call__` function definition of `OVTextToVideoSDPipeline` class in [Build a pipeline](#Build-a-pipeline) section.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Video generation\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'frames = ov_pipe(prompt, num_inference_steps=25)["frames"]'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'images = [PIL.Image.fromarray(frame) for frame in frames]\n',
						'images[0].save("output.gif", save_all=True, append_images=images[1:], duration=125, loop=0)\n',
						'with open("output.gif", "rb") as gif_file:\n',
						'    b64 = f"data:image/gif;base64,{base64.b64encode(gif_file.read()).decode()}"\n',
						`IPython.display.HTML(f'<img src="{b64}" />')`
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Interactive demo\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def generate(prompt, seed, num_inference_steps, _=gr.Progress(track_tqdm=True)):\n',
						'    generator = torch.Generator().manual_seed(seed)\n',
						'    frames = ov_pipe(\n',
						'        prompt,\n',
						'        num_inference_steps=num_inference_steps,\n',
						'        generator=generator,\n',
						'    )["frames"]\n',
						'    out_file = tempfile.NamedTemporaryFile(suffix=".gif", delete=False)\n',
						'    images = [PIL.Image.fromarray(frame) for frame in frames]\n',
						'    images[0].save(out_file, save_all=True, append_images=images[1:], duration=125, loop=0)\n',
						'    return out_file.name\n',
						'\n',
						'\n',
						'demo = gr.Interface(\n',
						'    generate,\n',
						'    [\n',
						'        gr.Textbox(label="Prompt"),\n',
						'        gr.Slider(0, 1000000, value=42, label="Seed", step=1),\n',
						'        gr.Slider(10, 50, value=25, label="Number of inference steps", step=1),\n',
						'    ],\n',
						'    gr.Image(label="Result"),\n',
						'    examples=[\n',
						'        ["An astronaut riding a horse.", 0, 25],\n',
						'        ["A panda eating bamboo on a rock.", 0, 25],\n',
						'        ["Spiderman is surfing.", 0, 25],\n',
						'    ],\n',
						'    allow_flagging="never",\n',
						')\n',
						'\n',
						'try:\n',
						'    demo.queue().launch(debug=True)\n',
						'except Exception:\n',
						'    demo.queue().launch(share=True, debug=True)\n',
						'# if you are launching remotely, specify server_name and server_port\n',
						`# demo.launch(server_name='your server name', server_port='server port in int')\n`,
						'# Read more in the docs: https://gradio.app/docs/'
					]
				}
			]
				.map(fromJupyterCell)
			,
			[
				{
					'cell_type': 'markdown',
					'source': [
						'# Video generation with ZeroScope and OpenVINO\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Install and import required packages](#Install-and-import-required-packages)\n',
						'- [Load the model](#Load-the-model)\n',
						'- [Convert the model](#Convert-the-model)\n',
						'    - [Define the conversion function](#Define-the-conversion-function)\n',
						'    - [UNet](#UNet)\n',
						'    - [VAE](#VAE)\n',
						'    - [Text encoder](#Text-encoder)\n',
						'- [Build a pipeline](#Build-a-pipeline)\n',
						'- [Inference with OpenVINO](#Inference-with-OpenVINO)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Define a prompt](#Define-a-prompt)\n',
						'    - [Video generation](#Video-generation)\n',
						'- [Interactive demo](#Interactive-demo)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/zeroscope-text2video/zeroscope-text2video.ipynb" />\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The ZeroScope model is a free and open-source text-to-video model that can generate realistic and engaging videos from text descriptions. It is based on the [Modelscope](https://modelscope.cn/models/damo/text-to-video-synthesis/summary) model, but it has been improved to produce higher-quality videos with a 16:9 aspect ratio and no Shutterstock watermark. The ZeroScope model is available in two versions: ZeroScope_v2 576w, which is optimized for rapid content creation at a resolution of 576x320 pixels, and ZeroScope_v2 XL, which upscales videos to a high-definition resolution of 1024x576.\n',
						'\n',
						'The ZeroScope model is trained on a dataset of over 9,000 videos and 29,000 tagged frames. It uses a diffusion model to generate videos, which means that it starts with a random noise image and gradually adds detail to it until it matches the text description. The ZeroScope model is still under development, but it has already been used to create some impressive videos. For example, it has been used to create videos of people dancing, playing sports, and even driving cars.\n',
						'\n',
						'The ZeroScope model is a powerful tool that can be used to create various videos, from simple animations to complex scenes. It is still under development, but it has the potential to revolutionize the way we create and consume video content.\n',
						'\n',
						'Both versions of the ZeroScope model are available on Hugging Face:\n',
						' - [ZeroScope_v2 576w](https://huggingface.co/cerspense/zeroscope_v2_576w)\n',
						' - [ZeroScope_v2 XL](https://huggingface.co/cerspense/zeroscope_v2_XL)\n',
						'\n',
						'We will use the first one.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'<div class="alert alert-block alert-warning">\n',
						'    This tutorial requires at least 24GB of free memory to generate a video with a frame size of 432x240 and 16 frames. Increasing either of these values will require more memory and take more time.\n',
						'</div>'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Install and import required packages\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'To work with text-to-video synthesis model, we will use Hugging Face\'s [Diffusers](https://github.com/huggingface/diffusers) library. It provides already pretrained model from `cerspense`.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%pip install -q --extra-index-url https://download.pytorch.org/whl/cpu  "diffusers>=0.18.0" "torch>=2.1" transformers "openvino>=2023.1.0" numpy "gradio>=4.19"'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import gc\n',
						'from typing import Optional, Union, List, Callable\n',
						'import base64\n',
						'import tempfile\n',
						'import warnings\n',
						'\n',
						'import diffusers\n',
						'import transformers\n',
						'import numpy as np\n',
						'import IPython\n',
						'import torch\n',
						'import PIL\n',
						'import gradio as gr\n',
						'\n',
						'import openvino as ov'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						`Original 576x320 inference requires a lot of RAM (>100GB), so let's run our example on a smaller frame size, keeping the same aspect ratio. Try reducing values below to reduce the memory consumption.`
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'WIDTH = 432  # must be divisible by 8\n',
						'HEIGHT = 240  # must be divisible by 8\n',
						'NUM_FRAMES = 16'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Load the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'The model is loaded from HuggingFace using `.from_pretrained` method of `diffusers.DiffusionPipeline`.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'pipe = diffusers.DiffusionPipeline.from_pretrained("cerspense/zeroscope_v2_576w")'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'unet = pipe.unet\n',
						'unet.eval()\n',
						'vae = pipe.vae\n',
						'vae.eval()\n',
						'text_encoder = pipe.text_encoder\n',
						'text_encoder.eval()\n',
						'tokenizer = pipe.tokenizer\n',
						'scheduler = pipe.scheduler\n',
						'vae_scale_factor = pipe.vae_scale_factor\n',
						'unet_in_channels = pipe.unet.config.in_channels\n',
						'sample_width = WIDTH // vae_scale_factor\n',
						'sample_height = HEIGHT // vae_scale_factor\n',
						'del pipe\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Convert the model\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						`The architecture for generating videos from text comprises three distinct sub-networks: one for extracting text features, another for translating text features into the video latent space using a diffusion model, and a final one for mapping the video latent space to the visual space. The collective parameters of the entire model amount to approximately 1.7 billion. It's capable of processing English input. The diffusion model is built upon the Unet3D model and achieves video generation by iteratively denoising a starting point of pure Gaussian noise video.`
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'![](data:image/png;base64,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6Vv1VWglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqtKCVdk7osejTpV6m273NOyd0WPRp0q9Tbd7mqrSglXZO6LHo06Veptu9zTsndFj0adKvU23e5qq0oJV2Tuix6NOlXqbbvc07J3RY9GnSr1Nt3uaqt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)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Define the conversion function\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Model components are PyTorch modules, that can be converted with `ov.convert_model` function directly. We also use `ov.save_model` function to serialize the result of conversion.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'warnings.filterwarnings("ignore", category=torch.jit.TracerWarning)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'from pathlib import Path\n',
						'\n',
						'\n',
						'def convert(model: torch.nn.Module, xml_path: str, **convert_kwargs) -> Path:\n',
						'    xml_path = Path(xml_path)\n',
						'    if not xml_path.exists():\n',
						'        xml_path.parent.mkdir(parents=True, exist_ok=True)\n',
						'        with torch.no_grad():\n',
						'            converted_model = ov.convert_model(model, **convert_kwargs)\n',
						'        ov.save_model(converted_model, xml_path)\n',
						'        del converted_model\n',
						'        gc.collect()\n',
						'        torch._C._jit_clear_class_registry()\n',
						'        torch.jit._recursive.concrete_type_store = torch.jit._recursive.ConcreteTypeStore()\n',
						'        torch.jit._state._clear_class_state()\n',
						'    return xml_path'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### UNet\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Text-to-video generation pipeline main component is a conditional 3D UNet model that takes a noisy sample, conditional state, and a timestep and returns a sample shaped output.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'unet_xml_path = convert(\n',
						'    unet,\n',
						'    "models/unet.xml",\n',
						'    example_input={\n',
						'        "sample": torch.randn(2, 4, 2, int(sample_height // 2), int(sample_width // 2)),\n',
						'        "timestep": torch.tensor(1),\n',
						'        "encoder_hidden_states": torch.randn(2, 77, 1024),\n',
						'    },\n',
						'    input=[\n',
						'        ("sample", (2, 4, NUM_FRAMES, sample_height, sample_width)),\n',
						'        ("timestep", ()),\n',
						'        ("encoder_hidden_states", (2, 77, 1024)),\n',
						'    ],\n',
						')\n',
						'del unet\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### VAE\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Variational autoencoder (VAE) uses UNet output to decode latents to visual representations. Our VAE model has KL loss for encoding images into latents and decoding latent representations into images. For inference, we need only decoder part.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'class VaeDecoderWrapper(torch.nn.Module):\n',
						'    def __init__(self, vae):\n',
						'        super().__init__()\n',
						'        self.vae = vae\n',
						'\n',
						'    def forward(self, z: torch.FloatTensor):\n',
						'        return self.vae.decode(z)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'vae_decoder_xml_path = convert(\n',
						'    VaeDecoderWrapper(vae),\n',
						'    "models/vae.xml",\n',
						'    example_input=torch.randn(2, 4, 32, 32),\n',
						'    input=((NUM_FRAMES, 4, sample_height, sample_width)),\n',
						')\n',
						'del vae\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Text encoder\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Text encoder is used to encode the input prompt to tensor. Default tensor length is 77.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'text_encoder_xml = convert(\n',
						'    text_encoder,\n',
						'    "models/text_encoder.xml",\n',
						'    example_input=torch.ones(1, 77, dtype=torch.int64),\n',
						'    input=((1, 77), ov.Type.i64),\n',
						')\n',
						'del text_encoder\n',
						'gc.collect();'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Build a pipeline\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def tensor2vid(video: torch.Tensor, mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]) -> List[np.ndarray]:\n',
						'    # This code is copied from https://github.com/modelscope/modelscope/blob/1509fdb973e5871f37148a4b5e5964cafd43e64d/modelscope/pipelines/multi_modal/text_to_video_synthesis_pipeline.py#L78\n',
						'    # reshape to ncfhw\n',
						'    mean = torch.tensor(mean, device=video.device).reshape(1, -1, 1, 1, 1)\n',
						'    std = torch.tensor(std, device=video.device).reshape(1, -1, 1, 1, 1)\n',
						'    # unnormalize back to [0,1]\n',
						'    video = video.mul_(std).add_(mean)\n',
						'    video.clamp_(0, 1)\n',
						'    # prepare the final outputs\n',
						'    i, c, f, h, w = video.shape\n',
						'    images = video.permute(2, 3, 0, 4, 1).reshape(f, h, i * w, c)  # 1st (frames, h, batch_size, w, c) 2nd (frames, h, batch_size * w, c)\n',
						'    images = images.unbind(dim=0)  # prepare a list of indvidual (consecutive frames)\n',
						'    images = [(image.cpu().numpy() * 255).astype("uint8") for image in images]  # f h w c\n',
						'    return images'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'try:\n',
						'    from diffusers.utils import randn_tensor\n',
						'except ImportError:\n',
						'    from diffusers.utils.torch_utils import randn_tensor\n',
						'\n',
						'\n',
						'class OVTextToVideoSDPipeline(diffusers.DiffusionPipeline):\n',
						'    def __init__(\n',
						'        self,\n',
						'        vae_decoder: ov.CompiledModel,\n',
						'        text_encoder: ov.CompiledModel,\n',
						'        tokenizer: transformers.CLIPTokenizer,\n',
						'        unet: ov.CompiledModel,\n',
						'        scheduler: diffusers.schedulers.DDIMScheduler,\n',
						'    ):\n',
						'        super().__init__()\n',
						'\n',
						'        self.vae_decoder = vae_decoder\n',
						'        self.text_encoder = text_encoder\n',
						'        self.tokenizer = tokenizer\n',
						'        self.unet = unet\n',
						'        self.scheduler = scheduler\n',
						'        self.vae_scale_factor = vae_scale_factor\n',
						'        self.unet_in_channels = unet_in_channels\n',
						'        self.width = WIDTH\n',
						'        self.height = HEIGHT\n',
						'        self.num_frames = NUM_FRAMES\n',
						'\n',
						'    def __call__(\n',
						'        self,\n',
						'        prompt: Union[str, List[str]] = None,\n',
						'        num_inference_steps: int = 50,\n',
						'        guidance_scale: float = 9.0,\n',
						'        negative_prompt: Optional[Union[str, List[str]]] = None,\n',
						'        eta: float = 0.0,\n',
						'        generator: Optional[Union[torch.Generator, List[torch.Generator]]] = None,\n',
						'        latents: Optional[torch.FloatTensor] = None,\n',
						'        prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        negative_prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        output_type: Optional[str] = "np",\n',
						'        return_dict: bool = True,\n',
						'        callback: Optional[Callable[[int, int, torch.FloatTensor], None]] = None,\n',
						'        callback_steps: int = 1,\n',
						'    ):\n',
						'        r"""\n',
						'        Function invoked when calling the pipeline for generation.\n',
						'\n',
						'        Args:\n',
						'            prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts to guide the video generation. If not defined, one has to pass `prompt_embeds`.\n',
						'                instead.\n',
						'            num_inference_steps (`int`, *optional*, defaults to 50):\n',
						'                The number of denoising steps. More denoising steps usually lead to a higher quality videos at the\n',
						'                expense of slower inference.\n',
						'            guidance_scale (`float`, *optional*, defaults to 7.5):\n',
						'                Guidance scale as defined in [Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598).\n',
						'                `guidance_scale` is defined as `w` of equation 2. of [Imagen\n',
						'                Paper](https://arxiv.org/pdf/2205.11487.pdf). Guidance scale is enabled by setting `guidance_scale >\n',
						'                1`. Higher guidance scale encourages to generate videos that are closely linked to the text `prompt`,\n',
						'                usually at the expense of lower video quality.\n',
						'            negative_prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts not to guide the video generation. If not defined, one has to pass\n',
						'                `negative_prompt_embeds` instead. Ignored when not using guidance (i.e., ignored if `guidance_scale` is\n',
						'                less than `1`).\n',
						'            eta (`float`, *optional*, defaults to 0.0):\n',
						'                Corresponds to parameter eta (η) in the DDIM paper: https://arxiv.org/abs/2010.02502. Only applies to\n',
						'                [`schedulers.DDIMScheduler`], will be ignored for others.\n',
						'            generator (`torch.Generator` or `List[torch.Generator]`, *optional*):\n',
						'                One or a list of [torch generator(s)](https://pytorch.org/docs/stable/generated/torch.Generator.html)\n',
						'                to make generation deterministic.\n',
						'            latents (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated noisy latents, sampled from a Gaussian distribution, to be used as inputs for video\n',
						'                generation. Can be used to tweak the same generation with different prompts. If not provided, a latents\n',
						'                tensor will ge generated by sampling using the supplied random `generator`. Latents should be of shape\n',
						'                `(batch_size, num_channel, num_frames, height, width)`.\n',
						'            prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt weighting. If not\n',
						'                provided, text embeddings will be generated from `prompt` input argument.\n',
						'            negative_prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated negative text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt\n',
						'                weighting. If not provided, negative_prompt_embeds will be generated from `negative_prompt` input\n',
						'                argument.\n',
						'            output_type (`str`, *optional*, defaults to `"np"`):\n',
						'                The output format of the generate video. Choose between `torch.FloatTensor` or `np.array`.\n',
						'            return_dict (`bool`, *optional*, defaults to `True`):\n',
						'                Whether or not to return a [`~pipelines.stable_diffusion.TextToVideoSDPipelineOutput`] instead of a\n',
						'                plain tuple.\n',
						'            callback (`Callable`, *optional*):\n',
						'                A function that will be called every `callback_steps` steps during inference. The function will be\n',
						'                called with the following arguments: `callback(step: int, timestep: int, latents: torch.FloatTensor)`.\n',
						'            callback_steps (`int`, *optional*, defaults to 1):\n',
						'                The frequency at which the `callback` function will be called. If not specified, the callback will be\n',
						'                called at every step.\n',
						'\n',
						'        Returns:\n',
						'            `List[np.ndarray]`: generated video frames\n',
						'        """\n',
						'\n',
						'        num_images_per_prompt = 1\n',
						'\n',
						'        # 1. Check inputs. Raise error if not correct\n',
						'        self.check_inputs(\n',
						'            prompt,\n',
						'            callback_steps,\n',
						'            negative_prompt,\n',
						'            prompt_embeds,\n',
						'            negative_prompt_embeds,\n',
						'        )\n',
						'\n',
						'        # 2. Define call parameters\n',
						'        if prompt is not None and isinstance(prompt, str):\n',
						'            batch_size = 1\n',
						'        elif prompt is not None and isinstance(prompt, list):\n',
						'            batch_size = len(prompt)\n',
						'        else:\n',
						'            batch_size = prompt_embeds.shape[0]\n',
						'\n',
						'        # here `guidance_scale` is defined analog to the guidance weight `w` of equation (2)\n',
						'        # of the Imagen paper: https://arxiv.org/pdf/2205.11487.pdf . `guidance_scale = 1`\n',
						'        # corresponds to doing no classifier free guidance.\n',
						'        do_classifier_free_guidance = guidance_scale > 1.0\n',
						'\n',
						'        # 3. Encode input prompt\n',
						'        prompt_embeds = self._encode_prompt(\n',
						'            prompt,\n',
						'            num_images_per_prompt,\n',
						'            do_classifier_free_guidance,\n',
						'            negative_prompt,\n',
						'            prompt_embeds=prompt_embeds,\n',
						'            negative_prompt_embeds=negative_prompt_embeds,\n',
						'        )\n',
						'\n',
						'        # 4. Prepare timesteps\n',
						'        self.scheduler.set_timesteps(num_inference_steps)\n',
						'        timesteps = self.scheduler.timesteps\n',
						'\n',
						'        # 5. Prepare latent variables\n',
						'        num_channels_latents = self.unet_in_channels\n',
						'        latents = self.prepare_latents(\n',
						'            batch_size * num_images_per_prompt,\n',
						'            num_channels_latents,\n',
						'            prompt_embeds.dtype,\n',
						'            generator,\n',
						'            latents,\n',
						'        )\n',
						'\n',
						'        # 6. Prepare extra step kwargs. TODO: Logic should ideally just be moved out of the pipeline\n',
						'        extra_step_kwargs = {"generator": generator, "eta": eta}\n',
						'\n',
						'        # 7. Denoising loop\n',
						'        num_warmup_steps = len(timesteps) - num_inference_steps * self.scheduler.order\n',
						'        with self.progress_bar(total=num_inference_steps) as progress_bar:\n',
						'            for i, t in enumerate(timesteps):\n',
						'                # expand the latents if we are doing classifier free guidance\n',
						'                latent_model_input = torch.cat([latents] * 2) if do_classifier_free_guidance else latents\n',
						'                latent_model_input = self.scheduler.scale_model_input(latent_model_input, t)\n',
						'\n',
						'                # predict the noise residual\n',
						'                noise_pred = self.unet(\n',
						'                    {\n',
						'                        "sample": latent_model_input,\n',
						'                        "timestep": t,\n',
						'                        "encoder_hidden_states": prompt_embeds,\n',
						'                    }\n',
						'                )[0]\n',
						'                noise_pred = torch.tensor(noise_pred)\n',
						'\n',
						'                # perform guidance\n',
						'                if do_classifier_free_guidance:\n',
						'                    noise_pred_uncond, noise_pred_text = noise_pred.chunk(2)\n',
						'                    noise_pred = noise_pred_uncond + guidance_scale * (noise_pred_text - noise_pred_uncond)\n',
						'\n',
						'                # reshape latents\n',
						'                bsz, channel, frames, width, height = latents.shape\n',
						'                latents = latents.permute(0, 2, 1, 3, 4).reshape(bsz * frames, channel, width, height)\n',
						'                noise_pred = noise_pred.permute(0, 2, 1, 3, 4).reshape(bsz * frames, channel, width, height)\n',
						'\n',
						'                # compute the previous noisy sample x_t -> x_t-1\n',
						'                latents = self.scheduler.step(noise_pred, t, latents, **extra_step_kwargs).prev_sample\n',
						'\n',
						'                # reshape latents back\n',
						'                latents = latents[None, :].reshape(bsz, frames, channel, width, height).permute(0, 2, 1, 3, 4)\n',
						'\n',
						'                # call the callback, if provided\n',
						'                if i == len(timesteps) - 1 or ((i + 1) > num_warmup_steps and (i + 1) % self.scheduler.order == 0):\n',
						'                    progress_bar.update()\n',
						'                    if callback is not None and i % callback_steps == 0:\n',
						'                        callback(i, t, latents)\n',
						'\n',
						'        video_tensor = self.decode_latents(latents)\n',
						'\n',
						'        if output_type == "pt":\n',
						'            video = video_tensor\n',
						'        else:\n',
						'            video = tensor2vid(video_tensor)\n',
						'\n',
						'        if not return_dict:\n',
						'            return (video,)\n',
						'\n',
						'        return {"frames": video}\n',
						'\n',
						'    # Copied from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion.StableDiffusionPipeline._encode_prompt\n',
						'    def _encode_prompt(\n',
						'        self,\n',
						'        prompt,\n',
						'        num_images_per_prompt,\n',
						'        do_classifier_free_guidance,\n',
						'        negative_prompt=None,\n',
						'        prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'        negative_prompt_embeds: Optional[torch.FloatTensor] = None,\n',
						'    ):\n',
						'        r"""\n',
						'        Encodes the prompt into text encoder hidden states.\n',
						'\n',
						'        Args:\n',
						'             prompt (`str` or `List[str]`, *optional*):\n',
						'                prompt to be encoded\n',
						'            num_images_per_prompt (`int`):\n',
						'                number of images that should be generated per prompt\n',
						'            do_classifier_free_guidance (`bool`):\n',
						'                whether to use classifier free guidance or not\n',
						'            negative_prompt (`str` or `List[str]`, *optional*):\n',
						'                The prompt or prompts not to guide the image generation. If not defined, one has to pass\n',
						'                `negative_prompt_embeds` instead. Ignored when not using guidance (i.e., ignored if `guidance_scale` is\n',
						'                less than `1`).\n',
						'            prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt weighting. If not\n',
						'                provided, text embeddings will be generated from `prompt` input argument.\n',
						'            negative_prompt_embeds (`torch.FloatTensor`, *optional*):\n',
						'                Pre-generated negative text embeddings. Can be used to easily tweak text inputs, *e.g.* prompt\n',
						'                weighting. If not provided, negative_prompt_embeds will be generated from `negative_prompt` input\n',
						'                argument.\n',
						'        """\n',
						'        if prompt is not None and isinstance(prompt, str):\n',
						'            batch_size = 1\n',
						'        elif prompt is not None and isinstance(prompt, list):\n',
						'            batch_size = len(prompt)\n',
						'        else:\n',
						'            batch_size = prompt_embeds.shape[0]\n',
						'\n',
						'        if prompt_embeds is None:\n',
						'            text_inputs = self.tokenizer(\n',
						'                prompt,\n',
						'                padding="max_length",\n',
						'                max_length=self.tokenizer.model_max_length,\n',
						'                truncation=True,\n',
						'                return_tensors="pt",\n',
						'            )\n',
						'            text_input_ids = text_inputs.input_ids\n',
						'            untruncated_ids = self.tokenizer(prompt, padding="longest", return_tensors="pt").input_ids\n',
						'\n',
						'            if untruncated_ids.shape[-1] >= text_input_ids.shape[-1] and not torch.equal(text_input_ids, untruncated_ids):\n',
						'                removed_text = self.tokenizer.batch_decode(untruncated_ids[:, self.tokenizer.model_max_length - 1 : -1])\n',
						'                print(\n',
						'                    "The following part of your input was truncated because CLIP can only handle sequences up to"\n',
						'                    f" {self.tokenizer.model_max_length} tokens: {removed_text}"\n',
						'                )\n',
						'\n',
						'            prompt_embeds = self.text_encoder(text_input_ids)\n',
						'            prompt_embeds = prompt_embeds[0]\n',
						'            prompt_embeds = torch.tensor(prompt_embeds)\n',
						'\n',
						'        bs_embed, seq_len, _ = prompt_embeds.shape\n',
						'        # duplicate text embeddings for each generation per prompt, using mps friendly method\n',
						'        prompt_embeds = prompt_embeds.repeat(1, num_images_per_prompt, 1)\n',
						'        prompt_embeds = prompt_embeds.view(bs_embed * num_images_per_prompt, seq_len, -1)\n',
						'\n',
						'        # get unconditional embeddings for classifier free guidance\n',
						'        if do_classifier_free_guidance and negative_prompt_embeds is None:\n',
						'            uncond_tokens: List[str]\n',
						'            if negative_prompt is None:\n',
						'                uncond_tokens = [""] * batch_size\n',
						'            elif type(prompt) is not type(negative_prompt):\n',
						'                raise TypeError(f"`negative_prompt` should be the same type to `prompt`, but got {type(negative_prompt)} !=" f" {type(prompt)}.")\n',
						'            elif isinstance(negative_prompt, str):\n',
						'                uncond_tokens = [negative_prompt]\n',
						'            elif batch_size != len(negative_prompt):\n',
						'                raise ValueError(\n',
						'                    f"`negative_prompt`: {negative_prompt} has batch size {len(negative_prompt)}, but `prompt`:"\n',
						'                    f" {prompt} has batch size {batch_size}. Please make sure that passed `negative_prompt` matches"\n',
						'                    " the batch size of `prompt`."\n',
						'                )\n',
						'            else:\n',
						'                uncond_tokens = negative_prompt\n',
						'\n',
						'            max_length = prompt_embeds.shape[1]\n',
						'            uncond_input = self.tokenizer(\n',
						'                uncond_tokens,\n',
						'                padding="max_length",\n',
						'                max_length=max_length,\n',
						'                truncation=True,\n',
						'                return_tensors="pt",\n',
						'            )\n',
						'\n',
						'            negative_prompt_embeds = self.text_encoder(uncond_input.input_ids)\n',
						'            negative_prompt_embeds = negative_prompt_embeds[0]\n',
						'            negative_prompt_embeds = torch.tensor(negative_prompt_embeds)\n',
						'\n',
						'        if do_classifier_free_guidance:\n',
						'            # duplicate unconditional embeddings for each generation per prompt, using mps friendly method\n',
						'            seq_len = negative_prompt_embeds.shape[1]\n',
						'\n',
						'            negative_prompt_embeds = negative_prompt_embeds.repeat(1, num_images_per_prompt, 1)\n',
						'            negative_prompt_embeds = negative_prompt_embeds.view(batch_size * num_images_per_prompt, seq_len, -1)\n',
						'\n',
						'            # For classifier free guidance, we need to do two forward passes.\n',
						'            # Here we concatenate the unconditional and text embeddings into a single batch\n',
						'            # to avoid doing two forward passes\n',
						'            prompt_embeds = torch.cat([negative_prompt_embeds, prompt_embeds])\n',
						'\n',
						'        return prompt_embeds\n',
						'\n',
						'    def prepare_latents(\n',
						'        self,\n',
						'        batch_size,\n',
						'        num_channels_latents,\n',
						'        dtype,\n',
						'        generator,\n',
						'        latents=None,\n',
						'    ):\n',
						'        shape = (\n',
						'            batch_size,\n',
						'            num_channels_latents,\n',
						'            self.num_frames,\n',
						'            self.height // self.vae_scale_factor,\n',
						'            self.width // self.vae_scale_factor,\n',
						'        )\n',
						'        if isinstance(generator, list) and len(generator) != batch_size:\n',
						'            raise ValueError(\n',
						'                f"You have passed a list of generators of length {len(generator)}, but requested an effective batch"\n',
						'                f" size of {batch_size}. Make sure the batch size matches the length of the generators."\n',
						'            )\n',
						'\n',
						'        if latents is None:\n',
						'            latents = randn_tensor(shape, generator=generator, dtype=dtype)\n',
						'\n',
						'        # scale the initial noise by the standard deviation required by the scheduler\n',
						'        latents = latents * self.scheduler.init_noise_sigma\n',
						'        return latents\n',
						'\n',
						'    def check_inputs(\n',
						'        self,\n',
						'        prompt,\n',
						'        callback_steps,\n',
						'        negative_prompt=None,\n',
						'        prompt_embeds=None,\n',
						'        negative_prompt_embeds=None,\n',
						'    ):\n',
						'        if self.height % 8 != 0 or self.width % 8 != 0:\n',
						'            raise ValueError(f"`height` and `width` have to be divisible by 8 but are {self.height} and {self.width}.")\n',
						'\n',
						'        if (callback_steps is None) or (callback_steps is not None and (not isinstance(callback_steps, int) or callback_steps <= 0)):\n',
						'            raise ValueError(f"`callback_steps` has to be a positive integer but is {callback_steps} of type" f" {type(callback_steps)}.")\n',
						'\n',
						'        if prompt is not None and prompt_embeds is not None:\n',
						'            raise ValueError(\n',
						'                f"Cannot forward both `prompt`: {prompt} and `prompt_embeds`: {prompt_embeds}. Please make sure to" " only forward one of the two."\n',
						'            )\n',
						'        elif prompt is None and prompt_embeds is None:\n',
						'            raise ValueError("Provide either `prompt` or `prompt_embeds`. Cannot leave both `prompt` and `prompt_embeds` undefined.")\n',
						'        elif prompt is not None and (not isinstance(prompt, str) and not isinstance(prompt, list)):\n',
						'            raise ValueError(f"`prompt` has to be of type `str` or `list` but is {type(prompt)}")\n',
						'\n',
						'        if negative_prompt is not None and negative_prompt_embeds is not None:\n',
						'            raise ValueError(\n',
						'                f"Cannot forward both `negative_prompt`: {negative_prompt} and `negative_prompt_embeds`:"\n',
						'                f" {negative_prompt_embeds}. Please make sure to only forward one of the two."\n',
						'            )\n',
						'\n',
						'        if prompt_embeds is not None and negative_prompt_embeds is not None:\n',
						'            if prompt_embeds.shape != negative_prompt_embeds.shape:\n',
						'                raise ValueError(\n',
						'                    "`prompt_embeds` and `negative_prompt_embeds` must have the same shape when passed directly, but"\n',
						'                    f" got: `prompt_embeds` {prompt_embeds.shape} != `negative_prompt_embeds`"\n',
						'                    f" {negative_prompt_embeds.shape}."\n',
						'                )\n',
						'\n',
						'    def decode_latents(self, latents):\n',
						'        scale_factor = 0.18215\n',
						'        latents = 1 / scale_factor * latents\n',
						'\n',
						'        batch_size, channels, num_frames, height, width = latents.shape\n',
						'        latents = latents.permute(0, 2, 1, 3, 4).reshape(batch_size * num_frames, channels, height, width)\n',
						'        image = self.vae_decoder(latents)[0]\n',
						'        image = torch.tensor(image)\n',
						'        video = (\n',
						'            image[None, :]\n',
						'            .reshape(\n',
						'                (\n',
						'                    batch_size,\n',
						'                    num_frames,\n',
						'                    -1,\n',
						'                )\n',
						'                + image.shape[2:]\n',
						'            )\n',
						'            .permute(0, 2, 1, 3, 4)\n',
						'        )\n',
						'        # we always cast to float32 as this does not cause significant overhead and is compatible with bfloat16\n',
						'        video = video.float()\n',
						'        return video'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Inference with OpenVINO\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'core = ov.Core()'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'open("notebook_utils.py", "w").write(r.text)\n',
						'\n',
						'from notebook_utils import device_widget\n',
						'\n',
						'device = device_widget()\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_unet = core.compile_model(unet_xml_path, device_name=device.value)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_vae_decoder = core.compile_model(vae_decoder_xml_path, device_name=device.value)'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'%%time\n',
						'ov_text_encoder = core.compile_model(text_encoder_xml, device_name=device.value)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Here we replace the pipeline parts with versions converted to OpenVINO IR and compiled to specific device. Note that we use original pipeline tokenizer and scheduler.'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'ov_pipe = OVTextToVideoSDPipeline(ov_vae_decoder, ov_text_encoder, tokenizer, ov_unet, scheduler)'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Define a prompt\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'prompt = "A panda eating bamboo on a rock."'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'Let\'s generate a video for our prompt. For full list of arguments, see `__call__` function definition of `OVTextToVideoSDPipeline` class in [Build a pipeline](#Build-a-pipeline) section.'
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'### Video generation\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'frames = ov_pipe(prompt, num_inference_steps=25)["frames"]'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'images = [PIL.Image.fromarray(frame) for frame in frames]\n',
						'images[0].save("output.gif", save_all=True, append_images=images[1:], duration=125, loop=0)\n',
						'with open("output.gif", "rb") as gif_file:\n',
						'    b64 = f"data:image/gif;base64,{base64.b64encode(gif_file.read()).decode()}"\n',
						`IPython.display.HTML(f'<img src="{b64}" />')`
					]
				},
				{
					'cell_type': 'markdown',
					'source': [
						'## Interactive demo\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'code',
					'source': [
						'def generate(prompt, seed, num_inference_steps, _=gr.Progress(track_tqdm=True)):\n',
						'    generator = torch.Generator().manual_seed(seed)\n',
						'    frames = ov_pipe(\n',
						'        prompt,\n',
						'        num_inference_steps=num_inference_steps,\n',
						'        generator=generator,\n',
						'    )["frames"]\n',
						'    out_file = tempfile.NamedTemporaryFile(suffix=".gif", delete=False)\n',
						'    images = [PIL.Image.fromarray(frame) for frame in frames]\n',
						'    images[0].save(out_file, save_all=True, append_images=images[1:], duration=125, loop=0)\n',
						'    return out_file.name\n',
						'\n',
						'\n',
						'demo = gr.Interface(\n',
						'    generate,\n',
						'    [\n',
						'        gr.Textbox(label="Prompt"),\n',
						'        gr.Slider(0, 1000000, value=42, label="Seed", step=1),\n',
						'        gr.Slider(10, 50, value=25, label="Number of inference steps", step=1),\n',
						'    ],\n',
						'    gr.Image(label="Result"),\n',
						'    examples=[\n',
						'        ["An astronaut riding a horse.", 0, 25],\n',
						'        ["A panda eating bamboo on a rock.", 0, 25],\n',
						'        ["Spiderman is surfing.", 0, 25],\n',
						'    ],\n',
						'    allow_flagging="never",\n',
						')\n',
						'\n',
						'try:\n',
						'    demo.queue().launch(debug=True)\n',
						'except Exception:\n',
						'    demo.queue().launch(share=True, debug=True)\n',
						'# if you are launching remotely, specify server_name and server_port\n',
						`# demo.launch(server_name='your server name', server_port='server port in int')\n`,
						'# Read more in the docs: https://gradio.app/docs/'
					]
				}
			].map(fromJupyterCell)
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 },
			{ modified: 7, original: 7 },
			{ modified: 8, original: 8 },
			{ modified: 9, original: 9 },
			{ modified: 10, original: 10 },
			{ modified: 11, original: 11 },
			{ modified: 12, original: 12 },
			{ modified: 13, original: 13 },
			{ modified: 14, original: 14 },
			{ modified: 15, original: 15 },
			{ modified: 16, original: 16 },
			{ modified: 17, original: 17 },
			{ modified: 18, original: 18 },
			{ modified: 19, original: 19 },
			{ modified: 20, original: 20 },
			{ modified: 21, original: 21 },
			{ modified: 22, original: 22 },
			{ modified: 23, original: 23 },
			{ modified: 24, original: 24 },
			{ modified: 25, original: 25 },
			{ modified: 26, original: 26 },
			{ modified: 27, original: 27 },
			{ modified: 28, original: 28 },
			{ modified: 29, original: 29 },
			{ modified: 30, original: 30 },
			{ modified: 31, original: 31 },
			{ modified: 32, original: 32 },
			{ modified: 33, original: 33 },
			{ modified: 34, original: 34 },
			{ modified: 35, original: 35 },
			{ modified: 36, original: 36 },
			{ modified: 37, original: 37 },
			{ modified: 38, original: 38 },
			{ modified: 39, original: 39 },
			{ modified: 40, original: 40 },
			{ modified: 41, original: 41 },
			{ modified: 42, original: 42 },
			{ modified: 43, original: 43 },
			{ modified: 44, original: 44 },
			{ modified: 45, original: 45 },
			{ modified: 46, original: 46 },
			{ modified: 47, original: 47 },
			{ modified: 48, original: 48 },
			{ modified: 49, original: 49 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 6, originalLength: 1, modifiedStart: 6, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 15, originalLength: 1, modifiedStart: 15, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 36, originalLength: 1, modifiedStart: 36, modifiedLength: 1 } satisfies IDiffChange,
			// { originalStart: 50, originalLength: 0, modifiedStart: 50, modifiedLength: 2 } satisfies IDiffChange,
		]);

	});
	test('Modification of multiple cells', async () => {
		const { mapping, diff } = await mapCells(
			[
				{
					'cell_type': 'markdown',
					'id': 'a2e7d62b-5779-4211-822c-457c77321f8b',
					'source': [
						'# Convert and Optimize YOLOv11 instance segmentation model with OpenVINO™\n',
						'\n',
						'Instance segmentation goes a step further than object detection and involves identifying individual objects in an image and segmenting them from the rest of the image. Instance segmentation as an object detection are often used as key components in computer vision systems. \n',
						'Applications that use real-time instance segmentation models include video analytics, robotics, autonomous vehicles, multi-object tracking and object counting, medical image analysis, and many others.\n',
						'\n',
						'\n',
						'This tutorial demonstrates step-by-step instructions on how to run and optimize PyTorch YOLOv11 with OpenVINO. We consider the steps required for instance segmentation scenario.  You can find more details about model on [model page](https://docs.ultralytics.com/models/yolo11/) in Ultralytics documentation.\n',
						'\n',
						'The tutorial consists of the following steps:\n',
						'- Prepare the PyTorch model.\n',
						'- Download and prepare a dataset.\n',
						'- Validate the original model.\n',
						'- Convert the PyTorch model to OpenVINO IR.\n',
						'- Validate the converted model.\n',
						'- Prepare and run optimization pipeline.\n',
						'- Compare performance of the FP32 and quantized models.\n',
						'- Compare accuracy of the FP32 and quantized models.\n',
						'- Live demo\n',
						'\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Get PyTorch model](#Get-PyTorch-model)\n',
						'    - [Prerequisites](#Prerequisites)\n',
						'- [Instantiate model](#Instantiate-model)\n',
						'    - [Convert model to OpenVINO IR](#Convert-model-to-OpenVINO-IR)\n',
						'    - [Verify model inference](#Verify-model-inference)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Test on single image](#Test-on-single-image)\n',
						'- [Optimize model using NNCF Post-training Quantization API](#Optimize-model-using-NNCF-Post-training-Quantization-API)\n',
						'    - [Validate Quantized model inference](#Validate-Quantized-model-inference)\n',
						'- [Compare the Original and Quantized Models](#Compare-the-Original-and-Quantized-Models)\n',
						'    - [Compare performance of the Original and Quantized Models](#Compare-performance-of-the-Original-and-Quantized-Models)\n',
						'- [Other ways to optimize model](#Other-ways-to-optimize-model)\n',
						'- [Live demo](#Live-demo)\n',
						'    - [Run Live Object Detection and Segmentation](#Run-Live-Object-Detection-and-Segmentation)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/yolov11-optimization/yolov11-instance-segmentation.ipynb" />\n'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'd7a12678-b12f-48d1-9735-398855733e46',
					'source': [
						'## Get PyTorch model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Generally, PyTorch models represent an instance of the [`torch.nn.Module`](https://pytorch.org/docs/stable/generated/torch.nn.Module.html) class, initialized by a state dictionary with model weights.\n',
						'We will use the YOLOv11 nano model (also known as `yolo11n-seg`) pre-trained on a COCO dataset, which is available in this [repo](https://github.com/ultralytics/ultralytics). Similar steps are also applicable to other YOLOv11 models.\n',
						'Typical steps to obtain a pre-trained model:\n',
						'1. Create an instance of a model class.\n',
						'2. Load a checkpoint state dict, which contains the pre-trained model weights.\n',
						'3. Turn the model to evaluation for switching some operations to inference mode.\n',
						'\n',
						'In this case, the creators of the model provide an API that enables converting the YOLOv11 model to OpenVINO IR. Therefore, we do not need to do these steps manually.'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'e2267760-cbfe-41c6-958d-cad9f845d5bb',
					'source': [
						'#### Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Install necessary packages.'
					]
				},
				{
					'cell_type': 'code',
					'id': '30d04872-6916-454c-9211-6c644b50dc04',
					'source': [
						'%pip install -q "openvino>=2024.0.0" "nncf>=2.9.0"\n',
						'%pip install -q "torch>=2.1" "torchvision>=0.16" "ultralytics==8.3.0" opencv-python tqdm --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '1bbe319c',
					'source': [
						'Import required utility functions.\n',
						'The lower cell will download the `notebook_utils` Python module from GitHub.'
					]
				},
				{
					'cell_type': 'code',
					'id': 'a2f6cd89',
					'source': [
						'from pathlib import Path\n',
						'\n',
						'# Fetch `notebook_utils` module\n',
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'\n',
						'open("notebook_utils.py", "w").write(r.text)\n',
						'from notebook_utils import download_file, VideoPlayer, device_widget'
					]
				},
				{
					'cell_type': 'code',
					'id': '373658bd-7e64-4479-914e-f2742d330afd',
					'source': [
						'# Download a test sample\n',
						'IMAGE_PATH = Path("./data/coco_bike.jpg")\n',
						'download_file(\n',
						'    url="https://storage.openvinotoolkit.org/repositories/openvino_notebooks/data/data/image/coco_bike.jpg",\n',
						'    filename=IMAGE_PATH.name,\n',
						'    directory=IMAGE_PATH.parent,\n',
						')'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'ee32fd08-650c-4751-bb41-d8afccb2495e',
					'source': [
						'## Instantiate model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'For loading the model, required to specify a path to the model checkpoint. It can be some local path or name available on models hub (in this case model checkpoint will be downloaded automatically). \n',
						'You can select model using widget bellow:'
					]
				},
				{
					'cell_type': 'code',
					'id': '7c3963a5-b50b-4ffe-b710-ccd1f4a65380',
					'source': [
						'import ipywidgets as widgets\n',
						'\n',
						'model_id = [\n',
						'    "yolo11n-seg",\n',
						'    "yolo11s-seg",\n',
						'    "yolo11m-seg",\n',
						'    "yolo11l-seg",\n',
						'    "yolo11x-seg",\n',
						'    "yolov8n-seg",\n',
						'    "yolov8s-seg",\n',
						'    "yolov8m-seg",\n',
						'    "yolov8l-seg",\n',
						'    "yolov8x-seg",\n',
						']\n',
						'\n',
						'model_name = widgets.Dropdown(options=model_id, value=model_id[0], description="Model")\n',
						'\n',
						'model_name'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '60105d86-d7e0-47a9-ad88-4fff014ba3d8',
					'source': [
						'Making prediction, the model accepts a path to input image and returns list with Results class object. Results contains boxes for object detection model and boxes and masks for segmentation model. Also it contains utilities for processing results, for example, `plot()` method for drawing.\n',
						'\n',
						'Let us consider the examples:'
					]
				},
				{
					'cell_type': 'code',
					'id': 'd4994e1e-a3ee-4620-bc8b-237a55c47742',
					'source': [
						'from PIL import Image\n',
						'from ultralytics import YOLO\n',
						'\n',
						'SEG_MODEL_NAME = model_name.value\n',
						'\n',
						'seg_model = YOLO(f"{SEG_MODEL_NAME}.pt")\n',
						'label_map = seg_model.model.names\n',
						'\n',
						'res = seg_model(IMAGE_PATH)\n',
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'e345ffcc-c4b8-44ba-8b03-f37e63a060da',
					'source': [
						'### Convert model to OpenVINO IR\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Ultralytics provides API for convenient model exporting to different formats including OpenVINO IR. `model.export` is responsible for model conversion. We need to specify the format, and additionally, we can preserve dynamic shapes in the model.'
					]
				},
				{
					'cell_type': 'code',
					'id': '5c3ef363-f6a1-4fe5-b7ff-eb5a9c0789f1',
					'source': [
						'# instance segmentation model\n',
						'seg_model_path = Path(f"{SEG_MODEL_NAME}_openvino_model/{SEG_MODEL_NAME}.xml")\n',
						'if not seg_model_path.exists():\n',
						'    seg_model.export(format="openvino", dynamic=True, half=True)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '713cd45f-2b19-4a1e-bc9d-5e69bd95d896',
					'source': [
						'### Verify model inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We can reuse the base model pipeline for pre- and postprocessing just replacing the inference method where we will use the IR model for inference.'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'f9b9c472',
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'id': '4e0652b2',
					'source': [
						'device = device_widget()\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'cd163eab-e803-4ae8-96da-22c3bf303630',
					'source': [
						'### Test on single image\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '34a65afa-4201-428b-af11-b35e0d206e93',
					'source': [
						'import openvino as ov\n',
						'\n',
						'core = ov.Core()\n',
						'seg_ov_model = core.read_model(seg_model_path)\n',
						'\n',
						'ov_config = {}\n',
						'if device.value != "CPU":\n',
						'    seg_ov_model.reshape({0: [1, 3, 640, 640]})\n',
						'if "GPU" in device.value or ("AUTO" in device.value and "GPU" in core.available_devices):\n',
						'    ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'seg_compiled_model = core.compile_model(seg_ov_model, device.value, ov_config)'
					]
				},
				{
					'cell_type': 'code',
					'id': '389a4698-b7fc-4aa2-9833-9681f575d88b',
					'source': [
						'seg_model = YOLO(seg_model_path.parent, task="segment")\n',
						'\n',
						'if seg_model.predictor is None:\n',
						'    custom = {"conf": 0.25, "batch": 1, "save": False, "mode": "predict"}  # method defaults\n',
						'    args = {**seg_model.overrides, **custom}\n',
						'    seg_model.predictor = seg_model._smart_load("predictor")(overrides=args, _callbacks=seg_model.callbacks)\n',
						'    seg_model.predictor.setup_model(model=seg_model.model)\n',
						'\n',
						'seg_model.predictor.model.ov_compiled_model = seg_compiled_model'
					]
				},
				{
					'cell_type': 'code',
					'id': '12d2522f-e939-4512-b74a-3e20baf1edc8',
					'source': [
						'res = seg_model(IMAGE_PATH)\n',
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '7e918cf6-cdce-4e90-a6d7-c435a3c08d93',
					'source': [
						'Great! The result is the same, as produced by original models.'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '13b69e12-2e22-44c1-bfed-fdc88f6c424d',
					'source': [
						'## Optimize model using NNCF Post-training Quantization API\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'[NNCF](https://github.com/openvinotoolkit/nncf) provides a suite of advanced algorithms for Neural Networks inference optimization in OpenVINO with minimal accuracy drop.\n',
						'We will use 8-bit quantization in post-training mode (without the fine-tuning pipeline) to optimize YOLOv11.\n',
						'\n',
						'The optimization process contains the following steps:\n',
						'\n',
						'1. Create a Dataset for quantization.\n',
						'2. Run `nncf.quantize` for getting an optimized model.\n',
						'3. Serialize OpenVINO IR model, using the `openvino.runtime.serialize` function.'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '7d7eeae8-f3f4-4e95-b1a6-a23085f03ebc',
					'source': [
						'Please select below whether you would like to run quantization to improve model inference speed.'
					]
				},
				{
					'cell_type': 'code',
					'id': '4690b9fc-c49f-4882-b8a5-c82f842a9126',
					'source': [
						'import ipywidgets as widgets\n',
						'\n',
						'int8_model_seg_path = Path(f"{SEG_MODEL_NAME}_openvino_int8_model/{SEG_MODEL_NAME}.xml")\n',
						'quantized_seg_model = None\n',
						'\n',
						'to_quantize = widgets.Checkbox(\n',
						'    value=True,\n',
						'    description="Quantization",\n',
						'    disabled=False,\n',
						')\n',
						'\n',
						'to_quantize'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '73cfdbd4-3b65-49e0-b8ab-ceb1d0362481',
					'source': [
						'Let\'s load `skip magic` extension to skip quantization if `to_quantize` is not selected'
					]
				},
				{
					'cell_type': 'code',
					'id': 'bc6121aa-3a07-4066-a123-fe0ed0e72478',
					'source': [
						'# Fetch skip_kernel_extension module\n',
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/skip_kernel_extension.py",\n',
						')\n',
						'open("skip_kernel_extension.py", "w").write(r.text)\n',
						'\n',
						'%load_ext skip_kernel_extension'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '94fb2515-3645-4798-bc7c-082129ac86c0',
					'source': [
						'Reuse validation dataloader in accuracy testing for quantization. \n',
						'For that, it should be wrapped into the `nncf.Dataset` object and define a transformation function for getting only input tensors.'
					]
				},
				{
					'cell_type': 'code',
					'id': 'fd994958-6988-4a1d-ac7f-3efbd97135cc',
					'source': [
						'# %%skip not $to_quantize.value\n',
						'\n',
						'\n',
						'import nncf\n',
						'from typing import Dict\n',
						'\n',
						'from zipfile import ZipFile\n',
						'\n',
						'from ultralytics.data.utils import DATASETS_DIR\n',
						'from ultralytics.utils import DEFAULT_CFG\n',
						'from ultralytics.cfg import get_cfg\n',
						'from ultralytics.data.converter import coco80_to_coco91_class\n',
						'from ultralytics.data.utils import check_det_dataset\n',
						'from ultralytics.utils import ops\n',
						'\n',
						'\n',
						'if not int8_model_seg_path.exists():\n',
						'    DATA_URL = "http://images.cocodataset.org/zips/val2017.zip"\n',
						'    LABELS_URL = "https://github.com/ultralytics/yolov5/releases/download/v1.0/coco2017labels-segments.zip"\n',
						'    CFG_URL = "https://raw.githubusercontent.com/ultralytics/ultralytics/v8.1.0/ultralytics/cfg/datasets/coco.yaml"\n',
						'\n',
						'    OUT_DIR = DATASETS_DIR\n',
						'\n',
						'    DATA_PATH = OUT_DIR / "val2017.zip"\n',
						'    LABELS_PATH = OUT_DIR / "coco2017labels-segments.zip"\n',
						'    CFG_PATH = OUT_DIR / "coco.yaml"\n',
						'\n',
						'    download_file(DATA_URL, DATA_PATH.name, DATA_PATH.parent)\n',
						'    download_file(LABELS_URL, LABELS_PATH.name, LABELS_PATH.parent)\n',
						'    download_file(CFG_URL, CFG_PATH.name, CFG_PATH.parent)\n',
						'\n',
						'    if not (OUT_DIR / "coco/labels").exists():\n',
						'        with ZipFile(LABELS_PATH, "r") as zip_ref:\n',
						'            zip_ref.extractall(OUT_DIR)\n',
						'        with ZipFile(DATA_PATH, "r") as zip_ref:\n',
						'            zip_ref.extractall(OUT_DIR / "coco/images")\n',
						'\n',
						'    args = get_cfg(cfg=DEFAULT_CFG)\n',
						'    args.data = str(CFG_PATH)\n',
						'    seg_validator = seg_model.task_map[seg_model.task]["validator"](args=args)\n',
						'    seg_validator.data = check_det_dataset(args.data)\n',
						'    seg_validator.stride = 32\n',
						'    seg_data_loader = seg_validator.get_dataloader(OUT_DIR / "coco/", 1)\n',
						'\n',
						'    seg_validator.is_coco = True\n',
						'    seg_validator.class_map = coco80_to_coco91_class()\n',
						'    seg_validator.names = label_map\n',
						'    seg_validator.metrics.names = seg_validator.names\n',
						'    seg_validator.nc = 80\n',
						'    seg_validator.nm = 32\n',
						'    seg_validator.process = ops.process_mask\n',
						'    seg_validator.plot_masks = []\n',
						'\n',
						'    def transform_fn(data_item: Dict):\n',
						'        """\n',
						'        Quantization transform function. Extracts and preprocess input data from dataloader item for quantization.\n',
						'        Parameters:\n',
						'           data_item: Dict with data item produced by DataLoader during iteration\n',
						'        Returns:\n',
						'            input_tensor: Input data for quantization\n',
						'        """\n',
						'        input_tensor = seg_validator.preprocess(data_item)["img"].numpy()\n',
						'        return input_tensor\n',
						'\n',
						'    quantization_dataset = nncf.Dataset(seg_data_loader, transform_fn)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '91629284-e261-494d-9464-146ed7190084',
					'source': [
						'The `nncf.quantize` function provides an interface for model quantization. It requires an instance of the OpenVINO Model and quantization dataset. \n',
						'Optionally, some additional parameters for the configuration quantization process (number of samples for quantization, preset, ignored scope, etc.) can be provided. Ultralytics models contain non-ReLU activation functions, which require asymmetric quantization of activations. To achieve a better result, we will use a `mixed` quantization preset. It provides symmetric quantization of weights and asymmetric quantization of activations. For more accurate results, we should keep the operation in the postprocessing subgraph in floating point precision, using the `ignored_scope` parameter.\n',
						'\n',
						'>**Note**: Model post-training quantization is time-consuming process. Be patient, it can take several minutes depending on your hardware.'
					]
				},
				{
					'cell_type': 'code',
					'id': 'b2e8cec4-d0b3-4da0-b54c-7964e7bcbfe2',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'if not int8_model_seg_path.exists():\n',
						'    ignored_scope = nncf.IgnoredScope(  # post-processing\n',
						'        subgraphs=[\n',
						`            nncf.Subgraph(inputs=[f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat",\n`,
						`                                  f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat_1",\n`,
						`                                  f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat_2",\n`,
						`                                 f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat_7"],\n`,
						`                          outputs=[f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat_8"])\n`,
						'        ]\n',
						'    )\n',
						'\n',
						'    # Segmentation model\n',
						'    quantized_seg_model = nncf.quantize(\n',
						'        seg_ov_model,\n',
						'        quantization_dataset,\n',
						'        preset=nncf.QuantizationPreset.MIXED,\n',
						'        ignored_scope=ignored_scope\n',
						'    )\n',
						'\n',
						'    print(f"Quantized segmentation model will be saved to {int8_model_seg_path}")\n',
						'    ov.save_model(quantized_seg_model, str(int8_model_seg_path))'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'c8c92a68-3eb8-4ea5-9e35-d496f45b3cc3',
					'source': [
						'### Validate Quantized model inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'`nncf.quantize` returns the OpenVINO Model class instance, which is suitable for loading on a device for making predictions. `INT8` model input data and output result formats have no difference from the floating point model representation. Therefore, we can reuse the same `detect` function defined above for getting the `INT8` model result on the image.'
					]
				},
				{
					'cell_type': 'code',
					'id': '4003a3ae',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'id': '711200ec-2f26-47cc-b62d-3802961d5711',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'if quantized_seg_model is None:\n',
						'    quantized_seg_model = core.read_model(int8_model_seg_path)\n',
						'\n',
						'ov_config = {}\n',
						'if device.value != "CPU":\n',
						'    quantized_seg_model.reshape({0: [1, 3, 640, 640]})\n',
						'if "GPU" in device.value or ("AUTO" in device.value and "GPU" in core.available_devices):\n',
						'    ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'\n',
						'quantized_seg_compiled_model = core.compile_model(quantized_seg_model, device.value, ov_config)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'b2e3ea3b-5935-4474-9f08-f51fc688b9c0',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'\n',
						'if seg_model.predictor is None:\n',
						'    custom = {"conf": 0.25, "batch": 1, "save": False, "mode": "predict"}  # method defaults\n',
						'    args = {**seg_model.overrides, **custom}\n',
						'    seg_model.predictor = seg_model._smart_load("predictor")(overrides=args, _callbacks=seg_model.callbacks)\n',
						'    seg_model.predictor.setup_model(model=seg_model.model)\n',
						'\n',
						'seg_model.predictor.model.ov_compiled_model = quantized_seg_compiled_model'
					]
				},
				{
					'cell_type': 'code',
					'id': 'bef2ed5d-5762-41a6-af2e-ee4f9fd56557',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'res = seg_model(IMAGE_PATH)\n',
						'display(Image.fromarray(res[0].plot()[:, :, ::-1]))'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'b289f057',
					'source': [
						'## Compare the Original and Quantized Models\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '59081cae-9c92-46f0-8117-ed8c6fa6ff19',
					'source': [
						'### Compare performance of the Original and Quantized Models\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'Finally, use the OpenVINO [Benchmark Tool](https://docs.openvino.ai/2024/learn-openvino/openvino-samples/benchmark-tool.html) to measure the inference performance of the `FP32` and `INT8` models.\n',
						'\n',
						'> **Note**: For more accurate performance, it is recommended to run `benchmark_app` in a terminal/command prompt after closing other applications. Run `benchmark_app -m <model_path> -d CPU -shape "<input_shape>"` to benchmark async inference on CPU on specific input data shape for one minute. Change `CPU` to `GPU` to benchmark on GPU. Run `benchmark_app --help` to see an overview of all command-line options.'
					]
				},
				{
					'cell_type': 'code',
					'id': 'b8677df4',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'id': '546828d2',
					'source': [
						'if int8_model_seg_path.exists():\n',
						'    !benchmark_app -m $seg_model_path -d $device.value -api async -shape "[1,3,640,640]" -t 15'
					]
				},
				{
					'cell_type': 'code',
					'id': '1d43554b',
					'source': [
						'if int8_model_seg_path.exists():\n',
						'    !benchmark_app -m $int8_model_seg_path -d $device.value -api async -shape "[1,3,640,640]" -t 15'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '184bcebd-588d-4b4d-a60a-0fa753a07ef9',
					'source': [
						'## Other ways to optimize model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'The performance could be also improved by another OpenVINO method such as async inference pipeline or preprocessing API.\n',
						'\n',
						'Async Inference pipeline help to utilize the device more optimal. The key advantage of the Async API is that when a device is busy with inference, the application can perform other tasks in parallel (for example, populating inputs or scheduling other requests) rather than wait for the current inference to complete first. To understand how to perform async inference using openvino, refer to [Async API tutorial](../async-api/async-api.ipynb)\n',
						'\n',
						'Preprocessing API enables making preprocessing a part of the model reducing application code and dependency on additional image processing libraries. \n',
						'The main advantage of Preprocessing API is that preprocessing steps will be integrated into the execution graph and will be performed on a selected device (CPU/GPU etc.) rather than always being executed on CPU as part of an application. This will also improve selected device utilization. For more information, refer to the overview of [Preprocessing API tutorial](../optimize-preprocessing/optimize-preprocessing.ipynb). To see, how it could be used with YOLOV8 object detection model, please, see [Convert and Optimize YOLOv8 real-time object detection with OpenVINO tutorial](./yolov8-object-detection.ipynb)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '2e3b4862-c182-4ce4-a473-9f38d98deab8',
					'source': [
						'## Live demo\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'The following code runs model inference on a video:'
					]
				},
				{
					'cell_type': 'code',
					'id': '4c7bb92e-e301-45a9-b5ff-f7953fad298f',
					'source': [
						'import collections\n',
						'import time\n',
						'import cv2\n',
						'from IPython import display\n',
						'import numpy as np\n',
						'\n',
						'\n',
						'def run_instance_segmentation(\n',
						'    source=0,\n',
						'    flip=False,\n',
						'    use_popup=False,\n',
						'    skip_first_frames=0,\n',
						'    model=seg_model,\n',
						'    device=device.value,\n',
						'):\n',
						'    player = None\n',
						'\n',
						'    ov_config = {}\n',
						'    if device != "CPU":\n',
						'        model.reshape({0: [1, 3, 640, 640]})\n',
						'    if "GPU" in device or ("AUTO" in device and "GPU" in core.available_devices):\n',
						'        ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'    compiled_model = core.compile_model(model, device, ov_config)\n',
						'\n',
						'    if seg_model.predictor is None:\n',
						'        custom = {"conf": 0.25, "batch": 1, "save": False, "mode": "predict"}  # method defaults\n',
						'        args = {**seg_model.overrides, **custom}\n',
						'        seg_model.predictor = seg_model._smart_load("predictor")(overrides=args, _callbacks=seg_model.callbacks)\n',
						'        seg_model.predictor.setup_model(model=seg_model.model)\n',
						'\n',
						'    seg_model.predictor.model.ov_compiled_model = compiled_model\n',
						'\n',
						'    try:\n',
						'        # Create a video player to play with target fps.\n',
						'        player = VideoPlayer(source=source, flip=flip, fps=30, skip_first_frames=skip_first_frames)\n',
						'        # Start capturing.\n',
						'        player.start()\n',
						'        if use_popup:\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(winname=title, flags=cv2.WINDOW_GUI_NORMAL | cv2.WINDOW_AUTOSIZE)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'        while True:\n',
						'            # Grab the frame.\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'            # If the frame is larger than full HD, reduce size to improve the performance.\n',
						'            scale = 1280 / max(frame.shape)\n',
						'            if scale < 1:\n',
						'                frame = cv2.resize(\n',
						'                    src=frame,\n',
						'                    dsize=None,\n',
						'                    fx=scale,\n',
						'                    fy=scale,\n',
						'                    interpolation=cv2.INTER_AREA,\n',
						'                )\n',
						'            # Get the results.\n',
						'            input_image = np.array(frame)\n',
						'\n',
						'            start_time = time.time()\n',
						'            detections = seg_model(input_image)\n',
						'            stop_time = time.time()\n',
						'            frame = detections[0].plot()\n',
						'\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Use processing times from last 200 frames.\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            _, f_width = frame.shape[:2]\n',
						'            # Mean processing time [ms].\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'            cv2.putText(\n',
						'                img=frame,\n',
						'                text=f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                org=(20, 40),\n',
						'                fontFace=cv2.FONT_HERSHEY_COMPLEX,\n',
						'                fontScale=f_width / 1000,\n',
						'                color=(0, 0, 255),\n',
						'                thickness=1,\n',
						'                lineType=cv2.LINE_AA,\n',
						'            )\n',
						'            # Use this workaround if there is flickering.\n',
						'            if use_popup:\n',
						'                cv2.imshow(winname=title, mat=frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # Encode numpy array to jpg.\n',
						'                _, encoded_img = cv2.imencode(ext=".jpg", img=frame, params=[cv2.IMWRITE_JPEG_QUALITY, 100])\n',
						'                # Create an IPython image.\n',
						'                i = display.Image(data=encoded_img)\n',
						'                # Display the image in this notebook.\n',
						'                display.clear_output(wait=True)\n',
						'                display.display(i)\n',
						'    # ctrl-c\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    # any different error\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        if player is not None:\n',
						'            # Stop capturing.\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'cc5b4ba6-f478-4417-b09d-93fee5adca41',
					'source': [
						'### Run Live Object Detection and Segmentation\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Use a webcam as the video input. By default, the primary webcam is set with `source=0`. If you have multiple webcams, each one will be assigned a consecutive number starting at 0. Set `flip=True` when using a front-facing camera. Some web browsers, especially Mozilla Firefox, may cause flickering. If you experience flickering, set `use_popup=True`.\n',
						'\n',
						'>**NOTE**: To use this notebook with a webcam, you need to run the notebook on a computer with a webcam. If you run the notebook on a remote server (for example, in Binder or Google Colab service), the webcam will not work. By default, the lower cell will run model inference on a video file. If you want to try live inference on your webcam set `WEBCAM_INFERENCE = True`'
					]
				},
				{
					'cell_type': 'code',
					'id': '90708017',
					'source': [
						'WEBCAM_INFERENCE = False\n',
						'\n',
						'if WEBCAM_INFERENCE:\n',
						'    VIDEO_SOURCE = 0  # Webcam\n',
						'else:\n',
						'    VIDEO_SOURCE = "https://storage.openvinotoolkit.org/repositories/openvino_notebooks/data/data/video/people.mp4"'
					]
				},
				{
					'cell_type': 'code',
					'id': 'e8f1239c',
					'source': [
						'device'
					]
				},
				{
					'cell_type': 'code',
					'id': '440f2d0e',
					'source': [
						'run_instance_segmentation(\n',
						'    source=VIDEO_SOURCE,\n',
						'    flip=True,\n',
						'    use_popup=False,\n',
						'    model=seg_ov_model,\n',
						'    device=device.value,\n',
						')'
					]
				}
			]
				.map(fromJupyterCell)
			,
			[
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'a2e7d62b-5779-4211-822c-457c77321f8b',
					'metadata': {},
					'source': [
						'# Convert and Optimize YOLOv11 instance segmentation model with OpenVINO™\n',
						'\n',
						'Instance segmentation goes a step further than object detection and involves identifying individual objects in an image and segmenting them from the rest of the image. Instance segmentation as an object detection are often used as key components in computer vision systems. \n',
						'Applications that use real-time instance segmentation models include video analytics, robotics, autonomous vehicles, multi-object tracking and object counting, medical image analysis, and many others.\n',
						'\n',
						'\n',
						'This tutorial demonstrates step-by-step instructions on how to run and optimize PyTorch YOLOv11 with OpenVINO. We consider the steps required for instance segmentation scenario.  You can find more details about model on [model page](https://docs.ultralytics.com/models/yolo11/) in Ultralytics documentation.\n',
						'\n',
						'The tutorial consists of the following steps:\n',
						'- Prepare the PyTorch model.\n',
						'- Download and prepare a dataset.\n',
						'- Validate the original model.\n',
						'- Convert the PyTorch model to OpenVINO IR.\n',
						'- Validate the converted model.\n',
						'- Prepare and run optimization pipeline.\n',
						'- Compare performance of the FP32 and quantized models.\n',
						'- Compare accuracy of the FP32 and quantized models.\n',
						'- Live demo\n',
						'\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Get PyTorch model](#Get-PyTorch-model)\n',
						'    - [Prerequisites](#Prerequisites)\n',
						'- [Instantiate model](#Instantiate-model)\n',
						'    - [Convert model to OpenVINO IR](#Convert-model-to-OpenVINO-IR)\n',
						'    - [Verify model inference](#Verify-model-inference)\n',
						'    - [Select inference device](#Select-inference-device)\n',
						'    - [Test on single image](#Test-on-single-image)\n',
						'- [Optimize model using NNCF Post-training Quantization API](#Optimize-model-using-NNCF-Post-training-Quantization-API)\n',
						'    - [Validate Quantized model inference](#Validate-Quantized-model-inference)\n',
						'- [Compare the Original and Quantized Models](#Compare-the-Original-and-Quantized-Models)\n',
						'    - [Compare performance of the Original and Quantized Models](#Compare-performance-of-the-Original-and-Quantized-Models)\n',
						'- [Other ways to optimize model](#Other-ways-to-optimize-model)\n',
						'- [Live demo](#Live-demo)\n',
						'    - [Run Live Object Detection and Segmentation](#Run-Live-Object-Detection-and-Segmentation)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/yolov11-optimization/yolov11-instance-segmentation.ipynb" />\n'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'd7a12678-b12f-48d1-9735-398855733e46',
					'metadata': {},
					'source': [
						'## Get PyTorch model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Generally, PyTorch models represent an instance of the [`torch.nn.Module`](https://pytorch.org/docs/stable/generated/torch.nn.Module.html) class, initialized by a state dictionary with model weights.\n',
						'We will use the YOLOv11 nano model (also known as `yolo11n-seg`) pre-trained on a COCO dataset, which is available in this [repo](https://github.com/ultralytics/ultralytics). Similar steps are also applicable to other YOLOv11 models.\n',
						'Typical steps to obtain a pre-trained model:\n',
						'1. Create an instance of a model class.\n',
						'2. Load a checkpoint state dict, which contains the pre-trained model weights.\n',
						'3. Turn the model to evaluation for switching some operations to inference mode.\n',
						'\n',
						'In this case, the creators of the model provide an API that enables converting the YOLOv11 model to OpenVINO IR. Therefore, we do not need to do these steps manually.'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'e2267760-cbfe-41c6-958d-cad9f845d5bb',
					'metadata': {},
					'source': [
						'#### Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Install necessary packages.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '30d04872-6916-454c-9211-6c644b50dc04',
					'metadata': {},
					'outputs': [],
					'source': [
						'%pip install -q "openvino>=2024.0.0" "nncf>=2.9.0"\n',
						'%pip install -q "torch>=2.1" "torchvision>=0.16" "ultralytics==8.3.0" opencv-python tqdm --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '1bbe319c',
					'metadata': {},
					'source': [
						'Import required utility functions.\n',
						'The lower cell will download the `notebook_utils` Python module from GitHub.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': 'a2f6cd89',
					'metadata': {},
					'outputs': [],
					'source': [
						'from pathlib import Path\n',
						'import requests\n',
						'\n',
						'if not Path("notebook_utils.py").exists():\n',
						'    r = requests.get(\n',
						'        url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						'    )\n',
						'\n',
						'    open("notebook_utils.py", "w").write(r.text)\n',
						'\n',
						'\n',
						'from notebook_utils import download_file, VideoPlayer, device_widget'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '373658bd-7e64-4479-914e-f2742d330afd',
					'metadata': {},
					'outputs': [],
					'source': [
						'# Download a test sample\n',
						'IMAGE_PATH = Path("./data/coco_bike.jpg")\n',
						'\n',
						'if not IMAGE_PATH.exists():\n',
						'    download_file(\n',
						'        url="https://storage.openvinotoolkit.org/repositories/openvino_notebooks/data/data/image/coco_bike.jpg",\n',
						'        filename=IMAGE_PATH.name,\n',
						'        directory=IMAGE_PATH.parent,\n',
						'    )'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'ee32fd08-650c-4751-bb41-d8afccb2495e',
					'metadata': {},
					'source': [
						'## Instantiate model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'For loading the model, required to specify a path to the model checkpoint. It can be some local path or name available on models hub (in this case model checkpoint will be downloaded automatically). \n',
						'You can select model using widget bellow:'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '7c3963a5-b50b-4ffe-b710-ccd1f4a65380',
					'metadata': {},
					'outputs': [],
					'source': [
						'import ipywidgets as widgets\n',
						'\n',
						'model_id = [\n',
						'    "yolo11n-seg",\n',
						'    "yolo11s-seg",\n',
						'    "yolo11m-seg",\n',
						'    "yolo11l-seg",\n',
						'    "yolo11x-seg",\n',
						'    "yolov8n-seg",\n',
						'    "yolov8s-seg",\n',
						'    "yolov8m-seg",\n',
						'    "yolov8l-seg",\n',
						'    "yolov8x-seg",\n',
						']\n',
						'\n',
						'model_name = widgets.Dropdown(options=model_id, value=model_id[0], description="Model")\n',
						'\n',
						'model_name'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '60105d86-d7e0-47a9-ad88-4fff014ba3d8',
					'metadata': {},
					'source': [
						'Making prediction, the model accepts a path to input image and returns list with Results class object. Results contains boxes for object detection model and boxes and masks for segmentation model. Also it contains utilities for processing results, for example, `plot()` method for drawing.\n',
						'\n',
						'Let us consider the examples:'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': 'd4994e1e-a3ee-4620-bc8b-237a55c47742',
					'metadata': {},
					'outputs': [],
					'source': [
						'from PIL import Image\n',
						'from ultralytics import YOLO\n',
						'\n',
						'SEG_MODEL_NAME = model_name.value\n',
						'\n',
						'seg_model = YOLO(f"{SEG_MODEL_NAME}.pt")\n',
						'label_map = seg_model.model.names\n',
						'\n',
						'res = seg_model(IMAGE_PATH)\n',
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'e345ffcc-c4b8-44ba-8b03-f37e63a060da',
					'metadata': {},
					'source': [
						'### Convert model to OpenVINO IR\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Ultralytics provides API for convenient model exporting to different formats including OpenVINO IR. `model.export` is responsible for model conversion. We need to specify the format, and additionally, we can preserve dynamic shapes in the model.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '5c3ef363-f6a1-4fe5-b7ff-eb5a9c0789f1',
					'metadata': {},
					'outputs': [],
					'source': [
						'# instance segmentation model\n',
						'seg_model_path = Path(f"{SEG_MODEL_NAME}_openvino_model/{SEG_MODEL_NAME}.xml")\n',
						'if not seg_model_path.exists():\n',
						'    seg_model.export(format="openvino", dynamic=True, half=True)'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '713cd45f-2b19-4a1e-bc9d-5e69bd95d896',
					'metadata': {},
					'source': [
						'### Verify model inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'We can reuse the base model pipeline for pre- and postprocessing just replacing the inference method where we will use the IR model for inference.'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'f9b9c472',
					'metadata': {},
					'source': [
						'### Select inference device\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Select device from dropdown list for running inference using OpenVINO'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '4e0652b2',
					'metadata': {},
					'outputs': [],
					'source': [
						'device = device_widget()\n',
						'\n',
						'device'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'cd163eab-e803-4ae8-96da-22c3bf303630',
					'metadata': {},
					'source': [
						'### Test on single image\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '34a65afa-4201-428b-af11-b35e0d206e93',
					'metadata': {},
					'outputs': [],
					'source': [
						'import openvino as ov\n',
						'\n',
						'core = ov.Core()\n',
						'seg_ov_model = core.read_model(seg_model_path)\n',
						'\n',
						'ov_config = {}\n',
						'if device.value != "CPU":\n',
						'    seg_ov_model.reshape({0: [1, 3, 640, 640]})\n',
						'if "GPU" in device.value or ("AUTO" in device.value and "GPU" in core.available_devices):\n',
						'    ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'seg_compiled_model = core.compile_model(seg_ov_model, device.value, ov_config)'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '389a4698-b7fc-4aa2-9833-9681f575d88b',
					'metadata': {},
					'outputs': [],
					'source': [
						'seg_model = YOLO(seg_model_path.parent, task="segment")\n',
						'\n',
						'if seg_model.predictor is None:\n',
						'    custom = {"conf": 0.25, "batch": 1, "save": False, "mode": "predict"}  # method defaults\n',
						'    args = {**seg_model.overrides, **custom}\n',
						'    seg_model.predictor = seg_model._smart_load("predictor")(overrides=args, _callbacks=seg_model.callbacks)\n',
						'    seg_model.predictor.setup_model(model=seg_model.model)\n',
						'\n',
						'seg_model.predictor.model.ov_compiled_model = seg_compiled_model'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '12d2522f-e939-4512-b74a-3e20baf1edc8',
					'metadata': {},
					'outputs': [],
					'source': [
						'res = seg_model(IMAGE_PATH)\n',
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '7e918cf6-cdce-4e90-a6d7-c435a3c08d93',
					'metadata': {},
					'source': [
						'Great! The result is the same, as produced by original models.'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '13b69e12-2e22-44c1-bfed-fdc88f6c424d',
					'metadata': {},
					'source': [
						'## Optimize model using NNCF Post-training Quantization API\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'[NNCF](https://github.com/openvinotoolkit/nncf) provides a suite of advanced algorithms for Neural Networks inference optimization in OpenVINO with minimal accuracy drop.\n',
						'We will use 8-bit quantization in post-training mode (without the fine-tuning pipeline) to optimize YOLOv11.\n',
						'\n',
						'The optimization process contains the following steps:\n',
						'\n',
						'1. Create a Dataset for quantization.\n',
						'2. Run `nncf.quantize` for getting an optimized model.\n',
						'3. Serialize OpenVINO IR model, using the `openvino.runtime.serialize` function.'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '7d7eeae8-f3f4-4e95-b1a6-a23085f03ebc',
					'metadata': {},
					'source': [
						'Please select below whether you would like to run quantization to improve model inference speed.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '4690b9fc-c49f-4882-b8a5-c82f842a9126',
					'metadata': {},
					'outputs': [],
					'source': [
						'import ipywidgets as widgets\n',
						'\n',
						'int8_model_seg_path = Path(f"{SEG_MODEL_NAME}_openvino_int8_model/{SEG_MODEL_NAME}.xml")\n',
						'quantized_seg_model = None\n',
						'\n',
						'to_quantize = widgets.Checkbox(\n',
						'    value=True,\n',
						'    description="Quantization",\n',
						'    disabled=False,\n',
						')\n',
						'\n',
						'to_quantize'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '73cfdbd4-3b65-49e0-b8ab-ceb1d0362481',
					'metadata': {},
					'source': [
						'Let\'s load `skip magic` extension to skip quantization if `to_quantize` is not selected'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': 'bc6121aa-3a07-4066-a123-fe0ed0e72478',
					'metadata': {},
					'outputs': [],
					'source': [
						'# Fetch skip_kernel_extension module\n',
						'import requests\n',
						'\n',
						'\n',
						'if not Path("skip_kernel_extension.py").exists():\n',
						'    r = requests.get(\n',
						'        url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/skip_kernel_extension.py",\n',
						'    )\n',
						'    open("skip_kernel_extension.py", "w").write(r.text)\n',
						'\n',
						'%load_ext skip_kernel_extension'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '94fb2515-3645-4798-bc7c-082129ac86c0',
					'metadata': {},
					'source': [
						'Reuse validation dataloader in accuracy testing for quantization. \n',
						'For that, it should be wrapped into the `nncf.Dataset` object and define a transformation function for getting only input tensors.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': 'fd994958-6988-4a1d-ac7f-3efbd97135cc',
					'metadata': {},
					'outputs': [],
					'source': [
						'# %%skip not $to_quantize.value\n',
						'\n',
						'\n',
						'import nncf\n',
						'from typing import Dict\n',
						'\n',
						'from zipfile import ZipFile\n',
						'\n',
						'from ultralytics.data.utils import DATASETS_DIR\n',
						'from ultralytics.utils import DEFAULT_CFG\n',
						'from ultralytics.cfg import get_cfg\n',
						'from ultralytics.data.converter import coco80_to_coco91_class\n',
						'from ultralytics.data.utils import check_det_dataset\n',
						'from ultralytics.utils import ops\n',
						'\n',
						'\n',
						'if not int8_model_seg_path.exists():\n',
						'    DATA_URL = "http://images.cocodataset.org/zips/val2017.zip"\n',
						'    LABELS_URL = "https://github.com/ultralytics/yolov5/releases/download/v1.0/coco2017labels-segments.zip"\n',
						'    CFG_URL = "https://raw.githubusercontent.com/ultralytics/ultralytics/v8.1.0/ultralytics/cfg/datasets/coco.yaml"\n',
						'\n',
						'    OUT_DIR = DATASETS_DIR\n',
						'\n',
						'    DATA_PATH = OUT_DIR / "val2017.zip"\n',
						'    LABELS_PATH = OUT_DIR / "coco2017labels-segments.zip"\n',
						'    CFG_PATH = OUT_DIR / "coco.yaml"\n',
						'\n',
						'    download_file(DATA_URL, DATA_PATH.name, DATA_PATH.parent)\n',
						'    download_file(LABELS_URL, LABELS_PATH.name, LABELS_PATH.parent)\n',
						'    download_file(CFG_URL, CFG_PATH.name, CFG_PATH.parent)\n',
						'\n',
						'    if not (OUT_DIR / "coco/labels").exists():\n',
						'        with ZipFile(LABELS_PATH, "r") as zip_ref:\n',
						'            zip_ref.extractall(OUT_DIR)\n',
						'        with ZipFile(DATA_PATH, "r") as zip_ref:\n',
						'            zip_ref.extractall(OUT_DIR / "coco/images")\n',
						'\n',
						'    args = get_cfg(cfg=DEFAULT_CFG)\n',
						'    args.data = str(CFG_PATH)\n',
						'    seg_validator = seg_model.task_map[seg_model.task]["validator"](args=args)\n',
						'    seg_validator.data = check_det_dataset(args.data)\n',
						'    seg_validator.stride = 32\n',
						'    seg_data_loader = seg_validator.get_dataloader(OUT_DIR / "coco/", 1)\n',
						'\n',
						'    seg_validator.is_coco = True\n',
						'    seg_validator.class_map = coco80_to_coco91_class()\n',
						'    seg_validator.names = label_map\n',
						'    seg_validator.metrics.names = seg_validator.names\n',
						'    seg_validator.nc = 80\n',
						'    seg_validator.nm = 32\n',
						'    seg_validator.process = ops.process_mask\n',
						'    seg_validator.plot_masks = []\n',
						'\n',
						'    def transform_fn(data_item: Dict):\n',
						'        """\n',
						'        Quantization transform function. Extracts and preprocess input data from dataloader item for quantization.\n',
						'        Parameters:\n',
						'           data_item: Dict with data item produced by DataLoader during iteration\n',
						'        Returns:\n',
						'            input_tensor: Input data for quantization\n',
						'        """\n',
						'        input_tensor = seg_validator.preprocess(data_item)["img"].numpy()\n',
						'        return input_tensor\n',
						'\n',
						'    quantization_dataset = nncf.Dataset(seg_data_loader, transform_fn)'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '91629284-e261-494d-9464-146ed7190084',
					'metadata': {},
					'source': [
						'The `nncf.quantize` function provides an interface for model quantization. It requires an instance of the OpenVINO Model and quantization dataset. \n',
						'Optionally, some additional parameters for the configuration quantization process (number of samples for quantization, preset, ignored scope, etc.) can be provided. Ultralytics models contain non-ReLU activation functions, which require asymmetric quantization of activations. To achieve a better result, we will use a `mixed` quantization preset. It provides symmetric quantization of weights and asymmetric quantization of activations. For more accurate results, we should keep the operation in the postprocessing subgraph in floating point precision, using the `ignored_scope` parameter.\n',
						'\n',
						'>**Note**: Model post-training quantization is time-consuming process. Be patient, it can take several minutes depending on your hardware.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': 'b2e8cec4-d0b3-4da0-b54c-7964e7bcbfe2',
					'metadata': {
						'test_replace': {
							'ignored_scope=ignored_scope\n': 'ignored_scope=ignored_scope, subset_size=10\n'
						}
					},
					'outputs': [],
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'if not int8_model_seg_path.exists():\n',
						'    ignored_scope = nncf.IgnoredScope(  # post-processing\n',
						'        subgraphs=[\n',
						`            nncf.Subgraph(inputs=[f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat",\n`,
						`                                  f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat_1",\n`,
						`                                  f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat_2",\n`,
						`                                 f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat_7"],\n`,
						`                          outputs=[f"__module.model.{22 if 'v8' in SEG_MODEL_NAME else 23}/aten::cat/Concat_8"])\n`,
						'        ]\n',
						'    )\n',
						'\n',
						'    # Segmentation model\n',
						'    quantized_seg_model = nncf.quantize(\n',
						'        seg_ov_model,\n',
						'        quantization_dataset,\n',
						'        preset=nncf.QuantizationPreset.MIXED,\n',
						'        ignored_scope=ignored_scope\n',
						'    )\n',
						'\n',
						'    print(f"Quantized segmentation model will be saved to {int8_model_seg_path}")\n',
						'    ov.save_model(quantized_seg_model, str(int8_model_seg_path))'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'c8c92a68-3eb8-4ea5-9e35-d496f45b3cc3',
					'metadata': {},
					'source': [
						'### Validate Quantized model inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'`nncf.quantize` returns the OpenVINO Model class instance, which is suitable for loading on a device for making predictions. `INT8` model input data and output result formats have no difference from the floating point model representation. Therefore, we can reuse the same `detect` function defined above for getting the `INT8` model result on the image.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '4003a3ae',
					'metadata': {},
					'outputs': [],
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '711200ec-2f26-47cc-b62d-3802961d5711',
					'metadata': {},
					'outputs': [],
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'if quantized_seg_model is None:\n',
						'    quantized_seg_model = core.read_model(int8_model_seg_path)\n',
						'\n',
						'ov_config = {}\n',
						'if device.value != "CPU":\n',
						'    quantized_seg_model.reshape({0: [1, 3, 640, 640]})\n',
						'if "GPU" in device.value or ("AUTO" in device.value and "GPU" in core.available_devices):\n',
						'    ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'\n',
						'quantized_seg_compiled_model = core.compile_model(quantized_seg_model, device.value, ov_config)'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': 'b2e3ea3b-5935-4474-9f08-f51fc688b9c0',
					'metadata': {},
					'outputs': [],
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'\n',
						'if seg_model.predictor is None:\n',
						'    custom = {"conf": 0.25, "batch": 1, "save": False, "mode": "predict"}  # method defaults\n',
						'    args = {**seg_model.overrides, **custom}\n',
						'    seg_model.predictor = seg_model._smart_load("predictor")(overrides=args, _callbacks=seg_model.callbacks)\n',
						'    seg_model.predictor.setup_model(model=seg_model.model)\n',
						'\n',
						'seg_model.predictor.model.ov_compiled_model = quantized_seg_compiled_model'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': 'bef2ed5d-5762-41a6-af2e-ee4f9fd56557',
					'metadata': {},
					'outputs': [],
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'res = seg_model(IMAGE_PATH)\n',
						'display(Image.fromarray(res[0].plot()[:, :, ::-1]))'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'b289f057',
					'metadata': {},
					'source': [
						'## Compare the Original and Quantized Models\n',
						'[back to top ⬆️](#Table-of-contents:)\n'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '59081cae-9c92-46f0-8117-ed8c6fa6ff19',
					'metadata': {},
					'source': [
						'### Compare performance of the Original and Quantized Models\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'Finally, use the OpenVINO [Benchmark Tool](https://docs.openvino.ai/2024/learn-openvino/openvino-samples/benchmark-tool.html) to measure the inference performance of the `FP32` and `INT8` models.\n',
						'\n',
						'> **Note**: For more accurate performance, it is recommended to run `benchmark_app` in a terminal/command prompt after closing other applications. Run `benchmark_app -m <model_path> -d CPU -shape "<input_shape>"` to benchmark async inference on CPU on specific input data shape for one minute. Change `CPU` to `GPU` to benchmark on GPU. Run `benchmark_app --help` to see an overview of all command-line options.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': 'b8677df4',
					'metadata': {},
					'outputs': [],
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '546828d2',
					'metadata': {},
					'outputs': [],
					'source': [
						'if int8_model_seg_path.exists():\n',
						'    !benchmark_app -m $seg_model_path -d $device.value -api async -shape "[1,3,640,640]" -t 15'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '1d43554b',
					'metadata': {},
					'outputs': [],
					'source': [
						'if int8_model_seg_path.exists():\n',
						'    !benchmark_app -m $int8_model_seg_path -d $device.value -api async -shape "[1,3,640,640]" -t 15'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '184bcebd-588d-4b4d-a60a-0fa753a07ef9',
					'metadata': {},
					'source': [
						'## Other ways to optimize model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'The performance could be also improved by another OpenVINO method such as async inference pipeline or preprocessing API.\n',
						'\n',
						'Async Inference pipeline help to utilize the device more optimal. The key advantage of the Async API is that when a device is busy with inference, the application can perform other tasks in parallel (for example, populating inputs or scheduling other requests) rather than wait for the current inference to complete first. To understand how to perform async inference using openvino, refer to [Async API tutorial](../async-api/async-api.ipynb)\n',
						'\n',
						'Preprocessing API enables making preprocessing a part of the model reducing application code and dependency on additional image processing libraries. \n',
						'The main advantage of Preprocessing API is that preprocessing steps will be integrated into the execution graph and will be performed on a selected device (CPU/GPU etc.) rather than always being executed on CPU as part of an application. This will also improve selected device utilization. For more information, refer to the overview of [Preprocessing API tutorial](../optimize-preprocessing/optimize-preprocessing.ipynb). To see, how it could be used with YOLOV8 object detection model, please, see [Convert and Optimize YOLOv8 real-time object detection with OpenVINO tutorial](./yolov8-object-detection.ipynb)'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': '2e3b4862-c182-4ce4-a473-9f38d98deab8',
					'metadata': {
						'tags': []
					},
					'source': [
						'## Live demo\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'The following code runs model inference on a video:'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '4c7bb92e-e301-45a9-b5ff-f7953fad298f',
					'metadata': {},
					'outputs': [],
					'source': [
						'import collections\n',
						'import time\n',
						'import cv2\n',
						'from IPython import display\n',
						'import numpy as np\n',
						'\n',
						'\n',
						'def run_instance_segmentation(\n',
						'    source=0,\n',
						'    flip=False,\n',
						'    use_popup=False,\n',
						'    skip_first_frames=0,\n',
						'    model=seg_model,\n',
						'    device=device.value,\n',
						'    video_width=1280,\n',
						'):\n',
						'    player = None\n',
						'\n',
						'    ov_config = {}\n',
						'    if device != "CPU":\n',
						'        model.reshape({0: [1, 3, 640, 640]})\n',
						'    if "GPU" in device or ("AUTO" in device and "GPU" in core.available_devices):\n',
						'        ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'    compiled_model = core.compile_model(model, device, ov_config)\n',
						'\n',
						'    if seg_model.predictor is None:\n',
						'        custom = {"conf": 0.25, "batch": 1, "save": False, "mode": "predict"}  # method defaults\n',
						'        args = {**seg_model.overrides, **custom}\n',
						'        seg_model.predictor = seg_model._smart_load("predictor")(overrides=args, _callbacks=seg_model.callbacks)\n',
						'        seg_model.predictor.setup_model(model=seg_model.model)\n',
						'\n',
						'    seg_model.predictor.model.ov_compiled_model = compiled_model\n',
						'\n',
						'    try:\n',
						'        # Create a video player to play with target fps.\n',
						'        player = VideoPlayer(source=source, flip=flip, fps=30, skip_first_frames=skip_first_frames, width=video_width)\n',
						'        # Start capturing.\n',
						'        player.start()\n',
						'        if use_popup:\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(winname=title, flags=cv2.WINDOW_GUI_NORMAL | cv2.WINDOW_AUTOSIZE)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'        while True:\n',
						'            # Grab the frame.\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'            # If the frame is larger than video_width, reduce size to improve the performance.\n',
						'            # If more, increase size for better demo expirience.\n',
						'            scale = video_width / max(frame.shape)\n',
						'            frame = cv2.resize(\n',
						'                src=frame,\n',
						'                dsize=None,\n',
						'                fx=scale,\n',
						'                fy=scale,\n',
						'                interpolation=cv2.INTER_AREA,\n',
						'            )\n',
						'            # Get the results.\n',
						'            input_image = np.array(frame)\n',
						'\n',
						'            start_time = time.time()\n',
						'            detections = seg_model(input_image)\n',
						'            stop_time = time.time()\n',
						'            frame = detections[0].plot()\n',
						'\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Use processing times from last 200 frames.\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            _, f_width = frame.shape[:2]\n',
						'            # Mean processing time [ms].\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'            cv2.putText(\n',
						'                img=frame,\n',
						'                text=f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                org=(20, 40),\n',
						'                fontFace=cv2.FONT_HERSHEY_COMPLEX,\n',
						'                fontScale=f_width / 1000,\n',
						'                color=(0, 0, 255),\n',
						'                thickness=1,\n',
						'                lineType=cv2.LINE_AA,\n',
						'            )\n',
						'            # Use this workaround if there is flickering.\n',
						'            if use_popup:\n',
						'                cv2.imshow(winname=title, mat=frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # Encode numpy array to jpg.\n',
						'                _, encoded_img = cv2.imencode(ext=".jpg", img=frame, params=[cv2.IMWRITE_JPEG_QUALITY, 100])\n',
						'                # Create an IPython image.\n',
						'                i = display.Image(data=encoded_img)\n',
						'                # Display the image in this notebook.\n',
						'                display.clear_output(wait=True)\n',
						'                display.display(i)\n',
						'    # ctrl-c\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    # any different error\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        if player is not None:\n',
						'            # Stop capturing.\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()'
					]
				},
				{
					'attachments': {},
					'cell_type': 'markdown',
					'id': 'cc5b4ba6-f478-4417-b09d-93fee5adca41',
					'metadata': {},
					'source': [
						'### Run Live Object Detection and Segmentation\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'Use a webcam as the video input. By default, the primary webcam is set with `source=0`. If you have multiple webcams, each one will be assigned a consecutive number starting at 0. Set `flip=True` when using a front-facing camera. Some web browsers, especially Mozilla Firefox, may cause flickering. If you experience flickering, set `use_popup=True`.\n',
						'\n',
						'>**NOTE**: To use this notebook with a webcam, you need to run the notebook on a computer with a webcam. If you run the notebook on a remote server (for example, in Binder or Google Colab service), the webcam will not work. By default, the lower cell will run model inference on a video file. If you want to try live inference on your webcam set `WEBCAM_INFERENCE = True`'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '90708017',
					'metadata': {},
					'outputs': [],
					'source': [
						'WEBCAM_INFERENCE = False\n',
						'\n',
						'if WEBCAM_INFERENCE:\n',
						'    VIDEO_SOURCE = 0  # Webcam\n',
						'else:\n',
						'    if not Path("people.mp4").exists():\n',
						'        download_file(\n',
						'            "https://storage.openvinotoolkit.org/repositories/openvino_notebooks/data/data/video/people.mp4",\n',
						'            "people.mp4",\n',
						'        )\n',
						'    VIDEO_SOURCE = "people.mp4"'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': 'e8f1239c',
					'metadata': {},
					'outputs': [],
					'source': [
						'device'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'id': '440f2d0e',
					'metadata': {
						'tags': []
					},
					'outputs': [],
					'source': [
						'run_instance_segmentation(\n',
						'    source=VIDEO_SOURCE,\n',
						'    flip=True,\n',
						'    use_popup=False,\n',
						'    model=seg_ov_model,\n',
						'    device=device.value,\n',
						'    video_width=1280,\n',
						')'
					]
				}
			].map(fromJupyterCell)
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 },
			{ modified: 7, original: 7 },
			{ modified: 8, original: 8 },
			{ modified: 9, original: 9 },
			{ modified: 10, original: 10 },
			{ modified: 11, original: 11 },
			{ modified: 12, original: 12 },
			{ modified: 13, original: 13 },
			{ modified: 14, original: 14 },
			{ modified: 15, original: 15 },
			{ modified: 16, original: 16 },
			{ modified: 17, original: 17 },
			{ modified: 18, original: 18 },
			{ modified: 19, original: 19 },
			{ modified: 20, original: 20 },
			{ modified: 21, original: 21 },
			{ modified: 22, original: 22 },
			{ modified: 23, original: 23 },
			{ modified: 24, original: 24 },
			{ modified: 25, original: 25 },
			{ modified: 26, original: 26 },
			{ modified: 27, original: 27 },
			{ modified: 28, original: 28 },
			{ modified: 29, original: 29 },
			{ modified: 30, original: 30 },
			{ modified: 31, original: 31 },
			{ modified: 32, original: 32 },
			{ modified: 33, original: 33 },
			{ modified: 34, original: 34 },
			{ modified: 35, original: 35 },
			{ modified: 36, original: 36 },
			{ modified: 37, original: 37 },
			{ modified: 38, original: 38 },
			{ modified: 39, original: 39 },
			{ modified: 40, original: 40 },
			{ modified: 41, original: 41 },
			{ modified: 42, original: 42 },
			{ modified: 43, original: 43 },
			{ modified: 44, original: 44 },
			{ modified: 45, original: 45 },
			{ modified: 46, original: 46 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 5, originalLength: 2, modifiedStart: 5, modifiedLength: 2 } satisfies IDiffChange,
			{ originalStart: 25, originalLength: 1, modifiedStart: 25, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 42, originalLength: 1, modifiedStart: 42, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 44, originalLength: 1, modifiedStart: 44, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 46, originalLength: 1, modifiedStart: 46, modifiedLength: 1 } satisfies IDiffChange,
		]);

	});
	test('Modification of a large cell and insert a new cell', async () => {
		const { mapping, diff } = await mapCells(
			[
				{
					'cell_type': 'markdown',
					'id': 'e9d010ff-85ba-4e69-b439-ba89e4a3a715',
					'source': [
						'# Convert and Optimize YOLOv10 with OpenVINO\n',
						'\n',
						'Real-time object detection aims to accurately predict object categories and positions in images with low latency. The YOLO series has been at the forefront of this research due to its balance between performance and efficiency. However, reliance on NMS and architectural inefficiencies have hindered optimal performance. YOLOv10 addresses these issues by introducing consistent dual assignments for NMS-free training and a holistic efficiency-accuracy driven model design strategy.\n',
						'\n',
						'YOLOv10, built on the [Ultralytics Python package](https://pypi.org/project/ultralytics/) by researchers at [Tsinghua University](https://www.tsinghua.edu.cn/en/), introduces a new approach to real-time object detection, addressing both the post-processing and model architecture deficiencies found in previous YOLO versions. By eliminating non-maximum suppression (NMS) and optimizing various model components, YOLOv10 achieves state-of-the-art performance with significantly reduced computational overhead. Extensive experiments demonstrate its superior accuracy-latency trade-offs across multiple model scales.\n',
						'\n',
						'![yolov10-approach.png](https://github.com/ultralytics/ultralytics/assets/26833433/f9b1bec0-928e-41ce-a205-e12db3c4929a)\n',
						'\n',
						'More details about model architecture you can find in original [repo](https://github.com/THU-MIG/yolov10), [paper](https://arxiv.org/abs/2405.14458) and [Ultralytics documentation](https://docs.ultralytics.com/models/yolov10/).\n',
						'\n',
						'This tutorial demonstrates step-by-step instructions on how to run and optimize PyTorch YOLO V10 with OpenVINO.\n',
						'\n',
						'The tutorial consists of the following steps:\n',
						'\n',
						'- Prepare PyTorch model\n',
						'- Convert PyTorch model to OpenVINO IR\n',
						'- Run model inference with OpenVINO\n',
						'- Prepare and run optimization pipeline using NNCF\n',
						'- Compare performance of the FP16 and quantized models.\n',
						'- Run optimized model inference on video\n',
						'- Launch interactive Gradio demo\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Prerequisites](#Prerequisites)\n',
						'- [Download PyTorch model](#Download-PyTorch-model)\n',
						'- [Export PyTorch model to OpenVINO IR Format](#Export-PyTorch-model-to-OpenVINO-IR-Format)\n',
						'- [Run OpenVINO Inference on AUTO device using Ultralytics API](#Run-OpenVINO-Inference-on-AUTO-device-using-Ultralytics-API)\n',
						'- [Run OpenVINO Inference on selected device using Ultralytics API](#Run-OpenVINO-Inference-on-selected-device-using-Ultralytics-API)\n',
						'- [Optimize model using NNCF Post-training Quantization API](#Optimize-model-using-NNCF-Post-training-Quantization-API)\n',
						'    - [Prepare Quantization Dataset](#Prepare-Quantization-Dataset)\n',
						'    - [Quantize and Save INT8 model](#Quantize-and-Save-INT8-model)\n',
						'- [Run Optimized Model Inference](#Run-Optimized-Model-Inference)\n',
						'    - [Run Optimized Model on AUTO device](#Run-Optimized-Model-on-AUTO-device)\n',
						'    - [Run Optimized Model Inference on selected device](#Run-Optimized-Model-Inference-on-selected-device)\n',
						'- [Compare the Original and Quantized Models](#Compare-the-Original-and-Quantized-Models)\n',
						'    - [Model size](#Model-size)\n',
						'    - [Performance](#Performance)\n',
						'    - [FP16 model performance](#FP16-model-performance)\n',
						'    - [Int8 model performance](#Int8-model-performance)\n',
						'- [Live demo](#Live-demo)\n',
						'    - [Gradio Interactive Demo](#Gradio-Interactive-Demo)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/yolov10-optimization/yolov10-optimization.ipynb" />\n'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '144e86a1-c220-4e3b-a8b2-8eda443faf2d',
					'source': [
						'## Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'bf76580b-860a-4dcd-8b01-f494cdffe37e',
					'source': [
						'import os\n',
						'\n',
						'os.environ["GIT_CLONE_PROTECTION_ACTIVE"] = "false"\n',
						'\n',
						'%pip install -q "nncf>=2.11.0"\n',
						'%pip install -Uq "openvino>=2024.3.0"\n',
						'%pip install -q "git+https://github.com/THU-MIG/yolov10.git" --extra-index-url https://download.pytorch.org/whl/cpu\n',
						'%pip install -q "torch>=2.1" "torchvision>=0.16" tqdm opencv-python "gradio>=4.19" --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'cell_type': 'code',
					'id': '75772eac-565b-4234-82bf-f305e0c1ceda',
					'source': [
						'from pathlib import Path\n',
						'\n',
						'# Fetch `notebook_utils` module\n',
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'\n',
						'open("notebook_utils.py", "w").write(r.text)\n',
						'\n',
						'from notebook_utils import download_file, VideoPlayer, device_widget'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '2888d8b4-44f6-4418-bae4-f433ff28010b',
					'source': [
						'## Download PyTorch model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'There are several version of [YOLO V10](https://github.com/THU-MIG/yolov10/tree/main?tab=readme-ov-file#performance) models provided by model authors. Each of them has different characteristics depends on number of training parameters, performance and accuracy. For demonstration purposes we will use `yolov10n`, but the same steps are also applicable to other models in YOLO V10 series.'
					]
				},
				{
					'cell_type': 'code',
					'id': 'aea6315b-6a29-4f2a-96a9-eb3c1646a3a4',
					'source': [
						'models_dir = Path("./models")\n',
						'models_dir.mkdir(exist_ok=True)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'd828401e-b6bd-4796-a7b8-681957a159d4',
					'source': [
						'model_weights_url = "https://github.com/jameslahm/yolov10/releases/download/v1.0/yolov10n.pt"\n',
						'file_name = model_weights_url.split("/")[-1]\n',
						'model_name = file_name.replace(".pt", "")\n',
						'\n',
						'download_file(model_weights_url, directory=models_dir)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'dc21487d-dd79-4b56-b8e2-5b28c8d92ac8',
					'source': [
						'## Export PyTorch model to OpenVINO IR Format\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '8cfec0d6-fb55-4611-861b-326e892fcf09',
					'source': [
						'As it was discussed before, YOLO V10 code is designed on top of [Ultralytics](https://docs.ultralytics.com/) library and has similar interface with YOLO V8 (You can check [YOLO V8 notebooks](https://github.com/openvinotoolkit/openvino_notebooks/tree/latest/notebooks/yolov8-optimization) for more detailed instruction how to work with Ultralytics API). Ultralytics support OpenVINO model export using [export](https://docs.ultralytics.com/modes/export/) method of model class. Additionally, we can specify parameters responsible for target input size, static or dynamic input shapes and model precision (FP32/FP16/INT8). INT8 quantization can be additionally performed on export stage, but for making approach more flexible, we consider how to perform quantization using [NNCF](https://github.com/openvinotoolkit/nncf).'
					]
				},
				{
					'cell_type': 'code',
					'id': 'd488f564-c1d5-4c6a-9b4a-353a3ab749e6',
					'source': [
						'import types\n',
						'from ultralytics.utils import ops, yaml_load, yaml_save\n',
						'from ultralytics import YOLOv10\n',
						'import torch\n',
						'\n',
						'detection_labels = {\n',
						'    0: "person",\n',
						'    1: "bicycle",\n',
						'    2: "car",\n',
						'    3: "motorcycle",\n',
						'    4: "airplane",\n',
						'    5: "bus",\n',
						'    6: "train",\n',
						'    7: "truck",\n',
						'    8: "boat",\n',
						'    9: "traffic light",\n',
						'    10: "fire hydrant",\n',
						'    11: "stop sign",\n',
						'    12: "parking meter",\n',
						'    13: "bench",\n',
						'    14: "bird",\n',
						'    15: "cat",\n',
						'    16: "dog",\n',
						'    17: "horse",\n',
						'    18: "sheep",\n',
						'    19: "cow",\n',
						'    20: "elephant",\n',
						'    21: "bear",\n',
						'    22: "zebra",\n',
						'    23: "giraffe",\n',
						'    24: "backpack",\n',
						'    25: "umbrella",\n',
						'    26: "handbag",\n',
						'    27: "tie",\n',
						'    28: "suitcase",\n',
						'    29: "frisbee",\n',
						'    30: "skis",\n',
						'    31: "snowboard",\n',
						'    32: "sports ball",\n',
						'    33: "kite",\n',
						'    34: "baseball bat",\n',
						'    35: "baseball glove",\n',
						'    36: "skateboard",\n',
						'    37: "surfboard",\n',
						'    38: "tennis racket",\n',
						'    39: "bottle",\n',
						'    40: "wine glass",\n',
						'    41: "cup",\n',
						'    42: "fork",\n',
						'    43: "knife",\n',
						'    44: "spoon",\n',
						'    45: "bowl",\n',
						'    46: "banana",\n',
						'    47: "apple",\n',
						'    48: "sandwich",\n',
						'    49: "orange",\n',
						'    50: "broccoli",\n',
						'    51: "carrot",\n',
						'    52: "hot dog",\n',
						'    53: "pizza",\n',
						'    54: "donut",\n',
						'    55: "cake",\n',
						'    56: "chair",\n',
						'    57: "couch",\n',
						'    58: "potted plant",\n',
						'    59: "bed",\n',
						'    60: "dining table",\n',
						'    61: "toilet",\n',
						'    62: "tv",\n',
						'    63: "laptop",\n',
						'    64: "mouse",\n',
						'    65: "remote",\n',
						'    66: "keyboard",\n',
						'    67: "cell phone",\n',
						'    68: "microwave",\n',
						'    69: "oven",\n',
						'    70: "toaster",\n',
						'    71: "sink",\n',
						'    72: "refrigerator",\n',
						'    73: "book",\n',
						'    74: "clock",\n',
						'    75: "vase",\n',
						'    76: "scissors",\n',
						'    77: "teddy bear",\n',
						'    78: "hair drier",\n',
						'    79: "toothbrush",\n',
						'}\n',
						'\n',
						'\n',
						'def v10_det_head_forward(self, x):\n',
						'    one2one = self.forward_feat([xi.detach() for xi in x], self.one2one_cv2, self.one2one_cv3)\n',
						'    if not self.export:\n',
						'        one2many = super().forward(x)\n',
						'\n',
						'    if not self.training:\n',
						'        one2one = self.inference(one2one)\n',
						'        if not self.export:\n',
						'            return {"one2many": one2many, "one2one": one2one}\n',
						'        else:\n',
						'            assert self.max_det != -1\n',
						'            boxes, scores, labels = ops.v10postprocess(one2one.permute(0, 2, 1), self.max_det, self.nc)\n',
						'            return torch.cat(\n',
						'                [boxes, scores.unsqueeze(-1), labels.unsqueeze(-1).to(boxes.dtype)],\n',
						'                dim=-1,\n',
						'            )\n',
						'    else:\n',
						'        return {"one2many": one2many, "one2one": one2one}\n',
						'\n',
						'\n',
						'ov_model_path = models_dir / f"{model_name}_openvino_model/{model_name}.xml"\n',
						'if not ov_model_path.exists():\n',
						'    model = YOLOv10(models_dir / file_name)\n',
						'    model.model.model[-1].forward = types.MethodType(v10_det_head_forward, model.model.model[-1])\n',
						'    model.export(format="openvino", dynamic=True, half=True)\n',
						'    config = yaml_load(ov_model_path.parent / "metadata.yaml")\n',
						'    config["names"] = detection_labels\n',
						'    yaml_save(ov_model_path.parent / "metadata.yaml", config)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '8a23f621-f6cd-4bfd-8b98-24b8c0392761',
					'source': [
						'## Run OpenVINO Inference on AUTO device using Ultralytics API\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'Now, when we exported model to OpenVINO, we can load it directly into YOLOv10 class, where automatic inference backend will provide easy-to-use user experience to run OpenVINO YOLOv10 model on the similar level like for original PyTorch model. The code bellow demonstrates how to run inference OpenVINO exported model with Ultralytics API on single image. [AUTO device](https://github.com/openvinotoolkit/openvino_notebooks/tree/latest/notebooks/auto-device) will be used for launching model.'
					]
				},
				{
					'cell_type': 'code',
					'id': '7e8ed361-bf09-4398-ba15-e6c5dda73cd3',
					'source': [
						'ov_yolo_model = YOLOv10(ov_model_path.parent, task="detect")'
					]
				},
				{
					'cell_type': 'code',
					'id': '8a473286-59b8-498f-8541-df84f041e119',
					'source': [
						'from PIL import Image\n',
						'\n',
						'IMAGE_PATH = Path("./data/coco_bike.jpg")\n',
						'download_file(\n',
						'    url="https://storage.openvinotoolkit.org/repositories/openvino_notebooks/data/data/image/coco_bike.jpg",\n',
						'    filename=IMAGE_PATH.name,\n',
						'    directory=IMAGE_PATH.parent,\n',
						')'
					]
				},
				{
					'cell_type': 'code',
					'id': '7e116e81-0ad4-4b9e-9f5c-58680fd8f0c6',
					'source': [
						'res = ov_yolo_model(IMAGE_PATH, iou=0.45, conf=0.2)\n',
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '943b9b04-4b97-4395-99d1-695465de1140',
					'source': [
						'## Run OpenVINO Inference on selected device using Ultralytics API\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'In this part of notebook you can select inference device for running model inference to compare results with AUTO.'
					]
				},
				{
					'cell_type': 'code',
					'id': '41655bec-b006-4376-abbb-d6c8c09e89fb',
					'source': [
						'device = device_widget("CPU")\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'id': 'f284d5fd-12ba-4c08-afce-d8131ef7ad4d',
					'source': [
						'import openvino as ov\n',
						'\n',
						'core = ov.Core()\n',
						'\n',
						'ov_model = core.read_model(ov_model_path)\n',
						'\n',
						'# load model on selected device\n',
						'if "GPU" in device.value or "NPU" in device.value:\n',
						'    ov_model.reshape({0: [1, 3, 640, 640]})\n',
						'ov_config = {}\n',
						'if "GPU" in device.value:\n',
						'    ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'det_compiled_model = core.compile_model(ov_model, device.value, ov_config)'
					]
				},
				{
					'cell_type': 'code',
					'id': '12164d21-948a-4ef7-9e1c-b0d41c53cf91',
					'source': [
						'ov_yolo_model.predictor.model.ov_compiled_model = det_compiled_model'
					]
				},
				{
					'cell_type': 'code',
					'id': 'ecb9d396-ab1e-4398-a110-18c08b00ab14',
					'source': [
						'res = ov_yolo_model(IMAGE_PATH, iou=0.45, conf=0.2)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'a4abf758-3a72-4ee0-afde-38076602f1c7',
					'source': [
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '992b6ac3-4248-4848-8fd6-f9c1b9fc2051',
					'source': [
						'## Optimize model using NNCF Post-training Quantization API\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'[NNCF](https://github.com/openvinotoolkit/nncf) provides a suite of advanced algorithms for Neural Networks inference optimization in OpenVINO with minimal accuracy drop.\n',
						'We will use 8-bit quantization in post-training mode (without the fine-tuning pipeline) to optimize YOLOv10.\n',
						'\n',
						'The optimization process contains the following steps:\n',
						'\n',
						'1. Create a Dataset for quantization.\n',
						'2. Run `nncf.quantize` for getting an optimized model.\n',
						'3. Serialize OpenVINO IR model, using the `openvino.save_model` function.\n',
						'\n',
						'Quantization is time and memory consuming process, you can skip this step using checkbox bellow:'
					]
				},
				{
					'cell_type': 'code',
					'id': 'ed9d9ce5-8df9-4803-ae85-bf0744de914c',
					'source': [
						'import ipywidgets as widgets\n',
						'\n',
						'int8_model_det_path = models_dir / "int8" / f"{model_name}_openvino_model/{model_name}.xml"\n',
						'ov_yolo_int8_model = None\n',
						'\n',
						'to_quantize = widgets.Checkbox(\n',
						'    value=True,\n',
						'    description="Quantization",\n',
						'    disabled=False,\n',
						')\n',
						'\n',
						'to_quantize'
					]
				},
				{
					'cell_type': 'code',
					'id': '52287a23-b5ef-4c34-873a-32b398d26d1a',
					'source': [
						'# Fetch skip_kernel_extension module\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/skip_kernel_extension.py",\n',
						')\n',
						'open("skip_kernel_extension.py", "w").write(r.text)\n',
						'\n',
						'%load_ext skip_kernel_extension'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '89ba64af-aa73-4ed9-a2f9-527bd9ae8221',
					'source': [
						'### Prepare Quantization Dataset\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'For starting quantization, we need to prepare dataset. We will use validation subset from [MS COCO dataset](https://cocodataset.org/) for model quantization and Ultralytics validation data loader for preparing input data.'
					]
				},
				{
					'cell_type': 'code',
					'id': '5e10435e-9cd6-4f29-a865-721d6209314d',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'from zipfile import ZipFile\n',
						'\n',
						'from ultralytics.data.utils import DATASETS_DIR\n',
						'\n',
						'if not int8_model_det_path.exists():\n',
						'\n',
						'    DATA_URL = "http://images.cocodataset.org/zips/val2017.zip"\n',
						'    LABELS_URL = "https://github.com/ultralytics/yolov5/releases/download/v1.0/coco2017labels-segments.zip"\n',
						'    CFG_URL = "https://raw.githubusercontent.com/ultralytics/ultralytics/v8.1.0/ultralytics/cfg/datasets/coco.yaml"\n',
						'\n',
						'    OUT_DIR = DATASETS_DIR\n',
						'\n',
						'    DATA_PATH = OUT_DIR / "val2017.zip"\n',
						'    LABELS_PATH = OUT_DIR / "coco2017labels-segments.zip"\n',
						'    CFG_PATH = OUT_DIR / "coco.yaml"\n',
						'\n',
						'    download_file(DATA_URL, DATA_PATH.name, DATA_PATH.parent)\n',
						'    download_file(LABELS_URL, LABELS_PATH.name, LABELS_PATH.parent)\n',
						'    download_file(CFG_URL, CFG_PATH.name, CFG_PATH.parent)\n',
						'\n',
						'    if not (OUT_DIR / "coco/labels").exists():\n',
						'        with ZipFile(LABELS_PATH, "r") as zip_ref:\n',
						'            zip_ref.extractall(OUT_DIR)\n',
						'        with ZipFile(DATA_PATH, "r") as zip_ref:\n',
						'            zip_ref.extractall(OUT_DIR / "coco/images")'
					]
				},
				{
					'cell_type': 'code',
					'id': 'b0a14818-21fd-4c71-8e58-2297dfafaadd',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'from ultralytics.utils import DEFAULT_CFG\n',
						'from ultralytics.cfg import get_cfg\n',
						'from ultralytics.data.converter import coco80_to_coco91_class\n',
						'from ultralytics.data.utils import check_det_dataset\n',
						'\n',
						'if not int8_model_det_path.exists():\n',
						'    args = get_cfg(cfg=DEFAULT_CFG)\n',
						'    args.data = str(CFG_PATH)\n',
						'    det_validator = ov_yolo_model.task_map[ov_yolo_model.task]["validator"](args=args)\n',
						'\n',
						'    det_validator.data = check_det_dataset(args.data)\n',
						'    det_validator.stride = 32\n',
						'    det_data_loader = det_validator.get_dataloader(OUT_DIR / "coco", 1)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '83fa49f4-e40c-48c7-82a6-8ef56e20b343',
					'source': [
						'NNCF provides `nncf.Dataset` wrapper for using native framework dataloaders in quantization pipeline. Additionally, we specify transform function that will be responsible for preparing input data in model expected format.'
					]
				},
				{
					'cell_type': 'code',
					'id': '253f0e0f-131e-43b9-b1be-639d4b3d1fe5',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'import nncf\n',
						'from typing import Dict\n',
						'\n',
						'\n',
						'def transform_fn(data_item:Dict):\n',
						'    """\n',
						'    Quantization transform function. Extracts and preprocess input data from dataloader item for quantization.\n',
						'    Parameters:\n',
						'       data_item: Dict with data item produced by DataLoader during iteration\n',
						'    Returns:\n',
						'        input_tensor: Input data for quantization\n',
						'    """\n',
						`    input_tensor = det_validator.preprocess(data_item)['img'].numpy()\n`,
						'    return input_tensor\n',
						'\n',
						'if not int8_model_det_path.exists():\n',
						'    quantization_dataset = nncf.Dataset(det_data_loader, transform_fn)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'ff8a6372-2097-4308-a4e5-e4651242a8df',
					'source': [
						'### Quantize and Save INT8 model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'The `nncf.quantize` function provides an interface for model quantization. It requires an instance of the OpenVINO Model and quantization dataset. \n',
						'Optionally, some additional parameters for the configuration quantization process (number of samples for quantization, preset, ignored scope, etc.) can be provided. YOLOv10 model contains non-ReLU activation functions, which require asymmetric quantization of activations. To achieve a better result, we will use a `mixed` quantization preset. It provides symmetric quantization of weights and asymmetric quantization of activations.\n',
						'\n',
						'>**Note**: Model post-training quantization is time-consuming process. Be patient, it can take several minutes depending on your hardware.'
					]
				},
				{
					'cell_type': 'code',
					'id': '4c12ae38-239e-4fe1-8296-47567f98538c',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'import shutil\n',
						'\n',
						'if not int8_model_det_path.exists():\n',
						'    quantized_det_model = nncf.quantize(\n',
						'        ov_model,\n',
						'        quantization_dataset,\n',
						'        preset=nncf.QuantizationPreset.MIXED,\n',
						'    )\n',
						'\n',
						'    ov.save_model(quantized_det_model,  int8_model_det_path)\n',
						'    shutil.copy(ov_model_path.parent / "metadata.yaml", int8_model_det_path.parent / "metadata.yaml")'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '41b8a3eb-adb8-40cf-8602-311ff8d75a76',
					'source': [
						'## Run Optimized Model Inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						`The way of usage INT8 quantized model is the same like for model before quantization. Let's check inference result of quantized model on single image`
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'f438df41-d614-4cca-a746-a173d92dddf5',
					'source': [
						'### Run Optimized Model on AUTO device\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'af61303b-16bd-4206-b926-2c28b3a859a4',
					'source': [
						'%%skip not $to_quantize.value\n',
						'ov_yolo_int8_model = YOLOv10(int8_model_det_path.parent, task="detect")'
					]
				},
				{
					'cell_type': 'code',
					'id': 'db13b8dd-49a1-4046-8a1a-491eee095a1b',
					'source': [
						'%%skip not $to_quantize.value\n',
						'res = ov_yolo_int8_model(IMAGE_PATH, iou=0.45, conf=0.2)'
					]
				},
				{
					'cell_type': 'code',
					'id': '0423ba31-f0ee-4bfc-a18a-f7b870a9683d',
					'source': [
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '4b4f7118-e046-4f87-b403-87053f2b0ac3',
					'source': [
						'### Run Optimized Model Inference on selected device\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '142f22ae-6a8d-4578-b97f-4d9c77123418',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'id': '2f43767a-1994-4202-a411-4738c92223da',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'ov_config = {}\n',
						'if "GPU" in device.value or "NPU" in device.value:\n',
						'    ov_model.reshape({0: [1, 3, 640, 640]})\n',
						'ov_config = {}\n',
						'if "GPU" in device.value:\n',
						'    ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'\n',
						'quantized_det_model = core.read_model(int8_model_det_path)\n',
						'quantized_det_compiled_model = core.compile_model(quantized_det_model, device.value, ov_config)\n',
						'\n',
						'ov_yolo_int8_model.predictor.model.ov_compiled_model = quantized_det_compiled_model\n',
						'\n',
						'res = ov_yolo_int8_model(IMAGE_PATH,  iou=0.45, conf=0.2)'
					]
				},
				{
					'cell_type': 'code',
					'id': '51d64c7b-7595-41ca-87dd-4c85308f84d6',
					'source': [
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'c7b70f75-a706-4f24-a487-88a3ad645dd5',
					'source': [
						'## Compare the Original and Quantized Models\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'd6561246-a9e0-4cdf-8207-7e2f919d8582',
					'source': [
						'### Model size\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '43d84d15-75be-4430-a58b-61cfd8e08dd0',
					'source': [
						'ov_model_weights = ov_model_path.with_suffix(".bin")\n',
						'print(f"Size of FP16 model is {ov_model_weights.stat().st_size / 1024 / 1024:.2f} MB")\n',
						'if int8_model_det_path.exists():\n',
						'    ov_int8_weights = int8_model_det_path.with_suffix(".bin")\n',
						'    print(f"Size of model with INT8 compressed weights is {ov_int8_weights.stat().st_size / 1024 / 1024:.2f} MB")\n',
						'    print(f"Compression rate for INT8 model: {ov_model_weights.stat().st_size / ov_int8_weights.stat().st_size:.3f}")'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'f72b3d84-91f3-493c-8f4e-46598ffbd6d1',
					'source': [
						'### Performance\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'### FP16 model performance\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '909ea508-e007-4313-ab0f-bfa0e3906176',
					'source': [
						'!benchmark_app -m $ov_model_path -d $device.value -api async -shape "[1,3,640,640]" -t 15'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '9852a8ef-4c45-43dd-a9ef-53ca6f13c99e',
					'source': [
						'### Int8 model performance\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '8254626d-6c4f-4ca3-936f-a7c47e402e03',
					'source': [
						'if int8_model_det_path.exists():\n',
						'    !benchmark_app -m $int8_model_det_path -d $device.value -api async -shape "[1,3,640,640]" -t 15'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '12d35bc1-8101-45ea-8bd7-53720b98f5e5',
					'source': [
						'## Live demo\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'The following code runs model inference on a video:'
					]
				},
				{
					'cell_type': 'code',
					'id': '246bd379-b1d5-4eb2-928f-97c7c2455a92',
					'source': [
						'import collections\n',
						'import time\n',
						'from IPython import display\n',
						'import cv2\n',
						'import numpy as np\n',
						'\n',
						'\n',
						'# Main processing function to run object detection.\n',
						'def run_object_detection(\n',
						'    source=0,\n',
						'    flip=False,\n',
						'    use_popup=False,\n',
						'    skip_first_frames=0,\n',
						'    det_model=ov_yolo_int8_model,\n',
						'    device=device.value,\n',
						'):\n',
						'    player = None\n',
						'    try:\n',
						'        # Create a video player to play with target fps.\n',
						'        player = VideoPlayer(source=source, flip=flip, fps=30, skip_first_frames=skip_first_frames)\n',
						'        # Start capturing.\n',
						'        player.start()\n',
						'        if use_popup:\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(winname=title, flags=cv2.WINDOW_GUI_NORMAL | cv2.WINDOW_AUTOSIZE)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'        while True:\n',
						'            # Grab the frame.\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'            # If the frame is larger than full HD, reduce size to improve the performance.\n',
						'            scale = 1280 / max(frame.shape)\n',
						'            if scale < 1:\n',
						'                frame = cv2.resize(\n',
						'                    src=frame,\n',
						'                    dsize=None,\n',
						'                    fx=scale,\n',
						'                    fy=scale,\n',
						'                    interpolation=cv2.INTER_AREA,\n',
						'                )\n',
						'            # Get the results.\n',
						'            input_image = np.array(frame)\n',
						'\n',
						'            start_time = time.time()\n',
						'            detections = det_model(input_image, iou=0.45, conf=0.2, verbose=False)\n',
						'            stop_time = time.time()\n',
						'            frame = detections[0].plot()\n',
						'\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Use processing times from last 200 frames.\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            _, f_width = frame.shape[:2]\n',
						'            # Mean processing time [ms].\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'            cv2.putText(\n',
						'                img=frame,\n',
						'                text=f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                org=(20, 40),\n',
						'                fontFace=cv2.FONT_HERSHEY_COMPLEX,\n',
						'                fontScale=f_width / 1000,\n',
						'                color=(0, 0, 255),\n',
						'                thickness=1,\n',
						'                lineType=cv2.LINE_AA,\n',
						'            )\n',
						'            # Use this workaround if there is flickering.\n',
						'            if use_popup:\n',
						'                cv2.imshow(winname=title, mat=frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # Encode numpy array to jpg.\n',
						'                _, encoded_img = cv2.imencode(ext=".jpg", img=frame, params=[cv2.IMWRITE_JPEG_QUALITY, 100])\n',
						'                # Create an IPython image.\n',
						'                i = display.Image(data=encoded_img)\n',
						'                # Display the image in this notebook.\n',
						'                display.clear_output(wait=True)\n',
						'                display.display(i)\n',
						'    # ctrl-c\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    # any different error\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        if player is not None:\n',
						'            # Stop capturing.\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()'
					]
				},
				{
					'cell_type': 'code',
					'id': '8db930f4-fc41-4635-9248-deab2b6cfcb8',
					'source': [
						'use_int8 = widgets.Checkbox(\n',
						'    value=ov_yolo_int8_model is not None,\n',
						'    description="Use int8 model",\n',
						'    disabled=ov_yolo_int8_model is None,\n',
						')\n',
						'\n',
						'use_int8'
					]
				},
				{
					'cell_type': 'code',
					'id': '59e37135-1bdc-40ff-8789-b5b4491cab84',
					'source': [
						'WEBCAM_INFERENCE = False\n',
						'\n',
						'if WEBCAM_INFERENCE:\n',
						'    VIDEO_SOURCE = 0  # Webcam\n',
						'else:\n',
						'    download_file(\n',
						'        "https://storage.openvinotoolkit.org/repositories/openvino_notebooks/data/data/video/people.mp4",\n',
						'        directory="data",\n',
						'    )\n',
						'    VIDEO_SOURCE = "data/people.mp4"'
					]
				},
				{
					'cell_type': 'code',
					'id': '88c6f47c-1c47-451d-89ba-0a29760f5ec4',
					'source': [
						'run_object_detection(\n',
						'    det_model=ov_yolo_model if not use_int8.value else ov_yolo_int8_model,\n',
						'    source=VIDEO_SOURCE,\n',
						'    flip=True,\n',
						'    use_popup=False,\n',
						')'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '9f612d80-68e2-45f8-aa62-9f3a05ca9de8',
					'source': [
						'### Gradio Interactive Demo\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'ffdbe248-7086-4804-b4b9-c3dd454bf80c',
					'source': [
						'import gradio as gr\n',
						'\n',
						'\n',
						'def yolov10_inference(image, int8, conf_threshold, iou_threshold):\n',
						'    model = ov_yolo_model if not int8 else ov_yolo_int8_model\n',
						'    results = model(source=image, iou=iou_threshold, conf=conf_threshold, verbose=False)[0]\n',
						'    annotated_image = Image.fromarray(results.plot())\n',
						'\n',
						'    return annotated_image\n',
						'\n',
						'\n',
						'with gr.Blocks() as demo:\n',
						'    gr.HTML(\n',
						'        """\n',
						`    <h1 style='text-align: center'>\n`,
						'    YOLOv10: Real-Time End-to-End Object Detection using OpenVINO\n',
						'    </h1>\n',
						'    """\n',
						'    )\n',
						'    with gr.Row():\n',
						'        with gr.Column():\n',
						'            image = gr.Image(type="numpy", label="Image")\n',
						'            conf_threshold = gr.Slider(\n',
						'                label="Confidence Threshold",\n',
						'                minimum=0.1,\n',
						'                maximum=1.0,\n',
						'                step=0.1,\n',
						'                value=0.2,\n',
						'            )\n',
						'            iou_threshold = gr.Slider(\n',
						'                label="IoU Threshold",\n',
						'                minimum=0.1,\n',
						'                maximum=1.0,\n',
						'                step=0.1,\n',
						'                value=0.45,\n',
						'            )\n',
						'            use_int8 = gr.Checkbox(\n',
						'                value=ov_yolo_int8_model is not None,\n',
						'                visible=ov_yolo_int8_model is not None,\n',
						'                label="Use INT8 model",\n',
						'            )\n',
						'            yolov10_infer = gr.Button(value="Detect Objects")\n',
						'\n',
						'        with gr.Column():\n',
						'            output_image = gr.Image(type="pil", label="Annotated Image")\n',
						'\n',
						'        yolov10_infer.click(\n',
						'            fn=yolov10_inference,\n',
						'            inputs=[\n',
						'                image,\n',
						'                use_int8,\n',
						'                conf_threshold,\n',
						'                iou_threshold,\n',
						'            ],\n',
						'            outputs=[output_image],\n',
						'        )\n',
						'    examples = gr.Examples(\n',
						'        [\n',
						'            "data/coco_bike.jpg",\n',
						'        ],\n',
						'        inputs=[\n',
						'            image,\n',
						'        ],\n',
						'    )\n',
						'\n',
						'\n',
						'try:\n',
						'    demo.launch(debug=True)\n',
						'except Exception:\n',
						'    demo.launch(debug=True, share=True)'
					]
				}
			]
				.map(fromJupyterCell)
			,
			[
				{
					'cell_type': 'markdown',
					'id': 'e9d010ff-85ba-4e69-b439-ba89e4a3a715',
					'source': [
						'# Convert and Optimize YOLOv10 with OpenVINO\n',
						'\n',
						'Real-time object detection aims to accurately predict object categories and positions in images with low latency. The YOLO series has been at the forefront of this research due to its balance between performance and efficiency. However, reliance on NMS and architectural inefficiencies have hindered optimal performance. YOLOv10 addresses these issues by introducing consistent dual assignments for NMS-free training and a holistic efficiency-accuracy driven model design strategy.\n',
						'\n',
						'YOLOv10, built on the [Ultralytics Python package](https://pypi.org/project/ultralytics/) by researchers at [Tsinghua University](https://www.tsinghua.edu.cn/en/), introduces a new approach to real-time object detection, addressing both the post-processing and model architecture deficiencies found in previous YOLO versions. By eliminating non-maximum suppression (NMS) and optimizing various model components, YOLOv10 achieves state-of-the-art performance with significantly reduced computational overhead. Extensive experiments demonstrate its superior accuracy-latency trade-offs across multiple model scales.\n',
						'\n',
						'![yolov10-approach.png](https://github.com/ultralytics/ultralytics/assets/26833433/f9b1bec0-928e-41ce-a205-e12db3c4929a)\n',
						'\n',
						'More details about model architecture you can find in original [repo](https://github.com/THU-MIG/yolov10), [paper](https://arxiv.org/abs/2405.14458) and [Ultralytics documentation](https://docs.ultralytics.com/models/yolov10/).\n',
						'\n',
						'This tutorial demonstrates step-by-step instructions on how to run and optimize PyTorch YOLO V10 with OpenVINO.\n',
						'\n',
						'The tutorial consists of the following steps:\n',
						'\n',
						'- Prepare PyTorch model\n',
						'- Convert PyTorch model to OpenVINO IR\n',
						'- Run model inference with OpenVINO\n',
						'- Prepare and run optimization pipeline using NNCF\n',
						'- Compare performance of the FP16 and quantized models.\n',
						'- Run optimized model inference on video\n',
						'- Launch interactive Gradio demo\n',
						'\n',
						'#### Table of contents:\n',
						'\n',
						'- [Prerequisites](#Prerequisites)\n',
						'- [Download PyTorch model](#Download-PyTorch-model)\n',
						'- [Export PyTorch model to OpenVINO IR Format](#Export-PyTorch-model-to-OpenVINO-IR-Format)\n',
						'- [Run OpenVINO Inference on AUTO device using Ultralytics API](#Run-OpenVINO-Inference-on-AUTO-device-using-Ultralytics-API)\n',
						'- [Run OpenVINO Inference on selected device using Ultralytics API](#Run-OpenVINO-Inference-on-selected-device-using-Ultralytics-API)\n',
						'- [Optimize model using NNCF Post-training Quantization API](#Optimize-model-using-NNCF-Post-training-Quantization-API)\n',
						'    - [Prepare Quantization Dataset](#Prepare-Quantization-Dataset)\n',
						'    - [Quantize and Save INT8 model](#Quantize-and-Save-INT8-model)\n',
						'- [Run Optimized Model Inference](#Run-Optimized-Model-Inference)\n',
						'    - [Run Optimized Model on AUTO device](#Run-Optimized-Model-on-AUTO-device)\n',
						'    - [Run Optimized Model Inference on selected device](#Run-Optimized-Model-Inference-on-selected-device)\n',
						'- [Compare the Original and Quantized Models](#Compare-the-Original-and-Quantized-Models)\n',
						'    - [Model size](#Model-size)\n',
						'    - [Performance](#Performance)\n',
						'    - [FP16 model performance](#FP16-model-performance)\n',
						'    - [Int8 model performance](#Int8-model-performance)\n',
						'- [Live demo](#Live-demo)\n',
						'    - [Gradio Interactive Demo](#Gradio-Interactive-Demo)\n',
						'\n',
						'\n',
						'### Installation Instructions\n',
						'\n',
						'This is a self-contained example that relies solely on its own code.\n',
						'\n',
						'We recommend  running the notebook in a virtual environment. You only need a Jupyter server to start.\n',
						'For details, please refer to [Installation Guide](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/README.md#-installation-guide).\n',
						'\n',
						'<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5b5a4db0-7875-4bfb-bdbd-01698b5b1a77&file=notebooks/yolov10-optimization/yolov10-optimization.ipynb" />\n'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '144e86a1-c220-4e3b-a8b2-8eda443faf2d',
					'source': [
						'## Prerequisites\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'bf76580b-860a-4dcd-8b01-f494cdffe37e',
					'source': [
						'import os\n',
						'\n',
						'os.environ["GIT_CLONE_PROTECTION_ACTIVE"] = "false"\n',
						'\n',
						'%pip install -q "nncf>=2.11.0"\n',
						'%pip install -Uq "openvino>=2024.3.0"\n',
						'%pip install -q "git+https://github.com/THU-MIG/yolov10.git" --extra-index-url https://download.pytorch.org/whl/cpu\n',
						'%pip install -q "torch>=2.1" "torchvision>=0.16" tqdm opencv-python "gradio>=4.19" --extra-index-url https://download.pytorch.org/whl/cpu'
					]
				},
				{
					'cell_type': 'code',
					'id': '75772eac-565b-4234-82bf-f305e0c1ceda',
					'source': [
						'from pathlib import Path\n',
						'\n',
						'# Fetch `notebook_utils` module\n',
						'import requests\n',
						'\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/notebook_utils.py",\n',
						')\n',
						'\n',
						'open("notebook_utils.py", "w").write(r.text)\n',
						'\n',
						'from notebook_utils import download_file, VideoPlayer, device_widget'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '2888d8b4-44f6-4418-bae4-f433ff28010b',
					'source': [
						'## Download PyTorch model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'There are several version of [YOLO V10](https://github.com/THU-MIG/yolov10/tree/main?tab=readme-ov-file#performance) models provided by model authors. Each of them has different characteristics depends on number of training parameters, performance and accuracy. For demonstration purposes we will use `yolov10n`, but the same steps are also applicable to other models in YOLO V10 series.'
					]
				},
				{
					'cell_type': 'code',
					'id': 'aea6315b-6a29-4f2a-96a9-eb3c1646a3a4',
					'source': [
						'models_dir = Path("./models")\n',
						'models_dir.mkdir(exist_ok=True)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'd828401e-b6bd-4796-a7b8-681957a159d4',
					'source': [
						'model_weights_url = "https://github.com/jameslahm/yolov10/releases/download/v1.0/yolov10n.pt"\n',
						'file_name = model_weights_url.split("/")[-1]\n',
						'model_name = file_name.replace(".pt", "")\n',
						'\n',
						'download_file(model_weights_url, directory=models_dir)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'dc21487d-dd79-4b56-b8e2-5b28c8d92ac8',
					'source': [
						'## Export PyTorch model to OpenVINO IR Format\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '8cfec0d6-fb55-4611-861b-326e892fcf09',
					'source': [
						'As it was discussed before, YOLO V10 code is designed on top of [Ultralytics](https://docs.ultralytics.com/) library and has similar interface with YOLO V8 (You can check [YOLO V8 notebooks](https://github.com/openvinotoolkit/openvino_notebooks/tree/latest/notebooks/yolov8-optimization) for more detailed instruction how to work with Ultralytics API). Ultralytics support OpenVINO model export using [export](https://docs.ultralytics.com/modes/export/) method of model class. Additionally, we can specify parameters responsible for target input size, static or dynamic input shapes and model precision (FP32/FP16/INT8). INT8 quantization can be additionally performed on export stage, but for making approach more flexible, we consider how to perform quantization using [NNCF](https://github.com/openvinotoolkit/nncf).'
					]
				},
				{
					'cell_type': 'code',
					'id': 'd488f564-c1d5-4c6a-9b4a-353a3ab749e6',
					'source': [
						'import types\n',
						'from ultralytics.utils import ops, yaml_load, yaml_save\n',
						'from ultralytics import YOLOv10\n',
						'import torch\n',
						'\n',
						'detection_labels = {\n',
						'    0: "person",\n',
						'    1: "bicycle",\n',
						'    2: "car",\n',
						'    3: "motorcycle",\n',
						'    4: "airplane",\n',
						'    5: "bus",\n',
						'    6: "train",\n',
						'    7: "truck",\n',
						'    8: "boat",\n',
						'    9: "traffic light",\n',
						'    10: "fire hydrant",\n',
						'    11: "stop sign",\n',
						'    12: "parking meter",\n',
						'    13: "bench",\n',
						'    14: "bird",\n',
						'    15: "cat",\n',
						'    16: "dog",\n',
						'    17: "horse",\n',
						'    18: "sheep",\n',
						'    19: "cow",\n',
						'    20: "elephant",\n',
						'    21: "bear",\n',
						'    22: "zebra",\n',
						'    23: "giraffe",\n',
						'    24: "backpack",\n',
						'    25: "umbrella",\n',
						'    26: "handbag",\n',
						'    27: "tie",\n',
						'    28: "suitcase",\n',
						'    29: "frisbee",\n',
						'    30: "skis",\n',
						'    31: "snowboard",\n',
						'    32: "sports ball",\n',
						'    33: "kite",\n',
						'    34: "baseball bat",\n',
						'    35: "baseball glove",\n',
						'    36: "skateboard",\n',
						'    37: "surfboard",\n',
						'    38: "tennis racket",\n',
						'    39: "bottle",\n',
						'    40: "wine glass",\n',
						'    41: "cup",\n',
						'    42: "fork",\n',
						'    43: "knife",\n',
						'    44: "spoon",\n',
						'    45: "bowl",\n',
						'    46: "banana",\n',
						'    47: "apple",\n',
						'    48: "sandwich",\n',
						'    49: "orange",\n',
						'    50: "broccoli",\n',
						'    51: "carrot",\n',
						'    52: "hot dog",\n',
						'    53: "pizza",\n',
						'    54: "donut",\n',
						'    55: "cake",\n',
						'    56: "chair",\n',
						'    57: "couch",\n',
						'    58: "potted plant",\n',
						'    59: "bed",\n',
						'    60: "dining table",\n',
						'    61: "toilet",\n',
						'    62: "tv",\n',
						'    63: "laptop",\n',
						'    64: "mouse",\n',
						'    65: "remote",\n',
						'    66: "keyboard",\n',
						'    67: "cell phone",\n',
						'    68: "microwave",\n',
						'    69: "oven",\n',
						'    70: "toaster",\n',
						'    71: "sink",\n',
						'    72: "refrigerator",\n',
						'    73: "book",\n',
						'    74: "clock",\n',
						'    75: "vase",\n',
						'    76: "scissors",\n',
						'    77: "teddy bear",\n',
						'    78: "hair drier",\n',
						'    79: "toothbrush",\n',
						'}\n',
						'\n',
						'\n',
						'def v10_det_head_forward(self, x):\n',
						'    one2one = self.forward_feat([xi.detach() for xi in x], self.one2one_cv2, self.one2one_cv3)\n',
						'    if not self.export:\n',
						'        one2many = super().forward(x)\n',
						'\n',
						'    if not self.training:\n',
						'        one2one = self.inference(one2one)\n',
						'        if not self.export:\n',
						'            return {"one2many": one2many, "one2one": one2one}\n',
						'        else:\n',
						'            assert self.max_det != -1\n',
						'            boxes, scores, labels = ops.v10postprocess(one2one.permute(0, 2, 1), self.max_det, self.nc)\n',
						'            return torch.cat(\n',
						'                [boxes, scores.unsqueeze(-1), labels.unsqueeze(-1).to(boxes.dtype)],\n',
						'                dim=-1,\n',
						'            )\n',
						'    else:\n',
						'        return {"one2many": one2many, "one2one": one2one}\n',
						'\n',
						'\n',
						'ov_model_path = models_dir / f"{model_name}_openvino_model/{model_name}.xml"\n',
						'if not ov_model_path.exists():\n',
						'    model = YOLOv10(models_dir / file_name)\n',
						'    model.model.model[-1].forward = types.MethodType(v10_det_head_forward, model.model.model[-1])\n',
						'    model.export(format="openvino", dynamic=True, half=True)\n',
						'    config = yaml_load(ov_model_path.parent / "metadata.yaml")\n',
						'    config["names"] = detection_labels\n',
						'    yaml_save(ov_model_path.parent / "metadata.yaml", config)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '8a23f621-f6cd-4bfd-8b98-24b8c0392761',
					'source': [
						'## Run OpenVINO Inference on AUTO device using Ultralytics API\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'Now, when we exported model to OpenVINO, we can load it directly into YOLOv10 class, where automatic inference backend will provide easy-to-use user experience to run OpenVINO YOLOv10 model on the similar level like for original PyTorch model. The code bellow demonstrates how to run inference OpenVINO exported model with Ultralytics API on single image. [AUTO device](https://github.com/openvinotoolkit/openvino_notebooks/tree/latest/notebooks/auto-device) will be used for launching model.'
					]
				},
				{
					'cell_type': 'code',
					'id': '7e8ed361-bf09-4398-ba15-e6c5dda73cd3',
					'source': [
						'ov_yolo_model = YOLOv10(ov_model_path.parent, task="detect")'
					]
				},
				{
					'cell_type': 'code',
					'id': '8a473286-59b8-498f-8541-df84f041e119',
					'source': [
						'from PIL import Image\n',
						'\n',
						'IMAGE_PATH = Path("./data/coco_bike.jpg")\n',
						'download_file(\n',
						'    url="https://storage.openvinotoolkit.org/repositories/openvino_notebooks/data/data/image/coco_bike.jpg",\n',
						'    filename=IMAGE_PATH.name,\n',
						'    directory=IMAGE_PATH.parent,\n',
						')'
					]
				},
				{
					'cell_type': 'code',
					'id': '7e116e81-0ad4-4b9e-9f5c-58680fd8f0c6',
					'source': [
						'res = ov_yolo_model(IMAGE_PATH, iou=0.45, conf=0.2)\n',
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '943b9b04-4b97-4395-99d1-695465de1140',
					'source': [
						'## Run OpenVINO Inference on selected device using Ultralytics API\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'In this part of notebook you can select inference device for running model inference to compare results with AUTO.'
					]
				},
				{
					'cell_type': 'code',
					'id': '41655bec-b006-4376-abbb-d6c8c09e89fb',
					'source': [
						'device = device_widget("CPU")\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'id': 'f284d5fd-12ba-4c08-afce-d8131ef7ad4d',
					'source': [
						'import openvino as ov\n',
						'\n',
						'core = ov.Core()\n',
						'\n',
						'ov_model = core.read_model(ov_model_path)\n',
						'\n',
						'# load model on selected device\n',
						'if "GPU" in device.value or "NPU" in device.value:\n',
						'    ov_model.reshape({0: [1, 3, 640, 640]})\n',
						'ov_config = {}\n',
						'if "GPU" in device.value:\n',
						'    ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'det_compiled_model = core.compile_model(ov_model, device.value, ov_config)'
					]
				},
				{
					'cell_type': 'code',
					'id': '12164d21-948a-4ef7-9e1c-b0d41c53cf91',
					'source': [
						'ov_yolo_model.predictor.model.ov_compiled_model = det_compiled_model'
					]
				},
				{
					'cell_type': 'code',
					'id': 'ecb9d396-ab1e-4398-a110-18c08b00ab14',
					'source': [
						'res = ov_yolo_model(IMAGE_PATH, iou=0.45, conf=0.2)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'a4abf758-3a72-4ee0-afde-38076602f1c7',
					'source': [
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '992b6ac3-4248-4848-8fd6-f9c1b9fc2051',
					'source': [
						'## Optimize model using NNCF Post-training Quantization API\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'[NNCF](https://github.com/openvinotoolkit/nncf) provides a suite of advanced algorithms for Neural Networks inference optimization in OpenVINO with minimal accuracy drop.\n',
						'We will use 8-bit quantization in post-training mode (without the fine-tuning pipeline) to optimize YOLOv10.\n',
						'\n',
						'The optimization process contains the following steps:\n',
						'\n',
						'1. Create a Dataset for quantization.\n',
						'2. Run `nncf.quantize` for getting an optimized model.\n',
						'3. Serialize OpenVINO IR model, using the `openvino.save_model` function.\n',
						'\n',
						'Quantization is time and memory consuming process, you can skip this step using checkbox bellow:'
					]
				},
				{
					'cell_type': 'code',
					'id': 'ed9d9ce5-8df9-4803-ae85-bf0744de914c',
					'source': [
						'import ipywidgets as widgets\n',
						'\n',
						'int8_model_det_path = models_dir / "int8" / f"{model_name}_openvino_model/{model_name}.xml"\n',
						'ov_yolo_int8_model = None\n',
						'\n',
						'to_quantize = widgets.Checkbox(\n',
						'    value=True,\n',
						'    description="Quantization",\n',
						'    disabled=False,\n',
						')\n',
						'\n',
						'to_quantize'
					]
				},
				{
					'cell_type': 'code',
					'id': '52287a23-b5ef-4c34-873a-32b398d26d1a',
					'source': [
						'# Fetch skip_kernel_extension module\n',
						'r = requests.get(\n',
						'    url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/utils/skip_kernel_extension.py",\n',
						')\n',
						'open("skip_kernel_extension.py", "w").write(r.text)\n',
						'\n',
						'%load_ext skip_kernel_extension'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '89ba64af-aa73-4ed9-a2f9-527bd9ae8221',
					'source': [
						'### Prepare Quantization Dataset\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'For starting quantization, we need to prepare dataset. We will use validation subset from [MS COCO dataset](https://cocodataset.org/) for model quantization and Ultralytics validation data loader for preparing input data.'
					]
				},
				{
					'cell_type': 'code',
					'id': '5e10435e-9cd6-4f29-a865-721d6209314d',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'from zipfile import ZipFile\n',
						'\n',
						'from ultralytics.data.utils import DATASETS_DIR\n',
						'\n',
						'if not int8_model_det_path.exists():\n',
						'\n',
						'    DATA_URL = "http://images.cocodataset.org/zips/val2017.zip"\n',
						'    LABELS_URL = "https://github.com/ultralytics/yolov5/releases/download/v1.0/coco2017labels-segments.zip"\n',
						'    CFG_URL = "https://raw.githubusercontent.com/ultralytics/ultralytics/v8.1.0/ultralytics/cfg/datasets/coco.yaml"\n',
						'\n',
						'    OUT_DIR = DATASETS_DIR\n',
						'\n',
						'    DATA_PATH = OUT_DIR / "val2017.zip"\n',
						'    LABELS_PATH = OUT_DIR / "coco2017labels-segments.zip"\n',
						'    CFG_PATH = OUT_DIR / "coco.yaml"\n',
						'\n',
						'    download_file(DATA_URL, DATA_PATH.name, DATA_PATH.parent)\n',
						'    download_file(LABELS_URL, LABELS_PATH.name, LABELS_PATH.parent)\n',
						'    download_file(CFG_URL, CFG_PATH.name, CFG_PATH.parent)\n',
						'\n',
						'    if not (OUT_DIR / "coco/labels").exists():\n',
						'        with ZipFile(LABELS_PATH, "r") as zip_ref:\n',
						'            zip_ref.extractall(OUT_DIR)\n',
						'        with ZipFile(DATA_PATH, "r") as zip_ref:\n',
						'            zip_ref.extractall(OUT_DIR / "coco/images")'
					]
				},
				{
					'cell_type': 'code',
					'id': 'b0a14818-21fd-4c71-8e58-2297dfafaadd',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'from ultralytics.utils import DEFAULT_CFG\n',
						'from ultralytics.cfg import get_cfg\n',
						'from ultralytics.data.converter import coco80_to_coco91_class\n',
						'from ultralytics.data.utils import check_det_dataset\n',
						'\n',
						'if not int8_model_det_path.exists():\n',
						'    args = get_cfg(cfg=DEFAULT_CFG)\n',
						'    args.data = str(CFG_PATH)\n',
						'    det_validator = ov_yolo_model.task_map[ov_yolo_model.task]["validator"](args=args)\n',
						'\n',
						'    det_validator.data = check_det_dataset(args.data)\n',
						'    det_validator.stride = 32\n',
						'    det_data_loader = det_validator.get_dataloader(OUT_DIR / "coco", 1)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '83fa49f4-e40c-48c7-82a6-8ef56e20b343',
					'source': [
						'NNCF provides `nncf.Dataset` wrapper for using native framework dataloaders in quantization pipeline. Additionally, we specify transform function that will be responsible for preparing input data in model expected format.'
					]
				},
				{
					'cell_type': 'code',
					'id': '253f0e0f-131e-43b9-b1be-639d4b3d1fe5',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'import nncf\n',
						'from typing import Dict\n',
						'\n',
						'\n',
						'def transform_fn(data_item:Dict):\n',
						'    """\n',
						'    Quantization transform function. Extracts and preprocess input data from dataloader item for quantization.\n',
						'    Parameters:\n',
						'       data_item: Dict with data item produced by DataLoader during iteration\n',
						'    Returns:\n',
						'        input_tensor: Input data for quantization\n',
						'    """\n',
						`    input_tensor = det_validator.preprocess(data_item)['img'].numpy()\n`,
						'    return input_tensor\n',
						'\n',
						'if not int8_model_det_path.exists():\n',
						'    quantization_dataset = nncf.Dataset(det_data_loader, transform_fn)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'ff8a6372-2097-4308-a4e5-e4651242a8df',
					'source': [
						'### Quantize and Save INT8 model\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'The `nncf.quantize` function provides an interface for model quantization. It requires an instance of the OpenVINO Model and quantization dataset. \n',
						'Optionally, some additional parameters for the configuration quantization process (number of samples for quantization, preset, ignored scope, etc.) can be provided. YOLOv10 model contains non-ReLU activation functions, which require asymmetric quantization of activations. To achieve a better result, we will use a `mixed` quantization preset. It provides symmetric quantization of weights and asymmetric quantization of activations.\n',
						'\n',
						'>**Note**: Model post-training quantization is time-consuming process. Be patient, it can take several minutes depending on your hardware.'
					]
				},
				{
					'cell_type': 'code',
					'id': '4c12ae38-239e-4fe1-8296-47567f98538c',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'import shutil\n',
						'\n',
						'if not int8_model_det_path.exists():\n',
						'    quantized_det_model = nncf.quantize(\n',
						'        ov_model,\n',
						'        quantization_dataset,\n',
						'        preset=nncf.QuantizationPreset.MIXED,\n',
						'    )\n',
						'\n',
						'    ov.save_model(quantized_det_model,  int8_model_det_path)\n',
						'    shutil.copy(ov_model_path.parent / "metadata.yaml", int8_model_det_path.parent / "metadata.yaml")'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '41b8a3eb-adb8-40cf-8602-311ff8d75a76',
					'source': [
						'## Run Optimized Model Inference\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						`The way of usage INT8 quantized model is the same like for model before quantization. Let's check inference result of quantized model on single image`
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'f438df41-d614-4cca-a746-a173d92dddf5',
					'source': [
						'### Run Optimized Model on AUTO device\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': 'af61303b-16bd-4206-b926-2c28b3a859a4',
					'source': [
						'%%skip not $to_quantize.value\n',
						'ov_yolo_int8_model = YOLOv10(int8_model_det_path.parent, task="detect")'
					]
				},
				{
					'cell_type': 'code',
					'id': 'db13b8dd-49a1-4046-8a1a-491eee095a1b',
					'source': [
						'%%skip not $to_quantize.value\n',
						'res = ov_yolo_int8_model(IMAGE_PATH, iou=0.45, conf=0.2)'
					]
				},
				{
					'cell_type': 'code',
					'id': '0423ba31-f0ee-4bfc-a18a-f7b870a9683d',
					'source': [
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '4b4f7118-e046-4f87-b403-87053f2b0ac3',
					'source': [
						'### Run Optimized Model Inference on selected device\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '142f22ae-6a8d-4578-b97f-4d9c77123418',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'device'
					]
				},
				{
					'cell_type': 'code',
					'id': '2f43767a-1994-4202-a411-4738c92223da',
					'source': [
						'%%skip not $to_quantize.value\n',
						'\n',
						'ov_config = {}\n',
						'if "GPU" in device.value or "NPU" in device.value:\n',
						'    ov_model.reshape({0: [1, 3, 640, 640]})\n',
						'ov_config = {}\n',
						'if "GPU" in device.value:\n',
						'    ov_config = {"GPU_DISABLE_WINOGRAD_CONVOLUTION": "YES"}\n',
						'\n',
						'quantized_det_model = core.read_model(int8_model_det_path)\n',
						'quantized_det_compiled_model = core.compile_model(quantized_det_model, device.value, ov_config)\n',
						'\n',
						'ov_yolo_int8_model.predictor.model.ov_compiled_model = quantized_det_compiled_model\n',
						'\n',
						'res = ov_yolo_int8_model(IMAGE_PATH,  iou=0.45, conf=0.2)'
					]
				},
				{
					'cell_type': 'code',
					'id': '51d64c7b-7595-41ca-87dd-4c85308f84d6',
					'source': [
						'Image.fromarray(res[0].plot()[:, :, ::-1])'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'c7b70f75-a706-4f24-a487-88a3ad645dd5',
					'source': [
						'## Compare the Original and Quantized Models\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'd6561246-a9e0-4cdf-8207-7e2f919d8582',
					'source': [
						'### Model size\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '43d84d15-75be-4430-a58b-61cfd8e08dd0',
					'source': [
						'ov_model_weights = ov_model_path.with_suffix(".bin")\n',
						'print(f"Size of FP16 model is {ov_model_weights.stat().st_size / 1024 / 1024:.2f} MB")\n',
						'if int8_model_det_path.exists():\n',
						'    ov_int8_weights = int8_model_det_path.with_suffix(".bin")\n',
						'    print(f"Size of model with INT8 compressed weights is {ov_int8_weights.stat().st_size / 1024 / 1024:.2f} MB")\n',
						'    print(f"Compression rate for INT8 model: {ov_model_weights.stat().st_size / ov_int8_weights.stat().st_size:.3f}")'
					]
				},
				{
					'cell_type': 'markdown',
					'id': 'f72b3d84-91f3-493c-8f4e-46598ffbd6d1',
					'source': [
						'### Performance\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'### FP16 model performance\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '909ea508-e007-4313-ab0f-bfa0e3906176',
					'source': [
						'!benchmark_app -m $ov_model_path -d $device.value -api async -shape "[1,3,640,640]" -t 15'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '9852a8ef-4c45-43dd-a9ef-53ca6f13c99e',
					'source': [
						'### Int8 model performance\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '8254626d-6c4f-4ca3-936f-a7c47e402e03',
					'source': [
						'if int8_model_det_path.exists():\n',
						'    !benchmark_app -m $int8_model_det_path -d $device.value -api async -shape "[1,3,640,640]" -t 15'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '12d35bc1-8101-45ea-8bd7-53720b98f5e5',
					'source': [
						'## Live demo\n',
						'[back to top ⬆️](#Table-of-contents:)\n',
						'\n',
						'\n',
						'The following code runs model inference on a video:'
					]
				},
				{
					'cell_type': 'code',
					'id': '246bd379-b1d5-4eb2-928f-97c7c2455a92',
					'source': [
						'import collections\n',
						'import time\n',
						'from IPython import display\n',
						'import cv2\n',
						'import numpy as np\n',
						'\n',
						'\n',
						'# Main processing function to run object detection.\n',
						'def run_object_detection(\n',
						'    source=0,\n',
						'    flip=False,\n',
						'    use_popup=False,\n',
						'    skip_first_frames=0,\n',
						'    det_model=ov_yolo_int8_model,\n',
						'    device=device.value,\n',
						'):\n',
						'    player = None\n',
						'    try:\n',
						'        # Create a video player to play with target fps.\n',
						'        player = VideoPlayer(source=source, flip=flip, fps=30, skip_first_frames=skip_first_frames)\n',
						'        # Start capturing.\n',
						'        player.start()\n',
						'        if use_popup:\n',
						'            title = "Press ESC to Exit"\n',
						'            cv2.namedWindow(winname=title, flags=cv2.WINDOW_GUI_NORMAL | cv2.WINDOW_AUTOSIZE)\n',
						'\n',
						'        processing_times = collections.deque()\n',
						'        while True:\n',
						'            # Grab the frame.\n',
						'            frame = player.next()\n',
						'            if frame is None:\n',
						'                print("Source ended")\n',
						'                break\n',
						'            # If the frame is larger than full HD, reduce size to improve the performance.\n',
						'            scale = 1280 / max(frame.shape)\n',
						'            if scale < 1:\n',
						'                frame = cv2.resize(\n',
						'                    src=frame,\n',
						'                    dsize=None,\n',
						'                    fx=scale,\n',
						'                    fy=scale,\n',
						'                    interpolation=cv2.INTER_AREA,\n',
						'                )\n',
						'            # Get the results.\n',
						'            input_image = np.array(frame)\n',
						'\n',
						'            start_time = time.time()\n',
						'            detections = det_model(input_image, iou=0.45, conf=0.2, verbose=False)\n',
						'            stop_time = time.time()\n',
						'            frame = detections[0].plot()\n',
						'\n',
						'            processing_times.append(stop_time - start_time)\n',
						'            # Use processing times from last 200 frames.\n',
						'            if len(processing_times) > 200:\n',
						'                processing_times.popleft()\n',
						'\n',
						'            _, f_width = frame.shape[:2]\n',
						'            # Mean processing time [ms].\n',
						'            processing_time = np.mean(processing_times) * 1000\n',
						'            fps = 1000 / processing_time\n',
						'            cv2.putText(\n',
						'                img=frame,\n',
						'                text=f"Inference time: {processing_time:.1f}ms ({fps:.1f} FPS)",\n',
						'                org=(20, 40),\n',
						'                fontFace=cv2.FONT_HERSHEY_COMPLEX,\n',
						'                fontScale=f_width / 1000,\n',
						'                color=(0, 0, 255),\n',
						'                thickness=1,\n',
						'                lineType=cv2.LINE_AA,\n',
						'            )\n',
						'            # Use this workaround if there is flickering.\n',
						'            if use_popup:\n',
						'                cv2.imshow(winname=title, mat=frame)\n',
						'                key = cv2.waitKey(1)\n',
						'                # escape = 27\n',
						'                if key == 27:\n',
						'                    break\n',
						'            else:\n',
						'                # Encode numpy array to jpg.\n',
						'                _, encoded_img = cv2.imencode(ext=".jpg", img=frame, params=[cv2.IMWRITE_JPEG_QUALITY, 100])\n',
						'                # Create an IPython image.\n',
						'                i = display.Image(data=encoded_img)\n',
						'                # Display the image in this notebook.\n',
						'                display.clear_output(wait=True)\n',
						'                display.display(i)\n',
						'    # ctrl-c\n',
						'    except KeyboardInterrupt:\n',
						'        print("Interrupted")\n',
						'    # any different error\n',
						'    except RuntimeError as e:\n',
						'        print(e)\n',
						'    finally:\n',
						'        if player is not None:\n',
						'            # Stop capturing.\n',
						'            player.stop()\n',
						'        if use_popup:\n',
						'            cv2.destroyAllWindows()'
					]
				},
				{
					'cell_type': 'code',
					'id': '8db930f4-fc41-4635-9248-deab2b6cfcb8',
					'source': [
						'use_int8 = widgets.Checkbox(\n',
						'    value=ov_yolo_int8_model is not None,\n',
						'    description="Use int8 model",\n',
						'    disabled=ov_yolo_int8_model is None,\n',
						')\n',
						'\n',
						'use_int8'
					]
				},
				{
					'cell_type': 'code',
					'id': '59e37135-1bdc-40ff-8789-b5b4491cab84',
					'source': [
						'WEBCAM_INFERENCE = False\n',
						'\n',
						'if WEBCAM_INFERENCE:\n',
						'    VIDEO_SOURCE = 0  # Webcam\n',
						'else:\n',
						'    download_file(\n',
						'        "https://storage.openvinotoolkit.org/repositories/openvino_notebooks/data/data/video/people.mp4",\n',
						'        directory="data",\n',
						'    )\n',
						'    VIDEO_SOURCE = "data/people.mp4"'
					]
				},
				{
					'cell_type': 'code',
					'id': '88c6f47c-1c47-451d-89ba-0a29760f5ec4',
					'source': [
						'run_object_detection(\n',
						'    det_model=ov_yolo_model if not use_int8.value else ov_yolo_int8_model,\n',
						'    source=VIDEO_SOURCE,\n',
						'    flip=True,\n',
						'    use_popup=False,\n',
						')'
					]
				},
				{
					'cell_type': 'markdown',
					'id': '9f612d80-68e2-45f8-aa62-9f3a05ca9de8',
					'source': [
						'### Gradio Interactive Demo\n',
						'[back to top ⬆️](#Table-of-contents:)'
					]
				},
				{
					'cell_type': 'code',
					'id': '2e5a6249',
					'source': [
						'def yolov10_inference(image, int8, conf_threshold, iou_threshold):\n',
						'    model = ov_yolo_model if not int8 else ov_yolo_int8_model\n',
						'    results = model(source=image, iou=iou_threshold, conf=conf_threshold, verbose=False)[0]\n',
						'    annotated_image = Image.fromarray(results.plot())\n',
						'\n',
						'    return annotated_image'
					]
				},
				{
					'cell_type': 'code',
					'id': 'ffdbe248-7086-4804-b4b9-c3dd454bf80c',
					'source': [
						'if not Path("gradio_helper.py").exists():\n',
						'    r = requests.get(url="https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/latest/notebooks/yolov10-optimization/gradio_helper.py")\n',
						'    open("gradio_helper.py", "w").write(r.text)\n',
						'\n',
						'from gradio_helper import make_demo\n',
						'\n',
						'demo = make_demo(fn=yolov10_inference, quantized=ov_yolo_int8_model is not None)\n',
						'\n',
						'try:\n',
						'    demo.launch(debug=True)\n',
						'except Exception:\n',
						'    demo.launch(debug=True, share=True)\n',
						'# If you are launching remotely, specify server_name and server_port\n',
						'# EXAMPLE: `demo.launch(server_name=\'your server name\', server_port=\'server port in int\')`\n',
						'# To learn more please refer to the Gradio docs: https://gradio.app/docs/'
					]
				},
				{
					'cell_type': 'code',
					'id': '4b123c5e',
					'source': [
						'# please uncomment and run this cell for stopping gradio interface\n',
						'# demo.close()'
					]
				}
			].map(fromJupyterCell)
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 },
			{ modified: 7, original: 7 },
			{ modified: 8, original: 8 },
			{ modified: 9, original: 9 },
			{ modified: 10, original: 10 },
			{ modified: 11, original: 11 },
			{ modified: 12, original: 12 },
			{ modified: 13, original: 13 },
			{ modified: 14, original: 14 },
			{ modified: 15, original: 15 },
			{ modified: 16, original: 16 },
			{ modified: 17, original: 17 },
			{ modified: 18, original: 18 },
			{ modified: 19, original: 19 },
			{ modified: 20, original: 20 },
			{ modified: 21, original: 21 },
			{ modified: 22, original: 22 },
			{ modified: 23, original: 23 },
			{ modified: 24, original: 24 },
			{ modified: 25, original: 25 },
			{ modified: 26, original: 26 },
			{ modified: 27, original: 27 },
			{ modified: 28, original: 28 },
			{ modified: 29, original: 29 },
			{ modified: 30, original: 30 },
			{ modified: 31, original: 31 },
			{ modified: 32, original: 32 },
			{ modified: 33, original: 33 },
			{ modified: 34, original: 34 },
			{ modified: 35, original: 35 },
			{ modified: 36, original: 36 },
			{ modified: 37, original: 37 },
			{ modified: 38, original: 38 },
			{ modified: 39, original: 39 },
			{ modified: 40, original: 40 },
			{ modified: 41, original: 41 },
			{ modified: 42, original: 42 },
			{ modified: 43, original: 43 },
			{ modified: 44, original: 44 },
			{ modified: 45, original: 45 },
			{ modified: 46, original: 46 },
			{ modified: 47, original: 47 },
			{ modified: 48, original: 48 },
			{ modified: 49, original: 49 },
			{ modified: 50, original: 50 },
			{ modified: 51, original: 51 },
			{ modified: 52, original: 52 },
			{ modified: 53, original: -1 },
			{ modified: 54, original: -1 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 52, originalLength: 1, modifiedStart: 52, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 53, originalLength: 0, modifiedStart: 53, modifiedLength: 2 } satisfies IDiffChange,
		]);

	});
	test('Misalignment due to 2 deleted cells', async () => {
		const { mapping, diff } = await mapCells(
			[
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'F0Wut2G5kz2Z'
					},
					'source': [
						'[![Roboflow Notebooks](https://ik.imagekit.io/roboflow/notebooks/template/bannertest2-2.png?ik-sdk-version=javascript-1.4.3&updatedAt=1672932710194)](https://github.com/roboflow/notebooks)\n',
						'\n',
						'# Fast Segment Anything Model (FastSAM)\n',
						'\n',
						'---\n',
						'\n',
						'[![GitHub](https://badges.aleen42.com/src/github.svg)](https://github.com/CASIA-IVA-Lab/FastSAM)\n',
						'[![arXiv](https://img.shields.io/badge/arXiv-2306.12156-b31b1b.svg)](https://arxiv.org/pdf/2306.12156.pdf)\n',
						'[![YouTube](https://badges.aleen42.com/src/youtube.svg)](https://youtu.be/yHNPyqazYYU)\n',
						'[![Roboflow](https://raw.githubusercontent.com/roboflow-ai/notebooks/main/assets/badges/roboflow-blogpost.svg)](https://blog.roboflow.com/how-to-use-fastsam)\n',
						'\n',
						'The Fast Segment Anything Model (FastSAM) is a CNN Segment Anything Model trained by only 2% of the SA-1B dataset published by SAM authors.\n',
						'\n',
						'![fast-segment-anything-model-figure-1](https://media.roboflow.com/notebooks/examples/fast-sam-figure-1.png)\n',
						'\n',
						'The FastSAM authors claim it achieves comparable performance to the SAM method at 50 times the speed.\n',
						'\n',
						'![fast-segment-anything-model-figure-2](https://media.roboflow.com/notebooks/examples/fast-sam-figure-2.png)\n',
						'\n',
						'## Complementary Materials Covering SAM\n',
						'\n',
						'---\n',
						'\n',
						'[![GitHub](https://badges.aleen42.com/src/github.svg)](https://github.com/facebookresearch/segment-anything)\n',
						'[![arXiv](https://img.shields.io/badge/arXiv-2304.02643-b31b1b.svg)](https://arxiv.org/abs/2304.02643)\n',
						'[![Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/roboflow-ai/notebooks/blob/main/notebooks/how-to-segment-anything-with-sam.ipynb)\n',
						'[![YouTube](https://badges.aleen42.com/src/youtube.svg)](https://youtu.be/D-D6ZmadzPE)\n',
						'[![Roboflow](https://raw.githubusercontent.com/roboflow-ai/notebooks/main/assets/badges/roboflow-blogpost.svg)](https://blog.roboflow.com/how-to-use-segment-anything-model-sam)\n',
						'\n',
						'## Steps in this Tutorial\n',
						'\n',
						'In this tutorial, we are going to cover:\n',
						'\n',
						'- Before you start\n',
						'- Install FastSAM, SAM, and other dependencies\n',
						'- Download FastSAM and SAM weights\n',
						'- Download example data\n',
						'- Imports\n',
						'- Load FastSAM\n',
						'- FastSAM inference\n',
						'- FastSAM box prompt inference\n',
						'- FastSAM point prompt inference\n',
						'- FastSAM text prompt inference\n',
						'- SAM vs FastSAM\n',
						'- Roboflow benchmark dataset\n',
						'\n',
						`## 🔥 Let's begin!`
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'W4u6KjiVdNZM'
					},
					'source': [
						'## Before you start\n',
						'\n',
						'Let\'s make sure that we have access to GPU. We can use `nvidia-smi` command to do that. In case of any problems navigate to `Edit` -> `Notebook settings` -> `Hardware accelerator`, set it to `GPU`, and then click `Save`.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'Frcrk09FhJeV',
						'outputId': '683a378e-4a8f-4239-901b-037279e92e2b'
					},
					'outputs': [],
					'source': [
						'!nvidia-smi'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'PUACTM2zdmJI'
					},
					'source': [
						'**NOTE:** To make it easier for us to manage datasets, images and models we create a `HOME` constant.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'PRtHQpTNdnm7',
						'outputId': '2824c70d-dcf9-4006-b32d-adc6797fd708'
					},
					'outputs': [],
					'source': [
						'import os\n',
						'HOME = os.getcwd()\n',
						'print("HOME:", HOME)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'YN3DPGZSn57p'
					},
					'source': [
						'## Install FastSAM, SAM, and other dependencies'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'Vr3kcq1KfFir',
						'outputId': '234e5336-ba28-4114-d9e7-efd7f2752ca8'
					},
					'outputs': [],
					'source': [
						'%cd {HOME}\n',
						'\n',
						'# install FastSAM\n',
						'!git clone https://github.com/CASIA-IVA-Lab/FastSAM.git\n',
						'!pip -q install -r FastSAM/requirements.txt\n',
						'# install CLIP\n',
						'!pip -q install git+https://github.com/openai/CLIP.git\n',
						'# install SAM\n',
						'!pip -q install git+https://github.com/facebookresearch/segment-anything.git\n',
						'# install other dependencies\n',
						'!pip -q install roboflow supervision jupyter_bbox_widget'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'BMmgSfDWfFis'
					},
					'source': [
						'## Download FastSAM and SAM weights'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'ADpOBElSfFis',
						'outputId': 'b3d89d4c-e2ad-4f5e-a910-b52695263151'
					},
					'outputs': [],
					'source': [
						'!mkdir -p {HOME}/weights\n',
						'!wget -P {HOME}/weights -q https://huggingface.co/spaces/An-619/FastSAM/resolve/main/weights/FastSAM.pt\n',
						'!wget -P {HOME}/weights -q https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth\n',
						'!ls -lh {HOME}/weights'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': 'W6w1ck4z72sn'
					},
					'outputs': [],
					'source': [
						'FAST_SAM_CHECKPOINT_PATH = f"{HOME}/weights/FastSAM.pt"\n',
						'SAM_SAM_CHECKPOINT_PATH = f"{HOME}/weights/sam_vit_h_4b8939.pth"'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 't1ef2h1R9WMb'
					},
					'source': [
						'## Download example data\n',
						'\n',
						`**NONE:** Let's download few example images. Feel free to use your images or videos.`
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'CL4gVrnl9dmR',
						'outputId': 'db8f78d2-eaf4-41de-9d1f-e5fd6b588a87'
					},
					'outputs': [],
					'source': [
						'!mkdir -p {HOME}/data\n',
						'!wget -P {HOME}/data -q https://media.roboflow.com/notebooks/examples/dog.jpeg\n',
						'!wget -P {HOME}/data -q https://media.roboflow.com/notebooks/examples/robot.jpeg\n',
						'!ls -lh {HOME}/data'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'J_a_icikYiVN'
					},
					'source': [
						'## Imports\n',
						'\n',
						'**NOTE:** `FastSAM` code is not distributed via `pip` not it is packaged. Make sure to run code below from `{HOME}/FastSAM` directory. ⚠️'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'u_NVTXOwYppS',
						'outputId': 'b86184de-5827-4b9c-eb5c-959539abe699'
					},
					'outputs': [],
					'source': [
						'%cd {HOME}/FastSAM\n',
						'\n',
						'import os\n',
						'import cv2\n',
						'import torch\n',
						'import roboflow\n',
						'import base64\n',
						'\n',
						'import supervision as sv\n',
						'import numpy as np\n',
						'\n',
						'from roboflow import Roboflow\n',
						'from fastsam import FastSAM, FastSAMPrompt\n',
						'from segment_anything import sam_model_registry, SamAutomaticMaskGenerator, SamPredictor'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'a_Iizsy07pb7'
					},
					'source': [
						'## Load FastSAM'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': 'ao8tVDVq7ebG'
					},
					'outputs': [],
					'source': [
						`DEVICE = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')\n`,
						'print(f"DEVICE = {DEVICE}")\n',
						'fast_sam = FastSAM(FAST_SAM_CHECKPOINT_PATH)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'SvsRFtw_--Nn'
					},
					'source': [
						'## FastSAM inference\n',
						'\n',
						'* `retina_masks=True` determines whether the model uses retina masks for generating segmentation masks.\n',
						'* `imgsz=1024` sets the input image size to 1024x1024 pixels for processing by the model.\n',
						'* `conf=0.4` sets the minimum confidence threshold for object detection.\n',
						'* `iou=0.9` sets the minimum intersection over union threshold for non-maximum suppression to filter out duplicate detections.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': 'L49P5e-0Iaea'
					},
					'outputs': [],
					'source': [
						'IMAGE_PATH = f"{HOME}/data/dog.jpeg"'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'os.makedirs(f"{HOME}/output", exist_ok=True)\n',
						'output_image_path = f"{HOME}/output/output-{os.path.basename(IMAGE_PATH)}"'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'KV4XzCg1_fAS',
						'outputId': '1df75d90-cf73-4d78-feed-01911a81f6e4'
					},
					'outputs': [],
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.4,\n',
						'    iou=0.9)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.everything_prompt()\n',
						'prompt_process.plot(annotations=masks, output=f"{HOME}/output")'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'uPrxqbaBOBMw'
					},
					'source': [
						'**NOTE:** `prompt_process.everything_prompt` returns `torch.Tensor` when DEVICE = \'cuda:0\'. `prompt_process.everything_prompt` returns `numpy.ndarray` when DEVICE = \'cpu\'.'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'# Convert masks to boolean (True/False)\n',
						'def masks_to_bool(masks):\n',
						'    if type(masks) == np.ndarray:\n',
						'        masks = masks.astype(bool)\n',
						'    else:\n',
						'        masks = masks.cpu().numpy().astype(bool)\n',
						'    return masks'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': 'PUJkojNiKBQa'
					},
					'outputs': [],
					'source': [
						'def annotate_image(image_path: str, masks: np.ndarray) -> np.ndarray:\n',
						'    image = cv2.imread(image_path)\n',
						'\n',
						'    xyxy = sv.mask_to_xyxy(masks=masks)\n',
						'    detections = sv.Detections(xyxy=xyxy, mask=masks)\n',
						'\n',
						'    mask_annotator = sv.MaskAnnotator(color_lookup = sv.ColorLookup.INDEX)\n',
						'    return mask_annotator.annotate(scene=image.copy(), detections=detections)'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'wwtmiH6pLA8N',
						'outputId': '17948850-f051-4a1f-b2b8-d01c2a1f4f20'
					},
					'outputs': [],
					'source': [
						'masks = masks_to_bool(masks)\n',
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'jYkdczKoRUVB'
					},
					'source': [
						`**NOTE:** The quality of the generated masks is quite poor. Let's see if we can improve it by manipulating the parameters.`
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'dDFGi6EhO2ul',
						'outputId': 'f5a03357-eb37-446e-dce7-0659e4c2a368'
					},
					'outputs': [],
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.everything_prompt()'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'OiBPjQW-O59c',
						'outputId': 'afb011fc-933e-4d69-b4dd-e5e2713f407b'
					},
					'outputs': [],
					'source': [
						'masks = masks_to_bool(masks)\n',
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'GoymBQ16KJbv'
					},
					'source': [
						'## FastSAM box prompt inference'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'w1_T5SXpMNku'
					},
					'source': [
						'### Draw Box'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': '04-1G1WrMJUm'
					},
					'outputs': [],
					'source': [
						'# helper function that loads an image before adding it to the widget\n',
						'\n',
						'def encode_image(filepath):\n',
						`    with open(filepath, 'rb') as f:\n`,
						'        image_bytes = f.read()\n',
						`    encoded = str(base64.b64encode(image_bytes), 'utf-8')\n`,
						'    return "data:image/jpg;base64,"+encoded'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'xrxd-Ug9MSWG'
					},
					'source': [
						'**NOTE:** Execute cell below and use your mouse to draw bounding box on the image 👇'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 1000,
							'referenced_widgets': [
								'a747e095e21448f29d8697fb6b1a7a74',
								'6401ca8c2f574ba5ab62f0f06b9e0d06'
							]
						},
						'id': 'nLA7xmDIMTfx',
						'outputId': '06b51195-d54f-44ed-9236-258e94d624c5'
					},
					'outputs': [],
					'source': [
						'IS_COLAB = True\n',
						'\n',
						'if IS_COLAB:\n',
						'    from google.colab import output\n',
						'    output.enable_custom_widget_manager()\n',
						'\n',
						'from jupyter_bbox_widget import BBoxWidget\n',
						'\n',
						'widget = BBoxWidget()\n',
						'widget.image = encode_image(IMAGE_PATH)\n',
						'widget'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'td6tYT4INOyD',
						'outputId': '73a4e886-dcb8-447c-d3f7-1b3a6496e44d'
					},
					'outputs': [],
					'source': [
						'widget.bboxes'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'XfUvm9bwNUAe'
					},
					'source': [
						'### Generate mask with FastSAM'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': 'bI6kPDSROBI-'
					},
					'outputs': [],
					'source': [
						'# default_box is going to be used if you will not draw any box on image above\n',
						`default_box = {'x': 68, 'y': 247, 'width': 555, 'height': 678, 'label': ''}\n`,
						'\n',
						'box = widget.bboxes[0] if widget.bboxes else default_box\n',
						'box = [\n',
						`    box['x'],\n`,
						`    box['y'],\n`,
						`    box['x'] + box['width'],\n`,
						`    box['y'] + box['height']\n`,
						']'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'LF879hDqO5iB',
						'outputId': '4e7498c4-4007-4614-d46c-0e35608a04a2'
					},
					'outputs': [],
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.box_prompt(bbox=box)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'yt6i2sNJPEdk'
					},
					'source': [
						'**NOTE:** `prompt_process.box_prompt` returns `numy.ndarray`'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'EJThTct_PA68',
						'outputId': 'f6eddd24-f603-4702-8325-6cff7925fe0f'
					},
					'outputs': [],
					'source': [
						'masks = masks_to_bool(masks)\n',
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'vR-THJthhWH5'
					},
					'source': [
						'## FastSAM point prompt inference'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'xyfpOPPwhpMy'
					},
					'source': [
						'### Select point'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': 'OC7d3pZ3hop9'
					},
					'outputs': [],
					'source': [
						'point = [405, 505]'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'rE5tV4e3h6nG'
					},
					'source': [
						'### Generate mask with FastSAM'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': '31FIby6Zh-Wa',
						'outputId': 'a12c4d1c-837b-4b1b-9240-664797442413'
					},
					'outputs': [],
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.point_prompt(points=[point], pointlabel=[1])'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'd7tpVo8CiM3s'
					},
					'source': [
						'**NOTE:** `prompt_process.point_prompt` returns `numy.ndarray`'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'lMVpGxShiPky',
						'outputId': '224d84ee-e664-400b-c0df-49507d229f62'
					},
					'outputs': [],
					'source': [
						'masks = masks_to_bool(masks)\n',
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'HOC7v6ATHEr6'
					},
					'source': [
						'## FastSAM text prompt inference'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': '4CzLLtXOHeGk',
						'outputId': 'cecc50d8-e2be-4b33-850a-a2442e3e30b6'
					},
					'outputs': [],
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						`masks = prompt_process.text_prompt(text='cap')`
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'KYW79zD0OKsv'
					},
					'source': [
						'**NOTE:** `prompt_process.text_prompt` returns `numy.ndarray`'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'zODY5xU1LMCb',
						'outputId': 'a01540a7-deb3-4555-916c-2ac59928e0f3'
					},
					'outputs': [],
					'source': [
						'masks = masks_to_bool(masks)\n',
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'XFOUWUMZEk7m'
					},
					'source': [
						'##  SAM vs FastSAM'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': '7PKBZ7Hhahhw'
					},
					'outputs': [],
					'source': [
						'IMAGE_PATH = f"{HOME}/data/robot.jpeg"'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'c48hRY7dVJeL'
					},
					'source': [
						'### Load SAM'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': 'PdKpFCCmaETG'
					},
					'outputs': [],
					'source': [
						'MODEL_TYPE = "vit_h"\n',
						'\n',
						'sam = sam_model_registry[MODEL_TYPE](checkpoint=SAM_SAM_CHECKPOINT_PATH).to(device=DEVICE)\n',
						'mask_generator = SamAutomaticMaskGenerator(sam)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'V5bPGvtBaewO'
					},
					'source': [
						'### SAM inference'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': '0HgWsk1yalow'
					},
					'outputs': [],
					'source': [
						'image_bgr = cv2.imread(IMAGE_PATH)\n',
						'image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)\n',
						'\n',
						'sam_result = mask_generator.generate(image_rgb)\n',
						'sam_detections = sv.Detections.from_sam(sam_result=sam_result)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 't03RrSzMasN6'
					},
					'source': [
						'### FastSAM inference'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'xuFGLw8MavQI',
						'outputId': 'b0118973-1e29-419d-b7c0-2933b97d7ce5'
					},
					'outputs': [],
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.everything_prompt()\n',
						'masks = masks_to_bool(masks)\n',
						'xyxy = sv.mask_to_xyxy(masks=masks)\n',
						'fast_sam_detections = sv.Detections(xyxy=xyxy, mask=masks)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'IYn8xKySbBnc'
					},
					'source': [
						'### FastSAM vs. SAM'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 321
						},
						'id': 'c2Qj7sLjbDvo',
						'outputId': 'e85e3ed3-8b90-409d-cf95-877a6a9b2034'
					},
					'outputs': [],
					'source': [
						'mask_annotator = sv.MaskAnnotator(color_lookup = sv.ColorLookup.INDEX)\n',
						'\n',
						'sam_result = mask_annotator.annotate(scene=image_bgr.copy(), detections=sam_detections)\n',
						'fast_sam_result = mask_annotator.annotate(scene=image_bgr.copy(), detections=fast_sam_detections)\n',
						'\n',
						'sv.plot_images_grid(\n',
						'    images=[sam_result, fast_sam_result],\n',
						'    grid_size=(1, 2),\n',
						`    titles=['SAM', 'FastSAM']\n`,
						')'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'MfU4NQiGWQMC'
					},
					'source': [
						`**NOTE:** There is a lot going on in our test image. Let's plot our masks against a blank background.`
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 321
						},
						'id': 'PIrywlF5QRPz',
						'outputId': '8e7c84ae-7869-4523-847a-0678fd1aea53'
					},
					'outputs': [],
					'source': [
						'mask_annotator = sv.MaskAnnotator(color_lookup = sv.ColorLookup.INDEX)\n',
						'\n',
						'sam_result = mask_annotator.annotate(scene=np.zeros_like(image_bgr), detections=sam_detections)\n',
						'fast_sam_result = mask_annotator.annotate(scene=np.zeros_like(image_bgr), detections=fast_sam_detections)\n',
						'\n',
						'sv.plot_images_grid(\n',
						'    images=[sam_result, fast_sam_result],\n',
						'    grid_size=(1, 2),\n',
						`    titles=['SAM', 'FastSAM']\n`,
						')'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': '51Fs3sDGQmIt'
					},
					'source': [
						'### Mask diff\n',
						'\n',
						`**NOTE:** Let's try to understand which masks generated by SAM were not generated by FastSAM.`
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': 'O5bIUAhYQrqZ'
					},
					'outputs': [],
					'source': [
						'def compute_iou(mask1, mask2):\n',
						'    intersection = np.logical_and(mask1, mask2)\n',
						'    union = np.logical_or(mask1, mask2)\n',
						'    return np.sum(intersection) / np.sum(union)\n',
						'\n',
						'def filter_masks(mask_array1, mask_array2, threshold):\n',
						'    return np.array([mask1 for mask1 in mask_array1 if max(compute_iou(mask1, mask2) for mask2 in mask_array2) < threshold])'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 420
						},
						'id': '1GM4bL9sRbOm',
						'outputId': '421fb4f5-7a42-461b-ba1e-7cd46d2d7bd7'
					},
					'outputs': [],
					'source': [
						'diff_masks = filter_masks(sam_detections.mask, fast_sam_detections.mask, 0.5)\n',
						'diff_xyxy = sv.mask_to_xyxy(masks=diff_masks)\n',
						'diff_detections = sv.Detections(xyxy=diff_xyxy, mask=diff_masks)\n',
						'\n',
						'mask_annotator = sv.MaskAnnotator(color_lookup = sv.ColorLookup.INDEX)\n',
						'diff_result = mask_annotator.annotate(scene=np.zeros_like(image_bgr), detections=diff_detections)\n',
						'sv.plot_image(image=diff_result, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': '0lPZAZZulhF8'
					},
					'source': [
						'## Roboflow Benchmark Dataset'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'LWN6XwPuSZBY',
						'outputId': '86b18c0e-f6d6-486b-eee6-d004f13f531e'
					},
					'outputs': [],
					'source': [
						'%cd {HOME}\n',
						'\n',
						'roboflow.login()\n',
						'rf = Roboflow()\n',
						'\n',
						'project = rf.workspace("roboticfish").project("underwater_object_detection")\n',
						'dataset = project.version(10).download("yolov8")'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'id': 'T6-PaxWXTZ69'
					},
					'outputs': [],
					'source': [
						`IMAGE_PATH = os.path.join(dataset.location, 'train', 'images', 'IMG_2311_jpeg_jpg.rf.09ae6820eaff21dc838b1f9b6b20342b.jpg')`
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'p-gY5jf1Tife',
						'outputId': '630d35d8-26f4-4342-8d82-c7b61be26fe8'
					},
					'outputs': [],
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						`masks = prompt_process.text_prompt(text='Penguin')`
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': '3tBIH0yubHsW',
						'outputId': 'fc4d0a6a-53c1-4a2b-91f0-75c8f78e10fd'
					},
					'outputs': [],
					'source': [
						'masks = masks_to_bool(masks)\n',
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'gP9gEw9Tp8GJ'
					},
					'source': [
						'## 🏆 Congratulations\n',
						'\n',
						'### Learning Resources\n',
						'\n',
						'Roboflow has produced many resources that you may find interesting as you advance your knowledge of computer vision:\n',
						'\n',
						'- [Roboflow Notebooks](https://github.com/roboflow/notebooks): A repository of over 20 notebooks that walk through how to train custom models with a range of model types, from YOLOv7 to SegFormer.\n',
						'- [Roboflow YouTube](https://www.youtube.com/c/Roboflow): Our library of videos featuring deep dives into the latest in computer vision, detailed tutorials that accompany our notebooks, and more.\n',
						'- [Roboflow Discuss](https://discuss.roboflow.com/): Have a question about how to do something on Roboflow? Ask your question on our discussion forum.\n',
						'- [Roboflow Models](https://roboflow.com): Learn about state-of-the-art models and their performance. Find links and tutorials to guide your learning.\n',
						'\n',
						'### Convert data formats\n',
						'\n',
						'Roboflow provides free utilities to convert data between dozens of popular computer vision formats. Check out [Roboflow Formats](https://roboflow.com/formats) to find tutorials on how to convert data between formats in a few clicks.\n',
						'\n',
						'### Connect computer vision to your project logic\n',
						'\n',
						'[Roboflow Templates](https://roboflow.com/templates) is a public gallery of code snippets that you can use to connect computer vision to your project logic. Code snippets range from sending emails after inference to measuring object distance between detections.'
					]
				}
			]
				.map(fromJupyterCell)
			,
			[
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'F0Wut2G5kz2Z'
					},
					'source': [
						'[![Roboflow Notebooks](https://ik.imagekit.io/roboflow/notebooks/template/bannertest2-2.png?ik-sdk-version=javascript-1.4.3&updatedAt=1672932710194)](https://github.com/roboflow/notebooks)\n',
						'\n',
						'# Fast Segment Anything Model (FastSAM)\n',
						'\n',
						'---\n',
						'\n',
						'[![GitHub](https://badges.aleen42.com/src/github.svg)](https://github.com/CASIA-IVA-Lab/FastSAM)\n',
						'[![arXiv](https://img.shields.io/badge/arXiv-2306.12156-b31b1b.svg)](https://arxiv.org/pdf/2306.12156.pdf)\n',
						'[![YouTube](https://badges.aleen42.com/src/youtube.svg)](https://youtu.be/yHNPyqazYYU)\n',
						'[![Roboflow](https://raw.githubusercontent.com/roboflow-ai/notebooks/main/assets/badges/roboflow-blogpost.svg)](https://blog.roboflow.com/how-to-use-fastsam)\n',
						'\n',
						'The Fast Segment Anything Model (FastSAM) is a CNN Segment Anything Model trained by only 2% of the SA-1B dataset published by SAM authors.\n',
						'\n',
						'![fast-segment-anything-model-figure-1](https://media.roboflow.com/notebooks/examples/fast-sam-figure-1.png)\n',
						'\n',
						'The FastSAM authors claim it achieves comparable performance to the SAM method at 50 times the speed.\n',
						'\n',
						'![fast-segment-anything-model-figure-2](https://media.roboflow.com/notebooks/examples/fast-sam-figure-2.png)\n',
						'\n',
						'## Complementary Materials Covering SAM\n',
						'\n',
						'---\n',
						'\n',
						'[![GitHub](https://badges.aleen42.com/src/github.svg)](https://github.com/facebookresearch/segment-anything)\n',
						'[![arXiv](https://img.shields.io/badge/arXiv-2304.02643-b31b1b.svg)](https://arxiv.org/abs/2304.02643)\n',
						'[![Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/roboflow-ai/notebooks/blob/main/notebooks/how-to-segment-anything-with-sam.ipynb)\n',
						'[![YouTube](https://badges.aleen42.com/src/youtube.svg)](https://youtu.be/D-D6ZmadzPE)\n',
						'[![Roboflow](https://raw.githubusercontent.com/roboflow-ai/notebooks/main/assets/badges/roboflow-blogpost.svg)](https://blog.roboflow.com/how-to-use-segment-anything-model-sam)\n',
						'\n',
						'## Steps in this Tutorial\n',
						'\n',
						'In this tutorial, we are going to cover:\n',
						'\n',
						'- Before you start\n',
						'- Install FastSAM, SAM, and other dependencies\n',
						'- Download FastSAM and SAM weights\n',
						'- Download example data\n',
						'- Imports\n',
						'- Load FastSAM\n',
						'- FastSAM inference\n',
						'- FastSAM box prompt inference\n',
						'- FastSAM point prompt inference\n',
						'- FastSAM text prompt inference\n',
						'- SAM vs FastSAM\n',
						'- Roboflow benchmark dataset\n',
						'\n',
						`## 🔥 Let's begin!`
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'W4u6KjiVdNZM'
					},
					'source': [
						'## Before you start\n',
						'\n',
						'Let\'s make sure that we have access to GPU. We can use `nvidia-smi` command to do that. In case of any problems navigate to `Edit` -> `Notebook settings` -> `Hardware accelerator`, set it to `GPU`, and then click `Save`.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'Frcrk09FhJeV',
						'outputId': '683a378e-4a8f-4239-901b-037279e92e2b'
					},
					'source': [
						'!nvidia-smi'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'PUACTM2zdmJI'
					},
					'source': [
						'**NOTE:** To make it easier for us to manage datasets, images and models we create a `HOME` constant.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'PRtHQpTNdnm7',
						'outputId': '2824c70d-dcf9-4006-b32d-adc6797fd708'
					},
					'source': [
						'import os\n',
						'HOME = os.getcwd()\n',
						'print("HOME:", HOME)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'YN3DPGZSn57p'
					},
					'source': [
						'## Install FastSAM, SAM, and other dependencies'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'Vr3kcq1KfFir',
						'outputId': '234e5336-ba28-4114-d9e7-efd7f2752ca8'
					},
					'source': [
						'%cd {HOME}\n',
						'\n',
						'# install FastSAM\n',
						'!git clone https://github.com/CASIA-IVA-Lab/FastSAM.git\n',
						'!pip -q install -r FastSAM/requirements.txt\n',
						'# install CLIP\n',
						'!pip -q install git+https://github.com/openai/CLIP.git\n',
						'# install SAM\n',
						'!pip -q install git+https://github.com/facebookresearch/segment-anything.git\n',
						'# install other dependencies\n',
						'!pip -q install roboflow supervision jupyter_bbox_widget'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'BMmgSfDWfFis'
					},
					'source': [
						'## Download FastSAM and SAM weights'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'ADpOBElSfFis',
						'outputId': 'b3d89d4c-e2ad-4f5e-a910-b52695263151'
					},
					'source': [
						'!mkdir -p {HOME}/weights\n',
						'!wget -P {HOME}/weights -q https://huggingface.co/spaces/An-619/FastSAM/resolve/main/weights/FastSAM.pt\n',
						'!wget -P {HOME}/weights -q https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth\n',
						'!ls -lh {HOME}/weights'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': 'W6w1ck4z72sn'
					},
					'source': [
						'FAST_SAM_CHECKPOINT_PATH = f"{HOME}/weights/FastSAM.pt"\n',
						'SAM_SAM_CHECKPOINT_PATH = f"{HOME}/weights/sam_vit_h_4b8939.pth"'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 't1ef2h1R9WMb'
					},
					'source': [
						'## Download example data\n',
						'\n',
						`**NONE:** Let's download few example images. Feel free to use your images or videos.`
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'CL4gVrnl9dmR',
						'outputId': 'db8f78d2-eaf4-41de-9d1f-e5fd6b588a87'
					},
					'source': [
						'!mkdir -p {HOME}/data\n',
						'!wget -P {HOME}/data -q https://media.roboflow.com/notebooks/examples/dog.jpeg\n',
						'!wget -P {HOME}/data -q https://media.roboflow.com/notebooks/examples/robot.jpeg\n',
						'!ls -lh {HOME}/data'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'J_a_icikYiVN'
					},
					'source': [
						'## Imports\n',
						'\n',
						'**NOTE:** `FastSAM` code is not distributed via `pip` not it is packaged. Make sure to run code balow from `{HOME}/FastSAM` directory. ⚠️'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'u_NVTXOwYppS',
						'outputId': 'b86184de-5827-4b9c-eb5c-959539abe699'
					},
					'source': [
						'%cd {HOME}/FastSAM\n',
						'\n',
						'import os\n',
						'import cv2\n',
						'import torch\n',
						'import roboflow\n',
						'import base64\n',
						'\n',
						'import supervision as sv\n',
						'import numpy as np\n',
						'\n',
						'from roboflow import Roboflow\n',
						'from fastsam import FastSAM, FastSAMPrompt\n',
						'from segment_anything import sam_model_registry, SamAutomaticMaskGenerator, SamPredictor'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'a_Iizsy07pb7'
					},
					'source': [
						'## Load FastSAM'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': 'ao8tVDVq7ebG'
					},
					'source': [
						`DEVICE = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')\n`,
						'\n',
						'fast_sam = FastSAM(FAST_SAM_CHECKPOINT_PATH)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'SvsRFtw_--Nn'
					},
					'source': [
						'## FastSAM inference\n',
						'\n',
						'* `retina_masks=True` determines whether the model uses retina masks for generating segmentation masks.\n',
						'* `imgsz=1024` sets the input image size to 1024x1024 pixels for processing by the model.\n',
						'* `conf=0.4` sets the minimum confidence threshold for object detection.\n',
						'* `iou=0.9` sets the minimum intersection over union threshold for non-maximum suppression to filter out duplicate detections.'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': 'L49P5e-0Iaea'
					},
					'source': [
						'IMAGE_PATH = f"{HOME}/data/dog.jpeg"'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'KV4XzCg1_fAS',
						'outputId': '1df75d90-cf73-4d78-feed-01911a81f6e4'
					},
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.4,\n',
						'    iou=0.9)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.everything_prompt()\n',
						'prompt_process.plot(annotations=masks, output=f"{HOME}/output")'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'uPrxqbaBOBMw'
					},
					'source': [
						'**NOTE:** `prompt_process.everything_prompt` returns `torch.Tensor`'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': 'PUJkojNiKBQa'
					},
					'source': [
						'def annotate_image(image_path: str, masks: np.ndarray) -> np.ndarray:\n',
						'    image = cv2.imread(image_path)\n',
						'\n',
						'    xyxy = sv.mask_to_xyxy(masks=masks)\n',
						'    detections = sv.Detections(xyxy=xyxy, mask=masks)\n',
						'\n',
						'    mask_annotator = sv.MaskAnnotator()\n',
						'    return mask_annotator.annotate(scene=image.copy(), detections=detections)'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'wwtmiH6pLA8N',
						'outputId': '17948850-f051-4a1f-b2b8-d01c2a1f4f20'
					},
					'source': [
						'masks = masks.cpu().numpy().astype(bool)\n',
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'jYkdczKoRUVB'
					},
					'source': [
						`**NOTE:** The quality of the generated masks is quite poor. Let's see if we can improve it by manipulating the parameters.`
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'dDFGi6EhO2ul',
						'outputId': 'f5a03357-eb37-446e-dce7-0659e4c2a368'
					},
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.everything_prompt()'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'OiBPjQW-O59c',
						'outputId': 'afb011fc-933e-4d69-b4dd-e5e2713f407b'
					},
					'source': [
						'masks = masks.cpu().numpy().astype(bool)\n',
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'GoymBQ16KJbv'
					},
					'source': [
						'## FastSAM box prompt inference'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'w1_T5SXpMNku'
					},
					'source': [
						'### Draw Box'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': '04-1G1WrMJUm'
					},
					'source': [
						'# helper function that loads an image before adding it to the widget\n',
						'\n',
						'def encode_image(filepath):\n',
						`    with open(filepath, 'rb') as f:\n`,
						'        image_bytes = f.read()\n',
						`    encoded = str(base64.b64encode(image_bytes), 'utf-8')\n`,
						'    return "data:image/jpg;base64,"+encoded'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'xrxd-Ug9MSWG'
					},
					'source': [
						'**NOTE:** Execute cell below and use your mouse to draw bounding box on the image 👇'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 1000,
							'referenced_widgets': [
								'a747e095e21448f29d8697fb6b1a7a74',
								'6401ca8c2f574ba5ab62f0f06b9e0d06'
							]
						},
						'id': 'nLA7xmDIMTfx',
						'outputId': '06b51195-d54f-44ed-9236-258e94d624c5'
					},
					'source': [
						'IS_COLAB = True\n',
						'\n',
						'if IS_COLAB:\n',
						'    from google.colab import output\n',
						'    output.enable_custom_widget_manager()\n',
						'\n',
						'from jupyter_bbox_widget import BBoxWidget\n',
						'\n',
						'widget = BBoxWidget()\n',
						'widget.image = encode_image(IMAGE_PATH)\n',
						'widget'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'td6tYT4INOyD',
						'outputId': '73a4e886-dcb8-447c-d3f7-1b3a6496e44d'
					},
					'source': [
						'widget.bboxes'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'XfUvm9bwNUAe'
					},
					'source': [
						'### Generate mask with FastSAM'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': 'bI6kPDSROBI-'
					},
					'source': [
						'# default_box is going to be used if you will not draw any box on image above\n',
						`default_box = {'x': 68, 'y': 247, 'width': 555, 'height': 678, 'label': ''}\n`,
						'\n',
						'box = widget.bboxes[0] if widget.bboxes else default_box\n',
						'box = [\n',
						`    box['x'],\n`,
						`    box['y'],\n`,
						`    box['x'] + box['width'],\n`,
						`    box['y'] + box['height']\n`,
						']'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'LF879hDqO5iB',
						'outputId': '4e7498c4-4007-4614-d46c-0e35608a04a2'
					},
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.box_prompt(bbox=box)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'yt6i2sNJPEdk'
					},
					'source': [
						'**NOTE:** `prompt_process.box_prompt` returns `numy.ndarray`'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'EJThTct_PA68',
						'outputId': 'f6eddd24-f603-4702-8325-6cff7925fe0f'
					},
					'source': [
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'vR-THJthhWH5'
					},
					'source': [
						'## FastSAM point prompt inference'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'xyfpOPPwhpMy'
					},
					'source': [
						'### Select point'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': 'OC7d3pZ3hop9'
					},
					'source': [
						'point = [405, 505]'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'rE5tV4e3h6nG'
					},
					'source': [
						'### Generate mask with FastSAM'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': '31FIby6Zh-Wa',
						'outputId': 'a12c4d1c-837b-4b1b-9240-664797442413'
					},
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.point_prompt(points=[point], pointlabel=[1])'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'd7tpVo8CiM3s'
					},
					'source': [
						'**NOTE:** `prompt_process.point_prompt` returns `numy.ndarray`'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'lMVpGxShiPky',
						'outputId': '224d84ee-e664-400b-c0df-49507d229f62'
					},
					'source': [
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'HOC7v6ATHEr6'
					},
					'source': [
						'## FastSAM text prompt inference'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': '4CzLLtXOHeGk',
						'outputId': 'cecc50d8-e2be-4b33-850a-a2442e3e30b6'
					},
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						`masks = prompt_process.text_prompt(text='cap')`
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'KYW79zD0OKsv'
					},
					'source': [
						'**NOTE:** `prompt_process.text_prompt` returns `numy.ndarray`'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': 'zODY5xU1LMCb',
						'outputId': 'a01540a7-deb3-4555-916c-2ac59928e0f3'
					},
					'source': [
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'XFOUWUMZEk7m'
					},
					'source': [
						'##  SAM vs FastSAM'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': '7PKBZ7Hhahhw'
					},
					'source': [
						'IMAGE_PATH = f"{HOME}/data/robot.jpeg"'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'c48hRY7dVJeL'
					},
					'source': [
						'### Load SAM'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': 'PdKpFCCmaETG'
					},
					'source': [
						'MODEL_TYPE = "vit_h"\n',
						'\n',
						'sam = sam_model_registry[MODEL_TYPE](checkpoint=SAM_SAM_CHECKPOINT_PATH).to(device=DEVICE)\n',
						'mask_generator = SamAutomaticMaskGenerator(sam)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'V5bPGvtBaewO'
					},
					'source': [
						'### SAM inference'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': '0HgWsk1yalow'
					},
					'source': [
						'image_bgr = cv2.imread(IMAGE_PATH)\n',
						'image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)\n',
						'\n',
						'sam_result = mask_generator.generate(image_rgb)\n',
						'sam_detections = sv.Detections.from_sam(sam_result=sam_result)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 't03RrSzMasN6'
					},
					'source': [
						'### FastSAM inference'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'xuFGLw8MavQI',
						'outputId': 'b0118973-1e29-419d-b7c0-2933b97d7ce5'
					},
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						'masks = prompt_process.everything_prompt()\n',
						'masks = masks.cpu().numpy().astype(bool)\n',
						'xyxy = sv.mask_to_xyxy(masks=masks)\n',
						'fast_sam_detections = sv.Detections(xyxy=xyxy, mask=masks)'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'IYn8xKySbBnc'
					},
					'source': [
						'### FastSAM vs. SAM'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 321
						},
						'id': 'c2Qj7sLjbDvo',
						'outputId': 'e85e3ed3-8b90-409d-cf95-877a6a9b2034'
					},
					'source': [
						'mask_annotator = sv.MaskAnnotator()\n',
						'\n',
						'sam_result = mask_annotator.annotate(scene=image_bgr.copy(), detections=sam_detections)\n',
						'fast_sam_result = mask_annotator.annotate(scene=image_bgr.copy(), detections=fast_sam_detections)\n',
						'\n',
						'sv.plot_images_grid(\n',
						'    images=[sam_result, fast_sam_result],\n',
						'    grid_size=(1, 2),\n',
						`    titles=['SAM', 'FastSAM']\n`,
						')'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'MfU4NQiGWQMC'
					},
					'source': [
						`**NOTE:** There is a lot going on in our test image. Let's plot our masks against a blank background.`
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 321
						},
						'id': 'PIrywlF5QRPz',
						'outputId': '8e7c84ae-7869-4523-847a-0678fd1aea53'
					},
					'source': [
						'mask_annotator = sv.MaskAnnotator()\n',
						'\n',
						'sam_result = mask_annotator.annotate(scene=np.zeros_like(image_bgr), detections=sam_detections)\n',
						'fast_sam_result = mask_annotator.annotate(scene=np.zeros_like(image_bgr), detections=fast_sam_detections)\n',
						'\n',
						'sv.plot_images_grid(\n',
						'    images=[sam_result, fast_sam_result],\n',
						'    grid_size=(1, 2),\n',
						`    titles=['SAM', 'FastSAM']\n`,
						')'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': '51Fs3sDGQmIt'
					},
					'source': [
						'### Mask diff\n',
						'\n',
						`**NOTE:** Let's try to understand which masks generated by SAM were not generated by FastSAM.`
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': 'O5bIUAhYQrqZ'
					},
					'source': [
						'def compute_iou(mask1, mask2):\n',
						'    intersection = np.logical_and(mask1, mask2)\n',
						'    union = np.logical_or(mask1, mask2)\n',
						'    return np.sum(intersection) / np.sum(union)\n',
						'\n',
						'def filter_masks(mask_array1, mask_array2, threshold):\n',
						'    return np.array([mask1 for mask1 in mask_array1 if max(compute_iou(mask1, mask2) for mask2 in mask_array2) < threshold])'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 420
						},
						'id': '1GM4bL9sRbOm',
						'outputId': '421fb4f5-7a42-461b-ba1e-7cd46d2d7bd7'
					},
					'source': [
						'diff_masks = filter_masks(sam_detections.mask, fast_sam_detections.mask, 0.5)\n',
						'diff_xyxy = sv.mask_to_xyxy(masks=diff_masks)\n',
						'diff_detections = sv.Detections(xyxy=diff_xyxy, mask=diff_masks)\n',
						'\n',
						'mask_annotator = sv.MaskAnnotator()\n',
						'diff_result = mask_annotator.annotate(scene=np.zeros_like(image_bgr), detections=diff_detections)\n',
						'sv.plot_image(image=diff_result, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': '0lPZAZZulhF8'
					},
					'source': [
						'## Roboflow Benchmark Dataset'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'LWN6XwPuSZBY',
						'outputId': '86b18c0e-f6d6-486b-eee6-d004f13f531e'
					},
					'source': [
						'%cd {HOME}\n',
						'\n',
						'roboflow.login()\n',
						'rf = Roboflow()\n',
						'\n',
						'project = rf.workspace("roboticfish").project("underwater_object_detection")\n',
						'dataset = project.version(10).download("yolov8")'
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'id': 'T6-PaxWXTZ69'
					},
					'source': [
						`IMAGE_PATH = os.path.join(dataset.location, 'train', 'images', 'IMG_2311_jpeg_jpg.rf.09ae6820eaff21dc838b1f9b6b20342b.jpg')`
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/'
						},
						'id': 'p-gY5jf1Tife',
						'outputId': '630d35d8-26f4-4342-8d82-c7b61be26fe8'
					},
					'source': [
						'results = fast_sam(\n',
						'    source=IMAGE_PATH,\n',
						'    device=DEVICE,\n',
						'    retina_masks=True,\n',
						'    imgsz=1024,\n',
						'    conf=0.5,\n',
						'    iou=0.6)\n',
						'prompt_process = FastSAMPrompt(IMAGE_PATH, results, device=DEVICE)\n',
						`masks = prompt_process.text_prompt(text='Penguin')`
					]
				},
				{
					'cell_type': 'code',
					'metadata': {
						'colab': {
							'base_uri': 'https://localhost:8080/',
							'height': 653
						},
						'id': '3tBIH0yubHsW',
						'outputId': 'fc4d0a6a-53c1-4a2b-91f0-75c8f78e10fd'
					},
					'source': [
						'annotated_image=annotate_image(image_path=IMAGE_PATH, masks=masks)\n',
						'sv.plot_image(image=annotated_image, size=(8, 8))'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {
						'id': 'gP9gEw9Tp8GJ'
					},
					'source': [
						'## 🏆 Congratulations\n',
						'\n',
						'### Learning Resources\n',
						'\n',
						'Roboflow has produced many resources that you may find interesting as you advance your knowledge of computer vision:\n',
						'\n',
						'- [Roboflow Notebooks](https://github.com/roboflow/notebooks): A repository of over 20 notebooks that walk through how to train custom models with a range of model types, from YOLOv7 to SegFormer.\n',
						'- [Roboflow YouTube](https://www.youtube.com/c/Roboflow): Our library of videos featuring deep dives into the latest in computer vision, detailed tutorials that accompany our notebooks, and more.\n',
						'- [Roboflow Discuss](https://discuss.roboflow.com/): Have a question about how to do something on Roboflow? Ask your question on our discussion forum.\n',
						'- [Roboflow Models](https://roboflow.com): Learn about state-of-the-art models and their performance. Find links and tutorials to guide your learning.\n',
						'\n',
						'### Convert data formats\n',
						'\n',
						'Roboflow provides free utilities to convert data between dozens of popular computer vision formats. Check out [Roboflow Formats](https://roboflow.com/formats) to find tutorials on how to convert data between formats in a few clicks.\n',
						'\n',
						'### Connect computer vision to your project logic\n',
						'\n',
						'[Roboflow Templates](https://roboflow.com/templates) is a public gallery of code snippets that you can use to connect computer vision to your project logic. Code snippets range from sending emails after inference to measuring object distance between detections.'
					]
				}
			].map(fromJupyterCell)
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: 0 },
			{ modified: 1, original: 1 },
			{ modified: 2, original: 2 },
			{ modified: 3, original: 3 },
			{ modified: 4, original: 4 },
			{ modified: 5, original: 5 },
			{ modified: 6, original: 6 },
			{ modified: 7, original: 7 },
			{ modified: 8, original: 8 },
			{ modified: 9, original: 9 },
			{ modified: 10, original: 10 },
			{ modified: 11, original: 11 },
			{ modified: 12, original: 12 },
			{ modified: 13, original: 13 },
			{ modified: 14, original: 14 },
			{ modified: 15, original: 15 },
			{ modified: 16, original: 16 },
			{ modified: 17, original: 17 },
			{ modified: 18, original: 19 },
			{ modified: 19, original: 20 },
			{ modified: 20, original: 22 },
			{ modified: 21, original: 23 },
			{ modified: 22, original: 24 },
			{ modified: 23, original: 25 },
			{ modified: 24, original: 26 },
			{ modified: 25, original: 27 },
			{ modified: 26, original: 28 },
			{ modified: 27, original: 29 },
			{ modified: 28, original: 30 },
			{ modified: 29, original: 31 },
			{ modified: 30, original: 32 },
			{ modified: 31, original: 33 },
			{ modified: 32, original: 34 },
			{ modified: 33, original: 35 },
			{ modified: 34, original: 36 },
			{ modified: 35, original: 37 },
			{ modified: 36, original: 38 },
			{ modified: 37, original: 39 },
			{ modified: 38, original: 40 },
			{ modified: 39, original: 41 },
			{ modified: 40, original: 42 },
			{ modified: 41, original: 43 },
			{ modified: 42, original: 44 },
			{ modified: 43, original: 45 },
			{ modified: 44, original: 46 },
			{ modified: 45, original: 47 },
			{ modified: 46, original: 48 },
			{ modified: 47, original: 49 },
			{ modified: 48, original: 50 },
			{ modified: 49, original: 51 },
			{ modified: 50, original: 52 },
			{ modified: 51, original: 53 },
			{ modified: 52, original: 54 },
			{ modified: 53, original: 55 },
			{ modified: 54, original: 56 },
			{ modified: 55, original: 57 },
			{ modified: 56, original: 58 },
			{ modified: 57, original: 59 },
			{ modified: 58, original: 60 },
			{ modified: 59, original: 61 },
			{ modified: 60, original: 62 },
			{ modified: 61, original: 63 },
			{ modified: 62, original: 64 },
			{ modified: 63, original: 65 },
			{ modified: 64, original: 66 },
			{ modified: 65, original: 67 },
			{ modified: 66, original: 68 },
			{ modified: 67, original: 69 },
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 12, originalLength: 1, modifiedStart: 12, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 15, originalLength: 1, modifiedStart: 15, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 18, originalLength: 1, modifiedStart: 18, modifiedLength: 0 } satisfies IDiffChange,
			{ originalStart: 20, originalLength: 1, modifiedStart: 19, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 21, originalLength: 1, modifiedStart: 20, modifiedLength: 0 } satisfies IDiffChange,
			{ originalStart: 22, originalLength: 1, modifiedStart: 20, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 23, originalLength: 1, modifiedStart: 21, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 26, originalLength: 1, modifiedStart: 24, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 37, originalLength: 1, modifiedStart: 35, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 44, originalLength: 1, modifiedStart: 42, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 48, originalLength: 1, modifiedStart: 46, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 56, originalLength: 1, modifiedStart: 54, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 58, originalLength: 1, modifiedStart: 56, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 60, originalLength: 1, modifiedStart: 58, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 63, originalLength: 1, modifiedStart: 61, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 68, originalLength: 1, modifiedStart: 66, modifiedLength: 1 } satisfies IDiffChange,
			// { originalStart: 53, originalLength: 0, modifiedStart: 53, modifiedLength: 2 } satisfies IDiffChange,
		]);

	});
	test('Insert a few cells (one on top), modify a few and completely misaligned', async () => {
		const { mapping, diff } = await mapCells(
			[
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'import requests\n',
						'import pandas as pd\n',
						'import matplotlib.pyplot as plt\n',
						'from cachetools import cached, TTLCache\n',
						'from dotenv import load_dotenv'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'import os\n',
						'\n',
						'GITHUB_API_URL = "https://api.github.com"\n',
						'REPO_OWNER = "microsoft"\n',
						'ISSUE = 123  # Replace with your milestone number\n',
						'load_dotenv()\n',
						'TOKEN = os.getenv("GH")\n',
						'\n',
						'headers = {\n',
						'    "Authorization": f"Bearer {TOKEN}",\n',
						'    "Accept": "application/vnd.github+json"\n',
						'}'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'import csv\n',
						'from datetime import datetime\n',
						'import os\n',
						'\n',
						'def append_information(repo, open_issues_count, ):\n',
						'    file_exists = os.path.isfile(filename)\n',
						'    timestamp = datetime.utcnow().isoformat()\n',
						'\n',
						'    # Open the file in append mode\n',
						`    with open(filename, 'a', newline='', encoding='utf-8') as csvfile:\n`,
						'        writer = csv.writer(csvfile)\n',
						'\n',
						`        # If the file didn't exist before, write the header row\n`,
						'        if not file_exists:\n',
						'            writer.writerow([\n',
						'                "timestamp",\n',
						'                "repo",\n',
						'                "open_issues_count",\n',
						'                "open_prs_count",\n',
						'                "bug_issues_count",\n',
						'                "feature_request_issues_count",\n',
						'                "invalid_issues_count"\n',
						'            ])\n'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'def get_repo_issue_stats(owner, repo, token):\n',
						'    # Common GitHub GraphQL endpoint\n',
						'    url = "https://api.github.com/graphql"\n',
						'    headers = {\n',
						'        "Authorization": f"Bearer {token}",\n',
						'        "Accept": "application/vnd.github.v4+json"\n',
						'    }\n',
						'\n',
						'    # First query: Get various issue/PR counts from the repository object\n',
						'    query_repo = """\n',
						'    query ($owner: String!, $name: String!) {\n',
						'      repository(owner: $owner, name: $name) {\n',
						'        issues(states: OPEN) {\n',
						'          totalCount\n',
						'        }\n',
						'        pullRequests(states: OPEN) {\n',
						'          totalCount\n',
						'        }\n',
						'        bugIssues: issues(states: OPEN, labels: ["bug"]) {\n',
						'          totalCount\n',
						'        }\n',
						'        featureRequestIssues: issues(states: OPEN, labels: ["feature-request"]) {\n',
						'          totalCount\n',
						'        }\n',
						'      }\n',
						'    }\n',
						'    """\n'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'for REPO in REPOS:\n',
						'    stats = get_repo_issue_stats(OWNER, REPO, TOKEN)\n',
						'    print(stats)\n',
						'\n',
						'    append_metrics_to_csv(\n',
						'        filename="repo_metrics.csv",\n',
						'        repo=f"{OWNER}/{REPO}",\n',
						`        open_issues_count=stats['open_issues_count'],\n`,
						`        open_prs_count=stats['open_prs_count'],\n`,
						`        bug_issues_count=stats['bug_issues_count'],\n`,
						`        feature_request_issues_count=stats['feature_request_issues_count'],\n`,
						`        invalid_issues_count=stats['invalid_issues_count']\n`,
						'    )'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {},
					'source': [
						'# Plot'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'import pandas as pd\n',
						'import plotly.graph_objs as go\n',
						'from plotly.subplots import make_subplots\n',
						'\n',
						'def plot_repo_metrics(repo, csv_filename="repo_metrics.csv"):\n',
						'    # Load the CSV data\n',
						'    df = pd.read_csv(csv_filename)\n',
						'\n',
						'    fig.add_trace(go.Scatter(\n',
						`        x=df_repo['timestamp'],\n`,
						`        y=df_repo['open_issues_count'],\n`,
						`        mode='lines+markers',\n`,
						`        name='Open Issues',\n`,
						`        hovertemplate='Open Issues: %{y}<br>Time: %{x}<extra></extra>'\n`,
						'    ))\n'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'for REPO in REPOS:\n',
						'    plot_repo_metrics(f"{OWNER}/{REPO}")'
					]
				}
			]
				.map(fromJupyterCell)
			,
			[
				{
					'cell_type': 'markdown',
					'metadata': {},
					'source': [
						'# Fetch Data'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'import requests\n',
						'import sys\n',
						'import pandas as pd\n',
						'import matplotlib.pyplot as plt\n',
						'from cachetools import cached, TTLCache\n',
						'from dotenv import load_dotenv'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'import os\n',
						'\n',
						'GITHUB_API_URL = "https://api.github.com"\n',
						'REPO_OWNER = "microsoft"\n',
						'ISSUE = 123\n',
						'load_dotenv()\n',
						'TOKEN = os.getenv("GH")\n',
						'\n',
						'headers = {\n',
						'    "Authorization": f"Bearer {TOKEN}",\n',
						'    "Accept": "application/vnd.github+json"\n',
						'}'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'import csv\n',
						'from datetime import datetime\n',
						'import os\n',
						'\n',
						'def append_information(repo, open_issues_count, ):\n',
						'    file_exists = os.path.isfile(filename)\n',
						'    timestamp = datetime.utcnow().isoformat()\n',
						'\n',
						'    # Open the file in append mode\n',
						`    with open(filename, 'a', newline='', encoding='utf-8') as csvfile:\n`,
						'        writer = csv.writer(csvfile)\n',
						'\n',
						`        # If the file didn't exist before, write the header row\n`,
						'        if not file_exists:\n',
						'            writer.writerow([\n',
						'                "timestamp",\n',
						'                "repo",\n',
						'                "open_issues_count",\n',
						'                "open_prs_count",\n',
						'                "bug_issues_count",\n',
						'                "feature_request_issues_count",\n',
						'                "invalid_issues_count"\n',
						'            ])\n'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'def get_repo_issue_stats(owner, repo, token):\n',
						'    # Common GitHub GraphQL endpoint\n',
						'    url = "https://api.github.com/graphql"\n',
						'    headers = {\n',
						'        "Authorization": f"Bearer {token}",\n',
						'        "Accept": "application/vnd.github.v4+json"\n',
						'    }\n',
						'\n',
						'    # First query: Get various issue/PR counts from the repository object\n',
						'    query_repo = """\n',
						'    query ($owner: String!, $name: String!) {\n',
						'      repository(owner: $owner, name: $name) {\n',
						'        issues(states: OPEN) {\n',
						'          totalCount\n',
						'        }\n',
						'        pullRequests(states: OPEN) {\n',
						'          totalCount\n',
						'        }\n',
						'        bugIssues: issues(states: OPEN, labels: ["bug"]) {\n',
						'          totalCount\n',
						'        }\n',
						'        featureRequestIssues: issues(states: OPEN, labels: ["feature-request"]) {\n',
						'          totalCount\n',
						'        }\n',
						'      }\n',
						'    }\n',
						'    """\n'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'for REPO in REPOS:\n',
						'    stats = get_repo_issue_stats(OWNER, REPO, TOKEN)\n',
						'    print(stats)\n',
						'\n',
						'    append_metrics_to_csv(\n',
						'        filename="repo_metrics.csv",\n',
						'        repo=f"{OWNER}/{REPO}",\n',
						`        open_issues_count=stats['open_issues_count'],\n`,
						`        open_prs_count=stats['open_prs_count'],\n`,
						`        bug_issues_count=stats['bug_issues_count'],\n`,
						`        feature_request_issues_count=stats['feature_request_issues_count'],\n`,
						`        invalid_issues_count=stats['invalid_issues_count']\n`,
						'    )'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {},
					'source': [
						'# Plot'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'import pandas as pd\n',
						'import plotly.graph_objs as go\n',
						'from plotly.subplots import make_subplots\n',
						'\n',
						'def plot_repo_metrics(repo, csv_filename="repo_metrics.csv"):\n',
						'    # Load the CSV data\n',
						'    df = pd.read_csv(csv_filename)\n',
						'\n',
						'    fig.add_trace(go.Scatter(\n',
						`        x=df_repo['timestamp'],\n`,
						`        y=df_repo['open_issues_count'],\n`,
						`        mode='lines+markers',\n`,
						`        name='Open Issues',\n`,
						`        hovertemplate='Open Issues: %{y}<br>Time: %{x}<extra></extra>'\n`,
						'    ))\n'
					]
				},
				{
					'cell_type': 'markdown',
					'metadata': {},
					'source': [
						'## Header'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'for REPO in REPOS:\n',
						'    plot_repo_metrics(f"{OWNER}/{REPO}")'
					]
				},
				{
					'cell_type': 'code',
					'execution_count': null,
					'metadata': {},
					'outputs': [],
					'source': [
						'plot_repo_metrics(f"{OWNER}/vscode")'
					]
				}
			].map(fromJupyterCell)
		);

		assert.deepStrictEqual(mapping, [
			{ modified: 0, original: -1 },
			{ modified: 1, original: 0 },
			{ modified: 2, original: 1 },
			{ modified: 3, original: 2 },
			{ modified: 4, original: 3 },
			{ modified: 5, original: 4 },
			{ modified: 6, original: 5 },
			{ modified: 7, original: 6 },
			{ modified: 8, original: -1 },
			{ modified: 9, original: 7 },
			{ modified: 10, original: -1 }
		]);
		assert.deepStrictEqual(diff.cellsDiff.changes, [
			{ originalStart: 0, originalLength: 0, modifiedStart: 0, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 0, originalLength: 1, modifiedStart: 1, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 1, originalLength: 1, modifiedStart: 2, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 7, originalLength: 0, modifiedStart: 8, modifiedLength: 1 } satisfies IDiffChange,
			{ originalStart: 8, originalLength: 0, modifiedStart: 10, modifiedLength: 1 } satisfies IDiffChange,
		]);


	});

	let uriCounter = 0;
	async function mapCells(original: MockNotebookCell[], modified: MockNotebookCell[]) {
		const mapping = matchCellBasedOnSimilarties(modified.map(cellToDto), original.map(cellToDto)).map(mapping => ({ modified: mapping.modified, original: mapping.original }));
		const originalUri = URI.parse(`file://original${uriCounter++}.ipynb`);
		const modifiedUri = URI.parse(`file://modified${uriCounter++}.ipynb`);
		worker.$acceptNewModel(originalUri.toString(), {}, {}, original.map((cell, index) => cellToMainCellTdo(originalUri, cell, index)));
		worker.$acceptNewModel(modifiedUri.toString(), {}, {}, modified.map((cell, index) => cellToMainCellTdo(modifiedUri, cell, index)));
		const diff = await worker.$computeDiff(originalUri.toString(), modifiedUri.toString());
		diff.cellsDiff.changes = diff.cellsDiff.changes.map(change => {
			return {
				originalStart: change.originalStart,
				originalLength: change.originalLength,
				modifiedStart: change.modifiedStart,
				modifiedLength: change.modifiedLength,
			};
		});
		return { mapping, diff };
	}


	function cellToDto(cell: MockNotebookCell): { getValue(): string; getLinesContent(): string[]; cellKind: CellKind } {
		return {
			cellKind: cell[2],
			getValue: () => cell[0].join('\n'),
			getLinesContent: () => cell[0]
		};
	}

	function cellToMainCellTdo(notebookUri: URI, cell: MockNotebookCell, index: number): IMainCellDto {
		return {
			source: cell[0],
			language: cell[1],
			cellKind: cell[2],
			outputs: cell[3] || [],
			metadata: cell[4],
			eol: '\n',
			handle: index,
			url: URI.from({ scheme: 'file', path: notebookUri.path, fragment: `cell/${index}` }).toString(),
			versionId: 0,
			internalMetadata: undefined
		} satisfies IMainCellDto;

	}
	type MockNotebookCell = [
		lines: string[],
		lang: string,
		kind: CellKind,
		output?: IOutputDto[],
		metadata?: NotebookCellMetadata,
	];

	function fromJupyterCell(cell: { cell_type: string; source: string[] }): MockNotebookCell {
		return [
			cell.source,
			cell.cell_type === 'code' ? 'python' : 'markdown',
			cell.cell_type === 'code' ? CellKind.Code : CellKind.Markup,
		];
	}
});


