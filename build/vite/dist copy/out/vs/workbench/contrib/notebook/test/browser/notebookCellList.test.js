/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CellKind, NotebookSetting } from '../../common/notebookCommon.js';
import { createNotebookCellList, setupInstantiationService, withTestNotebook } from './testNotebookEditor.js';
suite('NotebookCellList', () => {
    let testDisposables;
    let instantiationService;
    teardown(() => {
        testDisposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    let config;
    setup(() => {
        testDisposables = new DisposableStore();
        instantiationService = setupInstantiationService(testDisposables);
        config = new TestConfigurationService();
        instantiationService.stub(IConfigurationService, config);
    });
    test('revealElementsInView: reveal fully visible cell should not scroll', async function () {
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header b', 'markdown', CellKind.Markup, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['# header c', 'markdown', CellKind.Markup, [], {}]
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false, false, false, false, false],
                cellLineNumberStates: {},
                editorViewStates: [null, null, null, null, null],
                cellTotalHeights: [50, 100, 50, 100, 50],
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(210, 100);
            // scroll a bit, scrollTop to bottom: 5, 215
            cellList.scrollTop = 5;
            // init scrollTop and scrollBottom
            assert.deepStrictEqual(cellList.scrollTop, 5);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
            // reveal cell 1, top 50, bottom 150, which is fully visible in the viewport
            cellList.revealCells({ start: 1, end: 2 });
            assert.deepStrictEqual(cellList.scrollTop, 5);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
            // reveal cell 2, top 150, bottom 200, which is fully visible in the viewport
            cellList.revealCells({ start: 2, end: 3 });
            assert.deepStrictEqual(cellList.scrollTop, 5);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
            // reveal cell 3, top 200, bottom 300, which is partially visible in the viewport
            cellList.revealCells({ start: 3, end: 4 });
            assert.deepStrictEqual(cellList.scrollTop, 90);
        });
    });
    test('revealElementsInView: reveal partially visible cell', async function () {
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header b', 'markdown', CellKind.Markup, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['# header c', 'markdown', CellKind.Markup, [], {}]
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false, false, false, false, false],
                editorViewStates: [null, null, null, null, null],
                cellTotalHeights: [50, 100, 50, 100, 50],
                cellLineNumberStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(210, 100);
            // init scrollTop and scrollBottom
            assert.deepStrictEqual(cellList.scrollTop, 0);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
            // reveal cell 3, top 200, bottom 300, which is partially visible in the viewport
            cellList.revealCells({ start: 3, end: 4 });
            assert.deepStrictEqual(cellList.scrollTop, 90);
            // scroll to 5
            cellList.scrollTop = 5;
            assert.deepStrictEqual(cellList.scrollTop, 5);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
            // reveal cell 0, top 0, bottom 50
            cellList.revealCells({ start: 0, end: 1 });
            assert.deepStrictEqual(cellList.scrollTop, 0);
        });
    });
    test('revealElementsInView: reveal cell out of viewport', async function () {
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header b', 'markdown', CellKind.Markup, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['# header c', 'markdown', CellKind.Markup, [], {}]
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false, false, false, false, false],
                editorViewStates: [null, null, null, null, null],
                cellTotalHeights: [50, 100, 50, 100, 50],
                cellLineNumberStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            // without paddingBottom, the last 20 px will always be hidden due to `topInsertToolbarHeight`
            cellList.updateOptions({ paddingBottom: 100 });
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(210, 100);
            // init scrollTop and scrollBottom
            assert.deepStrictEqual(cellList.scrollTop, 0);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
            cellList.revealCells({ start: 4, end: 5 });
            assert.deepStrictEqual(cellList.scrollTop, 140);
            // assert.deepStrictEqual(cellList.getViewScrollBottom(), 330);
        });
    });
    test('updateElementHeight', async function () {
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header b', 'markdown', CellKind.Markup, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['# header c', 'markdown', CellKind.Markup, [], {}]
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false, false, false, false, false],
                editorViewStates: [null, null, null, null, null],
                cellTotalHeights: [50, 100, 50, 100, 50],
                cellLineNumberStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(210, 100);
            // init scrollTop and scrollBottom
            assert.deepStrictEqual(cellList.scrollTop, 0);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
            cellList.updateElementHeight(0, 60);
            assert.deepStrictEqual(cellList.scrollTop, 0);
            // scroll to 5
            cellList.scrollTop = 5;
            assert.deepStrictEqual(cellList.scrollTop, 5);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
            cellList.updateElementHeight(0, 80);
            assert.deepStrictEqual(cellList.scrollTop, 5);
        });
    });
    test('updateElementHeight with anchor', async function () {
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header b', 'markdown', CellKind.Markup, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['# header c', 'markdown', CellKind.Markup, [], {}]
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false, false, false, false, false],
                editorViewStates: [null, null, null, null, null],
                cellTotalHeights: [50, 100, 50, 100, 50],
                cellLineNumberStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(210, 100);
            // init scrollTop and scrollBottom
            assert.deepStrictEqual(cellList.scrollTop, 0);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
            // scroll to 5
            cellList.updateElementHeight2(viewModel.cellAt(0), 50);
            cellList.scrollTop = 5;
            assert.deepStrictEqual(cellList.scrollTop, 5);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
            cellList.setFocus([1]);
            cellList.updateElementHeight2(viewModel.cellAt(0), 100);
            assert.deepStrictEqual(cellList.scrollHeight, 400);
            // the first cell grows, and the focused cell will remain fully visible, so we don't scroll
            assert.deepStrictEqual(cellList.scrollTop, 5);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
            cellList.updateElementHeight2(viewModel.cellAt(0), 150);
            // the first cell grows, and the focused cell will be pushed out of view, so we scroll down
            assert.deepStrictEqual(cellList.scrollTop, 55);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 265);
            // We don't anchor to the focused cell when cells shrink
            cellList.updateElementHeight2(viewModel.cellAt(0), 50);
            assert.deepStrictEqual(cellList.scrollTop, 55);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 265);
            // focus won't be visible after cell 0 grow to 250, so let's try to keep the focused cell visible
            cellList.updateElementHeight2(viewModel.cellAt(0), 250);
            assert.deepStrictEqual(cellList.scrollTop, 250 + 100 - cellList.renderHeight);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 250 + 100 - cellList.renderHeight + 210);
        });
    });
    test('updateElementHeight with no scrolling', async function () {
        config.setUserConfiguration(NotebookSetting.scrollToRevealCell, 'none');
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header b', 'markdown', CellKind.Markup, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['# header c', 'markdown', CellKind.Markup, [], {}]
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false, false, false, false, false],
                editorViewStates: [null, null, null, null, null],
                cellTotalHeights: [50, 100, 50, 100, 50],
                cellLineNumberStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(210, 100);
            // init scrollTop and scrollBottom
            assert.deepStrictEqual(cellList.scrollTop, 0);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
            // scroll to 5
            cellList.updateElementHeight2(viewModel.cellAt(0), 50);
            cellList.scrollTop = 5;
            assert.deepStrictEqual(cellList.scrollTop, 5);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
            cellList.setFocus([1]);
            cellList.updateElementHeight2(viewModel.cellAt(0), 100);
            assert.deepStrictEqual(cellList.scrollHeight, 400);
            // Any change in cell size should not affect the scroll height with scrollToReveal set to none
            assert.deepStrictEqual(cellList.scrollTop, 5);
            cellList.updateElementHeight2(viewModel.cellAt(0), 50);
            assert.deepStrictEqual(cellList.scrollTop, 5);
            cellList.updateElementHeight2(viewModel.cellAt(0), 250);
            assert.deepStrictEqual(cellList.scrollTop, 5);
        });
    });
    test('updateElementHeight with no scroll setting and cell editor focused', async function () {
        config.setUserConfiguration(NotebookSetting.scrollToRevealCell, 'none');
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header b', 'markdown', CellKind.Markup, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['# header c', 'markdown', CellKind.Markup, [], {}]
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false, false, false, false, false],
                editorViewStates: [null, null, null, null, null],
                cellTotalHeights: [50, 100, 50, 100, 50],
                cellLineNumberStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(210, 100);
            // init scrollTop and scrollBottom
            assert.deepStrictEqual(cellList.scrollTop, 0);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
            cellList.setFocus([1]);
            editor.focusNotebookCell(cellList.viewModel?.cellAt(1), 'editor');
            cellList.updateElementHeight2(viewModel.cellAt(0), 100);
            assert.deepStrictEqual(cellList.scrollHeight, 400);
            // We have the cell editor focused, so we should anchor to that cell
            assert.deepStrictEqual(cellList.scrollTop, 50);
            cellList.updateElementHeight2(viewModel.cellAt(0), 50);
            assert.deepStrictEqual(cellList.scrollTop, 0);
            cellList.updateElementHeight2(viewModel.cellAt(0), 250);
            assert.deepStrictEqual(cellList.scrollTop, 250 + 100 - cellList.renderHeight);
        });
    });
    test('updateElementHeight with focused element out of viewport', async function () {
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header b', 'markdown', CellKind.Markup, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['# header c', 'markdown', CellKind.Markup, [], {}]
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false, false, false, false, false],
                editorViewStates: [null, null, null, null, null],
                cellTotalHeights: [50, 100, 50, 100, 50],
                cellLineNumberStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(210, 100);
            // init scrollTop and scrollBottom
            assert.deepStrictEqual(cellList.scrollTop, 0);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
            cellList.setFocus([4]);
            cellList.updateElementHeight2(viewModel.cellAt(1), 130);
            // the focus cell is not in the viewport, the scrolltop should not change at all
            assert.deepStrictEqual(cellList.scrollTop, 0);
        });
    });
    test('updateElementHeight of cells out of viewport should not trigger scroll #121140', async function () {
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header b', 'markdown', CellKind.Markup, [], {}],
            ['var b = 2;', 'javascript', CellKind.Code, [], {}],
            ['# header c', 'markdown', CellKind.Markup, [], {}]
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false, false, false, false, false],
                editorViewStates: [null, null, null, null, null],
                cellTotalHeights: [50, 100, 50, 100, 50],
                cellLineNumberStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(210, 100);
            // init scrollTop and scrollBottom
            assert.deepStrictEqual(cellList.scrollTop, 0);
            assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
            cellList.setFocus([1]);
            cellList.scrollTop = 80;
            assert.deepStrictEqual(cellList.scrollTop, 80);
            cellList.updateElementHeight2(viewModel.cellAt(0), 30);
            assert.deepStrictEqual(cellList.scrollTop, 60);
        });
    });
    test('visibleRanges should be exclusive of end', async function () {
        await withTestNotebook([], async (editor, viewModel, disposables) => {
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(100, 100);
            assert.deepStrictEqual(cellList.visibleRanges, []);
        });
    });
    test('visibleRanges should be exclusive of end 2', async function () {
        await withTestNotebook([
            ['# header a', 'markdown', CellKind.Markup, [], {}],
        ], async (editor, viewModel, disposables) => {
            viewModel.restoreEditorViewState({
                editingCells: [false],
                editorViewStates: [null],
                cellTotalHeights: [50],
                cellLineNumberStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            });
            const cellList = createNotebookCellList(instantiationService, disposables);
            cellList.attachViewModel(viewModel);
            // render height 210, it can render 3 full cells and 1 partial cell
            cellList.layout(100, 100);
            assert.deepStrictEqual(cellList.visibleRanges, [{ start: 0, end: 1 }]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsTGlzdC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL25vdGVib29rQ2VsbExpc3QudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBRXpILE9BQU8sRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHNCQUFzQixFQUFFLHlCQUF5QixFQUFFLGdCQUFnQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFOUcsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtJQUM5QixJQUFJLGVBQWdDLENBQUM7SUFDckMsSUFBSSxvQkFBOEMsQ0FBQztJQUVuRCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsZUFBZSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzNCLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLE1BQWdDLENBQUM7SUFDckMsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLGVBQWUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQ3hDLG9CQUFvQixHQUFHLHlCQUF5QixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sR0FBRyxJQUFJLHdCQUF3QixFQUFFLENBQUM7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