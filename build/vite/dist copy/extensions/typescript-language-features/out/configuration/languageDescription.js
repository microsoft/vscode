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
exports.standardLanguageDescriptions = exports.allDiagnosticLanguages = void 0;
exports.isTsConfigFileName = isTsConfigFileName;
exports.isJsConfigOrTsConfigFileName = isJsConfigOrTsConfigFileName;
exports.doesResourceLookLikeATypeScriptFile = doesResourceLookLikeATypeScriptFile;
exports.doesResourceLookLikeAJavaScriptFile = doesResourceLookLikeAJavaScriptFile;
const path_1 = require("path");
const languageIds = __importStar(require("./languageIds"));
exports.allDiagnosticLanguages = [0 /* DiagnosticLanguage.JavaScript */, 1 /* DiagnosticLanguage.TypeScript */];
exports.standardLanguageDescriptions = [
    {
        id: 'typescript',
        diagnosticOwner: 'typescript',
        diagnosticSource: 'ts',
        diagnosticLanguage: 1 /* DiagnosticLanguage.TypeScript */,
        languageIds: [languageIds.typescript, languageIds.typescriptreact],
        configFilePattern: /^tsconfig(\..*)?\.json$/i,
        standardFileExtensions: [
            'ts',
            'tsx',
            'cts',
            'mts'
        ],
    },
    {
        id: 'javascript',
        diagnosticOwner: 'typescript',
        diagnosticSource: 'ts',
        diagnosticLanguage: 0 /* DiagnosticLanguage.JavaScript */,
        languageIds: [languageIds.javascript, languageIds.javascriptreact],
        configFilePattern: /^jsconfig(\..*)?\.json$/i,
        standardFileExtensions: [
            'js',
            'jsx',
            'cjs',
            'mjs',
            'es6',
            'pac',
        ],
    }
];
function isTsConfigFileName(fileName) {
    return /^tsconfig\.(.+\.)?json$/i.test((0, path_1.basename)(fileName));
}
function isJsConfigOrTsConfigFileName(fileName) {
    return /^[jt]sconfig\.(.+\.)?json$/i.test((0, path_1.basename)(fileName));
}
function doesResourceLookLikeATypeScriptFile(resource) {
    return /\.(tsx?|mts|cts)$/i.test(resource.fsPath);
}
function doesResourceLookLikeAJavaScriptFile(resource) {
    return /\.(jsx?|mjs|cjs)$/i.test(resource.fsPath);
}
//# sourceMappingURL=languageDescription.js.map