/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { Emitter } from '../../../../base/common/event.js';
import { hash } from '../../../../base/common/hash.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { basename, extUri } from '../../../../base/common/resources.js';
import { splitLines } from '../../../../base/common/strings.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IMarkerData, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { unsupportedSchemas } from '../../../../platform/markers/common/markerService.js';
export function compareMarkersByUri(a, b) {
    return extUri.compare(a.resource, b.resource);
}
function compareResourceMarkers(a, b) {
    const [firstMarkerOfA] = a.markers;
    const [firstMarkerOfB] = b.markers;
    let res = 0;
    if (firstMarkerOfA && firstMarkerOfB) {
        res = MarkerSeverity.compare(firstMarkerOfA.marker.severity, firstMarkerOfB.marker.severity);
    }
    if (res === 0) {
        res = a.path.localeCompare(b.path) || a.name.localeCompare(b.name);
    }
    return res;
}
export class ResourceMarkers {
    constructor(id, resource) {
        this.id = id;
        this.resource = resource;
        this._markersMap = new ResourceMap();
        this._total = 0;
        this.path = this.resource.fsPath;
        this.name = basename(this.resource);
    }
    get markers() {
        if (!this._cachedMarkers) {
            this._cachedMarkers = [...this._markersMap.values()].flat().sort(ResourceMarkers._compareMarkers);
        }
        return this._cachedMarkers;
    }
    has(uri) {
        return this._markersMap.has(uri);
    }
    set(uri, marker) {
        this.delete(uri);
        if (isNonEmptyArray(marker)) {
            this._markersMap.set(uri, marker);
            this._total += marker.length;
            this._cachedMarkers = undefined;
        }
    }
    delete(uri) {
        const array = this._markersMap.get(uri);
        if (array) {
            this._total -= array.length;
            this._cachedMarkers = undefined;
            this._markersMap.delete(uri);
        }
    }
    get total() {
        return this._total;
    }
    static _compareMarkers(a, b) {
        return MarkerSeverity.compare(a.marker.severity, b.marker.severity)
            || extUri.compare(a.resource, b.resource)
            || Range.compareRangesUsingStarts(a.marker, b.marker);
    }
}
export class Marker {
    get resource() { return this.marker.resource; }
    get range() { return this.marker; }
    get lines() {
        if (!this._lines) {
            this._lines = splitLines(this.marker.message);
        }
        return this._lines;
    }
    constructor(id, marker, relatedInformation = []) {
        this.id = id;
        this.marker = marker;
        this.relatedInformation = relatedInformation;
    }
    toString() {
        return JSON.stringify({
            ...this.marker,
            resource: this.marker.resource.path,
            relatedInformation: this.relatedInformation.length ? this.relatedInformation.map(r => ({ ...r.raw, resource: r.raw.resource.path })) : undefined
        }, null, '\t');
    }
}
export class MarkerTableItem extends Marker {
    constructor(marker, sourceMatches, codeMatches, messageMatches, fileMatches) {
        super(marker.id, marker.marker, marker.relatedInformation);
        this.sourceMatches = sourceMatches;
        this.codeMatches = codeMatches;
        this.messageMatches = messageMatches;
        this.fileMatches = fileMatches;
    }
}
export class RelatedInformation {
    constructor(id, marker, raw) {
        this.id = id;
        this.marker = marker;
        this.raw = raw;
    }
}
export class MarkersModel {
    get resourceMarkers() {
        if (!this.cachedSortedResources) {
            this.cachedSortedResources = [...this.resourcesByUri.values()].sort(compareResourceMarkers);
        }
        return this.cachedSortedResources;
    }
    constructor() {
        this.cachedSortedResources = undefined;
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
        this._total = 0;
        this.resourcesByUri = new Map();
    }
    reset() {
        const removed = new Set();
        for (const resourceMarker of this.resourcesByUri.values()) {
            removed.add(resourceMarker);
        }
        this.resourcesByUri.clear();
        this._total = 0;
        this._onDidChange.fire({ removed, added: new Set(), updated: new Set() });
    }
    get total() {
        return this._total;
    }
    getResourceMarkers(resource) {
        return this.resourcesByUri.get(extUri.getComparisonKey(resource, true)) ?? null;
    }
    setResourceMarkers(resourcesMarkers) {
        const change = { added: new Set(), removed: new Set(), updated: new Set() };
        for (const [resource, rawMarkers] of resourcesMarkers) {
            if (unsupportedSchemas.has(resource.scheme)) {
                continue;
            }
            const key = extUri.getComparisonKey(resource, true);
            let resourceMarkers = this.resourcesByUri.get(key);
            if (isNonEmptyArray(rawMarkers)) {
                // update, add
                if (!resourceMarkers) {
                    const resourceMarkersId = this.id(resource.toString());
                    resourceMarkers = new ResourceMarkers(resourceMarkersId, resource.with({ fragment: null }));
                    this.resourcesByUri.set(key, resourceMarkers);
                    change.added.add(resourceMarkers);
                }
                else {
                    change.updated.add(resourceMarkers);
                }
                // Deduplicate markers with identical source, code, severity, message
                // and range so that a diagnostic reported by both a task problem
                // matcher and a language extension is only shown once (#244424).
                const processedMarkerKeys = new Set();
                const markers = [];
                for (const rawMarker of rawMarkers) {
                    const markerKey = IMarkerData.makeKey(rawMarker) + rawMarker.resource.toString();
                    if (processedMarkerKeys.has(markerKey)) {
                        continue;
                    }
                    processedMarkerKeys.add(markerKey);
                    const markerId = this.id(resourceMarkers.id, markerKey, 0, rawMarker.resource.toString());
                    let relatedInformation = undefined;
                    if (rawMarker.relatedInformation) {
                        relatedInformation = rawMarker.relatedInformation.map((r, index) => new RelatedInformation(this.id(markerId, r.resource.toString(), r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn, index), rawMarker, r));
                    }
                    markers.push(new Marker(markerId, rawMarker, relatedInformation));
                }
                this._total -= resourceMarkers.total;
                resourceMarkers.set(resource, markers);
                this._total += resourceMarkers.total;
            }
            else if (resourceMarkers) {
                // clear
                this._total -= resourceMarkers.total;
                resourceMarkers.delete(resource);
                this._total += resourceMarkers.total;
                if (resourceMarkers.total === 0) {
                    this.resourcesByUri.delete(key);
                    change.removed.add(resourceMarkers);
                }
                else {
                    change.updated.add(resourceMarkers);
                }
            }
        }
        this.cachedSortedResources = undefined;
        if (change.added.size || change.removed.size || change.updated.size) {
            this._onDidChange.fire(change);
        }
    }
    id(...values) {
        return `${hash(values)}`;
    }
    dispose() {
        this._onDidChange.dispose();
        this.resourcesByUri.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vyc01vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWFya2Vycy9icm93c2VyL21hcmtlcnNNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFaEUsT0FBTyxFQUFVLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hFLE9BQU8sRUFBVyxXQUFXLEVBQXVCLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzNILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBSTFGLE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxDQUFVLEVBQUUsQ0FBVTtJQUN6RCxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDL0MsQ0FBQztBQUVELFNBQVMsc0JBQXNCLENBQUMsQ0FBa0IsRUFBRSxDQUFrQjtJQUNyRSxNQUFNLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUNuQyxNQUFNLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUNuQyxJQUFJLEdBQUcsR0FBRyxD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