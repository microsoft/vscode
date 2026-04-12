"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomDataSource = getCustomDataSource;
const vscode_1 = require("vscode");
const vscode_uri_1 = require("vscode-uri");
function getCustomDataSource(runtime, toDispose) {
    let localExtensionUris = new Set();
    let externalExtensionUris = new Set();
    const workspaceUris = new Set();
    collectInWorkspaces(workspaceUris);
    collectInExtensions(localExtensionUris, externalExtensionUris);
    const onChange = new vscode_1.EventEmitter();
    toDispose.push(vscode_1.extensions.onDidChange(_ => {
        const newLocalExtensionUris = new Set();
        const newExternalExtensionUris = new Set();
        collectInExtensions(newLocalExtensionUris, newExternalExtensionUris);
        if (hasChanges(newLocalExtensionUris, localExtensionUris) || hasChanges(newExternalExtensionUris, externalExtensionUris)) {
            localExtensionUris = newLocalExtensionUris;
            externalExtensionUris = newExternalExtensionUris;
            onChange.fire();
        }
    }));
    toDispose.push(vscode_1.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('html.customData')) {
            workspaceUris.clear();
            collectInWorkspaces(workspaceUris);
            onChange.fire();
        }
    }));
    toDispose.push(vscode_1.workspace.onDidChangeTextDocument(e => {
        const path = e.document.uri.toString();
        if (externalExtensionUris.has(path) || workspaceUris.has(path)) {
            onChange.fire();
        }
    }));
    return {
        get uris() {
            return [...localExtensionUris].concat([...externalExtensionUris], [...workspaceUris]);
        },
        get onDidChange() {
            return onChange.event;
        },
        getContent(uriString) {
            const uri = vscode_1.Uri.parse(uriString);
            if (localExtensionUris.has(uriString)) {
                return vscode_1.workspace.fs.readFile(uri).then(buffer => {
                    return new runtime.TextDecoder().decode(buffer);
                });
            }
            return vscode_1.workspace.openTextDocument(uri).then(doc => {
                return doc.getText();
            });
        }
    };
}
function hasChanges(s1, s2) {
    if (s1.size !== s2.size) {
        return true;
    }
    for (const uri of s1) {
        if (!s2.has(uri)) {
            return true;
        }
    }
    return false;
}
function isURI(uriOrPath) {
    return /^(?<scheme>\w[\w\d+.-]*):/.test(uriOrPath);
}
function collectInWorkspaces(workspaceUris) {
    const workspaceFolders = vscode_1.workspace.workspaceFolders;
    const dataPaths = new Set();
    if (!workspaceFolders) {
        return dataPaths;
    }
    const collect = (uriOrPaths, rootFolder) => {
        if (Array.isArray(uriOrPaths)) {
            for (const uriOrPath of uriOrPaths) {
                if (typeof uriOrPath === 'string') {
                    if (!isURI(uriOrPath)) {
                        // path in the workspace
                        workspaceUris.add(vscode_uri_1.Utils.resolvePath(rootFolder, uriOrPath).toString());
                    }
                    else {
                        // external uri
                        workspaceUris.add(uriOrPath);
                    }
                }
            }
        }
    };
    for (let i = 0; i < workspaceFolders.length; i++) {
        const folderUri = workspaceFolders[i].uri;
        const allHtmlConfig = vscode_1.workspace.getConfiguration('html', folderUri);
        const customDataInspect = allHtmlConfig.inspect('customData');
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
function collectInExtensions(localExtensionUris, externalUris) {
    for (const extension of vscode_1.extensions.allAcrossExtensionHosts) {
        const customData = extension.packageJSON?.contributes?.html?.customData;
        if (Array.isArray(customData)) {
            for (const uriOrPath of customData) {
                if (!isURI(uriOrPath)) {
                    // relative path in an extension
                    localExtensionUris.add(vscode_1.Uri.joinPath(extension.extensionUri, uriOrPath).toString());
                }
                else {
                    // external uri
                    externalUris.add(uriOrPath);
                }
            }
        }
    }
}
//# sourceMappingURL=customData.js.map