/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IOutlineModelService, OutlineModel } from '../../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { ICellViewModel } from '../../../browser/notebookBrowser.js';
import { NotebookOutlineEntryFactory } from '../../../browser/viewModel/notebookOutlineEntryFactory.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { MockDocumentSymbol } from '../testNotebookEditor.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';

suite('Notebook Symbols', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

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
	const textModelService = new class extends mock<ITextModelService>() {
		override createModelReference(uri: URI) {
			return Promise.resolve({
				object: {
					textEditorModel: {
						id: uri.toString(),
						getVersionId() { return 1; }
					}
				},
				dispose() { }
			} as IReference<IResolvedTextEditorModel>);
		}
	};

	function createCellViewModel(version: number = 1, textmodelId = 'textId') {
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
				return this.model.textModel as unknown;
			},
		} as ICellViewModel;
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
