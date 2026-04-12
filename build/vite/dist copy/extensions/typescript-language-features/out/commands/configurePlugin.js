"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurePluginCommand = void 0;
class ConfigurePluginCommand {
    pluginManager;
    id = '_typescript.configurePlugin';
    constructor(pluginManager) {
        this.pluginManager = pluginManager;
    }
    execute(pluginId, configuration) {
        this.pluginManager.setConfiguration(pluginId, configuration);
    }
}
exports.ConfigurePluginCommand = ConfigurePluginCommand;
//# sourceMappingURL=configurePlugin.js.map