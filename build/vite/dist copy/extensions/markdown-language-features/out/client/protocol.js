"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLinkTarget = exports.fs_watcher_onChange = exports.getUpdatePastedLinksEdit = exports.prepareUpdatePastedLinks = exports.getEditForFileRenames = exports.getReferencesToFileInWorkspace = exports.findMarkdownFilesInWorkspace = exports.fs_watcher_delete = exports.fs_watcher_create = exports.fs_stat = exports.fs_readDirectory = exports.fs_readFile = exports.parse = void 0;
const vscode_languageclient_1 = require("vscode-languageclient");
//#region From server
exports.parse = new vscode_languageclient_1.RequestType('markdown/parse');
exports.fs_readFile = new vscode_languageclient_1.RequestType('markdown/fs/readFile');
exports.fs_readDirectory = new vscode_languageclient_1.RequestType('markdown/fs/readDirectory');
exports.fs_stat = new vscode_languageclient_1.RequestType('markdown/fs/stat');
exports.fs_watcher_create = new vscode_languageclient_1.RequestType('markdown/fs/watcher/create');
exports.fs_watcher_delete = new vscode_languageclient_1.RequestType('markdown/fs/watcher/delete');
exports.findMarkdownFilesInWorkspace = new vscode_languageclient_1.RequestType('markdown/findMarkdownFilesInWorkspace');
//#endregion
//#region To server
exports.getReferencesToFileInWorkspace = new vscode_languageclient_1.RequestType('markdown/getReferencesToFileInWorkspace');
exports.getEditForFileRenames = new vscode_languageclient_1.RequestType('markdown/getEditForFileRenames');
exports.prepareUpdatePastedLinks = new vscode_languageclient_1.RequestType('markdown/prepareUpdatePastedLinks');
exports.getUpdatePastedLinksEdit = new vscode_languageclient_1.RequestType('markdown/getUpdatePastedLinksEdit');
exports.fs_watcher_onChange = new vscode_languageclient_1.RequestType('markdown/fs/watcher/onChange');
exports.resolveLinkTarget = new vscode_languageclient_1.RequestType('markdown/resolveLinkTarget');
//#endregion
//# sourceMappingURL=protocol.js.map