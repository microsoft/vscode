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
import { Emitter } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { resultIsMatch } from '../../../../services/search/common/search.js';
import { IReplaceService } from '../replace.js';
import { FileMatchImpl } from '../searchTreeModel/fileMatch.js';
import { TEXT_SEARCH_HEADING_PREFIX, AI_TEXT_SEARCH_RESULT_ID, FOLDER_MATCH_PREFIX, getFileMatches, FILE_MATCH_PREFIX } from '../searchTreeModel/searchTreeCommon.js';
import { TextSearchHeadingImpl } from '../searchTreeModel/textSearchHeading.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { textSearchResultToMatches } from '../searchTreeModel/match.js';
import { ResourceSet } from '../../../../../base/common/map.js';
let AITextSearchHeadingImpl = class AITextSearchHeadingImpl extends TextSearchHeadingImpl {
    constructor(parent, instantiationService, uriIdentityService) {
        super(false, parent, instantiationService, uriIdentityService);
        this.hidden = true;
    }
    name() {
        return 'AI';
    }
    id() {
        return TEXT_SEARCH_HEADING_PREFIX + AI_TEXT_SEARCH_RESULT_ID;
    }
    get isAIContributed() {
        return true;
    }
    get query() {
        return this._query;
    }
    set query(query) {
        this.clearQuery();
        if (!query) {
            return;
        }
        this._folderMatches = (query && query.folderQueries || [])
            .map(fq => fq.folder)
            .map((resource, index) => this._createBaseFolderMatch(resource, resource.toString(), index, query));
        this._folderMatches.forEach(fm => this._folderMatchesMap.set(fm.resource, fm));
        this._query = query;
    }
    fileCount() {
        const uniqueFileUris = new ResourceSet();
        for (const folderMatch of this.folderMatches()) {
            if (folderMatch.isEmpty()) {
                continue;
            }
            for (const fileMatch of folderMatch.allDownstreamFileMatches()) {
                uniqueFileUris.add(fileMatch.resource);
            }
        }
        return uniqueFileUris.size;
    }
    _createBaseFolderMatch(resource, id, index, query) {
        const folderMatch = this._register(this.createWorkspaceRootWithResourceImpl(resource, id, index, query));
        const disposable = folderMatch.onChange((event) => this._onChange.fire(event));
        this._register(folderMatch.onDispose(() => disposable.dispose()));
        return folderMatch;
    }
    createWorkspaceRootWithResourceImpl(resource, id, index, query) {
        return this.instantiationService.createInstance(AIFolderMatchWorkspaceRootImpl, resource, id, index, query, this);
    }
};
AITextSearchHeadingImpl = __decorate([
    __param(1, IInstantiationService),
    __param(2, IUriIdentityService)
], AITextSearchHeadingImpl);
export { AITextSearchHeadingImpl };
let AIFolderMatchWorkspaceRootImpl = class AIFolderMatchWorkspaceRootImpl extends Disposable {
    constructor(_resource, _id, _index, _query, _parent, instantiationService, labelService) {
        super();
        this._resource = _resource;
        this._index = _index;
        this._query = _query;
        this._parent = _parent;
        this.instantiationService = instantiationService;
        this._onChange = this._register(new Emitter());
        this.onChange = this._onChange.event;
        this._onDispose = this._register(new Emitter());
        this.onDispose = this._onDispose.event;
        this.latestRank = 0;
        this.replacingAll = false;
        this._fileMatches = new Map();
        this._id = FOLDER_MATCH_PREFIX + _id;
        this._name = new Lazy(() => this.resource ? labelService.getUriBasenameLabel(this.resource) : '');
        this._unDisposedFileMatches = new Map();
    }
    get resource() {
        return this._resource;
    }
    id() {
        return this._id;
    }
    index() {
        return this._index;
    }
    name() {
        return this._name.value;
    }
    count() {
        return this._fileMatches.size;
    }
    doAddFile(fileMatch) {
        this._fileMatches.set(fileMatch.id(), fileMatch);
    }
    createAndConfigureFileMatch(rawFileMatch, searchInstanceID) {
        const fileMatch = this.instantiationService.createInstance(AIFileMatch, this._query.contentPattern, this._query.previewOptions, this._query.maxResults, this, rawFileMatch, this, rawFileMatch.resource.toString() + '_' + Date.now().toString(), this.latestRank++);
        fileMatch.createMatches();
        this.doAddFile(fileMatch);
        const disposable = fileMatch.onChange(({ didRemove }) => this.onFileChange(fileMatch, didRemove));
        this._register(fileMatch.onDispose(() => disposable.dispose()));
        return fileMatch;
    }
    isAIContributed() {
        return true;
    }
    onFileChange(fileMatch, removed = false) {
        let added = false;
        if (!this._fileMatches.has(fileMatch.id())) {
            this.doAddFile(fileMatch);
            added = true;
        }
        if (fileMatch.count() === 0) {
            this.doRemoveFile([fileMatch], false, false);
            added = false;
            removed = true;
        }
        this._onChange.fire({ elements: [fileMatch], added: added, removed: removed });
    }
    get hasChildren() {
        return this._fileMatches.size > 0;
    }
    parent() {
        return this._parent;
    }
    matches() {
        return [...this._fileMatches.values()];
    }
    allDownstreamFileMatches() {
        return [...this._fileMatches.values()];
    }
    remove(matches) {
        if (!Array.isArray(matches)) {
            matches = [matches];
        }
        const allMatches = getFileMatches(matches);
        this.doRemoveFile(allMatches);
    }
    addFileMatch(raw, silent, searchInstanceID) {
        // when adding a fileMatch that has intermediate directories
        const added = [];
        const updated = [];
        raw.forEach(rawFileMatch => {
            const fileMatch = this.createAndConfigureFileMatch(rawFileMatch, searchInstanceID);
            added.push(fileMatch);
        });
        const elements = [...added, ...updated];
        if (!silent && elements.length) {
            this._onChange.fire({ elements, added: !!added.length });
        }
    }
    isEmpty() {
        return this.recursiveFileCount() === 0;
    }
    clear(clearingAll) {
        const changed = this.allDownstreamFileMatches();
        if (changed.length > 0) {
            this.disposeMatches();
            this._onChange.fire({ elements: changed, removed: true, added: false, clearingAll });
        }
    }
    get showHighlights() {
        return this._parent.showHighlights;
    }
    get searchModel() {
        return this._searchResult.searchModel;
    }
    get _searchResult() {
        return this._parent.parent();
    }
    get query() {
        return this._query;
    }
    getDownstreamFileMatch(uri) {
        for (const fileMatch of this._fileMatches.values()) {
            if (fileMatch.resource.toString() === uri.toString()) {
                return fileMatch;
            }
        }
        return null;
    }
    replaceAll() {
        throw new Error('Cannot replace in AI search');
    }
    recursiveFileCount() {
        return this._fileMatches.size;
    }
    doRemoveFile(fileMatches, dispose = true, trigger = true, keepReadonly = false) {
        const removed = [];
        for (const match of fileMatches) {
            if (this._fileMatches.get(match.id())) {
                if (keepReadonly && match.hasReadonlyMatches()) {
                    continue;
                }
                this._fileMatches.delete(match.id());
                if (dispose) {
                    match.dispose();
                }
                else {
                    this._unDisposedFileMatches.set(match.id(), match);
                }
                removed.push(match);
            }
        }
        if (trigger) {
            this._onChange.fire({ elements: removed, removed: true });
        }
    }
    replace(match) {
        throw new Error('Cannot replace in AI search');
    }
    bindModel(model) {
        // no op
    }
    unbindNotebookEditorWidget(editor, resource) {
        //no op
    }
    bindNotebookEditorWidget(editor, resource) {
        //no op
        return Promise.resolve();
    }
    hasOnlyReadOnlyMatches() {
        return Array.from(this._fileMatches.values()).every(fm => fm.hasOnlyReadOnlyMatches());
    }
    fileMatchesIterator() {
        return this._fileMatches.values();
    }
    folderMatchesIterator() {
        return [].values();
    }
    recursiveMatchCount() {
        return this._fileMatches.size;
    }
    disposeMatches() {
        [...this._fileMatches.values()].forEach((fileMatch) => fileMatch.dispose());
        [...this._unDisposedFileMatches.values()].forEach((fileMatch) => fileMatch.dispose());
        this._fileMatches.clear();
    }
    dispose() {
        this.disposeMatches();
        this._onDispose.fire();
        super.dispose();
    }
};
AIFolderMatchWorkspaceRootImpl = __decorate([
    __param(5, IInstantiationService),
    __param(6, ILabelService)
], AIFolderMatchWorkspaceRootImpl);
export { AIFolderMatchWorkspaceRootImpl };
let AIFileMatch = class AIFileMatch extends FileMatchImpl {
    constructor(_query, _previewOptions, _maxResults, _parent, rawMatch, _closestRoot, _id, rank, modelService, replaceService, labelService) {
        super({ pattern: _query }, _previewOptions, _maxResults, _parent, rawMatch, _closestRoot, modelService, replaceService, labelService);
        this._id = _id;
        this.rank = rank;
    }
    id() {
        return FILE_MATCH_PREFIX + this._id;
    }
    getFullRange() {
        let earliestStart = undefined;
        let latestEnd = undefined;
        for (const match of this.matches()) {
            const matchStart = match.range().getStartPosition();
            const matchEnd = match.range().getEndPosition();
            if (earliestStart === undefined) {
                earliestStart = matchStart;
            }
            else if (matchStart.isBefore(earliestStart)) {
                earliestStart = matchStart;
            }
            if (latestEnd === undefined) {
                latestEnd = matchEnd;
            }
            else if (!matchEnd.isBefore(latestEnd)) {
                latestEnd = matchEnd;
            }
        }
        if (earliestStart === undefined || latestEnd === undefined) {
            return undefined;
        }
        return new Range(earliestStart.lineNumber, earliestStart.column, latestEnd.lineNumber, latestEnd.column);
    }
    rangeAsString() {
        const range = this.getFullRange();
        if (!range) {
            return undefined;
        }
        return range.startLineNumber + ':' + range.startColumn + '-' + range.endLineNumber + ':' + range.endColumn;
    }
    name() {
        const range = this.rangeAsString();
        return super.name() + range ? ' ' + range : '';
    }
    createMatches() {
        if (this.rawMatch.results) {
            this.rawMatch.results
                .filter(resultIsMatch)
                .forEach(rawMatch => {
                textSearchResultToMatches(rawMatch, this, true)
                    .forEach(m => this.add(m));
            });
        }
    }
};
AIFileMatch = __decorate([
    __param(8, IModelService),
    __param(9, IReplaceService),
    __param(10, ILabelService)
], AIFileMatch);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlTZWFyY2hNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL0FJU2VhcmNoL2FpU2VhcmNoTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFJckUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNoRyxPQUFPLEVBQXVELGFBQWEsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWxJLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFFaEQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2hFLE9BQU8sRUFBaUIsMEJBQTBCLEVBQUUsd0JBQXdCLEVBQXlLLG1CQUFtQixFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVWLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUV4RSxPQUFPLEVBQUUsV0FBVyxFQUFF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