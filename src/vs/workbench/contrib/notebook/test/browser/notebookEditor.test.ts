/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as DOM from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { FoldingModel, updateFoldingStateAtIndex } from '../../browser/viewModel/foldingModel.js';
import { expandCellRangesWithHiddenCells, INotebookEditor } from '../../browser/notebookBrowser.js';
import { CellKind, NotebookSetting } from '../../common/notebookCommon.js';
import { createNotebookCellList, setupInstantiationService, TestNotebookExecutionStateService, withTestNotebook } from './testNotebookEditor.js';
import { ListViewInfoAccessor } from '../../browser/view/notebookCellList.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NotebookEditor } from '../../browser/notebookEditor.js';
import { getDefaultNotebookCreationOptions, NotebookEditorWidget } from '../../browser/notebookEditorWidget.js';
import { INotebookEditorService } from '../../browser/services/notebookEditorService.js';
import { INotebookService } from '../../common/notebookService.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../../editor/common/config/fontInfo.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ISizeService } from '../../../../../platform/theme/common/sizeService.js';
import { INotebookExecutionService } from '../../common/notebookExecutionService.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { INotebookRendererMessagingService } from '../../common/notebookRendererMessagingService.js';

suite('NotebookEditor layout styles', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createLayoutStyles(fontFamily: string, configurationService = new TestConfigurationService({ editor: { fontFamily, fontSize: 14 } })): HTMLStyleElement {
		const instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
		}, disposables);
		instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(ISizeService, {
			_serviceBrand: undefined,
			onDidChangeSizes: Event.None,
			getSize: () => undefined,
		});
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });
		instantiationService.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() { });
		instantiationService.stub(INotebookRendererMessagingService, new class extends mock<INotebookRendererMessagingService>() { });
		instantiationService.stub(INotebookExecutionService, new class extends mock<INotebookExecutionService>() { });
		instantiationService.stub(INotebookExecutionStateService, new TestNotebookExecutionStateService());
		instantiationService.stub(INotebookLoggingService, new NullLogService());
		instantiationService.stub(INotebookEditorService, new class extends mock<INotebookEditorService>() {
			override addNotebookEditor(): void { }
			override removeNotebookEditor(): void { }
		});
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override onDidChangeOutputRenderers = Event.None;
		});
		instantiationService.stub(INotebookKernelService, new class extends mock<INotebookKernelService>() {
			override onDidAddKernel = Event.None;
			override onDidChangeSelectedNotebooks = Event.None;
			override onDidChangeSourceActions = Event.None;
		});
		const widget = disposables.add(instantiationService.createInstance(NotebookEditorWidget, {
			...getDefaultNotebookCreationOptions(),
			contributions: [],
			cellEditorContributions: [],
		}, undefined));
		const style = widget.getDomNode().querySelector<HTMLStyleElement>('.cell-list-container > style');
		assert.ok(style);
		return style;
	}

	test('preserves valid editor font lists in notebook layout CSS', () => {
		const fontFamily = '"Fira Code", monospace';
		const style = createLayoutStyles(fontFamily);
		assert.strictEqual(
			style.textContent?.match(/--notebook-cell-input-preview-font-family: ([^\n]*)/u)?.[1],
			`${fontFamily};`
		);
	});

	test('prevents editor font families from injecting declarations or workbench rules', () => {
		const fontFamilies = [
			'monospace; color: red',
			'monospace; } .notebook-font-injection { color: red; } /*',
		];
		assert.deepStrictEqual(fontFamilies.map(fontFamily => {
			const style = createLayoutStyles(fontFamily);
			assert.ok(style.sheet);
			return {
				fontFamily: style.textContent?.match(/--notebook-cell-input-preview-font-family: ([^\n]*)/u)?.[1],
				injectedRule: Array.from(style.sheet.cssRules).some(rule => rule.cssText.includes('.notebook-font-injection')),
			};
		}), fontFamilies.map(() => ({
			fontFamily: `${EDITOR_FONT_DEFAULTS.fontFamily};`,
			injectedRule: false,
		})));
	});

	function readFontSizeStyles(style: HTMLStyleElement) {
		assert.ok(style.sheet);
		return {
			fontSize: style.textContent?.match(/--notebook-cell-input-preview-font-size: ([^\n]*)/u)?.[1],
			outputFontSize: style.textContent?.match(/--notebook-cell-output-font-size: ([^\n]*)/u)?.[1],
			injectedRule: Array.from(style.sheet.cssRules).some(rule => rule.cssText.includes('.notebook-font-size-injection')),
		};
	}

	test('preserves numeric font sizes and the zero output font size fallback', () => {
		const sizes = [
			{ fontSize: 14, outputFontSize: 18.5 },
			{ fontSize: 16.5, outputFontSize: 0 },
		];
		assert.deepStrictEqual(sizes.map(({ fontSize, outputFontSize }) => {
			const configurationService = new TestConfigurationService({
				editor: { fontSize },
				[NotebookSetting.outputFontSize]: outputFontSize,
			});
			return readFontSizeStyles(createLayoutStyles('monospace', configurationService));
		}), [
			{ fontSize: '14px;', outputFontSize: '18.5px;', injectedRule: false },
			{ fontSize: '16.5px;', outputFontSize: '16.5px;', injectedRule: false },
		]);
	});

	test('prevents nonnumeric font sizes from injecting workbench rules', () => {
		const payload = '14px; } .notebook-font-size-injection { color: red; } /*';
		const invalidSizes = [payload, [payload], '14', [14], null, true, NaN, Infinity, -Infinity];
		assert.deepStrictEqual(invalidSizes.flatMap(value => {
			const configurations = [
				{ editor: { fontSize: value }, [NotebookSetting.outputFontSize]: 0 },
				{ editor: { fontSize: 16 }, [NotebookSetting.outputFontSize]: value },
			];
			return configurations.map(configuration => readFontSizeStyles(
				createLayoutStyles('monospace', new TestConfigurationService(configuration))
			));
		}), invalidSizes.flatMap(() => [
			{ fontSize: `${EDITOR_FONT_DEFAULTS.fontSize}px;`, outputFontSize: `${EDITOR_FONT_DEFAULTS.fontSize}px;`, injectedRule: false },
			{ fontSize: '16px;', outputFontSize: '16px;', injectedRule: false },
		]));
	});

	test('validates font sizes again when configuration changes', async () => {
		const configurationService = new TestConfigurationService({
			editor: { fontSize: 14 },
			[NotebookSetting.outputFontSize]: 0,
		});
		const style = createLayoutStyles('monospace', configurationService);
		const container = style.parentElement!;
		const results = [];
		const changes = [
			['editor.fontSize', ['14px; } .notebook-font-size-injection { color: red; } /*']],
			[NotebookSetting.outputFontSize, '14px; } .notebook-font-size-injection { color: red; } /*'],
			['editor.fontSize', 16],
			[NotebookSetting.outputFontSize, 0],
		] as const;
		for (const [key, value] of changes) {
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([key]),
				change: { keys: [key], overrides: [] },
				affectsConfiguration: section => section === key,
			});
			const updatedStyle = container.querySelector<HTMLStyleElement>(':scope > style');
			assert.ok(updatedStyle);
			results.push(readFontSizeStyles(updatedStyle));
		}
		assert.deepStrictEqual(results, [
			{ fontSize: `${EDITOR_FONT_DEFAULTS.fontSize}px;`, outputFontSize: `${EDITOR_FONT_DEFAULTS.fontSize}px;`, injectedRule: false },
			{ fontSize: `${EDITOR_FONT_DEFAULTS.fontSize}px;`, outputFontSize: `${EDITOR_FONT_DEFAULTS.fontSize}px;`, injectedRule: false },
			{ fontSize: '16px;', outputFontSize: '16px;', injectedRule: false },
			{ fontSize: '16px;', outputFontSize: '16px;', injectedRule: false },
		]);
	});
});

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
