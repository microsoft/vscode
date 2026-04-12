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
import { binarySearch, coalesceInPlace, equals } from '../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { LRUCache } from '../../../../base/common/map.js';
import { commonPrefixLength } from '../../../../base/common/strings.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IModelService } from '../../../common/services/model.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
export class TreeElement {
    remove() {
        this.parent?.children.delete(this.id);
    }
    static findId(candidate, container) {
        // complex id-computation which contains the origin/extension,
        // the parent path, and some dedupe logic when names collide
        let candidateId;
        if (typeof candidate === 'string') {
            candidateId = `${container.id}/${candidate}`;
        }
        else {
            candidateId = `${container.id}/${candidate.name}`;
            if (container.children.get(candidateId) !== undefined) {
                candidateId = `${container.id}/${candidate.name}_${candidate.range.startLineNumber}_${candidate.range.startColumn}`;
            }
        }
        let id = candidateId;
        for (let i = 0; container.children.get(id) !== undefined; i++) {
            id = `${candidateId}_${i}`;
        }
        return id;
    }
    static getElementById(id, element) {
        if (!id) {
            return undefined;
        }
        const len = commonPrefixLength(id, element.id);
        if (len === id.length) {
            return element;
        }
        if (len < element.id.length) {
            return undefined;
        }
        for (const [, child] of element.children) {
            // eslint-disable-next-line no-restricted-syntax
            const candidate = TreeElement.getElementById(id, child);
            if (candidate) {
                return candidate;
            }
        }
        return undefined;
    }
    static size(element) {
        let res = 1;
        for (const [, child] of element.children) {
            res += TreeElement.size(child);
        }
        return res;
    }
    static empty(element) {
        return element.children.size === 0;
    }
}
export class OutlineElement extends TreeElement {
    constructor(id, parent, symbol) {
        super();
        this.id = id;
        this.parent = parent;
        this.symbol = symbol;
        this.children = new Map();
    }
}
export class OutlineGroup extends TreeElement {
    constructor(id, parent, label, order) {
        super();
        this.id = id;
        this.parent = parent;
        this.label = label;
        this.order = order;
        this.children = new Map();
    }
    getItemEnclosingPosition(position) {
        return position ? this._getItemEnclosingPosition(position, this.children) : undefined;
    }
    _getItemEnclosingPosition(position, children) {
        for (const [, item] of children) {
            if (!item.symbol.range || !Range.containsPosition(item.symbol.range, position)) {
                continue;
            }
            return this._getItemEnclosingPosition(position, item.children) || item;
        }
        return undefined;
    }
    updateMarker(marker) {
        for (const [, child] of this.children) {
            this._updateMarker(marker, child);
        }
    }
    _updateMarker(markers, item) {
        item.marker = undefined;
        // find the proper start index to check for item/marker overlap.
        const idx = binarySearch(markers, item.symbol.range, Range.compareRangesUsingStarts);
        let start;
        if (idx < 0) {
            start = ~idx;
            if (start > 0 && Range.areIntersecting(markers[start - 1], item.symbol.range)) {
                start -= 1;
            }
        }
        else {
            start = idx;
        }
        const myMarkers = [];
        let myTopSev;
        for (; start < markers.length && Range.areIntersecting(item.symbol.range, markers[start]); start++) {
            // remove markers intersecting with this outline element
            // and store them in a 'private' array.
            const marker = markers[start];
            myMarkers.push(marker);
            markers[start] = undefined;
            if (!myTopSev || marker.severity > myTopSev) {
                myTopSev = marker.severity;
            }
        }
        // Recurse into children and let them match markers that have matched
        // this outline element. This might remove markers from this element and
        // therefore we remember that we have had markers. That allows us to render
        // the dot, saying 'this element has children with markers'
        for (const [, child] of item.children) {
            this._updateMarker(myMarkers, child);
        }
        if (myTopSev) {
            item.marker = {
                count: myMarkers.length,
                topSev: myTopSev
            };
        }
        coalesceInPlace(markers);
    }
}
export class OutlineModel extends TreeElement {
    static create(registry, textModel, token) {
        const cts = new CancellationTokenSource(token);
        const result = new OutlineModel(textModel.uri);
        const provider = registry.ordered(textModel);
        const promises = provider.map((provider, index) => {
            const id = TreeElement.findId(`provider_${index}`, result);
            const group = new OutlineGroup(id, result, provider.displayName ?? 'Unknown Outline Provider', index);
            return Promise.resolve(provider.provideDocumentSymbols(textModel, cts.token)).then(result => {
                for (const info of result || []) {
                    OutlineModel._makeOutlineElement(info, group);
                }
                return group;
            }, err => {
                onUnexpectedExternalError(err);
                return group;
            }).then(group => {
                if (!TreeElement.empty(group)) {
                    result._groups.set(id, group);
                }
                else {
                    group.remove();
                }
            });
        });
        const listener = registry.onDidChange(() => {
            const newProvider = registry.ordered(textModel);
            if (!equals(newProvider, provider)) {
                cts.cancel();
            }
        });
        return Promise.all(promises).then(() => {
            if (cts.token.isCancellationRequested && !token.isCancellationRequested) {
                return OutlineModel.create(registry, textModel, token);
            }
            else {
                return result._compact();
            }
        }).finally(() => {
            cts.dispose();
            listener.dispose();
            cts.dispose();
        });
    }
    static _makeOutlineElement(info, container) {
        const id = TreeElement.findId(info, container);
        const res = new OutlineElement(id, container, info);
        if (info.children) {
            for (const childInfo of info.children) {
                OutlineModel._makeOutlineElement(childInfo, res);
            }
        }
        container.children.set(res.id, res);
    }
    static get(element) {
        while (element) {
            if (element instanceof OutlineModel) {
                return element;
            }
            element = element.parent;
        }
        return undefined;
    }
    constructor(uri) {
        super();
        this.uri = uri;
        this.id = 'root';
        this.parent = undefined;
        this._groups = new Map();
        this.children = new Map();
        this.id = 'root';
        this.parent = undefined;
    }
    _compact() {
        let count = 0;
        for (const [key, group] of this._groups) {
            if (group.children.size === 0) { // empty
                this._groups.delete(key);
            }
            else {
                count += 1;
            }
        }
        if (count !== 1) {
            //
            this.children = this._groups;
        }
        else {
            // adopt all elements of the first group
            const group = Iterable.first(this._groups.values());
            for (const [, child] of group.children) {
                child.parent = this;
                this.children.set(child.id, child);
            }
        }
        return this;
    }
    merge(other) {
        if (this.uri.toString() !== other.uri.toString()) {
            return false;
        }
        if (this._groups.size !== other._groups.size) {
            return false;
        }
        this._groups = other._groups;
        this.children = other.children;
        return true;
    }
    getItemEnclosingPosition(position, context) {
        let preferredGroup;
        if (context) {
            let candidate = context.parent;
            while (candidate && !preferredGroup) {
                if (candidate instanceof OutlineGroup) {
                    preferredGroup = candidate;
                }
                candidate = candidate.parent;
            }
        }
        let result = undefined;
        for (const [, group] of this._groups) {
            result = group.getItemEnclosingPosition(position);
            if (result && (!preferredGroup || preferredGroup === group)) {
                break;
            }
        }
        return result;
    }
    getItemById(id) {
        // eslint-disable-next-line no-restricted-syntax
        return TreeElement.getElementById(id, this);
    }
    updateMarker(marker) {
        // sort markers by start range so that we can use
        // outline element starts for quicker look up
        marker.sort(Range.compareRangesUsingStarts);
        for (const [, group] of this._groups) {
            group.updateMarker(marker.slice(0));
        }
    }
    getTopLevelSymbols() {
        const roots = [];
        for (const child of this.children.values()) {
            if (child instanceof OutlineElement) {
                roots.push(child.symbol);
            }
            else {
                roots.push(...Iterable.map(child.children.values(), child => child.symbol));
            }
        }
        return roots.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
    }
    asListOfDocumentSymbols() {
        const roots = this.getTopLevelSymbols();
        const bucket = [];
        OutlineModel._flattenDocumentSymbols(bucket, roots, '');
        return bucket.sort((a, b) => Position.compare(Range.getStartPosition(a.range), Range.getStartPosition(b.range)) || Position.compare(Range.getEndPosition(b.range), Range.getEndPosition(a.range)));
    }
    static _flattenDocumentSymbols(bucket, entries, overrideContainerLabel) {
        for (const entry of entries) {
            bucket.push({
                kind: entry.kind,
                tags: entry.tags,
                name: entry.name,
                detail: entry.detail,
                containerName: entry.containerName || overrideContainerLabel,
                range: entry.range,
                selectionRange: entry.selectionRange,
                children: undefined, // we flatten it...
            });
            // Recurse over children
            if (entry.children) {
                OutlineModel._flattenDocumentSymbols(bucket, entry.children, entry.name);
            }
        }
    }
}
export const IOutlineModelService = createDecorator('IOutlineModelService');
let OutlineModelService = class OutlineModelService {
    constructor(_languageFeaturesService, debounces, modelService) {
        this._languageFeaturesService = _languageFeaturesService;
        this._disposables = new DisposableStore();
        this._cache = new LRUCache(15, 0.7);
        this._debounceInformation = debounces.for(_languageFeaturesService.documentSymbolProvider, 'DocumentSymbols', { min: 350 });
        // don't cache outline models longer than their text model
        this._disposables.add(modelService.onModelRemoved(textModel => {
            this._cache.delete(textModel.id);
        }));
    }
    dispose() {
        this._disposables.dispose();
    }
    async getOrCreate(textModel, token) {
        const registry = this._languageFeaturesService.documentSymbolProvider;
        const provider = registry.ordered(textModel);
        let data = this._cache.get(textModel.id);
        if (!data || data.versionId !== textModel.getVersionId() || !equals(data.provider, provider)) {
            const source = new CancellationTokenSource();
            data = {
                versionId: textModel.getVersionId(),
                provider,
                promiseCnt: 0,
                source,
                promise: OutlineModel.create(registry, textModel, source.token),
                model: undefined,
            };
            this._cache.set(textModel.id, data);
            const now = Date.now();
            data.promise.then(outlineModel => {
                data.model = outlineModel;
                this._debounceInformation.update(textModel, Date.now() - now);
            }).catch(_err => {
                this._cache.delete(textModel.id);
            });
        }
        if (data.model) {
            // resolved -> return data
            return data.model;
        }
        // increase usage counter
        data.promiseCnt += 1;
        const listener = token.onCancellationRequested(() => {
            // last -> cancel provider request, remove cached promise
            if (--data.promiseCnt === 0) {
                data.source.cancel();
                this._cache.delete(textModel.id);
            }
        });
        try {
            return await data.promise;
        }
        finally {
            listener.dispose();
        }
    }
    getDebounceValue(textModel) {
        return this._debounceInformation.get(textModel);
    }
    getCachedModels() {
        return Iterable.filter(Iterable.map(this._cache.values(), entry => entry.model), model => model !== undefined);
    }
};
OutlineModelService = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, ILanguageFeatureDebounceService),
    __param(2, IModelService)
], OutlineModelService);
export { OutlineModelService };
registerSingleton(IOutlineModelService, OutlineModelService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0bGluZU1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZG9jdW1lbnRTeW1ib2xzL2Jyb3dzZXIvb3V0bGluZU1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzFGLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRXhFLE9BQU8sRUFBYSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN2RSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFJOUQsT0FBTyxFQUErQiwrQkFBK0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ25JLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV2RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUV4RixNQUFNLE9BQWdCLFdBQVc7SUFNaEMsTUFBTTtRQUNMLElBQUksQ0FBQyxNQUFN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