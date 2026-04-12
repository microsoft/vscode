/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';
import { createLineMatcher, ApplyToKind, getResource } from './problemMatcher.js';
import { IMarkerData } from '../../../../platform/markers/common/markers.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { isWindows } from '../../../../base/common/platform.js';
export var ProblemCollectorEventKind;
(function (ProblemCollectorEventKind) {
    ProblemCollectorEventKind["BackgroundProcessingBegins"] = "backgroundProcessingBegins";
    ProblemCollectorEventKind["BackgroundProcessingEnds"] = "backgroundProcessingEnds";
})(ProblemCollectorEventKind || (ProblemCollectorEventKind = {}));
var IProblemCollectorEvent;
(function (IProblemCollectorEvent) {
    function create(kind, capturedVariables) {
        return Object.freeze({ kind, capturedVariables });
    }
    IProblemCollectorEvent.create = create;
})(IProblemCollectorEvent || (IProblemCollectorEvent = {}));
export class AbstractProblemCollector extends Disposable {
    constructor(problemMatchers, markerService, modelService, fileService, logService) {
        super();
        this.problemMatchers = problemMatchers;
        this.markerService = markerService;
        this.modelService = modelService;
        this.logService = logService;
        this.modelListeners = new DisposableStore();
        this._onDidFindFirstMatch = this._register(new Emitter());
        this.onDidFindFirstMatch = this._onDidFindFirstMatch.event;
        this._onDidFindErrors = this._register(new Emitter());
        this.onDidFindErrors = this._onDidFindErrors.event;
        this._onDidRequestInvalidateLastMarker = this._register(new Emitter());
        this.onDidRequestInvalidateLastMarker = this._onDidRequestInvalidateLastMarker.event;
        this.matchers = Object.create(null);
        this.bufferLength = 1;
        problemMatchers.map(elem => createLineMatcher(elem, fileService, logService)).forEach((matcher) => {
            const length = matcher.matchLength;
            if (length > this.bufferLength) {
                this.bufferLength = length;
            }
            let value = this.matchers[length];
            if (!value) {
                value = [];
                this.matchers[length] = value;
            }
            value.push(matcher);
        });
        this.buffer = [];
        this.activeMatcher = null;
        this._numberOfMatches = 0;
        this._maxMarkerSeverity = undefined;
        this.openModels = Object.create(null);
        this.applyToByOwner = new Map();
        for (const problemMatcher of problemMatchers) {
            const current = this.applyToByOwner.get(problemMatcher.owner);
            if (current === undefined) {
                this.applyToByOwner.set(problemMatcher.owner, problemMatcher.applyTo);
            }
            else {
                this.applyToByOwner.set(problemMatcher.owner, this.mergeApplyTo(current, problemMatcher.applyTo));
            }
        }
        this.resourcesToClean = new Map();
        this.markers = new Map();
        this.deliveredMarkers = new Map();
        this._register(this.modelService.onModelAdded((model) => {
            this.openModels[model.uri.toString()] = true;
        }, this, this.modelListeners));
        this._register(this.modelService.onModelRemoved((model) => {
            delete this.openModels[model.uri.toString()];
        }, this, this.modelListeners));
        this.modelService.getModels().forEach(model => this.openModels[model.uri.toString()] = true);
        this._onDidStateChange = this._register(new Emitter());
    }
    get onDidStateChange() {
        return this._onDidStateChange.event;
    }
    processLine(line) {
        if (this.tail) {
            const oldTail = this.tail;
            this.tail = oldTail.then(() => {
                return this.processLineInternal(line);
            });
        }
        else {
            this.tail = this.processLineInternal(line);
        }
    }
    dispose() {
        super.dispose();
        this.modelListeners.dispose();
    }
    get numberOfMatches() {
        return this._numberOfMatches;
    }
    get maxMarkerSeverity() {
        return this._maxMarkerSeverity;
    }
    tryFindMarker(line) {
        let result = null;
        if (this.activeMatcher) {
            result = this.activeMatcher.next(line);
            if (result) {
                this.captureMatch(result);
                return result;
            }
            this.clearBuffer();
            this.activeMatcher = null;
        }
        if (this.buffer.length < this.bufferLength) {
            this.buffer.push(line);
        }
        else {
            const end = this.buffer.length - 1;
            for (let i = 0; i < end; i++) {
                this.buffer[i] = this.buffer[i + 1];
            }
            this.buffer[end] = line;
        }
        result = this.tryMatchers();
        if (result) {
            this.clearBuffer();
        }
        return result;
    }
    async shouldApplyMatch(result) {
        switch (result.description.applyTo) {
            case ApplyToKind.allDocuments:
                return true;
            case ApplyToKind.openDocuments:
                return !!this.openModels[(await result.resource).toString()];
            case ApplyToKind.closedDocuments:
                return !this.openModels[(await result.resource).toString()];
            default:
                return true;
        }
    }
    mergeApplyTo(current, value) {
        if (current === value || current === ApplyToKind.allDocuments) {
            return current;
        }
        return ApplyToKind.allDocuments;
    }
    tryMatchers() {
        this.activeMatcher = null;
        const length = this.buffer.length;
        for (let startIndex = 0; startIndex < length; startIndex++) {
            const candidates = this.matchers[length - startIndex];
            if (!candidates) {
                continue;
            }
            for (const matcher of candidates) {
                const result = matcher.handle(this.buffer, startIndex);
                if (result.match) {
                    this.captureMatch(result.match);
                    if (result.continue) {
                        this.activeMatcher = matcher;
                    }
                    return result.match;
                }
            }
        }
        return null;
    }
    captureMatch(match) {
        this._numberOfMatches++;
        if (this._maxMarkerSeverity === undefined || match.marker.severity > this._maxMarkerSeverity) {
            this._maxMarkerSeverity = match.marker.severity;
        }
    }
    clearBuffer() {
        if (this.buffer.length > 0) {
            this.buffer = [];
        }
    }
    recordResourcesToClean(owner) {
        const resourceSetToClean = this.getResourceSetToClean(owner);
        this.markerService.read({ owner: owner }).forEach(marker => resourceSetToClean.set(marker.resource.toString(), marker.resource));
    }
    recordResourceToClean(owner, resource) {
        this.getResourceSetToClean(owner).set(resource.toString(), resource);
    }
    removeResourceToClean(owner, resource) {
        const resourceSet = this.resourcesToClean.get(owner);
        resourceSet?.delete(resource);
    }
    getResourceSetToClean(owner) {
        let result = this.resourcesToClean.get(owner);
        if (!result) {
            result = new Map();
            this.resourcesToClean.set(owner, result);
        }
        return result;
    }
    cleanAllMarkers() {
        this.resourcesToClean.forEach((value, owner) => {
            this._cleanMarkers(owner, value);
        });
        this.resourcesToClean = new Map();
    }
    cleanMarkers(owner) {
        const toClean = this.resourcesToClean.get(owner);
        if (toClean) {
            this._cleanMarkers(owner, toClean);
            this.resourcesToClean.delete(owner);
        }
    }
    _cleanMarkers(owner, toClean) {
        const uris = [];
        const applyTo = this.applyToByOwner.get(owner);
        toClean.forEach((uri, uriAsString) => {
            if (applyTo === ApplyToKind.allDocuments ||
                (applyTo === ApplyToKind.openDocuments && this.openModels[uriAsString]) ||
                (applyTo === ApplyToKind.closedDocuments && !this.openModels[uriAsString])) {
                uris.push(uri);
            }
        });
        this.markerService.remove(owner, uris);
    }
    recordMarker(marker, owner, resourceAsString) {
        let markersPerOwner = this.markers.get(owner);
        if (!markersPerOwner) {
            markersPerOwner = new Map();
            this.markers.set(owner, markersPerOwner);
        }
        let markersPerResource = markersPerOwner.get(resourceAsString);
        if (!markersPerResource) {
            markersPerResource = new Map();
            markersPerOwner.set(resourceAsString, markersPerResource);
        }
        const key = IMarkerData.makeKeyOptionalMessage(marker, false);
        let existingMarker;
        if (!markersPerResource.has(key)) {
            markersPerResource.set(key, marker);
        }
        else if (((existingMarker = markersPerResource.get(key)) !== undefined) && (existingMarker.message.length < marker.message.length) && isWindows) {
            // Most likely https://github.com/microsoft/vscode/issues/77475
            // Heuristic dictates that when the key is the same and message is smaller, we have hit this limitation.
            markersPerResource.set(key, marker);
        }
    }
    reportMarkers() {
        this.markers.forEach((markersPerOwner, owner) => {
            const deliveredMarkersPerOwner = this.getDeliveredMarkersPerOwner(owner);
            markersPerOwner.forEach((markers, resource) => {
                this.deliverMarkersPerOwnerAndResourceResolved(owner, resource, markers, deliveredMarkersPerOwner);
            });
        });
    }
    deliverMarkersPerOwnerAndResource(owner, resource) {
        const markersPerOwner = this.markers.get(owner);
        if (!markersPerOwner) {
            return;
        }
        const deliveredMarkersPerOwner = this.getDeliveredMarkersPerOwner(owner);
        const markersPerResource = markersPerOwner.get(resource);
        if (!markersPerResource) {
            return;
        }
        this.deliverMarkersPerOwnerAndResourceResolved(owner, resource, markersPerResource, deliveredMarkersPerOwner);
    }
    deliverMarkersPerOwnerAndResourceResolved(owner, resource, markers, reported) {
        if (markers.size !== reported.get(resource)) {
            const toSet = [];
            markers.forEach(value => toSet.push(value));
            this.markerService.changeOne(owner, URI.parse(resource), toSet);
            reported.set(resource, markers.size);
        }
    }
    getDeliveredMarkersPerOwner(owner) {
        let result = this.deliveredMarkers.get(owner);
        if (!result) {
            result = new Map();
            this.deliveredMarkers.set(owner, result);
        }
        return result;
    }
    cleanMarkerCaches() {
        this._numberOfMatches = 0;
        this._maxMarkerSeverity = undefined;
        this.markers.clear();
        this.deliveredMarkers.clear();
    }
    done() {
        this.reportMarkers();
        this.cleanAllMarkers();
    }
}
export var ProblemHandlingStrategy;
(function (ProblemHandlingStrategy) {
    ProblemHandlingStrategy[ProblemHandlingStrategy["Clean"] = 0] = "Clean";
})(ProblemHandlingStrategy || (ProblemHandlingStrategy = {}));
export class StartStopProblemCollector extends AbstractProblemCollector {
    constructor(problemMatchers, markerService, modelService, _strategy = 0 /* ProblemHandlingStrategy.Clean */, fileService, logService) {
        super(problemMatchers, markerService, modelService, fileService, logService);
        this._hasStarted = false;
        const ownerSet = Object.create(null);
        problemMatchers.forEach(description => ownerSet[description.owner] = true);
        this.owners = Object.keys(ownerSet);
        this.owners.forEach((owner) => {
            this.recordResourcesToClean(owner);
        });
    }
    async processLineInternal(line) {
        if (!this._hasStarted) {
            this._hasStarted = true;
            this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingBegins" /* ProblemCollectorEventKind.BackgroundProcessingBegins */));
        }
        const markerMatch = this.tryFindMarker(line);
        if (!markerMatch) {
            return;
        }
        const owner = markerMatch.description.owner;
        const resource = await markerMatch.resource;
        const resourceAsString = resource.toString();
        this.removeResourceToClean(owner, resourceAsString);
        const shouldApplyMatch = await this.shouldApplyMatch(markerMatch);
        if (shouldApplyMatch) {
            this.recordMarker(markerMatch.marker, owner, resourceAsString);
            if (this.currentOwner !== owner || this.currentResource !== resourceAsString) {
                if (this.currentOwner && this.currentResource) {
                    this.deliverMarkersPerOwnerAndResource(this.currentOwner, this.currentResource);
                }
                this.currentOwner = owner;
                this.currentResource = resourceAsString;
            }
        }
    }
}
export class WatchingProblemCollector extends AbstractProblemCollector {
    constructor(problemMatchers, markerService, modelService, fileService, logService) {
        super(problemMatchers, markerService, modelService, fileService, logService);
        this.lines = [];
        this.beginPatterns = [];
        this.resetCurrentResource();
        this.backgroundPatterns = [];
        this._activeBackgroundMatchers = new Set();
        this.problemMatchers.forEach(matcher => {
            if (matcher.watching) {
                const key = generateUuid();
                this.backgroundPatterns.push({
                    key,
                    matcher: matcher,
                    begin: matcher.watching.beginsPattern,
                    end: matcher.watching.endsPattern
                });
                this.beginPatterns.push(matcher.watching.beginsPattern.regexp);
            }
        });
        this.modelListeners.add(this.modelService.onModelRemoved(modelEvent => {
            let markerChanged = Event.debounce(this.markerService.onMarkerChanged, (last, e) => (last ?? []).concat(e), 500, false, true)(async (markerEvent) => {
                if (markerEvent.length === 0) {
                    return;
                }
                const modelEventUriStr = modelEvent.uri.toString();
                if ((!markerEvent.some(uri => uri.toString() === modelEventUriStr)) || (this.markerService.read({ resource: modelEvent.uri }).length !== 0)) {
                    return;
                }
                const oldLines = Array.from(this.lines);
                for (const line of oldLines) {
                    await this.processLineInternal(line);
                }
            });
            // Dispose the debounced listener after timeout - no need to register it since
            // it's only used temporarily and will be disposed below
            setTimeout(() => {
                if (markerChanged) {
                    const _markerChanged = markerChanged;
                    markerChanged = undefined;
                    _markerChanged.dispose();
                }
            }, 600);
        }));
    }
    aboutToStart() {
        for (const background of this.backgroundPatterns) {
            if (background.matcher.watching && background.matcher.watching.activeOnStart) {
                this._activeBackgroundMatchers.add(background.key);
                this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingBegins" /* ProblemCollectorEventKind.BackgroundProcessingBegins */));
                this.recordResourcesToClean(background.matcher.owner);
            }
        }
    }
    async processLineInternal(line) {
        if (await this.tryBegin(line) || this.tryFinish(line)) {
            return;
        }
        this.lines.push(line);
        const markerMatch = this.tryFindMarker(line);
        if (!markerMatch) {
            return;
        }
        const resource = await markerMatch.resource;
        const owner = markerMatch.description.owner;
        const resourceAsString = resource.toString();
        this.removeResourceToClean(owner, resourceAsString);
        const shouldApplyMatch = await this.shouldApplyMatch(markerMatch);
        if (shouldApplyMatch) {
            this.recordMarker(markerMatch.marker, owner, resourceAsString);
            if (this.currentOwner !== owner || this.currentResource !== resourceAsString) {
                this.reportMarkersForCurrentResource();
                this.currentOwner = owner;
                this.currentResource = resourceAsString;
            }
        }
    }
    forceDelivery() {
        this.reportMarkersForCurrentResource();
    }
    async tryBegin(line) {
        let result = false;
        for (const background of this.backgroundPatterns) {
            const start = Date.now();
            const matches = background.begin.regexp.exec(line);
            const elapsed = Date.now() - start;
            if (elapsed > 5) {
                this.logService?.trace(`ProblemMatcher: slow begin regexp took ${elapsed}ms to execute`, background.begin.regexp.source);
            }
            if (matches) {
                if (this._activeBackgroundMatchers.has(background.key)) {
                    continue;
                }
                this._activeBackgroundMatchers.add(background.key);
                result = true;
                this._onDidFindFirstMatch.fire();
                this.lines = [];
                this.lines.push(line);
                this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingBegins" /* ProblemCollectorEventKind.BackgroundProcessingBegins */));
                this.cleanMarkerCaches();
                this.resetCurrentResource();
                const owner = background.matcher.owner;
                const file = matches[background.begin.file];
                if (file) {
                    const resource = getResource(file, background.matcher);
                    this.recordResourceToClean(owner, await resource);
                }
                else {
                    this.recordResourcesToClean(owner);
                }
            }
        }
        return result;
    }
    tryFinish(line) {
        let result = false;
        for (const background of this.backgroundPatterns) {
            const start = Date.now();
            const matches = background.end.regexp.exec(line);
            const elapsed = Date.now() - start;
            if (elapsed > 5) {
                this.logService?.trace(`ProblemMatcher: slow end regexp took ${elapsed}ms to execute`, background.end.regexp.source);
            }
            if (matches) {
                if (this._numberOfMatches > 0) {
                    this._onDidFindErrors.fire(this.markerService.read({ owner: background.matcher.owner }));
                }
                else {
                    this._onDidRequestInvalidateLastMarker.fire();
                }
                if (this._activeBackgroundMatchers.delete(background.key)) {
                    this.resetCurrentResource();
                    const capturedVariables = matches.groups ? new Map(Object.entries(matches.groups)) : undefined;
                    this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingEnds" /* ProblemCollectorEventKind.BackgroundProcessingEnds */, capturedVariables));
                    result = true;
                    this.lines.push(line);
                    const owner = background.matcher.owner;
                    this.cleanMarkers(owner);
                    this.cleanMarkerCaches();
                }
            }
        }
        return result;
    }
    resetCurrentResource() {
        this.reportMarkersForCurrentResource();
        this.currentOwner = undefined;
        this.currentResource = undefined;
    }
    reportMarkersForCurrentResource() {
        if (this.currentOwner && this.currentResource) {
            this.deliverMarkersPerOwnerAndResource(this.currentOwner, this.currentResource);
        }
    }
    done() {
        [...this.applyToByOwner.keys()].forEach(owner => {
            this.recordResourcesToClean(owner);
        });
        super.done();
    }
    isWatching() {
        return this.backgroundPatterns.length > 0;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvYmxlbUNvbGxlY3RvcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YXNrcy9jb21tb24vcHJvYmxlbUNvbGxlY3RvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFlLGVBQWUsRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUloRyxPQUFPLEVBQWdCLGlCQUFpQixFQUFpQyxXQUFXLEVBQW9CLFdBQVcsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ2pKLE9BQU8sRUFBa0IsV0FBVyxFQUEyQixNQUFNLGdEQUFnRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHaEUsTUFBTSxDQUFOLElBQWtCLHlCQUdqQjtBQUhELFdBQWtCLHlCQUF5QjtJQUMxQyxzRkFBeUQsQ0FBQTtJQUN6RCxrRkFBcUQsQ0FBQTtBQUN0RCxDQUFDLEVBSGlCLHlCQUF5QixLQUF6Qix5QkFBeUIsUUFHMUM7QUFPRCxJQUFVLHNCQUFzQixDQUkvQjtBQUpELFdBQVUsc0JBQXNCO0lBQy9CLFNBQWdCLE1BQU0sQ0FBQyxJQUErQixFQUFFLGlCQUErQztRQUN0RyxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFGZSw2QkFBTSxTQUVyQixDQUFBO0FBQ0YsQ0FBQyxFQUpTLHNCQUFzQixLQUF0QixzQkFBc0IsUUFJL0I7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