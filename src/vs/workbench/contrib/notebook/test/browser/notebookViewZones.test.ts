/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NotebookCellsLayout } from 'vs/workbench/contrib/notebook/browser/view/notebookCellListView';
import { FoldingModel } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';
import { CellEditType, CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { createNotebookCellList, setupInstantiationService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';

suite('NotebookRangeMap', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty', () => {
		const rangeMap = new NotebookCellsLayout();
		assert.strictEqual(rangeMap.size, 0);
		assert.strictEqual(rangeMap.count, 0);
	});

	const one = { size: 1 };
	const two = { size: 2 };
	const three = { size: 3 };
	const five = { size: 5 };
	const ten = { size: 10 };

	test('length & count', () => {
		const rangeMap = new NotebookCellsLayout();
		rangeMap.splice(0, 0, [one]);
		assert.strictEqual(rangeMap.size, 1);
		assert.strictEqual(rangeMap.count, 1);
	});

	test('length & count #2', () => {
		const rangeMap = new NotebookCellsLayout();
		rangeMap.splice(0, 0, [one, one, one, one, one]);
		assert.strictEqual(rangeMap.size, 5);
		assert.strictEqual(rangeMap.count, 5);
	});

	test('length & count #3', () => {
		const rangeMap = new NotebookCellsLayout();
		rangeMap.splice(0, 0, [five]);
		assert.strictEqual(rangeMap.size, 5);
		assert.strictEqual(rangeMap.count, 1);
	});

	test('length & count #4', () => {
		const rangeMap = new NotebookCellsLayout();
		rangeMap.splice(0, 0, [five, five, five, five, five]);
		assert.strictEqual(rangeMap.size, 25);
		assert.strictEqual(rangeMap.count, 5);
	});

	test('insert', () => {
		const rangeMap = new NotebookCellsLayout();
		rangeMap.splice(0, 0, [five, five, five, five, five]);
		assert.strictEqual(rangeMap.size, 25);
		assert.strictEqual(rangeMap.count, 5);

		rangeMap.splice(0, 0, [five, five, five, five, five]);
		assert.strictEqual(rangeMap.size, 50);
		assert.strictEqual(rangeMap.count, 10);

		rangeMap.splice(5, 0, [ten, ten]);
		assert.strictEqual(rangeMap.size, 70);
		assert.strictEqual(rangeMap.count, 12);

		rangeMap.splice(12, 0, [{ size: 200 }]);
		assert.strictEqual(rangeMap.size, 270);
		assert.strictEqual(rangeMap.count, 13);
	});

	test('delete', () => {
		const rangeMap = new NotebookCellsLayout();
		rangeMap.splice(0, 0, [five, five, five, five, five,
			five, five, five, five, five,
			five, five, five, five, five,
			five, five, five, five, five]);
		assert.strictEqual(rangeMap.size, 100);
		assert.strictEqual(rangeMap.count, 20);

		rangeMap.splice(10, 5);
		assert.strictEqual(rangeMap.size, 75);
		assert.strictEqual(rangeMap.count, 15);

		rangeMap.splice(0, 1);
		assert.strictEqual(rangeMap.size, 70);
		assert.strictEqual(rangeMap.count, 14);

		rangeMap.splice(1, 13);
		assert.strictEqual(rangeMap.size, 5);
		assert.strictEqual(rangeMap.count, 1);

		rangeMap.splice(1, 1);
		assert.strictEqual(rangeMap.size, 5);
		assert.strictEqual(rangeMap.count, 1);
	});

	test('insert & delete', () => {
		const rangeMap = new NotebookCellsLayout();
		assert.strictEqual(rangeMap.size, 0);
		assert.strictEqual(rangeMap.count, 0);

		rangeMap.splice(0, 0, [one]);
		assert.strictEqual(rangeMap.size, 1);
		assert.strictEqual(rangeMap.count, 1);

		rangeMap.splice(0, 1);
		assert.strictEqual(rangeMap.size, 0);
		assert.strictEqual(rangeMap.count, 0);
	});

	test('insert & delete #2', () => {
		const rangeMap = new NotebookCellsLayout();
		rangeMap.splice(0, 0, [one, one, one, one, one,
			one, one, one, one, one]);
		rangeMap.splice(2, 6);
		assert.strictEqual(rangeMap.count, 4);
		assert.strictEqual(rangeMap.size, 4);
	});

	test('insert & delete #3', () => {
		const rangeMap = new NotebookCellsLayout();
		rangeMap.splice(0, 0, [one, one, one, one, one,
			one, one, one, one, one,
			two, two, two, two, two,
			two, two, two, two, two]);
		rangeMap.splice(8, 4);
		assert.strictEqual(rangeMap.count, 16);
		assert.strictEqual(rangeMap.size, 24);
	});

	test('insert & delete #4', () => {
		const rangeMap = new NotebookCellsLayout();
		rangeMap.splice(0, 0, [one, one, one, one, one,
			one, one, one, one, one,
			two, two, two, two, two,
			two, two, two, two, two]);
		rangeMap.splice(5, 0, [three, three, three, three, three]);
		assert.strictEqual(rangeMap.count, 25);
		assert.strictEqual(rangeMap.size, 45);

		rangeMap.splice(4, 7);
		assert.strictEqual(rangeMap.count, 18);
		assert.strictEqual(rangeMap.size, 28);
	});

	suite('indexAt, positionAt', () => {
		test('empty', () => {
			const rangeMap = new NotebookCellsLayout();
			assert.strictEqual(rangeMap.indexAt(0), 0);
			assert.strictEqual(rangeMap.indexAt(10), 0);
			assert.strictEqual(rangeMap.indexAt(-1), -1);
			assert.strictEqual(rangeMap.positionAt(0), -1);
			assert.strictEqual(rangeMap.positionAt(10), -1);
			assert.strictEqual(rangeMap.positionAt(-1), -1);
		});

		test('simple', () => {
			const rangeMap = new NotebookCellsLayout();
			rangeMap.splice(0, 0, [one]);
			assert.strictEqual(rangeMap.indexAt(0), 0);
			assert.strictEqual(rangeMap.indexAt(1), 1);
			assert.strictEqual(rangeMap.positionAt(0), 0);
			assert.strictEqual(rangeMap.positionAt(1), -1);
		});

		test('simple #2', () => {
			const rangeMap = new NotebookCellsLayout();
			rangeMap.splice(0, 0, [ten]);
			assert.strictEqual(rangeMap.indexAt(0), 0);
			assert.strictEqual(rangeMap.indexAt(5), 0);
			assert.strictEqual(rangeMap.indexAt(9), 0);
			assert.strictEqual(rangeMap.indexAt(10), 1);
			assert.strictEqual(rangeMap.positionAt(0), 0);
			assert.strictEqual(rangeMap.positionAt(1), -1);
		});

		test('insert', () => {
			const rangeMap = new NotebookCellsLayout();
			rangeMap.splice(0, 0, [one, one, one, one, one, one, one, one, one, one]);
			assert.strictEqual(rangeMap.indexAt(0), 0);
			assert.strictEqual(rangeMap.indexAt(1), 1);
			assert.strictEqual(rangeMap.indexAt(5), 5);
			assert.strictEqual(rangeMap.indexAt(9), 9);
			assert.strictEqual(rangeMap.indexAt(10), 10);
			assert.strictEqual(rangeMap.indexAt(11), 10);

			rangeMap.splice(10, 0, [one, one, one, one, one, one, one, one, one, one]);
			assert.strictEqual(rangeMap.indexAt(10), 10);
			assert.strictEqual(rangeMap.indexAt(19), 19);
			assert.strictEqual(rangeMap.indexAt(20), 20);
			assert.strictEqual(rangeMap.indexAt(21), 20);
			assert.strictEqual(rangeMap.positionAt(0), 0);
			assert.strictEqual(rangeMap.positionAt(1), 1);
			assert.strictEqual(rangeMap.positionAt(19), 19);
			assert.strictEqual(rangeMap.positionAt(20), -1);
		});

		test('delete', () => {
			const rangeMap = new NotebookCellsLayout();
			rangeMap.splice(0, 0, [one, one, one, one, one, one, one, one, one, one]);
			rangeMap.splice(2, 6);

			assert.strictEqual(rangeMap.indexAt(0), 0);
			assert.strictEqual(rangeMap.indexAt(1), 1);
			assert.strictEqual(rangeMap.indexAt(3), 3);
			assert.strictEqual(rangeMap.indexAt(4), 4);
			assert.strictEqual(rangeMap.indexAt(5), 4);
			assert.strictEqual(rangeMap.positionAt(0), 0);
			assert.strictEqual(rangeMap.positionAt(1), 1);
			assert.strictEqual(rangeMap.positionAt(3), 3);
			assert.strictEqual(rangeMap.positionAt(4), -1);
		});

		test('delete #2', () => {
			const rangeMap = new NotebookCellsLayout();
			rangeMap.splice(0, 0, [ten, ten, ten, ten, ten, ten, ten, ten, ten, ten]);
			rangeMap.splice(2, 6);

			assert.strictEqual(rangeMap.indexAt(0), 0);
			assert.strictEqual(rangeMap.indexAt(1), 0);
			assert.strictEqual(rangeMap.indexAt(30), 3);
			assert.strictEqual(rangeMap.indexAt(40), 4);
			assert.strictEqual(rangeMap.indexAt(50), 4);
			assert.strictEqual(rangeMap.positionAt(0), 0);
			assert.strictEqual(rangeMap.positionAt(1), 10);
			assert.strictEqual(rangeMap.positionAt(2), 20);
			assert.strictEqual(rangeMap.positionAt(3), 30);
			assert.strictEqual(rangeMap.positionAt(4), -1);
		});
	});
});

