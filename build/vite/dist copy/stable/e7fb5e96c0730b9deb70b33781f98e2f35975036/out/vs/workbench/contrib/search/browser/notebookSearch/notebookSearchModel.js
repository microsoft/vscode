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
import { coalesce } from '../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { FindMatch } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { resultIsMatch } from '../../../../services/search/common/search.js';
import { getTextSearchMatchWithModelContext } from '../../../../services/search/common/searchHelpers.js';
import { FindMatchDecorationModel } from '../../../notebook/browser/contrib/find/findMatchDecorationModel.js';
import { CellFindMatchModel } from '../../../notebook/browser/contrib/find/findModel.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { NotebookCellsChangeType } from '../../../notebook/common/notebookCommon.js';
import { CellSearchModel } from '../../common/cellSearchModel.js';
import { isINotebookFileMatchNoModel, rawCellPrefix } from '../../common/searchNotebookHelpers.js';
import { contentMatchesToTextSearchMatches, isINotebookCellMatchWithModel, isINotebookFileMatchWithModel, webviewMatchesToTextSearchMatches } from './searchNotebookHelpers.js';
import { MATCH_PREFIX } from '../searchTreeModel/searchTreeCommon.js';
import { IReplaceService } from '../replace.js';
import { FileMatchImpl } from '../searchTreeModel/fileMatch.js';
import { isIMatchInNotebook } from './notebookSearchModelBase.js';
import { MatchImpl, textSearchResultToMatches } from '../searchTreeModel/match.js';
export class MatchInNotebook extends MatchImpl {
    constructor(_cellParent, _fullPreviewLines, _fullPreviewRange, _documentRange, webviewIndex) {
        super(_cellParent.parent, _fullPreviewLines, _fullPreviewRange, _documentRange, false);
        this._cellParent = _cellParent;
        this._id = MATCH_PREFIX + this._parent.resource.toString() + '>' + this._cellParent.cellIndex + (webviewIndex ? '_' + webviewIndex : '') + '_' + this.notebookMatchTypeString() + this._range + this.getMatchString();
        this._webviewIndex = webviewIndex;
    }
    parent() {
        return this._cellParent.parent;
    }
    get cellParent() {
        return this._cellParent;
    }
    notebookMatchTypeString() {
        return this.isWebviewMatch() ? 'webview' : 'content';
    }
    isWebviewMatch() {
        return this._webviewIndex !== undefined;
    }
    get isReadonly() {
        return super.isReadonly || (!this._cellParent.hasCellViewModel()) || this.isWebviewMatch();
    }
    get cellIndex() {
        return this._cellParent.cellIndex;
    }
    get webviewIndex() {
        return this._webviewIndex;
    }
    get cell() {
        return this._cellParent.cell;
    }
}
export class CellMatch {
    constructor(_parent, _cell, _cellIndex) {
        this._parent = _parent;
        this._cell = _cell;
        this._cellIndex = _cellIndex;
        this._contentMatches = new Map();
        this._webviewMatches = new Map();
        this._context = new Map();
    }
    hasCellViewModel() {
        return !(this._cell instanceof CellSearchModel);
    }
    get context() {
        return new Map(this._context);
    }
    matches() {
        return [...this._contentMatches.values(), ...this._webviewMatches.values()];
    }
    get contentMatches() {
        return Array.from(this._contentMatches.values());
    }
    get webviewMatches() {
        return Array.from(this._webviewMatches.values());
    }
    remove(matches) {
        if (!Array.isArray(matches)) {
            matches = [matches];
        }
        for (const match of matches) {
            this._contentMatches.delete(match.id());
            this._webviewMatches.delete(match.id());
        }
    }
    clearAllMatches() {
        this._contentMatches.clear();
        this._webviewMatches.clear();
    }
    addContentMatches(textSearchMatches) {
        const contentMatches = textSearchMatchesToNotebookMatches(textSearchMatches, this);
        contentMatches.forEach((match) => {
            this._contentMatches.set(match.id(), match);
        });
        this.addContext(textSearchMatches);
    }
    addContext(textSearchMatches) {
        if (!this.cell) {
            // todo: get closed notebook results in search editor
            return;
        }
        this.cell.resolveTextModel().then((textModel) => {
            const textResultsWithContext = getTextSearchMatchWithModelContext(textSearchMatches, textModel, this.parent.parent().query);
            const contexts = textResultsWithContext.filter((result => !resultIsMatch(result)));
            contexts.map(context => ({ ...context, lineNumber: context.lineNumber + 1 }))
                .forEach((context) => { this._context.set(context.lineNumber, context.text); });
        });
    }
    addWebviewMatches(textSearchMatches) {
        const webviewMatches = textSearchMatchesToNotebookMatches(textSearchMatches, this);
        webviewMatches.forEach((match) => {
            this._webviewMatches.set(match.id(), match);
        });
        // TODO: add webview results to context
    }
    setCellModel(cell) {
        this._cell = cell;
    }
    get parent() {
        return this._parent;
    }
    get id() {
        return this._cell?.id ?? `${rawCellPrefix}${this.cellIndex}`;
    }
    get cellIndex() {
        return this._cellIndex;
    }
    get cell() {
        return this._cell;
    }
}
let NotebookCompatibleFileMatch = class NotebookCompatibleFileMatch extends FileMatchImpl {
    constructor(_query, _previewOptions, _maxResults, _parent, rawMatch, _closestRoot, searchInstanceID, modelService, replaceService, labelService, notebookEditorService) {
        super(_query, _previewOptions, _maxResults, _parent, rawMatch, _closestRoot, modelService, replaceService, labelService);
        this.searchInstanceID = searchInstanceID;
        this.notebookEditorService = notebookEditorService;
        this._notebookEditorWidget = null;
        this._editorWidgetListener = null;
        this._cellMatches = new Map();
        this._notebookUpdateScheduler = this._register(new RunOnceScheduler(this.updateMatchesForEditorWidget.bind(this), 250));
    }
    get cellContext() {
        const cellContext = new Map();
        this._cellMatches.forEach(cellMatch => {
            cellContext.set(cellMatch.id, cellMatch.context);
        });
        return cellContext;
    }
    getCellMatch(cellID) {
        return this._cellMatches.get(cellID);
    }
    addCellMatch(rawCell) {
        const cellMatch = new CellMatch(this, isINotebookCellMatchWithModel(rawCell) ? rawCell.cell : undefined, rawCell.index);
        this._cellMatches.set(cellMatch.id, cellMatch);
        this.addWebviewMatchesToCell(cellMatch.id, rawCell.webviewResults);
        this.addContentMatchesToCell(cellMatch.id, rawCell.contentResults);
    }
    addWebviewMatchesToCell(cellID, webviewMatches) {
        const cellMatch = this.getCellMatch(cellID);
        if (cellMatch !== undefined) {
            cellMatch.addWebviewMatches(webviewMatches);
        }
    }
    addContentMatchesToCell(cellID, contentMatches) {
        const cellMatch = this.getCellMatch(cellID);
        if (cellMatch !== undefined) {
            cellMatch.addContentMatches(contentMatches);
        }
    }
    revealCellRange(match, outputOffset) {
        if (!this._notebookEditorWidget || !match.cell) {
            // match cell should never be a CellSearchModel if the notebook is open
            return;
        }
        if (match.webviewIndex !== undefined) {
            const index = this._notebookEditorWidget.getCellIndex(match.cell);
            if (index !== undefined) {
                this._notebookEditorWidget.revealCellOffsetInCenter(match.cell, outputOffset ?? 0);
            }
        }
        else {
            match.cell.updateEditState(match.cell.getEditState(), 'focusNotebookCell');
            this._notebookEditorWidget.setCellEditorSelection(match.cell, match.range());
            this._notebookEditorWidget.revealRangeInCenterIfOutsideViewportAsync(match.cell, match.range());
        }
    }
    bindNotebookEditorWidget(widget) {
        if (this._notebookEditorWidget === widget) {
            return;
        }
        this._notebookEditorWidget = widget;
        this._editorWidgetListener = this._notebookEditorWidget.textModel?.onDidChangeContent((e) => {
            if (!e.rawEvents.some(event => event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ModelChange)) {
                return;
            }
            this._notebookUpdateScheduler.schedule();
        }) ?? null;
        this._addNotebookHighlights();
    }
    unbindNotebookEditorWidget(widget) {
        if (widget && this._notebookEditorWidget !== widget) {
            return;
        }
        if (this._notebookEditorWidget) {
            this._notebookUpdateScheduler.cancel();
            this._editorWidgetListener?.dispose();
        }
        this._removeNotebookHighlights();
        this._notebookEditorWidget = null;
    }
    updateNotebookHighlights() {
        if (this.parent().showHighlights) {
            this._addNotebookHighlights();
            this.setNotebookFindMatchDecorationsUsingCellMatches(Array.from(this._cellMatches.values()));
        }
        else {
            this._removeNotebookHighlights();
        }
    }
    _addNotebookHighlights() {
        if (!this._notebookEditorWidget) {
            return;
        }
        this._findMatchDecorationModel?.stopWebviewFind();
        this._findMatchDecorationModel?.dispose();
        this._findMatchDecorationModel = new FindMatchDecorationModel(this._notebookEditorWidget, this.searchInstanceID);
        if (this._selectedMatch instanceof MatchInNotebook) {
            this.highlightCurrentFindMatchDecoration(this._selectedMatch);
        }
    }
    _removeNotebookHighlights() {
        if (this._findMatchDecorationModel) {
            this._findMatchDecorationModel?.stopWebviewFind();
            this._findMatchDecorationModel?.dispose();
            this._findMatchDecorationModel = undefined;
        }
    }
    updateNotebookMatches(matches, modelChange) {
        if (!this._notebookEditorWidget) {
            return;
        }
        const oldCellMatches = new Map(this._cellMatches);
        if (this._notebookEditorWidget.getId() !== this._lastEditorWidgetIdForUpdate) {
            this._cellMatches.clear();
            this._lastEditorWidgetIdForUpdate = this._notebookEditorWidget.getId();
        }
        matches.forEach(match => {
            let existingCell = this._cellMatches.get(match.cell.id);
            if (this._notebookEditorWidget && !existingCell) {
                const index = this._notebookEditorWidget.getCellIndex(match.cell);
                const existingRawCell = oldCellMatches.get(`${rawCellPrefix}${index}`);
                if (existingRawCell) {
                    existingRawCell.setCellModel(match.cell);
                    existingRawCell.clearAllMatches();
                    existingCell = existingRawCell;
                }
            }
            existingCell?.clearAllMatches();
            const cell = existingCell ?? new CellMatch(this, match.cell, match.index);
            cell.addContentMatches(contentMatchesToTextSearchMatches(match.contentMatches, match.cell));
            cell.addWebviewMatches(webviewMatchesToTextSearchMatches(match.webviewMatches));
            this._cellMatches.set(cell.id, cell);
        });
        this._findMatchDecorationModel?.setAllFindMatchesDecorations(matches);
        if (this._selectedMatch instanceof MatchInNotebook) {
            this.highlightCurrentFindMatchDecoration(this._selectedMatch);
        }
        this._onChange.fire({ forceUpdateModel: modelChange });
    }
    setNotebookFindMatchDecorationsUsingCellMatches(cells) {
        if (!this._findMatchDecorationModel) {
            return;
        }
        const cellFindMatch = coalesce(cells.map((cell) => {
            const webviewMatches = coalesce(cell.webviewMatches.map((match) => {
                if (!match.webviewIndex) {
                    return undefined;
                }
                return {
                    index: match.webviewIndex,
                };
            }));
            if (!cell.cell) {
                return undefined;
            }
            const findMatches = cell.contentMatches.map(match => {
                return new FindMatch(match.range(), [match.text()]);
            });
            return new CellFindMatchModel(cell.cell, cell.cellIndex, findMatches, webviewMatches);
        }));
        try {
            this._findMatchDecorationModel.setAllFindMatchesDecorations(cellFindMatch);
        }
        catch (e) {
            // no op, might happen due to bugs related to cell output regex search
        }
    }
    async updateMatchesForEditorWidget() {
        if (!this._notebookEditorWidget) {
            return;
        }
        this._textMatches = new Map();
        const wordSeparators = this._query.isWordMatch && this._query.wordSeparators ? this._query.wordSeparators : null;
        const allMatches = await this._notebookEditorWidget
            .find(this._query.pattern, {
            regex: this._query.isRegExp,
            wholeWord: this._query.isWordMatch,
            caseSensitive: this._query.isCaseSensitive,
            wordSeparators: wordSeparators ?? undefined,
            includeMarkupInput: this._query.notebookInfo?.isInNotebookMarkdownInput,
            includeMarkupPreview: this._query.notebookInfo?.isInNotebookMarkdownPreview,
            includeCodeInput: this._query.notebookInfo?.isInNotebookCellInput,
            includeOutput: this._query.notebookInfo?.isInNotebookCellOutput,
        }, CancellationToken.None, false, true, this.searchInstanceID);
        this.updateNotebookMatches(allMatches, true);
    }
    async showMatch(match) {
        const offset = await this.highlightCurrentFindMatchDecoration(match);
        this.setSelectedMatch(match);
        this.revealCellRange(match, offset);
    }
    async highlightCurrentFindMatchDecoration(match) {
        if (!this._findMatchDecorationModel || !match.cell) {
            // match cell should never be a CellSearchModel if the notebook is open
            return null;
        }
        if (match.webviewIndex === undefined) {
            return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInCell(match.cell, match.range());
        }
        else {
            return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInWebview(match.cell, match.webviewIndex);
        }
    }
    matches() {
        const matches = Array.from(this._cellMatches.values()).flatMap((e) => e.matches());
        return [...super.matches(), ...matches];
    }
    removeMatch(match) {
        if (match instanceof MatchInNotebook) {
            match.cellParent.remove(match);
            if (match.cellParent.matches().length === 0) {
                this._cellMatches.delete(match.cellParent.id);
            }
            if (this.isMatchSelected(match)) {
                this.setSelectedMatch(null);
                this._findMatchDecorationModel?.clearCurrentFindMatchDecoration();
            }
            else {
                this.updateHighlights();
            }
            this.setNotebookFindMatchDecorationsUsingCellMatches(this.cellMatches());
        }
        else {
            super.removeMatch(match);
        }
    }
    cellMatches() {
        return Array.from(this._cellMatches.values());
    }
    createMatches() {
        const model = this.modelService.getModel(this._resource);
        if (model) {
            // todo: handle better when ai contributed results has model, currently, createMatches does not work for this
            this.bindModel(model);
            this.updateMatchesForModel();
        }
        else {
            const notebookEditorWidgetBorrow = this.notebookEditorService.retrieveExistingWidgetFromURI(this.resource);
            if (notebookEditorWidgetBorrow?.value) {
                this.bindNotebookEditorWidget(notebookEditorWidgetBorrow.value);
            }
            if (this.rawMatch.results) {
                this.rawMatch.results
                    .filter(resultIsMatch)
                    .forEach(rawMatch => {
                    textSearchResultToMatches(rawMatch, this, false)
                        .forEach(m => this.add(m));
                });
            }
            if (isINotebookFileMatchWithModel(this.rawMatch) || isINotebookFileMatchNoModel(this.rawMatch)) {
                this.rawMatch.cellResults?.forEach(cell => this.addCellMatch(cell));
                this.setNotebookFindMatchDecorationsUsingCellMatches(this.cellMatches());
                this._onChange.fire({ forceUpdateModel: true });
            }
            this.addContext(this.rawMatch.results);
        }
    }
    get hasChildren() {
        return super.hasChildren || this._cellMatches.size > 0;
    }
    setSelectedMatch(match) {
        if (match) {
            if (!this.isMatchSelected(match) && isIMatchInNotebook(match)) {
                this._selectedMatch = match;
                return;
            }
            if (!this._textMatches.has(match.id())) {
                return;
            }
            if (this.isMatchSelected(match)) {
                return;
            }
        }
        this._selectedMatch = match;
        this.updateHighlights();
    }
    dispose() {
        this.unbindNotebookEditorWidget();
        super.dispose();
    }
};
NotebookCompatibleFileMatch = __decorate([
    __param(7, IModelService),
    __param(8, IReplaceService),
    __param(9, ILabelService),
    __param(10, INotebookEditorService)
], NotebookCompatibleFileMatch);
export { NotebookCompatibleFileMatch };
// text search to notebook matches
export function textSearchMatchesToNotebookMatches(textSearchMatches, cell) {
    const notebookMatches = [];
    textSearchMatches.forEach((textSearchMatch) => {
        const previewLines = textSearchMatch.previewText.split('\n');
        textSearchMatch.rangeLocations.map((rangeLocation) => {
            const previewRange = rangeLocation.preview;
            const match = new MatchInNotebook(cell, previewLines, previewRange, rangeLocation.source, textSearchMatch.webviewIndex);
            notebookMatches.push(match);
        });
    });
    return notebookMatches;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tTZWFyY2hNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL25vdGVib29rU2VhcmNoL25vdGVib29rU2VhcmNoTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRS9FLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8sRUFBa0MsYUFBYSxFQUEyRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RMLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQzlHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBR3pGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQTZCLDJCQUEyQixFQUFFLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzlILE9BQU8sRUFBRSxpQ0FBaUMsRUFBK0IsNkJBQTZC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