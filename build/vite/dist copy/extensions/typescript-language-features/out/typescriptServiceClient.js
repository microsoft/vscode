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
exports.inMemoryResourcePrefix = exports.emptyAuthority = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const configuration_1 = require("./configuration/configuration");
const fileSchemes = __importStar(require("./configuration/fileSchemes"));
const schemes_1 = require("./configuration/schemes");
const diagnostics_1 = require("./languageFeatures/diagnostics");
const telemetry_1 = require("./logging/telemetry");
const tracer_1 = __importDefault(require("./logging/tracer"));
const tsconfig_1 = require("./tsconfig");
const api_1 = require("./tsServer/api");
const bufferSyncSupport_1 = __importDefault(require("./tsServer/bufferSyncSupport"));
const nodeManager_1 = require("./tsServer/nodeManager");
const pluginPathsProvider_1 = require("./tsServer/pluginPathsProvider");
const protocol_const_1 = require("./tsServer/protocol/protocol.const");
const serverError_1 = require("./tsServer/serverError");
const spawner_1 = require("./tsServer/spawner");
const versionManager_1 = require("./tsServer/versionManager");
const typescriptService_1 = require("./typescriptService");
const dispose_1 = require("./utils/dispose");
const hash_1 = require("./utils/hash");
const platform_1 = require("./utils/platform");
var ServerState;
(function (ServerState) {
    ServerState.None = { type: 0 /* Type.None */ };
    class Running {
        server;
        apiVersion;
        tsserverVersion;
        languageServiceEnabled;
        type = 1 /* Type.Running */;
        constructor(server, 
        /**
         * API version obtained from the version picker after checking the corresponding path exists.
         */
        apiVersion, 
        /**
         * Version reported by currently-running tsserver.
         */
        tsserverVersion, languageServiceEnabled) {
            this.server = server;
            this.apiVersion = apiVersion;
            this.tsserverVersion = tsserverVersion;
            this.languageServiceEnabled = languageServiceEnabled;
        }
        toCancelOnResourceChange = new Set();
        updateTsserverVersion(tsserverVersion) {
            this.tsserverVersion = tsserverVersion;
        }
        updateLanguageServiceEnabled(enabled) {
            this.languageServiceEnabled = enabled;
        }
    }
    ServerState.Running = Running;
    class Errored {
        error;
        tsServerLog;
        type = 2 /* Type.Errored */;
        constructor(error, tsServerLog) {
            this.error = error;
            this.tsServerLog = tsServerLog;
        }
    }
    ServerState.Errored = Errored;
})(ServerState || (ServerState = {}));
exports.emptyAuthority = 'ts-nul-authority';
exports.inMemoryResourcePrefix = '^';
class TypeScriptServiceClient extends dispose_1.Disposable {
    context;
    _onReady;
    _configuration;
    pluginPathsProvider;
    _versionManager;
    _nodeVersionManager;
    logger;
    tracer;
    typescriptServerSpawner;
    serverState = ServerState.None;
    lastStart;
    numberRestarts;
    _isPromptingAfterCrash = false;
    isRestarting = false;
    hasServerFatallyCrashedTooManyTimes = false;
    loadingIndicator;
    telemetryReporter;
    bufferSyncSupport;
    diagnosticsManager;
    pluginManager;
    logDirectoryProvider;
    cancellerFactory;
    versionProvider;
    processFactory;
    watches = new Map();
    watchEvents = new Map();
    watchChangeTimeout;
    constructor(context, onCaseInsensitiveFileSystem, services, allModeIds) {
        super();
        this.context = context;
        this.loadingIndicator = this._register(new ServerInitializingIndicator(this));
        this.logger = services.logger;
        this.tracer = new tracer_1.default(this.logger);
        this.pluginManager = services.pluginManager;
        this.logDirectoryProvider = services.logDirectoryProvider;
        this.cancellerFactory = services.cancellerFactory;
        this.versionProvider = services.versionProvider;
        this.processFactory = services.processFactory;
        this.lastStart = Date.now();
        let resolve;
        let reject;
        const p = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        this._onReady = { promise: p, resolve: resolve, reject: reject };
        this.numberRestarts = 0;
        this._configuration = services.serviceConfigurationProvider.loadFromWorkspace();
        this.versionProvider.updateConfiguration(this._configuration);
        this.pluginPathsProvider = new pluginPathsProvider_1.TypeScriptPluginPathsProvider(this._configuration);
        this._versionManager = this._register(new versionManager_1.TypeScriptVersionManager(this._configuration, this.versionProvider, context.workspaceState));
        this._register(this._versionManager.onDidPickNewVersion(() => {
            this.restartTsServer();
        }));
        this._nodeVersionManager = this._register(new nodeManager_1.NodeVersionManager(this._configuration, context.workspaceState));
        this._register(this._nodeVersionManager.onDidPickNewVersion(() => {
            this.restartTsServer();
        }));
        this.bufferSyncSupport = new bufferSyncSupport_1.default(this, allModeIds, onCaseInsensitiveFileSystem);
        this.onReady(() => { this.bufferSyncSupport.listen(); });
        this.bufferSyncSupport.onDelete(resource => {
            this.cancelInflightRequestsForResource(resource);
            this.diagnosticsManager.deleteAllDiagnosticsInFile(resource);
        }, null, this._disposables);
        this.bufferSyncSupport.onWillChange(resource => {
            this.cancelInflightRequestsForResource(resource);
        });
        vscode.workspace.onDidChangeConfiguration(() => {
            const oldConfiguration = this._configuration;
            this._configuration = services.serviceConfigurationProvider.loadFromWorkspace();
            this.versionProvider.updateConfiguration(this._configuration);
            this._versionManager.updateConfiguration(this._configuration);
            this.pluginPathsProvider.updateConfiguration(this._configuration);
            this._nodeVersionManager.updateConfiguration(this._configuration);
            if (this.serverState.type === 1 /* ServerState.Type.Running */) {
                if (!this._configuration.implicitProjectConfiguration.isEqualTo(oldConfiguration.implicitProjectConfiguration)) {
                    this.setCompilerOptionsForInferredProjects(this._configuration);
                }
                if (!(0, configuration_1.areServiceConfigurationsEqual)(this._configuration, oldConfiguration)) {
                    this.restartTsServer();
                }
            }
        }, this, this._disposables);
        this.telemetryReporter = new telemetry_1.VSCodeTelemetryReporter(services.experimentTelemetryReporter, () => {
            if (this.serverState.type === 1 /* ServerState.Type.Running */) {
                if (this.serverState.tsserverVersion) {
                    return this.serverState.tsserverVersion;
                }
            }
            return this.apiVersion.fullVersionString;
        });
        this.diagnosticsManager = this._register(new diagnostics_1.DiagnosticsManager('typescript', this._configuration, this.telemetryReporter, onCaseInsensitiveFileSystem));
        this.typescriptServerSpawner = new spawner_1.TypeScriptServerSpawner(this.versionProvider, this._versionManager, this._nodeVersionManager, this.logDirectoryProvider, this.pluginPathsProvider, this.logger, this.telemetryReporter, this.tracer, this.processFactory);
        this._register(this.pluginManager.onDidUpdateConfig(update => {
            this.configurePlugin(update.pluginId, update.config);
        }));
        this._register(this.pluginManager.onDidChangePlugins(() => {
            this.restartTsServer();
        }));
    }
    get capabilities() {
        if (this._configuration.useSyntaxServer === 1 /* SyntaxServerConfiguration.Always */) {
            return new typescriptService_1.ClientCapabilities(typescriptService_1.ClientCapability.Syntax, typescriptService_1.ClientCapability.EnhancedSyntax);
        }
        if ((0, platform_1.isWeb)()) {
            if (this.isProjectWideIntellisenseOnWebEnabled()) {
                return new typescriptService_1.ClientCapabilities(typescriptService_1.ClientCapability.Syntax, typescriptService_1.ClientCapability.EnhancedSyntax, typescriptService_1.ClientCapability.Semantic);
            }
            else {
                return new typescriptService_1.ClientCapabilities(typescriptService_1.ClientCapability.Syntax, typescriptService_1.ClientCapability.EnhancedSyntax);
            }
        }
        if (this.apiVersion.gte(api_1.API.v400)) {
            return new typescriptService_1.ClientCapabilities(typescriptService_1.ClientCapability.Syntax, typescriptService_1.ClientCapability.EnhancedSyntax, typescriptService_1.ClientCapability.Semantic);
        }
        return new typescriptService_1.ClientCapabilities(typescriptService_1.ClientCapability.Syntax, typescriptService_1.ClientCapability.Semantic);
    }
    _onDidChangeCapabilities = this._register(new vscode.EventEmitter());
    onDidChangeCapabilities = this._onDidChangeCapabilities.event;
    isProjectWideIntellisenseOnWebEnabled() {
        return (0, platform_1.isWebAndHasSharedArrayBuffers)() && this._configuration.webProjectWideIntellisenseEnabled;
    }
    cancelInflightRequestsForResource(resource) {
        if (this.serverState.type !== 1 /* ServerState.Type.Running */) {
            return;
        }
        for (const request of this.serverState.toCancelOnResourceChange) {
            if (request.resource.toString() === resource.toString()) {
                request.cancel();
            }
        }
    }
    get configuration() {
        return this._configuration;
    }
    dispose() {
        super.dispose();
        this.bufferSyncSupport.dispose();
        if (this.serverState.type === 1 /* ServerState.Type.Running */) {
            this.serverState.server.kill();
        }
        this.loadingIndicator.reset();
        this.resetWatchers();
    }
    restartTsServer(fromUserAction = false) {
        if (this.serverState.type === 1 /* ServerState.Type.Running */) {
            this.logger.info('Killing TS Server');
            this.isRestarting = true;
            this.serverState.server.kill();
        }
        if (fromUserAction) {
            // Reset crash trackers
            this.hasServerFatallyCrashedTooManyTimes = false;
            this.numberRestarts = 0;
            this.lastStart = Date.now();
        }
        this.serverState = this.startService(true);
    }
    _onTsServerStarted = this._register(new vscode.EventEmitter());
    onTsServerStarted = this._onTsServerStarted.event;
    _onDiagnosticsReceived = this._register(new vscode.EventEmitter());
    onDiagnosticsReceived = this._onDiagnosticsReceived.event;
    _onConfigDiagnosticsReceived = this._register(new vscode.EventEmitter());
    onConfigDiagnosticsReceived = this._onConfigDiagnosticsReceived.event;
    _onResendModelsRequested = this._register(new vscode.EventEmitter());
    onResendModelsRequested = this._onResendModelsRequested.event;
    _onProjectLanguageServiceStateChanged = this._register(new vscode.EventEmitter());
    onProjectLanguageServiceStateChanged = this._onProjectLanguageServiceStateChanged.event;
    _onDidBeginInstallTypings = this._register(new vscode.EventEmitter());
    onDidBeginInstallTypings = this._onDidBeginInstallTypings.event;
    _onDidEndInstallTypings = this._register(new vscode.EventEmitter());
    onDidEndInstallTypings = this._onDidEndInstallTypings.event;
    _onTypesInstallerInitializationFailed = this._register(new vscode.EventEmitter());
    onTypesInstallerInitializationFailed = this._onTypesInstallerInitializationFailed.event;
    _onSurveyReady = this._register(new vscode.EventEmitter());
    onSurveyReady = this._onSurveyReady.event;
    get apiVersion() {
        if (this.serverState.type === 1 /* ServerState.Type.Running */) {
            return this.serverState.apiVersion;
        }
        return api_1.API.defaultVersion;
    }
    onReady(f) {
        return this._onReady.promise.then(f);
    }
    ensureServiceStarted() {
        if (this.serverState.type !== 1 /* ServerState.Type.Running */) {
            this.startService();
        }
    }
    token = 0;
    startService(resendModels = false) {
        this.logger.info(`Starting TS Server`);
        if (this.isDisposed) {
            this.logger.info(`Not starting server: disposed`);
            return ServerState.None;
        }
        if (this.hasServerFatallyCrashedTooManyTimes) {
            this.logger.info(`Not starting server: too many crashes`);
            return ServerState.None;
        }
        let version = this._versionManager.currentVersion;
        if (!version.isValid) {
            vscode.window.showWarningMessage(vscode.l10n.t("The path {0} doesn't point to a valid tsserver install. Falling back to bundled TypeScript version.", version.path));
            this._versionManager.reset();
            version = this._versionManager.currentVersion;
        }
        this.logger.info(`Using tsserver from: ${version.path}`);
        const nodePath = this._nodeVersionManager.currentVersion;
        if (nodePath) {
            this.logger.info(`Using Node installation from ${nodePath} to run TS Server`);
        }
        this.resetWatchers();
        const apiVersion = version.apiVersion || api_1.API.defaultVersion;
        const mytoken = ++this.token;
        const handle = this.typescriptServerSpawner.spawn(version, this.capabilities, this.configuration, this.pluginManager, this.cancellerFactory, {
            onFatalError: (command, err) => this.fatalError(command, err),
        });
        this.serverState = new ServerState.Running(handle, apiVersion, undefined, true);
        this.lastStart = Date.now();
        /* __GDPR__FRAGMENT__
            "TypeScriptServerEnvCommonProperties" : {
                "hasGlobalPlugins": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "globalPluginNameHashes": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
            }
        */
        const typeScriptServerEnvCommonProperties = {
            hasGlobalPlugins: this.pluginManager.plugins.length > 0,
            globalPluginNameHashes: JSON.stringify(this.pluginManager.plugins.map(plugin => (0, hash_1.hash)(plugin.name))),
        };
        /* __GDPR__
            "tsserver.spawned" : {
                "owner": "mjbvz",
                "${include}": [
                    "${TypeScriptCommonProperties}",
                    "${TypeScriptServerEnvCommonProperties}"
                ],
                "localTypeScriptVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "typeScriptVersionSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
            }
        */
        this.telemetryReporter.logTelemetry('tsserver.spawned', {
            ...typeScriptServerEnvCommonProperties,
            localTypeScriptVersion: this.versionProvider.localVersion ? this.versionProvider.localVersion.displayName : '',
            typeScriptVersionSource: version.source,
        });
        handle.onError((err) => {
            if (this.token !== mytoken) {
                // this is coming from an old process
                return;
            }
            if (!(err instanceof Error)) {
                this.logger.error('TSServer got unknown error type:', err);
                return;
            }
            if (err) {
                vscode.window.showErrorMessage(vscode.l10n.t("TypeScript language server exited with error. Error message is: {0}", err.message || err.name));
            }
            this.serverState = new ServerState.Errored(err, handle.tsServerLog);
            this.logger.error('TSServer errored with error.', err);
            if (handle.tsServerLog?.type === 'file') {
                this.logger.error(`TSServer log file: ${handle.tsServerLog.uri.fsPath}`);
            }
            /* __GDPR__
                "tsserver.error" : {
                    "owner": "mjbvz",
                    "${include}": [
                        "${TypeScriptCommonProperties}",
                        "${TypeScriptServerEnvCommonProperties}"
                    ]
                }
            */
            this.telemetryReporter.logTelemetry('tsserver.error', {
                ...typeScriptServerEnvCommonProperties
            });
            this.serviceExited(false, apiVersion);
        });
        handle.onExit((data) => {
            const { code, signal } = data;
            this.logger.error(`TSServer exited. Code: ${code}. Signal: ${signal}`);
            // In practice, the exit code is an integer with no ties to any identity,
            // so it can be classified as SystemMetaData, rather than CallstackOrException.
            /* __GDPR__
                "tsserver.exitWithCode" : {
                    "owner": "mjbvz",
                    "${include}": [
                        "${TypeScriptCommonProperties}",
                        "${TypeScriptServerEnvCommonProperties}"
                    ],
                    "code" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
                    "signal" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
                }
            */
            this.telemetryReporter.logTelemetry('tsserver.exitWithCode', {
                ...typeScriptServerEnvCommonProperties,
                code: code ?? undefined,
                signal: signal ?? undefined,
            });
            if (this.token !== mytoken) {
                // this is coming from an old process
                return;
            }
            if (handle.tsServerLog?.type === 'file') {
                this.logger.info(`TSServer log file: ${handle.tsServerLog.uri.fsPath}`);
            }
            this.serviceExited(!this.isRestarting, apiVersion);
            this.isRestarting = false;
        });
        handle.onEvent(event => this.dispatchEvent(event));
        this.serviceStarted(resendModels);
        this._onReady.resolve();
        this._onTsServerStarted.fire({ version: version, usedApiVersion: apiVersion });
        this._onDidChangeCapabilities.fire();
        return this.serverState;
    }
    resetWatchers() {
        clearTimeout(this.watchChangeTimeout);
        (0, dispose_1.disposeAll)(Array.from(this.watches.values()));
    }
    async showVersionPicker() {
        this._versionManager.promptUserForVersion();
    }
    async openTsServerLogFile() {
        if (this._configuration.tsServerLogLevel === configuration_1.TsServerLogLevel.Off) {
            vscode.window.showErrorMessage(vscode.l10n.t("TS Server logging is off. Please set 'js/ts.tsserver.log' and restart the TS server to enable logging"), {
                title: vscode.l10n.t("Enable logging and restart TS server"),
            })
                .then(selection => {
                if (selection) {
                    return vscode.workspace.getConfiguration().update('js/ts.tsserver.log', 'verbose', true).then(() => {
                        this.restartTsServer();
                    });
                }
                return undefined;
            });
            return false;
        }
        if (this.serverState.type !== 1 /* ServerState.Type.Running */ || !this.serverState.server.tsServerLog) {
            vscode.window.showWarningMessage(vscode.l10n.t("TS Server has not started logging."));
            return false;
        }
        switch (this.serverState.server.tsServerLog.type) {
            case 'output': {
                this.serverState.server.tsServerLog.output.show();
                return true;
            }
            case 'file': {
                try {
                    const doc = await vscode.workspace.openTextDocument(this.serverState.server.tsServerLog.uri);
                    await vscode.window.showTextDocument(doc);
                    return true;
                }
                catch {
                    // noop
                }
                try {
                    await vscode.commands.executeCommand('revealFileInOS', this.serverState.server.tsServerLog.uri);
                    return true;
                }
                catch {
                    vscode.window.showWarningMessage(vscode.l10n.t("Could not open TS Server log file"));
                    return false;
                }
            }
        }
    }
    serviceStarted(resendModels) {
        this.bufferSyncSupport.reset();
        const watchOptions = this.apiVersion.gte(api_1.API.v380)
            ? this.configuration.watchOptions
            : undefined;
        const configureOptions = {
            hostInfo: 'vscode',
            preferences: {
                providePrefixAndSuffixTextForRename: true,
                allowRenameOfImportPath: true,
                includePackageJsonAutoImports: this._configuration.includePackageJsonAutoImports,
                excludeLibrarySymbolsInNavTo: this._configuration.workspaceSymbolsExcludeLibrarySymbols,
            },
            watchOptions
        };
        this.executeWithoutWaitingForResponse('configure', configureOptions);
        this.setCompilerOptionsForInferredProjects(this._configuration);
        if (resendModels) {
            this._onResendModelsRequested.fire();
            this.bufferSyncSupport.reinitialize();
            this.bufferSyncSupport.requestAllDiagnostics();
        }
        // Reconfigure any plugins
        for (const [pluginName, config] of this.pluginManager.configurations()) {
            this.configurePlugin(pluginName, config);
        }
    }
    setCompilerOptionsForInferredProjects(configuration) {
        const args = {
            options: this.getCompilerOptionsForInferredProjects(configuration)
        };
        this.executeWithoutWaitingForResponse('compilerOptionsForInferredProjects', args);
    }
    getCompilerOptionsForInferredProjects(configuration) {
        return {
            ...(0, tsconfig_1.inferredProjectCompilerOptions)(this.apiVersion, 0 /* ProjectType.TypeScript */, configuration),
            allowJs: true,
            allowSyntheticDefaultImports: true,
            allowNonTsExtensions: true,
            resolveJsonModule: true,
        };
    }
    serviceExited(restart, tsVersion) {
        this.resetWatchers();
        this.loadingIndicator.reset();
        this.serverState = ServerState.None;
        if (this.isDisposed) {
            return;
        }
        if (restart) {
            const diff = Date.now() - this.lastStart;
            this.numberRestarts++;
            let startService = true;
            const pluginExtensionList = this.pluginManager.plugins.map(plugin => plugin.extension.id).join(', ');
            const reportIssueItem = {
                title: vscode.l10n.t("Report Issue"),
            };
            let prompt = undefined;
            if (this.numberRestarts > 5) {
                this.numberRestarts = 0;
                if (diff < 10 * 1000 /* 10 seconds */) {
                    this.lastStart = Date.now();
                    startService = false;
                    this.hasServerFatallyCrashedTooManyTimes = true;
                    if (this.pluginManager.plugins.length) {
                        prompt = vscode.window.showErrorMessage(vscode.l10n.t("The JS/TS language service immediately crashed 5 times. The service will not be restarted.\nThis may be caused by a plugin contributed by one of these extensions: {0}.\nPlease try disabling these extensions before filing an issue against VS Code.", pluginExtensionList));
                    }
                    else {
                        prompt = vscode.window.showErrorMessage(vscode.l10n.t("The JS/TS language service immediately crashed 5 times. The service will not be restarted."), reportIssueItem);
                    }
                    /* __GDPR__
                        "serviceExited" : {
                            "owner": "mjbvz",
                            "${include}": [
                                "${TypeScriptCommonProperties}"
                            ]
                        }
                    */
                    this.telemetryReporter.logTelemetry('serviceExited');
                }
                else if (diff < 60 * 1000 * 5 /* 5 Minutes */) {
                    this.lastStart = Date.now();
                    if (!this._isPromptingAfterCrash) {
                        if (this.pluginManager.plugins.length) {
                            prompt = vscode.window.showWarningMessage(vscode.l10n.t("The JS/TS language service crashed 5 times in the last 5 Minutes.\nThis may be caused by a plugin contributed by one of these extensions: {0}\nPlease try disabling these extensions before filing an issue against VS Code.", pluginExtensionList));
                        }
                        else {
                            prompt = vscode.window.showWarningMessage(vscode.l10n.t("The JS/TS language service crashed 5 times in the last 5 Minutes."), reportIssueItem);
                        }
                    }
                }
            }
            else if (['vscode-insiders', 'code-oss'].includes(vscode.env.uriScheme)) {
                // Prompt after a single restart
                this.numberRestarts = 0;
                if (!this._isPromptingAfterCrash) {
                    if (this.pluginManager.plugins.length) {
                        prompt = vscode.window.showWarningMessage(vscode.l10n.t("The JS/TS language service crashed.\nThis may be caused by a plugin contributed by one of these extensions: {0}.\nPlease try disabling these extensions before filing an issue against VS Code.", pluginExtensionList));
                    }
                    else {
                        prompt = vscode.window.showWarningMessage(vscode.l10n.t("The JS/TS language service crashed."), reportIssueItem);
                    }
                }
            }
            if (prompt) {
                this._isPromptingAfterCrash = true;
            }
            prompt?.then(async (item) => {
                this._isPromptingAfterCrash = false;
                if (item === reportIssueItem) {
                    const minModernTsVersion = this.versionProvider.bundledVersion.apiVersion;
                    // Don't allow reporting issues using the PnP patched version of TS Server
                    if (tsVersion.isYarnPnp()) {
                        const reportIssue = {
                            title: vscode.l10n.t("Report issue against Yarn PnP"),
                        };
                        const response = await vscode.window.showWarningMessage(vscode.l10n.t("Please report an issue against Yarn PnP"), {
                            modal: true,
                            detail: vscode.l10n.t("The workspace is using a version of the TypeScript Server that has been patched by Yarn PnP. This patching is a common source of bugs."),
                        }, reportIssue);
                        if (response === reportIssue) {
                            vscode.env.openExternal(vscode.Uri.parse('https://github.com/yarnpkg/berry/issues'));
                        }
                    }
                    // Don't allow reporting issues with old TS versions
                    else if (minModernTsVersion &&
                        tsVersion.lt(minModernTsVersion)) {
                        vscode.window.showWarningMessage(vscode.l10n.t("Please update your TypeScript version"), {
                            modal: true,
                            detail: vscode.l10n.t("The workspace is using an old version of TypeScript ({0}).\n\nBefore reporting an issue, please update the workspace to use TypeScript {1} or newer to make sure the bug has not already been fixed.", tsVersion.displayName, minModernTsVersion.displayName),
                        });
                    }
                    else {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/microsoft/vscode/wiki/TypeScript-Issues'));
                    }
                }
            });
            if (startService) {
                this.startService(true);
            }
        }
    }
    toTsFilePath(resource) {
        if (fileSchemes.disabledSchemes.has(resource.scheme)) {
            return undefined;
        }
        if (resource.scheme === fileSchemes.file && !(0, platform_1.isWeb)()) {
            return resource.fsPath;
        }
        return (this.isProjectWideIntellisenseOnWebEnabled() ? '' : exports.inMemoryResourcePrefix)
            + '/' + resource.scheme
            + '/' + (resource.authority || exports.emptyAuthority)
            + (resource.path.startsWith('/') ? resource.path : '/' + resource.path)
            + (resource.fragment ? '#' + resource.fragment : '');
    }
    toOpenTsFilePath(document, options = {}) {
        const uri = document instanceof vscode.Uri ? document : document.uri;
        if (!this.bufferSyncSupport.ensureHasBuffer(uri)) {
            if (!options.suppressAlertOnFailure && !fileSchemes.disabledSchemes.has(uri.scheme)) {
                console.error(`Unexpected resource ${uri}`);
            }
            return undefined;
        }
        return this.toTsFilePath(uri);
    }
    hasCapabilityForResource(resource, capability) {
        if (!this.capabilities.has(capability)) {
            return false;
        }
        switch (capability) {
            case typescriptService_1.ClientCapability.Semantic: {
                return fileSchemes.getSemanticSupportedSchemes().includes(resource.scheme);
            }
            case typescriptService_1.ClientCapability.Syntax:
            case typescriptService_1.ClientCapability.EnhancedSyntax: {
                return true;
            }
        }
    }
    toResource(filepath) {
        if ((0, platform_1.isWeb)()) {
            // On web, the stdlib paths that TS return look like: '/lib.es2015.collection.d.ts'
            // TODO: Find out what extensionUri is when testing (should be http://localhost:8080/static/sources/extensions/typescript-language-features/)
            // TODO:  make sure that this code path is getting hit
            if (filepath.startsWith('/lib.') && filepath.endsWith('.d.ts')) {
                return vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'browser', 'typescript', filepath.slice(1));
            }
            const parts = filepath.match(/^\/([^\/]+)\/([^\/]*)\/(.+)$/);
            if (parts) {
                const resource = vscode.Uri.parse(parts[1] + '://' + (parts[2] === exports.emptyAuthority ? '' : parts[2]) + '/' + parts[3]);
                return this.bufferSyncSupport.toVsCodeResource(resource);
            }
        }
        if (filepath.startsWith(exports.inMemoryResourcePrefix)) {
            const parts = filepath.match(/^\^\/([^\/]+)\/([^\/]*)\/(.+)$/);
            if (parts) {
                const resource = vscode.Uri.parse(parts[1] + '://' + (parts[2] === exports.emptyAuthority ? '' : parts[2]) + '/' + parts[3]);
                return this.bufferSyncSupport.toVsCodeResource(resource);
            }
        }
        return this.bufferSyncSupport.toResource(filepath);
    }
    getWorkspaceRootForResource(resource) {
        const roots = vscode.workspace.workspaceFolders ? Array.from(vscode.workspace.workspaceFolders) : undefined;
        if (!roots?.length) {
            return undefined;
        }
        // For notebook cells, we need to use the notebook document to look up the workspace
        if (resource.scheme === schemes_1.Schemes.notebookCell) {
            for (const notebook of vscode.workspace.notebookDocuments) {
                for (const cell of notebook.getCells()) {
                    if (cell.document.uri.toString() === resource.toString()) {
                        resource = notebook.uri;
                        break;
                    }
                }
            }
        }
        // Find the highest level workspace folder that contains the file
        for (const root of roots.sort((a, b) => a.uri.path.length - b.uri.path.length)) {
            if (root.uri.scheme === resource.scheme && root.uri.authority === resource.authority) {
                if (resource.path.startsWith(root.uri.path + '/')) {
                    return root.uri;
                }
            }
        }
        return vscode.workspace.getWorkspaceFolder(resource)?.uri;
    }
    execute(command, args, token, config) {
        let executions;
        if (config?.cancelOnResourceChange) {
            const runningServerState = this.serverState;
            if (runningServerState.type === 1 /* ServerState.Type.Running */) {
                const source = new vscode.CancellationTokenSource();
                token.onCancellationRequested(() => source.cancel());
                const inFlight = {
                    resource: config.cancelOnResourceChange,
                    cancel: () => source.cancel(),
                };
                runningServerState.toCancelOnResourceChange.add(inFlight);
                executions = this.executeImpl(command, args, {
                    isAsync: false,
                    token: source.token,
                    expectsResult: true,
                    ...config,
                });
                executions[0].finally(() => {
                    runningServerState.toCancelOnResourceChange.delete(inFlight);
                    source.dispose();
                });
            }
        }
        if (!executions) {
            executions = this.executeImpl(command, args, {
                isAsync: false,
                token,
                expectsResult: true,
                ...config,
            });
        }
        if (config?.nonRecoverable) {
            executions[0].catch(err => this.fatalError(command, err));
        }
        if (command === 'updateOpen') {
            // If update open has completed, consider that the project has loaded
            const updateOpenTask = Promise.all(executions).then(() => {
                this.loadingIndicator.reset();
            });
            const updateOpenArgs = args;
            if (updateOpenArgs.openFiles?.length === 1) {
                this.loadingIndicator.startedLoadingFile(updateOpenArgs.openFiles[0].file, updateOpenTask);
            }
        }
        return executions[0];
    }
    executeWithoutWaitingForResponse(command, args) {
        this.executeImpl(command, args, {
            isAsync: false,
            token: undefined,
            expectsResult: false
        });
    }
    executeAsync(command, args, token) {
        return this.executeImpl(command, args, {
            isAsync: true,
            token,
            expectsResult: true
        })[0];
    }
    executeImpl(command, args, executeInfo) {
        const serverState = this.serverState;
        if (serverState.type === 1 /* ServerState.Type.Running */) {
            this.bufferSyncSupport.beforeCommand(command);
            return serverState.server.executeImpl(command, args, executeInfo);
        }
        else {
            return [Promise.resolve(typescriptService_1.ServerResponse.NoServer)];
        }
    }
    interruptGetErr(f) {
        return this.bufferSyncSupport.interruptGetErr(f);
    }
    fatalError(command, error) {
        /* __GDPR__
            "fatalError" : {
                "owner": "mjbvz",
                "${include}": [
                    "${TypeScriptCommonProperties}",
                    "${TypeScriptRequestErrorProperties}"
                ],
                "command" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
            }
        */
        this.telemetryReporter.logTelemetry('fatalError', { ...(error instanceof serverError_1.TypeScriptServerError ? error.telemetry : { command }) });
        console.error(`A non-recoverable error occurred while executing tsserver command: ${command}`);
        if (error instanceof serverError_1.TypeScriptServerError && error.serverErrorText) {
            console.error(error.serverErrorText);
        }
        if (this.serverState.type === 1 /* ServerState.Type.Running */) {
            this.logger.info('Killing TS Server');
            const logfile = this.serverState.server.tsServerLog;
            this.serverState.server.kill();
            if (error instanceof serverError_1.TypeScriptServerError) {
                this.serverState = new ServerState.Errored(error, logfile);
            }
        }
    }
    dispatchEvent(event) {
        switch (event.event) {
            case protocol_const_1.EventName.syntaxDiag:
            case protocol_const_1.EventName.semanticDiag:
            case protocol_const_1.EventName.suggestionDiag:
            case protocol_const_1.EventName.regionSemanticDiag: {
                // This event also roughly signals that projects have been loaded successfully (since the TS server is synchronous)
                this.loadingIndicator.reset();
                const diagnosticEvent = event;
                if (diagnosticEvent.body?.diagnostics) {
                    this._onDiagnosticsReceived.fire({
                        kind: getDiagnosticsKind(event),
                        resource: this.toResource(diagnosticEvent.body.file),
                        diagnostics: diagnosticEvent.body.diagnostics,
                        spans: diagnosticEvent.body.spans,
                    });
                }
                return;
            }
            case protocol_const_1.EventName.configFileDiag:
                this._onConfigDiagnosticsReceived.fire(event);
                return;
            case protocol_const_1.EventName.telemetry: {
                const body = event.body;
                this.dispatchTelemetryEvent(body);
                return;
            }
            case protocol_const_1.EventName.projectLanguageServiceState: {
                const body = event.body;
                if (this.serverState.type === 1 /* ServerState.Type.Running */) {
                    this.serverState.updateLanguageServiceEnabled(body.languageServiceEnabled);
                }
                this._onProjectLanguageServiceStateChanged.fire(body);
                return;
            }
            case protocol_const_1.EventName.projectsUpdatedInBackground: {
                this.loadingIndicator.reset();
                const body = event.body;
                const resources = body.openFiles.map(file => this.toResource(file));
                this.bufferSyncSupport.getErr(resources);
                return;
            }
            case protocol_const_1.EventName.beginInstallTypes:
                this._onDidBeginInstallTypings.fire(event.body);
                return;
            case protocol_const_1.EventName.endInstallTypes:
                this._onDidEndInstallTypings.fire(event.body);
                return;
            case protocol_const_1.EventName.typesInstallerInitializationFailed:
                this._onTypesInstallerInitializationFailed.fire(event.body);
                return;
            case protocol_const_1.EventName.surveyReady:
                this._onSurveyReady.fire(event.body);
                return;
            case protocol_const_1.EventName.projectLoadingStart:
                this.loadingIndicator.startedLoadingProject(event.body.projectName);
                return;
            case protocol_const_1.EventName.projectLoadingFinish:
                this.loadingIndicator.finishedLoadingProject(event.body.projectName);
                return;
            case protocol_const_1.EventName.createDirectoryWatcher: {
                const fpath = event.body.path;
                if (fpath.startsWith(exports.inMemoryResourcePrefix)) {
                    return;
                }
                this.createFileSystemWatcher(event.body.id, new vscode.RelativePattern(vscode.Uri.file(fpath), event.body.recursive ? '**' : '*'), event.body.ignoreUpdate);
                return;
            }
            case protocol_const_1.EventName.createFileWatcher: {
                const path = event.body.path;
                if (path.startsWith(exports.inMemoryResourcePrefix)) {
                    return;
                }
                this.createFileSystemWatcher(event.body.id, new vscode.RelativePattern(vscode.Uri.file(path), '*'));
                return;
            }
            case protocol_const_1.EventName.closeFileWatcher:
                this.closeFileSystemWatcher(event.body.id);
                return;
            case protocol_const_1.EventName.requestCompleted: {
                const diagnosticsDuration = event.body.performanceData?.diagnosticsDuration;
                if (diagnosticsDuration) {
                    this.diagnosticsManager.logDiagnosticsPerformanceTelemetry(diagnosticsDuration.map(fileData => {
                        const resource = this.toResource(fileData.file);
                        return {
                            ...fileData,
                            fileLineCount: this.bufferSyncSupport.lineCount(resource),
                        };
                    }));
                }
                return;
            }
        }
    }
    scheduleExecuteWatchChangeRequest() {
        if (!this.watchChangeTimeout) {
            this.watchChangeTimeout = setTimeout(() => {
                this.watchChangeTimeout = undefined;
                const allEvents = Array.from(this.watchEvents, ([id, event]) => ({
                    id,
                    updated: event.updated && Array.from(event.updated),
                    created: event.created && Array.from(event.created),
                    deleted: event.deleted && Array.from(event.deleted)
                }));
                this.watchEvents.clear();
                this.executeWithoutWaitingForResponse('watchChange', allEvents);
            }, 100); /* aggregate events over 100ms to reduce client<->server IPC overhead */
        }
    }
    addWatchEvent(id, eventType, path) {
        let event = this.watchEvents.get(id);
        const removeEvent = (typeOfEventToRemove) => {
            if (event?.[typeOfEventToRemove]?.delete(path) && event[typeOfEventToRemove].size === 0) {
                event[typeOfEventToRemove] = undefined;
            }
        };
        const aggregateEvent = () => {
            if (!event) {
                this.watchEvents.set(id, event = {});
            }
            (event[eventType] ??= new Set()).add(path);
        };
        switch (eventType) {
            case 'created':
                removeEvent('deleted');
                removeEvent('updated');
                aggregateEvent();
                break;
            case 'deleted':
                removeEvent('created');
                removeEvent('updated');
                aggregateEvent();
                break;
            case 'updated':
                if (event?.created?.has(path)) {
                    return;
                }
                removeEvent('deleted');
                aggregateEvent();
                break;
        }
        this.scheduleExecuteWatchChangeRequest();
    }
    createFileSystemWatcher(id, pattern, ignoreChangeEvents) {
        const disposable = new dispose_1.DisposableStore();
        const watcher = disposable.add(vscode.workspace.createFileSystemWatcher(pattern, undefined, ignoreChangeEvents));
        disposable.add(watcher.onDidChange(changeFile => this.addWatchEvent(id, 'updated', changeFile.fsPath)));
        disposable.add(watcher.onDidCreate(createFile => this.addWatchEvent(id, 'created', createFile.fsPath)));
        disposable.add(watcher.onDidDelete(deletedFile => this.addWatchEvent(id, 'deleted', deletedFile.fsPath)));
        disposable.add({
            dispose: () => {
                this.watchEvents.delete(id);
                this.watches.delete(id);
            }
        });
        if (this.watches.has(id)) {
            this.closeFileSystemWatcher(id);
        }
        this.watches.set(id, disposable);
    }
    closeFileSystemWatcher(id) {
        const existing = this.watches.get(id);
        existing?.dispose();
    }
    dispatchTelemetryEvent(telemetryData) {
        const properties = Object.create(null);
        switch (telemetryData.telemetryEventName) {
            case 'typingsInstalled': {
                const typingsInstalledPayload = telemetryData.payload;
                properties['installedPackages'] = typingsInstalledPayload.installedPackages;
                if (typeof typingsInstalledPayload.installSuccess === 'boolean') {
                    properties['installSuccess'] = typingsInstalledPayload.installSuccess.toString();
                }
                if (typeof typingsInstalledPayload.typingsInstallerVersion === 'string') {
                    properties['typingsInstallerVersion'] = typingsInstalledPayload.typingsInstallerVersion;
                }
                break;
            }
            default: {
                const payload = telemetryData.payload;
                if (payload) {
                    Object.keys(payload).forEach((key) => {
                        try {
                            if (payload.hasOwnProperty(key)) {
                                properties[key] = typeof payload[key] === 'string' ? payload[key] : JSON.stringify(payload[key]);
                            }
                        }
                        catch (e) {
                            // noop
                        }
                    });
                }
                break;
            }
        }
        // Add plugin data here
        if (telemetryData.telemetryEventName === 'projectInfo') {
            if (this.serverState.type === 1 /* ServerState.Type.Running */) {
                this.serverState.updateTsserverVersion(properties['version']);
            }
        }
        /* __GDPR__
            "typingsInstalled" : {
                "owner": "mjbvz",
                "installedPackages": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
                "installSuccess": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "typingsInstallerVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "${include}": [
                    "${TypeScriptCommonProperties}"
                ]
            }
        */
        // __GDPR__COMMENT__: Other events are defined by TypeScript.
        this.telemetryReporter.logTelemetry(telemetryData.telemetryEventName, properties);
    }
    configurePlugin(pluginName, configuration) {
        this.executeWithoutWaitingForResponse('configurePlugin', { pluginName, configuration });
    }
}
exports.default = TypeScriptServiceClient;
function getDiagnosticsKind(event) {
    switch (event.event) {
        case 'syntaxDiag': return 0 /* DiagnosticKind.Syntax */;
        case 'semanticDiag': return 1 /* DiagnosticKind.Semantic */;
        case 'suggestionDiag': return 2 /* DiagnosticKind.Suggestion */;
        case 'regionSemanticDiag': return 3 /* DiagnosticKind.RegionSemantic */;
    }
    throw new Error('Unknown dignostics kind');
}
class ServerInitializingIndicator extends dispose_1.Disposable {
    client;
    _task;
    constructor(client) {
        super();
        this.client = client;
    }
    reset() {
        if (this._task) {
            this._task.resolve();
            this._task = undefined;
        }
    }
    /**
     * Signal that a project has started loading.
     */
    startedLoadingProject(projectName) {
        // TS projects are loaded sequentially. Cancel existing task because it should always be resolved before
        // the incoming project loading task is.
        this.reset();
        const projectDisplayName = this.getProjectDisplayName(projectName);
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: vscode.l10n.t("Initializing '{0}'", projectDisplayName),
        }, () => new Promise(resolve => {
            this._task = { project: projectName, resolve };
        }));
    }
    getProjectDisplayName(projectName) {
        const projectUri = this.client.toResource(projectName);
        const relPath = vscode.workspace.asRelativePath(projectUri);
        const maxDisplayLength = 60;
        if (relPath.length > maxDisplayLength) {
            return '...' + relPath.slice(-maxDisplayLength);
        }
        return relPath;
    }
    startedLoadingFile(fileName, task) {
        if (!this._task) {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: vscode.l10n.t("Analyzing '{0}' and its dependencies", path.basename(fileName)),
            }, () => task);
        }
    }
    finishedLoadingProject(projectName) {
        if (this._task && this._task.project === projectName) {
            this._task.resolve();
            this._task = undefined;
        }
    }
}
//# sourceMappingURL=typescriptServiceClient.js.map