/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { adjustCellDiffAndOriginalModelBasedOnCellAddDelete, adjustCellDiffAndOriginalModelBasedOnCellMovements, adjustCellDiffForKeepingADeletedCell, adjustCellDiffForKeepingAnInsertedCell, adjustCellDiffForRevertingADeletedCell, adjustCellDiffForRevertingAnInsertedCell } from '../../browser/chatEditing/notebook/helpers.js';
import { ICellDiffInfo } from '../../browser/chatEditing/notebook/notebookCellChanges.js';
import { nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { ObservablePromise, observableValue } from '../../../../../base/common/observable.js';
import { CellEditType, CellKind, ICell, ICellEditOperation, NotebookCellsChangeType } from '../../../notebook/common/notebookCommon.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { URI } from '../../../../../base/common/uri.js';
import { hash } from '../../../../../base/common/hash.js';
import { generateUuid } from '../../../../../base/common/uuid.js';

suite('ChatEditingModifiedNotebookEntry', function () {
	suite('Keep Inserted Cell', function () {

		const keep = () => Promise.resolve(true);
		const undo = () => Promise.resolve(true);
		const diff = observableValue('cell1', nullDocumentDiff);
		const appliedEdits: ICellEditOperation[] = [];
		setup(() => {
			appliedEdits.length = 0;
		});
		ensureNoDisposablesAreLeakedInTestSuite();
		function createModifiedModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Modified:${id}` as any;

		}
		function createOriginalModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Original:${id}` as any;

		}
		function applyEdits(edits: ICellEditOperation[]): boolean {
			appliedEdits.push(...edits);
			return true;
		}

		function createModifiedCellDiffInfo(modifiedCellIndex: number, originalCellIndex: number): ICellDiffInfo {
			return {
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`), originalCellIndex,
				modifiedCellIndex, modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`),
			};
		}
		test('Keep first inserted', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
			];

			const result = adjustCellDiffForKeepingAnInsertedCell(0,
				// eslint-disable-next-line local/code-no-any-casts
				cellsDiffInfo, {} as any,
				applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:0`), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel(`InsertedModified:0`),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
			]);
		});
		test('Keep first inserted with multiple cells', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('2'),
				},
			];

			const result = adjustCellDiffForKeepingAnInsertedCell(0,
				// eslint-disable-next-line local/code-no-any-casts
				cellsDiffInfo, {} as any,
				applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('InsertedModified:0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 2,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 3,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('2'),
				},
			]);
		});
		test('Keep second inserted with multiple cells', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('2'),
				},
			];

			const result = adjustCellDiffForKeepingAnInsertedCell(2,
				// eslint-disable-next-line local/code-no-any-casts
				cellsDiffInfo, {} as any,
				applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 2, cells: [{}], count: 0 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:2'), originalCellIndex: 2,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('InsertedModified:2'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 3,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('2'),
				},
			]);
		});
	});

	suite('Revert Inserted Cell', function () {

		const keep = () => Promise.resolve(true);
		const undo = () => Promise.resolve(true);
		const diff = observableValue('cell1', nullDocumentDiff);
		const appliedEdits: ICellEditOperation[] = [];
		setup(() => {
			appliedEdits.length = 0;
		});
		ensureNoDisposablesAreLeakedInTestSuite();
		function createModifiedModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Modified:${id}` as any;

		}
		function createOriginalModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Original:${id}` as any;

		}
		function applyEdits(edits: ICellEditOperation[]): boolean {
			appliedEdits.push(...edits);
			return true;
		}

		test('Delete first inserted', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
			];

			const result = adjustCellDiffForRevertingAnInsertedCell(0,
				cellsDiffInfo,
				applyEdits);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 0, cells: [], count: 1 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
			]);
		});
		test('Delete first inserted with multiple cells', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('2'),
				},
			];

			const result = adjustCellDiffForRevertingAnInsertedCell(0,
				cellsDiffInfo,
				applyEdits);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 0, cells: [], count: 1 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
				},
			]);
		});
		test('Delete second inserted with multiple cells', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('2'),
				},
			];

			const result = adjustCellDiffForRevertingAnInsertedCell(2,
				cellsDiffInfo,
				applyEdits);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 2, cells: [], count: 1 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('2'),
				},
			]);
		});
		test('Delete second inserted with multiple cells (subsequent inserts)', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('3'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 4, modifiedModel: createModifiedModel('4'),
				},
			];

			const result = adjustCellDiffForRevertingAnInsertedCell(2,
				cellsDiffInfo,
				applyEdits);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 2, cells: [], count: 1 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('3'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('4'),
				},
			]);
		});
	});

	suite('Keep Deleted Cell', function () {

		const keep = () => Promise.resolve(true);
		const undo = () => Promise.resolve(true);
		const diff = observableValue('cell1', nullDocumentDiff);
		const appliedEdits: ICellEditOperation[] = [];
		setup(() => {
			appliedEdits.length = 0;
		});
		ensureNoDisposablesAreLeakedInTestSuite();
		function createModifiedModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Modified:${id}` as any;

		}
		function createOriginalModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Original:${id}` as any;

		}
		function applyEdits(edits: ICellEditOperation[]): boolean {
			appliedEdits.push(...edits);
			return true;
		}

		test('Keep first deleted cell', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
			];

			const result = adjustCellDiffForKeepingADeletedCell(0,
				cellsDiffInfo,
				applyEdits);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 0, cells: [], count: 1 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 0,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
			]);
		});
		test('Keep second deleted cell', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
			];

			const result = adjustCellDiffForKeepingADeletedCell(1,
				cellsDiffInfo,
				applyEdits);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 1, cells: [], count: 1 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
			]);
		});

		test('Keep first deleted with multiple cells', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('2'),
				},
			];

			const result = adjustCellDiffForKeepingADeletedCell(1,
				cellsDiffInfo,
				applyEdits);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 1, cells: [], count: 1 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 1,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('2'),
				},
			]);
		});
	});

	suite('Revert Deleted Cell', function () {

		const keep = () => Promise.resolve(true);
		const undo = () => Promise.resolve(true);
		const diff = observableValue('cell1', nullDocumentDiff);
		const appliedEdits: ICellEditOperation[] = [];
		setup(() => {
			appliedEdits.length = 0;
		});
		ensureNoDisposablesAreLeakedInTestSuite();
		function createModifiedModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Modified:${id}` as any;

		}
		function createOriginalModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Original:${id}` as any;

		}
		function applyEdits(edits: ICellEditOperation[]): boolean {
			appliedEdits.push(...edits);
			return true;
		}
		function createModifiedCellDiffInfo(modifiedCellIndex: number, originalCellIndex: number): ICellDiffInfo {
			return {
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`), originalCellIndex,
				modifiedCellIndex, modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`),
			};
		}

		test('Revert first deleted cell', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
			];

			const result = adjustCellDiffForRevertingADeletedCell(0,
				cellsDiffInfo,
				// eslint-disable-next-line local/code-no-any-casts
				{} as any,
				applyEdits,
				createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('InsertedModified:0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('0'),
				},
			]);
		});
		test('Revert second deleted cell', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
			];

			const result = adjustCellDiffForRevertingADeletedCell(1,
				cellsDiffInfo,
				// eslint-disable-next-line local/code-no-any-casts
				{} as any,
				applyEdits,
				createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 0, cells: [{}], count: 0 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:1'), originalCellIndex: 1,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('InsertedModified:0'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('0'),
				},
			]);
		});

		test('Revert first deleted with multiple cells', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('New1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 4, modifiedModel: createModifiedModel('2'),
				},
			];

			const result = adjustCellDiffForRevertingADeletedCell(1,
				cellsDiffInfo,
				// eslint-disable-next-line local/code-no-any-casts
				{} as any,
				applyEdits,
				createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{ editType: CellEditType.Replace, index: 3, cells: [{}], count: 0 },
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('New1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:1'), originalCellIndex: 1,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('InsertedModified:3'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 4, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('2'), originalCellIndex: 2,
					modifiedCellIndex: 5, modifiedModel: createModifiedModel('2'),
				},
			]);
		});
	});

	suite('Cell Addition', function () {

		const keep = () => Promise.resolve(true);
		const undo = () => Promise.resolve(true);
		const diff = observableValue('cell1', nullDocumentDiff);
		const appliedEdits: ICellEditOperation[] = [];
		setup(() => {
			appliedEdits.length = 0;
		});
		ensureNoDisposablesAreLeakedInTestSuite();
		function createModifiedModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Modified:${id}` as any;

		}
		function createOriginalModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Original:${id}` as any;

		}
		function applyEdits(edits: ICellEditOperation[]): boolean {
			appliedEdits.push(...edits);
			return true;
		}

		function createICell(cellKind: CellKind, source: string): ICell {
			const handle = hash(generateUuid());
			// eslint-disable-next-line local/code-no-any-casts
			return {
				uri: URI.parse(`file:///path/${handle}`),
				handle,
				cellKind,
				language: cellKind === CellKind.Markup ? 'markdown' : 'python',
				outputs: [],
				metadata: {},
				getHashValue: () => {
					return hash(`${handle}=>${cellKind}=>${source}`);
				},
				getValue: () => {
					return source;
				},
				internalMetadata: {},
			} as any;
		}
		function createModifiedCellDiffInfo(modifiedCellIndex: number, originalCellIndex: number): ICellDiffInfo {
			return {
				diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`), originalCellIndex,
				modifiedCellIndex, modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`),
			};
		}
		test('Insert a new cell into an unchanged notebook', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
				},
			];

			const cell = createICell(CellKind.Code, 'print("Hello World")');
			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([0, 0, [cell]],
				cellsDiffInfo, 3, 2, applyEdits, createModifiedCellDiffInfo);
			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 0,
					cells: [{
						cellKind: CellKind.Code,
						language: 'python',
						outputs: [],
						mime: undefined,
						metadata: {},
						internalMetadata: {},
						source: cell.getValue(),
					}], count: 0
				}
			]);
			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:0`), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel(`InsertedModified:0`),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 2,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
			]);
		});
		test('Insert a new cell into a notebook with 3 cells deleted', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
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
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('New1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('4'), originalCellIndex: 4,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('4'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 5,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('5'),
				},
				{
					diff, keep, undo, type: 'modified', originalModel: createOriginalModel('6'), originalCellIndex: 6,
					modifiedCellIndex: 4, modifiedModel: createModifiedModel('6'),
				},
			];
			const cell = createICell(CellKind.Code, 'print("Hello World")');
			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([2, 0, [cell]],
				cellsDiffInfo, 6, 7, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 4,
					cells: [{
						cellKind: CellKind.Code,
						language: 'python',
						outputs: [],
						mime: undefined,
						metadata: {},
						internalMetadata: {},
						source: cell.getValue(),
					}], count: 0
				}
			]);

			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
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
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('New1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:4'), originalCellIndex: 4,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('InsertedModified:2'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('4'), originalCellIndex: 5,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('4'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 6,
					modifiedCellIndex: 4, modifiedModel: createModifiedModel('5'),
				},
				{
					diff, keep, undo, type: 'modified', originalModel: createOriginalModel('6'), originalCellIndex: 7,
					modifiedCellIndex: 5, modifiedModel: createModifiedModel('6'),
				},
			]);
		});
		test('Insert 2 new cells into an notebook with 3 cells deleted', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
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
			];
			const cell1 = createICell(CellKind.Code, 'print("Hello World")');
			const cell2 = createICell(CellKind.Code, 'print("Foo Bar")');
			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([2, 0, [cell1, cell2]],
				cellsDiffInfo, 4, 6, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 4,
					cells: [{
						cellKind: CellKind.Code,
						language: 'python',
						outputs: [],
						mime: undefined,
						metadata: {},
						internalMetadata: {},
						source: cell1.getValue(),
					}, {
						cellKind: CellKind.Code,
						language: 'python',
						outputs: [],
						mime: undefined,
						metadata: {},
						internalMetadata: {},
						source: cell2.getValue(),
					}], count: 0
				}
			]);

			assert.deepStrictEqual(result, [
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
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:4`), originalCellIndex: 4,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel(`InsertedModified:2`),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:5`), originalCellIndex: 5,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel(`InsertedModified:3`),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('5'), originalCellIndex: 6,
					modifiedCellIndex: 4, modifiedModel: createModifiedModel('5'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 7,
					modifiedCellIndex: 5, modifiedModel: createModifiedModel('1'),
				},
			]);
		});
		test('Delete a cell from an unchanged notebook', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
				},
			];

			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([0, 1, []],
				cellsDiffInfo, 2, 2, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 0,
					cells: [], count: 1
				}
			]);

			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('1'),
				},
			]);
		});
		test('Delete last cell from an unchanged notebook', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
				},
			];

			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([1, 1, []],
				cellsDiffInfo, 2, 2, applyEdits, createModifiedCellDiffInfo);
			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 1,
					cells: [], count: 1
				}
			]);

			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
			]);
		});
		test('Delete the first cell, then insert a new cell at the top', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('1'),
				},
			];

			const cell1 = createICell(CellKind.Code, 'print("Hello World")');
			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([0, 0, [cell1]],
				cellsDiffInfo, 2, 2, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 1,
					cells: [{
						cellKind: CellKind.Code,
						language: 'python',
						outputs: [],
						mime: undefined,
						metadata: {},
						internalMetadata: {},
						source: cell1.getValue(),
					}], count: 0
				}
			]);

			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'delete', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: undefined, modifiedModel: createModifiedModel('null'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:1'), originalCellIndex: 1,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('InsertedModified:0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 2,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
				},
			]);
		});
		test('Delete a new cell from a notebook with 3 cells deleted', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
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
			];

			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([1, 1, [
				// createICell(CellKind.Code, 'print("Hello World")')
			]],
				cellsDiffInfo, 4, 6, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
			]);

			assert.deepStrictEqual(result, [
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
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('5'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 5,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('1'),
				},
			]);
		});
		test('Delete 2 cells from a notebook with 3 cells deleted', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
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
			];

			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([1, 2, [
			]],
				cellsDiffInfo, 4, 6, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 4,
					cells: [], count: 1
				}
			]);

			assert.deepStrictEqual(result, [
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
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 4,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
				},
			]);
		});
		test('Delete 3 cells from a notebook with 3 cells deleted', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'modified', originalModel: createOriginalModel('1'), originalCellIndex: 1,
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
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('6'), originalCellIndex: 6,
					modifiedCellIndex: 4, modifiedModel: createModifiedModel('6'),
				},
			];

			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([1, 3, [
			]],
				cellsDiffInfo, 5, 7, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 1,
					cells: [], count: 1
				},
				{
					editType: CellEditType.Replace,
					index: 5,
					cells: [], count: 1
				}
			]);

			assert.deepStrictEqual(result, [
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
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('6'), originalCellIndex: 4,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('6'),
				},
			]);
		});

		test('Insert 1 cell at the bottom via chat, then user creats a new cell just below that', async function () {
			const cellsDiffInfo: ICellDiffInfo[] = [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('New1'),
				},
			];
			const cell1 = createICell(CellKind.Code, 'print("Hello World")');
			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([2, 0, [cell1]],
				cellsDiffInfo, 3, 1, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 1,
					cells: [{
						cellKind: CellKind.Code,
						language: 'python',
						outputs: [],
						mime: undefined,
						metadata: {},
						internalMetadata: {},
						source: cell1.getValue(),
					}], count: 0
				}
			]);

			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('New1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:1'), originalCellIndex: 1,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('InsertedModified:2'),
				},
			]);
		});
		test('Insert 1 cell at the bottom via chat, then user creats anew cells above the previous new cell', async function () {
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
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('New1'),
				},
			];
			const cell1 = createICell(CellKind.Code, 'print("Hello World")');
			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([2, 0, [cell1]],
				cellsDiffInfo, 3, 2, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 2,
					cells: [{
						cellKind: CellKind.Code,
						language: 'python',
						outputs: [],
						mime: undefined,
						metadata: {},
						internalMetadata: {},
						source: cell1.getValue(),
					}], count: 0
				}
			]);

			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:2'), originalCellIndex: 2,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('InsertedModified:2'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('New1'),
				},
			]);
		});
		test('Insert 1 cell at the bottom via chat, then user inserts a new cells below the  previous new cell', async function () {
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
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('New1'),
				},
			];
			const cell1 = createICell(CellKind.Code, 'print("Hello World")');
			const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([3, 0, [cell1]],
				cellsDiffInfo, 3, 2, applyEdits, createModifiedCellDiffInfo);

			assert.deepStrictEqual(appliedEdits, [
				{
					editType: CellEditType.Replace,
					index: 2,
					cells: [{
						cellKind: CellKind.Code,
						language: 'python',
						outputs: [],
						mime: undefined,
						metadata: {},
						internalMetadata: {},
						source: cell1.getValue(),
					}], count: 0
				}
			]);

			assert.deepStrictEqual(result, [
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
					modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
					modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
				},
				{
					diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
					modifiedCellIndex: 2, modifiedModel: createModifiedModel('New1'),
				},
				{
					diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('InsertedOriginal:2'), originalCellIndex: 2,
					modifiedCellIndex: 3, modifiedModel: createModifiedModel('InsertedModified:3'),
				},
			]);
		});
	});

	suite('Cell Movements', function () {

		const keep = () => Promise.resolve(true);
		const undo = () => Promise.resolve(true);
		const diff = observableValue('cell1', nullDocumentDiff);

		ensureNoDisposablesAreLeakedInTestSuite();
		function createModifiedModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
			return `Modified:${id}` as any;

		}
		function createOriginalModel(id: string): ObservablePromise<ITextModel> {
			// eslint-disable-next-line local/code-no-any-casts
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

});
