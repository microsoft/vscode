"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileType = exports.FsReadDirRequest = exports.FsStatRequest = exports.FsContentRequest = void 0;
exports.getRequestService = getRequestService;
const vscode_languageserver_1 = require("vscode-languageserver");
var FsContentRequest;
(function (FsContentRequest) {
    FsContentRequest.type = new vscode_languageserver_1.RequestType('fs/content');
})(FsContentRequest || (exports.FsContentRequest = FsContentRequest = {}));
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
function getRequestService(handledSchemas, connection, runtime) {
    const builtInHandlers = {};
    for (const protocol of handledSchemas) {
        if (protocol === 'file') {
            builtInHandlers[protocol] = runtime.file;
        }
        else if (protocol === 'http' || protocol === 'https') {
            builtInHandlers[protocol] = runtime.http;
        }
    }
    return {
        async stat(uri) {
            const handler = builtInHandlers[getScheme(uri)];
            if (handler) {
                return handler.stat(uri);
            }
            const res = await connection.sendRequest(FsStatRequest.type, uri.toString());
            return res;
        },
        readDirectory(uri) {
            const handler = builtInHandlers[getScheme(uri)];
            if (handler) {
                return handler.readDirectory(uri);
            }
            return connection.sendRequest(FsReadDirRequest.type, uri.toString());
        },
        getContent(uri, encoding) {
            const handler = builtInHandlers[getScheme(uri)];
            if (handler) {
                return handler.getContent(uri, encoding);
            }
            return connection.sendRequest(FsContentRequest.type, { uri: uri.toString(), encoding });
        }
    };
}
function getScheme(uri) {
    return uri.substr(0, uri.indexOf(':'));
}
//# sourceMappingURL=requests.js.map