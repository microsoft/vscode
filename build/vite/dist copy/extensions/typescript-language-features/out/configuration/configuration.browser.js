"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserServiceConfigurationProvider = void 0;
const configuration_1 = require("./configuration");
class BrowserServiceConfigurationProvider extends configuration_1.BaseServiceConfigurationProvider {
    // On browsers, we only support using the built-in TS version
    readGlobalTsdk(_configuration) {
        return null;
    }
    readLocalTsdk(_configuration) {
        return null;
    }
    // On browsers, we don't run TSServer on Node
    readLocalNodePath(_configuration) {
        return null;
    }
    readGlobalNodePath(_configuration) {
        return null;
    }
}
exports.BrowserServiceConfigurationProvider = BrowserServiceConfigurationProvider;
//# sourceMappingURL=configuration.browser.js.map