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
import { IUriIdentityService } from './uriIdentity.js';
import { URI } from '../../../base/common/uri.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { IFileService } from '../../files/common/files.js';
import { ExtUri, normalizePath } from '../../../base/common/resources.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { quickSelect } from '../../../base/common/arrays.js';
class Entry {
    static { this._clock = 0; }
    constructor(uri) {
        this.uri = uri;
        this.time = Entry._clock++;
    }
    touch() {
        this.time = Entry._clock++;
        return this;
    }
}
let UriIdentityService = class UriIdentityService {
    constructor(_fileService) {
        this._fileService = _fileService;
        this._dispooables = new DisposableStore();
        this._limit = 2 ** 16;
        const schemeIgnoresPathCasingCache = new Map();
        // assume path casing matters unless the file system provider spec'ed the opposite.
        // for all other cases path casing matters, e.g for
        // * virtual documents
        // * in-memory uris
        // * all kind of "private" schemes
        const ignorePathCasing = (uri) => {
            let ignorePathCasing = schemeIgnoresPathCasingCache.get(uri.scheme);
            if (ignorePathCasing === undefined) {
                // retrieve once and then case per scheme until a change happens
                ignorePathCasing = _fileService.hasProvider(uri) && !this._fileService.hasCapability(uri, 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */);
                schemeIgnoresPathCasingCache.set(uri.scheme, ignorePathCasing);
            }
            return ignorePathCasing;
        };
        this._dispooables.add(Event.any(_fileService.onDidChangeFileSystemProviderRegistrations, _fileService.onDidChangeFileSystemProviderCapabilities)(e => {
            const oldIgnorePathCasingValue = schemeIgnoresPathCasingCache.get(e.scheme);
            if (oldIgnorePathCasingValue === undefined) {
                return;
            }
            schemeIgnoresPathCasingCache.delete(e.scheme);
            const newIgnorePathCasingValue = ignorePathCasing(URI.from({ scheme: e.scheme }));
            if (newIgnorePathCasingValue === newIgnorePathCasingValue) {
                return;
            }
            for (const [key, entry] of this._canonicalUris.entries()) {
                if (entry.uri.scheme !== e.scheme) {
                    continue;
                }
                this._canonicalUris.delete(key);
            }
        }));
        this.extUri = new ExtUri(ignorePathCasing);
        this._canonicalUris = new Map();
    }
    dispose() {
        this._dispooables.dispose();
        this._canonicalUris.clear();
    }
    asCanonicalUri(uri) {
        // (1) normalize URI
        if (this._fileService.hasProvider(uri)) {
            uri = normalizePath(uri);
        }
        // (2) find the uri in its canonical form or use this uri to define it
        const uriKey = this.extUri.getComparisonKey(uri, true);
        const item = this._canonicalUris.get(uriKey);
        if (item) {
            return item.touch().uri.with({ fragment: uri.fragment });
        }
        // this uri is first and defines the canonical form
        this._canonicalUris.set(uriKey, new Entry(uri));
        this._checkTrim();
        return uri;
    }
    _checkTrim() {
        if (this._canonicalUris.size < this._limit) {
            return;
        }
        Entry._clock = 1;
        const times = [...this._canonicalUris.values()].map(e => e.time);
        const median = quickSelect(Math.floor(times.length / 2), times, (a, b) => a - b);
        for (const [key, entry] of this._canonicalUris.entries()) {
            // Its important to remove the median value here (<= not <).
            // If we have not touched any items since the last trim, the
            // median will be 0 and no items will be removed otherwise.
            if (entry.time <= median) {
                this._canonicalUris.delete(key);
            }
            else {
                entry.time = 0;
            }
        }
    }
};
UriIdentityService = __decorate([
    __param(0, IFileService)
], UriIdentityService);
export { UriIdentityService };
registerSingleton(IUriIdentityService, UriIdentityService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpSWRlbnRpdHlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUN2RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxZQUFZLEVBQW9ILE1BQU0sNkJBQTZCLENBQUM7QUFDN0ssT0FBTyxFQUFFLE1BQU0sRUFBVyxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNuRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUU3RCxNQUFNLEtBQUs7YUFDSCxXQUFNLEdBQUcsQ0FBQyxBQUFKLENBQUs7SUFFbEIsWUFBcUIsR0FBUTtRQUFSLFFBQUcsR0FBSCxHQUFHLENBQUs7UUFEN0IsU0FBSSxHQUFXLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNHLENBQUM7SUFDbEMsS0FBSztRQUNKLElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQzNCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQzs7QUFHSyxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFrQjtJQVU5QixZQUEwQixZQUEyQztRQUExQixpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUpwRCxpQkFBWSxHQUFH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