/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { ISequence, LcsDiff } from 'vs/base/common/diff/diff';
import { Mimes } from 'vs/base/common/mime';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/diff/eventDispatcher';
import { NotebookTextDiffEditor } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditor';
import { CellKind, INotebookTextModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { withTestNotebookDiffModel } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';

class CellSequence implements ISequence {

	constructor(readonly textModel: INotebookTextModel) {
	}

	getElements(): string[] | number[] | Int32Array {
		const hashValue = new Int32Array(this.textModel.cells.length);
		for (let i = 0; i < this.textModel.cells.length; i++) {
			hashValue[i] = this.textModel.cells[i].getHashValue();
		}

		return hashValue;
	}
}

suite('NotebookCommon', () => {
	const configurationService = new TestConfigurationService();
	ensureNoDisposablesAreLeakedInTestSuite();

	test('diff different source', async () => {
		await withTestNotebookDiffModel([
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			['y', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			assert.strictEqual(diffResult.changes.length, 1);
			assert.deepStrictEqual(diffResult.changes.map(change => ({
				originalStart: change.originalStart,
				originalLength: change.originalLength,
				modifiedStart: change.modifiedStart,
				modifiedLength: change.modifiedLength
			})), [{
				originalStart: 0,
				originalLength: 1,
				modifiedStart: 0,
				modifiedLength: 1
			}]);

			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffViewModels = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: diffResult
			}, undefined);
			assert.strictEqual(diffViewModels.viewModels.length, 1);
			assert.strictEqual(diffViewModels.viewModels[0].type, 'modified');
			diffViewModels.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('diff different output', async () => {
		await withTestNotebookDiffModel([
			['x', 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
			['', 'javascript', CellKind.Code, [], {}]
		], [
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			['', 'javascript', CellKind.Code, [], {}]
		], (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			assert.strictEqual(diffResult.changes.length, 1);
			assert.deepStrictEqual(diffResult.changes.map(change => ({
				originalStart: change.originalStart,
				originalLength: change.originalLength,
				modifiedStart: change.modifiedStart,
				modifiedLength: change.modifiedLength
			})), [{
				originalStart: 0,
				originalLength: 1,
				modifiedStart: 0,
				modifiedLength: 1
			}]);

			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffViewModels = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: diffResult
			}, undefined);
			assert.strictEqual(diffViewModels.viewModels.length, 2);
			assert.strictEqual(diffViewModels.viewModels[0].type, 'modified');
			assert.strictEqual(diffViewModels.viewModels[1].type, 'unchanged');

			diffViewModels.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('diff test small source', async () => {
		await withTestNotebookDiffModel([
			['123456789', 'javascript', CellKind.Code, [], {}]
		], [
			['987654321', 'javascript', CellKind.Code, [], {}],
		], (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			assert.strictEqual(diffResult.changes.length, 1);
			assert.deepStrictEqual(diffResult.changes.map(change => ({
				originalStart: change.originalStart,
				originalLength: change.originalLength,
				modifiedStart: change.modifiedStart,
				modifiedLength: change.modifiedLength
			})), [{
				originalStart: 0,
				originalLength: 1,
				modifiedStart: 0,
				modifiedLength: 1
			}]);

			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffViewModels = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: diffResult
			}, undefined);
			assert.strictEqual(diffViewModels.viewModels.length, 1);
			assert.strictEqual(diffViewModels.viewModels[0].type, 'modified');

			diffViewModels.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('diff test data single cell', async () => {
		await withTestNotebookDiffModel([
			[[
				'# This version has a bug\n',
				'def mult(a, b):\n',
				'    return a / b'
			].join(''), 'javascript', CellKind.Code, [], {}]
		], [
			[[
				'def mult(a, b):\n',
				'    \'This version is debugged.\'\n',
				'    return a * b'
			].join(''), 'javascript', CellKind.Code, [], {}],
		], (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			assert.strictEqual(diffResult.changes.length, 1);
			assert.deepStrictEqual(diffResult.changes.map(change => ({
				originalStart: change.originalStart,
				originalLength: change.originalLength,
				modifiedStart: change.modifiedStart,
				modifiedLength: change.modifiedLength
			})), [{
				originalStart: 0,
				originalLength: 1,
				modifiedStart: 0,
				modifiedLength: 1
			}]);

			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffViewModels = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: diffResult
			}, undefined);
			assert.strictEqual(diffViewModels.viewModels.length, 1);
			assert.strictEqual(diffViewModels.viewModels[0].type, 'modified');

			diffViewModels.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('diff foo/foe', async () => {
		await withTestNotebookDiffModel([
			[['def foe(x, y):\n', '    return x + y\n', 'foe(3, 2)'].join(''), 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
			[['def foo(x, y):\n', '    return x * y\n', 'foo(1, 2)'].join(''), 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
			['', 'javascript', CellKind.Code, [], {}]
		], [
			[['def foo(x, y):\n', '    return x * y\n', 'foo(1, 2)'].join(''), 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
			[['def foe(x, y):\n', '    return x + y\n', 'foe(3, 2)'].join(''), 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
			['', 'javascript', CellKind.Code, [], {}]
		], (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffViewModels = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: diffResult
			}, undefined);
			assert.strictEqual(diffViewModels.viewModels.length, 3);
			assert.strictEqual(diffViewModels.viewModels[0].type, 'modified');
			assert.strictEqual(diffViewModels.viewModels[1].type, 'modified');
			assert.strictEqual(diffViewModels.viewModels[2].type, 'unchanged');

			diffViewModels.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('diff markdown', async () => {
		await withTestNotebookDiffModel([
			['This is a test notebook with only markdown cells', 'markdown', CellKind.Markup, [], {}],
			['Lorem ipsum dolor sit amet', 'markdown', CellKind.Markup, [], {}],
			['In other news', 'markdown', CellKind.Markup, [], {}],
		], [
			['This is a test notebook with markdown cells only', 'markdown', CellKind.Markup, [], {}],
			['Lorem ipsum dolor sit amet', 'markdown', CellKind.Markup, [], {}],
			['In the news', 'markdown', CellKind.Markup, [], {}],
		], (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffViewModels = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: diffResult
			}, undefined);
			assert.strictEqual(diffViewModels.viewModels.length, 3);
			assert.strictEqual(diffViewModels.viewModels[0].type, 'modified');
			assert.strictEqual(diffViewModels.viewModels[1].type, 'unchanged');
			assert.strictEqual(diffViewModels.viewModels[2].type, 'modified');

			diffViewModels.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('diff insert', async () => {
		await withTestNotebookDiffModel([
			['var a = 1;', 'javascript', CellKind.Code, [], {}],
			['var b = 2;', 'javascript', CellKind.Code, [], {}]
		], [
			['var h = 8;', 'javascript', CellKind.Code, [], {}],
			['var a = 1;', 'javascript', CellKind.Code, [], {}],
			['var b = 2;', 'javascript', CellKind.Code, [], {}]
		], (model, disposables, accessor) => {
			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffResult = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: {
					changes: [{
						originalStart: 0,
						originalLength: 0,
						modifiedStart: 0,
						modifiedLength: 1
					}],
					quitEarly: false
				}
			}, undefined);

			assert.strictEqual(diffResult.firstChangeIndex, 0);
			assert.strictEqual(diffResult.viewModels[0].type, 'insert');
			assert.strictEqual(diffResult.viewModels[1].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[2].type, 'unchanged');

			diffResult.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('diff insert 2', async () => {

		await withTestNotebookDiffModel([
			['var a = 1;', 'javascript', CellKind.Code, [], {}],
			['var b = 2;', 'javascript', CellKind.Code, [], {}],
			['var c = 3;', 'javascript', CellKind.Code, [], {}],
			['var d = 4;', 'javascript', CellKind.Code, [], {}],
			['var e = 5;', 'javascript', CellKind.Code, [], {}],
			['var f = 6;', 'javascript', CellKind.Code, [], {}],
			['var g = 7;', 'javascript', CellKind.Code, [], {}],
		], [
			['var h = 8;', 'javascript', CellKind.Code, [], {}],
			['var a = 1;', 'javascript', CellKind.Code, [], {}],
			['var b = 2;', 'javascript', CellKind.Code, [], {}],
			['var c = 3;', 'javascript', CellKind.Code, [], {}],
			['var d = 4;', 'javascript', CellKind.Code, [], {}],
			['var e = 5;', 'javascript', CellKind.Code, [], {}],
			['var f = 6;', 'javascript', CellKind.Code, [], {}],
			['var g = 7;', 'javascript', CellKind.Code, [], {}],
		], async (model, disposables, accessor) => {
			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffResult = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: {
					changes: [{
						originalStart: 0,
						originalLength: 0,
						modifiedStart: 0,
						modifiedLength: 1
					}, {
						originalStart: 0,
						originalLength: 6,
						modifiedStart: 1,
						modifiedLength: 6
					}],
					quitEarly: false
				}
			}, undefined);

			assert.strictEqual(diffResult.firstChangeIndex, 0);
			assert.strictEqual(diffResult.viewModels[0].type, 'insert');
			assert.strictEqual(diffResult.viewModels[1].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[2].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[3].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[4].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[5].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[6].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[7].type, 'unchanged');

			diffResult.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('diff insert 3', async () => {

		await withTestNotebookDiffModel([
			['var a = 1;', 'javascript', CellKind.Code, [], {}],
			['var b = 2;', 'javascript', CellKind.Code, [], {}],
			['var c = 3;', 'javascript', CellKind.Code, [], {}],
			['var d = 4;', 'javascript', CellKind.Code, [], {}],
			['var e = 5;', 'javascript', CellKind.Code, [], {}],
			['var f = 6;', 'javascript', CellKind.Code, [], {}],
			['var g = 7;', 'javascript', CellKind.Code, [], {}],
		], [
			['var a = 1;', 'javascript', CellKind.Code, [], {}],
			['var b = 2;', 'javascript', CellKind.Code, [], {}],
			['var c = 3;', 'javascript', CellKind.Code, [], {}],
			['var d = 4;', 'javascript', CellKind.Code, [], {}],
			['var h = 8;', 'javascript', CellKind.Code, [], {}],
			['var e = 5;', 'javascript', CellKind.Code, [], {}],
			['var f = 6;', 'javascript', CellKind.Code, [], {}],
			['var g = 7;', 'javascript', CellKind.Code, [], {}],
		], async (model, disposables, accessor) => {
			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffResult = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: {
					changes: [{
						originalStart: 4,
						originalLength: 0,
						modifiedStart: 4,
						modifiedLength: 1
					}],
					quitEarly: false
				}
			}, undefined);

			// assert.strictEqual(diffResult.firstChangeIndex, 4);
			assert.strictEqual(diffResult.viewModels[0].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[1].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[2].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[3].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[4].type, 'insert');
			assert.strictEqual(diffResult.viewModels[5].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[6].type, 'unchanged');
			assert.strictEqual(diffResult.viewModels[7].type, 'unchanged');

			diffResult.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('LCS', async () => {
		await withTestNotebookDiffModel([
			['# Description', 'markdown', CellKind.Markup, [], { metadata: {} }],
			['x = 3', 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			['x', 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
			['x', 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }]
		], [
			['# Description', 'markdown', CellKind.Markup, [], { metadata: {} }],
			['x = 3', 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			['x', 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }],
			['x', 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }]
		], async (model) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			assert.deepStrictEqual(diffResult.changes.map(change => ({
				originalStart: change.originalStart,
				originalLength: change.originalLength,
				modifiedStart: change.modifiedStart,
				modifiedLength: change.modifiedLength
			})), [{
				originalStart: 2,
				originalLength: 0,
				modifiedStart: 2,
				modifiedLength: 1
			}, {
				originalStart: 3,
				originalLength: 1,
				modifiedStart: 4,
				modifiedLength: 0
			}]);
		});
	});

	test('LCS 2', async () => {
		await withTestNotebookDiffModel([
			['# Description', 'markdown', CellKind.Markup, [], { metadata: {} }],
			['x = 3', 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			['x', 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
			['x', 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }],
			['x = 5', 'javascript', CellKind.Code, [], {}],
			['x', 'javascript', CellKind.Code, [], {}],
			['x', 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}],
		], [
			['# Description', 'markdown', CellKind.Markup, [], { metadata: {} }],
			['x = 3', 'javascript', CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
			['x', 'javascript', CellKind.Code, [], { metadata: { collapsed: false } }],
			['x', 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
			['x = 5', 'javascript', CellKind.Code, [], {}],
			['x', 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}],
			['x', 'javascript', CellKind.Code, [], {}],
		], async (model) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			NotebookTextDiffEditor.prettyChanges(model, diffResult);

			assert.deepStrictEqual(diffResult.changes.map(change => ({
				originalStart: change.originalStart,
				originalLength: change.originalLength,
				modifiedStart: change.modifiedStart,
				modifiedLength: change.modifiedLength
			})), [{
				originalStart: 2,
				originalLength: 0,
				modifiedStart: 2,
				modifiedLength: 1
			}, {
				originalStart: 3,
				originalLength: 1,
				modifiedStart: 4,
				modifiedLength: 0
			}, {
				originalStart: 5,
				originalLength: 0,
				modifiedStart: 5,
				modifiedLength: 1
			}, {
				originalStart: 6,
				originalLength: 1,
				modifiedStart: 7,
				modifiedLength: 0
			}]);
		});
	});

	test('LCS 3', async () => {
		await withTestNotebookDiffModel([
			['var a = 1;', 'javascript', CellKind.Code, [], {}],
			['var b = 2;', 'javascript', CellKind.Code, [], {}],
			['var c = 3;', 'javascript', CellKind.Code, [], {}],
			['var d = 4;', 'javascript', CellKind.Code, [], {}],
			['var e = 5;', 'javascript', CellKind.Code, [], {}],
			['var f = 6;', 'javascript', CellKind.Code, [], {}],
			['var g = 7;', 'javascript', CellKind.Code, [], {}],
		], [
			['var a = 1;', 'javascript', CellKind.Code, [], {}],
			['var b = 2;', 'javascript', CellKind.Code, [], {}],
			['var c = 3;', 'javascript', CellKind.Code, [], {}],
			['var d = 4;', 'javascript', CellKind.Code, [], {}],
			['var h = 8;', 'javascript', CellKind.Code, [], {}],
			['var e = 5;', 'javascript', CellKind.Code, [], {}],
			['var f = 6;', 'javascript', CellKind.Code, [], {}],
			['var g = 7;', 'javascript', CellKind.Code, [], {}],
		], async (model) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			NotebookTextDiffEditor.prettyChanges(model, diffResult);

			assert.deepStrictEqual(diffResult.changes.map(change => ({
				originalStart: change.originalStart,
				originalLength: change.originalLength,
				modifiedStart: change.modifiedStart,
				modifiedLength: change.modifiedLength
			})), [{
				originalStart: 4,
				originalLength: 0,
				modifiedStart: 4,
				modifiedLength: 1
			}]);
		});
	});

	test('diff output', async () => {
		await withTestNotebookDiffModel([
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			['y', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([4])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			['y', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffViewModels = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: diffResult
			}, undefined);
			assert.strictEqual(diffViewModels.viewModels.length, 2);
			assert.strictEqual(diffViewModels.viewModels[0].type, 'unchanged');
			assert.strictEqual(diffViewModels.viewModels[0].checkIfOutputsModified(), false);
			assert.strictEqual(diffViewModels.viewModels[1].type, 'modified');

			diffViewModels.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});

	test('diff output fast check', async () => {
		await withTestNotebookDiffModel([
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			['y', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([4])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			['y', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			const diffResult = diff.ComputeDiff(false);
			const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
			const diffViewModels = NotebookTextDiffEditor.computeDiff(accessor, configurationService, model, eventDispatcher, {
				cellsDiff: diffResult
			}, undefined);
			assert.strictEqual(diffViewModels.viewModels.length, 2);
			assert.strictEqual(diffViewModels.viewModels[0].original!.textModel.equal(diffViewModels.viewModels[0].modified!.textModel), true);
			assert.strictEqual(diffViewModels.viewModels[1].original!.textModel.equal(diffViewModels.viewModels[1].modified!.textModel), false);
			diffViewModels.viewModels.forEach(vm => {
				vm.original?.dispose();
				vm.modified?.dispose();
				vm.dispose();
			});
			model.original.notebook.dispose();
			model.modified.notebook.dispose();
		});
	});
});
