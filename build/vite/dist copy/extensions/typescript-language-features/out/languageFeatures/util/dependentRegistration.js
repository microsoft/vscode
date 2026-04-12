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
exports.Condition = void 0;
exports.conditionalRegistration = conditionalRegistration;
exports.requireMinVersion = requireMinVersion;
exports.requireHasModifiedUnifiedConfig = requireHasModifiedUnifiedConfig;
exports.requireGlobalUnifiedConfig = requireGlobalUnifiedConfig;
exports.requireSomeCapability = requireSomeCapability;
exports.requireHasVsCodeExtension = requireHasVsCodeExtension;
const vscode = __importStar(require("vscode"));
const configuration_1 = require("../../utils/configuration");
const dispose_1 = require("../../utils/dispose");
class Condition extends dispose_1.Disposable {
    getValue;
    _value;
    constructor(getValue, onUpdate) {
        super();
        this.getValue = getValue;
        this._value = this.getValue();
        onUpdate(() => {
            const newValue = this.getValue();
            if (newValue !== this._value) {
                this._value = newValue;
                this._onDidChange.fire();
            }
        });
    }
    get value() { return this._value; }
    _onDidChange = this._register(new vscode.EventEmitter());
    onDidChange = this._onDidChange.event;
}
exports.Condition = Condition;
class ConditionalRegistration {
    conditions;
    doRegister;
    elseDoRegister;
    state;
    constructor(conditions, doRegister, elseDoRegister) {
        this.conditions = conditions;
        this.doRegister = doRegister;
        this.elseDoRegister = elseDoRegister;
        for (const condition of conditions) {
            condition.onDidChange(() => this.update());
        }
        this.update();
    }
    dispose() {
        this.state?.registration?.dispose();
        this.state = undefined;
    }
    update() {
        const enabled = this.conditions.every(condition => condition.value);
        if (enabled) {
            if (!this.state?.enabled) {
                this.state?.registration?.dispose();
                this.state = { enabled: true, registration: this.doRegister() };
            }
        }
        else {
            if (this.state?.enabled || !this.state) {
                this.state?.registration?.dispose();
                this.state = { enabled: false, registration: this.elseDoRegister?.() };
            }
        }
    }
}
function conditionalRegistration(conditions, doRegister, elseDoRegister) {
    return new ConditionalRegistration(conditions, doRegister, elseDoRegister);
}
function requireMinVersion(client, minVersion) {
    return new Condition(() => client.apiVersion.gte(minVersion), client.onTsServerStarted);
}
/**
 * Requires that a configuration value has been modified from its default value in either the global or workspace scope
 *
 * Does not check the value, only that it has been modified from the default.
 */
function requireHasModifiedUnifiedConfig(configValue, fallbackSection) {
    return new Condition(() => (0, configuration_1.hasModifiedUnifiedConfig)(configValue, { fallbackSection }), vscode.workspace.onDidChangeConfiguration);
}
function requireGlobalUnifiedConfig(configValue, options) {
    return new Condition(() => {
        return !!(0, configuration_1.readUnifiedConfig)(configValue, undefined, options);
    }, vscode.workspace.onDidChangeConfiguration);
}
function requireSomeCapability(client, ...capabilities) {
    return new Condition(() => capabilities.some(requiredCapability => client.capabilities.has(requiredCapability)), client.onDidChangeCapabilities);
}
function requireHasVsCodeExtension(extensionId) {
    return new Condition(() => {
        return !!vscode.extensions.getExtension(extensionId);
    }, vscode.extensions.onDidChange);
}
//# sourceMappingURL=dependentRegistration.js.map