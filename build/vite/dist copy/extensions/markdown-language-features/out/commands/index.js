"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMarkdownCommands = registerMarkdownCommands;
const security_1 = require("../preview/security");
const insertResource_1 = require("./insertResource");
const refreshPreview_1 = require("./refreshPreview");
const reloadPlugins_1 = require("./reloadPlugins");
const renderDocument_1 = require("./renderDocument");
const showPreview_1 = require("./showPreview");
const copyImage_1 = require("./copyImage");
const showPreviewSecuritySelector_1 = require("./showPreviewSecuritySelector");
const showSource_1 = require("./showSource");
const toggleLock_1 = require("./toggleLock");
const openImage_1 = require("./openImage");
function registerMarkdownCommands(commandManager, previewManager, telemetryReporter, cspArbiter, engine) {
    const previewSecuritySelector = new security_1.PreviewSecuritySelector(cspArbiter, previewManager);
    commandManager.register(new openImage_1.OpenImageCommand(previewManager));
    commandManager.register(new copyImage_1.CopyImageCommand(previewManager));
    commandManager.register(new showPreview_1.ShowPreviewCommand(previewManager, telemetryReporter));
    commandManager.register(new showPreview_1.ShowPreviewToSideCommand(previewManager, telemetryReporter));
    commandManager.register(new showPreview_1.ShowLockedPreviewToSideCommand(previewManager, telemetryReporter));
    commandManager.register(new showSource_1.ShowSourceCommand(previewManager));
    commandManager.register(new refreshPreview_1.RefreshPreviewCommand(previewManager, engine));
    commandManager.register(new showPreviewSecuritySelector_1.ShowPreviewSecuritySelectorCommand(previewSecuritySelector, previewManager));
    commandManager.register(new toggleLock_1.ToggleLockCommand(previewManager));
    commandManager.register(new renderDocument_1.RenderDocument(engine));
    commandManager.register(new reloadPlugins_1.ReloadPlugins(previewManager, engine));
    commandManager.register(new insertResource_1.InsertLinkFromWorkspace());
    commandManager.register(new insertResource_1.InsertImageFromWorkspace());
    return commandManager;
}
//# sourceMappingURL=index.js.map