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
exports.deactivate = deactivate;
const extension_telemetry_1 = __importDefault(require("@vscode/extension-telemetry"));
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
const api_1 = require("./api");
const commandManager_1 = require("./commands/commandManager");
const useTsgo_1 = require("./commands/useTsgo");
const index_1 = require("./commands/index");
const configuration_electron_1 = require("./configuration/configuration.electron");
const experimentTelemetryReporter_1 = require("./experimentTelemetryReporter");
const experimentationService_1 = require("./experimentationService");
const lazyClientHost_1 = require("./lazyClientHost");
const logger_1 = require("./logging/logger");
const cancellation_electron_1 = require("./tsServer/cancellation.electron");
const logDirectoryProvider_electron_1 = require("./tsServer/logDirectoryProvider.electron");
const plugins_1 = require("./tsServer/plugins");
const serverProcess_electron_1 = require("./tsServer/serverProcess.electron");
const versionProvider_electron_1 = require("./tsServer/versionProvider.electron");
const activeJsTsEditorTracker_1 = require("./ui/activeJsTsEditorTracker");
const fs_electron_1 = require("./utils/fs.electron");
const lazy_1 = require("./utils/lazy");
const packageInfo_1 = require("./utils/packageInfo");
const temp = __importStar(require("./utils/temp.electron"));
const dependentRegistration_1 = require("./languageFeatures/util/dependentRegistration");
const dispose_1 = require("./utils/dispose");
function activate(context) {
    const pluginManager = new plugins_1.PluginManager();
    context.subscriptions.push(pluginManager);
    const onCompletionAccepted = new vscode.EventEmitter();
    context.subscriptions.push(onCompletionAccepted);
    const logDirectoryProvider = new logDirectoryProvider_electron_1.NodeLogDirectoryProvider(context);
    const versionProvider = new versionProvider_electron_1.DiskTypeScriptVersionProvider();
    let experimentTelemetryReporter;
    const packageInfo = (0, packageInfo_1.getPackageInfo)(context);
    if (packageInfo) {
        const { name: id, version, aiKey } = packageInfo;
        const vscTelemetryReporter = new extension_telemetry_1.default(aiKey);
        experimentTelemetryReporter = new experimentTelemetryReporter_1.ExperimentationTelemetryReporter(vscTelemetryReporter);
        context.subscriptions.push(experimentTelemetryReporter);
        // Currently we have no experiments, but creating the service adds the appropriate
        // shared properties to the ExperimentationTelemetryReporter we just created.
        new experimentationService_1.ExperimentationService(experimentTelemetryReporter, id, version, context.globalState);
    }
    // Register features that work in both TSGO and non-TSGO modes
    Promise.resolve().then(() => __importStar(require('./languageFeatures/tsconfig'))).then(module => {
        context.subscriptions.push(module.register());
    });
    // Conditionally register features based on whether TSGO is enabled
    context.subscriptions.push((0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireGlobalUnifiedConfig)('experimental.useTsgo', { fallbackSection: 'typescript' }),
        (0, dependentRegistration_1.requireHasVsCodeExtension)(useTsgo_1.tsNativeExtensionId),
    ], () => {
        // TSGO. Only register a small set of features that don't use TS Server
        const disposables = new dispose_1.DisposableStore();
        const commandManager = disposables.add(new commandManager_1.CommandManager());
        commandManager.register(new useTsgo_1.DisableTsgoCommand());
        return disposables;
    }, () => {
        // Normal registration path
        const disposables = new dispose_1.DisposableStore();
        const commandManager = disposables.add(new commandManager_1.CommandManager());
        const activeJsTsEditorTracker = disposables.add(new activeJsTsEditorTracker_1.ActiveJsTsEditorTracker());
        const lazyClientHost = (0, lazyClientHost_1.createLazyClientHost)(context, (0, fs_electron_1.onCaseInsensitiveFileSystem)(), {
            pluginManager,
            commandManager,
            logDirectoryProvider,
            cancellerFactory: cancellation_electron_1.nodeRequestCancellerFactory,
            versionProvider,
            processFactory: new serverProcess_electron_1.ElectronServiceProcessFactory(),
            activeJsTsEditorTracker,
            serviceConfigurationProvider: new configuration_electron_1.ElectronServiceConfigurationProvider(),
            experimentTelemetryReporter,
            logger: new logger_1.Logger(),
        }, item => {
            onCompletionAccepted.fire(item);
        }).map(clientHost => {
            return disposables.add(clientHost);
        });
        // Register features
        (0, index_1.registerBaseCommands)(commandManager, lazyClientHost, pluginManager, activeJsTsEditorTracker);
        Promise.resolve().then(() => __importStar(require('./task/taskProvider'))).then(module => {
            disposables.add(module.register(new lazy_1.Lazy(() => lazyClientHost.value.serviceClient)));
        });
        disposables.add((0, lazyClientHost_1.lazilyActivateClient)(lazyClientHost, pluginManager, activeJsTsEditorTracker));
        return disposables;
    }));
    return (0, api_1.getExtensionApi)(onCompletionAccepted.event, pluginManager);
}
function deactivate() {
    fs.rmSync(temp.instanceTempDir.value, { recursive: true, force: true });
}
//# sourceMappingURL=extension.js.map