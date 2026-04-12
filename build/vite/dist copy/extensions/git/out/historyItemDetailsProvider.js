"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.provideSourceControlHistoryItemAvatar = provideSourceControlHistoryItemAvatar;
exports.provideSourceControlHistoryItemHoverCommands = provideSourceControlHistoryItemHoverCommands;
exports.provideSourceControlHistoryItemMessageLinks = provideSourceControlHistoryItemMessageLinks;
const api1_1 = require("./api/api1");
async function provideSourceControlHistoryItemAvatar(registry, repository, query) {
    for (const provider of registry.getSourceControlHistoryItemDetailsProviders()) {
        const result = await provider.provideAvatar(new api1_1.ApiRepository(repository), query);
        if (result) {
            return result;
        }
    }
    return undefined;
}
async function provideSourceControlHistoryItemHoverCommands(registry, repository) {
    for (const provider of registry.getSourceControlHistoryItemDetailsProviders()) {
        const result = await provider.provideHoverCommands(new api1_1.ApiRepository(repository));
        if (result) {
            return result;
        }
    }
    return undefined;
}
async function provideSourceControlHistoryItemMessageLinks(registry, repository, message) {
    for (const provider of registry.getSourceControlHistoryItemDetailsProviders()) {
        const result = await provider.provideMessageLinks(new api1_1.ApiRepository(repository), message);
        if (result) {
            return result;
        }
    }
    return undefined;
}
//# sourceMappingURL=historyItemDetailsProvider.js.map