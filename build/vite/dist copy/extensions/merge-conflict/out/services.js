"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode = __importStar(require("vscode"));
const documentTracker_1 = __importDefault(require("./documentTracker"));
const codelensProvider_1 = __importDefault(require("./codelensProvider"));
const commandHandler_1 = __importDefault(require("./commandHandler"));
const contentProvider_1 = __importDefault(require("./contentProvider"));
const mergeDecorator_1 = __importDefault(require("./mergeDecorator"));
const extension_telemetry_1 = __importDefault(require("@vscode/extension-telemetry"));
const ConfigurationSectionName = 'merge-conflict';
class ServiceWrapper {
    context;
    services = [];
    telemetryReporter;
    constructor(context) {
        this.context = context;
        const { aiKey } = context.extension.packageJSON;
        this.telemetryReporter = new extension_telemetry_1.default(aiKey);
        context.subscriptions.push(this.telemetryReporter);
    }
    begin() {
        const configuration = this.createExtensionConfiguration();
        const documentTracker = new documentTracker_1.default(this.telemetryReporter);
        this.services.push(documentTracker, new commandHandler_1.default(documentTracker), new codelensProvider_1.default(documentTracker), new contentProvider_1.default(this.context), new mergeDecorator_1.default(this.context, documentTracker));
        this.services.forEach((service) => {
            if (service.begin && service.begin instanceof Function) {
                service.begin(configuration);
            }
        });
        vscode.workspace.onDidChangeConfiguration(() => {
            this.services.forEach((service) => {
                if (service.configurationUpdated && service.configurationUpdated instanceof Function) {
                    service.configurationUpdated(this.createExtensionConfiguration());
                }
            });
        });
    }
    createExtensionConfiguration() {
        const workspaceConfiguration = vscode.workspace.getConfiguration(ConfigurationSectionName);
        const codeLensEnabled = workspaceConfiguration.get('codeLens.enabled', true);
        const decoratorsEnabled = workspaceConfiguration.get('decorators.enabled', true);
        return {
            enableCodeLens: codeLensEnabled,
            enableDecorations: decoratorsEnabled,
            enableEditorOverview: decoratorsEnabled
        };
    }
    dispose() {
        this.services.forEach(disposable => disposable.dispose());
        this.services = [];
    }
}
exports.default = ServiceWrapper;
//# sourceMappingURL=services.js.map