/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { CellKind, MOVE_CURSOR_1_LINE_COMMAND, SelectionStateType } from '../../common/notebookCommon.js';
import { setupInstantiationService, TestCell, valueBytesFromString, withTestNotebook } from './testNotebookEditor.js';
suite('NotebookTextModel', () => {
    let disposables;
    let instantiationService;
    let languageService;
    ensureNoDisposablesAreLeakedInTestSuite();
    suiteSetup(() => {
        disposables = new DisposableStore();
        instantiationService = setupInstantiationService(disposables);
        languageService = instantiationService.get(ILanguageService);
        instantiationService.spy(IUndoRedoService, 'pushElement');
    });
    suiteTeardown(() => disposables.dispose());
    test('insert', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor, _viewModel, ds) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], languageService))] },
                { editType: 1 /* CellEditType.Replace */, index: 3, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 6, 'var f = 6;', 'javascript', CellKind.Code, [], languageService))] },
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 6);
            assert.strictEqual(textModel.cells[1].getValue(), 'var e = 5;');
            assert.strictEqual(textModel.cells[4].getValue(), 'var f = 6;');
        });
    });
    test('multiple inserts at same position', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor, _viewModel, ds) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], languageService))] },
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 6, 'var f = 6;', 'javascript', CellKind.Code, [], languageService))] },
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 6);
            assert.strictEqual(textModel.cells[1].getValue(), 'var e = 5;');
            assert.strictEqual(textModel.cells[2].getValue(), 'var f = 6;');
        });
    });
    test('delete', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: [] },
                { editType: 1 /* CellEditType.Replace */, index: 3, count: 1, cells: [] },
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells[0].getValue(), 'var a = 1;');
            assert.strictEqual(textModel.cells[1].getValue(), 'var c = 3;');
        });
    });
    test('delete + insert', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor, _viewModel, ds) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: [] },
                { editType: 1 /* CellEditType.Replace */, index: 3, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], languageService))] },
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 4);
            assert.strictEqual(textModel.cells[0].getValue(), 'var a = 1;');
            assert.strictEqual(textModel.cells[2].getValue(), 'var e = 5;');
        });
    });
    test('delete + insert at same position', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor, _viewModel, ds) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: [] },
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], languageService))] },
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 4);
            assert.strictEqual(textModel.cells[0].getValue(), 'var a = 1;');
            assert.strictEqual(textModel.cells[1].getValue(), 'var e = 5;');
            assert.strictEqual(textModel.cells[2].getValue(), 'var c = 3;');
        });
    });
    test('(replace) delete + insert at same position', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor, _viewModel, ds) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: [ds.add(new TestCell(textModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], languageService))] },
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 4);
            assert.strictEqual(textModel.cells[0].getValue(), 'var a = 1;');
            assert.strictEqual(textModel.cells[1].getValue(), 'var e = 5;');
            assert.strictEqual(textModel.cells[2].getValue(), 'var c = 3;');
        });
    });
    test('output', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            // invalid index 1
            assert.throws(() => {
                textModel.applyEdits([{
                        index: Number.MAX_VALUE,
                        editType: 2 /* CellEditType.Output */,
                        outputs: []
                    }], true, undefined, () => undefined, undefined, true);
            });
            // invalid index 2
            assert.throws(() => {
                textModel.applyEdits([{
                        index: -1,
                        editType: 2 /* CellEditType.Output */,
                        outputs: []
                    }], true, undefined, () => undefined, undefined, true);
            });
            textModel.applyEdits([{
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    outputs: [{
                            outputId: 'someId',
                            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString('_Hello_') }]
                        }]
                }], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 1);
            assert.strictEqual(textModel.cells[0].outputs.length, 1);
            // append
            textModel.applyEdits([{
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    append: true,
                    outputs: [{
                            outputId: 'someId2',
                            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString('_Hello2_') }]
                        }]
                }], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 1);
            assert.strictEqual(textModel.cells[0].outputs.length, 2);
            let [first, second] = textModel.cells[0].outputs;
            assert.strictEqual(first.outputId, 'someId');
            assert.strictEqual(second.outputId, 'someId2');
            // replace all
            textModel.applyEdits([{
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    outputs: [{
                            outputId: 'someId3',
                            outputs: [{ mime: Mimes.text, data: valueBytesFromString('Last, replaced output') }]
                        }]
                }], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 1);
            assert.strictEqual(textModel.cells[0].outputs.length, 1);
            [first] = textModel.cells[0].outputs;
            assert.strictEqual(first.outputId, 'someId3');
        });
    });
    test('multiple append output in one position', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            // append
            textModel.applyEdits([
                {
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    append: true,
                    outputs: [{
                            outputId: 'append1',
                            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString('append 1') }]
                        }]
                },
                {
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    append: true,
                    outputs: [{
                            outputId: 'append2',
                            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString('append 2') }]
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 1);
            assert.strictEqual(textModel.cells[0].outputs.length, 2);
            const [first, second] = textModel.cells[0].outputs;
            assert.strictEqual(first.outputId, 'append1');
            assert.strictEqual(second.outputId, 'append2');
        });
    });
    test('append to output created in same batch', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                {
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    append: true,
                    outputs: [{
                            outputId: 'append1',
                            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString('append 1') }]
                        }]
                },
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    append: true,
                    outputId: 'append1',
                    items: [{
                            mime: Mimes.markdown, data: valueBytesFromString('append 2')
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 1);
            assert.strictEqual(textModel.cells[0].outputs.length, 1, 'has 1 output');
            const [first] = textModel.cells[0].outputs;
            assert.strictEqual(first.outputId, 'append1');
            assert.strictEqual(first.outputs.length, 2, 'has 2 items');
        });
    });
    const stdOutMime = 'application/vnd.code.notebook.stdout';
    const stdErrMime = 'application/vnd.code.notebook.stderr';
    test('appending streaming outputs', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                {
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    append: true,
                    outputs: [{
                            outputId: 'append1',
                            outputs: [{ mime: stdOutMime, data: valueBytesFromString('append 1') }]
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            const [output] = textModel.cells[0].outputs;
            assert.strictEqual(output.versionId, 0, 'initial output version should be 0');
            textModel.applyEdits([
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    append: true,
                    outputId: 'append1',
                    items: [
                        { mime: stdOutMime, data: valueBytesFromString('append 2') },
                        { mime: stdOutMime, data: valueBytesFromString('append 3') }
                    ]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(output.versionId, 1, 'version should bump per append');
            textModel.applyEdits([
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    append: true,
                    outputId: 'append1',
                    items: [
                        { mime: stdOutMime, data: valueBytesFromString('append 4') },
                        { mime: stdOutMime, data: valueBytesFromString('append 5') }
                    ]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(output.versionId, 2, 'version should bump per append');
            assert.strictEqual(textModel.cells.length, 1);
            assert.strictEqual(textModel.cells[0].outputs.length, 1, 'has 1 output');
            assert.strictEqual(output.outputId, 'append1');
            assert.strictEqual(output.outputs.length, 1, 'outputs are compressed');
            assert.strictEqual(output.outputs[0].data.toString(), 'append 1append 2append 3append 4append 5');
            assert.strictEqual(output.appendedSinceVersion(0, stdOutMime)?.toString(), 'append 2append 3append 4append 5');
            assert.strictEqual(output.appendedSinceVersion(1, stdOutMime)?.toString(), 'append 4append 5');
            assert.strictEqual(output.appendedSinceVersion(2, stdOutMime), undefined);
            assert.strictEqual(output.appendedSinceVersion(2, stdErrMime), undefined);
        });
    });
    test('replacing streaming outputs', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                {
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    append: true,
                    outputs: [{
                            outputId: 'append1',
                            outputs: [{ mime: stdOutMime, data: valueBytesFromString('append 1') }]
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            const [output] = textModel.cells[0].outputs;
            assert.strictEqual(output.versionId, 0, 'initial output version should be 0');
            textModel.applyEdits([
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    append: true,
                    outputId: 'append1',
                    items: [{
                            mime: stdOutMime, data: valueBytesFromString('append 2')
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(output.versionId, 1, 'version should bump per append');
            textModel.applyEdits([
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    append: false,
                    outputId: 'append1',
                    items: [{
                            mime: stdOutMime, data: valueBytesFromString('replace 3')
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(output.versionId, 2, 'version should bump per replace');
            textModel.applyEdits([
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    append: true,
                    outputId: 'append1',
                    items: [{
                            mime: stdOutMime, data: valueBytesFromString('append 4')
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(output.versionId, 3, 'version should bump per append');
            assert.strictEqual(output.outputs[0].data.toString(), 'replace 3append 4');
            assert.strictEqual(output.appendedSinceVersion(0, stdOutMime), undefined, 'replacing output should clear out previous versioned output buffers');
            assert.strictEqual(output.appendedSinceVersion(1, stdOutMime), undefined, 'replacing output should clear out previous versioned output buffers');
            assert.strictEqual(output.appendedSinceVersion(2, stdOutMime)?.toString(), 'append 4');
        });
    });
    test('appending streaming outputs with move cursor compression', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                {
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    append: true,
                    outputs: [{
                            outputId: 'append1',
                            outputs: [
                                { mime: stdOutMime, data: valueBytesFromString('append 1') },
                                { mime: stdOutMime, data: valueBytesFromString('\nappend 1') }
                            ]
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            const [output] = textModel.cells[0].outputs;
            assert.strictEqual(output.versionId, 0, 'initial output version should be 0');
            textModel.applyEdits([
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    append: true,
                    outputId: 'append1',
                    items: [{
                            mime: stdOutMime, data: valueBytesFromString(MOVE_CURSOR_1_LINE_COMMAND + '\nappend 2')
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(output.versionId, 1, 'version should bump per append');
            assert.strictEqual(output.outputs[0].data.toString(), 'append 1\nappend 2');
            assert.strictEqual(output.appendedSinceVersion(0, stdOutMime), undefined, 'compressing outputs should clear out previous versioned output buffers');
        });
    });
    test('appending streaming outputs with carraige return compression', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                {
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    append: true,
                    outputs: [{
                            outputId: 'append1',
                            outputs: [
                                { mime: stdOutMime, data: valueBytesFromString('append 1') },
                                { mime: stdOutMime, data: valueBytesFromString('\nappend 1') }
                            ]
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            const [output] = textModel.cells[0].outputs;
            assert.strictEqual(output.versionId, 0, 'initial output version should be 0');
            textModel.applyEdits([
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    append: true,
                    outputId: 'append1',
                    items: [{
                            mime: stdOutMime, data: valueBytesFromString('\rappend 2')
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(output.versionId, 1, 'version should bump per append');
            assert.strictEqual(output.outputs[0].data.toString(), 'append 1\nappend 2');
            assert.strictEqual(output.appendedSinceVersion(0, stdOutMime), undefined, 'compressing outputs should clear out previous versioned output buffers');
        });
    });
    test('appending multiple different mime streaming outputs', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            textModel.applyEdits([
                {
                    index: 0,
                    editType: 2 /* CellEditType.Output */,
                    append: true,
                    outputs: [{
                            outputId: 'append1',
                            outputs: [
                                { mime: stdOutMime, data: valueBytesFromString('stdout 1') },
                                { mime: stdErrMime, data: valueBytesFromString('stderr 1') }
                            ]
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            const [output] = textModel.cells[0].outputs;
            assert.strictEqual(output.versionId, 0, 'initial output version should be 0');
            textModel.applyEdits([
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    append: true,
                    outputId: 'append1',
                    items: [
                        { mime: stdOutMime, data: valueBytesFromString('stdout 2') },
                        { mime: stdErrMime, data: valueBytesFromString('stderr 2') }
                    ]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(output.versionId, 1, 'version should bump per replace');
            assert.strictEqual(output.appendedSinceVersion(0, stdErrMime)?.toString(), 'stderr 2');
            assert.strictEqual(output.appendedSinceVersion(0, stdOutMime)?.toString(), 'stdout 2');
        });
    });
    test('metadata', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            // invalid index 1
            assert.throws(() => {
                textModel.applyEdits([{
                        index: Number.MAX_VALUE,
                        editType: 3 /* CellEditType.Metadata */,
                        metadata: {}
                    }], true, undefined, () => undefined, undefined, true);
            });
            // invalid index 2
            assert.throws(() => {
                textModel.applyEdits([{
                        index: -1,
                        editType: 3 /* CellEditType.Metadata */,
                        metadata: {}
                    }], true, undefined, () => undefined, undefined, true);
            });
            textModel.applyEdits([{
                    index: 0,
                    editType: 3 /* CellEditType.Metadata */,
                    metadata: { customProperty: 15 },
                }], true, undefined, () => undefined, undefined, true);
            textModel.applyEdits([{
                    index: 0,
                    editType: 3 /* CellEditType.Metadata */,
                    metadata: {},
                }], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 1);
            assert.strictEqual(textModel.cells[0].metadata.customProperty, undefined);
        });
    });
    test('partial metadata', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const textModel = editor.textModel;
            textModel.applyEdits([{
                    index: 0,
                    editType: 8 /* CellEditType.PartialMetadata */,
                    metadata: { customProperty: 15 },
                }], true, undefined, () => undefined, undefined, true);
            textModel.applyEdits([{
                    index: 0,
                    editType: 8 /* CellEditType.PartialMetadata */,
                    metadata: {},
                }], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 1);
            assert.strictEqual(textModel.cells[0].metadata.customProperty, 15);
        });
    });
    test('multiple inserts in one edit', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor, _viewModel, ds) => {
            const textModel = editor.textModel;
            let changeEvent = undefined;
            const eventListener = textModel.onDidChangeContent(e => {
                changeEvent = e;
            });
            const willChangeEvents = [];
            const willChangeListener = textModel.onWillAddRemoveCells(e => {
                willChangeEvents.push(e);
            });
            const version = textModel.versionId;
            textModel.applyEdits([
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: [] },
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, 'var e = 5;', 'javascript', CellKind.Code, [], languageService))] },
            ], true, undefined, () => ({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }), undefined, true);
            assert.strictEqual(textModel.cells.length, 4);
            assert.strictEqual(textModel.cells[0].getValue(), 'var a = 1;');
            assert.strictEqual(textModel.cells[1].getValue(), 'var e = 5;');
            assert.strictEqual(textModel.cells[2].getValue(), 'var c = 3;');
            assert.notStrictEqual(changeEvent, undefined);
            assert.strictEqual(changeEvent.rawEvents.length, 2);
            assert.deepStrictEqual(changeEvent.endSelectionState?.selections, [{ start: 0, end: 1 }]);
            assert.strictEqual(willChangeEvents.length, 2);
            assert.strictEqual(textModel.versionId, version + 1);
            eventListener.dispose();
            willChangeListener.dispose();
        });
    });
    test('insert and metadata change in one edit', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const textModel = editor.textModel;
            let changeEvent = undefined;
            const eventListener = textModel.onDidChangeContent(e => {
                changeEvent = e;
            });
            const willChangeEvents = [];
            const willChangeListener = textModel.onWillAddRemoveCells(e => {
                willChangeEvents.push(e);
            });
            const version = textModel.versionId;
            textModel.applyEdits([
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: [] },
                {
                    index: 0,
                    editType: 3 /* CellEditType.Metadata */,
                    metadata: {},
                }
            ], true, undefined, () => ({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }), undefined, true);
            assert.notStrictEqual(changeEvent, undefined);
            assert.strictEqual(changeEvent.rawEvents.length, 2);
            assert.deepStrictEqual(changeEvent.endSelectionState?.selections, [{ start: 0, end: 1 }]);
            assert.strictEqual(willChangeEvents.length, 1);
            assert.strictEqual(textModel.versionId, version + 1);
            eventListener.dispose();
            willChangeListener.dispose();
        });
    });
    test('Updating appending/updating output in Notebooks does not work as expected #117273', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            assert.strictEqual(model.cells.length, 1);
            assert.strictEqual(model.cells[0].outputs.length, 0);
            const success1 = model.applyEdits([{
                    editType: 2 /* CellEditType.Output */, index: 0, outputs: [
                        { outputId: 'out1', outputs: [{ mime: 'application/x.notebook.stream', data: VSBuffer.wrap(new Uint8Array([1])) }] }
                    ],
                    append: false
                }], true, undefined, () => undefined, undefined, false);
            assert.ok(success1);
            assert.strictEqual(model.cells[0].outputs.length, 1);
            const success2 = model.applyEdits([{
                    editType: 2 /* CellEditType.Output */, index: 0, outputs: [
                        { outputId: 'out2', outputs: [{ mime: 'application/x.notebook.stream', data: VSBuffer.wrap(new Uint8Array([1])) }] }
                    ],
                    append: true
                }], true, undefined, () => undefined, undefined, false);
            assert.ok(success2);
            assert.strictEqual(model.cells[0].outputs.length, 2);
        });
    });
    test('Clearing output of an empty notebook makes it dirty #119608', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}]
        ], (editor, _, ds) => {
            const model = editor.textModel;
            let event;
            ds.add(model.onDidChangeContent(e => { event = e; }));
            {
                // 1: add ouput -> event
                const success = model.applyEdits([{
                        editType: 2 /* CellEditType.Output */, index: 0, outputs: [
                            { outputId: 'out1', outputs: [{ mime: 'application/x.notebook.stream', data: VSBuffer.wrap(new Uint8Array([1])) }] }
                        ],
                        append: false
                    }], true, undefined, () => undefined, undefined, false);
                assert.ok(success);
                assert.strictEqual(model.cells[0].outputs.length, 1);
                assert.ok(event);
            }
            {
                // 2: clear all output w/ output -> event
                event = undefined;
                const success = model.applyEdits([{
                        editType: 2 /* CellEditType.Output */,
                        index: 0,
                        outputs: [],
                        append: false
                    }, {
                        editType: 2 /* CellEditType.Output */,
                        index: 1,
                        outputs: [],
                        append: false
                    }], true, undefined, () => undefined, undefined, false);
                assert.ok(success);
                assert.ok(event);
            }
            {
                // 2: clear all output wo/ output -> NO event
                event = undefined;
                const success = model.applyEdits([{
                        editType: 2 /* CellEditType.Output */,
                        index: 0,
                        outputs: [],
                        append: false
                    }, {
                        editType: 2 /* CellEditType.Output */,
                        index: 1,
                        outputs: [],
                        append: false
                    }], true, undefined, () => undefined, undefined, false);
                assert.ok(success);
                assert.ok(event === undefined);
            }
        });
    });
    test('Cell metadata/output change should update version id and alternative id #121807', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}]
        ], async (editor, viewModel) => {
            assert.strictEqual(editor.textModel.versionId, 0);
            const firstAltVersion = '0_0,1;1,1';
            assert.strictEqual(editor.textModel.alternativeVersionId, firstAltVersion);
            editor.textModel.applyEdits([
                {
                    index: 0,
                    editType: 3 /* CellEditType.Metadata */,
                    metadata: {
                        inputCollapsed: true
                    }
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(editor.textModel.versionId, 1);
            assert.notStrictEqual(editor.textModel.alternativeVersionId, firstAltVersion);
            const secondAltVersion = '1_0,1;1,1';
            assert.strictEqual(editor.textModel.alternativeVersionId, secondAltVersion);
            await viewModel.undo();
            assert.strictEqual(editor.textModel.versionId, 2);
            assert.strictEqual(editor.textModel.alternativeVersionId, firstAltVersion);
            await viewModel.redo();
            assert.strictEqual(editor.textModel.versionId, 3);
            assert.notStrictEqual(editor.textModel.alternativeVersionId, firstAltVersion);
            assert.strictEqual(editor.textModel.alternativeVersionId, secondAltVersion);
            editor.textModel.applyEdits([
                {
                    index: 1,
                    editType: 3 /* CellEditType.Metadata */,
                    metadata: {
                        inputCollapsed: true
                    }
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(editor.textModel.versionId, 4);
            assert.strictEqual(editor.textModel.alternativeVersionId, '4_0,1;1,1');
            await viewModel.undo();
            assert.strictEqual(editor.textModel.versionId, 5);
            assert.strictEqual(editor.textModel.alternativeVersionId, secondAltVersion);
        });
    });
    test('metadata changes on newly added cells should combine their undo operations', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}]
        ], async (editor, viewModel, ds) => {
            const textModel = editor.textModel;
            editor.textModel.applyEdits([
                {
                    editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [
                        ds.add(new TestCell(textModel.viewType, 1, 'var e = 5;', 'javascript', CellKind.Code, [], languageService)),
                        ds.add(new TestCell(textModel.viewType, 2, 'var f = 6;', 'javascript', CellKind.Code, [], languageService))
                    ]
                },
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 3);
            editor.textModel.applyEdits([
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: { id: '123' } },
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells[1].metadata.id, '123');
            await viewModel.undo();
            assert.strictEqual(textModel.cells.length, 1);
            await viewModel.redo();
            assert.strictEqual(textModel.cells.length, 3);
        });
    });
    test('changes with non-metadata edit should not combine their undo operations', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}]
        ], async (editor, viewModel, ds) => {
            const textModel = editor.textModel;
            editor.textModel.applyEdits([
                {
                    editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: [
                        ds.add(new TestCell(textModel.viewType, 1, 'var e = 5;', 'javascript', CellKind.Code, [], languageService)),
                        ds.add(new TestCell(textModel.viewType, 2, 'var f = 6;', 'javascript', CellKind.Code, [], languageService))
                    ]
                },
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells.length, 3);
            editor.textModel.applyEdits([
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: { id: '123' } },
                {
                    editType: 2 /* CellEditType.Output */, handle: 0, append: true, outputs: [{
                            outputId: 'newOutput',
                            outputs: [{ mime: Mimes.text, data: valueBytesFromString('cba') }, { mime: 'application/foo', data: valueBytesFromString('cba') }]
                        }]
                }
            ], true, undefined, () => undefined, undefined, true);
            assert.strictEqual(textModel.cells[1].metadata.id, '123');
            await viewModel.undo();
            assert.strictEqual(textModel.cells.length, 3);
            await viewModel.undo();
            assert.strictEqual(textModel.cells.length, 1);
        });
    });
    test('Destructive sorting in _doApplyEdits #121994', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [{ outputId: 'i42', outputs: [{ mime: 'm/ime', data: valueBytesFromString('test') }] }], {}]
        ], async (editor) => {
            const notebook = editor.textModel;
            assert.strictEqual(notebook.cells[0].outputs.length, 1);
            assert.strictEqual(notebook.cells[0].outputs[0].outputs.length, 1);
            assert.deepStrictEqual(notebook.cells[0].outputs[0].outputs[0].data, valueBytesFromString('test'));
            const edits = [
                {
                    editType: 2 /* CellEditType.Output */, handle: 0, outputs: []
                },
                {
                    editType: 2 /* CellEditType.Output */, handle: 0, append: true, outputs: [{
                            outputId: 'newOutput',
                            outputs: [{ mime: Mimes.text, data: valueBytesFromString('cba') }, { mime: 'application/foo', data: valueBytesFromString('cba') }]
                        }]
                }
            ];
            editor.textModel.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.strictEqual(notebook.cells[0].outputs.length, 1);
            assert.strictEqual(notebook.cells[0].outputs[0].outputs.length, 2);
        });
    });
    test('Destructive sorting in _doApplyEdits #121994. cell splice between output changes', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [{ outputId: 'i42', outputs: [{ mime: 'm/ime', data: valueBytesFromString('test') }] }], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [{ outputId: 'i43', outputs: [{ mime: 'm/ime', data: valueBytesFromString('test') }] }], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [{ outputId: 'i44', outputs: [{ mime: 'm/ime', data: valueBytesFromString('test') }] }], {}]
        ], async (editor) => {
            const notebook = editor.textModel;
            const edits = [
                {
                    editType: 2 /* CellEditType.Output */, index: 0, outputs: []
                },
                {
                    editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: []
                },
                {
                    editType: 2 /* CellEditType.Output */, index: 2, append: true, outputs: [{
                            outputId: 'newOutput',
                            outputs: [{ mime: Mimes.text, data: valueBytesFromString('cba') }, { mime: 'application/foo', data: valueBytesFromString('cba') }]
                        }]
                }
            ];
            editor.textModel.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.strictEqual(notebook.cells.length, 2);
            assert.strictEqual(notebook.cells[0].outputs.length, 0);
            assert.strictEqual(notebook.cells[1].outputs.length, 2);
            assert.strictEqual(notebook.cells[1].outputs[0].outputId, 'i44');
            assert.strictEqual(notebook.cells[1].outputs[1].outputId, 'newOutput');
        });
    });
    test('Destructive sorting in _doApplyEdits #121994. cell splice between output changes 2', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [{ outputId: 'i42', outputs: [{ mime: 'm/ime', data: valueBytesFromString('test') }] }], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [{ outputId: 'i43', outputs: [{ mime: 'm/ime', data: valueBytesFromString('test') }] }], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [{ outputId: 'i44', outputs: [{ mime: 'm/ime', data: valueBytesFromString('test') }] }], {}]
        ], async (editor) => {
            const notebook = editor.textModel;
            const edits = [
                {
                    editType: 2 /* CellEditType.Output */, index: 1, append: true, outputs: [{
                            outputId: 'newOutput',
                            outputs: [{ mime: Mimes.text, data: valueBytesFromString('cba') }, { mime: 'application/foo', data: valueBytesFromString('cba') }]
                        }]
                },
                {
                    editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: []
                },
                {
                    editType: 2 /* CellEditType.Output */, index: 1, append: true, outputs: [{
                            outputId: 'newOutput2',
                            outputs: [{ mime: Mimes.text, data: valueBytesFromString('cba') }, { mime: 'application/foo', data: valueBytesFromString('cba') }]
                        }]
                }
            ];
            editor.textModel.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.strictEqual(notebook.cells.length, 2);
            assert.strictEqual(notebook.cells[0].outputs.length, 1);
            assert.strictEqual(notebook.cells[1].outputs.length, 1);
            assert.strictEqual(notebook.cells[1].outputs[0].outputId, 'i44');
        });
    });
    test('Output edits splice', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            assert.strictEqual(model.cells.length, 1);
            assert.strictEqual(model.cells[0].outputs.length, 0);
            const success1 = model.applyEdits([{
                    editType: 2 /* CellEditType.Output */, index: 0, outputs: [
                        { outputId: 'out1', outputs: [{ mime: 'application/x.notebook.stream', data: valueBytesFromString('1') }] },
                        { outputId: 'out2', outputs: [{ mime: 'application/x.notebook.stream', data: valueBytesFromString('2') }] },
                        { outputId: 'out3', outputs: [{ mime: 'application/x.notebook.stream', data: valueBytesFromString('3') }] },
                        { outputId: 'out4', outputs: [{ mime: 'application/x.notebook.stream', data: valueBytesFromString('4') }] }
                    ],
                    append: false
                }], true, undefined, () => undefined, undefined, false);
            assert.ok(success1);
            assert.strictEqual(model.cells[0].outputs.length, 4);
            const success2 = model.applyEdits([{
                    editType: 2 /* CellEditType.Output */, index: 0, outputs: [
                        { outputId: 'out1', outputs: [{ mime: 'application/x.notebook.stream', data: valueBytesFromString('1') }] },
                        { outputId: 'out5', outputs: [{ mime: 'application/x.notebook.stream', data: valueBytesFromString('5') }] },
                        { outputId: 'out3', outputs: [{ mime: 'application/x.notebook.stream', data: valueBytesFromString('3') }] },
                        { outputId: 'out6', outputs: [{ mime: 'application/x.notebook.stream', data: valueBytesFromString('6') }] }
                    ],
                    append: false
                }], true, undefined, () => undefined, undefined, false);
            assert.ok(success2);
            assert.strictEqual(model.cells[0].outputs.length, 4);
            assert.strictEqual(model.cells[0].outputs[0].outputId, 'out1');
            assert.strictEqual(model.cells[0].outputs[1].outputId, 'out5');
            assert.strictEqual(model.cells[0].outputs[2].outputId, 'out3');
            assert.strictEqual(model.cells[0].outputs[3].outputId, 'out6');
        });
    });
    test('computeEdits no insert', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const edits = NotebookTextModel.computeEdits(model, [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined }
            ]);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: {} }
            ]);
        });
    });
    test('computeEdits cell content changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 2;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, count: 1, cells },
            ]);
        });
    });
    test('computeEdits last cell content changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined },
                { source: 'var b = 2;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: {} },
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: cells.slice(1) },
            ]);
        });
    });
    test('computeEdits first cell content changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 2;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined },
                { source: 'var b = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, count: 1, cells: cells.slice(0, 1) },
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: {} },
            ]);
        });
    });
    test('computeEdits middle cell content changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['var c = 1;', 'javascript', CellKind.Code, [], {}],
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined },
                { source: 'var b = 2;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined },
                { source: 'var c = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: {} },
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: cells.slice(1, 2) },
                { editType: 3 /* CellEditType.Metadata */, index: 2, metadata: {} },
            ]);
        });
    });
    test('computeEdits cell metadata changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: { name: 'foo' } },
                { source: 'var b = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: { name: 'foo' } },
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: {} },
            ]);
        });
    });
    test('computeEdits cell language changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'typescript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined },
                { source: 'var b = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, count: 1, cells: cells.slice(0, 1) },
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: {} },
            ]);
        });
    });
    test('computeEdits cell kind changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined },
                { source: 'var b = 1;', language: 'javascript', cellKind: CellKind.Markup, mime: undefined, outputs: [], metadata: undefined }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: {} },
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: cells.slice(1) },
            ]);
        });
    });
    test('computeEdits cell metadata & content changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: { name: 'foo' } },
                { source: 'var b = 2;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: { name: 'bar' } }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: { name: 'foo' } },
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: cells.slice(1) }
            ]);
        });
    });
    test('computeEdits cell content changed while executing', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: {} },
                { source: 'var b = 2;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: {} }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells, [model.cells[1].handle]);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: {} },
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 1, cells: cells.slice(1) }
            ]);
        });
    });
    test('computeEdits cell internal metadata changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined, internalMetadata: { executionOrder: 1 } },
                { source: 'var b = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 1 /* CellEditType.Replace */, index: 0, count: 1, cells: cells.slice(0, 1) },
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: {} },
            ]);
        });
    });
    test('computeEdits cell internal metadata changed while executing', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: {} },
                { source: 'var b = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: {}, internalMetadata: { executionOrder: 1 } }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells, [model.cells[1].handle]);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: {} },
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: {} },
            ]);
        });
    });
    test('computeEdits cell insertion', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                { source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined, },
                { source: 'var c = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: undefined, },
                { source: 'var b = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: { foo: 'bar' } }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: {} },
                { editType: 1 /* CellEditType.Replace */, index: 1, count: 0, cells: cells.slice(1, 2) },
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: { foo: 'bar' } },
            ]);
            model.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.equal(model.cells.length, 3);
            assert.equal(model.cells[1].getValue(), 'var c = 1;');
            assert.equal(model.cells[2].getValue(), 'var b = 1;');
            assert.deepStrictEqual(model.cells[2].metadata, { foo: 'bar' });
        });
    });
    test('computeEdits output changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                {
                    source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [{
                            outputId: 'someId',
                            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString('_World_') }]
                        }], metadata: undefined,
                },
                { source: 'var b = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: { foo: 'bar' } }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: {} },
                {
                    editType: 2 /* CellEditType.Output */, index: 0, outputs: [{
                            outputId: 'someId',
                            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString('_World_') }]
                        }], append: false
                },
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: { foo: 'bar' } },
            ]);
            model.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.equal(model.cells.length, 2);
            assert.strictEqual(model.cells[0].outputs.length, 1);
            assert.equal(model.cells[0].outputs[0].outputId, 'someId');
            assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), '_World_');
        });
    });
    test('computeEdits output items changed', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [{
                        outputId: 'someId',
                        outputs: [{ mime: Mimes.markdown, data: valueBytesFromString('_Hello_') }]
                    }], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}]
        ], (editor) => {
            const model = editor.textModel;
            const cells = [
                {
                    source: 'var a = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [{
                            outputId: 'someId',
                            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString('_World_') }]
                        }], metadata: undefined,
                },
                { source: 'var b = 1;', language: 'javascript', cellKind: CellKind.Code, mime: undefined, outputs: [], metadata: { foo: 'bar' } }
            ];
            const edits = NotebookTextModel.computeEdits(model, cells);
            assert.deepStrictEqual(edits, [
                { editType: 3 /* CellEditType.Metadata */, index: 0, metadata: {} },
                { editType: 7 /* CellEditType.OutputItems */, outputId: 'someId', items: [{ mime: Mimes.markdown, data: valueBytesFromString('_World_') }], append: false },
                { editType: 3 /* CellEditType.Metadata */, index: 1, metadata: { foo: 'bar' } },
            ]);
            model.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.equal(model.cells.length, 2);
            assert.strictEqual(model.cells[0].outputs.length, 1);
            assert.equal(model.cells[0].outputs[0].outputId, 'someId');
            assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), '_World_');
        });
    });
    test('Append multiple text/plain output items', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [{
                        outputId: '1',
                        outputs: [{ mime: 'text/plain', data: valueBytesFromString('foo') }]
                    }], {}]
        ], (editor) => {
            const model = editor.textModel;
            const edits = [
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    outputId: '1',
                    append: true,
                    items: [{ mime: 'text/plain', data: VSBuffer.fromString('bar') }, { mime: 'text/plain', data: VSBuffer.fromString('baz') }]
                }
            ];
            model.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.equal(model.cells.length, 1);
            assert.equal(model.cells[0].outputs.length, 1);
            assert.equal(model.cells[0].outputs[0].outputs.length, 3);
            assert.equal(model.cells[0].outputs[0].outputs[0].mime, 'text/plain');
            assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), 'foo');
            assert.equal(model.cells[0].outputs[0].outputs[1].mime, 'text/plain');
            assert.equal(model.cells[0].outputs[0].outputs[1].data.toString(), 'bar');
            assert.equal(model.cells[0].outputs[0].outputs[2].mime, 'text/plain');
            assert.equal(model.cells[0].outputs[0].outputs[2].data.toString(), 'baz');
        });
    });
    test('Append multiple stdout stream output items to an output with another mime', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [{
                        outputId: '1',
                        outputs: [{ mime: 'text/plain', data: valueBytesFromString('foo') }]
                    }], {}]
        ], (editor) => {
            const model = editor.textModel;
            const edits = [
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    outputId: '1',
                    append: true,
                    items: [{ mime: 'application/vnd.code.notebook.stdout', data: VSBuffer.fromString('bar') }, { mime: 'application/vnd.code.notebook.stdout', data: VSBuffer.fromString('baz') }]
                }
            ];
            model.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.equal(model.cells.length, 1);
            assert.equal(model.cells[0].outputs.length, 1);
            assert.equal(model.cells[0].outputs[0].outputs.length, 3);
            assert.equal(model.cells[0].outputs[0].outputs[0].mime, 'text/plain');
            assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), 'foo');
            assert.equal(model.cells[0].outputs[0].outputs[1].mime, 'application/vnd.code.notebook.stdout');
            assert.equal(model.cells[0].outputs[0].outputs[1].data.toString(), 'bar');
            assert.equal(model.cells[0].outputs[0].outputs[2].mime, 'application/vnd.code.notebook.stdout');
            assert.equal(model.cells[0].outputs[0].outputs[2].data.toString(), 'baz');
        });
    });
    test('Compress multiple stdout stream output items', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [{
                        outputId: '1',
                        outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('foo') }]
                    }], {}]
        ], (editor) => {
            const model = editor.textModel;
            const edits = [
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    outputId: '1',
                    append: true,
                    items: [{ mime: 'application/vnd.code.notebook.stdout', data: VSBuffer.fromString('bar') }, { mime: 'application/vnd.code.notebook.stdout', data: VSBuffer.fromString('baz') }]
                }
            ];
            model.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.equal(model.cells.length, 1);
            assert.equal(model.cells[0].outputs.length, 1);
            assert.equal(model.cells[0].outputs[0].outputs.length, 1);
            assert.equal(model.cells[0].outputs[0].outputs[0].mime, 'application/vnd.code.notebook.stdout');
            assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), 'foobarbaz');
        });
    });
    test('Compress multiple stderr stream output items', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [{
                        outputId: '1',
                        outputs: [{ mime: 'application/vnd.code.notebook.stderr', data: valueBytesFromString('foo') }]
                    }], {}]
        ], (editor) => {
            const model = editor.textModel;
            const edits = [
                {
                    editType: 7 /* CellEditType.OutputItems */,
                    outputId: '1',
                    append: true,
                    items: [{ mime: 'application/vnd.code.notebook.stderr', data: VSBuffer.fromString('bar') }, { mime: 'application/vnd.code.notebook.stderr', data: VSBuffer.fromString('baz') }]
                }
            ];
            model.applyEdits(edits, true, undefined, () => undefined, undefined, true);
            assert.equal(model.cells.length, 1);
            assert.equal(model.cells[0].outputs.length, 1);
            assert.equal(model.cells[0].outputs[0].outputs.length, 1);
            assert.equal(model.cells[0].outputs[0].outputs[0].mime, 'application/vnd.code.notebook.stderr');
            assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), 'foobarbaz');
        });
    });
    test('findNextMatch', async function () {
        await withTestNotebook([
            ['var a = 1;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor, viewModel) => {
            const notebookModel = viewModel.notebookDocument;
            // Test case 1: Find 'var' starting from the first cell
            let findMatch = notebookModel.findNextMatch('var', { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 1);
            // Test case 2: Find 'b' starting from the second cell
            findMatch = notebookModel.findNextMatch('b', { cellIndex: 1, position: new Position(1, 1) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 5);
            // Test case 3: Find 'c' starting from the third cell
            findMatch = notebookModel.findNextMatch('c', { cellIndex: 2, position: new Position(1, 1) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 5);
            // Test case 4: Find 'd' starting from the fourth cell
            findMatch = notebookModel.findNextMatch('d', { cellIndex: 3, position: new Position(1, 1) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 5);
            // Test case 5: No match found
            findMatch = notebookModel.findNextMatch('e', { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
            assert.strictEqual(findMatch, null);
        });
    });
    test('findNextMatch 2', async function () {
        await withTestNotebook([
            ['var a = 1; var a = 2;', 'javascript', CellKind.Code, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['var c = 3;', 'javascript', CellKind.Code, [], {}],
            ['var d = 4;', 'javascript', CellKind.Code, [], {}]
        ], (editor, viewModel) => {
            const notebookModel = viewModel.notebookDocument;
            // Test case 1: Find 'var' starting from the first cell
            let findMatch = notebookModel.findNextMatch('var', { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 1);
            // Test case 2: Find 'b' starting from the second cell
            findMatch = notebookModel.findNextMatch('b', { cellIndex: 1, position: new Position(1, 1) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 5);
            // Test case 3: Find 'c' starting from the third cell
            findMatch = notebookModel.findNextMatch('c', { cellIndex: 2, position: new Position(1, 1) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 5);
            // Test case 4: Find 'd' starting from the fourth cell
            findMatch = notebookModel.findNextMatch('d', { cellIndex: 3, position: new Position(1, 1) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 5);
            // Test case 5: No match found
            findMatch = notebookModel.findNextMatch('e', { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
            assert.strictEqual(findMatch, null);
            // Test case 6: Same keywords in the same cell
            findMatch = notebookModel.findNextMatch('var', { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 1);
            findMatch = notebookModel.findNextMatch('var', { cellIndex: 0, position: new Position(1, 5) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 12);
            // Test case 7: Search from the middle of a cell with keyword before and after
            findMatch = notebookModel.findNextMatch('a', { cellIndex: 0, position: new Position(1, 10) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 13);
            // Test case 8: Search from a cell and next match is in another cell below
            findMatch = notebookModel.findNextMatch('var', { cellIndex: 0, position: new Position(1, 20) }, false, false, null);
            assert.ok(findMatch);
            assert.strictEqual(findMatch.match.range.startLineNumber, 1);
            assert.strictEqual(findMatch.match.range.startColumn, 1);
            // assert.strictEqual(match!.cellIndex, 1);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tUZXh0TW9kZWwudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9ub3RlYm9va1RleHRNb2RlbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDekUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFnQixRQUFRLEVBQXNCLDBCQUEwQixFQUFzRSxrQkFBa0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ2hOLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxRQUFRLEVBQUUsb0JBQW9CLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUV0SCxLQUFLLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO0lBQy9CLElBQUksV0FBNEIsQ0FBQztJQUNqQyxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksZUFBaUMsQ0FBQztJQUV0Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFVBQVUsQ0FBQyxH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