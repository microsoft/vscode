"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBaseCommands = registerBaseCommands;
const configurePlugin_1 = require("./configurePlugin");
const useTsgo_1 = require("./useTsgo");
const goToProjectConfiguration_1 = require("./goToProjectConfiguration");
const learnMoreAboutRefactorings_1 = require("./learnMoreAboutRefactorings");
const openJsDocLink_1 = require("./openJsDocLink");
const openTsServerLog_1 = require("./openTsServerLog");
const reloadProject_1 = require("./reloadProject");
const restartTsServer_1 = require("./restartTsServer");
const selectTypeScriptVersion_1 = require("./selectTypeScriptVersion");
const tsserverRequests_1 = require("./tsserverRequests");
function registerBaseCommands(commandManager, lazyClientHost, pluginManager, activeJsTsEditorTracker) {
    commandManager.register(new reloadProject_1.ReloadTypeScriptProjectsCommand(lazyClientHost));
    commandManager.register(new reloadProject_1.ReloadJavaScriptProjectsCommand(lazyClientHost));
    commandManager.register(new selectTypeScriptVersion_1.SelectTypeScriptVersionCommand(lazyClientHost));
    commandManager.register(new openTsServerLog_1.OpenTsServerLogCommand(lazyClientHost));
    commandManager.register(new restartTsServer_1.RestartTsServerCommand(lazyClientHost));
    commandManager.register(new goToProjectConfiguration_1.TypeScriptGoToProjectConfigCommand(activeJsTsEditorTracker, lazyClientHost));
    commandManager.register(new goToProjectConfiguration_1.JavaScriptGoToProjectConfigCommand(activeJsTsEditorTracker, lazyClientHost));
    commandManager.register(new configurePlugin_1.ConfigurePluginCommand(pluginManager));
    commandManager.register(new learnMoreAboutRefactorings_1.LearnMoreAboutRefactoringsCommand());
    commandManager.register(new tsserverRequests_1.TSServerRequestCommand(lazyClientHost));
    commandManager.register(new openJsDocLink_1.OpenJsDocLinkCommand());
    commandManager.register(new useTsgo_1.EnableTsgoCommand());
    commandManager.register(new useTsgo_1.DisableTsgoCommand());
}
//# sourceMappingURL=index.js.map