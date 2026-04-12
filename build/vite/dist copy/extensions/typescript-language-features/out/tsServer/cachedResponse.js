"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachedResponse = void 0;
/**
 * Caches a class of TS Server request based on document.
 */
class CachedResponse {
    response;
    version = -1;
    document = '';
    /**
     * Execute a request. May return cached value or resolve the new value
     *
     * Caller must ensure that all input `resolve` functions return equivilent results (keyed only off of document).
     */
    execute(document, resolve) {
        if (this.response && this.matches(document)) {
            // Chain so that on cancellation we fall back to the next resolve
            return this.response = this.response.then(result => result.type === 'cancelled' ? resolve() : result);
        }
        return this.reset(document, resolve);
    }
    matches(document) {
        return this.version === document.version && this.document === document.uri.toString();
    }
    async reset(document, resolve) {
        this.version = document.version;
        this.document = document.uri.toString();
        return this.response = resolve();
    }
}
exports.CachedResponse = CachedResponse;
//# sourceMappingURL=cachedResponse.js.map