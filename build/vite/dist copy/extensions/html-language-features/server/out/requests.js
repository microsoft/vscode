"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileType = exports.FsReadDirRequest = exports.FsStatRequest = void 0;
exports.getFileSystemProvider = getFileSystemProvider;
const vscode_languageserver_1 = require("vscode-languageserver");
var FsStatRequest;
(function (FsStatRequest) {
    FsStatRequest.type = new vscode_languageserver_1.RequestType('fs/stat');
})(FsStatRequest || (exports.FsStatRequest = FsStatRequest = {}));
var FsReadDirRequest;
(function (FsReadDirRequest) {
    FsReadDirRequest.type = new vscode_languageserver_1.RequestType('fs/readDir');
})(FsReadDirRequest || (exports.FsReadDirRequest = FsReadDirRequest = {}));
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
function getFileSystemProvider(handledSchemas, connection, runtime) {
    const fileFs = runtime.fileFs && handledSchemas.indexOf('file') !== -1 ? runtime.fileFs : undefined;
    return {
        async stat(uri) {
            if (fileFs && uri.startsWith('file:')) {
                return fileFs.stat(uri);
            }
            const res = await connection.sendRequest(FsStatRequest.type, uri.toString());
            return res;
        },
        readDirectory(uri) {
            if (fileFs && uri.startsWith('file:')) {
                return fileFs.readDirectory(uri);
            }
            return connection.sendRequest(FsReadDirRequest.type, uri.toString());
        }
    };
}
//# sourceMappingURL=requests.js.map