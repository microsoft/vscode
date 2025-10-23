/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CellEditType, CellKind, SelectionStateType } from '../../../common/notebookCommon.js';
import { createNotebookCellList, withTestNotebook } from '../testNotebookEditor.js';

suite('Notebook Undo/Redo', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('Basics', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, _accessor) => {
				assert.strictEqual(viewModel.length, 2);
				assert.strictEqual(viewModel.getVersionId(), 0);
				assert.strictEqual(viewModel.getAlternativeId(), '0_0,1;1,1');

				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 0, count: 2, cells: []
				}], true, undefined, () => undefined, undefined, true);
				assert.strictEqual(viewModel.length, 0);
				assert.strictEqual(viewModel.getVersionId(), 1);
				assert.strictEqual(viewModel.getAlternativeId(), '1_');

				await viewModel.undo();
				assert.strictEqual(viewModel.length, 2);
				assert.strictEqual(viewModel.getVersionId(), 2);
				assert.strictEqual(viewModel.getAlternativeId(), '0_0,1;1,1');

				await viewModel.redo();
				assert.strictEqual(viewModel.length, 0);
				assert.strictEqual(viewModel.getVersionId(), 3);
				assert.strictEqual(viewModel.getAlternativeId(), '1_');

				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 0, count: 0, cells: [
						{ source: '# header 3', language: 'markdown', cellKind: CellKind.Markup, outputs: [], mime: undefined }
					]
				}], true, undefined, () => undefined, undefined, true);
				assert.strictEqual(viewModel.getVersionId(), 4);
				assert.strictEqual(viewModel.getAlternativeId(), '4_2,1');

				await viewModel.undo();
				assert.strictEqual(viewModel.getVersionId(), 5);
				assert.strictEqual(viewModel.getAlternativeId(), '1_');
			}
		);
	});

	test('Invalid replace count should not throw', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, _viewModel, _ds, _accessor) => {
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 0, count: 2, cells: []
				}], true, undefined, () => undefined, undefined, true);

				assert.doesNotThrow(() => {
					editor.textModel.applyEdits([{
						editType: CellEditType.Replace, index: 0, count: 2, cells: [
							{ source: '# header 2', language: 'markdown', cellKind: CellKind.Markup, outputs: [], mime: undefined }
						]
					}], true, undefined, () => undefined, undefined, true);
				});
			}
		);
	});

	test('Replace beyond length', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel) => {
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 1, count: 2, cells: []
				}], true, undefined, () => undefined, undefined, true);

				assert.deepStrictEqual(viewModel.length, 1);
				await viewModel.undo();
				assert.deepStrictEqual(viewModel.length, 2);
			}
		);
	});

	test('Invalid replace count should not affect undo/redo', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, _accessor) => {
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 0, count: 2, cells: []
				}], true, undefined, () => undefined, undefined, true);

				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 0, count: 2, cells: [
						{ source: '# header 2', language: 'markdown', cellKind: CellKind.Markup, outputs: [], mime: undefined }
					]
				}], true, undefined, () => undefined, undefined, true);

				assert.deepStrictEqual(viewModel.length, 1);

				await viewModel.undo();
				await viewModel.undo();

				assert.deepStrictEqual(viewModel.length, 2);
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 1, count: 2, cells: []
				}], true, undefined, () => undefined, undefined, true);
				assert.deepStrictEqual(viewModel.length, 1);
			}
		);
	});

	test('Focus/selection update', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				const cellList = createNotebookCellList(accessor, disposables);
				cellList.attachViewModel(viewModel);
				cellList.setFocus([1]);

				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 2, count: 0, cells: [
						{ source: '# header 2', language: 'markdown', cellKind: CellKind.Markup, outputs: [], mime: undefined }
					]
				}], true, { focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }], kind: SelectionStateType.Index }, () => {
					return {
						focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }], kind: SelectionStateType.Index
					};
				}, undefined, true);
				assert.strictEqual(viewModel.length, 3);
				assert.strictEqual(viewModel.getVersionId(), 1);
				assert.deepStrictEqual(cellList.getFocus(), [2]);
				assert.deepStrictEqual(cellList.getSelection(), [2]);

				await viewModel.undo();
				assert.strictEqual(viewModel.length, 2);
				assert.strictEqual(viewModel.getVersionId(), 2);
				assert.deepStrictEqual(cellList.getFocus(), [1]);
				assert.deepStrictEqual(cellList.getSelection(), [1]);

				await viewModel.redo();
				assert.strictEqual(viewModel.length, 3);
				assert.strictEqual(viewModel.getVersionId(), 3);
				assert.deepStrictEqual(cellList.getFocus(), [2]);
				assert.deepStrictEqual(cellList.getSelection(), [2]);
			}
		);
	});

	test('Batch edits', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 2, count: 0, cells: [
						{ source: '# header 2', language: 'markdown', cellKind: CellKind.Markup, outputs: [], mime: undefined }
					]
				}, {
					editType: CellEditType.Metadata, index: 0, metadata: { inputCollapsed: false }
				}], true, undefined, () => undefined, undefined, true);
				assert.strictEqual(viewModel.getVersionId(), 1);
				assert.deepStrictEqual(viewModel.cellAt(0)?.metadata, { inputCollapsed: false });

				await viewModel.undo();
				assert.strictEqual(viewModel.length, 2);
				assert.strictEqual(viewModel.getVersionId(), 2);
				assert.deepStrictEqual(viewModel.cellAt(0)?.metadata, {});

				await viewModel.redo();
				assert.strictEqual(viewModel.length, 3);
				assert.strictEqual(viewModel.getVersionId(), 3);
				assert.deepStrictEqual(viewModel.cellAt(0)?.metadata, { inputCollapsed: false });

			}
		);
	});
});
