/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDataSource } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IReference } from 'vs/base/common/lifecycle';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ITextModel } from 'vs/editor/common/model';
import { IOutlineModelService, OutlineModel } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { NotebookBreadcrumbsProvider, NotebookCellOutline, NotebookOutlinePaneProvider, NotebookQuickPickProvider } from 'vs/workbench/contrib/notebook/browser/contrib/outline/notebookOutline';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookCellOutlineDataSource } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineDataSource';
import { NotebookOutlineEntryFactory } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineEntryFactory';
import { OutlineEntry } from 'vs/workbench/contrib/notebook/browser/viewModel/OutlineEntry';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { MockDocumentSymbol } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';

suite('Notebook Outline View Providers', function () {

	// #region Setup

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const configurationService = new TestConfigurationService();
	const themeService = new TestThemeService();

	const symbolsPerTextModel: Record<string, MockDocumentSymbol[]> = {};
	function setSymbolsForTextModel(symbols: MockDocumentSymbol[], textmodelId = 'textId') {
		symbolsPerTextModel[textmodelId] = symbols;
	}

	const executionService = new class extends mock<INotebookExecutionStateService>() {
		override getCellExecution() { return undefined; }
	};

	class OutlineModelStub {
		constructor(private textId: string) { }

		getTopLevelSymbols() {
			return symbolsPerTextModel[this.textId];
		}
	}
	const outlineModelService = new class extends mock<IOutlineModelService>() {
		override getOrCreate(model: ITextModel, arg1: any) {
			const outline = new OutlineModelStub(model.id) as unknown as OutlineModel;
			return Promise.resolve(outline);
		}
		override getDebounceValue(arg0: any) {
			return 0;
		}
	};

	// #endregion
	// #region Helpers

	function createCodeCellViewModel(version: number = 1, source = '# code', textmodelId = 'textId') {
		return {
			textBuffer: {
				getLineCount() { return 0; }
			},
			getText() {
				return source;
			},
			model: {
				textModel: {
					id: textmodelId,
					getVersionId() { return version; }
				}
			},
			resolveTextModel() {
				return this.model.textModel as unknown;
			},
			cellKind: 2
		} as ICellViewModel;
	}

	function createMockOutlineDataSource(entries: OutlineEntry[], activeElement: OutlineEntry | undefined = undefined) {
		return new class extends mock<IReference<INotebookCellOutlineDataSource>>() {
			override object: INotebookCellOutlineDataSource = {
				entries: entries,
				activeElement: activeElement,
			};
		};
	}

	function createMarkupCellViewModel(version: number = 1, source = 'markup', textmodelId = 'textId', alternativeId = 1) {
		return {
			textBuffer: {
				getLineCount() { return 0; }
			},
			getText() {
				return source;
			},
			getAlternativeId() {
				return alternativeId;
			},
			model: {
				textModel: {
					id: textmodelId,
					getVersionId() { return version; }
				}
			},
			resolveTextModel() {
				return this.model.textModel as unknown;
			},
			cellKind: 1
		} as ICellViewModel;
	}

	function flatten(element: OutlineEntry, dataSource: IDataSource<NotebookCellOutline, OutlineEntry>): OutlineEntry[] {
		const elements: OutlineEntry[] = [];

		const children = dataSource.getChildren(element);
		for (const child of children) {
			elements.push(child);
			elements.push(...flatten(child, dataSource));
		}

		return elements;
	}

	function buildOutlineTree(entries: OutlineEntry[]): OutlineEntry[] | undefined {
		if (entries.length > 0) {
			const result: OutlineEntry[] = [entries[0]];
			const parentStack: OutlineEntry[] = [entries[0]];

			for (let i = 1; i < entries.length; i++) {
				const entry = entries[i];

				while (true) {
					const len = parentStack.length;
					if (len === 0) {
						// root node
						result.push(entry);
						parentStack.push(entry);
						break;

					} else {
						const parentCandidate = parentStack[len - 1];
						if (parentCandidate.level < entry.level) {
							parentCandidate.addChild(entry);
							parentStack.push(entry);
							break;
						} else {
							parentStack.pop();
						}
					}
				}
			}
			return result;
		}
		return undefined;
	}

	/**
	 * Set the configuration settings relevant to various outline views (OutlinePane, QuickPick, Breadcrumbs)
	 *
	 * @param outlineShowMarkdownHeadersOnly: boolean 	(notebook.outline.showMarkdownHeadersOnly)
	 * @param outlineShowCodeCells: boolean 			(notebook.outline.showCodeCells)
	 * @param outlineShowCodeCellSymbols: boolean 		(notebook.outline.showCodeCellSymbols)
	 * @param quickPickShowAllSymbols: boolean 			(notebook.gotoSymbols.showAllSymbols)
	 * @param breadcrumbsShowCodeCells: boolean 		(notebook.breadcrumbs.showCodeCells)
	 */
	async function setOutlineViewConfiguration(config: {
		outlineShowMarkdownHeadersOnly: boolean;
		outlineShowCodeCells: boolean;
		outlineShowCodeCellSymbols: boolean;
		quickPickShowAllSymbols: boolean;
		breadcrumbsShowCodeCells: boolean;
	}) {
		await configurationService.setUserConfiguration('notebook.outline.showMarkdownHeadersOnly', config.outlineShowMarkdownHeadersOnly);
		await configurationService.setUserConfiguration('notebook.outline.showCodeCells', config.outlineShowCodeCells);
		await configurationService.setUserConfiguration('notebook.outline.showCodeCellSymbols', config.outlineShowCodeCellSymbols);
		await configurationService.setUserConfiguration('notebook.gotoSymbols.showAllSymbols', config.quickPickShowAllSymbols);
		await configurationService.setUserConfiguration('notebook.breadcrumbs.showCodeCells', config.breadcrumbsShowCodeCells);
	}

	// #endregion
	// #region OutlinePane

	test('OutlinePane 0: Default Settings (Headers Only ON, Code cells OFF, Symbols ON)', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: true,
			outlineShowCodeCells: false,
			outlineShowCodeCellSymbols: true,
			quickPickShowAllSymbols: false,
			breadcrumbsShowCodeCells: false
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([{ name: 'var2', range: {} }], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {} }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}

		// Generate filtered outline (view model)
		const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(undefined, configurationService));
		const results = flatten(outlineModel, outlinePaneProvider);

		// Validate
		assert.equal(results.length, 1);
		assert.equal(results[0].label, 'h1');
		assert.equal(results[0].level, 1);
	});

	test('OutlinePane 1: ALL Markdown', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: false,
			outlineShowCodeCells: false,
			outlineShowCodeCellSymbols: false,
			quickPickShowAllSymbols: false,
			breadcrumbsShowCodeCells: false
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([{ name: 'var2', range: {} }], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {} }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}

		// Generate filtered outline (view model)
		const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(undefined, configurationService));
		const results = flatten(outlineModel, outlinePaneProvider);

		assert.equal(results.length, 2);

		assert.equal(results[0].label, 'h1');
		assert.equal(results[0].level, 1);

		assert.equal(results[1].label, 'plaintext');
		assert.equal(results[1].level, 7);
	});

	test('OutlinePane 2: Only Headers', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: true,
			outlineShowCodeCells: false,
			outlineShowCodeCellSymbols: false,
			quickPickShowAllSymbols: false,
			breadcrumbsShowCodeCells: false
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([{ name: 'var2', range: {} }], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {} }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}

		// Generate filtered outline (view model)
		const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(undefined, configurationService));
		const results = flatten(outlineModel, outlinePaneProvider);

		assert.equal(results.length, 1);

		assert.equal(results[0].label, 'h1');
		assert.equal(results[0].level, 1);
	});

	test('OutlinePane 3: Only Headers + Code Cells', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: true,
			outlineShowCodeCells: true,
			outlineShowCodeCellSymbols: false,
			quickPickShowAllSymbols: false,
			breadcrumbsShowCodeCells: false
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([{ name: 'var2', range: {} }], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {} }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}

		// Generate filtered outline (view model)
		const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(undefined, configurationService));
		const results = flatten(outlineModel, outlinePaneProvider);

		assert.equal(results.length, 3);

		assert.equal(results[0].label, 'h1');
		assert.equal(results[0].level, 1);

		assert.equal(results[1].label, '# code cell 2');
		assert.equal(results[1].level, 7);

		assert.equal(results[2].label, '# code cell 3');
		assert.equal(results[2].level, 7);
	});

	test('OutlinePane 4: Only Headers + Code Cells + Symbols', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: true,
			outlineShowCodeCells: true,
			outlineShowCodeCellSymbols: true,
			quickPickShowAllSymbols: false,
			breadcrumbsShowCodeCells: false
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([{ name: 'var2', range: {} }], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {} }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}

		// Generate filtered outline (view model)
		const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(undefined, configurationService));
		const results = flatten(outlineModel, outlinePaneProvider);

		// validate
		assert.equal(results.length, 5);

		assert.equal(results[0].label, 'h1');
		assert.equal(results[0].level, 1);

		assert.equal(results[1].label, '# code cell 2');
		assert.equal(results[1].level, 7);

		assert.equal(results[2].label, 'var2');
		assert.equal(results[2].level, 8);

		assert.equal(results[3].label, '# code cell 3');
		assert.equal(results[3].level, 7);

		assert.equal(results[4].label, 'var3');
		assert.equal(results[4].level, 8);
	});

	// #endregion
	// #region QuickPick

	test('QuickPick 0: Symbols On + 2 cells WITH symbols', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: false,
			outlineShowCodeCells: false,
			outlineShowCodeCellSymbols: false,
			quickPickShowAllSymbols: true,
			breadcrumbsShowCodeCells: false
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([{ name: 'var2', range: {}, kind: 12 }], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {}, kind: 12 }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}

		// Generate filtered outline (view model)
		const quickPickProvider = store.add(new NotebookQuickPickProvider(createMockOutlineDataSource([...outlineModel.children]), configurationService, themeService));
		const results = quickPickProvider.getQuickPickElements();

		// Validate
		assert.equal(results.length, 4);

		assert.equal(results[0].label, '$(markdown) h1');
		assert.equal(results[0].element.level, 1);

		assert.equal(results[1].label, '$(markdown) plaintext');
		assert.equal(results[1].element.level, 7);

		assert.equal(results[2].label, '$(symbol-variable) var2');
		assert.equal(results[2].element.level, 8);

		assert.equal(results[3].label, '$(symbol-variable) var3');
		assert.equal(results[3].element.level, 8);
	});

	test('QuickPick 1: Symbols On + 1 cell WITH symbol + 1 cell WITHOUT symbol', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: false,
			outlineShowCodeCells: false,
			outlineShowCodeCellSymbols: false,
			quickPickShowAllSymbols: true,
			breadcrumbsShowCodeCells: false
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {}, kind: 12 }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}

		// Generate filtered outline (view model)
		const quickPickProvider = store.add(new NotebookQuickPickProvider(createMockOutlineDataSource([...outlineModel.children]), configurationService, themeService));
		const results = quickPickProvider.getQuickPickElements();

		// Validate
		assert.equal(results.length, 4);

		assert.equal(results[0].label, '$(markdown) h1');
		assert.equal(results[0].element.level, 1);

		assert.equal(results[1].label, '$(markdown) plaintext');
		assert.equal(results[1].element.level, 7);

		assert.equal(results[2].label, '$(code) # code cell 2');
		assert.equal(results[2].element.level, 7);

		assert.equal(results[3].label, '$(symbol-variable) var3');
		assert.equal(results[3].element.level, 8);
	});

	test('QuickPick 3: Symbols Off', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: false,
			outlineShowCodeCells: false,
			outlineShowCodeCellSymbols: false,
			quickPickShowAllSymbols: false,
			breadcrumbsShowCodeCells: false
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([{ name: 'var2', range: {}, kind: 12 }], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {}, kind: 12 }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}

		// Generate filtered outline (view model)
		const quickPickProvider = store.add(new NotebookQuickPickProvider(createMockOutlineDataSource([...outlineModel.children]), configurationService, themeService));
		const results = quickPickProvider.getQuickPickElements();

		// Validate
		assert.equal(results.length, 4);

		assert.equal(results[0].label, '$(markdown) h1');
		assert.equal(results[0].element.level, 1);

		assert.equal(results[1].label, '$(markdown) plaintext');
		assert.equal(results[1].element.level, 7);

		assert.equal(results[2].label, '$(code) # code cell 2');
		assert.equal(results[2].element.level, 7);

		assert.equal(results[3].label, '$(code) # code cell 3');
		assert.equal(results[3].element.level, 7);
	});

	// #endregion
	// #region Breadcrumbs

	test('Breadcrumbs 0: Code Cells On ', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: false,
			outlineShowCodeCells: false,
			outlineShowCodeCellSymbols: false,
			quickPickShowAllSymbols: false,
			breadcrumbsShowCodeCells: true
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([{ name: 'var2', range: {}, kind: 12 }], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {}, kind: 12 }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createMarkupCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}
		const outlineTree = buildOutlineTree([...outlineModel.children]);

		// Generate filtered outline (view model)
		const breadcrumbsProvider = store.add(new NotebookBreadcrumbsProvider(createMockOutlineDataSource([], [...outlineTree![0].children][1]), configurationService));
		const results = breadcrumbsProvider.getBreadcrumbElements();

		// Validate
		assert.equal(results.length, 3);

		assert.equal(results[0].label, 'fakeRoot');
		assert.equal(results[0].level, -1);

		assert.equal(results[1].label, 'h1');
		assert.equal(results[1].level, 1);

		assert.equal(results[2].label, '# code cell 2');
		assert.equal(results[2].level, 7);
	});

	test('Breadcrumbs 1: Code Cells Off ', async function () {
		await setOutlineViewConfiguration({
			outlineShowMarkdownHeadersOnly: false,
			outlineShowCodeCells: false,
			outlineShowCodeCellSymbols: false,
			quickPickShowAllSymbols: false,
			breadcrumbsShowCodeCells: false
		});

		// Create models + symbols
		const cells = [
			createMarkupCellViewModel(1, '# h1', '$0', 0),
			createMarkupCellViewModel(1, 'plaintext', '$1', 0),
			createCodeCellViewModel(1, '# code cell 2', '$2'),
			createCodeCellViewModel(1, '# code cell 3', '$3')
		];
		setSymbolsForTextModel([], '$0');
		setSymbolsForTextModel([], '$1');
		setSymbolsForTextModel([{ name: 'var2', range: {}, kind: 12 }], '$2');
		setSymbolsForTextModel([{ name: 'var3', range: {}, kind: 12 }], '$3');

		// Cache symbols
		const entryFactory = new NotebookOutlineEntryFactory(executionService);
		for (const cell of cells) {
			await entryFactory.cacheSymbols(cell, outlineModelService, CancellationToken.None);
		}

		// Generate raw outline
		const outlineModel = new OutlineEntry(-1, -1, createMarkupCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
		for (const cell of cells) {
			entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
		}
		const outlineTree = buildOutlineTree([...outlineModel.children]);

		// Generate filtered outline (view model)
		const breadcrumbsProvider = store.add(new NotebookBreadcrumbsProvider(createMockOutlineDataSource([], [...outlineTree![0].children][1]), configurationService));
		const results = breadcrumbsProvider.getBreadcrumbElements();

		// Validate
		assert.equal(results.length, 2);

		assert.equal(results[0].label, 'fakeRoot');
		assert.equal(results[0].level, -1);

		assert.equal(results[1].label, 'h1');
		assert.equal(results[1].level, 1);
	});

	// #endregion
});
