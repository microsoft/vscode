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
exports.ResourceUnifiedConfigValue = exports.UnifiedConfigValue = exports.unifiedConfigSection = void 0;
exports.readUnifiedConfig = readUnifiedConfig;
exports.hasModifiedUnifiedConfig = hasModifiedUnifiedConfig;
const vscode = __importStar(require("vscode"));
const dispose_1 = require("./dispose");
exports.unifiedConfigSection = 'js/ts';
/**
 * Gets a configuration value, checking the unified `js/ts` setting first,
 * then falling back to the language-specific setting.
 */
function readUnifiedConfig(subSectionName, defaultValue, options) {
    // Check unified setting first
    const unifiedConfig = vscode.workspace.getConfiguration(exports.unifiedConfigSection, options.scope);
    const unifiedInspect = unifiedConfig.inspect(subSectionName);
    if (hasModifiedValue(unifiedInspect)) {
        return unifiedConfig.get(subSectionName, defaultValue);
    }
    // Fall back to language-specific setting
    const languageConfig = vscode.workspace.getConfiguration(options.fallbackSection, options.scope);
    return languageConfig.get(options.fallbackSubSectionNameOverride ?? subSectionName, defaultValue);
}
/**
 * Checks if an inspected configuration value has any user-defined values set.
 */
function hasModifiedValue(inspect) {
    if (!inspect) {
        return false;
    }
    return (typeof inspect.globalValue !== 'undefined'
        || typeof inspect.workspaceValue !== 'undefined'
        || typeof inspect.workspaceFolderValue !== 'undefined'
        || typeof inspect.globalLanguageValue !== 'undefined'
        || typeof inspect.workspaceLanguageValue !== 'undefined'
        || typeof inspect.workspaceFolderLanguageValue !== 'undefined'
        || ((inspect.languageIds?.length ?? 0) > 0));
}
/**
 * Checks if a unified configuration value has been modified from its default value.
 */
function hasModifiedUnifiedConfig(subSectionName, options) {
    // Check unified setting
    const unifiedConfig = vscode.workspace.getConfiguration(exports.unifiedConfigSection, options.scope);
    if (hasModifiedValue(unifiedConfig.inspect(subSectionName))) {
        return true;
    }
    // Check language-specific setting
    const languageConfig = vscode.workspace.getConfiguration(options.fallbackSection, options.scope);
    return hasModifiedValue(languageConfig.inspect(subSectionName));
}
/**
 * A cached, observable unified configuration value.
 */
class UnifiedConfigValue extends dispose_1.Disposable {
    subSectionName;
    defaultValue;
    options;
    _value;
    _onDidChange = this._register(new vscode.EventEmitter());
    get onDidChange() { return this._onDidChange.event; }
    constructor(subSectionName, defaultValue, options) {
        super();
        this.subSectionName = subSectionName;
        this.defaultValue = defaultValue;
        this.options = options;
        this._value = this.read();
        this._register(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(`${exports.unifiedConfigSection}.${subSectionName}`, options.scope ?? undefined) ||
                e.affectsConfiguration(`${options.fallbackSection}.${options.fallbackSubSectionNameOverride ?? subSectionName}`, options.scope ?? undefined)) {
                const newValue = this.read();
                if (newValue !== this._value) {
                    this._value = newValue;
                    this._onDidChange.fire(newValue);
                }
            }
        }));
    }
    read() {
        return readUnifiedConfig(this.subSectionName, this.defaultValue, this.options);
    }
    getValue() {
        return this._value;
    }
}
exports.UnifiedConfigValue = UnifiedConfigValue;
/**
 * A cached, observable unified configuration value that varies per workspace folder.
 *
 * Values are keyed by the workspace folder the resource belongs to, with a separate
 * entry for resources outside any workspace folder.
 */
class ResourceUnifiedConfigValue extends dispose_1.Disposable {
    subSectionName;
    defaultValue;
    options;
    _cache = new Map();
    _onDidChange = this._register(new vscode.EventEmitter());
    onDidChange = this._onDidChange.event;
    constructor(subSectionName, defaultValue, options) {
        super();
        this.subSectionName = subSectionName;
        this.defaultValue = defaultValue;
        this.options = options;
        const fallbackName = options?.fallbackSubSectionNameOverride ?? subSectionName;
        this._register(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(`${exports.unifiedConfigSection}.${subSectionName}`) ||
                e.affectsConfiguration(`javascript.${fallbackName}`) ||
                e.affectsConfiguration(`typescript.${fallbackName}`)) {
                this._cache.clear();
                this._onDidChange.fire();
            }
        }));
        this._register(vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this._cache.clear();
            this._onDidChange.fire();
        }));
    }
    getValue(scope) {
        const key = this.keyFor(scope);
        const cached = this._cache.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const fallbackSection = this.fallbackSectionFor(scope.languageId);
        const value = readUnifiedConfig(this.subSectionName, this.defaultValue, {
            scope: { uri: scope.uri, languageId: scope.languageId },
            fallbackSection,
            fallbackSubSectionNameOverride: this.options?.fallbackSubSectionNameOverride,
        });
        this._cache.set(key, value);
        return value;
    }
    fallbackSectionFor(languageId) {
        switch (languageId) {
            case 'javascript':
            case 'javascriptreact':
                return 'javascript';
            default:
                return 'typescript';
        }
    }
    keyFor(scope) {
        const folder = vscode.workspace.getWorkspaceFolder(scope.uri);
        return folder ? folder.uri.toString() : '';
    }
}
exports.ResourceUnifiedConfigValue = ResourceUnifiedConfigValue;
//# sourceMappingURL=configuration.js.map