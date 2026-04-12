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
exports.register = register;
const vscode = __importStar(require("vscode"));
const api_1 = require("../tsServer/api");
const typeConverters_1 = require("../typeConverters");
const typescriptService_1 = require("../typescriptService");
const configuration_1 = require("../utils/configuration");
const dispose_1 = require("../utils/dispose");
const fileConfigurationManager_1 = require("./fileConfigurationManager");
const dependentRegistration_1 = require("./util/dependentRegistration");
const inlayHintSettingNames = Object.values(fileConfigurationManager_1.InlayHintSettingNames);
class TypeScriptInlayHintsProvider extends dispose_1.Disposable {
    language;
    client;
    fileConfigurationManager;
    telemetryReporter;
    static minVersion = api_1.API.v440;
    _onDidChangeInlayHints = this._register(new vscode.EventEmitter());
    onDidChangeInlayHints = this._onDidChangeInlayHints.event;
    hasReportedTelemetry = false;
    constructor(language, client, fileConfigurationManager, telemetryReporter) {
        super();
        this.language = language;
        this.client = client;
        this.fileConfigurationManager = fileConfigurationManager;
        this.telemetryReporter = telemetryReporter;
        this._register(vscode.workspace.onDidChangeConfiguration(e => {
            if (inlayHintSettingNames.some(settingName => e.affectsConfiguration(configuration_1.unifiedConfigSection + '.' + settingName) ||
                e.affectsConfiguration(language.id + '.' + settingName))) {
                this._onDidChangeInlayHints.fire();
            }
        }));
        // When a JS/TS file changes, change inlay hints for all visible editors
        // since changes in one file can effect the hints the others.
        this._register(vscode.workspace.onDidChangeTextDocument(e => {
            if (language.languageIds.includes(e.document.languageId)) {
                this._onDidChangeInlayHints.fire();
            }
        }));
    }
    async provideInlayHints(model, range, token) {
        const filepath = this.client.toOpenTsFilePath(model);
        if (!filepath) {
            return;
        }
        if (!areInlayHintsEnabledForFile(this.language, model)) {
            return;
        }
        const start = model.offsetAt(range.start);
        const length = model.offsetAt(range.end) - start;
        await this.fileConfigurationManager.ensureConfigurationForDocument(model, token);
        if (token.isCancellationRequested) {
            return;
        }
        if (!this.hasReportedTelemetry) {
            this.hasReportedTelemetry = true;
            /* __GDPR__
                "inlayHints.provide" : {
                    "owner": "mjbvz",
                    "${include}": [
                        "${TypeScriptCommonProperties}"
                    ]
                }
            */
            this.telemetryReporter.logTelemetry('inlayHints.provide', {});
        }
        const response = await this.client.execute('provideInlayHints', { file: filepath, start, length }, token);
        if (response.type !== 'response' || !response.success || !response.body) {
            return;
        }
        return response.body.map(hint => {
            const result = new vscode.InlayHint(typeConverters_1.Position.fromLocation(hint.position), this.convertInlayHintText(hint), fromProtocolInlayHintKind(hint.kind));
            result.paddingLeft = hint.whitespaceBefore;
            result.paddingRight = hint.whitespaceAfter;
            return result;
        });
    }
    convertInlayHintText(tsHint) {
        if (tsHint.displayParts) {
            return tsHint.displayParts.map((part) => {
                const out = new vscode.InlayHintLabelPart(part.text);
                if (part.span) {
                    out.location = typeConverters_1.Location.fromTextSpan(this.client.toResource(part.span.file), part.span);
                }
                return out;
            });
        }
        return tsHint.text;
    }
}
function fromProtocolInlayHintKind(kind) {
    switch (kind) {
        case 'Parameter': return vscode.InlayHintKind.Parameter;
        case 'Type': return vscode.InlayHintKind.Type;
        case 'Enum': return undefined;
        default: return undefined;
    }
}
function areInlayHintsEnabledForFile(language, document) {
    const preferences = (0, fileConfigurationManager_1.getInlayHintsPreferences)(document, language.id);
    return preferences.includeInlayParameterNameHints === 'literals' ||
        preferences.includeInlayParameterNameHints === 'all' ||
        preferences.includeInlayEnumMemberValueHints ||
        preferences.includeInlayFunctionLikeReturnTypeHints ||
        preferences.includeInlayFunctionParameterTypeHints ||
        preferences.includeInlayPropertyDeclarationTypeHints ||
        preferences.includeInlayVariableTypeHints;
}
function register(selector, language, client, fileConfigurationManager, telemetryReporter) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireMinVersion)(client, TypeScriptInlayHintsProvider.minVersion),
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.Semantic),
    ], () => {
        const provider = new TypeScriptInlayHintsProvider(language, client, fileConfigurationManager, telemetryReporter);
        return vscode.languages.registerInlayHintsProvider(selector.semantic, provider);
    });
}
//# sourceMappingURL=inlayHints.js.map