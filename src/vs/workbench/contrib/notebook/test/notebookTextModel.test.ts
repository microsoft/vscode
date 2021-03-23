/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CellKind, CellEditType, NotebookTextModelChangedEvent, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { withTestNotebook, TestCell, setupInstantiationService } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { ITextModelService } from 'vs/editor/common/services/resolverService';

suite('NotebookTextModel', () => {
	const instantiationService = setupInstantiationService();
	const textModelService = instantiationService.get(ITextModelService);
	instantiationService.spy(IUndoRedoService, 'pushElement');

	test('insert', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
				['var b = 2;', 'javascript', CellKind.Code, [], { editable: false }],
				['var c = 3;', 'javascript', CellKind.Code, [], { editable: false }],
				['var d = 4;', 'javascript', CellKind.Code, [], { editable: false }]
			],
			(editor) => {
				const viewModel = editor.viewModel;
				const textModel = editor.viewModel.notebookDocument;
				textModel.applyEdits([
					{ editType: CellEditType.Replace, index: 1, count: 0, cells: [new TestCell(viewModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], textModelService)] },
					{ editType: CellEditType.Replace, index: 3, count: 0, cells: [new TestCell(viewModel.viewType, 6, 'var f = 6;', 'javascript', CellKind.Code, [], textModelService)] },
				], true, undefined, () => undefined, undefined);

				assert.equal(textModel.cells.length, 6);

				assert.equal(textModel.cells[1].getValue(), 'var e = 5;');
				assert.equal(textModel.cells[4].getValue(), 'var f = 6;');
			}
		);
	});

	test('multiple inserts at same position', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
				['var b = 2;', 'javascript', CellKind.Code, [], { editable: false }],
				['var c = 3;', 'javascript', CellKind.Code, [], { editable: false }],
				['var d = 4;', 'javascript', CellKind.Code, [], { editable: false }]
			],
			(editor) => {
				const viewModel = editor.viewModel;
				const textModel = editor.viewModel.notebookDocument;
				textModel.applyEdits([
					{ editType: CellEditType.Replace, index: 1, count: 0, cells: [new TestCell(viewModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], textModelService)] },
					{ editType: CellEditType.Replace, index: 1, count: 0, cells: [new TestCell(viewModel.viewType, 6, 'var f = 6;', 'javascript', CellKind.Code, [], textModelService)] },
				], true, undefined, () => undefined, undefined);

				assert.equal(textModel.cells.length, 6);

				assert.equal(textModel.cells[1].getValue(), 'var e = 5;');
				assert.equal(textModel.cells[2].getValue(), 'var f = 6;');
			}
		);
	});

	test('delete', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
				['var b = 2;', 'javascript', CellKind.Code, [], { editable: false }],
				['var c = 3;', 'javascript', CellKind.Code, [], { editable: false }],
				['var d = 4;', 'javascript', CellKind.Code, [], { editable: false }]
			],
			(editor) => {
				const textModel = editor.viewModel.notebookDocument;
				textModel.applyEdits([
					{ editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
					{ editType: CellEditType.Replace, index: 3, count: 1, cells: [] },
				], true, undefined, () => undefined, undefined);

				assert.equal(textModel.cells[0].getValue(), 'var a = 1;');
				assert.equal(textModel.cells[1].getValue(), 'var c = 3;');
			}
		);
	});

	test('delete + insert', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
				['var b = 2;', 'javascript', CellKind.Code, [], { editable: false }],
				['var c = 3;', 'javascript', CellKind.Code, [], { editable: false }],
				['var d = 4;', 'javascript', CellKind.Code, [], { editable: false }]
			],
			(editor) => {
				const viewModel = editor.viewModel;
				const textModel = editor.viewModel.notebookDocument;
				textModel.applyEdits([
					{ editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
					{ editType: CellEditType.Replace, index: 3, count: 0, cells: [new TestCell(viewModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], textModelService)] },
				], true, undefined, () => undefined, undefined);

				assert.equal(textModel.cells.length, 4);

				assert.equal(textModel.cells[0].getValue(), 'var a = 1;');
				assert.equal(textModel.cells[2].getValue(), 'var e = 5;');
			}
		);
	});

	test('delete + insert at same position', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
				['var b = 2;', 'javascript', CellKind.Code, [], { editable: false }],
				['var c = 3;', 'javascript', CellKind.Code, [], { editable: false }],
				['var d = 4;', 'javascript', CellKind.Code, [], { editable: false }]
			],
			(editor) => {
				const viewModel = editor.viewModel;
				const textModel = editor.viewModel.notebookDocument;
				textModel.applyEdits([
					{ editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
					{ editType: CellEditType.Replace, index: 1, count: 0, cells: [new TestCell(viewModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], textModelService)] },
				], true, undefined, () => undefined, undefined);

				assert.equal(textModel.cells.length, 4);
				assert.equal(textModel.cells[0].getValue(), 'var a = 1;');
				assert.equal(textModel.cells[1].getValue(), 'var e = 5;');
				assert.equal(textModel.cells[2].getValue(), 'var c = 3;');
			}
		);
	});

	test('(replace) delete + insert at same position', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
				['var b = 2;', 'javascript', CellKind.Code, [], { editable: false }],
				['var c = 3;', 'javascript', CellKind.Code, [], { editable: false }],
				['var d = 4;', 'javascript', CellKind.Code, [], { editable: false }]
			],
			(editor) => {
				const viewModel = editor.viewModel;
				const textModel = editor.viewModel.notebookDocument;
				textModel.applyEdits([
					{ editType: CellEditType.Replace, index: 1, count: 1, cells: [new TestCell(viewModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], textModelService)] },
				], true, undefined, () => undefined, undefined);

				assert.equal(textModel.cells.length, 4);
				assert.equal(textModel.cells[0].getValue(), 'var a = 1;');
				assert.equal(textModel.cells[1].getValue(), 'var e = 5;');
				assert.equal(textModel.cells[2].getValue(), 'var c = 3;');
			}
		);
	});

	test('output', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
			],
			(editor) => {
				const textModel = editor.viewModel.notebookDocument;

				// invalid index 1
				assert.throws(() => {
					textModel.applyEdits([{
						index: Number.MAX_VALUE,
						editType: CellEditType.Output,
						outputs: []
					}], true, undefined, () => undefined, undefined);
				});

				// invalid index 2
				assert.throws(() => {
					textModel.applyEdits([{
						index: -1,
						editType: CellEditType.Output,
						outputs: []
					}], true, undefined, () => undefined, undefined);
				});

				textModel.applyEdits([{
					index: 0,
					editType: CellEditType.Output,
					outputs: [{
						outputId: 'someId',
						outputs: [{ mime: 'text/markdown', value: '_Hello_' }]
					}]
				}], true, undefined, () => undefined, undefined);

				assert.strictEqual(textModel.cells.length, 1);
				assert.strictEqual(textModel.cells[0].outputs.length, 1);

				// append
				textModel.applyEdits([{
					index: 0,
					editType: CellEditType.Output,
					append: true,
					outputs: [{
						outputId: 'someId2',
						outputs: [{ mime: 'text/markdown', value: '_Hello2_' }]
					}]
				}], true, undefined, () => undefined, undefined);

				assert.strictEqual(textModel.cells.length, 1);
				assert.strictEqual(textModel.cells[0].outputs.length, 2);
				let [first, second] = textModel.cells[0].outputs;
				assert.strictEqual(first.outputId, 'someId');
				assert.strictEqual(second.outputId, 'someId2');

				// replace all
				textModel.applyEdits([{
					index: 0,
					editType: CellEditType.Output,
					outputs: [{
						outputId: 'someId3',
						outputs: [{ mime: 'text/plain', value: 'Last, replaced output' }]
					}]
				}], true, undefined, () => undefined, undefined);

				assert.strictEqual(textModel.cells.length, 1);
				assert.strictEqual(textModel.cells[0].outputs.length, 1);
				[first] = textModel.cells[0].outputs;
				assert.strictEqual(first.outputId, 'someId3');
			}
		);
	});

	test('metadata', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
			],
			(editor) => {
				const textModel = editor.viewModel.notebookDocument;

				// invalid index 1
				assert.throws(() => {
					textModel.applyEdits([{
						index: Number.MAX_VALUE,
						editType: CellEditType.Metadata,
						metadata: { editable: false }
					}], true, undefined, () => undefined, undefined);
				});

				// invalid index 2
				assert.throws(() => {
					textModel.applyEdits([{
						index: -1,
						editType: CellEditType.Metadata,
						metadata: { editable: false }
					}], true, undefined, () => undefined, undefined);
				});

				textModel.applyEdits([{
					index: 0,
					editType: CellEditType.Metadata,
					metadata: { executionOrder: 15 },
				}], true, undefined, () => undefined, undefined);

				textModel.applyEdits([{
					index: 0,
					editType: CellEditType.Metadata,
					metadata: { editable: false },
				}], true, undefined, () => undefined, undefined);

				assert.equal(textModel.cells.length, 1);
				assert.equal(textModel.cells[0].metadata?.editable, false);
				assert.equal(textModel.cells[0].metadata?.executionOrder, undefined);
			}
		);
	});

	test('partial metadata', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
			],
			(editor) => {
				const textModel = editor.viewModel.notebookDocument;

				textModel.applyEdits([{
					index: 0,
					editType: CellEditType.PartialMetadata,
					metadata: { executionOrder: 15 },
				}], true, undefined, () => undefined, undefined);

				textModel.applyEdits([{
					index: 0,
					editType: CellEditType.PartialMetadata,
					metadata: { editable: false },
				}], true, undefined, () => undefined, undefined);

				assert.strictEqual(textModel.cells.length, 1);
				assert.strictEqual(textModel.cells[0].metadata?.editable, false);
				assert.strictEqual(textModel.cells[0].metadata?.executionOrder, 15);
			}
		);
	});

	test('multiple inserts in one edit', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
				['var b = 2;', 'javascript', CellKind.Code, [], { editable: false }],
				['var c = 3;', 'javascript', CellKind.Code, [], { editable: false }],
				['var d = 4;', 'javascript', CellKind.Code, [], { editable: false }]
			],
			(editor) => {
				const viewModel = editor.viewModel;
				const textModel = editor.viewModel.notebookDocument;
				let changeEvent: NotebookTextModelChangedEvent | undefined = undefined;
				const eventListener = textModel.onDidChangeContent(e => {
					changeEvent = e;
				});
				const version = textModel.versionId;

				textModel.applyEdits([
					{ editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
					{ editType: CellEditType.Replace, index: 1, count: 0, cells: [new TestCell(viewModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], textModelService)] },
				], true, undefined, () => ({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }), undefined);

				assert.equal(textModel.cells.length, 4);
				assert.equal(textModel.cells[0].getValue(), 'var a = 1;');
				assert.equal(textModel.cells[1].getValue(), 'var e = 5;');
				assert.equal(textModel.cells[2].getValue(), 'var c = 3;');

				assert.notEqual(changeEvent, undefined);
				assert.equal(changeEvent!.rawEvents.length, 2);
				assert.deepEqual(changeEvent!.endSelectionState?.selections, [{ start: 0, end: 1 }]);
				assert.equal(textModel.versionId, version + 1);
				eventListener.dispose();
			}
		);
	});

	test('insert and metadata change in one edit', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }],
				['var b = 2;', 'javascript', CellKind.Code, [], { editable: false }],
				['var c = 3;', 'javascript', CellKind.Code, [], { editable: false }],
				['var d = 4;', 'javascript', CellKind.Code, [], { editable: false }]
			],
			(editor) => {
				const textModel = editor.viewModel.notebookDocument;
				let changeEvent: NotebookTextModelChangedEvent | undefined = undefined;
				const eventListener = textModel.onDidChangeContent(e => {
					changeEvent = e;
				});
				const version = textModel.versionId;

				textModel.applyEdits([
					{ editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
					{
						index: 0,
						editType: CellEditType.Metadata,
						metadata: { editable: false },
					}
				], true, undefined, () => ({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }), undefined);

				assert.notEqual(changeEvent, undefined);
				assert.equal(changeEvent!.rawEvents.length, 2);
				assert.deepEqual(changeEvent!.endSelectionState?.selections, [{ start: 0, end: 1 }]);
				assert.equal(textModel.versionId, version + 1);
				eventListener.dispose();
			}
		);
	});


	test('Updating appending/updating output in Notebooks does not work as expected #117273', function () {
		withTestNotebook([
			['var a = 1;', 'javascript', CellKind.Code, [], { editable: true }]
		], (editor) => {
			const model = editor.viewModel.notebookDocument;

			assert.strictEqual(model.cells.length, 1);
			assert.strictEqual(model.cells[0].outputs.length, 0);

			const success1 = model.applyEdits(
				[{
					editType: CellEditType.Output, index: 0, outputs: [
						{ outputId: 'out1', outputs: [{ mime: 'application/x.notebook.stream', value: 1 }] }
					],
					append: false
				}], true, undefined, () => undefined, undefined, false
			);

			assert.ok(success1);
			assert.strictEqual(model.cells[0].outputs.length, 1);

			const success2 = model.applyEdits(
				[{
					editType: CellEditType.Output, index: 0, outputs: [
						{ outputId: 'out2', outputs: [{ mime: 'application/x.notebook.stream', value: 1 }] }
					],
					append: true
				}], true, undefined, () => undefined, undefined, false
			);

			assert.ok(success2);
			assert.strictEqual(model.cells[0].outputs.length, 2);
		});
	});
});
