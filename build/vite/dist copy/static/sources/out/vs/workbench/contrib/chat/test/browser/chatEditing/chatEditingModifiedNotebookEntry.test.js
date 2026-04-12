/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { adjustCellDiffAndOriginalModelBasedOnCellAddDelete, adjustCellDiffAndOriginalModelBasedOnCellMovements, adjustCellDiffForKeepingADeletedCell, adjustCellDiffForKeepingAnInsertedCell, adjustCellDiffForRevertingADeletedCell, adjustCellDiffForRevertingAnInsertedCell } from '../../../browser/chatEditing/notebook/helpers.js';
import { nullDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { CellKind, NotebookCellsChangeType } from '../../../../notebook/common/notebookCommon.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hash } from '../../../../../../base/common/hash.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
suite('ChatEditingModifiedNotebookEntry', function () {
    suite('Keep Inserted Cell', function () {
        const keep = () => Promise.resolve(true);
        const undo = () => Promise.resolve(true);
        const diff = observableValue('cell1', nullDocumentDiff);
        const appliedEdits = [];
        setup(() => {
            appliedEdits.length = 0;
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        function createModifiedModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Modified:${id}`;
        }
        function createOriginalModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Original:${id}`;
        }
        function applyEdits(edits) {
            appliedEdits.push(...edits);
            return true;
        }
        function createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
            return {
                diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`), originalCellIndex,
                modifiedCellIndex, modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`),
            };
        }
        test('Keep first inserted', async function () {
            const cellsDiffInfo = [
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
            cellsDiffInfo, {}, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, cells: [{}], count: 0 },
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
            const cellsDiffInfo = [
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
            cellsDiffInfo, {}, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, cells: [{}], count: 0 },
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
            const cellsDiffInfo = [
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
            cellsDiffInfo, {}, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 2, cells: [{}], count: 0 },
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
        const appliedEdits = [];
        setup(() => {
            appliedEdits.length = 0;
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        function createModifiedModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Modified:${id}`;
        }
        function createOriginalModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Original:${id}`;
        }
        function applyEdits(edits) {
            appliedEdits.push(...edits);
            return true;
        }
        test('Delete first inserted', async function () {
            const cellsDiffInfo = [
                {
                    diff, keep, undo, type: 'insert', originalModel: createOriginalModel('null'), originalCellIndex: undefined,
                    modifiedCellIndex: 0, modifiedModel: createModifiedModel('New0'),
                },
                {
                    diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
                    modifiedCellIndex: 1, modifiedModel: createModifiedModel('0'),
                },
            ];
            const result = adjustCellDiffForRevertingAnInsertedCell(0, cellsDiffInfo, applyEdits);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, cells: [], count: 1 },
            ]);
            assert.deepStrictEqual(result, [
                {
                    diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
                    modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
                },
            ]);
        });
        test('Delete first inserted with multiple cells', async function () {
            const cellsDiffInfo = [
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
            const result = adjustCellDiffForRevertingAnInsertedCell(0, cellsDiffInfo, applyEdits);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, cells: [], count: 1 },
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffForRevertingAnInsertedCell(2, cellsDiffInfo, applyEdits);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 2, cells: [], count: 1 },
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffForRevertingAnInsertedCell(2, cellsDiffInfo, applyEdits);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 2, cells: [], count: 1 },
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
        const appliedEdits = [];
        setup(() => {
            appliedEdits.length = 0;
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        function createModifiedModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Modified:${id}`;
        }
        function createOriginalModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Original:${id}`;
        }
        function applyEdits(edits) {
            appliedEdits.push(...edits);
            return true;
        }
        test('Keep first deleted cell', async function () {
            const cellsDiffInfo = [
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
            const result = adjustCellDiffForKeepingADeletedCell(0, cellsDiffInfo, applyEdits);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, cells: [], count: 1 },
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffForKeepingADeletedCell(1, cellsDiffInfo, applyEdits);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 1, cells: [], count: 1 },
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffForKeepingADeletedCell(1, cellsDiffInfo, applyEdits);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 1, cells: [], count: 1 },
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
        const appliedEdits = [];
        setup(() => {
            appliedEdits.length = 0;
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        function createModifiedModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Modified:${id}`;
        }
        function createOriginalModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Original:${id}`;
        }
        function applyEdits(edits) {
            appliedEdits.push(...edits);
            return true;
        }
        function createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
            return {
                diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`), originalCellIndex,
                modifiedCellIndex, modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`),
            };
        }
        test('Revert first deleted cell', async function () {
            const cellsDiffInfo = [
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
            const result = adjustCellDiffForRevertingADeletedCell(0, cellsDiffInfo, 
            // eslint-disable-next-line local/code-no-any-casts
            {}, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, cells: [{}], count: 0 },
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffForRevertingADeletedCell(1, cellsDiffInfo, 
            // eslint-disable-next-line local/code-no-any-casts
            {}, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, cells: [{}], count: 0 },
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffForRevertingADeletedCell(1, cellsDiffInfo, 
            // eslint-disable-next-line local/code-no-any-casts
            {}, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                { editType: 1 /* CellEditType.Replace */, index: 3, cells: [{}], count: 0 },
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
        const appliedEdits = [];
        setup(() => {
            appliedEdits.length = 0;
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        function createModifiedModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Modified:${id}`;
        }
        function createOriginalModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Original:${id}`;
        }
        function applyEdits(edits) {
            appliedEdits.push(...edits);
            return true;
        }
        function createICell(cellKind, source) {
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
            };
        }
        function createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
            return {
                diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel(`InsertedOriginal:${originalCellIndex}`), originalCellIndex,
                modifiedCellIndex, modifiedModel: createModifiedModel(`InsertedModified:${modifiedCellIndex}`),
            };
        }
        test('Insert a new cell into an unchanged notebook', async function () {
            const cellsDiffInfo = [
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
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([0, 0, [cell]], cellsDiffInfo, 3, 2, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([2, 0, [cell]], cellsDiffInfo, 6, 7, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([2, 0, [cell1, cell2]], cellsDiffInfo, 4, 6, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
                {
                    diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
                    modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
                },
                {
                    diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
                    modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
                },
            ];
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([0, 1, []], cellsDiffInfo, 2, 2, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
                {
                    diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('0'), originalCellIndex: 0,
                    modifiedCellIndex: 0, modifiedModel: createModifiedModel('0'),
                },
                {
                    diff, keep, undo, type: 'unchanged', originalModel: createOriginalModel('1'), originalCellIndex: 1,
                    modifiedCellIndex: 1, modifiedModel: createModifiedModel('1'),
                },
            ];
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([1, 1, []], cellsDiffInfo, 2, 2, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([0, 0, [cell1]], cellsDiffInfo, 2, 2, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
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
                ]], cellsDiffInfo, 4, 6, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, []);
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([1, 2, []], cellsDiffInfo, 4, 6, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([1, 3, []], cellsDiffInfo, 5, 7, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
                    index: 1,
                    cells: [], count: 1
                },
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([2, 0, [cell1]], cellsDiffInfo, 3, 1, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([2, 0, [cell1]], cellsDiffInfo, 3, 2, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
            const cellsDiffInfo = [
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
            const result = adjustCellDiffAndOriginalModelBasedOnCellAddDelete([3, 0, [cell1]], cellsDiffInfo, 3, 2, applyEdits, createModifiedCellDiffInfo);
            assert.deepStrictEqual(appliedEdits, [
                {
                    editType: 1 /* CellEditType.Replace */,
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
        function createModifiedModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Modified:${id}`;
        }
        function createOriginalModel(id) {
            // eslint-disable-next-line local/code-no-any-casts
            return `Original:${id}`;
        }
        test('Swap first two inserted cells in a previously empty notebook', async function () {
            const cellsDiffInfo = [
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
            const cellsDiffInfo = [
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
            const cellsDiffInfo = [
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
            const cellsDiffInfo = [
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
                    editType: 6 /* CellEditType.Move */,
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
            const cellsDiffInfo = [
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
            const cellsDiffInfo = [
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
            const cellsDiffInfo = [
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
                    editType: 6 /* CellEditType.Move */,
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
            const cellsDiffInfo = [
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
                    editType: 6 /* CellEditType.Move */,
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
            const cellsDiffInfo = [
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
                    editType: 6 /* CellEditType.Move */,
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
            const cellsDiffInfo = [
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
                    editType: 6 /* CellEditType.Move */,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrREFBa0QsRUFBRSxrREFBa0QsRUFBRSxvQ0FBb0MsRUFBRSxzQ0FBc0MsRUFBRSxzQ0FBc0MsRUFBRSx3Q0FBd0MsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRTFVLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2hHLE9BQU8sRUFBcUIsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDakcsT0FBTyxFQUFnQixRQUFRLEVBQTZCLHVCQUF1QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFM0ksT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFckUsS0FBSyxDQUFDLGtDQUFrQyxFQUFFO0lBQ3pDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRTtRQUUzQixNQUFNLElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMs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