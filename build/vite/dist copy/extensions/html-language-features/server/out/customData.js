"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchHTMLDataProviders = fetchHTMLDataProviders;
const vscode_html_languageservice_1 = require("vscode-html-languageservice");
function fetchHTMLDataProviders(dataPaths, requestService) {
    const providers = dataPaths.map(async (p) => {
        try {
            const content = await requestService.getContent(p);
            return parseHTMLData(p, content);
        }
        catch (e) {
            return (0, vscode_html_languageservice_1.newHTMLDataProvider)(p, { version: 1 });
        }
    });
    return Promise.all(providers);
}
function parseHTMLData(id, source) {
    let rawData;
    try {
        rawData = JSON.parse(source);
    }
    catch (err) {
        return (0, vscode_html_languageservice_1.newHTMLDataProvider)(id, { version: 1 });
    }
    return (0, vscode_html_languageservice_1.newHTMLDataProvider)(id, {
        version: rawData.version || 1,
        tags: rawData.tags || [],
        globalAttributes: rawData.globalAttributes || [],
        valueSets: rawData.valueSets || []
    });
}
//# sourceMappingURL=customData.js.map