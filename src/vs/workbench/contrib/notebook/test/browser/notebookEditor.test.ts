/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as DOM from '../../../../../base/browser/dom.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { FoldingModel, updateFoldingStateAtIndex } from '../../browser/viewModel/foldingModel.js';
import { expandCellRangesWithHiddenCells, INotebookEditor } from '../../browser/notebookBrowser.js';
import { CellKind } from '../../common/notebookCommon.js';
import { createNotebookCellList, setupInstantiationService, withTestNotebook } from './testNotebookEditor.js';
import { ListViewInfoAccessor } from '../../browser/view/notebookCellList.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NotebookEditor } from '../../browser/notebookEditor.js';
import { NotebookEditorWidget } from '../../browser/notebookEditorWidget.js';
import { INotebookEditorService } from '../../browser/services/notebookEditorService.js';
import { INotebookService } from '../../common/notebookService.js';

suite('NotebookEditor focus', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('includes detached cell popups without including unrelated elements', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() { });
		instantiationService.stub(INotebookEditorService, new class extends mock<INotebookEditorService>() { });
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() { });
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() { });
		instantiationService.stub(IPreferencesService, new class extends mock<IPreferencesService>() { });
		const pane = disposables.add(instantiationService.createInstance(NotebookEditor, instantiationService.get(IEditorGroupsService).activeGroup));
		const container = DOM.append(document.body, DOM.$('.notebook-pane-focus-test'));
		disposables.add(toDisposable(() => container.remove()));
		const notebookRoot = DOM.append(container, DOM.$('.notebook-root'));
		const input = DOM.append(notebookRoot, DOM.$('textarea'));
		const overflowHost = DOM.append(container, DOM.$('.notebook-overflow-widget-container'));
		const popup = DOM.append(overflowHost, DOM.$('.monaco-hover', { tabindex: '0', role: 'tooltip' }));
		const outside = DOM.append(container, DOM.$('button'));

		const focusStates = [pane.hasFocus()];
		const widget = new class extends mock<NotebookEditorWidget>() {
			override getDomNode() { return notebookRoot; }
			override getOverflowContainerDomNode() { return overflowHost; }
		};
		sinon.stub(pane, 'getControl').returns(widget);
		input.focus();
		focusStates.push(pane.hasFocus());
		popup.focus();
		assert.strictEqual(document.activeElement, popup);
		focusStates.push(pane.hasFocus());
		outside.focus();
		focusStates.push(pane.hasFocus());

		assert.deepStrictEqual(focusStates, [false, true, true, false]);
	});
});

suite('ListViewInfoAccessor', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
	});

	test('basics', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);

				const cellList = ds.add(createNotebookCellList(instantiationService, ds));
				cellList.attachViewModel(viewModel);
				const listViewInfoAccessor = ds.add(new ListViewInfoAccessor(cellList));

				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(0)!), 0);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(1)!), 1);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(2)!), 2);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(3)!), 3);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(4)!), 4);
				assert.deepStrictEqual(listViewInfoAccessor.getCellRangeFromViewRange(0, 1), { start: 0, end: 1 });
				assert.deepStrictEqual(listViewInfoAccessor.getCellRangeFromViewRange(1, 2), { start: 1, end: 2 });

				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);

				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(0)!), 0);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(1)!), -1);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(2)!), 1);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(3)!), -1);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.cellAt(4)!), -1);

				assert.deepStrictEqual(listViewInfoAccessor.getCellRangeFromViewRange(0, 1), { start: 0, end: 2 });
				assert.deepStrictEqual(listViewInfoAccessor.getCellRangeFromViewRange(1, 2), { start: 2, end: 5 });
				assert.deepStrictEqual(listViewInfoAccessor.getCellsFromViewRange(0, 1), viewModel.getCellsInRange({ start: 0, end: 2 }));
				assert.deepStrictEqual(listViewInfoAccessor.getCellsFromViewRange(1, 2), viewModel.getCellsInRange({ start: 2, end: 5 }));

				const notebookEditor = new class extends mock<INotebookEditor>() {
					override getViewIndexByModelIndex(index: number) { return listViewInfoAccessor.getViewIndex(viewModel.viewCells[index]!); }
					override getCellRangeFromViewRange(startIndex: number, endIndex: number) { return listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex); }
					override cellAt(index: number) { return viewModel.cellAt(index); }
				};

				assert.deepStrictEqual(expandCellRangesWithHiddenCells(notebookEditor, [{ start: 0, end: 1 }]), [{ start: 0, end: 2 }]);
				assert.deepStrictEqual(expandCellRangesWithHiddenCells(notebookEditor, [{ start: 2, end: 3 }]), [{ start: 2, end: 5 }]);
				assert.deepStrictEqual(expandCellRangesWithHiddenCells(notebookEditor, [{ start: 0, end: 1 }, { start: 2, end: 3 }]), [{ start: 0, end: 5 }]);
			});
	});
});

