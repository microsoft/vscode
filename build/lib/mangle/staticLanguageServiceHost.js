"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaticLanguageServiceHost = void 0;
const typescript_1 = __importDefault(require("typescript"));
const path_1 = __importDefault(require("path"));
class StaticLanguageServiceHost {
    projectPath;
    _cmdLine;
    _scriptSnapshots = new Map();
    constructor(projectPath) {
        this.projectPath = projectPath;
        const existingOptions = {};
        const parsed = typescript_1.default.readConfigFile(projectPath, typescript_1.default.sys.readFile);
        if (parsed.error) {
            throw parsed.error;
        }
        this._cmdLine = typescript_1.default.parseJsonConfigFileContent(parsed.config, typescript_1.default.sys, path_1.default.dirname(projectPath), existingOptions);
        if (this._cmdLine.errors.length > 0) {
            throw parsed.error;
        }
    }
    getCompilationSettings() {
        return this._cmdLine.options;
    }
    getScriptFileNames() {
        return this._cmdLine.fileNames;
    }
    getScriptVersion(_fileName) {
        return '1';
    }
    getProjectVersion() {
        return '1';
    }
    getScriptSnapshot(fileName) {
        let result = this._scriptSnapshots.get(fileName);
        if (result === undefined) {
            const content = typescript_1.default.sys.readFile(fileName);
            if (content === undefined) {
                return undefined;
            }
            result = typescript_1.default.ScriptSnapshot.fromString(content);
            this._scriptSnapshots.set(fileName, result);
        }
        return result;
    }
    getCurrentDirectory() {
        return path_1.default.dirname(this.projectPath);
    }
    getDefaultLibFileName(options) {
        return typescript_1.default.getDefaultLibFilePath(options);
    }
    directoryExists = typescript_1.default.sys.directoryExists;
    getDirectories = typescript_1.default.sys.getDirectories;
    fileExists = typescript_1.default.sys.fileExists;
    readFile = typescript_1.default.sys.readFile;
    readDirectory = typescript_1.default.sys.readDirectory;
    // this is necessary to make source references work.
    realpath = typescript_1.default.sys.realpath;
}
exports.StaticLanguageServiceHost = StaticLanguageServiceHost;
//# sourceMappingURL=staticLanguageServiceHost.js.map