"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker' />
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tsserverlibrary_1 = __importDefault(require("typescript/lib/tsserverlibrary"));
const vscode_uri_1 = require("vscode-uri");
const fileWatcherManager_1 = require("./fileWatcherManager");
const logging_1 = require("./logging");
const pathMapper_1 = require("./pathMapper");
const serverHost_1 = require("./serverHost");
const args_1 = require("./util/args");
const workerSession_1 = require("./workerSession");
const setSys = tsserverlibrary_1.default.setSys;
async function initializeSession(args, extensionUri, ports) {
    const logLevel = (0, logging_1.parseLogLevel)((0, args_1.findArgument)(args, '--logVerbosity'));
    const logger = new logging_1.Logger(logLevel);
    const modeOrUnknown = (0, args_1.parseServerMode)(args);
    const serverMode = typeof modeOrUnknown === 'number' ? modeOrUnknown : undefined;
    const unknownServerMode = typeof modeOrUnknown === 'string' ? modeOrUnknown : undefined;
    logger.tsLogger.info(`Starting TS Server`);
    logger.tsLogger.info(`Version: 0.0.0`);
    logger.tsLogger.info(`Arguments: ${args.join(' ')}`);
    logger.tsLogger.info(`ServerMode: ${serverMode} unknownServerMode: ${unknownServerMode}`);
    const sessionOptions = parseSessionOptions(args, serverMode);
    const enabledExperimentalTypeAcquisition = (0, args_1.hasArgument)(args, '--enableProjectWideIntelliSenseOnWeb') && (0, args_1.hasArgument)(args, '--experimentalTypeAcquisition');
    const pathMapper = new pathMapper_1.PathMapper(extensionUri);
    const watchManager = new fileWatcherManager_1.FileWatcherManager(ports.watcher, extensionUri, enabledExperimentalTypeAcquisition, pathMapper, logger);
    const { sys, fs } = await (0, serverHost_1.createSys)(tsserverlibrary_1.default, args, ports.sync, logger, watchManager, pathMapper, () => {
        removeEventListener('message', listener);
    });
    setSys(sys);
    const localeStr = (0, args_1.findArgument)(args, '--locale');
    if (localeStr) {
        tsserverlibrary_1.default.validateLocaleAndSetLanguage(localeStr, sys);
    }
    (0, workerSession_1.startWorkerSession)(tsserverlibrary_1.default, sys, fs, sessionOptions, ports.tsserver, pathMapper, logger);
}
function parseSessionOptions(args, serverMode) {
    return {
        globalPlugins: (0, args_1.findArgumentStringArray)(args, '--globalPlugins'),
        pluginProbeLocations: (0, args_1.findArgumentStringArray)(args, '--pluginProbeLocations'),
        allowLocalPluginLoads: (0, args_1.hasArgument)(args, '--allowLocalPluginLoads'),
        useSingleInferredProject: (0, args_1.hasArgument)(args, '--useSingleInferredProject'),
        useInferredProjectPerProjectRoot: (0, args_1.hasArgument)(args, '--useInferredProjectPerProjectRoot'),
        suppressDiagnosticEvents: (0, args_1.hasArgument)(args, '--suppressDiagnosticEvents'),
        noGetErrOnBackgroundUpdate: (0, args_1.hasArgument)(args, '--noGetErrOnBackgroundUpdate'),
        serverMode,
        disableAutomaticTypingAcquisition: (0, args_1.hasArgument)(args, '--disableAutomaticTypingAcquisition'),
    };
}
let hasInitialized = false;
const listener = async (e) => {
    if (!hasInitialized) {
        hasInitialized = true;
        if ('args' in e.data) {
            const args = e.data.args;
            const extensionUri = vscode_uri_1.URI.from(e.data.extensionUri);
            const [sync, tsserver, watcher] = e.ports;
            await initializeSession(args, extensionUri, { sync, tsserver, watcher });
        }
        else {
            console.error('unexpected message in place of initial message: ' + JSON.stringify(e.data));
        }
        return;
    }
    console.error(`unexpected message on main channel: ${JSON.stringify(e)}`);
};
addEventListener('message', listener);
//# sourceMappingURL=webServer.js.map