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
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { browserZoomDefaultIndex, browserZoomFactors } from '../../../../platform/browserView/common/browserView.js';
import { zoomLevelToZoomFactor } from '../../../../platform/window/common/window.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
export const IBrowserZoomService = createDecorator('browserZoomService');
/** Storage key for the per-host persistent zoom map. */
const BROWSER_ZOOM_PER_HOST_STORAGE_KEY = 'browserView.zoomPerHost';
/**
 * Special value for the default zoom level setting that instructs the browser view
 * to dynamically match the closest zoom level to the application's current UI zoom.
 */
export const MATCH_WINDOW_ZOOM_LABEL = 'Match Window';
// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------
/** Pre-computed map from percentage label (e.g. "125%") to index into browserZoomFactors. */
const ZOOM_LABEL_TO_INDEX = new Map(browserZoomFactors.map((f, i) => [`${Math.round(f * 100)}%`, i]));
let BrowserZoomService = class BrowserZoomService extends Disposable {
    constructor(configurationService, storageService) {
        super();
        this.configurationService = configurationService;
        this.storageService = storageService;
        this._onDidChangeZoom = this._register(new Emitter());
        this.onDidChangeZoom = this._onDidChangeZoom.event;
        /** In-memory only; dropped on restart. */
        this._ephemeralZoomMap = new Map();
        this._windowZoomFactor = zoomLevelToZoomFactor(0); // default: zoom level 0 → factor 1.0
        this._persistentZoomMap = this._readPersistentZoomMap();
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.browser.pageZoom')) {
                this._onDidChangeZoom.fire({ host: undefined, isEphemeralChange: false });
            }
        }));
    }
    getEffectiveZoomIndex(host, isEphemeral) {
        if (host !== undefined) {
            if (isEphemeral) {
                const ephemeralIndex = this._ephemeralZoomMap.get(host);
                if (ephemeralIndex !== undefined) {
                    return this._clamp(ephemeralIndex);
                }
            }
            else {
                const persistentIndex = this._persistentZoomMap[host];
                if (persistentIndex !== undefined) {
                    return this._clamp(persistentIndex);
                }
            }
        }
        return this._getDefaultZoomIndex();
    }
    setHostZoomIndex(host, zoomIndex, isEphemeral) {
        const clamped = this._clamp(zoomIndex);
        const defaultIndex = this._getDefaultZoomIndex();
        const matchesDefault = clamped === defaultIndex;
        if (isEphemeral) {
            if (matchesDefault) {
                if (!this._ephemeralZoomMap.has(host)) {
                    return;
                }
                this._ephemeralZoomMap.delete(host);
            }
            else {
                if (this._ephemeralZoomMap.get(host) === clamped) {
                    return;
                }
                this._ephemeralZoomMap.set(host, clamped);
            }
            this._onDidChangeZoom.fire({ host, isEphemeralChange: true });
        }
        else {
            let persistentChanged = false;
            if (matchesDefault) {
                if (Object.prototype.hasOwnProperty.call(this._persistentZoomMap, host)) {
                    delete this._persistentZoomMap[host];
                    persistentChanged = true;
                }
            }
            else if (this._persistentZoomMap[host] !== clamped) {
                this._persistentZoomMap[host] = clamped;
                persistentChanged = true;
            }
            // Propagate to ephemeral map so ephemeral views immediately reflect the new level.
            let ephemeralChanged = false;
            if (matchesDefault) {
                ephemeralChanged = this._ephemeralZoomMap.delete(host);
            }
            else if (this._ephemeralZoomMap.get(host) !== clamped) {
                this._ephemeralZoomMap.set(host, clamped);
                ephemeralChanged = true;
            }
            if (!persistentChanged && !ephemeralChanged) {
                return;
            }
            if (persistentChanged) {
                this._writePersistentZoomMap();
            }
            this._onDidChangeZoom.fire({ host, isEphemeralChange: false });
        }
    }
    notifyWindowZoomChanged(windowZoomFactor) {
        this._windowZoomFactor = windowZoomFactor;
        const label = this.configurationService.getValue('workbench.browser.pageZoom');
        if (label === MATCH_WINDOW_ZOOM_LABEL) {
            this._onDidChangeZoom.fire({ host: undefined, isEphemeralChange: false });
        }
    }
    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------
    _getDefaultZoomIndex() {
        const label = this.configurationService.getValue('workbench.browser.pageZoom');
        if (label === MATCH_WINDOW_ZOOM_LABEL) {
            return this._getMatchWindowZoomIndex();
        }
        return ZOOM_LABEL_TO_INDEX.get(label) ?? browserZoomDefaultIndex;
    }
    /**
     * Finds the browser zoom index whose factor is closest to the application's current UI zoom
     * factor, measuring distance on a log scale (since window zoom levels are powers of 1.2).
     */
    _getMatchWindowZoomIndex() {
        const windowFactor = this._windowZoomFactor;
        let bestIndex = browserZoomDefaultIndex;
        let bestDist = Infinity;
        for (let i = 0; i < browserZoomFactors.length; i++) {
            const dist = Math.abs(Math.log(browserZoomFactors[i]) - Math.log(windowFactor));
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }
        return bestIndex;
    }
    /**
     * Reads the persistent per-host zoom map from storage.
     * The stored format is a JSON object mapping host strings to zoom indices.
     */
    _readPersistentZoomMap() {
        const raw = this.storageService.get(BROWSER_ZOOM_PER_HOST_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        if (!raw) {
            return {};
        }
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                return {};
            }
            const result = {};
            for (const [host, index] of Object.entries(parsed)) {
                if (typeof index === 'number' && index >= 0 && index < browserZoomFactors.length) {
                    result[host] = index;
                }
            }
            return result;
        }
        catch {
            return {};
        }
    }
    _writePersistentZoomMap() {
        const hasEntries = Object.keys(this._persistentZoomMap).length > 0;
        if (hasEntries) {
            this.storageService.store(BROWSER_ZOOM_PER_HOST_STORAGE_KEY, JSON.stringify(this._persistentZoomMap), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(BROWSER_ZOOM_PER_HOST_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        }
    }
    _clamp(index) {
        return Math.max(0, Math.min(Math.trunc(index), browserZoomFactors.length - 1));
    }
};
BrowserZoomService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IStorageService)
], BrowserZoomService);
export { BrowserZoomService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlclpvb21TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJab29tU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNySCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBRTlHLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLGVBQWUsQ0FBc0Isb0JBQW9CLENBQUMsQ0FBQztBQUU5Rix3REFBd0Q7QUFDeEQsTUFBTSxpQ0FBaUMsR0FBRyx5QkFBeUIsQ0FBQztBQUVwRTs7O0dBR0c7QUFDSCxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxjQUFjLENBQUM7QUFnRXRELDhFQUE4RTtBQUM5RSxpQkFBaUI7QUFDakIsOEVBQThFO0FBRTlFLDZGQUE2RjtBQUM3RixNQUFNLG1CQUFtQixHQUFHLElBQUksR0FBRyxDQUNsQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsR0FBRyxD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