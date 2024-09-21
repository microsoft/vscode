/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { TrackedRangeStickiness } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { insertCellAtIndex, runDeleteAction } from '../../browser/controller/cellOperations.js';
import { NotebookEventDispatcher } from '../../browser/viewModel/eventDispatcher.js';
import { NotebookViewModel } from '../../browser/viewModel/notebookViewModelImpl.js';
import { ViewContext } from '../../browser/viewModel/viewContext.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { CellKind, diff } from '../../common/notebookCommon.js';
import { NotebookOptions } from '../../browser/notebookOptions.js';
import { ICellRange } from '../../common/notebookRange.js';
import { NotebookEditorTestModel, setupInstantiationService, withTestNotebook } from './testNotebookEditor.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { IBaseCellEditorOptions } from '../../browser/notebookBrowser.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ILanguageDetectionService } from '../../../../services/languageDetection/common/languageDetectionWorkerService.js';

suite('NotebookViewModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let textModelService: ITextModelService;
	let bulkEditService: IBulkEditService;
	let undoRedoService: IUndoRedoService;
	let modelService: IModelService;
	let languageService: ILanguageService;
	let languageDetectionService: ILanguageDetectionService;
	let notebookExecutionStateService: INotebookExecutionStateService;

	suiteSetup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
		textModelService = instantiationService.get(ITextModelService);
		bulkEditService = instantiationService.get(IBulkEditService);
		undoRedoService = instantiationService.get(IUndoRedoService);
		modelService = instantiationService.get(IModelService);
		languageService = instantiationService.get(ILanguageService);
		languageDetectionService = instantiationService.get(ILanguageDetectionService);
		notebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);

		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IThemeService, new TestThemeService());
	});

	suiteTeardown(() => disposables.dispose());

	test('ctor', function () {
		const notebook = new NotebookTextModel('notebook', URI.parse('test'), [], {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, transientOutputs: false, cellContentMetadata: {} }, undoRedoService, modelService, languageService, languageDetectionService);
		const model = new NotebookEditorTestModel(notebook);
		const options = new NotebookOptions(mainWindow, false, undefined, instantiationService.get(IConfigurationService), instantiationService.get(INotebookExecutionStateService), instantiationService.get(ICodeEditorService));
		const eventDispatcher = new NotebookEventDispatcher();
		const viewContext = new ViewContext(options, eventDispatcher, () => ({} as IBaseCellEditorOptions));
		const viewModel = new NotebookViewModel('notebook', model.notebook, viewContext, null, { isReadOnly: false }, instantiationService, bulkEditService, undoRedoService, textModelService, notebookExecutionStateService);
		assert.strictEqual(viewModel.viewType, 'notebook');
		notebook.dispose();
		model.dispose();
		options.dispose();
		eventDispatcher.dispose();
		viewModel.dispose();
	});

	test('insert/delete', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel) => {
				const cell = insertCellAtIndex(viewModel, 1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
				assert.strictEqual(viewModel.length, 3);
				assert.strictEqual(viewModel.notebookDocument.cells.length, 3);
				assert.strictEqual(viewModel.getCellIndex(cell), 1);

				runDeleteAction(editor, viewModel.cellAt(1)!);
				assert.strictEqual(viewModel.length, 2);
				assert.strictEqual(viewModel.notebookDocument.cells.length, 2);
				assert.strictEqual(viewModel.getCellIndex(cell), -1);

				cell.dispose();
				cell.model.dispose();
			}
		);
	});

	test('index', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel) => {
				const firstViewCell = viewModel.cellAt(0)!;
				const lastViewCell = viewModel.cellAt(viewModel.length - 1)!;

				const insertIndex = viewModel.getCellIndex(firstViewCell) + 1;
				const cell = insertCellAtIndex(viewModel, insertIndex, 'var c = 3;', 'javascript', CellKind.Code, {}, [], true, true);

				const addedCellIndex = viewModel.getCellIndex(cell);
				runDeleteAction(editor, viewModel.cellAt(addedCellIndex)!);

				const secondInsertIndex = viewModel.getCellIndex(lastViewCell) + 1;
				const cell2 = insertCellAtIndex(viewModel, secondInsertIndex, 'var d = 4;', 'javascript', CellKind.Code, {}, [], true, true);

				assert.strictEqual(viewModel.length, 3);
				assert.strictEqual(viewModel.notebookDocument.cells.length, 3);
				assert.strictEqual(viewModel.getCellIndex(cell2), 2);

				cell.dispose();
				cell.model.dispose();
				cell2.dispose();
				cell2.model.dispose();
			}
		);
	});
});

