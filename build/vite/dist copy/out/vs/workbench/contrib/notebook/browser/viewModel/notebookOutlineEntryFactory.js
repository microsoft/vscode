/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { IOutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { localize } from '../../../../../nls.js';
import { getMarkdownHeadersInCell } from './foldingModel.js';
import { OutlineEntry } from './OutlineEntry.js';
import { CellKind } from '../../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
export var NotebookOutlineConstants;
(function (NotebookOutlineConstants) {
    NotebookOutlineConstants[NotebookOutlineConstants["NonHeaderOutlineLevel"] = 7] = "NonHeaderOutlineLevel";
})(NotebookOutlineConstants || (NotebookOutlineConstants = {}));
function getMarkdownHeadersInCellFallbackToHtmlTags(fullContent) {
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
export const INotebookOutlineEntryFactory = createDecorator('INotebookOutlineEntryFactory');
let NotebookOutlineEntryFactory = class NotebookOutlineEntryFactory {
    constructor(executionStateService, outlineModelService, textModelService) {
        this.executionStateService = executionStateService;
        this.outlineModelService = outlineModelService;
        this.textModelService = textModelService;
        this.cellOutlineEntryCache = {};
        this.cachedMarkdownOutlineEntries = new WeakMap();
    }
    getOutlineEntries(cell, index) {
        const entries = [];
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
                content = renderAsPlaintext({ value: content });
            }
        }
        if (!hasHeader) {
            const exeState = !isMarkdown && this.executionStateService.getCellExecution(cell.uri);
            let preview = content.trim();
            if (!isMarkdown) {
                const cached = this.cellOutlineEntryCache[cell.id];
                // Gathering symbols from the model is an async operation, but this provider is syncronous.
                // So symbols need to be precached before this function is called to get the full list.
                if (cached) {
                    // push code cell entry that is a parent of cached symbols, always necessary. filtering for quickpick done in that provider.
                    entries.push(new OutlineEntry(index++, 7 /* NotebookOutlineConstants.NonHeaderOutlineLevel */, cell, preview, !!exeState, exeState ? exeState.isPaused : false));
                    cached.forEach((entry) => {
                        entries.push(new OutlineEntry(index++, entry.level, cell, entry.name, false, false, entry.range, entry.kind));
                    });
                }
            }
            if (entries.length === 0) { // if there are no cached entries, use the first line of the cell as a code cell
                if (preview.length === 0) {
                    // empty or just whitespace
                    preview = localize('empty', "empty cell");
                }
                entries.push(new OutlineEntry(index++, 7 /* NotebookOutlineConstants.NonHeaderOutlineLevel */, cell, preview, !!exeState, exeState ? exeState.isPaused : false));
            }
        }
        return entries;
    }
    async cacheSymbols(cell, cancelToken) {
        if (cell.cellKind === CellKind.Markup) {
            return;
        }
        const ref = await this.textModelService.createModelReference(cell.uri);
        try {
            const textModel = ref.object.textEditorModel;
            const outlineModel = await this.outlineModelService.getOrCreate(textModel, cancelToken);
            const entries = createOutlineEntries(outlineModel.getTopLevelSymbols(), 8);
            this.cellOutlineEntryCache[cell.id] = entries;
        }
        finally {
            ref.dispose();
        }
    }
};
NotebookOutlineEntryFactory = __decorate([
    __param(0, INotebookExecutionStateService),
    __param(1, IOutlineModelService),
    __param(2, ITextModelService)
], NotebookOutlineEntryFactory);
export { NotebookOutlineEntryFactory };
function createOutlineEntries(symbols, level) {
    const entries = [];
    symbols.forEach(symbol => {
        entries.push({ name: symbol.name, range: symbol.range, level, kind: symbol.kind });
        if (symbol.children) {
            entries.push(...createOutlineEntries(symbol.children, level + 1));
        }
    });
    return entries;
}
function getCellFirstNonEmptyLine(cell) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3TW9kZWwvbm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRXBGLE9BQU8sRUFBRSxvQkFBb0IsRUFBdUIsTUFBTSx1RUFBdUUsQ0FBQztBQUNsSSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFakQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDN0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUcvRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFN0YsTUFBTSxDQUFOLElBQWtCLHdCQUVqQjtBQUZELFdBQWtCLHdCQUF3QjtJQUN6Qyx5R0FBeUIsQ0FBQTtBQUMxQixDQUFDLEVBRmlCLHdCQUF3QixLQUF4Qix3QkFBd0IsUUFFekM7QUFTRCxTQUFTLDBDQUEwQyxDQUFDLFdBQW1CO0lBQ3RFLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUNsRSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNwQixPQUFP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