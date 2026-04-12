"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileType = exports.FsReadDirRequest = exports.FsStatRequest = void 0;
exports.serveFileSystemRequests = serveFileSystemRequests;
const vscode_1 = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
var FsStatRequest;
(function (FsStatRequest) {
    FsStatRequest.type = new vscode_languageclient_1.RequestType('fs/stat');
})(FsStatRequest || (exports.FsStatRequest = FsStatRequest = {}));
var FsReadDirRequest;
(function (FsReadDirRequest) {
    FsReadDirRequest.type = new vscode_languageclient_1.RequestType('fs/readDir');
})(FsReadDirRequest || (exports.FsReadDirRequest = FsReadDirRequest = {}));
function serveFileSystemRequests(client, runtime) {
    const disposables = [];
    disposables.push(client.onRequest(FsReadDirRequest.type, (uriString) => {
        const uri = vscode_1.Uri.parse(uriString);
        if (uri.scheme === 'file' && runtime.fileFs) {
            return runtime.fileFs.readDirectory(uriString);
        }
        return vscode_1.workspace.fs.readDirectory(uri);
    }));
    disposables.push(client.onRequest(FsStatRequest.type, (uriString) => {
        const uri = vscode_1.Uri.parse(uriString);
        if (uri.scheme === 'file' && runtime.fileFs) {
            return runtime.fileFs.stat(uriString);
        }
        return vscode_1.workspace.fs.stat(uri);
    }));
    return vscode_1.Disposable.from(...disposables);
}
var FileType;
(function (FileType) {
    /**
     * The file type is unknown.
     */
    FileType[FileType["Unknown"] = 0] = "Unknown";
    /**
     * A regular file.
     */
    FileType[FileType["File"] = 1] = "File";
    /**
     * A directory.
     */
    FileType[FileType["Directory"] = 2] = "Directory";
    /**
     * A symbolic link to a file.
     */
    FileType[FileType["SymbolicLink"] = 64] = "SymbolicLink";
})(FileType || (exports.FileType = FileType = {}));
//# sourceMappingURL=requests.js.map