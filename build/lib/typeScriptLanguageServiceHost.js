"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeScriptLanguageServiceHost = void 0;
const typescript_1 = __importDefault(require("typescript"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = require("node:path");
function normalizePath(filePath) {
    return (0, node_path_1.normalize)(filePath);
}
/**
 * A TypeScript language service host
 */
class TypeScriptLanguageServiceHost {
    ts;
    topLevelFiles;
    compilerOptions;
    constructor(ts, topLevelFiles, compilerOptions) {
        this.ts = ts;
        this.topLevelFiles = topLevelFiles;
        this.compilerOptions = compilerOptions;
    }
    // --- language service host ---------------
    getCompilationSettings() {
        return this.compilerOptions;
    }
    getScriptFileNames() {
        return [
            ...this.topLevelFiles.keys(),
            this.ts.getDefaultLibFilePath(this.compilerOptions)
        ];
    }
    getScriptVersion(_fileName) {
        return '1';
    }
    getProjectVersion() {
        return '1';
    }
    getScriptSnapshot(fileName) {
        fileName = normalizePath(fileName);
        if (this.topLevelFiles.has(fileName)) {
            return this.ts.ScriptSnapshot.fromString(this.topLevelFiles.get(fileName));
        }
        else {
            return typescript_1.default.ScriptSnapshot.fromString(node_fs_1.default.readFileSync(fileName).toString());
        }
    }
    getScriptKind(_fileName) {
        return this.ts.ScriptKind.TS;
    }
    getCurrentDirectory() {
        return '';
    }
    getDefaultLibFileName(options) {
        return this.ts.getDefaultLibFilePath(options);
    }
    readFile(path, encoding) {
        path = normalizePath(path);
        if (this.topLevelFiles.get(path)) {
            return this.topLevelFiles.get(path);
        }
        return typescript_1.default.sys.readFile(path, encoding);
    }
    fileExists(path) {
        path = normalizePath(path);
        if (this.topLevelFiles.has(path)) {
            return true;
        }
        return typescript_1.default.sys.fileExists(path);
    }
}
exports.TypeScriptLanguageServiceHost = TypeScriptLanguageServiceHost;
//# sourceMappingURL=typeScriptLanguageServiceHost.js.map