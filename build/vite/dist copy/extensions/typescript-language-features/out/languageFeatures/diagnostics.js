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
exports.DiagnosticsManager = void 0;
const vscode = __importStar(require("vscode"));
const arrays = __importStar(require("../utils/arrays"));
const dispose_1 = require("../utils/dispose");
const objects_1 = require("../utils/objects");
const resourceMap_1 = require("../utils/resourceMap");
function diagnosticsEquals(a, b) {
    if (a === b) {
        return true;
    }
    return a.code === b.code
        && a.message === b.message
        && a.severity === b.severity
        && a.source === b.source
        && a.range.isEqual(b.range)
        && arrays.equals(a.relatedInformation || arrays.empty, b.relatedInformation || arrays.empty, (a, b) => {
            return a.message === b.message
                && a.location.range.isEqual(b.location.range)
                && a.location.uri.fsPath === b.location.uri.fsPath;
        })
        && arrays.equals(a.tags || arrays.empty, b.tags || arrays.empty);
}
class FileDiagnostics {
    file;
    language;
    _diagnostics = new Map();
    constructor(file, language) {
        this.file = file;
        this.language = language;
    }
    updateDiagnostics(language, kind, diagnostics, ranges) {
        if (language !== this.language) {
            this._diagnostics.clear();
            this.language = language;
        }
        const existing = this._diagnostics.get(kind);
        if (existing?.length === 0 && diagnostics.length === 0) {
            // No need to update
            return false;
        }
        if (kind === 3 /* DiagnosticKind.RegionSemantic */) {
            return this.updateRegionDiagnostics(diagnostics, ranges);
        }
        this._diagnostics.set(kind, diagnostics);
        return true;
    }
    getAllDiagnostics(settings) {
        if (!settings.getValidate(this.language)) {
            return [];
        }
        return [
            ...this.get(0 /* DiagnosticKind.Syntax */),
            ...this.get(1 /* DiagnosticKind.Semantic */),
            ...this.getSuggestionDiagnostics(settings),
        ];
    }
    delete(toDelete) {
        for (const [type, diags] of this._diagnostics) {
            this._diagnostics.set(type, diags.filter(diag => !diagnosticsEquals(diag, toDelete)));
        }
    }
    /**
     * @param ranges The ranges whose diagnostics were updated.
     */
    updateRegionDiagnostics(diagnostics, ranges) {
        if (!this._diagnostics.get(1 /* DiagnosticKind.Semantic */)) {
            this._diagnostics.set(1 /* DiagnosticKind.Semantic */, diagnostics);
            return true;
        }
        const oldDiagnostics = this._diagnostics.get(1 /* DiagnosticKind.Semantic */);
        const newDiagnostics = oldDiagnostics.filter(diag => !ranges.some(range => diag.range.intersection(range)));
        newDiagnostics.push(...diagnostics);
        this._diagnostics.set(1 /* DiagnosticKind.Semantic */, newDiagnostics);
        return true;
    }
    getSuggestionDiagnostics(settings) {
        const enableSuggestions = settings.getEnableSuggestions(this.language);
        return this.get(2 /* DiagnosticKind.Suggestion */).filter(x => {
            if (!enableSuggestions) {
                // Still show unused
                return x.tags && (x.tags.includes(vscode.DiagnosticTag.Unnecessary) || x.tags.includes(vscode.DiagnosticTag.Deprecated));
            }
            return true;
        });
    }
    get(kind) {
        return this._diagnostics.get(kind) || [];
    }
}
function areLanguageDiagnosticSettingsEqual(currentSettings, newSettings) {
    return currentSettings.validate === newSettings.validate
        && currentSettings.enableSuggestions === newSettings.enableSuggestions;
}
class DiagnosticSettings {
    static defaultSettings = {
        validate: true,
        enableSuggestions: true
    };
    _languageSettings = new Map();
    getValidate(language) {
        return this.get(language).validate;
    }
    setValidate(language, value) {
        return this.update(language, settings => ({
            validate: value,
            enableSuggestions: settings.enableSuggestions,
        }));
    }
    getEnableSuggestions(language) {
        return this.get(language).enableSuggestions;
    }
    setEnableSuggestions(language, value) {
        return this.update(language, settings => ({
            validate: settings.validate,
            enableSuggestions: value
        }));
    }
    get(language) {
        return this._languageSettings.get(language) || DiagnosticSettings.defaultSettings;
    }
    update(language, f) {
        const currentSettings = this.get(language);
        const newSettings = f(currentSettings);
        this._languageSettings.set(language, newSettings);
        return !areLanguageDiagnosticSettingsEqual(currentSettings, newSettings);
    }
}
class DiagnosticsTelemetryManager extends dispose_1.Disposable {
    _telemetryReporter;
    _diagnosticsCollection;
    _diagnosticCodesMap = new Map();
    _diagnosticSnapshotsMap = new resourceMap_1.ResourceMap(uri => uri.toString(), { onCaseInsensitiveFileSystem: false });
    _timeout;
    _telemetryEmitter;
    constructor(_telemetryReporter, _diagnosticsCollection) {
        super();
        this._telemetryReporter = _telemetryReporter;
        this._diagnosticsCollection = _diagnosticsCollection;
        this._register(vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'typescript' || e.document.languageId === 'typescriptreact') {
                this._updateAllDiagnosticCodesAfterTimeout();
            }
        }));
        this._updateAllDiagnosticCodesAfterTimeout();
        this._registerTelemetryEventEmitter();
    }
    logDiagnosticsPerformanceTelemetry(performanceData) {
        for (const data of performanceData) {
            /* __GDPR__
                "diagnostics.performance" : {
                    "owner": "mjbvz",
                    "syntaxDiagDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                    "semanticDiagDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                    "suggestionDiagDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                    "regionSemanticDiagDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                    "fileLineCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                    "${include}": [
                        "${TypeScriptCommonProperties}"
                    ]
                }
            */
            this._telemetryReporter.logTelemetry('diagnostics.performance', {
                syntaxDiagDuration: data.syntaxDiag,
                semanticDiagDuration: data.semanticDiag,
                suggestionDiagDuration: data.suggestionDiag,
                regionSemanticDiagDuration: data.regionSemanticDiag,
                fileLineCount: data.fileLineCount,
            });
        }
    }
    _updateAllDiagnosticCodesAfterTimeout() {
        clearTimeout(this._timeout);
        this._timeout = setTimeout(() => this._updateDiagnosticCodes(), 5000);
    }
    _increaseDiagnosticCodeCount(code) {
        if (code === undefined) {
            return;
        }
        this._diagnosticCodesMap.set(Number(code), (this._diagnosticCodesMap.get(Number(code)) || 0) + 1);
    }
    _updateDiagnosticCodes() {
        this._diagnosticsCollection.forEach((uri, diagnostics) => {
            const previousDiagnostics = this._diagnosticSnapshotsMap.get(uri);
            this._diagnosticSnapshotsMap.set(uri, diagnostics);
            const diagnosticsDiff = diagnostics.filter((diagnostic) => !previousDiagnostics?.some((previousDiagnostic) => (0, objects_1.equals)(diagnostic, previousDiagnostic)));
            diagnosticsDiff.forEach((diagnostic) => {
                const code = diagnostic.code;
                this._increaseDiagnosticCodeCount(typeof code === 'string' || typeof code === 'number' ? code : code?.value);
            });
        });
    }
    _registerTelemetryEventEmitter() {
        this._telemetryEmitter = setInterval(() => {
            if (this._diagnosticCodesMap.size > 0) {
                let diagnosticCodes = '';
                this._diagnosticCodesMap.forEach((value, key) => {
                    diagnosticCodes += `${key}:${value},`;
                });
                this._diagnosticCodesMap.clear();
                /* __GDPR__
                    "typescript.diagnostics" : {
                        "owner": "aiday-mar",
                        "diagnosticCodes" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
                        "${include}": [
                            "${TypeScriptCommonProperties}"
                        ]
                    }
                */
                this._telemetryReporter.logTelemetry('typescript.diagnostics', {
                    diagnosticCodes: diagnosticCodes
                });
            }
        }, 5 * 60 * 1000); // 5 minutes
    }
    dispose() {
        super.dispose();
        clearTimeout(this._timeout);
        clearInterval(this._telemetryEmitter);
    }
}
class DiagnosticsManager extends dispose_1.Disposable {
    _diagnostics;
    _settings = new DiagnosticSettings();
    _currentDiagnostics;
    _pendingUpdates;
    _updateDelay = 50;
    _diagnosticsTelemetryManager;
    constructor(owner, configuration, telemetryReporter, onCaseInsensitiveFileSystem) {
        super();
        this._diagnostics = new resourceMap_1.ResourceMap(undefined, { onCaseInsensitiveFileSystem });
        this._pendingUpdates = new resourceMap_1.ResourceMap(undefined, { onCaseInsensitiveFileSystem });
        this._currentDiagnostics = this._register(vscode.languages.createDiagnosticCollection(owner));
        // Here we are selecting only 1 user out of 1000 to send telemetry diagnostics
        if (Math.random() * 1000 <= 1 || configuration.enableDiagnosticsTelemetry) {
            this._diagnosticsTelemetryManager = this._register(new DiagnosticsTelemetryManager(telemetryReporter, this._currentDiagnostics));
        }
    }
    dispose() {
        super.dispose();
        for (const value of this._pendingUpdates.values()) {
            clearTimeout(value);
        }
        this._pendingUpdates.clear();
    }
    reInitialize() {
        this._currentDiagnostics.clear();
        this._diagnostics.clear();
    }
    setValidate(language, value) {
        const didUpdate = this._settings.setValidate(language, value);
        if (didUpdate) {
            this.rebuildAll();
        }
    }
    setEnableSuggestions(language, value) {
        const didUpdate = this._settings.setEnableSuggestions(language, value);
        if (didUpdate) {
            this.rebuildAll();
        }
    }
    updateDiagnostics(file, language, kind, diagnostics, ranges) {
        let didUpdate = false;
        const entry = this._diagnostics.get(file);
        if (entry) {
            didUpdate = entry.updateDiagnostics(language, kind, diagnostics, ranges);
        }
        else if (diagnostics.length) {
            const fileDiagnostics = new FileDiagnostics(file, language);
            fileDiagnostics.updateDiagnostics(language, kind, diagnostics, ranges);
            this._diagnostics.set(file, fileDiagnostics);
            didUpdate = true;
        }
        if (didUpdate) {
            this.scheduleDiagnosticsUpdate(file);
        }
    }
    configFileDiagnosticsReceived(file, diagnostics) {
        this._currentDiagnostics.set(file, diagnostics);
    }
    deleteAllDiagnosticsInFile(resource) {
        this._currentDiagnostics.delete(resource);
        this._diagnostics.delete(resource);
    }
    deleteDiagnostic(resource, diagnostic) {
        const fileDiagnostics = this._diagnostics.get(resource);
        if (fileDiagnostics) {
            fileDiagnostics.delete(diagnostic);
            this.rebuildFile(fileDiagnostics);
        }
    }
    getDiagnostics(file) {
        return this._currentDiagnostics.get(file) || [];
    }
    logDiagnosticsPerformanceTelemetry(performanceData) {
        this._diagnosticsTelemetryManager?.logDiagnosticsPerformanceTelemetry(performanceData);
    }
    scheduleDiagnosticsUpdate(file) {
        if (!this._pendingUpdates.has(file)) {
            this._pendingUpdates.set(file, setTimeout(() => this.updateCurrentDiagnostics(file), this._updateDelay));
        }
    }
    updateCurrentDiagnostics(file) {
        if (this._pendingUpdates.has(file)) {
            clearTimeout(this._pendingUpdates.get(file));
            this._pendingUpdates.delete(file);
        }
        const fileDiagnostics = this._diagnostics.get(file);
        this._currentDiagnostics.set(file, fileDiagnostics ? fileDiagnostics.getAllDiagnostics(this._settings) : []);
    }
    rebuildAll() {
        this._currentDiagnostics.clear();
        for (const fileDiagnostic of this._diagnostics.values()) {
            this.rebuildFile(fileDiagnostic);
        }
    }
    rebuildFile(fileDiagnostic) {
        this._currentDiagnostics.set(fileDiagnostic.file, fileDiagnostic.getAllDiagnostics(this._settings));
    }
}
exports.DiagnosticsManager = DiagnosticsManager;
//# sourceMappingURL=diagnostics.js.map