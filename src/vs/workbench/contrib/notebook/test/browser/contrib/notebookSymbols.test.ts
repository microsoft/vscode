/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mock } from 'vs/base/test/common/mock';
import { IOutlineModelService, OutlineModel } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookOutlineEntryCacheService } from 'vs/workbench/contrib/notebook/browser/viewModel/NotebookOutlineEntryCacheService';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

suite('Notebook Symbols', function () {

	type textSymbol = { name: string; children?: textSymbol[] };
	let symbols: textSymbol[];

	const executionService = new class extends mock<INotebookExecutionStateService>() {
		override getCellExecution() { return undefined; }
	};

	const outlineModel = {
		getTopLevelSymbols() {
			return symbols;
		}
	} as OutlineModel;
	const outlineModelService = new class extends mock<IOutlineModelService>() {
		override getOrCreate(arg0: any, arg1: any) {
			return Promise.resolve(outlineModel);
		}
		override getDebounceValue(arg0: any) {
			return 0;
		}
	};

	function createCellViewModel(version: number = 1) {
		return {
			textBuffer: {
				getLineCount() { return 0; }
			},
			getText() {
				return '# code';
			},
			model: {
				textModel: {
					id: 'textId',
					getVersionId() { return version; }
				}
			}
		} as ICellViewModel;
	}

	test('Cell without symbols cache', function () {
		symbols = [{ name: 'var' }];
		const entryFactory = new NotebookOutlineEntryCacheService(executionService, outlineModelService);
		const entries = entryFactory.getOutlineEntries(createCellViewModel(), 0, true, true);

		assert.equal(entries.length, 1, 'no entries created');
		assert.equal(entries[0].label, '# code', 'entry should fall back to first line of cell');
	});

	test('Cell with simple symbols', async function () {
		symbols = [{ name: 'var1' }, { name: 'var2' }];
		const entryFactory = new NotebookOutlineEntryCacheService(executionService, outlineModelService);

		const cell = createCellViewModel();
		// initial call to cache values
		entryFactory.getOutlineEntries(cell, 0, true, true);
		await new Promise(resolve => setTimeout(resolve, 0));
		const entries = entryFactory.getOutlineEntries(cell, 0, true, true);

		assert.equal(entries.length, 2, 'wrong number of outline entries');
		assert.equal(entries[0].label, 'var1');
		// 6 levels for markdown, all code symbols are greater than the max markdown level
		assert.equal(entries[0].level, 7);
		assert.equal(entries[0].index, 0);
		assert.equal(entries[1].label, 'var2');
		assert.equal(entries[1].level, 7);
		assert.equal(entries[1].index, 1);
	});

	test('Cell outline entries update with new text model versions', async function () {
		symbols = [{ name: 'var1' }];
		const entryFactory = new NotebookOutlineEntryCacheService(executionService, outlineModelService);

		entryFactory.getOutlineEntries(createCellViewModel(1), 0, true, true);
		await new Promise(resolve => setTimeout(resolve, 0));
		symbols = [{ name: 'updated' }];
		// update the cache
		const cell = createCellViewModel(2);
		entryFactory.getOutlineEntries(cell, 0, true, true);
		await new Promise(resolve => setTimeout(resolve, 0));
		const entries = entryFactory.getOutlineEntries(cell, 0, true, true);

		assert.equal(entries.length, 1, 'wrong number of outline entries');
		assert.equal(entries[0].label, 'updated');
	});

	test('Cell symbols cache updates for call that does not want all symbols', async function () {
		symbols = [{ name: 'var1' }];
		const entryFactory = new NotebookOutlineEntryCacheService(executionService, outlineModelService);

		const cell = createCellViewModel();
		// initial call that doesn't need all symbols, still request to cache them
		entryFactory.getOutlineEntries(cell, 0, false, true);
		await new Promise(resolve => setTimeout(resolve, 0));
		const entries = entryFactory.getOutlineEntries(cell, 0, true, true);

		assert.equal(entries.length, 1, 'wrong number of outline entries');
		assert.equal(entries[0].label, 'var1');
	});

	test('Cell with nested symbols', async function () {
		symbols = [
			{ name: 'root1', children: [{ name: 'nested1' }, { name: 'nested2' }] },
			{ name: 'root2', children: [{ name: 'nested1' }] }
		];
		const entryFactory = new NotebookOutlineEntryCacheService(executionService, outlineModelService);

		// initial call to cache values
		entryFactory.getOutlineEntries(createCellViewModel(), 0, true, true);
		await new Promise(resolve => setTimeout(resolve, 0));
		const entries = entryFactory.getOutlineEntries(createCellViewModel(), 0, true, true);

		assert.equal(entries.length, 5, 'wrong number of outline entries');
		assert.equal(entries[0].label, 'root1');
		assert.equal(entries[0].level, 7);
		assert.equal(entries[1].label, 'nested1');
		assert.equal(entries[1].level, 8);
		assert.equal(entries[2].label, 'nested2');
		assert.equal(entries[2].level, 8);
		assert.equal(entries[3].label, 'root2');
		assert.equal(entries[3].level, 7);
		assert.equal(entries[4].label, 'nested1');
		assert.equal(entries[4].level, 8);
	});
});
