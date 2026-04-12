"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNodeFSRequestService = getNodeFSRequestService;
const fs = __importStar(require("fs"));
const vscode_1 = require("vscode");
const requests_1 = require("../requests");
function getNodeFSRequestService() {
    function ensureFileUri(location) {
        if (!location.startsWith('file://')) {
            throw new Error('fileRequestService can only handle file URLs');
        }
    }
    return {
        getContent(location, encoding) {
            ensureFileUri(location);
            return new Promise((c, e) => {
                const uri = vscode_1.Uri.parse(location);
                fs.readFile(uri.fsPath, encoding, (err, buf) => {
                    if (err) {
                        return e(err);
                    }
                    c(buf.toString());
                });
            });
        },
        stat(location) {
            ensureFileUri(location);
            return new Promise((c, e) => {
                const uri = vscode_1.Uri.parse(location);
                fs.stat(uri.fsPath, (err, stats) => {
                    if (err) {
                        if (err.code === 'ENOENT') {
                            return c({ type: requests_1.FileType.Unknown, ctime: -1, mtime: -1, size: -1 });
                        }
                        else {
                            return e(err);
                        }
                    }
                    let type = requests_1.FileType.Unknown;
                    if (stats.isFile()) {
                        type = requests_1.FileType.File;
                    }
                    else if (stats.isDirectory()) {
                        type = requests_1.FileType.Directory;
                    }
                    else if (stats.isSymbolicLink()) {
                        type = requests_1.FileType.SymbolicLink;
                    }
                    c({
                        type,
                        ctime: stats.ctime.getTime(),
                        mtime: stats.mtime.getTime(),
                        size: stats.size
                    });
                });
            });
        },
        readDirectory(location) {
            ensureFileUri(location);
            return new Promise((c, e) => {
                const path = vscode_1.Uri.parse(location).fsPath;
                fs.readdir(path, { withFileTypes: true }, (err, children) => {
                    if (err) {
                        return e(err);
                    }
                    c(children.map(stat => {
                        if (stat.isSymbolicLink()) {
                            return [stat.name, requests_1.FileType.SymbolicLink];
                        }
                        else if (stat.isDirectory()) {
                            return [stat.name, requests_1.FileType.Directory];
                        }
                        else if (stat.isFile()) {
                            return [stat.name, requests_1.FileType.File];
                        }
                        else {
                            return [stat.name, requests_1.FileType.Unknown];
                        }
                    }));
                });
            });
        }
    };
}
//# sourceMappingURL=nodeFs.js.map