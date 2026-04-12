/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestThemeService } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { NotebookBreadcrumbsProvider, NotebookOutlinePaneProvider, NotebookQuickPickProvider } from '../../../browser/contrib/outline/notebookOutline.js';
import { NotebookOutlineEntryFactory } from '../../../browser/viewModel/notebookOutlineEntryFactory.js';
import { OutlineEntry } from '../../../browser/viewModel/OutlineEntry.js';
suite('Notebook Outline View Providers', function () {
    // #region Setup
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const configurationService = new TestConfigurationService();
    const themeService = new TestThemeService();
    const symbolsPerTextModel = {};
    function setSymbolsForTextModel(symbols, textmodelId = 'textId') {
        symbolsPerTextModel[textmodelId] = symbols;
    }
    const executionService = new class extends mock() {
        getCellExecution() { return undefined; }
    };
    class OutlineModelStub {
        constructor(textId) {
            this.textId = textId;
        }
        getTopLevelSymbols() {
            return symbolsPerTextModel[this.textId];
        }
    }
    const outlineModelService = new class extends mock() {
        getOrCreate(model, arg1) {
            const outline = new OutlineModelStub(model.id);
            return Promise.resolve(outline);
        }
        getDebounceValue(arg0) {
            return 0;
        }
    };
    const textModelService = new class extends mock() {
        createModelReference(uri) {
            return Promise.resolve({
                object: {
                    textEditorModel: {
                        id: uri.toString(),
                        getVersionId() { return 1; }
                    }
                },
                dispose() { }
            });
        }
    };
    // #endregion
    // #region Helpers
    function createCodeCellViewModel(version = 1, source = '# code', textmodelId = 'textId') {
        return {
            uri: { toString() { return textmodelId; } },
            id: textmodelId,
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
                return this.model.textModel;
            },
            cellKind: 2
        };
    }
    function createMockOutlineDataSource(entries, activeElement = undefined) {
        return new class extends mock() {
            constructor() {
                super(...arguments);
                this.object = {
                    entries: entries,
                    activeElement: activeElement,
                };
            }
        };
    }
    function createMarkupCellViewModel(version = 1, source = 'markup', textmodelId = 'textId', alternativeId = 1) {
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
                return this.model.textModel;
            },
            cellKind: 1
        };
    }
    function flatten(element, dataSource) {
        const elements = [];
        const children = dataSource.getChildren(element);
        for (const child of children) {
            elements.push(child);
            elements.push(...flatten(child, dataSource));
        }
        return elements;
    }
    function buildOutlineTree(entries) {
        if (entries.length > 0) {
            const result = [entries[0]];
            const parentStack = [entries[0]];
            for (let i = 1; i < entries.length; i++) {
                const entry = entries[i];
                while (true) {
                    const len = parentStack.length;
                    if (len === 0) {
                        // root node
                        result.push(entry);
                        parentStack.push(entry);
                        break;
                    }
                    else {
                        const parentCandidate = parentStack[len - 1];
                        if (parentCandidate.level < entry.level) {
                            parentCandidate.addChild(entry);
                            parentStack.push(entry);
                            break;
                        }
                        else {
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
    async function setOutlineViewConfiguration(config) {
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
        }
        // Generate raw outline
        const outlineModel = new OutlineEntry(-1, -1, createMarkupCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
        for (const cell of cells) {
            entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
        }
        const outlineTree = buildOutlineTree([...outlineModel.children]);
        // Generate filtered outline (view model)
        const breadcrumbsProvider = store.add(new NotebookBreadcrumbsProvider(createMockOutlineDataSource([], [...outlineTree[0].children][1]), configurationService));
        const results = breadcrumbsProvider.getBreadcrumbElements();
        // Validate
        assert.equal(results.length, 3);
        assert.equal(results[0].element.label, 'fakeRoot');
        assert.equal(results[0].element.level, -1);
        assert.equal(results[1].element.label, 'h1');
        assert.equal(results[1].element.level, 1);
        assert.equal(results[2].element.label, '# code cell 2');
        assert.equal(results[2].element.level, 7);
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
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        for (const cell of cells) {
            await entryFactory.cacheSymbols(cell, CancellationToken.None);
        }
        // Generate raw outline
        const outlineModel = new OutlineEntry(-1, -1, createMarkupCellViewModel(), 'fakeRoot', false, false, undefined, undefined);
        for (const cell of cells) {
            entryFactory.getOutlineEntries(cell, 0).forEach(entry => outlineModel.addChild(entry));
        }
        const outlineTree = buildOutlineTree([...outlineModel.children]);
        // Generate filtered outline (view model)
        const breadcrumbsProvider = store.add(new NotebookBreadcrumbsProvider(createMockOutlineDataSource([], [...outlineTree[0].children][1]), configurationService));
        const results = breadcrumbsProvider.getBreadcrumbElements();
        // Validate
        assert.equal(results.length, 2);
        assert.equal(results[0].element.label, 'fakeRoot');
        assert.equal(results[0].element.level, -1);
        assert.equal(results[1].element.label, 'h1');
        assert.equal(results[1].element.level, 1);
    });
    // #endregion
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPdXRsaW5lVmlld1Byb3ZpZGVycy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL2NvbnRyaWIvbm90ZWJvb2tPdXRsaW5lVmlld1Byb3ZpZGVycy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUVsRixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDcEcsT0FBTyxFQUFFLDJCQUEyQixFQUF1QiwyQkFBMkIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRy9LLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQU0xRSxLQUFLLENBQUMsaUNBQWlDLEVBQUU7SUFFeEMsZ0JBQWdCO0lBRWhCLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixFQUFFLENBQUM7SUFDNUQsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO0lBRTVDLE1BQU0sbUJBQW1CLEdBQXlDLEVBQUUsQ0FBQztJQUNyRSxTQUFTLHNCQUFzQixDQUFDLE9BQTZCLEVBQUUs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