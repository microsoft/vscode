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
exports.activate = activate;
const extension_telemetry_1 = __importDefault(require("@vscode/extension-telemetry"));
const vscode = __importStar(require("vscode"));
const api_1 = require("./api");
const commandManager_1 = require("./commands/commandManager");
const index_1 = require("./commands/index");
const configuration_browser_1 = require("./configuration/configuration.browser");
const experimentTelemetryReporter_1 = require("./experimentTelemetryReporter");
const ata_1 = require("./filesystems/ata");
const lazyClientHost_1 = require("./lazyClientHost");
const logger_1 = require("./logging/logger");
const remoteRepositories_browser_1 = __importDefault(require("./remoteRepositories.browser"));
const api_2 = require("./tsServer/api");
const cancellation_1 = require("./tsServer/cancellation");
const logDirectoryProvider_1 = require("./tsServer/logDirectoryProvider");
const plugins_1 = require("./tsServer/plugins");
const serverProcess_browser_1 = require("./tsServer/serverProcess.browser");
const versionProvider_1 = require("./tsServer/versionProvider");
const activeJsTsEditorTracker_1 = require("./ui/activeJsTsEditorTracker");
const dispose_1 = require("./utils/dispose");
const packageInfo_1 = require("./utils/packageInfo");
const platform_1 = require("./utils/platform");
class StaticVersionProvider {
    _version;
    constructor(_version) {
        this._version = _version;
    }
    updateConfiguration(_configuration) {
        // noop
    }
    get defaultVersion() { return this._version; }
    get bundledVersion() { return this._version; }
    globalVersion = undefined;
    localVersion = undefined;
    localVersions = [];
}
async function activate(context) {
    const pluginManager = new plugins_1.PluginManager();
    context.subscriptions.push(pluginManager);
    const commandManager = new commandManager_1.CommandManager();
    context.subscriptions.push(commandManager);
    const onCompletionAccepted = new vscode.EventEmitter();
    context.subscriptions.push(onCompletionAccepted);
    const activeJsTsEditorTracker = new activeJsTsEditorTracker_1.ActiveJsTsEditorTracker();
    context.subscriptions.push(activeJsTsEditorTracker);
    const versionProvider = new StaticVersionProvider(new versionProvider_1.TypeScriptVersion("bundled" /* TypeScriptVersionSource.Bundled */, vscode.Uri.joinPath(context.extensionUri, 'dist/browser/typescript/tsserver.web.js').toString(), api_2.API.fromSimpleString('5.9.0')));
    let experimentTelemetryReporter;
    const packageInfo = (0, packageInfo_1.getPackageInfo)(context);
    if (packageInfo) {
        const { aiKey } = packageInfo;
        const vscTelemetryReporter = new extension_telemetry_1.default(aiKey);
        experimentTelemetryReporter = new experimentTelemetryReporter_1.ExperimentationTelemetryReporter(vscTelemetryReporter);
        context.subscriptions.push(experimentTelemetryReporter);
    }
    const logger = new logger_1.Logger();
    const lazyClientHost = (0, lazyClientHost_1.createLazyClientHost)(context, false, {
        pluginManager,
        commandManager,
        logDirectoryProvider: logDirectoryProvider_1.noopLogDirectoryProvider,
        cancellerFactory: cancellation_1.noopRequestCancellerFactory,
        versionProvider,
        processFactory: new serverProcess_browser_1.WorkerServerProcessFactory(context.extensionUri, logger),
        activeJsTsEditorTracker,
        serviceConfigurationProvider: new configuration_browser_1.BrowserServiceConfigurationProvider(),
        experimentTelemetryReporter,
        logger,
    }, item => {
        onCompletionAccepted.fire(item);
    });
    (0, index_1.registerBaseCommands)(commandManager, lazyClientHost, pluginManager, activeJsTsEditorTracker);
    // context.subscriptions.push(task.register(lazyClientHost.map(x => x.serviceClient)));
    Promise.resolve().then(() => __importStar(require('./languageFeatures/tsconfig'))).then(module => {
        context.subscriptions.push(module.register());
    });
    context.subscriptions.push((0, lazyClientHost_1.lazilyActivateClient)(lazyClientHost, pluginManager, activeJsTsEditorTracker, async () => {
        await startPreloadWorkspaceContentsIfNeeded(context, logger);
    }));
    context.subscriptions.push((0, ata_1.registerAtaSupport)(logger));
    return (0, api_1.getExtensionApi)(onCompletionAccepted.event, pluginManager);
}
async function startPreloadWorkspaceContentsIfNeeded(context, logger) {
    if (!(0, platform_1.isWebAndHasSharedArrayBuffers)()) {
        return;
    }
    if (!vscode.workspace.workspaceFolders) {
        return;
    }
    await Promise.all(vscode.workspace.workspaceFolders.map(async (folder) => {
        const workspaceUri = folder.uri;
        if (workspaceUri.scheme !== 'vscode-vfs' || !workspaceUri.authority.startsWith('github')) {
            logger.info(`Skipped pre loading workspace contents for repository ${workspaceUri?.toString()}`);
            return;
        }
        const loader = new RemoteWorkspaceContentsPreloader(workspaceUri, logger);
        context.subscriptions.push(loader);
        try {
            await loader.triggerPreload();
        }
        catch (error) {
            console.error(error);
        }
    }));
}
class RemoteWorkspaceContentsPreloader extends dispose_1.Disposable {
    workspaceUri;
    logger;
    _preload;
    constructor(workspaceUri, logger) {
        super();
        this.workspaceUri = workspaceUri;
        this.logger = logger;
        const fsWatcher = this._register(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceUri, '*')));
        this._register(fsWatcher.onDidChange(uri => {
            if (uri.toString() === workspaceUri.toString()) {
                this._preload = undefined;
                this.triggerPreload();
            }
        }));
    }
    async triggerPreload() {
        this._preload ??= this.doPreload();
        return this._preload;
    }
    async doPreload() {
        try {
            const remoteHubApi = await remoteRepositories_browser_1.default.getApi();
            if (await remoteHubApi.loadWorkspaceContents?.(this.workspaceUri)) {
                this.logger.info(`Successfully loaded workspace content for repository ${this.workspaceUri.toString()}`);
            }
            else {
                this.logger.info(`Failed to load workspace content for repository ${this.workspaceUri.toString()}`);
            }
        }
        catch (error) {
            this.logger.info(`Loading workspace content for repository ${this.workspaceUri.toString()} failed: ${error instanceof Error ? error.toString() : 'Unknown reason'}`);
            console.error(error);
        }
    }
}
//# sourceMappingURL=extension.browser.js.map