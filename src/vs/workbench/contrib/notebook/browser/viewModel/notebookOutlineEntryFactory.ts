/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdownAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IOutlineModelService, OutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { localize } from 'vs/nls';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { getMarkdownHeadersInCell } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';
import { OutlineEntry } from './OutlineEntry';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TimeoutTimer } from 'vs/base/common/async';
import { IDisposable } from 'vs/base/common/lifecycle';

export const INotebookOutlineEntryCacheService = createDecorator<INotebookOutlineEntryCacheService>('INotebookOutlineEntryFactory');

export interface INotebookOutlineEntryCacheService {
	readonly _serviceBrand: undefined;
	createOutlineEntrys(cell: ICellViewModel, index: number, includeAllSymbols: boolean, cacheSymbols: boolean): OutlineEntry[];
}

type entryDesc = { name: string; level: number };

export class NotebookOutlineEntryCacheService implements INotebookOutlineEntryCacheService, IDisposable {
	_serviceBrand: undefined;

	private cellOutlineEntryCache: Record<string, entryDesc[]> = {};
	private cacheTimer = new TimeoutTimer();

	constructor(
		@INotebookExecutionStateService private readonly executionStateService: INotebookExecutionStateService,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService
	) { }

	public createOutlineEntrys(cell: ICellViewModel, index: number, includeAllSymbols: boolean, cacheSymbols: boolean): OutlineEntry[] {
		const entries: OutlineEntry[] = [];

		const isMarkdown = cell.cellKind === CellKind.Markup;

		// cap the amount of characters that we look at and use the following logic
		// - for MD prefer headings (each header is an entry)
		// - otherwise use the first none-empty line of the cell (MD or code)
		let content = getCellFirstNonEmptyLine(cell);
		let hasHeader = false;

		if (isMarkdown) {
			const fullContent = cell.getText().substring(0, 10000);
			for (const { depth, text } of getMarkdownHeadersInCell(fullContent)) {
				hasHeader = true;
				entries.push(new OutlineEntry(index++, depth, cell, text, false, false));
			}

			if (!hasHeader) {
				// no markdown syntax headers, try to find html tags
				const match = fullContent.match(/<h([1-6]).*>(.*)<\/h\1>/i);
				if (match) {
					hasHeader = true;
					const level = parseInt(match[1]);
					const text = match[2].trim();
					entries.push(new OutlineEntry(index++, level, cell, text, false, false));
				}
			}

			if (!hasHeader) {
				content = renderMarkdownAsPlaintext({ value: content });
			}
		}

		if (!hasHeader) {
			if (!isMarkdown && cacheSymbols && cell.model.textModel) {
				const cachedEntries = this.cellOutlineEntryCache[cell.model.textModel.id];
				if (!cachedEntries || cachedEntries.entries.length === 0) {
					this.cacheSymbols(cell);
				}

				// Gathering symbols from the model is an async operation, but this provider is syncronous.
				// This will just provide the most recently cached values to stay syncronous, while refreshing the cache asyncronously.
				if (includeAllSymbols && cachedEntries) {
					cachedEntries.forEach((cached) => {
						entries.push(new OutlineEntry(index++, cached.level, cell, cached.name, false, false));
					});

				}
			}

			const exeState = !isMarkdown && this.executionStateService.getCellExecution(cell.uri);
			if (entries.length === 0) {
				let preview = content.trim();
				if (preview.length === 0) {
					// empty or just whitespace
					preview = localize('empty', "empty cell");
				}

				entries.push(new OutlineEntry(index++, 7, cell, preview, !!exeState, exeState ? exeState.isPaused : false));
			}
		}

		return entries;
	}

	private async cacheSymbols(cell: ICellViewModel) {
		const textModel = cell.model.textModel;
		if (textModel) {
			const timeout = this.outlineModelService.getDebounceValue(textModel);
			this.cacheTimer.cancelAndSet(async () => {
				const outlineModel = await this.outlineModelService.getOrCreate(textModel, CancellationToken.None);
				const symbols = createOutlineEntry(outlineModel.getTopLevelSymbols(), 7);
				this.cellOutlineEntryCache[textModel.id] = symbols;
			}, timeout);
		}
	}

	dispose(): void {
		this.cacheTimer.dispose();
	}
}

type outlineModel = Awaited<ReturnType<OutlineModelService['getOrCreate']>>;
type documentSymbol = ReturnType<outlineModel['getTopLevelSymbols']>[number];

function createOutlineEntry(symbols: documentSymbol[], level: number): entryDesc[] {
	const entries: entryDesc[] = [];
	symbols.forEach(symbol => {
		entries.push({ name: symbol.name, level });
		if (symbol.children) {
			entries.push(...createOutlineEntry(symbol.children, level + 1));
		}
	});
	return entries;
}

function getCellFirstNonEmptyLine(cell: ICellViewModel) {
	const textBuffer = cell.textBuffer;
	for (let i = 0; i < textBuffer.getLineCount(); i++) {
		const firstNonWhitespace = textBuffer.getLineFirstNonWhitespaceColumn(i + 1);
		const lineLength = textBuffer.getLineLength(i + 1);
		if (firstNonWhitespace < lineLength) {
			return textBuffer.getLineContent(i + 1);
		}
	}

	return cell.getText().substring(0, 10_000);
}
