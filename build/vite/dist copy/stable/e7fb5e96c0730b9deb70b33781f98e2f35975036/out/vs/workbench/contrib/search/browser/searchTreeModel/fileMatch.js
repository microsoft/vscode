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
var FileMatchImpl_1;
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { overviewRulerFindMatchForeground, minimapFindMatch } from '../../../../../platform/theme/common/colorRegistry.js';
import { resultIsMatch, DEFAULT_MAX_SEARCH_RESULTS } from '../../../../services/search/common/search.js';
import { editorMatchesToTextSearchResults, getTextSearchMatchWithModelContext } from '../../../../services/search/common/searchHelpers.js';
import { IReplaceService } from '../replace.js';
import { FILE_MATCH_PREFIX } from './searchTreeCommon.js';
import { Emitter } from '../../../../../base/common/event.js';
import { textSearchResultToMatches } from './match.js';
import { OverviewRulerLane } from '../../../../../editor/common/standalone/standaloneEnums.js';
let FileMatchImpl = class FileMatchImpl extends Disposable {
    static { FileMatchImpl_1 = this; }
    static { this._CURRENT_FIND_MATCH = ModelDecorationOptions.register({
        description: 'search-current-find-match',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        zIndex: 13,
        className: 'currentFindMatch',
        inlineClassName: 'currentFindMatchInline',
        overviewRuler: {
            color: themeColorFromId(overviewRulerFindMatchForeground),
            position: OverviewRulerLane.Center
        },
        minimap: {
            color: themeColorFromId(minimapFindMatch),
            position: 1 /* MinimapPosition.Inline */
        }
    }); }
    static { this._FIND_MATCH = ModelDecorationOptions.register({
        description: 'search-find-match',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        className: 'findMatch',
        inlineClassName: 'findMatchInline',
        overviewRuler: {
            color: themeColorFromId(overviewRulerFindMatchForeground),
            position: OverviewRulerLane.Center
        },
        minimap: {
            color: themeColorFromId(minimapFindMatch),
            position: 1 /* MinimapPosition.Inline */
        }
    }); }
    static getDecorationOption(selected) {
        return (selected ? FileMatchImpl_1._CURRENT_FIND_MATCH : FileMatchImpl_1._FIND_MATCH);
    }
    get context() {
        return new Map(this._context);
    }
    constructor(_query, _previewOptions, _maxResults, _parent, rawMatch, _closestRoot, modelService, replaceService, labelService) {
        super();
        this._query = _query;
        this._previewOptions = _previewOptions;
        this._maxResults = _maxResults;
        this._parent = _parent;
        this.rawMatch = rawMatch;
        this._closestRoot = _closestRoot;
        this.modelService = modelService;
        this.replaceService = replaceService;
        this._onChange = this._register(new Emitter());
        this.onChange = this._onChange.event;
        this._onDispose = this._register(new Emitter());
        this.onDispose = this._onDispose.event;
        this._model = null;
        this._modelListener = null;
        this._selectedMatch = null;
        this._modelDecorations = [];
        this._context = new Map();
        this.replaceQ = Promise.resolve();
        this._resource = this.rawMatch.resource;
        this._textMatches = new Map();
        this._removedTextMatches = new Set();
        this._updateScheduler = this._register(new RunOnceScheduler(this.updateMatchesForModel.bind(this), 250));
        this._name = new Lazy(() => labelService.getUriBasenameLabel(this.resource));
    }
    get closestRoot() {
        return this._closestRoot;
    }
    hasReadonlyMatches() {
        return this.matches().some(m => m.isReadonly);
    }
    createMatches() {
        const model = this.modelService.getModel(this._resource);
        if (model) {
            // todo: handle better when ai contributed results has model, currently, createMatches does not work for this
            this.bindModel(model);
            this.updateMatchesForModel();
        }
        else {
            if (this.rawMatch.results) {
                this.rawMatch.results
                    .filter(resultIsMatch)
                    .forEach(rawMatch => {
                    textSearchResultToMatches(rawMatch, this, false)
                        .forEach(m => this.add(m));
                });
            }
        }
    }
    bindModel(model) {
        this._model = model;
        this._modelListener = new DisposableStore();
        this._modelListener.add(this._model.onDidChangeContent(() => {
            this._updateScheduler.schedule();
        }));
        this._modelListener.add(this._model.onWillDispose(() => this.onModelWillDispose()));
        this.updateHighlights();
    }
    onModelWillDispose() {
        // Update matches because model might have some dirty changes
        this.updateMatchesForModel();
        this.unbindModel();
    }
    unbindModel() {
        if (this._model) {
            this._updateScheduler.cancel();
            this._model.changeDecorations((accessor) => {
                this._modelDecorations = accessor.deltaDecorations(this._modelDecorations, []);
            });
            this._model = null;
            this._modelListener.dispose();
        }
    }
    updateMatchesForModel() {
        // this is called from a timeout and might fire
        // after the model has been disposed
        if (!this._model) {
            return;
        }
        this._textMatches = new Map();
        const wordSeparators = this._query.isWordMatch && this._query.wordSeparators ? this._query.wordSeparators : null;
        const matches = this._model
            .findMatches(this._query.pattern, this._model.getFullModelRange(), !!this._query.isRegExp, !!this._query.isCaseSensitive, wordSeparators, false, this._maxResults ?? DEFAULT_MAX_SEARCH_RESULTS);
        this.updateMatches(matches, true, this._model, false);
    }
    async updatesMatchesForLineAfterReplace(lineNumber, modelChange) {
        if (!this._model) {
            return;
        }
        const range = {
            startLineNumber: lineNumber,
            startColumn: this._model.getLineMinColumn(lineNumber),
            endLineNumber: lineNumber,
            endColumn: this._model.getLineMaxColumn(lineNumber)
        };
        const oldMatches = Array.from(this._textMatches.values()).filter(match => match.range().startLineNumber === lineNumber);
        oldMatches.forEach(match => this._textMatches.delete(match.id()));
        const wordSeparators = this._query.isWordMatch && this._query.wordSeparators ? this._query.wordSeparators : null;
        const matches = this._model.findMatches(this._query.pattern, range, !!this._query.isRegExp, !!this._query.isCaseSensitive, wordSeparators, false, this._maxResults ?? DEFAULT_MAX_SEARCH_RESULTS);
        this.updateMatches(matches, modelChange, this._model, false);
    }
    updateMatches(matches, modelChange, model, isAiContributed) {
        const textSearchResults = editorMatchesToTextSearchResults(matches, model, this._previewOptions);
        textSearchResults.forEach(textSearchResult => {
            textSearchResultToMatches(textSearchResult, this, isAiContributed).forEach(match => {
                if (!this._removedTextMatches.has(match.id())) {
                    this.add(match);
                    if (this.isMatchSelected(match)) {
                        this._selectedMatch = match;
                    }
                }
            });
        });
        this.addContext(getTextSearchMatchWithModelContext(textSearchResults, model, this.parent().parent().query));
        this._onChange.fire({ forceUpdateModel: modelChange });
        this.updateHighlights();
    }
    updateHighlights() {
        if (!this._model) {
            return;
        }
        this._model.changeDecorations((accessor) => {
            const newDecorations = (this.parent().showHighlights
                ? this.matches().map((match) => ({
                    range: match.range(),
                    options: FileMatchImpl_1.getDecorationOption(this.isMatchSelected(match))
                }))
                : []);
            this._modelDecorations = accessor.deltaDecorations(this._modelDecorations, newDecorations);
        });
    }
    id() {
        return FILE_MATCH_PREFIX + this.resource.toString();
    }
    parent() {
        return this._parent;
    }
    get hasChildren() {
        return this._textMatches.size > 0;
    }
    matches() {
        return [...this._textMatches.values()];
    }
    textMatches() {
        return Array.from(this._textMatches.values());
    }
    remove(matches) {
        if (!Array.isArray(matches)) {
            matches = [matches];
        }
        for (const match of matches) {
            this.removeMatch(match);
            this._removedTextMatches.add(match.id());
        }
        this._onChange.fire({ didRemove: true });
    }
    async replace(toReplace) {
        return this.replaceQ = this.replaceQ.finally(async () => {
            await this.replaceService.replace(toReplace);
            await this.updatesMatchesForLineAfterReplace(toReplace.range().startLineNumber, false);
        });
    }
    setSelectedMatch(match) {
        if (match) {
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
    getSelectedMatch() {
        return this._selectedMatch;
    }
    isMatchSelected(match) {
        return !!this._selectedMatch && this._selectedMatch.id() === match.id();
    }
    count() {
        return this.matches().length;
    }
    get resource() {
        return this._resource;
    }
    name() {
        return this._name.value;
    }
    addContext(results) {
        if (!results) {
            return;
        }
        const contexts = results
            .filter((result => !resultIsMatch(result)));
        return contexts.forEach(context => this._context.set(context.lineNumber, context.text));
    }
    add(match, trigger) {
        this._textMatches.set(match.id(), match);
        if (trigger) {
            this._onChange.fire({ forceUpdateModel: true });
        }
    }
    removeMatch(match) {
        this._textMatches.delete(match.id());
        if (this.isMatchSelected(match)) {
            this.setSelectedMatch(null);
            this._findMatchDecorationModel?.clearCurrentFindMatchDecoration();
        }
        else {
            this.updateHighlights();
        }
    }
    async resolveFileStat(fileService) {
        this._fileStat = await fileService.stat(this.resource).catch(() => undefined);
    }
    get fileStat() {
        return this._fileStat;
    }
    set fileStat(stat) {
        this._fileStat = stat;
    }
    dispose() {
        this.setSelectedMatch(null);
        this.unbindModel();
        this._onDispose.fire();
        super.dispose();
    }
    hasOnlyReadOnlyMatches() {
        return this.matches().every(match => match.isReadonly);
    }
};
FileMatchImpl = FileMatchImpl_1 = __decorate([
    __param(6, IModelService),
    __param(7, IReplaceService),
    __param(8, ILabelService)
], FileMatchImpl);
export { FileMatchImpl };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZU1hdGNoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2Jyb3dzZXIvc2VhcmNoVHJlZU1vZGVsL2ZpbGVNYXRjaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHM0UsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDekYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRS9FLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMzSCxPQUFPLEVBQXVELGFBQWEsRUFBRSwwQkFBMEIsRUFBeUMsTUFBTSw4Q0FBOEMsQ0FBQztBQUNyTSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUUzSSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ2hELE9BQU8sRUFBRSxpQkFBaUIsRUFBdUcsTUFBTSx1QkFBdUIsQ0FBQztBQUMvSixPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRXhGLElBQU0sYUFBYSxHQUFuQixNQUFNLGFBQWMsU0FBUSxVQUFVOzthQUVwQix3QkFBbUIsR0FBRyxzQkFBc0IsQ0FBQyxRQUFRLENBQUM7UUFDN0UsV0FBVyxFQUFFLDJCQUEyQjtRQUN4QyxVQUFVLDREQUFvRDtRQUM5RCxNQUFNLEVBQUUsRUFBRTtRQUNWLFNBQVMsRUFBRSxrQkFBa0I7UUFDN0IsZUFBZSxFQUFFLHdCQUF3QjtRQUN6QyxhQUFhLEVBQUU7WUFDZCxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsZ0NBQWdDLENBQUM7WUFDekQsUUFBUSxFQUFFLGlCQUFpQixDQUFDLE1BQU07U0FDbEM7UUFDRCxPQUFPLEVBQUU7WUFDUixLQUFLLEVBQUUsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUM7WUFDekMsUUFBUSxnQ0FBd0I7U0FDaEM7S0FDRCxDQUFDLEFBZHlDLENBY3hDO2FBRXFCLGdCQUFXLEdBQUcsc0JBQXNCLENBQUMsUUFBUSxDQUFDO1FBQ3JFLFdBQVcsRUFBRSxtQkFBbUI7UUFDaEMsVUFBVSw0REFBb0Q7UUFDOUQsU0FBUyxFQUFFLFdBQVc7UUFDdEIsZUFBZSxFQUFFLGlCQUFpQjtRQUNsQyxhQUFhLEVBQUU7WUFDZCxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsZ0NBQWdDLENBQUM7WUFDekQsUUFBUSxFQUFFLGlCQUFpQixDQUFDLE1BQU07U0FDbEM7UUFDRCxPQUFPLEVBQUU7WUFDUixLQUFLLEVBQUUsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUM7WUFDekMsUUFBUSxnQ0FBd0I7U0FDaEM7S0FDRCxDQUFDLEFBYmlDLENBYWhDO0lBRUssTUFBTSxDQUFDLG1CQUFtQixDQUFDLFFBQWlCO1FBQ25ELE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLGVBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsZUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUF5QkQsSUFBVyxPQUFPO1FBQ2pCLE9BQU8sSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFDRCxZQUNXLE1BQW9CLEVBQ3RCLGVBQXNELEVBQ3RELFdBQStCLEVBQy9CLE9BQStCLEVBQzdCLFFBQW9CLEVBQ3RCLFlBQXdELEVBQ2pELFlBQThDLEVBQzVDLGNBQWdELEVBQ2xELFlBQTJCO1FBRTFDLEtBQUssRUFBRSxDQUFDO1FBVkUsV0FBTSxHQUFOLE1BQU0sQ0FBYztRQUN0QixvQkFBZSxHQUFmLGVBQWUsQ0FBdUM7UUFDdEQsZ0JBQVcsR0FBWCxXQUFXLENBQW9CO1FBQy9CLFlBQU8sR0FBUCxPQUFPLENBQXdCO1FBQzdCLGFBQVEsR0FBUixRQUFRLENBQVk7UUFDdEIsaUJBQVksR0FBWixZQUFZLENBQTRDO1FBQzlCLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBQzNCLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQWhDeEQsY0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXVELENBQUMsQ0FBQztRQUNoRyxhQUFRLEdBQStELElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDO1FBRTdGLGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNoRCxjQUFTLEdBQWdCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBSWhELFdBQU0sR0FBc0IsSUFBSSxDQUFDO1FBQ2pDLG1CQUFjLEdBQTJCLElBQUksQ0FBQztRQUk1QyxtQkFBYyxHQUE0QixJQUFJLENBQUM7UUFJakQsc0JBQWlCLEdBQWEsRUFBRSxDQUFDO1FBRWpDLGFBQVEsR0FBd0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQXlMMUMsYUFBUSxHQUFHLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQXhLcEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztRQUN4QyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksR0FBRyxFQUE0QixDQUFDO1FBQ3hELElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQzdDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZ0JBQWdCLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3pHLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFHRCxJQUFJLFdBQVc7UUFDZCxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDMUIsQ0FBQztJQUVELGtCQUFrQjtRQUNqQixPQUFPLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELGFBQWE7UUFDWixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDekQsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLDZHQUE2RztZQUM3RyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3RCLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzlCLENBQUM7YUFBTSxDQUFDO1lBRVAsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUMzQixJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU87cUJBQ25CLE1BQU0sQ0FBQyxhQUFhLENBQUM7cUJBQ3JCLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRTtvQkFDbkIseUJBQXlCLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUM7eUJBQzlDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0IsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFDRCxTQUFTLENBQUMsS0FBaUI7UUFDMUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzVDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFO1lBQzNELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFTyxrQkFBa0I7UUFDekIsNkRBQTZEO1FBQzdELElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzdCLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNwQixDQUFDO0lBRU8sV0FBVztRQUNsQixJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFO2dCQUMxQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNoRixDQUFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1lBQ25CLElBQUksQ0FBQyxjQUFlLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDaEMsQ0FBQztJQUNGLENBQUM7SUFFUyxxQkFBcUI7UUFDOUIsK0NBQStDO1FBQy9DLG9DQUFvQztRQUNwQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xCLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBNEIsQ0FBQztRQUV4RCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUNqSCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTTthQUN6QixXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxJQUFJLDBCQUEwQixDQUFDLENBQUM7UUFFbE0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUlTLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxVQUFrQixFQUFFLFdBQW9CO1FBQ3pGLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbEIsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRztZQUNiLGVBQWUsRUFBRSxVQUFVO1lBQzNCLFdBQVcsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQztZQUNyRCxhQUFhLEVBQUUsVUFBVTtZQUN6QixTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUM7U0FDbkQsQ0FBQztRQUNGLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxlQUFlLEtBQUssVUFBVSxDQUFDLENBQUM7UUFDeEgsVUFBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbEUsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDakgsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxJQUFJLDBCQUEwQixDQUFDLENBQUM7UUFDbE0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUlPLGFBQWEsQ0FBQyxPQUFvQixFQUFFLFdBQW9CLEVBQUUsS0FBaUIsRUFBRSxlQUF3QjtRQUM1RyxNQUFNLGlCQUFpQixHQUFHLGdDQUFnQyxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2pHLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFO1lBQzVDLHlCQUF5QixDQUFDLGdCQUFnQixFQUFFLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQ2xGLElBQUksQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7b0JBQy9DLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ2hCLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO3dCQUNqQyxJQUFJLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQztvQkFDN0IsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLENBQUMsa0NBQWtDLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFNLENBQUMsQ0FBQyxDQUFDO1FBRTdHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUN6QixDQUFDO0lBRUQsZ0JBQWdCO1FBQ2YsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNsQixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUMxQyxNQUFNLGNBQWMsR0FBRyxDQUN0QixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsY0FBYztnQkFDM0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQXlCLEVBQUUsQ0FBQyxDQUFDO29CQUN2RCxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssRUFBRTtvQkFDcEIsT0FBTyxFQUFFLGVBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO2lCQUN2RSxDQUFDLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLEVBQUUsQ0FDTCxDQUFDO1lBQ0YsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDNUYsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsRUFBRTtRQUNELE9BQU8saUJBQWlCLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNyRCxDQUFDO0lBRUQsTUFBTTtRQUNMLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUNyQixDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ2QsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELE9BQU87UUFDTixPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELFdBQVc7UUFDVixPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRCxNQUFNLENBQUMsT0FBOEM7UUFDcEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM3QixPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyQixDQUFDO1FBRUQsS0FBSyxNQUFNLEtBQUssSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3hCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUVELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUdELEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBMkI7UUFDeEMsT0FBTyxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ3ZELE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDN0MsTUFBTSxJQUFJLENBQUMsaUNBQWlDLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDLGVBQWUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4RixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxLQUE4QjtRQUM5QyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBRVgsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hDLE9BQU87WUFDUixDQUFDO1lBQ0QsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pDLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzVCLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxnQkFBZ0I7UUFDZixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUM7SUFDNUIsQ0FBQztJQUVELGVBQWUsQ0FBQyxLQUF1QjtRQUN0QyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsRUFBRSxFQUFFLEtBQUssS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDO0lBQ3pFLENBQUM7SUFFRCxLQUFLO1FBQ0osT0FBTyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDO0lBQzlCLENBQUM7SUFFRCxJQUFJLFFBQVE7UUFDWCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDdkIsQ0FBQztJQUVELElBQUk7UUFDSCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQ3pCLENBQUM7SUFFRCxVQUFVLENBQUMsT0FBd0M7UUFDbEQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQUMsT0FBTztRQUFDLENBQUM7UUFFekIsTUFBTSxRQUFRLEdBQUcsT0FBTzthQUN0QixNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUNqQixDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBMEMsQ0FBQyxDQUFDO1FBRXBFLE9BQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUVELEdBQUcsQ0FBQyxLQUF1QixFQUFFLE9BQWlCO1FBQzdDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELENBQUM7SUFDRixDQUFDO0lBRVMsV0FBVyxDQUFDLEtBQXVCO1FBQzVDLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QixJQUFJLENBQUMseUJBQXlCLEVBQUUsK0JBQStCLEVBQUUsQ0FBQztRQUNuRSxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3pCLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLGVBQWUsQ0FBQyxXQUF5QjtRQUM5QyxJQUFJLENBQUMsU0FBUyxHQUFHLE1BQU0sV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFRCxJQUFXLFFBQVE7UUFDbEIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxJQUFXLFFBQVEsQ0FBQyxJQUE4QztRQUNqRSxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztJQUN2QixDQUFDO0lBRVEsT0FBTztRQUNmLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN2QixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVELHNCQUFzQjtRQUNyQixPQUFPLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDeEQsQ0FBQzs7QUE5VVcsYUFBYTtJQXNFdkIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsYUFBYSxDQUFBO0dBeEVILGFBQWEsQ0FtVnpCIn0=