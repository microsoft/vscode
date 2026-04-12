"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchDataProviders = fetchDataProviders;
const vscode_css_languageservice_1 = require("vscode-css-languageservice");
function fetchDataProviders(dataPaths, requestService) {
    const providers = dataPaths.map(async (p) => {
        try {
            const content = await requestService.getContent(p);
            return parseCSSData(content);
        }
        catch (e) {
            return (0, vscode_css_languageservice_1.newCSSDataProvider)({ version: 1 });
        }
    });
    return Promise.all(providers);
}
function parseCSSData(source) {
    let rawData;
    try {
        rawData = JSON.parse(source);
    }
    catch (err) {
        return (0, vscode_css_languageservice_1.newCSSDataProvider)({ version: 1 });
    }
    return (0, vscode_css_languageservice_1.newCSSDataProvider)({
        version: rawData.version || 1,
        properties: rawData.properties || [],
        atDirectives: rawData.atDirectives || [],
        pseudoClasses: rawData.pseudoClasses || [],
        pseudoElements: rawData.pseudoElements || []
    });
}
//# sourceMappingURL=customData.js.map