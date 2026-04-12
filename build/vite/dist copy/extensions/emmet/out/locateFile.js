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
exports.locateFile = locateFile;
// Based on @sergeche's work on the emmet plugin for atom
// TODO: Move to https://github.com/emmetio/file-utils
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const reAbsolutePosix = /^\/+/;
const reAbsoluteWin32 = /^\\+/;
const reAbsolute = path.sep === '/' ? reAbsolutePosix : reAbsoluteWin32;
/**
 * Locates given `filePath` on user's file system and returns absolute path to it.
 * This method expects either URL, or relative/absolute path to resource
 * @param basePath Base path to use if filePath is not absoulte
 * @param filePath File to locate.
 */
function locateFile(base, filePath) {
    if (/^\w+:/.test(filePath)) {
        // path with protocol, already absolute
        return Promise.resolve(filePath);
    }
    filePath = path.normalize(filePath);
    return reAbsolute.test(filePath)
        ? resolveAbsolute(base, filePath)
        : resolveRelative(base, filePath);
}
/**
 * Resolves relative file path
 */
function resolveRelative(basePath, filePath) {
    return tryFile(path.resolve(basePath, filePath));
}
/**
 * Resolves absolute file path agaist given editor: tries to find file in every
 * parent of editor's file
 */
function resolveAbsolute(basePath, filePath) {
    return new Promise((resolve, reject) => {
        filePath = filePath.replace(reAbsolute, '');
        const next = (ctx) => {
            tryFile(path.resolve(ctx, filePath))
                .then(resolve, () => {
                const dir = path.dirname(ctx);
                if (!dir || dir === ctx) {
                    return reject(`Unable to locate absolute file ${filePath}`);
                }
                next(dir);
            });
        };
        next(basePath);
    });
}
/**
 * Check if given file exists and it's a file, not directory
 */
function tryFile(file) {
    return new Promise((resolve, reject) => {
        fs.stat(file, (err, stat) => {
            if (err) {
                return reject(err);
            }
            if (!stat.isFile()) {
                return reject(new Error(`${file} is not a file`));
            }
            resolve(file);
        });
    });
}
//# sourceMappingURL=locateFile.js.map