/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { IDiffResult, ISequence, LcsDiff } from '../../../../../../base/common/diff/diff.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../../base/common/mime.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDiffElementViewModelBase, SideBySideDiffElementViewModel } from '../../../browser/diff/diffElementViewModel.js';
import { NotebookDiffEditorEventDispatcher } from '../../../browser/diff/eventDispatcher.js';
import { INotebookDiffViewModel, INotebookDiffViewModelUpdateEvent } from '../../../browser/diff/notebookDiffEditorBrowser.js';
import { NotebookDiffViewModel, prettyChanges } from '../../../browser/diff/notebookDiffViewModel.js';
import { CellKind, INotebookTextModel } from '../../../common/notebookCommon.js';
import { INotebookService } from '../../../common/notebookService.js';
import { INotebookEditorWorkerService } from '../../../common/services/notebookWorkerService.js';
import { withTestNotebookDiffModel } from '../testNotebookEditor.js';
import { IDiffEditorHeightCalculatorService } from '../../../browser/diff/editorHeightCalculator.js';

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

suite('NotebookDiff', () => {
	let disposables: DisposableStore;
	let token: CancellationToken;
	let eventDispatcher: NotebookDiffEditorEventDispatcher;
	let diffViewModel: NotebookDiffViewModel;
	let diffResult: IDiffResult;
	let notebookEditorWorkerService: INotebookEditorWorkerService;
	let heightCalculator: IDiffEditorHeightCalculatorService;
	teardown(() => disposables.dispose());

	const configurationService = new TestConfigurationService({ notebook: { diff: { ignoreMetadata: true } } });
	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		disposables = new DisposableStore();
		const cancellation = disposables.add(new CancellationTokenSource());
		eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
		token = cancellation.token;
		notebookEditorWorkerService = new class extends mock<INotebookEditorWorkerService>() {
			override computeDiff() { return Promise.resolve({ cellsDiff: diffResult, metadataChanged: false }); }
		};
		heightCalculator = new class extends mock<IDiffEditorHeightCalculatorService>() {
			override diffAndComputeHeight() { return Promise.resolve(0); }
			override computeHeightFromLines(_lineCount: number): number {
				return 0;
			}
		};
	});

	async function verifyChangeEventIsNotFired(diffViewModel: INotebookDiffViewModel) {
		let eventArgs: INotebookDiffViewModelUpdateEvent | undefined = undefined;
		disposables.add(diffViewModel.onDidChangeItems(e => eventArgs = e));
		await diffViewModel.computeDiff(token);

		assert.strictEqual(eventArgs, undefined);
	}

	test('diff different source', async () => {
		await withTestNotebookDiffModel([
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			['y', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], async (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			diffResult = diff.ComputeDiff(false);
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

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(diffViewModel.items.length, 1);
			assert.strictEqual(diffViewModel.items[0].type, 'modified');
		});
	});

	test('No changes when re-computing diff with the same source', async () => {
		await withTestNotebookDiffModel([
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			['y', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], async (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			diffResult = diff.ComputeDiff(false);
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

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			await diffViewModel.computeDiff(token);

			await verifyChangeEventIsNotFired(diffViewModel);
		});
	});

	test('diff different output', async () => {
		await withTestNotebookDiffModel([
			['x', 'javascript', CellKind.Code, [{ outputId: 'someId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
			['', 'javascript', CellKind.Code, [], {}]
		], [
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			['', 'javascript', CellKind.Code, [], {}]
		], async (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			diffResult = diff.ComputeDiff(false);
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

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			let eventArgs: INotebookDiffViewModelUpdateEvent | undefined = undefined;
			disposables.add(diffViewModel.onDidChangeItems(e => eventArgs = e));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(diffViewModel.items.length, 2);
			assert.strictEqual(diffViewModel.items[0].type, 'modified');
			assert.strictEqual(diffViewModel.items[1].type, 'placeholder');


			diffViewModel.items[1].showHiddenCells();

			assert.strictEqual(diffViewModel.items.length, 2);
			assert.strictEqual(diffViewModel.items[0].type, 'modified');
			assert.strictEqual(diffViewModel.items[1].type, 'unchanged');
			assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1]] });

			(diffViewModel.items[1] as unknown as SideBySideDiffElementViewModel).hideUnchangedCells();

			assert.strictEqual(diffViewModel.items.length, 2);
			assert.strictEqual(diffViewModel.items[0].type, 'modified');
			assert.strictEqual((diffViewModel.items[1] as IDiffElementViewModelBase).type, 'placeholder');
			assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1]] });

			await verifyChangeEventIsNotFired(diffViewModel);
		});
	});

	test('diff test small source', async () => {
		await withTestNotebookDiffModel([
			['123456789', 'javascript', CellKind.Code, [], {}]
		], [
			['987654321', 'javascript', CellKind.Code, [], {}],
		], async (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			diffResult = diff.ComputeDiff(false);
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

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(diffViewModel.items.length, 1);
			assert.strictEqual(diffViewModel.items[0].type, 'modified');

			await verifyChangeEventIsNotFired(diffViewModel);
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
		], async (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			diffResult = diff.ComputeDiff(false);
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

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(diffViewModel.items.length, 1);
			assert.strictEqual(diffViewModel.items[0].type, 'modified');

			await verifyChangeEventIsNotFired(diffViewModel);
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
		], async (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			diffResult = diff.ComputeDiff(false);

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			let eventArgs: INotebookDiffViewModelUpdateEvent | undefined = undefined;
			disposables.add(diffViewModel.onDidChangeItems(e => eventArgs = e));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(diffViewModel.items.length, 3);
			assert.strictEqual(diffViewModel.items[0].type, 'modified');
			assert.strictEqual(diffViewModel.items[1].type, 'modified');
			assert.strictEqual(diffViewModel.items[2].type, 'placeholder');
			diffViewModel.items[2].showHiddenCells();
			assert.strictEqual(diffViewModel.items[2].type, 'unchanged');
			assert.deepStrictEqual(eventArgs, { start: 2, deleteCount: 1, elements: [diffViewModel.items[2]] });

			await verifyChangeEventIsNotFired(diffViewModel);
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
		], async (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			diffResult = diff.ComputeDiff(false);

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			let eventArgs: INotebookDiffViewModelUpdateEvent | undefined = undefined;
			disposables.add(diffViewModel.onDidChangeItems(e => eventArgs = e));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(diffViewModel.items.length, 3);
			assert.strictEqual(diffViewModel.items[0].type, 'modified');
			assert.strictEqual(diffViewModel.items[1].type, 'placeholder');
			assert.strictEqual(diffViewModel.items[2].type, 'modified');

			diffViewModel.items[1].showHiddenCells();
			assert.strictEqual(diffViewModel.items[1].type, 'unchanged');
			assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1]] });

			await verifyChangeEventIsNotFired(diffViewModel);

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
		], async (model, disposables, accessor) => {
			diffResult = {
				changes: [{
					originalStart: 0,
					originalLength: 0,
					modifiedStart: 0,
					modifiedLength: 1
				}],
				quitEarly: false
			};

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			let eventArgs: INotebookDiffViewModelUpdateEvent | undefined;
			disposables.add(diffViewModel.onDidChangeItems(e => eventArgs = e));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(eventArgs?.firstChangeIndex, 0);
			assert.strictEqual(diffViewModel.items[0].type, 'insert');
			assert.strictEqual(diffViewModel.items[1].type, 'placeholder');

			diffViewModel.items[1].showHiddenCells();
			assert.strictEqual(diffViewModel.items[1].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[2].type, 'unchanged');
			assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1], diffViewModel.items[2]] });

			await verifyChangeEventIsNotFired(diffViewModel);
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
			diffResult = {
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
			};

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			let eventArgs: INotebookDiffViewModelUpdateEvent | undefined;
			disposables.add(diffViewModel.onDidChangeItems(e => eventArgs = e));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(eventArgs?.firstChangeIndex, 0);
			assert.strictEqual(diffViewModel.items.length, 2);
			assert.strictEqual(diffViewModel.items[0].type, 'insert');
			assert.strictEqual(diffViewModel.items[1].type, 'placeholder');

			diffViewModel.items[1].showHiddenCells();
			assert.strictEqual(diffViewModel.items[1].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[2].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[3].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[4].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[5].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[6].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[7].type, 'unchanged');
			assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: diffViewModel.items.slice(1) });


			(diffViewModel.items[1] as unknown as SideBySideDiffElementViewModel).hideUnchangedCells();

			assert.strictEqual(diffViewModel.items.length, 2);
			assert.strictEqual(diffViewModel.items[0].type, 'insert');
			assert.strictEqual((diffViewModel.items[1] as IDiffElementViewModelBase).type, 'placeholder');
			assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 7, elements: [diffViewModel.items[1]] });

			await verifyChangeEventIsNotFired(diffViewModel);
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
			diffResult = {
				changes: [{
					originalStart: 4,
					originalLength: 0,
					modifiedStart: 4,
					modifiedLength: 1
				}],
				quitEarly: false
			};

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			let eventArgs: INotebookDiffViewModelUpdateEvent | undefined = undefined;
			disposables.add(diffViewModel.onDidChangeItems(e => eventArgs = e));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(diffViewModel.items[0].type, 'placeholder');
			assert.strictEqual(diffViewModel.items[1].type, 'insert');
			assert.strictEqual(diffViewModel.items[2].type, 'placeholder');

			diffViewModel.items[0].showHiddenCells();
			assert.strictEqual(diffViewModel.items[0].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[1].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[2].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[3].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[4].type, 'insert');
			assert.strictEqual(diffViewModel.items[5].type, 'placeholder');
			assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 1, elements: diffViewModel.items.slice(0, 4) });

			diffViewModel.items[5].showHiddenCells();
			assert.strictEqual((diffViewModel.items[0] as IDiffElementViewModelBase).type, 'unchanged');
			assert.strictEqual(diffViewModel.items[1].type, 'unchanged');
			assert.strictEqual((diffViewModel.items[2] as IDiffElementViewModelBase).type, 'unchanged');
			assert.strictEqual(diffViewModel.items[3].type, 'unchanged');
			assert.strictEqual(diffViewModel.items[4].type, 'insert');
			assert.strictEqual(diffViewModel.items[5].type, 'unchanged');
			assert.deepStrictEqual(eventArgs, { start: 5, deleteCount: 1, elements: diffViewModel.items.slice(5) });

			(diffViewModel.items[0] as SideBySideDiffElementViewModel).hideUnchangedCells();
			assert.strictEqual((diffViewModel.items[0] as IDiffElementViewModelBase).type, 'placeholder');
			assert.strictEqual(diffViewModel.items[1].type, 'insert');
			assert.strictEqual((diffViewModel.items[2] as IDiffElementViewModelBase).type, 'unchanged');
			assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 4, elements: diffViewModel.items.slice(0, 1) });

			await verifyChangeEventIsNotFired(diffViewModel);

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
			prettyChanges(model, diffResult);

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
			prettyChanges(model, diffResult);

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
		], async (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			diffResult = diff.ComputeDiff(false);

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(diffViewModel.items.length, 2);
			assert.strictEqual(diffViewModel.items[0].type, 'placeholder');
			diffViewModel.items[0].showHiddenCells();
			assert.strictEqual((diffViewModel.items[0] as unknown as SideBySideDiffElementViewModel).checkIfOutputsModified(), false);
			assert.strictEqual(diffViewModel.items[1].type, 'modified');

			await verifyChangeEventIsNotFired(diffViewModel);
		});
	});

	test('diff output fast check', async () => {
		await withTestNotebookDiffModel([
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			['y', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([4])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], [
			['x', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
			['y', 'javascript', CellKind.Code, [{ outputId: 'someOtherId', outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
		], async (model, disposables, accessor) => {
			const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
			diffResult = diff.ComputeDiff(false);

			diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get<INotebookService>(INotebookService), heightCalculator, undefined));
			await diffViewModel.computeDiff(token);

			assert.strictEqual(diffViewModel.items.length, 2);
			assert.strictEqual(diffViewModel.items[0].type, 'placeholder');
			diffViewModel.items[0].showHiddenCells();
			assert.strictEqual((diffViewModel.items[0] as unknown as SideBySideDiffElementViewModel).original!.textModel.equal((diffViewModel.items[0] as any).modified!.textModel), true);
			assert.strictEqual((diffViewModel.items[1] as any).original!.textModel.equal((diffViewModel.items[1] as any).modified!.textModel), false);

			await verifyChangeEventIsNotFired(diffViewModel);
		});
	});
});
