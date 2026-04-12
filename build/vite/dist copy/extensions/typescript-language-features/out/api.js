"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtensionApi = getExtensionApi;
class ApiV0 {
    onCompletionAccepted;
    _pluginManager;
    constructor(onCompletionAccepted, _pluginManager) {
        this.onCompletionAccepted = onCompletionAccepted;
        this._pluginManager = _pluginManager;
    }
    configurePlugin(pluginId, configuration) {
        this._pluginManager.setConfiguration(pluginId, configuration);
    }
}
function getExtensionApi(onCompletionAccepted, pluginManager) {
    return {
        getAPI(version) {
            if (version === 0) {
                return new ApiV0(onCompletionAccepted, pluginManager);
            }
            return undefined;
        }
    };
}
//# sourceMappingURL=api.js.map