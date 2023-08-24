/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdownAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { localize } from 'vs/nls';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { getMarkdownHeadersInCell } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';
import { OutlineEntry } from './OutlineEntry';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export class NotebookOutlineEntryFactory {
	private readonly _onDidCellModelChange = new Emitter<void>();
	readonly onDidCellModelChange: Event<void> = this._onDidCellModelChange.event;


	constructor(
		private readonly executionStateService: INotebookExecutionStateService,
		private readonly outlineModelService: IOutlineModelService
	) { }

	public createOutlineEntrys(notebookCells: ICellViewModel[], focused: number, disposables: DisposableStore): { entries: OutlineEntry[]; activeEntry: OutlineEntry | undefined } {
		const entries: OutlineEntry[] = [];
		let activeEntry: OutlineEntry | undefined = undefined;

		for (const cell of notebookCells) {
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
					entries.push(new OutlineEntry(entries.length, depth, cell, text, false, false));
				}

				if (!hasHeader) {
					// no markdown syntax headers, try to find html tags
					const match = fullContent.match(/<h([1-6]).*>(.*)<\/h\1>/i);
					if (match) {
						hasHeader = true;
						const level = parseInt(match[1]);
						const text = match[2].trim();
						entries.push(new OutlineEntry(entries.length, level, cell, text, false, false));
					}
				}

				if (!hasHeader) {
					content = renderMarkdownAsPlaintext({ value: content });
				}
			}

			if (!hasHeader) {
				let preview = content.trim();
				if (preview.length === 0) {
					// empty or just whitespace
					preview = localize('empty', "empty cell");
				}

				const exeState = !isMarkdown && this.executionStateService.getCellExecution(cell.uri);
				if (!isMarkdown && cell.model.textModel) {
					const outlineModel = this.outlineModelService.getOrCreate(cell.model.textModel, CancellationToken.None);
					outlineModel.getTopLevelSymbols().forEach((symbol) => {
						console.log('ADDING ENTRY ', symbol.name);
						entries.push(new OutlineEntry(entries.length, 7, cell, symbol.name, !!exeState, exeState ? exeState.isPaused : false));
					});
				}
				else {
					console.log('ADDING ENTRY ', preview);
					entries.push(new OutlineEntry(entries.length, 7, cell, preview, !!exeState, exeState ? exeState.isPaused : false));
				}
			}

			if (cell.handle === focused) {
				activeEntry = entries[entries.length - 1];
			}

			// send an event whenever any of the cells change
			disposables.add(cell.model.onDidChangeContent(() => {
				this._onDidCellModelChange.fire();

			}));
		}
		return { entries, activeEntry };
	}

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