function getVisibleCells<T>(cells: T[], hiddenRanges: ICellRange[]) {
	if (!hiddenRanges.length) {
		return cells;
	}

	let start = 0;
	let hiddenRangeIndex = 0;
	const result: T[] = [];

	while (start < cells.length && hiddenRangeIndex < hiddenRanges.length) {
		if (start < hiddenRanges[hiddenRangeIndex].start) {
			result.push(...cells.slice(start, hiddenRanges[hiddenRangeIndex].start));
		}

		start = hiddenRanges[hiddenRangeIndex].end + 1;
		hiddenRangeIndex++;
	}

	if (start < cells.length) {
		result.push(...cells.slice(start));
	}

	return result;
}

suite('NotebookViewModel Decorations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tracking range', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}],
				['var d = 4;', 'javascript', CellKind.Code, [], {}],
				['var e = 5;', 'javascript', CellKind.Code, [], {}],
			],
			(editor, viewModel) => {
				const trackedId = viewModel.setTrackedRange('test', { start: 1, end: 2 }, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
				assert.deepStrictEqual(viewModel.getTrackedRange(trackedId!), {
					start: 1,

					end: 2,
				});

				const cell1 = insertCellAtIndex(viewModel, 0, 'var d = 6;', 'javascript', CellKind.Code, {}, [], true, true);
				assert.deepStrictEqual(viewModel.getTrackedRange(trackedId!), {
					start: 2,

					end: 3
				});

				runDeleteAction(editor, viewModel.cellAt(0)!);
				assert.deepStrictEqual(viewModel.getTrackedRange(trackedId!), {
					start: 1,

					end: 2
				});

				const cell2 = insertCellAtIndex(viewModel, 3, 'var d = 7;', 'javascript', CellKind.Code, {}, [], true, true);
				assert.deepStrictEqual(viewModel.getTrackedRange(trackedId!), {
					start: 1,

					end: 3
				});

				runDeleteAction(editor, viewModel.cellAt(3)!);
				assert.deepStrictEqual(viewModel.getTrackedRange(trackedId!), {
					start: 1,

					end: 2
				});

				runDeleteAction(editor, viewModel.cellAt(1)!);
				assert.deepStrictEqual(viewModel.getTrackedRange(trackedId!), {
					start: 0,

					end: 1
				});

				cell1.dispose();
				cell1.model.dispose();
				cell2.dispose();
				cell2.model.dispose();
			}
		);
	});

	test('tracking range 2', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}],
				['var d = 4;', 'javascript', CellKind.Code, [], {}],
				['var e = 5;', 'javascript', CellKind.Code, [], {}],
				['var e = 6;', 'javascript', CellKind.Code, [], {}],
				['var e = 7;', 'javascript', CellKind.Code, [], {}],
			],
			(editor, viewModel) => {
				const trackedId = viewModel.setTrackedRange('test', { start: 1, end: 3 }, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
				assert.deepStrictEqual(viewModel.getTrackedRange(trackedId!), {
					start: 1,

					end: 3
				});

				insertCellAtIndex(viewModel, 5, 'var d = 9;', 'javascript', CellKind.Code, {}, [], true, true);
				assert.deepStrictEqual(viewModel.getTrackedRange(trackedId!), {
					start: 1,

					end: 3
				});

				insertCellAtIndex(viewModel, 4, 'var d = 10;', 'javascript', CellKind.Code, {}, [], true, true);
				assert.deepStrictEqual(viewModel.getTrackedRange(trackedId!), {
					start: 1,

					end: 4
				});
			}
		);
	});

	test('diff hidden ranges', async function () {
		assert.deepStrictEqual(getVisibleCells<number>([1, 2, 3, 4, 5], []), [1, 2, 3, 4, 5]);

		assert.deepStrictEqual(
			getVisibleCells<number>(
				[1, 2, 3, 4, 5],
				[{ start: 1, end: 2 }]
			),
			[1, 4, 5]
		);

		assert.deepStrictEqual(
			getVisibleCells<number>(
				[1, 2, 3, 4, 5, 6, 7, 8, 9],
				[
					{ start: 1, end: 2 },
					{ start: 4, end: 5 }
				]
			),
			[1, 4, 7, 8, 9]
		);

		const original = getVisibleCells<number>(
			[1, 2, 3, 4, 5, 6, 7, 8, 9],
			[
				{ start: 1, end: 2 },
				{ start: 4, end: 5 }
			]
		);

		const modified = getVisibleCells<number>(
			[1, 2, 3, 4, 5, 6, 7, 8, 9],
			[
				{ start: 2, end: 4 }
			]
		);

		assert.deepStrictEqual(diff<number>(original, modified, (a) => {
			return original.indexOf(a) >= 0;
		}), [{ start: 1, deleteCount: 1, toInsert: [2, 6] }]);
	});
});