suite('NotebookRangeMap with top padding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty', () => {
		const rangeMap = new NotebookCellsLayout(10);
		assert.strictEqual(rangeMap.size, 10);
		assert.strictEqual(rangeMap.count, 0);
	});

	const one = { size: 1 };
	const five = { size: 5 };
	const ten = { size: 10 };

	test('length & count', () => {
		const rangeMap = new NotebookCellsLayout(10);
		rangeMap.splice(0, 0, [one]);
		assert.strictEqual(rangeMap.size, 11);
		assert.strictEqual(rangeMap.count, 1);
	});

	test('length & count #2', () => {
		const rangeMap = new NotebookCellsLayout(10);
		rangeMap.splice(0, 0, [one, one, one, one, one]);
		assert.strictEqual(rangeMap.size, 15);
		assert.strictEqual(rangeMap.count, 5);
	});

	test('length & count #3', () => {
		const rangeMap = new NotebookCellsLayout(10);
		rangeMap.splice(0, 0, [five]);
		assert.strictEqual(rangeMap.size, 15);
		assert.strictEqual(rangeMap.count, 1);
	});

	test('length & count #4', () => {
		const rangeMap = new NotebookCellsLayout(10);
		rangeMap.splice(0, 0, [five, five, five, five, five]);
		assert.strictEqual(rangeMap.size, 35);
		assert.strictEqual(rangeMap.count, 5);
	});

	test('insert', () => {
		const rangeMap = new NotebookCellsLayout(10);
		rangeMap.splice(0, 0, [five, five, five, five, five]);
		assert.strictEqual(rangeMap.size, 35);
		assert.strictEqual(rangeMap.count, 5);

		rangeMap.splice(0, 0, [five, five, five, five, five]);
		assert.strictEqual(rangeMap.size, 60);
		assert.strictEqual(rangeMap.count, 10);

		rangeMap.splice(5, 0, [ten, ten]);
		assert.strictEqual(rangeMap.size, 80);
		assert.strictEqual(rangeMap.count, 12);

		rangeMap.splice(12, 0, [{ size: 200 }]);
		assert.strictEqual(rangeMap.size, 280);
		assert.strictEqual(rangeMap.count, 13);
	});

	suite('indexAt, positionAt', () => {
		test('empty', () => {
			const rangeMap = new NotebookCellsLayout(10);
			assert.strictEqual(rangeMap.indexAt(0), 0);
			assert.strictEqual(rangeMap.indexAt(10), 0);
			assert.strictEqual(rangeMap.indexAt(-1), -1);
			assert.strictEqual(rangeMap.positionAt(0), -1);
			assert.strictEqual(rangeMap.positionAt(10), -1);
			assert.strictEqual(rangeMap.positionAt(-1), -1);
		});

		test('simple', () => {
			const rangeMap = new NotebookCellsLayout(10);
			rangeMap.splice(0, 0, [one]);
			assert.strictEqual(rangeMap.indexAt(0), 0);
			assert.strictEqual(rangeMap.indexAt(1), 0);
			assert.strictEqual(rangeMap.indexAt(10), 0);
			assert.strictEqual(rangeMap.indexAt(11), 1);
			assert.strictEqual(rangeMap.positionAt(0), 10);
			assert.strictEqual(rangeMap.positionAt(1), -1);
		});
	});
});

