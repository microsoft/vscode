/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { LcsDiff } from '../../../../../../base/common/diff/diff.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../../base/common/mime.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NotebookDiffEditorEventDispatcher } from '../../../browser/diff/eventDispatcher.js';
import { NotebookDiffViewModel, prettyChanges } from '../../../browser/diff/notebookDiffViewModel.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { INotebookService } from '../../../common/notebookService.js';
import { withTestNotebookDiffModel } from '../testNotebookEditor.js';
class CellSequence {
    constructor(textModel) {
        this.textModel = textModel;
    }
    getElements() {
        const hashValue = new Int32Array(this.textModel.cells.length);
        for (let i = 0; i < this.textModel.cells.length; i++) {
            hashValue[i] = this.textModel.cells[i].getHashValue();
        }
        return hashValue;
    }
}
suite('NotebookDiff', () => {
    let disposables;
    let token;
    let eventDispatcher;
    let diffViewModel;
    let diffResult;
    let notebookEditorWorkerService;
    let heightCalculator;
    teardown(() => disposables.dispose());
    const configurationService = new TestConfigurationService({ notebook: { diff: { ignoreMetadata: true } } });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        disposables = new DisposableStore();
        const cancellation = disposables.add(new CancellationTokenSource());
        eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
        token = cancellation.token;
        notebookEditorWorkerService = new class extends mock() {
            computeDiff() { return Promise.resolve({ cellsDiff: diffResult, metadataChanged: false }); }
        };
        heightCalculator = new class extends mock() {
            diffAndComputeHeight() { return Promise.resolve(0); }
            computeHeightFromLines(_lineCount) {
                return 0;
            }
        };
    });
    async function verifyChangeEventIsNotFired(diffViewModel) {
        let eventArgs = undefined;
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
            let eventArgs = undefined;
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
            diffViewModel.items[1].hideUnchangedCells();
            assert.strictEqual(diffViewModel.items.length, 2);
            assert.strictEqual(diffViewModel.items[0].type, 'modified');
            assert.strictEqual(diffViewModel.items[1].type, 'placeholder');
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
            let eventArgs = undefined;
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
            let eventArgs = undefined;
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
            let eventArgs;
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
            let eventArgs;
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
            diffViewModel.items[1].hideUnchangedCells();
            assert.strictEqual(diffViewModel.items.length, 2);
            assert.strictEqual(diffViewModel.items[0].type, 'insert');
            assert.strictEqual(diffViewModel.items[1].type, 'placeholder');
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
            let eventArgs = undefined;
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
            assert.strictEqual(diffViewModel.items[0].type, 'unchanged');
            assert.strictEqual(diffViewModel.items[1].type, 'unchanged');
            assert.strictEqual(diffViewModel.items[2].type, 'unchanged');
            assert.strictEqual(diffViewModel.items[3].type, 'unchanged');
            assert.strictEqual(diffViewModel.items[4].type, 'insert');
            assert.strictEqual(diffViewModel.items[5].type, 'unchanged');
            assert.deepStrictEqual(eventArgs, { start: 5, deleteCount: 1, elements: diffViewModel.items.slice(5) });
            diffViewModel.items[0].hideUnchangedCells();
            assert.strictEqual(diffViewModel.items[0].type, 'placeholder');
            assert.strictEqual(diffViewModel.items[1].type, 'insert');
            assert.strictEqual(diffViewModel.items[2].type, 'unchanged');
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
            prettyChanges(model.original.notebook, model.modified.notebook, diffResult);
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
            prettyChanges(model.original.notebook, model.modified.notebook, diffResult);
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
            await diffViewModel.computeDiff(token);
            assert.strictEqual(diffViewModel.items.length, 2);
            assert.strictEqual(diffViewModel.items[0].type, 'placeholder');
            diffViewModel.items[0].showHiddenCells();
            assert.strictEqual(diffViewModel.items[0].checkIfOutputsModified(), false);
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
            diffViewModel = disposables.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, undefined));
            await diffViewModel.computeDiff(token);
            assert.strictEqual(diffViewModel.items.length, 2);
            assert.strictEqual(diffViewModel.items[0].type, 'placeholder');
            diffViewModel.items[0].showHiddenCells();
            assert.strictEqual(diffViewModel.items[0].original.textModel.equal(diffViewModel.items[0].modified.textModel), true);
            assert.strictEqual(diffViewModel.items[1].original.textModel.equal(diffViewModel.items[1].modified.textModel), false);
            await verifyChangeEventIsNotFired(diffViewModel);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tEaWZmLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvZGlmZi9ub3RlYm9va0RpZmYudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMzRyxPQUFPLEVBQTBCLE9BQU8sRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDOUQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBRTVILE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFzQixNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRXRFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBR3JFLE1BQU0sWUFBWTtJQUVqQixZQUFxQixTQUE2QjtRQUE3QixjQUFTLEdBQVQsU0FBUyxDQUFvQjtJQUNsRCxDQUFDO0lBRUQsV0FBVztRQUNWLE1BQU0sU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzlELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN0RCxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDdkQsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7Q0FDRDtBQUVELEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO0lBQzFCLElBQUksV0FBNEIsQ0FBQztJQUNqQyxJQUFJLEtBQXdCLENBQUM7SUFDN0IsSUFBSSxlQUFrRCxDQUFDO0lBQ3ZELElBQUksYUFBb0MsQ0FBQztJQUN6QyxJQUFJLFVBQXVCLENBQUM7SUFDNUIsSUFBSSwyQkFBeUQsQ0FBQztJQUM5RCxJQUFJLGdCQUFvRCxDQUFDO0lBQ3pELFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUV0QyxNQUFNLG9CQUFvQixHQUFHLElBQUksd0JBQXdCLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDNUcsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDcEMsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUNwRSxlQUFlLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGlDQUFpQyxFQUFFLENBQUMsQ0FBQztRQUMzRSxLQUFLLEdBQUcsWUFBWSxDQUFDLEtBQUssQ0FBQztRQUMzQiwyQkFBMkIsR0FBRyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQWdDO1lBQzFFLFdBQVcsS0FBSyxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNyRyxDQUFDO1FBQ0YsZ0JBQWdCLEdBQUcsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFzQztZQUNyRSxvQkFBb0IsS0FBSyxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JELHNCQUFzQixDQUFDLFVBQWtCO2dCQUNqRCxPQUFPLENBQUMsQ0FBQztZQUNWLENBQUM7U0FDRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLFVBQVUsMkJBQTJCLENBQUMsYUFBcUM7UUFDL0UsSUFBSSxTQUFTLEdBQWtELFNBQVMsQ0FBQztRQUN6RSxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sYUFBYSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV2QyxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRUQsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hDLE1BQU0seUJBQXlCLENBQUM7WUFDL0IsQ0FBQyxHQUFHLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQztTQUNuTSxFQUFFO1lBQ0YsQ0FBQyxHQUFHLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQztTQUNuTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQ3pDLE1BQU0sSUFBSSxHQUFHLElBQUksT0FBTyxDQUFDLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQy9HLFVBQVUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDakQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3hELGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTtnQkFDbkMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxjQUFjO2dCQUNyQyxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7Z0JBQ25DLGNBQWMsRUFBRSxNQUFNLENBQUMsY0FBYzthQUNyQyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUNMLGFBQWEsRUFBRSxDQUFDO29CQUNoQixjQUFjLEVBQUUsQ0FBQztvQkFDakIsYUFBYSxFQUFFLENBQUM7b0JBQ2hCLGNBQWMsRUFBRSxDQUFDO2lCQUNqQixDQUFDLENBQUMsQ0FBQztZQUVKLGFBQWEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUkscUJBQXFCLENBQUMsS0FBSyxFQUFFLDJCQUEyQixFQUFFLG9CQUFvQixFQUFFLGVBQWUsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFtQixnQkFBZ0IsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDck4sTUFBTSxhQUFhLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM3RCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pFLE1BQU0seUJBQXlCLENBQUM7WUFDL0IsQ0FBQyxHQUFHLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQztTQUNuTSxFQUFFO1lBQ0YsQ0FBQyxHQUFHLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQztTQUNuTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQ3pDLE1BQU0sSUFBSSxHQUFHLElBQUksT0FBTyxDQUFDLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQy9HLFVBQVUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDakQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3hELGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTtnQkFDbkMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxjQUFjO2dCQUNyQyxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7Z0JBQ25DLGNBQWMsRUFBRSxNQUFNLENBQUMsY0FBYzthQUNyQyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUNMLGFBQWEsRUFBRSxDQUFDO29CQUNoQixjQUFjLEVBQUUsQ0FBQztvQkFDakIsYUFBYSxFQUFFLENBQUM7b0JBQ2hCLGNBQWMsRUFBRSxDQUFDO2lCQUNqQixDQUFDLENBQUMsQ0FBQztZQUVKLGFBQWEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUkscUJBQXFCLENBQUMsS0FBSyxFQUFFLDJCQUEyQixFQUFFLG9CQUFvQixFQUFFLGVBQWUsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFtQixnQkFBZ0IsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDck4sTUFBTSxhQUFhLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXZDLE1BQU0sMkJBQTJCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDbEQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4QyxNQUFNLHlCQUF5QixDQUFDO1lBQy9CLENBQUMsR0FBRyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDOUwsQ0FBQyxFQUFFLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUN6QyxFQUFFO1lBQ0YsQ0FBQyxHQUFHLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNuTSxDQUFDLEVBQUUsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1NBQ3pDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDekMsTUFBTSxJQUFJLEdBQUcsSUFBSSxPQUFPLENBQUMsSUFBSSxZQUFZLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLFlBQVksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDL0csVUFBVSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDeEQsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2dCQUNuQyxjQUFjLEVBQUUsTUFBTSxDQUFDLGNBQWM7Z0JBQ3JDLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTtnQkFDbkMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxjQUFjO2FBQ3JDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ0wsYUFBYSxFQUFFLENBQUM7b0JBQ2hCLGNBQWMsRUFBRSxDQUFDO29CQUNqQixhQUFhLEVBQUUsQ0FBQztvQkFDaEIsY0FBYyxFQUFFLENBQUM7aUJBQ2pCLENBQUMsQ0FBQyxDQUFDO1lBRUosYUFBYSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsMkJBQTJCLEVBQUUsb0JBQW9CLEVBQUUsZUFBZSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQW1CLGdCQUFnQixDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNyTixJQUFJLFNBQVMsR0FBa0QsU0FBUyxDQUFDO1lBQ3pFLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEUsTUFBTSxhQUFhLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBRy9ELGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUM7WUFFekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUVuRyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBK0MsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBRTNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFFLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUErQixDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztZQUM5RixNQUFNLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXBHLE1BQU0sMkJBQTJCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDbEQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6QyxNQUFNLHlCQUF5QixDQUFDO1lBQy9CLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDbEQsRUFBRTtZQUNGLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDbEQsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLFlBQVksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMvRyxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pELE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4RCxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7Z0JBQ25DLGNBQWMsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2dCQUNuQyxjQUFjLEVBQUUsTUFBTSxDQUFDLGNBQWM7YUFDckMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDTCxhQUFhLEVBQUUsQ0FBQztvQkFDaEIsY0FBYyxFQUFFLENBQUM7b0JBQ2pCLGFBQWEsRUFBRSxDQUFDO29CQUNoQixjQUFjLEVBQUUsQ0FBQztpQkFDakIsQ0FBQyxDQUFDLENBQUM7WUFFSixhQUFhLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHFCQUFxQixDQUFDLEtBQUssRUFBRSwyQkFBMkIsRUFBRSxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBbUIsZ0JBQWdCLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3JOLE1BQU0sYUFBYSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV2QyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFFNUQsTUFBTSwyQkFBMkIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzdDLE1BQU0seUJBQXlCLENBQUM7WUFDL0IsQ0FBQztvQkFDQSw0QkFBNEI7b0JBQzVCLG1CQUFtQjtvQkFDbkIsa0JBQWtCO2lCQUNsQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1NBQ2hELEVBQUU7WUFDRixDQUFDO29CQUNBLG1CQUFtQjtvQkFDbkIscUNBQXFDO29CQUNyQyxrQkFBa0I7aUJBQ2xCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDaEQsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLFlBQVksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMvRyxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pELE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4RCxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7Z0JBQ25DLGNBQWMsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2dCQUNuQyxjQUFjLEVBQUUsTUFBTSxDQUFDLGNBQWM7YUFDckMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDTCxhQUFhLEVBQUUsQ0FBQztvQkFDaEIsY0FBYyxFQUFFLENBQUM7b0JBQ2pCLGFBQWEsRUFBRSxDQUFDO29CQUNoQixjQUFjLEVBQUUsQ0FBQztpQkFDakIsQ0FBQyxDQUFDLENBQUM7WUFFSixhQUFhLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHFCQUFxQixDQUFDLEtBQUssRUFBRSwyQkFBMkIsRUFBRSxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBbUIsZ0JBQWdCLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3JOLE1BQU0sYUFBYSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV2QyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFFNUQsTUFBTSwyQkFBMkIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGNBQWMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMvQixNQUFNLHlCQUF5QixDQUFDO1lBQy9CLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUMzUCxDQUFDLENBQUMsa0JBQWtCLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDM1AsQ0FBQyxFQUFFLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUN6QyxFQUFFO1lBQ0YsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQzNQLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUMzUCxDQUFDLEVBQUUsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1NBQ3pDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDekMsTUFBTSxJQUFJLEdBQUcsSUFBSSxPQUFPLENBQUMsSUFBSSxZQUFZLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLFlBQVksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDL0csVUFBVSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFckMsYUFBYSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsMkJBQTJCLEVBQUUsb0JBQW9CLEVBQUUsZUFBZSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQW1CLGdCQUFnQixDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNyTixJQUFJLFNBQVMsR0FBa0QsU0FBUyxDQUFDO1lBQ3pFLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEUsTUFBTSxhQUFhLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDL0QsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQzdELE1BQU0sQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFcEcsTUFBTSwyQkFBMkIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGVBQWUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNoQyxNQUFNLHlCQUF5QixDQUFDO1lBQy9CLENBQUMsa0RBQWtELEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUN6RixDQUFDLDRCQUE0QixFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkUsQ0FBQyxlQUFlLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUN0RCxFQUFFO1lBQ0YsQ0FBQyxrREFBa0QsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ3pGLENBQUMsNEJBQTRCLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRSxDQUFDLGFBQWEsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1NBQ3BELEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDekMsTUFBTSxJQUFJLEdBQUcsSUFBSSxPQUFPLENBQUMsSUFBSSxZQUFZLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLFlBQVksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDL0csVUFBVSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFckMsYUFBYSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsMkJBQTJCLEVBQUUsb0JBQW9CLEVBQUUsZUFBZSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQW1CLGdCQUFnQixDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNyTixJQUFJLFNBQVMsR0FBa0QsU0FBUyxDQUFDO1lBQ3pFLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEUsTUFBTSxhQUFhLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFFNUQsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQzdELE1BQU0sQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFcEcsTUFBTSwyQkFBMkIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVsRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGFBQWEsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM5QixNQUFNLHlCQUF5QixDQUFDO1lBQy9CLENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUNuRCxFQUFFO1lBQ0YsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRCxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDbkQsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUN6QyxVQUFVLEdBQUc7Z0JBQ1osT0FBTyxFQUFFLENBQUM7d0JBQ1QsYUFBYSxFQUFFLENBQUM7d0JBQ2hCLGNBQWMsRUFBRSxDQUFDO3dCQUNqQixhQUFhLEVBQUUsQ0FBQzt3QkFDaEIsY0FBYyxFQUFFLENBQUM7cUJBQ2pCLENBQUM7Z0JBQ0YsU0FBUyxFQUFFLEtBQUs7YUFDaEIsQ0FBQztZQUVGLGFBQWEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUkscUJBQXFCLENBQUMsS0FBSyxFQUFFLDJCQUEyQixFQUFFLG9CQUFvQixFQUFFLGVBQWUsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFtQixnQkFBZ0IsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDck4sSUFBSSxTQUF3RCxDQUFDO1lBQzdELFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEUsTUFBTSxhQUFhLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLGdCQUFnQixFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztZQUUvRCxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztZQUM3RCxNQUFNLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFNUgsTUFBTSwyQkFBMkIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGVBQWUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUVoQyxNQUFNLHlCQUF5QixDQUFDO1lBQy9CLENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRCxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRCxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDbkQsRUFBRTtZQUNGLENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRCxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRCxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUNuRCxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQ3pDLE1BQU0sZUFBZSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQ0FBaUMsRUFBRSxDQUFDLENBQUM7WUFDakYsVUFBVSxHQUFHO2dCQUNaLE9BQU8sRUFBRSxDQUFDO3dCQUNULGFBQWEsRUFBRSxDQUFDO3dCQUNoQixjQUFjLEVBQUUsQ0FBQzt3QkFDakIsYUFBYSxFQUFFLENBQUM7d0JBQ2hCLGNBQWMsRUFBRSxDQUFDO3FCQUNqQixFQUFFO3dCQUNGLGFBQWEsRUFBRSxDQUFDO3dCQUNoQixjQUFjLEVBQUUsQ0FBQzt3QkFDakIsYUFBYSxFQUFFLENBQUM7d0JBQ2hCLGNBQWMsRUFBRSxDQUFDO3FCQUNqQixDQUFDO2dCQUNGLFNBQVMsRUFBRSxLQUFLO2FBQ2hCLENBQUM7WUFFRixhQUFhLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHFCQUFxQixDQUFDLEtBQUssRUFBRSwyQkFBMkIsRUFBRSxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBbUIsZ0JBQWdCLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3JOLElBQUksU0FBd0QsQ0FBQztZQUM3RCxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sYUFBYSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV2QyxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztZQUUvRCxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztZQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztZQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUd2RyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBK0MsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBRTNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztZQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFFLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUErQixDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztZQUM5RixNQUFNLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXBHLE1BQU0sMkJBQTJCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDbEQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxlQUFlLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFFaEMsTUFBTSx5QkFBeUIsQ0FBQztZQUMvQixDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRCxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRCxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1NBQ25ELEVBQUU7WUFDRixDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRCxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbkQsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNuRCxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ25ELENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDbkQsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUN6QyxVQUFVLEdBQUc7Z0JBQ1osT0FBTyxFQUFFLENBQUM7d0JBQ1QsYUFBYSxFQUFFLENBQUM7d0JBQ2hCLGNBQWMsRUFBRSxDQUFDO3dCQUNqQixhQUFhLEVBQUUsQ0FBQzt3QkFDaEIsY0FBYyxFQUFFLENBQUM7cUJBQ2pCLENBQUM7Z0JBQ0YsU0FBUyxFQUFFLEtBQUs7YUFDaEIsQ0FBQztZQUVGLGFBQWEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUkscUJBQXFCLENBQUMsS0FBSyxFQUFFLDJCQUEyQixFQUFFLG9CQUFvQixFQUFFLGVBQWUsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFtQixnQkFBZ0IsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDck4sSUFBSSxTQUFTLEdBQWtELFNBQVMsQ0FBQztZQUN6RSxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sYUFBYSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV2QyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztZQUUvRCxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztZQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztZQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRTNHLGFBQWEsQ0FBQyxL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R0FBRyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDOUwsQ0FBQyxHQUFHLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDMUUsQ0FBQyxPQUFPLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUM5QyxDQUFDLEdBQUcsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQzFDLENBQUMsR0FBRyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDM0ksRUFBRTtZQUNGLENBQUMsZUFBZSxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNwRSxDQUFDLE9BQU8sRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ2hHLENBQUMsR0FBRyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQzFFLENBQUMsR0FBRyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDOUwsQ0FBQyxPQUFPLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUM5QyxDQUFDLEdBQUcsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzNJLENBQUMsR0FBRyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDMUMsRUFB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QUFDLEdBQUcsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDO1NBQ25NLEVBQUU7WUFDRixDQUFDLEdBQUcsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ25NLENBQUMsR0FBRyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUM7U0FDbk0sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLFlBQVksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMvRyxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUVyQyxhQUFhLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHFCQUFxQixDQUFDLEtBQUssRUFBRSwyQkFBMkIsRUFBRSxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBbUIsZ0JBQWdCLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3JOLE1BQU0sYUFBYSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV2QyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDL0QsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFFLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUErQyxDQUFDLFFBQVMsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFFLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUErQyxDQUFDLFFBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNyTixNQUFNLENBQUMsV0FBVyxDQUFFLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUErQyxDQUFDLFFBQVMsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFFLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUErQyxDQUFDLFFBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUV0TixNQUFNLDJCQUEyQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2xELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9