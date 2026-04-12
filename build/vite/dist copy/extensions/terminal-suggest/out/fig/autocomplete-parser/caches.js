"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSpecCache = exports.specCache = exports.resetCaches = exports.createCache = void 0;
const allCaches = [];
const createCache = () => {
    const cache = new Map();
    allCaches.push(cache);
    return cache;
};
exports.createCache = createCache;
const resetCaches = () => {
    allCaches.forEach((cache) => {
        cache.clear();
    });
};
exports.resetCaches = resetCaches;
// window.resetCaches = resetCaches;
exports.specCache = (0, exports.createCache)();
exports.generateSpecCache = (0, exports.createCache)();
// window.listCache = () => {
//   console.log(specCache);
//   console.log(generateSpecCache);
// };
//# sourceMappingURL=caches.js.map