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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */
const vscode = __importStar(require("vscode"));
const configuration_1 = require("./utils/configuration");
const fileConfigurationManager_1 = __importDefault(require("./languageFeatures/fileConfigurationManager"));
const languageProvider_1 = __importDefault(require("./languageProvider"));
const logLevelMonitor_1 = require("./logging/logLevelMonitor");
const errorCodes = __importStar(require("./tsServer/protocol/errorCodes"));
const PConst = __importStar(require("./tsServer/protocol/protocol.const"));
const typeConverters = __importStar(require("./typeConverters"));
const typescriptServiceClient_1 = __importDefault(require("./typescriptServiceClient"));
const intellisenseStatus_1 = require("./ui/intellisenseStatus");
const LargeProjectStatus = __importStar(require("./ui/largeProjectStatus"));
const typingsStatus_1 = __importStar(require("./ui/typingsStatus"));
const versionStatus_1 = require("./ui/versionStatus");
const arrays_1 = require("./utils/arrays");
const dispose_1 = require("./utils/dispose");
// Style check diagnostics that can be reported as warnings
const styleCheckDiagnostics = new Set([
    ...errorCodes.variableDeclaredButNeverUsed,
    ...errorCodes.propertyDeclaretedButNeverUsed,
    ...errorCodes.allImportsAreUnused,
    ...errorCodes.unreachableCode,
    ...errorCodes.unusedLabel,
    ...errorCodes.fallThroughCaseInSwitch,
    ...errorCodes.notAllCodePathsReturnAValue,
]);
class TypeScriptServiceClientHost extends dispose_1.Disposable {
    client;
    languages = [];
    languagePerId = new Map();
    typingsStatus;
    fileConfigurationManager;
    reportStyleCheckAsWarnings = true;
    commandManager;
    constructor(descriptions, context, onCaseInsensitiveFileSystem, services, onCompletionAccepted) {
        super();
        this.commandManager = services.commandManager;
        const allModeIds = this.getAllModeIds(descriptions, services.pluginManager);
        this.client = this._register(new typescriptServiceClient_1.default(context, onCaseInsensitiveFileSystem, services, allModeIds));
        this.client.onDiagnosticsReceived(({ kind, resource, diagnostics, spans }) => {
            this.diagnosticsReceived(kind, resource, diagnostics, spans);
        }, null, this._disposables);
        this.client.onConfigDiagnosticsReceived(diag => this.configFileDiagnosticsReceived(diag), null, this._disposables);
        this.client.onResendModelsRequested(() => this.populateService(), null, this._disposables);
        this._register(new versionStatus_1.VersionStatus(this.client));
        this._register(new intellisenseStatus_1.IntellisenseStatus(this.client, services.commandManager, services.activeJsTsEditorTracker));
        this._register(new typingsStatus_1.AtaProgressReporter(this.client));
        this.typingsStatus = this._register(new typingsStatus_1.default(this.client));
        this._register(LargeProjectStatus.create(this.client));
        this.fileConfigurationManager = this._register(new fileConfigurationManager_1.default(this.client, onCaseInsensitiveFileSystem));
        for (const description of descriptions) {
            const manager = new languageProvider_1.default(this.client, description, this.commandManager, this.client.telemetryReporter, this.typingsStatus, this.fileConfigurationManager, onCompletionAccepted);
            this.languages.push(manager);
            this._register(manager);
            this.languagePerId.set(description.id, manager);
        }
        Promise.resolve().then(() => __importStar(require('./languageFeatures/updatePathsOnRename'))).then(module => this._register(module.register(this.client, this.fileConfigurationManager, uri => this.handles(uri))));
        Promise.resolve().then(() => __importStar(require('./languageFeatures/workspaceSymbols'))).then(module => this._register(module.register(this.client, allModeIds)));
        this.client.ensureServiceStarted();
        this.client.onReady(() => {
            const languages = new Set();
            for (const plugin of services.pluginManager.plugins) {
                if (plugin.configNamespace && plugin.languages.length) {
                    this.registerExtensionLanguageProvider({
                        id: plugin.configNamespace,
                        languageIds: Array.from(plugin.languages),
                        diagnosticSource: 'ts-plugin',
                        diagnosticLanguage: 1 /* DiagnosticLanguage.TypeScript */,
                        diagnosticOwner: 'typescript',
                        isExternal: true,
                        standardFileExtensions: [],
                    }, onCompletionAccepted);
                }
                else {
                    for (const language of plugin.languages) {
                        languages.add(language);
                    }
                }
            }
            if (languages.size) {
                this.registerExtensionLanguageProvider({
                    id: 'typescript-plugins',
                    languageIds: Array.from(languages.values()),
                    diagnosticSource: 'ts-plugin',
                    diagnosticLanguage: 1 /* DiagnosticLanguage.TypeScript */,
                    diagnosticOwner: 'typescript',
                    isExternal: true,
                    standardFileExtensions: [],
                }, onCompletionAccepted);
            }
        });
        this.client.onTsServerStarted(() => {
            this.triggerAllDiagnostics();
        });
        vscode.workspace.onDidChangeConfiguration(this.configurationChanged, this, this._disposables);
        this.configurationChanged();
        this._register(new logLevelMonitor_1.LogLevelMonitor(context));
    }
    registerExtensionLanguageProvider(description, onCompletionAccepted) {
        const manager = new languageProvider_1.default(this.client, description, this.commandManager, this.client.telemetryReporter, this.typingsStatus, this.fileConfigurationManager, onCompletionAccepted);
        this.languages.push(manager);
        this._register(manager);
        this.languagePerId.set(description.id, manager);
    }
    getAllModeIds(descriptions, pluginManager) {
        return [
            ...descriptions.map(x => x.languageIds),
            ...pluginManager.plugins.map(x => x.languages)
        ].flat();
    }
    get serviceClient() {
        return this.client;
    }
    reloadProjects() {
        this.client.executeWithoutWaitingForResponse('reloadProjects', null);
        this.triggerAllDiagnostics();
    }
    async handles(resource) {
        const provider = await this.findLanguage(resource);
        if (provider) {
            return true;
        }
        return this.client.bufferSyncSupport.handles(resource);
    }
    configurationChanged() {
        this.reportStyleCheckAsWarnings = (0, configuration_1.readUnifiedConfig)('reportStyleChecksAsWarnings', true, { scope: null, fallbackSection: 'typescript' });
    }
    async findLanguage(resource) {
        try {
            // First try finding language just based on the resource.
            // This is not strictly correct but should be in the vast majority of cases
            // (except when someone goes and maps `.js` to `typescript` or something...)
            for (const language of this.languages) {
                if (language.handlesUri(resource)) {
                    return language;
                }
            }
            // If that doesn't work, fallback to using a text document language mode.
            // This is not ideal since we have to open the document but should always
            // be correct
            const doc = await vscode.workspace.openTextDocument(resource);
            return this.languages.find(language => language.handlesDocument(doc));
        }
        catch {
            return undefined;
        }
    }
    triggerAllDiagnostics() {
        for (const language of this.languagePerId.values()) {
            language.triggerAllDiagnostics();
        }
    }
    populateService() {
        this.fileConfigurationManager.reset();
        for (const language of this.languagePerId.values()) {
            language.reInitialize();
        }
    }
    async diagnosticsReceived(kind, resource, diagnostics, spans) {
        const language = await this.findLanguage(resource);
        if (language) {
            language.diagnosticsReceived(kind, resource, this.createMarkerDatas(diagnostics, language.diagnosticSource), spans?.map(span => typeConverters.Range.fromTextSpan(span)));
        }
    }
    configFileDiagnosticsReceived(event) {
        // See https://github.com/microsoft/TypeScript/issues/10384
        const body = event.body;
        if (!body?.diagnostics || !body.configFile) {
            return;
        }
        this.findLanguage(this.client.toResource(body.configFile)).then(language => {
            language?.configFileDiagnosticsReceived(this.client.toResource(body.configFile), body.diagnostics.map(tsDiag => {
                const range = tsDiag.start && tsDiag.end ? typeConverters.Range.fromTextSpan(tsDiag) : new vscode.Range(0, 0, 0, 1);
                const diagnostic = new vscode.Diagnostic(range, tsDiag.text, this.getDiagnosticSeverity(tsDiag));
                diagnostic.source = language.diagnosticSource;
                return diagnostic;
            }));
        });
    }
    createMarkerDatas(diagnostics, source) {
        return diagnostics.map(tsDiag => this.tsDiagnosticToVsDiagnostic(tsDiag, source));
    }
    tsDiagnosticToVsDiagnostic(diagnostic, source) {
        const { start, end, text } = diagnostic;
        const range = new vscode.Range(typeConverters.Position.fromLocation(start), typeConverters.Position.fromLocation(end));
        const converted = new vscode.Diagnostic(range, text, this.getDiagnosticSeverity(diagnostic));
        converted.source = diagnostic.source || source;
        if (diagnostic.code) {
            converted.code = diagnostic.code;
        }
        const relatedInformation = diagnostic.relatedInformation;
        if (relatedInformation) {
            converted.relatedInformation = (0, arrays_1.coalesce)(relatedInformation.map((info) => {
                const span = info.span;
                if (!span) {
                    return undefined;
                }
                return new vscode.DiagnosticRelatedInformation(typeConverters.Location.fromTextSpan(this.client.toResource(span.file), span), info.message);
            }));
        }
        const tags = [];
        if (diagnostic.reportsUnnecessary) {
            tags.push(vscode.DiagnosticTag.Unnecessary);
        }
        if (diagnostic.reportsDeprecated) {
            tags.push(vscode.DiagnosticTag.Deprecated);
        }
        converted.tags = tags.length ? tags : undefined;
        const resultConverted = converted;
        resultConverted.reportUnnecessary = diagnostic.reportsUnnecessary;
        resultConverted.reportDeprecated = diagnostic.reportsDeprecated;
        return resultConverted;
    }
    getDiagnosticSeverity(diagnostic) {
        if (this.reportStyleCheckAsWarnings
            && this.isStyleCheckDiagnostic(diagnostic.code)
            && diagnostic.category === PConst.DiagnosticCategory.error) {
            return vscode.DiagnosticSeverity.Warning;
        }
        switch (diagnostic.category) {
            case PConst.DiagnosticCategory.error:
                return vscode.DiagnosticSeverity.Error;
            case PConst.DiagnosticCategory.warning:
                return vscode.DiagnosticSeverity.Warning;
            case PConst.DiagnosticCategory.suggestion:
                return vscode.DiagnosticSeverity.Hint;
            default:
                return vscode.DiagnosticSeverity.Error;
        }
    }
    isStyleCheckDiagnostic(code) {
        return typeof code === 'number' && styleCheckDiagnostics.has(code);
    }
}
exports.default = TypeScriptServiceClientHost;
//# sourceMappingURL=typeScriptServiceClientHost.js.map