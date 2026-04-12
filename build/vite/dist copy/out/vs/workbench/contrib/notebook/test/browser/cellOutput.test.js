/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CellOutputContainer } from '../../browser/view/cellParts/cellOutput.js';
import { CellKind } from '../../common/notebookCommon.js';
import { setupInstantiationService, withTestNotebook } from './testNotebookEditor.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { INotebookService } from '../../common/notebookService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { getAllOutputsText } from '../../browser/viewModel/cellOutputTextHelper.js';
suite('CellOutput', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let outputMenus = [];
    setup(() => {
        outputMenus = [];
        instantiationService = setupInstantiationService(store);
        instantiationService.stub(INotebookService, new class extends mock() {
            getOutputMimeTypeInfo(_textModel, _kernelProvides, output) {
                return [{
                        rendererId: 'plainTextRendererId',
                        mimeType: 'text/plain',
                        isTrusted: true
                    }, {
                        rendererId: 'htmlRendererId',
                        mimeType: 'text/html',
                        isTrusted: true
                    }, {
                        rendererId: 'errorRendererId',
                        mimeType: 'application/vnd.code.notebook.error',
                        isTrusted: true
                    }, {
                        rendererId: 'stderrRendererId',
                        mimeType: 'application/vnd.code.notebook.stderr',
                        isTrusted: true
                    }, {
                        rendererId: 'stdoutRendererId',
                        mimeType: 'application/vnd.code.notebook.stdout',
                        isTrusted: true
                    }]
                    .filter(info => output.outputs.some(output => output.mime === info.mimeType));
            }
            getRendererInfo() {
                return {
                    id: 'rendererId',
                    displayName: 'Stubbed Renderer',
                    extensionId: { _lower: 'id', value: 'id' },
                };
            }
        });
        instantiationService.stub(IMenuService, new class extends mock() {
            createMenu() {
                const menu = new class extends mock() {
                    constructor() {
                        super(...arguments);
                        this.onDidChange = Event.None;
                    }
                    getActions() { return []; }
                    dispose() { outputMenus = outputMenus.filter(item => item !== menu); }
                };
                outputMenus.push(menu);
                return menu;
            }
        });
    });
    test('Render cell output items with multiple mime types', async function () {
        const outputItem = { data: VSBuffer.fromString('output content'), mime: 'text/plain' };
        const htmlOutputItem = { data: VSBuffer.fromString('output content'), mime: 'text/html' };
        const output1 = { outputId: 'abc', outputs: [outputItem, htmlOutputItem] };
        const output2 = { outputId: 'def', outputs: [outputItem, htmlOutputItem] };
        await withTestNotebook([
            ['print(output content)', 'python', CellKind.Code, [output1, output2], {}],
        ], (editor, viewModel, disposables, accessor) => {
            const cell = viewModel.viewCells[0];
            const cellTemplate = createCellTemplate(disposables);
            const output = disposables.add(accessor.createInstance(CellOutputContainer, editor, cell, cellTemplate, { limit: 100 }));
            output.render();
            cell.outputsViewModels[0].setVisible(true);
            assert.strictEqual(outputMenus.length, 1, 'should have 1 output menus');
            assert(cellTemplate.outputContainer.domNode.style.display !== 'none', 'output container should be visible');
            cell.outputsViewModels[1].setVisible(true);
            assert.strictEqual(outputMenus.length, 2, 'should have 2 output menus');
            cell.outputsViewModels[1].setVisible(true);
            assert.strictEqual(outputMenus.length, 2, 'should still have 2 output menus');
        }, instantiationService);
    });
    test('One of many cell outputs becomes hidden', async function () {
        const outputItem = { data: VSBuffer.fromString('output content'), mime: 'text/plain' };
        const htmlOutputItem = { data: VSBuffer.fromString('output content'), mime: 'text/html' };
        const output1 = { outputId: 'abc', outputs: [outputItem, htmlOutputItem] };
        const output2 = { outputId: 'def', outputs: [outputItem, htmlOutputItem] };
        const output3 = { outputId: 'ghi', outputs: [outputItem, htmlOutputItem] };
        await withTestNotebook([
            ['print(output content)', 'python', CellKind.Code, [output1, output2, output3], {}],
        ], (editor, viewModel, disposables, accessor) => {
            const cell = viewModel.viewCells[0];
            const cellTemplate = createCellTemplate(disposables);
            const output = disposables.add(accessor.createInstance(CellOutputContainer, editor, cell, cellTemplate, { limit: 100 }));
            output.render();
            cell.outputsViewModels[0].setVisible(true);
            cell.outputsViewModels[1].setVisible(true);
            cell.outputsViewModels[2].setVisible(true);
            cell.outputsViewModels[1].setVisible(false);
            assert(cellTemplate.outputContainer.domNode.style.display !== 'none', 'output container should be visible');
            assert.strictEqual(outputMenus.length, 2, 'should have 2 output menus');
        }, instantiationService);
    });
    test('get all adjacent stream outputs', async () => {
        const stdout = { data: VSBuffer.fromString('stdout'), mime: 'application/vnd.code.notebook.stdout' };
        const stderr = { data: VSBuffer.fromString('stderr'), mime: 'application/vnd.code.notebook.stderr' };
        const output1 = { outputId: 'abc', outputs: [stdout] };
        const output2 = { outputId: 'abc', outputs: [stderr] };
        await withTestNotebook([
            ['print(output content)', 'python', CellKind.Code, [output1, output2], {}],
        ], (_editor, viewModel) => {
            const cell = viewModel.viewCells[0];
            const notebook = viewModel.notebookDocument;
            const result = getAllOutputsText(notebook, cell);
            assert.strictEqual(result, 'stdoutstderr');
        }, instantiationService);
    });
    test('get all mixed outputs of cell', async () => {
        const stdout = { data: VSBuffer.fromString('stdout'), mime: 'application/vnd.code.notebook.stdout' };
        const stderr = { data: VSBuffer.fromString('stderr'), mime: 'application/vnd.code.notebook.stderr' };
        const plainText = { data: VSBuffer.fromString('output content'), mime: 'text/plain' };
        const error = { data: VSBuffer.fromString(`{"name":"Error Name","message":"error message","stack":"error stack"}`), mime: 'application/vnd.code.notebook.error' };
        const output1 = { outputId: 'abc', outputs: [stdout] };
        const output2 = { outputId: 'abc', outputs: [stderr] };
        const output3 = { outputId: 'abc', outputs: [plainText] };
        const output4 = { outputId: 'abc', outputs: [error] };
        await withTestNotebook([
            ['print(output content)', 'python', CellKind.Code, [output1, output2, output3, output4], {}],
        ], (_editor, viewModel) => {
            const cell = viewModel.viewCells[0];
            const notebook = viewModel.notebookDocument;
            const result = getAllOutputsText(notebook, cell);
            assert.strictEqual(result, 'Cell output 1 of 3\n' +
                'stdoutstderr\n' +
                'Cell output 2 of 3\n' +
                'output content\n' +
                'Cell output 3 of 3\n' +
                'error stack');
        }, instantiationService);
    });
});
function createCellTemplate(disposables) {
    return {
        outputContainer: new FastDomNode(document.createElement('div')),
        outputShowMoreContainer: new FastDomNode(document.createElement('div')),
        focusSinkElement: document.createElement('div'),
        templateDisposables: disposables,
        elementDisposables: disposables,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbE91dHB1dC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL2NlbGxPdXRwdXQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBR2pGLE9BQU8sRUFBRSxRQUFRLEVBQXFDLE1BQU0sZ0NBQWdDLENBQUM7QUFDN0YsT0FBTyxFQUFFLHlCQUF5QixFQUFFLGdCQUFnQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQVMsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDeEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRXBGLEtBQUssQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO0lBQ3hCLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDeEQsSUFBSSxvQkFBOEMsQ0FBQztJQUNuRCxJQUFJLFdBQVcsR0FBWSxFQUFFLENBQUM7SUFFOUIsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLFdBQVcs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