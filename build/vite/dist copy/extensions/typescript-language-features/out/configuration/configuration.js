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
exports.BaseServiceConfigurationProvider = exports.ImplicitProjectConfiguration = exports.TsServerLogLevel = void 0;
exports.areServiceConfigurationsEqual = areServiceConfigurationsEqual;
const vscode = __importStar(require("vscode"));
const configuration_1 = require("../utils/configuration");
const objects = __importStar(require("../utils/objects"));
var TsServerLogLevel;
(function (TsServerLogLevel) {
    TsServerLogLevel[TsServerLogLevel["Off"] = 0] = "Off";
    TsServerLogLevel[TsServerLogLevel["Normal"] = 1] = "Normal";
    TsServerLogLevel[TsServerLogLevel["Terse"] = 2] = "Terse";
    TsServerLogLevel[TsServerLogLevel["Verbose"] = 3] = "Verbose";
    TsServerLogLevel[TsServerLogLevel["RequestTime"] = 4] = "RequestTime";
})(TsServerLogLevel || (exports.TsServerLogLevel = TsServerLogLevel = {}));
(function (TsServerLogLevel) {
    function fromString(value) {
        switch (value?.toLowerCase()) {
            case 'normal':
                return TsServerLogLevel.Normal;
            case 'terse':
                return TsServerLogLevel.Terse;
            case 'verbose':
                return TsServerLogLevel.Verbose;
            case 'requestTime':
                return TsServerLogLevel.RequestTime;
            case 'off':
            default:
                return TsServerLogLevel.Off;
        }
    }
    TsServerLogLevel.fromString = fromString;
    function toString(value) {
        switch (value) {
            case TsServerLogLevel.Normal:
                return 'normal';
            case TsServerLogLevel.Terse:
                return 'terse';
            case TsServerLogLevel.Verbose:
                return 'verbose';
            case TsServerLogLevel.RequestTime:
                return 'requestTime';
            case TsServerLogLevel.Off:
            default:
                return 'off';
        }
    }
    TsServerLogLevel.toString = toString;
})(TsServerLogLevel || (exports.TsServerLogLevel = TsServerLogLevel = {}));
class ImplicitProjectConfiguration {
    target;
    module;
    checkJs;
    experimentalDecorators;
    strictNullChecks;
    strictFunctionTypes;
    strict;
    constructor(configuration) {
        this.target = ImplicitProjectConfiguration.readTarget(configuration);
        this.module = ImplicitProjectConfiguration.readModule(configuration);
        this.checkJs = ImplicitProjectConfiguration.readCheckJs(configuration);
        this.experimentalDecorators = ImplicitProjectConfiguration.readExperimentalDecorators(configuration);
        this.strictNullChecks = ImplicitProjectConfiguration.readImplicitStrictNullChecks(configuration);
        this.strictFunctionTypes = ImplicitProjectConfiguration.readImplicitStrictFunctionTypes(configuration);
        this.strict = ImplicitProjectConfiguration.readImplicitStrict(configuration);
    }
    isEqualTo(other) {
        return objects.equals(this, other);
    }
    static readTarget(configuration) {
        return configuration.get('js/ts.implicitProjectConfig.target');
    }
    static readModule(configuration) {
        return configuration.get('js/ts.implicitProjectConfig.module');
    }
    static readCheckJs(configuration) {
        return configuration.get('js/ts.implicitProjectConfig.checkJs', false);
    }
    static readExperimentalDecorators(configuration) {
        return configuration.get('js/ts.implicitProjectConfig.experimentalDecorators', false);
    }
    static readImplicitStrictNullChecks(configuration) {
        return configuration.get('js/ts.implicitProjectConfig.strictNullChecks', true);
    }
    static readImplicitStrictFunctionTypes(configuration) {
        return configuration.get('js/ts.implicitProjectConfig.strictFunctionTypes', true);
    }
    static readImplicitStrict(configuration) {
        return configuration.get('js/ts.implicitProjectConfig.strict', true);
    }
}
exports.ImplicitProjectConfiguration = ImplicitProjectConfiguration;
function areServiceConfigurationsEqual(a, b) {
    return objects.equals(a, b);
}
const vscodeWatcherName = 'vscode';
class BaseServiceConfigurationProvider {
    loadFromWorkspace() {
        const configuration = vscode.workspace.getConfiguration();
        return {
            locale: this.readLocale(),
            globalTsdk: this.readGlobalTsdk(configuration),
            localTsdk: this.readLocalTsdk(configuration),
            npmLocation: this.readNpmLocation(),
            tsServerLogLevel: this.readTsServerLogLevel(),
            tsServerPluginPaths: this.readTsServerPluginPaths(),
            implicitProjectConfiguration: new ImplicitProjectConfiguration(configuration),
            disableAutomaticTypeAcquisition: this.readDisableAutomaticTypeAcquisition(configuration),
            useSyntaxServer: this.readUseSyntaxServer(configuration),
            webProjectWideIntellisenseEnabled: this.readWebProjectWideIntellisenseEnable(),
            webProjectWideIntellisenseSuppressSemanticErrors: this.readWebProjectWideIntellisenseSuppressSemanticErrors(),
            webTypeAcquisitionEnabled: this.readWebTypeAcquisition(),
            enableDiagnosticsTelemetry: this.readEnableDiagnosticsTelemetry(),
            enableProjectDiagnostics: this.readEnableProjectDiagnostics(),
            maxTsServerMemory: this.readMaxTsServerMemory(),
            diagnosticDir: this.readDiagnosticDir(),
            heapSnapshot: this.readHeapSnapshot(),
            heapProfile: this.readHeapProfileConfiguration(),
            enablePromptUseWorkspaceTsdk: this.readEnablePromptUseWorkspaceTsdk(),
            useVsCodeWatcher: this.readUseVsCodeWatcher(configuration),
            watchOptions: this.readWatchOptions(),
            includePackageJsonAutoImports: this.readIncludePackageJsonAutoImports(),
            enableTsServerTracing: this.readEnableTsServerTracing(),
            localNodePath: this.readLocalNodePath(configuration),
            globalNodePath: this.readGlobalNodePath(configuration),
            workspaceSymbolsExcludeLibrarySymbols: this.readWorkspaceSymbolsExcludeLibrarySymbols(),
        };
    }
    readTsServerLogLevel() {
        const setting = (0, configuration_1.readUnifiedConfig)('tsserver.log', 'off', { fallbackSection: 'typescript' });
        return TsServerLogLevel.fromString(setting);
    }
    readTsServerPluginPaths() {
        return (0, configuration_1.readUnifiedConfig)('tsserver.pluginPaths', [], { fallbackSection: 'typescript' });
    }
    readNpmLocation() {
        return (0, configuration_1.readUnifiedConfig)('tsserver.npm.path', null, { fallbackSection: 'typescript', fallbackSubSectionNameOverride: 'npm' });
    }
    readDisableAutomaticTypeAcquisition(configuration) {
        const enabled = (0, configuration_1.readUnifiedConfig)('tsserver.automaticTypeAcquisition.enabled', undefined, { fallbackSection: 'typescript' });
        if (enabled !== undefined) {
            return !enabled;
        }
        // Fall back to the old deprecated setting
        return configuration.get('typescript.disableAutomaticTypeAcquisition', false);
    }
    readLocale() {
        const value = (0, configuration_1.readUnifiedConfig)('locale', 'auto', { fallbackSection: 'typescript' });
        return !value || value === 'auto' ? null : value;
    }
    readUseSyntaxServer(configuration) {
        const value = (0, configuration_1.readUnifiedConfig)('tsserver.useSyntaxServer', undefined, { fallbackSection: 'typescript' });
        switch (value) {
            case 'never': return 0 /* SyntaxServerConfiguration.Never */;
            case 'always': return 1 /* SyntaxServerConfiguration.Always */;
            case 'auto': return 2 /* SyntaxServerConfiguration.Auto */;
        }
        // Fallback to deprecated setting
        const deprecatedValue = configuration.get('typescript.tsserver.useSeparateSyntaxServer', true);
        if (deprecatedValue === 'forAllRequests') { // Undocumented setting
            return 1 /* SyntaxServerConfiguration.Always */;
        }
        if (deprecatedValue === true) {
            return 2 /* SyntaxServerConfiguration.Auto */;
        }
        return 0 /* SyntaxServerConfiguration.Never */;
    }
    readEnableDiagnosticsTelemetry() {
        // This setting does not appear in the settings view, as it is not to be enabled by users outside the team
        return (0, configuration_1.readUnifiedConfig)('enableDiagnosticsTelemetry', false, { fallbackSection: 'typescript' });
    }
    readEnableProjectDiagnostics() {
        return (0, configuration_1.readUnifiedConfig)('tsserver.experimental.enableProjectDiagnostics', false, { fallbackSection: 'typescript' });
    }
    readUseVsCodeWatcher(configuration) {
        const watcherExcludes = configuration.get('files.watcherExclude') ?? {};
        if (watcherExcludes['**/node_modules/*/**'] === true || // VS Code default prior to 1.94.x
            watcherExcludes['**/node_modules/**'] === true ||
            watcherExcludes['**/node_modules'] === true ||
            watcherExcludes['**'] === true // VS Code Watching is entirely disabled
        ) {
            return false;
        }
        const experimentalConfig = configuration.inspect('typescript.tsserver.experimental.useVsCodeWatcher');
        if (typeof experimentalConfig?.globalValue === 'boolean') {
            return experimentalConfig.globalValue;
        }
        if (typeof experimentalConfig?.workspaceValue === 'boolean') {
            return experimentalConfig.workspaceValue;
        }
        if (typeof experimentalConfig?.workspaceFolderValue === 'boolean') {
            return experimentalConfig.workspaceFolderValue;
        }
        return (0, configuration_1.readUnifiedConfig)('tsserver.watchOptions', vscodeWatcherName, { fallbackSection: 'typescript' }) === vscodeWatcherName;
    }
    readWatchOptions() {
        const watchOptions = (0, configuration_1.readUnifiedConfig)('tsserver.watchOptions', undefined, { fallbackSection: 'typescript' });
        if (!watchOptions || watchOptions === vscodeWatcherName) {
            return undefined;
        }
        // Returned value may be a proxy. Clone it into a normal object
        return { ...(watchOptions ?? {}) };
    }
    readIncludePackageJsonAutoImports() {
        return (0, configuration_1.readUnifiedConfig)('preferences.includePackageJsonAutoImports', undefined, { fallbackSection: 'typescript' });
    }
    readMaxTsServerMemory() {
        const defaultMaxMemory = 3072;
        const minimumMaxMemory = 128;
        const memoryInMB = (0, configuration_1.readUnifiedConfig)('tsserver.maxMemory', defaultMaxMemory, { fallbackSection: 'typescript', fallbackSubSectionNameOverride: 'tsserver.maxTsServerMemory' });
        if (!Number.isSafeInteger(memoryInMB)) {
            return defaultMaxMemory;
        }
        return Math.max(memoryInMB, minimumMaxMemory);
    }
    readDiagnosticDir() {
        const diagnosticDir = (0, configuration_1.readUnifiedConfig)('tsserver.diagnosticDir', undefined, { fallbackSection: 'typescript' });
        return typeof diagnosticDir === 'string' && diagnosticDir.length > 0 ? diagnosticDir : undefined;
    }
    readHeapSnapshot() {
        const defaultNearHeapLimitSnapshotCount = 0;
        const nearHeapLimitSnapshotCount = (0, configuration_1.readUnifiedConfig)('tsserver.heapSnapshot', defaultNearHeapLimitSnapshotCount, { fallbackSection: 'typescript' });
        if (!Number.isSafeInteger(nearHeapLimitSnapshotCount)) {
            return defaultNearHeapLimitSnapshotCount;
        }
        return Math.max(nearHeapLimitSnapshotCount, 0);
    }
    readHeapProfileConfiguration() {
        const defaultHeapProfileConfiguration = {
            enabled: false,
            dir: undefined,
            interval: undefined,
        };
        const rawConfig = (0, configuration_1.readUnifiedConfig)('tsserver.heapProfile', defaultHeapProfileConfiguration, { fallbackSection: 'typescript' });
        const enabled = typeof rawConfig.enabled === 'boolean' ? rawConfig.enabled : false;
        const dir = typeof rawConfig.dir === 'string' && rawConfig.dir.length > 0 ? rawConfig.dir : undefined;
        const interval = typeof rawConfig.interval === 'number' && Number.isSafeInteger(rawConfig.interval) && rawConfig.interval > 0
            ? rawConfig.interval
            : undefined;
        return {
            enabled,
            dir,
            interval,
        };
    }
    readEnablePromptUseWorkspaceTsdk() {
        return (0, configuration_1.readUnifiedConfig)('tsdk.promptToUseWorkspaceVersion', false, { fallbackSection: 'typescript', fallbackSubSectionNameOverride: 'enablePromptUseWorkspaceTsdk' });
    }
    readEnableTsServerTracing() {
        return (0, configuration_1.readUnifiedConfig)('tsserver.tracing.enabled', false, { fallbackSection: 'typescript', fallbackSubSectionNameOverride: 'tsserver.enableTracing' });
    }
    readWorkspaceSymbolsExcludeLibrarySymbols() {
        return (0, configuration_1.readUnifiedConfig)('workspaceSymbols.excludeLibrarySymbols', true, { scope: null, fallbackSection: 'typescript' });
    }
    readWebProjectWideIntellisenseEnable() {
        return (0, configuration_1.readUnifiedConfig)('tsserver.web.projectWideIntellisense.enabled', true, { fallbackSection: 'typescript' });
    }
    readWebProjectWideIntellisenseSuppressSemanticErrors() {
        return this.readWebTypeAcquisition() && (0, configuration_1.readUnifiedConfig)('tsserver.web.projectWideIntellisense.suppressSemanticErrors', false, { fallbackSection: 'typescript' });
    }
    readWebTypeAcquisition() {
        return (0, configuration_1.readUnifiedConfig)('tsserver.web.typeAcquisition.enabled', true, { fallbackSection: 'typescript' });
    }
}
exports.BaseServiceConfigurationProvider = BaseServiceConfigurationProvider;
//# sourceMappingURL=configuration.js.map