"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileType = exports.FsReadDirRequest = exports.FsStatRequest = exports.FsContentRequest = void 0;
exports.serveFileSystemRequests = serveFileSystemRequests;
const vscode_1 = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
var FsContentRequest;
(function (FsContentRequest) {
    FsContentRequest.type = new vscode_languageclient_1.RequestType('fs/content');
})(FsContentRequest || (exports.FsContentRequest = FsContentRequest = {}));
var FsStatRequest;
(function (FsStatRequest) {
    FsStatRequest.type = new vscode_languageclient_1.RequestType('fs/stat');
})(FsStatRequest || (exports.FsStatRequest = FsStatRequest = {}));
var FsReadDirRequest;
(function (FsReadDirRequest) {
    FsReadDirRequest.type = new vscode_languageclient_1.RequestType('fs/readDir');
})(FsReadDirRequest || (exports.FsReadDirRequest = FsReadDirRequest = {}));
function serveFileSystemRequests(client, runtime) {
    client.onRequest(FsContentRequest.type, (param) => {
        const uri = vscode_1.Uri.parse(param.uri);
        if (uri.scheme === 'file' && runtime.fs) {
            return runtime.fs.getContent(param.uri);
        }
        return vscode_1.workspace.fs.readFile(uri).then(buffer => {
            return new runtime.TextDecoder(param.encoding).decode(buffer);
        });
    });
    client.onRequest(FsReadDirRequest.type, (uriString) => {
        const uri = vscode_1.Uri.parse(uriString);
        if (uri.scheme === 'file' && runtime.fs) {
            return runtime.fs.readDirectory(uriString);
        }
        return vscode_1.workspace.fs.readDirectory(uri);
    });
    client.onRequest(FsStatRequest.type, (uriString) => {
        const uri = vscode_1.Uri.parse(uriString);
        if (uri.scheme === 'file' && runtime.fs) {
            return runtime.fs.stat(uriString);
        }
        return vscode_1.workspace.fs.stat(uri);
    });
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