"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceMap = void 0;
const defaultResourceToKey = (resource) => resource.toString();
class ResourceMap {
    #map = new Map();
    #toKey;
    constructor(toKey = defaultResourceToKey) {
        this.#toKey = toKey;
    }
    set(uri, value) {
        this.#map.set(this.#toKey(uri), { uri, value });
        return this;
    }
    get(resource) {
        return this.#map.get(this.#toKey(resource))?.value;
    }
    has(resource) {
        return this.#map.has(this.#toKey(resource));
    }
    get size() {
        return this.#map.size;
    }
    clear() {
        this.#map.clear();
    }
    delete(resource) {
        return this.#map.delete(this.#toKey(resource));
    }
    *values() {
        for (const entry of this.#map.values()) {
            yield entry.value;
        }
    }
    *keys() {
        for (const entry of this.#map.values()) {
            yield entry.uri;
        }
    }
    *entries() {
        for (const entry of this.#map.values()) {
            yield [entry.uri, entry.value];
        }
    }
    [Symbol.iterator]() {
        return this.entries();
    }
}
exports.ResourceMap = ResourceMap;
//# sourceMappingURL=resourceMap.js.map