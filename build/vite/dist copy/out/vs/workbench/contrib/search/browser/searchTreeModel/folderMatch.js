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
var FolderMatchImpl_1;
import { Emitter } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { TernarySearchTree } from '../../../../../base/common/ternarySearchTree.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IReplaceService } from './../replace.js';
import { resultIsMatch } from '../../../../services/search/common/search.js';
import { isSearchTreeFolderMatchWorkspaceRoot, isSearchTreeFolderMatchNoRoot, FOLDER_MATCH_PREFIX, getFileMatches } from './searchTreeCommon.js';
import { isINotebookFileMatchNoModel } from '../../common/searchNotebookHelpers.js';
import { NotebookCompatibleFileMatch } from '../notebookSearch/notebookSearchModel.js';
import { isINotebookFileMatchWithModel, getIDFromINotebookCellMatch } from '../notebookSearch/searchNotebookHelpers.js';
import { isNotebookFileMatch } from '../notebookSearch/notebookSearchModelBase.js';
import { textSearchResultToMatches } from './match.js';
let FolderMatchImpl = FolderMatchImpl_1 = class FolderMatchImpl extends Disposable {
    constructor(_resource, _id, _index, _query, _parent, _searchResult, _closestRoot, replaceService, instantiationService, labelService, uriIdentityService) {
        super();
        this._resource = _resource;
        this._index = _index;
        this._query = _query;
        this._parent = _parent;
        this._searchResult = _searchResult;
        this._closestRoot = _closestRoot;
        this.replaceService = replaceService;
        this.instantiationService = instantiationService;
        this.uriIdentityService = uriIdentityService;
        this._onChange = this._register(new Emitter());
        this.onChange = this._onChange.event;
        this._onDispose = this._register(new Emitter());
        this.onDispose = this._onDispose.event;
        this._replacingAll = false;
        this._fileMatches = new ResourceMap();
        this._folderMatches = new ResourceMap();
        this._folderMatchesMap = TernarySearchTree.forUris(key => this.uriIdentityService.extUri.ignorePathCasing(key));
        this._unDisposedFileMatches = new ResourceMap();
        this._unDisposedFolderMatches = new ResourceMap();
        this._name = new Lazy(() => this.resource ? labelService.getUriBasenameLabel(this.resource) : '');
        this._id = FOLDER_MATCH_PREFIX + _id;
    }
    get searchModel() {
        return this._searchResult.searchModel;
    }
    get showHighlights() {
        return this._parent.showHighlights;
    }
    get closestRoot() {
        return this._closestRoot;
    }
    set replacingAll(b) {
        this._replacingAll = b;
    }
    id() {
        return this._id;
    }
    get resource() {
        return this._resource;
    }
    index() {
        return this._index;
    }
    name() {
        return this._name.value;
    }
    parent() {
        return this._parent;
    }
    isAIContributed() {
        return false;
    }
    get hasChildren() {
        return this._fileMatches.size > 0 || this._folderMatches.size > 0;
    }
    bindModel(model) {
        const fileMatch = this._fileMatches.get(model.uri);
        if (fileMatch) {
            fileMatch.bindModel(model);
        }
        else {
            const folderMatch = this.getFolderMatch(model.uri);
            const match = folderMatch?.getDownstreamFileMatch(model.uri);
            match?.bindModel(model);
        }
    }
    createIntermediateFolderMatch(resource, id, index, query, baseWorkspaceFolder) {
        const folderMatch = this._register(this.instantiationService.createInstance(FolderMatchWithResourceImpl, resource, id, index, query, this, this._searchResult, baseWorkspaceFolder));
        this.configureIntermediateMatch(folderMatch);
        this.doAddFolder(folderMatch);
        return folderMatch;
    }
    configureIntermediateMatch(folderMatch) {
        const disposable = folderMatch.onChange((event) => this.onFolderChange(folderMatch, event));
        this._register(folderMatch.onDispose(() => disposable.dispose()));
    }
    clear(clearingAll = false) {
        const changed = this.allDownstreamFileMatches();
        this.disposeMatches();
        this._onChange.fire({ elements: changed, removed: true, added: false, clearingAll });
    }
    remove(matches) {
        if (!Array.isArray(matches)) {
            matches = [matches];
        }
        const allMatches = getFileMatches(matches);
        this.doRemoveFile(allMatches);
    }
    async replace(match) {
        return this.replaceService.replace([match]).then(() => {
            this.doRemoveFile([match], true, true, true);
        });
    }
    replaceAll() {
        const matches = this.matches();
        return this.batchReplace(matches);
    }
    matches() {
        return [...this.fileMatchesIterator(), ...this.folderMatchesIterator()];
    }
    fileMatchesIterator() {
        return this._fileMatches.values();
    }
    folderMatchesIterator() {
        return this._folderMatches.values();
    }
    isEmpty() {
        return (this.fileCount() + this.folderCount()) === 0;
    }
    getDownstreamFileMatch(uri) {
        const directChildFileMatch = this._fileMatches.get(uri);
        if (directChildFileMatch) {
            return directChildFileMatch;
        }
        const folderMatch = this.getFolderMatch(uri);
        const match = folderMatch?.getDownstreamFileMatch(uri);
        if (match) {
            return match;
        }
        return null;
    }
    allDownstreamFileMatches() {
        let recursiveChildren = [];
        const iterator = this.folderMatchesIterator();
        for (const elem of iterator) {
            recursiveChildren = recursiveChildren.concat(elem.allDownstreamFileMatches());
        }
        return [...this.fileMatchesIterator(), ...recursiveChildren];
    }
    fileCount() {
        return this._fileMatches.size;
    }
    folderCount() {
        return this._folderMatches.size;
    }
    count() {
        return this.fileCount() + this.folderCount();
    }
    recursiveFileCount() {
        return this.allDownstreamFileMatches().length;
    }
    recursiveMatchCount() {
        return this.allDownstreamFileMatches().reduce((prev, match) => prev + match.count(), 0);
    }
    get query() {
        return this._query;
    }
    doAddFile(fileMatch) {
        this._fileMatches.set(fileMatch.resource, fileMatch);
        this._unDisposedFileMatches.delete(fileMatch.resource);
    }
    hasOnlyReadOnlyMatches() {
        return Array.from(this._fileMatches.values()).every(fm => fm.hasOnlyReadOnlyMatches());
    }
    uriHasParent(parent, child) {
        return this.uriIdentityService.extUri.isEqualOrParent(child, parent) && !this.uriIdentityService.extUri.isEqual(child, parent);
    }
    isInParentChain(folderMatch) {
        let matchItem = this;
        while (matchItem instanceof FolderMatchImpl_1) {
            if (matchItem.id() === folderMatch.id()) {
                return true;
            }
            matchItem = matchItem.parent();
        }
        return false;
    }
    getFolderMatch(resource) {
        const folderMatch = this._folderMatchesMap.findSubstr(resource);
        return folderMatch;
    }
    doAddFolder(folderMatch) {
        if (this.resource && !this.uriHasParent(this.resource, folderMatch.resource)) {
            throw Error(`${folderMatch.resource} does not belong as a child of ${this.resource}`);
        }
        else if (this.isInParentChain(folderMatch)) {
            throw Error(`${folderMatch.resource} is a parent of ${this.resource}`);
        }
        this._folderMatches.set(folderMatch.resource, folderMatch);
        this._folderMatchesMap.set(folderMatch.resource, folderMatch);
        this._unDisposedFolderMatches.delete(folderMatch.resource);
    }
    async batchReplace(matches) {
        const allMatches = getFileMatches(matches);
        await this.replaceService.replace(allMatches);
        this.doRemoveFile(allMatches, true, true, true);
    }
    onFileChange(fileMatch, removed = false) {
        let added = false;
        if (!this._fileMatches.has(fileMatch.resource)) {
            this.doAddFile(fileMatch);
            added = true;
        }
        if (fileMatch.count() === 0) {
            this.doRemoveFile([fileMatch], false, false);
            added = false;
            removed = true;
        }
        if (!this._replacingAll) {
            this._onChange.fire({ elements: [fileMatch], added: added, removed: removed });
        }
    }
    onFolderChange(folderMatch, event) {
        if (!this._folderMatches.has(folderMatch.resource)) {
            this.doAddFolder(folderMatch);
        }
        if (folderMatch.isEmpty()) {
            this._folderMatches.delete(folderMatch.resource);
            folderMatch.dispose();
        }
        this._onChange.fire(event);
    }
    doRemoveFile(fileMatches, dispose = true, trigger = true, keepReadonly = false) {
        const removed = [];
        for (const match of fileMatches) {
            if (this._fileMatches.get(match.resource)) {
                if (keepReadonly && match.hasReadonlyMatches()) {
                    continue;
                }
                this._fileMatches.delete(match.resource);
                if (dispose) {
                    match.dispose();
                }
                else {
                    this._unDisposedFileMatches.set(match.resource, match);
                }
                removed.push(match);
            }
            else {
                const folder = this.getFolderMatch(match.resource);
                if (folder) {
                    folder.doRemoveFile([match], dispose, trigger);
                }
                else {
                    throw Error(`FileMatch ${match.resource} is not located within FolderMatch ${this.resource}`);
                }
            }
        }
        if (trigger) {
            this._onChange.fire({ elements: removed, removed: true });
        }
    }
    async bindNotebookEditorWidget(editor, resource) {
        const fileMatch = this._fileMatches.get(resource);
        if (isNotebookFileMatch(fileMatch)) {
            if (fileMatch) {
                fileMatch.bindNotebookEditorWidget(editor);
                await fileMatch.updateMatchesForEditorWidget();
            }
            else {
                const folderMatches = this.folderMatchesIterator();
                for (const elem of folderMatches) {
                    await elem.bindNotebookEditorWidget(editor, resource);
                }
            }
        }
    }
    addFileMatch(raw, silent, searchInstanceID) {
        // when adding a fileMatch that has intermediate directories
        const added = [];
        const updated = [];
        raw.forEach(rawFileMatch => {
            const existingFileMatch = this.getDownstreamFileMatch(rawFileMatch.resource);
            if (existingFileMatch) {
                if (rawFileMatch.results) {
                    rawFileMatch
                        .results
                        .filter(resultIsMatch)
                        .forEach(m => {
                        textSearchResultToMatches(m, existingFileMatch, false)
                            .forEach(m => existingFileMatch.add(m));
                    });
                }
                // add cell matches
                if (isINotebookFileMatchWithModel(rawFileMatch) || isINotebookFileMatchNoModel(rawFileMatch)) {
                    rawFileMatch.cellResults?.forEach(rawCellMatch => {
                        if (isNotebookFileMatch(existingFileMatch)) {
                            const existingCellMatch = existingFileMatch.getCellMatch(getIDFromINotebookCellMatch(rawCellMatch));
                            if (existingCellMatch) {
                                existingCellMatch.addContentMatches(rawCellMatch.contentResults);
                                existingCellMatch.addWebviewMatches(rawCellMatch.webviewResults);
                            }
                            else {
                                existingFileMatch.addCellMatch(rawCellMatch);
                            }
                        }
                    });
                }
                updated.push(existingFileMatch);
                if (rawFileMatch.results && rawFileMatch.results.length > 0) {
                    existingFileMatch.addContext(rawFileMatch.results);
                }
            }
            else {
                if (isSearchTreeFolderMatchWorkspaceRoot(this) || isSearchTreeFolderMatchNoRoot(this)) {
                    const fileMatch = this.createAndConfigureFileMatch(rawFileMatch, searchInstanceID);
                    added.push(fileMatch);
                }
            }
        });
        const elements = [...added, ...updated];
        if (!silent && elements.length) {
            this._onChange.fire({ elements, added: !!added.length });
        }
    }
    unbindNotebookEditorWidget(editor, resource) {
        const fileMatch = this._fileMatches.get(resource);
        if (isNotebookFileMatch(fileMatch)) {
            if (fileMatch) {
                fileMatch.unbindNotebookEditorWidget(editor);
            }
            else {
                const folderMatches = this.folderMatchesIterator();
                for (const elem of folderMatches) {
                    elem.unbindNotebookEditorWidget(editor, resource);
                }
            }
        }
    }
    disposeMatches() {
        [...this._fileMatches.values()].forEach((fileMatch) => fileMatch.dispose());
        [...this._folderMatches.values()].forEach((folderMatch) => folderMatch.disposeMatches());
        [...this._unDisposedFileMatches.values()].forEach((fileMatch) => fileMatch.dispose());
        [...this._unDisposedFolderMatches.values()].forEach((folderMatch) => folderMatch.disposeMatches());
        this._fileMatches.clear();
        this._folderMatches.clear();
        this._unDisposedFileMatches.clear();
        this._unDisposedFolderMatches.clear();
    }
    dispose() {
        this.disposeMatches();
        this._onDispose.fire();
        super.dispose();
    }
};
FolderMatchImpl = FolderMatchImpl_1 = __decorate([
    __param(7, IReplaceService),
    __param(8, IInstantiationService),
    __param(9, ILabelService),
    __param(10, IUriIdentityService)
], FolderMatchImpl);
export { FolderMatchImpl };
let FolderMatchWithResourceImpl = class FolderMatchWithResourceImpl extends FolderMatchImpl {
    constructor(_resource, _id, _index, _query, _parent, _searchResult, _closestRoot, replaceService, instantiationService, labelService, uriIdentityService) {
        super(_resource, _id, _index, _query, _parent, _searchResult, _closestRoot, replaceService, instantiationService, labelService, uriIdentityService);
        this._normalizedResource = new Lazy(() => this.uriIdentityService.extUri.removeTrailingPathSeparator(this.uriIdentityService.extUri.normalizePath(this.resource)));
    }
    get resource() {
        return this._resource;
    }
    get normalizedResource() {
        return this._normalizedResource.value;
    }
};
FolderMatchWithResourceImpl = __decorate([
    __param(7, IReplaceService),
    __param(8, IInstantiationService),
    __param(9, ILabelService),
    __param(10, IUriIdentityService)
], FolderMatchWithResourceImpl);
export { FolderMatchWithResourceImpl };
/**
 * FolderMatchWorkspaceRoot => folder for workspace root
 */
