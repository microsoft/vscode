"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const mergeConflictParser_1 = require("./mergeConflictParser");
const delayer_1 = require("./delayer");
class ScanTask {
    origins = new Set();
    delayTask;
    constructor(delayTime, initialOrigin) {
        this.origins.add(initialOrigin);
        this.delayTask = new delayer_1.Delayer(delayTime);
    }
    addOrigin(name) {
        this.origins.add(name);
    }
    hasOrigin(name) {
        return this.origins.has(name);
    }
}
class OriginDocumentMergeConflictTracker {
    parent;
    origin;
    constructor(parent, origin) {
        this.parent = parent;
        this.origin = origin;
    }
    getConflicts(document) {
        return this.parent.getConflicts(document, this.origin);
    }
    isPending(document) {
        return this.parent.isPending(document, this.origin);
    }
    forget(document) {
        this.parent.forget(document);
    }
}
class DocumentMergeConflictTracker {
    telemetryReporter;
    cache = new Map();
    delayExpireTime = 0;
    constructor(telemetryReporter) {
        this.telemetryReporter = telemetryReporter;
    }
    getConflicts(document, origin) {
        // Attempt from cache
        const key = this.getCacheKey(document);
        if (!key) {
            // Document doesn't have a uri, can't cache it, so return
            return Promise.resolve(this.getConflictsOrEmpty(document, [origin]));
        }
        let cacheItem = this.cache.get(key);
        if (!cacheItem) {
            cacheItem = new ScanTask(this.delayExpireTime, origin);
            this.cache.set(key, cacheItem);
        }
        else {
            cacheItem.addOrigin(origin);
        }
        return cacheItem.delayTask.trigger(() => {
            const conflicts = this.getConflictsOrEmpty(document, Array.from(cacheItem.origins));
            this.cache?.delete(key);
            return conflicts;
        });
    }
    isPending(document, origin) {
        if (!document) {
            return false;
        }
        const key = this.getCacheKey(document);
        if (!key) {
            return false;
        }
        const task = this.cache.get(key);
        if (!task) {
            return false;
        }
        return task.hasOrigin(origin);
    }
    createTracker(origin) {
        return new OriginDocumentMergeConflictTracker(this, origin);
    }
    forget(document) {
        const key = this.getCacheKey(document);
        if (key) {
            this.cache.delete(key);
        }
    }
    dispose() {
        this.cache.clear();
    }
    seenDocumentsWithConflicts = new Set();
    getConflictsOrEmpty(document, _origins) {
        const containsConflict = mergeConflictParser_1.MergeConflictParser.containsConflict(document);
        if (!containsConflict) {
            return [];
        }
        const conflicts = mergeConflictParser_1.MergeConflictParser.scanDocument(document, this.telemetryReporter);
        const key = document.uri.toString();
        // Don't report telemetry for the same document twice. This is an approximation, but good enough.
        // Otherwise redo/undo could trigger this event multiple times.
        if (!this.seenDocumentsWithConflicts.has(key)) {
            this.seenDocumentsWithConflicts.add(key);
            /* __GDPR__
                "mergeMarkers.documentWithConflictMarkersOpened" : {
                    "owner": "hediet",
                    "comment": "Used to determine how many documents with conflicts are opened.",
                    "conflictCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of conflict counts" }
                }
            */
            this.telemetryReporter.sendTelemetryEvent('mergeMarkers.documentWithConflictMarkersOpened', {}, {
                conflictCount: conflicts.length,
            });
        }
        return conflicts;
    }
    getCacheKey(document) {
        if (document.uri) {
            return document.uri.toString();
        }
        return null;
    }
}
exports.default = DocumentMergeConflictTracker;
//# sourceMappingURL=documentTracker.js.map