suite('NotebookRangeMap with whitesspaces', () => {
	let testDisposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let config: TestConfigurationService;

	teardown(() => {
		testDisposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		testDisposables = new DisposableStore();
		instantiationService = setupInstantiationService(testDisposables);
		config = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, config);
	});

	test('simple', () => {
		const rangeMap = new NotebookCellsLayout(0);
		rangeMap.splice(0, 0, [{ size: 479 }, { size: 163 }, { size: 182 }, { size: 106 }, { size: 106 }, { size: 106 }, { size: 87 }]);

		const start = rangeMap.indexAt(650);
		const end = rangeMap.indexAfter(650 + 890 - 1);
		assert.strictEqual(start, 2);
		assert.strictEqual(end, 7);

		rangeMap.insertWhitespace('1', 0, 18);
		assert.strictEqual(rangeMap.indexAt(650), 1);
	});

	test('Whitespace CRUD', async function () {
		const twenty = { size: 20 };

		const rangeMap = new NotebookCellsLayout(0);
		rangeMap.splice(0, 0, [twenty, twenty, twenty]);
		rangeMap.insertWhitespace('0', 0, 5);
		rangeMap.insertWhitespace('1', 0, 5);
		assert.strictEqual(rangeMap.indexAt(0), 0);
		assert.strictEqual(rangeMap.indexAt(1), 0);
		assert.strictEqual(rangeMap.indexAt(10), 0);
		assert.strictEqual(rangeMap.indexAt(11), 0);
		assert.strictEqual(rangeMap.indexAt(21), 0);
		assert.strictEqual(rangeMap.indexAt(31), 1);
		assert.strictEqual(rangeMap.positionAt(0), 10);

		assert.strictEqual(rangeMap.getWhitespacePosition('0'), 0);
		assert.strictEqual(rangeMap.getWhitespacePosition('1'), 5);

		assert.strictEqual(rangeMap.positionAt(0), 10);
		assert.strictEqual(rangeMap.positionAt(1), 30);

		rangeMap.changeOneWhitespace('0', 0, 10);
		assert.strictEqual(rangeMap.getWhitespacePosition('0'), 0);
		assert.strictEqual(rangeMap.getWhitespacePosition('1'), 10);

		assert.strictEqual(rangeMap.positionAt(0), 15);
		assert.strictEqual(rangeMap.positionAt(1), 35);

		rangeMap.removeWhitespace('1');
		assert.strictEqual(rangeMap.getWhitespacePosition('0'), 0);

		assert.strictEqual(rangeMap.positionAt(0), 10);
		assert.strictEqual(rangeMap.positionAt(1), 30);
	});

	test('Whitespace with editing', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markup, [], {}]
			],
			async (editor, viewModel, disposables) => {
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					cellLineNumberStates: {},
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50],
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService, disposables);
				disposables.add(cellList);
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210, 100);
				assert.strictEqual(cellList.scrollHeight, 350);

				cellList.changeViewZones(accessor => {
					const id = accessor.addZone({
						afterModelPosition: 1,
						heightInPx: 20,
						domNode: document.createElement('div')
					});

					accessor.layoutZone(id);
					assert.strictEqual(cellList.scrollHeight, 370);

					assert.strictEqual(cellList.getElementTop(0), 0);
					assert.strictEqual(cellList.getElementTop(1), 70);
					assert.strictEqual(cellList.getElementTop(2), 170);

					const textModel = editor.textModel;
					textModel.applyEdits([
						{ editType: CellEditType.Replace, index: 0, count: 1, cells: [] },
					], true, undefined, () => undefined, undefined, true);

					assert.strictEqual(cellList.getElementTop(0), 20);
					assert.strictEqual(cellList.getElementTop(1), 120);
					assert.strictEqual(cellList.getElementTop(2), 170);

					accessor.removeZone(id);
				});
			});
	});

	test('Multiple Whitespaces', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markup, [], {}]
			],
			async (editor, viewModel, disposables) => {
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					cellLineNumberStates: {},
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50],
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService, disposables);
				disposables.add(cellList);
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210, 100);
				assert.strictEqual(cellList.scrollHeight, 350);

				cellList.changeViewZones(accessor => {
					const first = accessor.addZone({
						afterModelPosition: 0,
						heightInPx: 20,
						domNode: document.createElement('div')
					});
					accessor.layoutZone(first);

					const second = accessor.addZone({
						afterModelPosition: 3,
						heightInPx: 20,
						domNode: document.createElement('div')
					});
					accessor.layoutZone(second);

					assert.strictEqual(cellList.scrollHeight, 390);

					assert.strictEqual(cellList.getElementTop(0), 20);
					assert.strictEqual(cellList.getElementTop(1), 70);
					assert.strictEqual(cellList.getElementTop(2), 170);
					assert.strictEqual(cellList.getElementTop(3), 240);

					accessor.removeZone(first);

					assert.strictEqual(cellList.scrollHeight, 370);
					assert.strictEqual(cellList.getElementTop(0), 0);
					assert.strictEqual(cellList.getElementTop(1), 50);
					assert.strictEqual(cellList.getElementTop(2), 150);
					assert.strictEqual(cellList.getElementTop(3), 220);

					accessor.removeZone(second);

					assert.strictEqual(cellList.scrollHeight, 350);
					assert.strictEqual(cellList.getElementTop(3), 200);
				});
			});
	});

	test('Multiple Whitespaces 2', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markup, [], {}]
			],
			async (editor, viewModel, disposables) => {
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					cellLineNumberStates: {},
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50],
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService, disposables);
				disposables.add(cellList);
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210, 100);
				assert.strictEqual(cellList.scrollHeight, 350);

				cellList.changeViewZones(accessor => {
					const first = accessor.addZone({
						afterModelPosition: 0,
						heightInPx: 20,
						domNode: document.createElement('div')
					});
					accessor.layoutZone(first);

					const second = accessor.addZone({
						afterModelPosition: 1,
						heightInPx: 20,
						domNode: document.createElement('div')
					});
					accessor.layoutZone(second);

					assert.strictEqual(cellList.scrollHeight, 390);
					assert.strictEqual(cellList._getView().getWhitespacePosition(first), 0);
					assert.strictEqual(cellList._getView().getWhitespacePosition(second), 70);

					accessor.removeZone(first);
					accessor.removeZone(second);
				});
			});
	});

	test('Whitespace with folding support', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markup, [], {}]
			],
			async (editor, viewModel, disposables) => {
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					cellLineNumberStates: {},
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50],
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService, disposables);
				disposables.add(cellList);
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210, 100);
				assert.strictEqual(cellList.scrollHeight, 350);

				cellList.changeViewZones(accessor => {
					const id = accessor.addZone({
						afterModelPosition: 0,
						heightInPx: 20,
						domNode: document.createElement('div')
					});

					accessor.layoutZone(id);
					assert.strictEqual(cellList.scrollHeight, 370);

					assert.strictEqual(cellList.getElementTop(0), 20);
					assert.strictEqual(cellList.getElementTop(1), 70);
					assert.strictEqual(cellList.getElementTop(2), 170);
					assert.strictEqual(cellList.getElementTop(3), 220);
					assert.strictEqual(cellList.getElementTop(4), 320);

					accessor.removeZone(id);
					assert.strictEqual(cellList.scrollHeight, 350);
				});

				cellList.changeViewZones(accessor => {
					const id = accessor.addZone({
						afterModelPosition: 1,
						heightInPx: 20,
						domNode: document.createElement('div')
					});

					accessor.layoutZone(id);
					assert.strictEqual(cellList.scrollHeight, 370);

					assert.strictEqual(cellList.getElementTop(0), 0);
					assert.strictEqual(cellList.getElementTop(1), 70);
					assert.strictEqual(cellList.getElementTop(2), 170);
					assert.strictEqual(cellList.getElementTop(3), 220);
					assert.strictEqual(cellList.getElementTop(4), 320);

					accessor.removeZone(id);
					assert.strictEqual(cellList.scrollHeight, 350);
				});

				// Whitespace should be hidden if it's after the header in a folding region
				cellList.changeViewZones(accessor => {
					const id = accessor.addZone({
						afterModelPosition: 3,
						heightInPx: 20,
						domNode: document.createElement('div')
					});

					accessor.layoutZone(id);
					assert.strictEqual(cellList.scrollHeight, 370);

					const foldingModel = disposables.add(new FoldingModel());
					foldingModel.attachViewModel(viewModel);
					foldingModel.applyMemento([{ start: 2, end: 3 }]);
					viewModel.updateFoldingRanges(foldingModel.regions);
					assert.deepStrictEqual(viewModel.getHiddenRanges(), [
						{ start: 3, end: 3 }
					]);
					cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
					assert.strictEqual(cellList.scrollHeight, 250);

					assert.strictEqual(cellList.getElementTop(0), 0);
					assert.strictEqual(cellList.getElementTop(1), 50);
					assert.strictEqual(cellList.getElementTop(2), 150);
					assert.strictEqual(cellList.getElementTop(3), 200);

					cellList.setHiddenAreas([], true);
					assert.strictEqual(cellList.scrollHeight, 370);
					accessor.removeZone(id);
					assert.strictEqual(cellList.scrollHeight, 350);
				});

				// Whitespace should not be hidden if it's after the last cell in a folding region
				cellList.changeViewZones(accessor => {
					const id = accessor.addZone({
						afterModelPosition: 4,
						heightInPx: 20,
						domNode: document.createElement('div')
					});

					accessor.layoutZone(id);
					assert.strictEqual(cellList.scrollHeight, 370);

					const foldingModel = disposables.add(new FoldingModel());
					foldingModel.attachViewModel(viewModel);
					foldingModel.applyMemento([{ start: 2, end: 3 }]);
					viewModel.updateFoldingRanges(foldingModel.regions);
					assert.deepStrictEqual(viewModel.getHiddenRanges(), [
						{ start: 3, end: 3 }
					]);
					cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
					assert.strictEqual(cellList.scrollHeight, 270);

					assert.strictEqual(cellList.getElementTop(0), 0);
					assert.strictEqual(cellList.getElementTop(1), 50);
					assert.strictEqual(cellList.getElementTop(2), 150);
					assert.strictEqual(cellList.getElementTop(3), 220);

					cellList.setHiddenAreas([], true);
					assert.strictEqual(cellList.scrollHeight, 370);
					accessor.removeZone(id);
					assert.strictEqual(cellList.scrollHeight, 350);
				});

				// Whitespace move when previous folding regions fold
				cellList.changeViewZones(accessor => {
					const id = accessor.addZone({
						afterModelPosition: 4,
						heightInPx: 20,
						domNode: document.createElement('div')
					});

					accessor.layoutZone(id);
					assert.strictEqual(cellList.scrollHeight, 370);

					const foldingModel = disposables.add(new FoldingModel());
					foldingModel.attachViewModel(viewModel);
					foldingModel.applyMemento([{ start: 0, end: 1 }]);
					viewModel.updateFoldingRanges(foldingModel.regions);
					assert.deepStrictEqual(viewModel.getHiddenRanges(), [
						{ start: 1, end: 1 }
					]);
					cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
					assert.strictEqual(cellList.scrollHeight, 270);

					assert.strictEqual(cellList.getElementTop(0), 0);
					assert.strictEqual(cellList.getElementTop(1), 50);
					assert.strictEqual(cellList.getElementTop(2), 100);
					assert.strictEqual(cellList.getElementTop(3), 220);

					cellList.setHiddenAreas([], true);
					assert.strictEqual(cellList.scrollHeight, 370);
					accessor.removeZone(id);
					assert.strictEqual(cellList.scrollHeight, 350);
				});
			});
	});

	test('Whitespace with multiple viewzones at same position', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markup, [], {}]
			],
			async (editor, viewModel, disposables) => {
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					cellLineNumberStates: {},
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50],
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService, disposables);
				disposables.add(cellList);
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210, 100);
				assert.strictEqual(cellList.scrollHeight, 350);

				cellList.changeViewZones(accessor => {
					const first = accessor.addZone({
						afterModelPosition: 0,
						heightInPx: 20,
						domNode: document.createElement('div')
					});

					accessor.layoutZone(first);
					assert.strictEqual(cellList.scrollHeight, 370);

					const second = accessor.addZone({
						afterModelPosition: 0,
						heightInPx: 20,
						domNode: document.createElement('div')
					});
					accessor.layoutZone(second);
					assert.strictEqual(cellList.scrollHeight, 390);

					assert.strictEqual(cellList.getElementTop(0), 40);
					assert.strictEqual(cellList.getElementTop(1), 90);
					assert.strictEqual(cellList.getElementTop(2), 190);
					assert.strictEqual(cellList.getElementTop(3), 240);
					assert.strictEqual(cellList.getElementTop(4), 340);


					accessor.removeZone(first);
					assert.strictEqual(cellList.scrollHeight, 370);
					accessor.removeZone(second);
					assert.strictEqual(cellList.scrollHeight, 350);
				});
			});
	});
});