let FolderMatchWorkspaceRootImpl = class FolderMatchWorkspaceRootImpl extends FolderMatchWithResourceImpl {
    constructor(_resource, _id, _index, _query, _parent, replaceService, instantiationService, labelService, uriIdentityService) {
        super(_resource, _id, _index, _query, _parent, _parent.parent(), null, replaceService, instantiationService, labelService, uriIdentityService);
    }
    normalizedUriParent(uri) {
        return this.uriIdentityService.extUri.normalizePath(this.uriIdentityService.extUri.dirname(uri));
    }
    uriEquals(uri1, ur2) {
        return this.uriIdentityService.extUri.isEqual(uri1, ur2);
    }
    createFileMatch(query, previewOptions, maxResults, parent, rawFileMatch, closestRoot, searchInstanceID) {
        // TODO: can probably just create FileMatchImpl if we don't expect cell results from the file.
        const fileMatch = this.instantiationService.createInstance(NotebookCompatibleFileMatch, query, previewOptions, maxResults, parent, rawFileMatch, closestRoot, searchInstanceID);
        fileMatch.createMatches();
        parent.doAddFile(fileMatch);
        const disposable = fileMatch.onChange(({ didRemove }) => parent.onFileChange(fileMatch, didRemove));
        this._register(fileMatch.onDispose(() => disposable.dispose()));
        return fileMatch;
    }
    createAndConfigureFileMatch(rawFileMatch, searchInstanceID) {
        if (!this.uriHasParent(this.resource, rawFileMatch.resource)) {
            throw Error(`${rawFileMatch.resource} is not a descendant of ${this.resource}`);
        }
        const fileMatchParentParts = [];
        let uri = this.normalizedUriParent(rawFileMatch.resource);
        while (!this.uriEquals(this.normalizedResource, uri)) {
            fileMatchParentParts.unshift(uri);
            const prevUri = uri;
            uri = this.uriIdentityService.extUri.removeTrailingPathSeparator(this.normalizedUriParent(uri));
            if (this.uriEquals(prevUri, uri)) {
                throw Error(`${rawFileMatch.resource} is not correctly configured as a child of ${this.normalizedResource}`);
            }
        }
        const root = this.closestRoot ?? this;
        let parent = this;
        for (let i = 0; i < fileMatchParentParts.length; i++) {
            let folderMatch = parent.getFolderMatch(fileMatchParentParts[i]);
            if (!folderMatch) {
                folderMatch = parent.createIntermediateFolderMatch(fileMatchParentParts[i], fileMatchParentParts[i].toString(), -1, this._query, root);
            }
            parent = folderMatch;
        }
        const contentPatternToUse = typeof (this._query.contentPattern) === 'string' ? { pattern: this._query.contentPattern } : this._query.contentPattern;
        return this.createFileMatch(contentPatternToUse, this._query.previewOptions, this._query.maxResults, parent, rawFileMatch, root, searchInstanceID);
    }
};
FolderMatchWorkspaceRootImpl = __decorate([
    __param(5, IReplaceService),
    __param(6, IInstantiationService),
    __param(7, ILabelService),
    __param(8, IUriIdentityService)
], FolderMatchWorkspaceRootImpl);
export { FolderMatchWorkspaceRootImpl };
// currently, no support for AI results in out-of-workspace files
let FolderMatchNoRootImpl = class FolderMatchNoRootImpl extends FolderMatchImpl {
    constructor(_id, _index, _query, _parent, replaceService, instantiationService, labelService, uriIdentityService) {
        super(null, _id, _index, _query, _parent, _parent.parent(), null, replaceService, instantiationService, labelService, uriIdentityService);
    }
    createAndConfigureFileMatch(rawFileMatch, searchInstanceID) {
        const contentPatternToUse = typeof (this._query.contentPattern) === 'string' ? { pattern: this._query.contentPattern } : this._query.contentPattern;
        // TODO: can probably just create FileMatchImpl if we don't expect cell results from the file.
        const fileMatch = this._register(this.instantiationService.createInstance(NotebookCompatibleFileMatch, contentPatternToUse, this._query.previewOptions, this._query.maxResults, this, rawFileMatch, null, searchInstanceID));
        fileMatch.createMatches();
        this.doAddFile(fileMatch);
        const disposable = fileMatch.onChange(({ didRemove }) => this.onFileChange(fileMatch, didRemove));
        this._register(fileMatch.onDispose(() => disposable.dispose()));
        return fileMatch;
    }
};
FolderMatchNoRootImpl = __decorate([
    __param(4, IReplaceService),
    __param(5, IInstantiationService),
    __param(6, ILabelService),
    __param(7, IUriIdentityService)
], FolderMatchNoRootImpl);
export { FolderMatchNoRootImpl };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGVyTWF0Y2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvZm9sZGVyTWF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUdwRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDOUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2xELE9BQU8sRUFBbUUsYUFBYSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFHOUksT0FBTyxFQUFrTSxvQ0FBb0MsRUFBc0IsNkJBQTZCLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFclcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDcEYsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdkYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDJCQUEyQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbkYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRWhELElBQU0sZUFBZSx1QkFBckIsTUFBTSxlQUFnQixTQUFRLFVBQVU7SUFpQjlDLFlBQ1csU0FBcUIsRUFDL0IsR0FBVyxFQUNELE1BQWMsRUFDZCxNQUFrQixFQUNwQixPQUE2QyxFQUM3QyxhQUE0QixFQUM1QixZQUF3RCxFQUMvQyxjQUFnRCxFQUMxQyxvQkFBOEQsRUFDdEUsWUFBMkIsRUFDckIsa0JBQTBEO1FBRS9FLEtBQUssRUFBRSxDQUFDO1FBWkUsY0FBUyxHQUFULFNBQVMsQ0FBWTtRQUVyQixXQUFNLEdBQU4sTUFBTSxDQUFRO1FBQ2QsV0FBTSxHQUFOLE1BQU0sQ0FBWTtRQUNwQixZQUFPLEdBQVAsT0FBTyxDQUFzQztRQUM3QyxrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUM1QixpQkFBWSxHQUFaLFlBQVksQ0FBNEM7UUFDOUIsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQ3ZCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFFN0MsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtRQTFCdEUsY0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWdCLENBQUMsQ0FBQztRQUN6RCxhQUFRLEdBQXdCLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDO1FBRXRELGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNoRCxjQUFTLEdBQWdCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBT2hELGtCQUFhLEdBQVksS0FBSyxDQUFDO1FBa0J0QyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksV0FBVyxFQUF3QixDQUFDO1FBQzVELElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxXQUFXLEVBQStCLENBQUM7UUFDckUsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGlCQUFpQixDQUFDLE9BQU8sQ0FBOEIsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDN0ksSUFBSSxDQUFDLHNCQUFzQixHQUFHLElBQUksV0FBVyxFQUF3QixDQUFDO1FBQ3RFLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLFdBQVcsRUFBK0IsQ0FBQztRQUMvRSxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2xHLElBQUksQ0FBQyxHQUFHLEdBQUcsbUJBQW1CLEdBQUcsR0FBRyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxJQUFJLFdBQVc7UUFDZCxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxJQUFJLGNBQWM7UUFDakIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQztJQUNwQyxDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ2QsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDO0lBQzFCLENBQUM7SUFFRCxJQUFJLFlBQVksQ0FBQyxDQUFVO1FBQzFCLElBQUksQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFFRCxFQUFFO1FBQ0QsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxJQUFJLFFBQVE7UUFDWCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDdkIsQ0FBQztJQUVELEtBQUs7UUFDSixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUVELElBQUk7UUFDSCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQ3pCLENBQUM7SUFFRCxNQUFNO1FBQ0wsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxlQUFlO1FBQ2QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ2QsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRCxTQUFTLENBQUMsS0FBaUI7UUFDMUIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRW5ELElBQUksU0FBUyxFQUFFLENBQUM7WUFDZixTQUFTLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVCLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkQsTUFBTSxLQUFLLEdBQUcsV0FBVyxFQUFFLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM3RCxLQUFLLEVBQUUsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pCLENBQUM7SUFDRixDQUFDO0lBRU0sNkJBQTZCLENBQUMsUUFBYSxFQUFFLEVBQVUsRUFBRSxLQUFhLEVBQUUsS0FBaUIsRUFBRSxtQkFBd0Q7UUFDekosTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7UUFDckwsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDOUIsT0FBTyxXQUFXLENBQUM7SUFDcEIsQ0FBQztJQUVNLDBCQUEwQixDQUFDLFdBQXdDO1FBQ3pFLE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDNUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLEdBQUcsS0FBSztRQUN4QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLHdCQUF3QixFQUFFLENBQUM7UUFDeEUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBRUQsTUFBTSxDQUFDLE9BQWtJO1FBQ3hJLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDN0IsT0FBTyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDckIsQ0FBQztRQUNELE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQW9CO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDckQsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDOUMsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsVUFBVTtRQUNULE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMvQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELE9BQU87UUFDTixPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUM7SUFDekUsQ0FBQztJQUVELG1CQUFtQjtRQUNsQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDbkMsQ0FBQztJQUVELHFCQUFxQjtRQUNwQixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELE9BQU87UUFDTixPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQsc0JBQXNCLENBQUMsR0FBUTtRQUM5QixNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hELElBQUksb0JBQW9CLEVBQUUsQ0FBQztZQUMxQixPQUFPLG9CQUFvQixDQUFDO1FBQzdCLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzdDLE1BQU0sS0FBSyxHQUFHLFdBQVcsRUFBRSxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN2RCxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsd0JBQXdCO1FBQ3ZCLElBQUksaUJBQWlCLEdBQTJCLEVBQUUsQ0FBQztRQUNuRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUM5QyxLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQzdCLGlCQUFpQixHQUFHLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBQy9FLENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxHQUFHLGlCQUFpQixDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVPLFNBQVM7UUFDaEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQztJQUMvQixDQUFDO0lBRU8sV0FBVztRQUNsQixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDO0lBQ2pDLENBQUM7SUFFRCxLQUFLO1FBQ0osT0FBTyxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQzlDLENBQUM7SUFFRCxrQkFBa0I7UUFDakIsT0FBTyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxNQUFNLENBQUM7SUFDL0MsQ0FBQztJQUVELG1CQUFtQjtRQUNsQixPQUFPLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDLE1BQU0sQ0FBUyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakcsQ0FBQztJQUVELElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUNwQixDQUFDO0lBRUQsU0FBUyxDQUFDLFNBQStCO1FBQ3hDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckQsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVELHNCQUFzQjtRQUNyQixPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLENBQUM7SUFDeEYsQ0FBQztJQUVTLFlBQVksQ0FBQyxNQUFXLEVBQUUsS0FBVTtRQUM3QyxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNoSSxDQUFDO0lBRU8sZUFBZSxDQUFDLFdBQXdDO1FBRS9ELElBQUksU0FBUyxHQUF5QyxJQUFJLENBQUM7UUFDM0QsT0FBTyxTQUFTLFlBQVksaUJBQWUsRUFBRSxDQUFDO1lBQzdDLElBQUksU0FBUyxDQUFDLEVBQUUsRUFBRSxLQUFLLFdBQVcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDO2dCQUN6QyxPQUFPLElBQUksQ0FBQztZQUNiLENBQUM7WUFDRCxTQUFTLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2hDLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTSxjQUFjLENBQUMsUUFBYTtRQUNsQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hFLE9BQU8sV0FBVyxDQUFDO0lBQ3BCLENBQUM7SUFFRCxXQUFXLENBQUMsV0FBd0M7UUFDbkQsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzlFLE1BQU0sS0FBSyxDQUFDLEdBQUcsV0FBVyxDQUFDLFFBQVEsa0NBQWtDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZGLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUM5QyxNQUFNLEtBQUssQ0FBQyxHQUFHLFdBQVcsQ0FBQyxRQUFRLG1CQUFtQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUN4RSxDQUFDO1FBRUQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUMzRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVPLEtBQUssQ0FBQyxZQUFZLENBQUMsT0FBc0U7UUFDaEcsTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTNDLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDOUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRU0sWUFBWSxDQUFDLFNBQStCLEVBQUUsT0FBTyxHQUFHLEtBQUs7UUFDbkUsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ2xCLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNoRCxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzFCLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxTQUFTLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM3QyxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBQ2QsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNoQixDQUFDO1FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDaEYsQ0FBQztJQUNGLENBQUM7SUFFTSxjQUFjLENBQUMsV0FBd0MsRUFBRSxLQUFtQjtRQUNsRixJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDcEQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBQ0QsSUFBSSxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUMzQixJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDakQsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3ZCLENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRUQsWUFBWSxDQUFDLFdBQW1DLEVBQUUsVUFBbUIsSUFBSSxFQUFFLFVBQW1CLElBQUksRUFBRSxZQUFZLEdBQUcsS0FBSztRQUV2SCxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDbkIsS0FBSyxNQUFNLEtBQUssSUFBSSxXQUFxQyxFQUFFLENBQUM7WUFDM0QsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDM0MsSUFBSSxZQUFZLElBQUksS0FBSyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQztvQkFDaEQsU0FBUztnQkFDVixDQUFDO2dCQUNELElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDekMsSUFBSSxPQUFPLEVBQUUsQ0FBQztvQkFDYixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2pCLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3hELENBQUM7Z0JBQ0QsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNyQixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ25ELElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1osTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDaEQsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE1BQU0sS0FBSyxDQUFDLGFBQWEsS0FBSyxDQUFDLFFBQVEsc0NBQXNDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUMvRixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzNELENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLHdCQUF3QixDQUFDLE1BQTRCLEVBQUUsUUFBYTtRQUN6RSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNsRCxJQUFJLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDcEMsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDZixTQUFTLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLE1BQU0sU0FBUyxDQUFDLDRCQUE0QixFQUFFLENBQUM7WUFDaEQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUNuRCxLQUFLLE1BQU0sSUFBSSxJQUFJLGFBQWEsRUFBRSxDQUFDO29CQUNsQyxNQUFNLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ3ZELENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxZQUFZLENBQUMsR0FBaUIsRUFBRSxNQUFlLEVBQUUsZ0JBQXdCO1FBQ3hFLDREQUE0RDtRQUM1RCxNQUFNLEtBQUssR0FBMkIsRUFBRSxDQUFDO1FBQ3pDLE1BQU0sT0FBTyxHQUEyQixFQUFFLENBQUM7UUFFM0MsR0FBRyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRTtZQUMxQixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0UsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO2dCQUV2QixJQUFJLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDMUIsWUFBWTt5QkFDVixPQUFPO3lCQUNQLE1BQU0sQ0FBQyxhQUFhLENBQUM7eUJBQ3JCLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTt3QkFDWix5QkFBeUIsQ0FBQyxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxDQUFDOzZCQUNwRCxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDMUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0wsQ0FBQztnQkFFRCxtQkFBbUI7Z0JBQ25CLElBQUksNkJBQTZCLENBQUMsWUFBWSxDQUFDLElBQUksMkJBQTJCLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztvQkFDOUYsWUFBWSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUU7d0JBQ2hELElBQUksbUJBQW1CLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDOzRCQUM1QyxNQUFNLGlCQUFpQixHQUFHLGlCQUFpQixDQUFDLFlBQVksQ0FBQywyQkFBMkIsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDOzRCQUNwRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7Z0NBQ3ZCLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQztnQ0FDakUsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDOzRCQUNsRSxDQUFDO2lDQUFNLENBQUM7Z0NBQ1AsaUJBQWlCLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxDQUFDOzRCQUM5QyxDQUFDO3dCQUNGLENBQUM7b0JBQ0YsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQztnQkFFRCxPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBRWhDLElBQUksWUFBWSxDQUFDLE9BQU8sSUFBSSxZQUFZLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDN0QsaUJBQWlCLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDcEQsQ0FBQztZQUNGLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLG9DQUFvQyxDQUFDLElBQUksQ0FBQyxJQUFJLDZCQUE2QixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ3ZGLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxZQUFZLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztvQkFDbkYsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDdkIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLENBQUMsR0FBRyxLQUFLLEVBQUUsR0FBRyxPQUFPLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzFELENBQUM7SUFDRixDQUFDO0lBRUQsMEJBQTBCLENBQUMsTUFBNEIsRUFBRSxRQUFhO1FBQ3JFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRWxELElBQUksbUJBQW1CLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUNwQyxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNmLFNBQVMsQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM5QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQ25ELEtBQUssTUFBTSxJQUFJLElBQUksYUFBYSxFQUFFLENBQUM7b0JBQ2xDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ25ELENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUVGLENBQUM7SUFFRCxjQUFjO1FBQ2IsQ0FBQyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxTQUErQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNsRyxDQUFDLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFdBQTRCLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQzFHLENBQUMsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxTQUErQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUM1RyxDQUFDLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsV0FBNEIsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDcEgsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdkMsQ0FBQztJQUVRLE9BQU87UUFDZixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN2QixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztDQUNELENBQUE7QUFyWlksZUFBZTtJQXlCekIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsWUFBQSxtQkFBbUIsQ0FBQTtHQTVCVCxlQUFlLENBcVozQjs7QUFFTSxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLGVBQWU7SUFJL0QsWUFBWSxTQUFjLEVBQ3pCLEdBQVcsRUFDWCxNQUFjLEVBQ2QsTUFBa0IsRUFDbEIsT0FBNkMsRUFDN0MsYUFBNEIsRUFDNUIsWUFBd0QsRUFDdkMsY0FBK0IsRUFDekIsb0JBQTJDLEVBQ25ELFlBQTJCLEVBQ3JCLGtCQUF1QztRQUU1RCxLQUFLLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxvQkFBb0IsRUFBRSxZQUFZLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUNwSixJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FDaEosSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuQixDQUFDO0lBRUQsSUFBYSxRQUFRO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLFNBQVUsQ0FBQztJQUN4QixDQUFDO0lBRUQsSUFBSSxrQkFBa0I7UUFDckIsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDO0lBQ3ZDLENBQUM7Q0FDRCxDQUFBO0FBNUJZLDJCQUEyQjtJQVdyQyxXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxhQUFhLENBQUE7SUFDYixZQUFBLG1CQUFtQixDQUFBO0dBZFQsMkJBQTJCLENBNEJ2Qzs7QUFFRDs7R0FFRztBQUNJLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsMkJBQTJCO0lBQzVFLFlBQVksU0FBYyxFQUFFLEdBQVcsRUFBRSxNQUFjLEVBQUUsTUFBa0IsRUFBRSxPQUEyQixFQUN0RixjQUErQixFQUN6QixvQkFBMkMsRUFDbkQsWUFBMkIsRUFDckIsa0JBQXVDO1FBRTVELEtBQUssQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLG9CQUFvQixFQUFFLFlBQVksRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQ2hKLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxHQUFRO1FBQ25DLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNsRyxDQUFDO0lBRU8sU0FBUyxDQUFDLElBQVMsRUFBRSxHQUFRO1FBQ3BDLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFTyxlQUFlLENBQUMsS0FBbUIsRUFBRSxjQUFxRCxFQUFFLFVBQThCLEVBQUUsTUFBdUIsRUFBRSxZQUF3QixFQUFFLFdBQXVELEVBQUUsZ0JBQXdCO1FBQ3ZRLDhGQUE4RjtRQUM5RixNQUFNLFNBQVMsR0FDZCxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUN2QywyQkFBMkIsRUFDM0IsS0FBSyxFQUNMLGNBQWMsRUFDZCxVQUFVLEVBQ1YsTUFBTSxFQUNOLFlBQVksRUFDWixXQUFXLEVBQ1gsZ0JBQWdCLENBQ2hCLENBQUM7UUFDSCxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDMUIsTUFBTSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM1QixNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNwRyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRSxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsMkJBQTJCLENBQUMsWUFBNkIsRUFBRSxnQkFBd0I7UUFFbEYsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUM5RCxNQUFNLEtBQUssQ0FBQyxHQUFHLFlBQVksQ0FBQyxRQUFRLDJCQUEyQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsTUFBTSxvQkFBb0IsR0FBVSxFQUFFLENBQUM7UUFDdkMsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUUxRCxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN0RCxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbEMsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDO1lBQ3BCLEdBQUcsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2hHLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxLQUFLLENBQUMsR0FBRyxZQUFZLENBQUMsUUFBUSw4Q0FBOEMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUM5RyxDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDO1FBQ3RDLElBQUksTUFBTSxHQUFnQyxJQUFJLENBQUM7UUFDL0MsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3RELElBQUksV0FBVyxHQUE0QyxNQUFNLENBQUMsY0FBYyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNsQixXQUFXLEdBQUcsTUFBTSxDQUFDLDZCQUE2QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDeEksQ0FBQztZQUNELE1BQU0sR0FBRyxXQUFXLENBQUM7UUFDdEIsQ0FBQztRQUNELE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQztRQUNwSixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUNwSixDQUFDO0NBQ0QsQ0FBQTtBQXBFWSw0QkFBNEI7SUFFdEMsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxtQkFBbUIsQ0FBQTtHQUxULDRCQUE0QixDQW9FeEM7O0FBRUQsaUVBQWlFO0FBQzFELElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXNCLFNBQVEsZUFBZTtJQUN6RCxZQUFZLEdBQVcsRUFBRSxNQUFjLEVBQUUsTUFBa0IsRUFBRSxPQUEyQixFQUN0RSxjQUErQixFQUN6QixvQkFBMkMsRUFDbkQsWUFBMkIsRUFDckIsa0JBQXVDO1FBRzVELEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLG9CQUFvQixFQUFFLFlBQVksRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQzNJLENBQUM7SUFFRCwyQkFBMkIsQ0FBQyxZQUF3QixFQUFFLGdCQUF3QjtRQUM3RSxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUM7UUFDcEosOEZBQThGO1FBQzlGLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FDeEUsMkJBQTJCLEVBQzNCLG1CQUFtQixFQUNuQixJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFDMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQ3RCLElBQUksRUFBRSxZQUFZLEVBQ2xCLElBQUksRUFDSixnQkFBZ0IsQ0FDaEIsQ0FBQyxDQUFDO1FBQ0gsU0FBUyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDMUIsTUFBTSxVQUFVLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDbEcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEUsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztDQUNELENBQUE7QUE3QlkscUJBQXFCO0lBRS9CLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsbUJBQW1CLENBQUE7R0FMVCxxQkFBcUIsQ0E2QmpDIn0=