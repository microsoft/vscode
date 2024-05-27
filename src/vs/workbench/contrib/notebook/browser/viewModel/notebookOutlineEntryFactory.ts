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
import { IRange } from 'vs/editor/common/core/range';
import { SymbolKind } from 'vs/editor/common/languages';
import { OutlineTarget } from 'vs/workbench/services/outline/browser/outline';

export const enum NotebookOutlineConstants {
	NonHeaderOutlineLevel = 7,
}

type entryDesc = {
	name: string;
	range: IRange;
	level: number;
	kind: SymbolKind;
};

function getMarkdownHeadersInCellFallbackToHtmlTags(fullContent: string) {
	const headers = Array.from(getMarkdownHeadersInCell(fullContent));
	if (headers.length) {
		return headers;
	}
	// no markdown syntax headers, try to find html tags
	const match = fullContent.match(/<h([1-6]).*>(.*)<\/h\1>/i);
	if (match) {
		const level = parseInt(match[1]);
		const text = match[2].trim();
		headers.push({ depth: level, text });
	}
	return headers;
}

export class NotebookOutlineEntryFactory {

	private cellOutlineEntryCache: Record<string, entryDesc[]> = {};
	private readonly cachedMarkdownOutlineEntries = new WeakMap<ICellViewModel, { alternativeId: number; headers: { depth: number; text: string }[] }>();
	constructor(
		private readonly executionStateService: INotebookExecutionStateService
	) { }

	public getOutlineEntries(cell: ICellViewModel, target: OutlineTarget, index: number): OutlineEntry[] {
		const entries: OutlineEntry[] = [];

		const isMarkdown = cell.cellKind === CellKind.Markup;

		// cap the amount of characters that we look at and use the following logic
		// - for MD prefer headings (each header is an entry)
		// - otherwise use the first none-empty line of the cell (MD or code)
		let content = getCellFirstNonEmptyLine(cell);
		let hasHeader = false;

		if (isMarkdown) {
			const fullContent = cell.getText().substring(0, 10000);
			const cache = this.cachedMarkdownOutlineEntries.get(cell);
			const headers = cache?.alternativeId === cell.getAlternativeId() ? cache.headers : Array.from(getMarkdownHeadersInCellFallbackToHtmlTags(fullContent));
			this.cachedMarkdownOutlineEntries.set(cell, { alternativeId: cell.getAlternativeId(), headers });

			for (const { depth, text } of headers) {
				hasHeader = true;
				entries.push(new OutlineEntry(index++, depth, cell, text, false, false));
			}

			if (!hasHeader) {
				content = renderMarkdownAsPlaintext({ value: content });
			}
		}

		if (!hasHeader) {
			const exeState = !isMarkdown && this.executionStateService.getCellExecution(cell.uri);
			let preview = content.trim();

			if (!isMarkdown && cell.model.textModel) {
				const cachedEntries = this.cellOutlineEntryCache[cell.model.textModel.id];

				// Gathering symbols from the model is an async operation, but this provider is syncronous.
				// So symbols need to be precached before this function is called to get the full list.
				if (cachedEntries) {
					// push code cell entry that is a parent of cached symbols, always necessary. filtering for quickpick done in that provider.
					entries.push(new OutlineEntry(index++, NotebookOutlineConstants.NonHeaderOutlineLevel, cell, preview, !!exeState, exeState ? exeState.isPaused : false));
					cachedEntries.forEach((cached) => {
						entries.push(new OutlineEntry(index++, cached.level, cell, cached.name, false, false, cached.range, cached.kind));
					});
				}
			}

			if (entries.length === 0) { // if there are no cached entries, use the first line of the cell as a code cell
				if (preview.length === 0) {
					// empty or just whitespace
					preview = localize('empty', "empty cell");
				}
				entries.push(new OutlineEntry(index++, NotebookOutlineConstants.NonHeaderOutlineLevel, cell, preview, !!exeState, exeState ? exeState.isPaused : false));
			}
		}

		return entries;
	}

	public async cacheSymbols(cell: ICellViewModel, outlineModelService: IOutlineModelService, cancelToken: CancellationToken) {
		const textModel = await cell.resolveTextModel();
		const outlineModel = await outlineModelService.getOrCreate(textModel, cancelToken);
		const entries = createOutlineEntries(outlineModel.getTopLevelSymbols(), 8);
		this.cellOutlineEntryCache[textModel.id] = entries;
	}
}

type outlineModel = Awaited<ReturnType<OutlineModelService['getOrCreate']>>;
type documentSymbol = ReturnType<outlineModel['getTopLevelSymbols']>[number];

function createOutlineEntries(symbols: documentSymbol[], level: number): entryDesc[] {
	const entries: entryDesc[] = [];
	symbols.forEach(symbol => {
		entries.push({ name: symbol.name, range: symbol.range, level, kind: symbol.kind });
		if (symbol.children) {
			entries.push(...createOutlineEntries(symbol.children, level + 1));
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

	return cell.getText().substring(0, 100);
}
