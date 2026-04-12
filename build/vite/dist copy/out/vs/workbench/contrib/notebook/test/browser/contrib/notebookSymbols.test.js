/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NotebookOutlineEntryFactory } from '../../../browser/viewModel/notebookOutlineEntryFactory.js';
suite('Notebook Symbols', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
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
    function createCellViewModel(version = 1, textmodelId = 'textId') {
        return {
            id: textmodelId,
            uri: { toString() { return textmodelId; } },
            textBuffer: {
                getLineCount() { return 0; }
            },
            getText() {
                return '# code';
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
        };
    }
    test('Cell without symbols cache', function () {
        setSymbolsForTextModel([{ name: 'var', range: {} }]);
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        const entries = entryFactory.getOutlineEntries(createCellViewModel(), 0);
        assert.equal(entries.length, 1, 'no entries created');
        assert.equal(entries[0].label, '# code', 'entry should fall back to first line of cell');
    });
    test('Cell with simple symbols', async function () {
        setSymbolsForTextModel([{ name: 'var1', range: {} }, { name: 'var2', range: {} }]);
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        const cell = createCellViewModel();
        await entryFactory.cacheSymbols(cell, CancellationToken.None);
        const entries = entryFactory.getOutlineEntries(cell, 0);
        assert.equal(entries.length, 3, 'wrong number of outline entries');
        assert.equal(entries[0].label, '# code');
        assert.equal(entries[1].label, 'var1');
        // 6 levels for markdown, all code symbols are greater than the max markdown level
        assert.equal(entries[1].level, 8);
        assert.equal(entries[1].index, 1);
        assert.equal(entries[2].label, 'var2');
        assert.equal(entries[2].level, 8);
        assert.equal(entries[2].index, 2);
    });
    test('Cell with nested symbols', async function () {
        setSymbolsForTextModel([
            { name: 'root1', range: {}, children: [{ name: 'nested1', range: {} }, { name: 'nested2', range: {} }] },
            { name: 'root2', range: {}, children: [{ name: 'nested1', range: {} }] }
        ]);
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        const cell = createCellViewModel();
        await entryFactory.cacheSymbols(cell, CancellationToken.None);
        const entries = entryFactory.getOutlineEntries(createCellViewModel(), 0);
        assert.equal(entries.length, 6, 'wrong number of outline entries');
        assert.equal(entries[0].label, '# code');
        assert.equal(entries[1].label, 'root1');
        assert.equal(entries[1].level, 8);
        assert.equal(entries[2].label, 'nested1');
        assert.equal(entries[2].level, 9);
        assert.equal(entries[3].label, 'nested2');
        assert.equal(entries[3].level, 9);
        assert.equal(entries[4].label, 'root2');
        assert.equal(entries[4].level, 8);
        assert.equal(entries[5].label, 'nested1');
        assert.equal(entries[5].level, 9);
    });
    test('Multiple Cells with symbols', async function () {
        setSymbolsForTextModel([{ name: 'var1', range: {} }], '$1');
        setSymbolsForTextModel([{ name: 'var2', range: {} }], '$2');
        const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
        const cell1 = createCellViewModel(1, '$1');
        const cell2 = createCellViewModel(1, '$2');
        await entryFactory.cacheSymbols(cell1, CancellationToken.None);
        await entryFactory.cacheSymbols(cell2, CancellationToken.None);
        const entries1 = entryFactory.getOutlineEntries(createCellViewModel(1, '$1'), 0);
        const entries2 = entryFactory.getOutlineEntries(createCellViewModel(1, '$2'), 0);
        assert.equal(entries1.length, 2, 'wrong number of outline entries');
        assert.equal(entries1[0].label, '# code');
        assert.equal(entries1[1].label, 'var1');
        assert.equal(entries2.length, 2, 'wrong number of outline entries');
        assert.equal(entries2[0].label, '# code');
        assert.equal(entries2[1].label, 'var2');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tTeW1ib2xzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvY29udHJpYi9ub3RlYm9va1N5bWJvbHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEYsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBSXRHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBT3hHLEtBQUssQ0FBQyxrQkFBa0IsRUFBRTtJQUN6Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0sbUJBQW1CLEdBQXlDLEVBQUUsQ0FBQztJQUNyRSxTQUFTLHNCQUFzQixDQUFDLE9BQTZCLEVBQUUsV0FBVyxHQUFHLFFBQVE7UUFDcEYsbUJBQW1CLENBQUMsV0FBVyxDQUFDLEdBQUcsT0FBTyxDQUFDO0lBQzVDLENBQUM7SUFFRCxNQUFNLGdCQUFnQixHQUFHLElBQUksS0FBTSxTQUFRLElBQUksRUFBa0M7UUFDdkUsZ0JBQWdCLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0tBQ2pELENBQUM7SUFFRixNQUFNLGdCQUFnQjtRQUNyQixZQUFvQixNQUFjO1lBQWQsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQUFJLENBQUM7UUFFdkMsa0JBQWtCO1lBQ2pCLE9BQU8sbUJBQW1CLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pDLENBQUM7S0FDRDtJQUNELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxL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