interface INotebookEditorWidgetWarmupAccessor {
	_warmupWithMarkdownRenderer(viewModel: unknown, viewState: unknown): Promise<void>;
}

suite('NotebookEditorWidget warmup', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses opacity and pointer-events during warmup to preserve webview process priority', async () => {
		const webviewElement = DOM.$('div');
		const warmupEvents: { opacity: string; pointerEvents: string; visibility: string }[] = [];

		const fakeWebview = {
			element: webviewElement
		};

		const fakeList = {
			layout: () => { },
			attachViewModel: () => { },
			scrollTop: 0
		};

		const fakeWidget = {
			logService: new NullLogService(),
			_resolveWebview: async () => fakeWebview,
			_webview: fakeWebview,
			_warmupViewportMarkdownCells: async () => {
				warmupEvents.push({
					opacity: webviewElement.style.opacity,
					pointerEvents: webviewElement.style.pointerEvents,
					visibility: webviewElement.style.visibility
				});
			},
			_list: fakeList,
			_debug: () => { },
			_onDidAttachViewModel: { fire: () => { } }
		};

		await (NotebookEditorWidget.prototype as unknown as INotebookEditorWidgetWarmupAccessor)._warmupWithMarkdownRenderer.call(fakeWidget, {} as unknown, undefined);

		// During warmup, opacity must be '0' and pointer-events 'none', and visibility must not be 'hidden'
		assert.strictEqual(warmupEvents.length, 1);
		assert.strictEqual(warmupEvents[0].opacity, '0');
		assert.strictEqual(warmupEvents[0].pointerEvents, 'none');
		assert.strictEqual(warmupEvents[0].visibility, '');

		// After warmup completes, styles are restored
		assert.strictEqual(webviewElement.style.opacity, '');
		assert.strictEqual(webviewElement.style.pointerEvents, '');
		assert.strictEqual(webviewElement.style.visibility, '');
	});

	test('restores opacity and pointer-events even if warmup fails', async () => {
		const webviewElement = DOM.$('div');
		const fakeWebview = {
			element: webviewElement
		};

		const fakeWidget = {
			logService: new NullLogService(),
			_resolveWebview: async () => fakeWebview,
			_webview: fakeWebview,
			_warmupViewportMarkdownCells: async () => {
				throw new Error('warmup failed');
			},
			_debug: () => { },
			_onDidAttachViewModel: { fire: () => { } }
		};

		await assert.rejects(async () => {
			await (NotebookEditorWidget.prototype as unknown as INotebookEditorWidgetWarmupAccessor)._warmupWithMarkdownRenderer.call(fakeWidget, {} as unknown, undefined);
		});

		// After failure, styles must still be restored
		assert.strictEqual(webviewElement.style.opacity, '');
		assert.strictEqual(webviewElement.style.pointerEvents, '');
	});
});
