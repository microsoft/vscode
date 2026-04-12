"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomDataSource = getCustomDataSource;
const vscode_1 = require("vscode");
const vscode_uri_1 = require("vscode-uri");
function getCustomDataSource(toDispose) {
    let pathsInWorkspace = getCustomDataPathsInAllWorkspaces();
    let pathsInExtensions = getCustomDataPathsFromAllExtensions();
    const onChange = new vscode_1.EventEmitter();
    toDispose.push(vscode_1.extensions.onDidChange(_ => {
        const newPathsInExtensions = getCustomDataPathsFromAllExtensions();
        if (newPathsInExtensions.length !== pathsInExtensions.length || !newPathsInExtensions.every((val, idx) => val === pathsInExtensions[idx])) {
            pathsInExtensions = newPathsInExtensions;
            onChange.fire();
        }
    }));
    toDispose.push(vscode_1.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('css.customData')) {
            pathsInWorkspace = getCustomDataPathsInAllWorkspaces();
            onChange.fire();
        }
    }));
    return {
        get uris() {
            return pathsInWorkspace.concat(pathsInExtensions);
        },
        get onDidChange() {
            return onChange.event;
        }
    };
}
function getCustomDataPathsInAllWorkspaces() {
    const workspaceFolders = vscode_1.workspace.workspaceFolders;
    const dataPaths = [];
    if (!workspaceFolders) {
        return dataPaths;
    }
    const collect = (paths, rootFolder) => {
        if (Array.isArray(paths)) {
            for (const path of paths) {
                if (typeof path === 'string') {
                    dataPaths.push(vscode_uri_1.Utils.resolvePath(rootFolder, path).toString());
                }
            }
        }
    };
    for (let i = 0; i < workspaceFolders.length; i++) {
        const folderUri = workspaceFolders[i].uri;
        const allCssConfig = vscode_1.workspace.getConfiguration('css', folderUri);
        const customDataInspect = allCssConfig.inspect('customData');
        if (customDataInspect) {
            collect(customDataInspect.workspaceFolderValue, folderUri);
            if (i === 0) {
                if (vscode_1.workspace.workspaceFile) {
                    collect(customDataInspect.workspaceValue, vscode_1.workspace.workspaceFile);
                }
                collect(customDataInspect.globalValue, folderUri);
            }
        }
    }
    return dataPaths;
}
function getCustomDataPathsFromAllExtensions() {
    const dataPaths = [];
    for (const extension of vscode_1.extensions.all) {
        const customData = extension.packageJSON?.contributes?.css?.customData;
        if (Array.isArray(customData)) {
            for (const rp of customData) {
                dataPaths.push(vscode_uri_1.Utils.joinPath(extension.extensionUri, rp).toString());
            }
        }
    }
    return dataPaths;
}
//# sourceMappingURL=customData.js.map