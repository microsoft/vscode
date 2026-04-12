"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatorCache = exports.haveContextForGenerator = void 0;
exports.runCachedGenerator = runCachedGenerator;
const cache_1 = require("./cache");
const utils_1 = require("../../shared/utils");
const haveContextForGenerator = (context) => Boolean(context.currentWorkingDirectory);
exports.haveContextForGenerator = haveContextForGenerator;
exports.generatorCache = new cache_1.Cache();
async function runCachedGenerator(generator, context, initialRun, cacheKey /* This is generator.script or generator.script(...) */) {
    const cacheDefault = false; // getSetting<boolean>(SETTINGS.CACHE_ALL_GENERATORS) ?? false;
    let { cache } = generator;
    if (!cache && cacheDefault) {
        cache = { strategy: 'stale-while-revalidate', ttl: 1_000 };
    }
    if (!cache) {
        return initialRun();
    }
    const { tokenArray, currentWorkingDirectory, searchTerm } = context;
    const directory = generator.template
        ? (0, utils_1.getCWDForFilesAndFolders)(currentWorkingDirectory, searchTerm)
        : currentWorkingDirectory;
    // we cache generator results by script, if no script was provided we use the tokens instead
    const key = [
        cache.cacheByDirectory ? directory : undefined,
        cacheKey || tokenArray.join(' '),
    ].toString();
    return exports.generatorCache.entry(key, initialRun, cache);
}
//# sourceMappingURL=helpers.js.map