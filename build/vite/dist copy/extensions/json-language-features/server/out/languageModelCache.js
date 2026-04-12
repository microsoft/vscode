"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLanguageModelCache = getLanguageModelCache;
function getLanguageModelCache(maxEntries, cleanupIntervalTimeInSec, parse) {
    let languageModels = {};
    let nModels = 0;
    let cleanupInterval = undefined;
    if (cleanupIntervalTimeInSec > 0) {
        cleanupInterval = setInterval(() => {
            const cutoffTime = Date.now() - cleanupIntervalTimeInSec * 1000;
            const uris = Object.keys(languageModels);
            for (const uri of uris) {
                const languageModelInfo = languageModels[uri];
                if (languageModelInfo.cTime < cutoffTime) {
                    delete languageModels[uri];
                    nModels--;
                }
            }
        }, cleanupIntervalTimeInSec * 1000);
    }
    return {
        get(document) {
            const version = document.version;
            const languageId = document.languageId;
            const languageModelInfo = languageModels[document.uri];
            if (languageModelInfo && languageModelInfo.version === version && languageModelInfo.languageId === languageId) {
                languageModelInfo.cTime = Date.now();
                return languageModelInfo.languageModel;
            }
            const languageModel = parse(document);
            languageModels[document.uri] = { languageModel, version, languageId, cTime: Date.now() };
            if (!languageModelInfo) {
                nModels++;
            }
            if (nModels === maxEntries) {
                let oldestTime = Number.MAX_VALUE;
                let oldestUri = null;
                for (const uri in languageModels) {
                    const languageModelInfo = languageModels[uri];
                    if (languageModelInfo.cTime < oldestTime) {
                        oldestUri = uri;
                        oldestTime = languageModelInfo.cTime;
                    }
                }
                if (oldestUri) {
                    delete languageModels[oldestUri];
                    nModels--;
                }
            }
            return languageModel;
        },
        onDocumentRemoved(document) {
            const uri = document.uri;
            if (languageModels[uri]) {
                delete languageModels[uri];
                nModels--;
            }
        },
        dispose() {
            if (typeof cleanupInterval !== 'undefined') {
                clearInterval(cleanupInterval);
                cleanupInterval = undefined;
                languageModels = {};
                nModels = 0;
            }
        }
    };
}
//# sourceMappingURL=languageModelCache.js.map