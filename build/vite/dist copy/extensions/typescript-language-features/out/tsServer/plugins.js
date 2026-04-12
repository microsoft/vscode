"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginManager = void 0;
const vscode = __importStar(require("vscode"));
const arrays = __importStar(require("../utils/arrays"));
const dispose_1 = require("../utils/dispose");
var TypeScriptServerPlugin;
(function (TypeScriptServerPlugin) {
    function equals(a, b) {
        return a.uri.toString() === b.uri.toString()
            && a.name === b.name
            && a.enableForWorkspaceTypeScriptVersions === b.enableForWorkspaceTypeScriptVersions
            && arrays.equals(a.languages, b.languages);
    }
    TypeScriptServerPlugin.equals = equals;
})(TypeScriptServerPlugin || (TypeScriptServerPlugin = {}));
class PluginManager extends dispose_1.Disposable {
    _pluginConfigurations = new Map();
    _plugins;
    constructor() {
        super();
        vscode.extensions.onDidChange(() => {
            if (!this._plugins) {
                return;
            }
            const newPlugins = this.readPlugins();
            if (!arrays.equals(Array.from(this._plugins.values()).flat(), Array.from(newPlugins.values()).flat(), TypeScriptServerPlugin.equals)) {
                this._plugins = newPlugins;
                this._onDidUpdatePlugins.fire(this);
            }
        }, undefined, this._disposables);
    }
    get plugins() {
        this._plugins ??= this.readPlugins();
        return Array.from(this._plugins.values()).flat();
    }
    _onDidUpdatePlugins = this._register(new vscode.EventEmitter());
    onDidChangePlugins = this._onDidUpdatePlugins.event;
    _onDidUpdateConfig = this._register(new vscode.EventEmitter());
    onDidUpdateConfig = this._onDidUpdateConfig.event;
    setConfiguration(pluginId, config) {
        this._pluginConfigurations.set(pluginId, config);
        this._onDidUpdateConfig.fire({ pluginId, config });
    }
    configurations() {
        return this._pluginConfigurations.entries();
    }
    readPlugins() {
        const pluginMap = new Map();
        for (const extension of vscode.extensions.all) {
            const pack = extension.packageJSON;
            if (pack.contributes && Array.isArray(pack.contributes.typescriptServerPlugins)) {
                const plugins = [];
                for (const plugin of pack.contributes.typescriptServerPlugins) {
                    plugins.push({
                        extension,
                        name: plugin.name,
                        enableForWorkspaceTypeScriptVersions: !!plugin.enableForWorkspaceTypeScriptVersions,
                        uri: extension.extensionUri,
                        languages: Array.isArray(plugin.languages) ? plugin.languages : [],
                        configNamespace: plugin.configNamespace,
                    });
                }
                if (plugins.length) {
                    pluginMap.set(extension.id, plugins);
                }
            }
        }
        return pluginMap;
    }
}
exports.PluginManager = PluginManager;
//# sourceMappingURL=plugins.js.map