suite('NotebookViewModel API', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('#115432, get nearest code cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['b = 2;', 'python', CellKind.Code, [], {}],
				['var c = 3', 'javascript', CellKind.Code, [], {}],
				['# header d', 'markdown', CellKind.Markup, [], {}],
				['var e = 4;', 'TypeScript', CellKind.Code, [], {}],
				['# header f', 'markdown', CellKind.Markup, [], {}]
			],
			(editor, viewModel) => {
				assert.strictEqual(viewModel.nearestCodeCellIndex(0), 1);
				// find the nearest code cell from above
				assert.strictEqual(viewModel.nearestCodeCellIndex(2), 1);
				assert.strictEqual(viewModel.nearestCodeCellIndex(4), 3);
				assert.strictEqual(viewModel.nearestCodeCellIndex(5), 4);
				assert.strictEqual(viewModel.nearestCodeCellIndex(6), 4);
			}
		);
	});

	test('#108464, get nearest code cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}]
			],
			(editor, viewModel) => {
				assert.strictEqual(viewModel.nearestCodeCellIndex(2), 1);
			}
		);
	});

	test('getCells', async () => {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}]
			],
			(editor, viewModel) => {
				assert.strictEqual(viewModel.getCellsInRange().length, 3);
				assert.deepStrictEqual(viewModel.getCellsInRange({ start: 0, end: 1 }).map(cell => cell.getText()), ['# header a']);
				assert.deepStrictEqual(viewModel.getCellsInRange({ start: 0, end: 2 }).map(cell => cell.getText()), ['# header a', 'var b = 1;']);
				assert.deepStrictEqual(viewModel.getCellsInRange({ start: 0, end: 3 }).map(cell => cell.getText()), ['# header a', 'var b = 1;', '# header b']);
				assert.deepStrictEqual(viewModel.getCellsInRange({ start: 0, end: 4 }).map(cell => cell.getText()), ['# header a', 'var b = 1;', '# header b']);
				assert.deepStrictEqual(viewModel.getCellsInRange({ start: 1, end: 4 }).map(cell => cell.getText()), ['var b = 1;', '# header b']);
				assert.deepStrictEqual(viewModel.getCellsInRange({ start: 2, end: 4 }).map(cell => cell.getText()), ['# header b']);
				assert.deepStrictEqual(viewModel.getCellsInRange({ start: 3, end: 4 }).map(cell => cell.getText()), []);

				// no one should use an invalid range but `getCells` should be able to handle that.
				assert.deepStrictEqual(viewModel.getCellsInRange({ start: -1, end: 1 }).map(cell => cell.getText()), ['# header a']);
				assert.deepStrictEqual(viewModel.getCellsInRange({ start: 3, end: 0 }).map(cell => cell.getText()), ['# header a', 'var b = 1;', '# header b']);
			}
		);
	});
});
