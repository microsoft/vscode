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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractEditor = extractEditor;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tss = __importStar(require("./treeshaking"));
const REPO_ROOT = path_1.default.join(__dirname, '../../');
const SRC_DIR = path_1.default.join(REPO_ROOT, 'src');
const dirCache = {};
function writeFile(filePath, contents) {
    function ensureDirs(dirPath) {
        if (dirCache[dirPath]) {
            return;
        }
        dirCache[dirPath] = true;
        ensureDirs(path_1.default.dirname(dirPath));
        if (fs_1.default.existsSync(dirPath)) {
            return;
        }
        fs_1.default.mkdirSync(dirPath);
    }
    ensureDirs(path_1.default.dirname(filePath));
    fs_1.default.writeFileSync(filePath, contents);
}
function extractEditor(options) {
    const ts = require('typescript');
    const tsConfig = JSON.parse(fs_1.default.readFileSync(path_1.default.join(options.sourcesRoot, 'tsconfig.monaco.json')).toString());
    let compilerOptions;
    if (tsConfig.extends) {
        compilerOptions = Object.assign({}, require(path_1.default.join(options.sourcesRoot, tsConfig.extends)).compilerOptions, tsConfig.compilerOptions);
        delete tsConfig.extends;
    }
    else {
        compilerOptions = tsConfig.compilerOptions;
    }
    tsConfig.compilerOptions = compilerOptions;
    tsConfig.compilerOptions.sourceMap = true;
    tsConfig.compilerOptions.module = 'es2022';
    tsConfig.compilerOptions.outDir = options.tsOutDir;
    compilerOptions.noEmit = false;
    compilerOptions.noUnusedLocals = false;
    compilerOptions.preserveConstEnums = false;
    compilerOptions.declaration = false;
    compilerOptions.moduleResolution = ts.ModuleResolutionKind.Classic;
    options.compilerOptions = compilerOptions;
    console.log(`Running tree shaker with shakeLevel ${tss.toStringShakeLevel(options.shakeLevel)}`);
    // Take the extra included .d.ts files from `tsconfig.monaco.json`
    options.typings = tsConfig.include.filter(includedFile => /\.d\.ts$/.test(includedFile));
    // Add extra .d.ts files from `node_modules/@types/`
    if (Array.isArray(options.compilerOptions?.types)) {
        options.compilerOptions.types.forEach((type) => {
            if (type === '@webgpu/types') {
                options.typings.push(`../node_modules/${type}/dist/index.d.ts`);
            }
            else {
                options.typings.push(`../node_modules/@types/${type}/index.d.ts`);
            }
        });
    }
    const result = tss.shake(options);
    for (const fileName in result) {
        if (result.hasOwnProperty(fileName)) {
            writeFile(path_1.default.join(options.destRoot, fileName), result[fileName]);
        }
    }
    const copied = {};
    const copyFile = (fileName) => {
        if (copied[fileName]) {
            return;
        }
        copied[fileName] = true;
        const srcPath = path_1.default.join(options.sourcesRoot, fileName);
        const dstPath = path_1.default.join(options.destRoot, fileName);
        writeFile(dstPath, fs_1.default.readFileSync(srcPath));
    };
    const writeOutputFile = (fileName, contents) => {
        writeFile(path_1.default.join(options.destRoot, fileName), contents);
    };
    for (const fileName in result) {
        if (result.hasOwnProperty(fileName)) {
            const fileContents = result[fileName];
            const info = ts.preProcessFile(fileContents);
            for (let i = info.importedFiles.length - 1; i >= 0; i--) {
                const importedFileName = info.importedFiles[i].fileName;
                let importedFilePath = importedFileName;
                if (/(^\.\/)|(^\.\.\/)/.test(importedFilePath)) {
                    importedFilePath = path_1.default.join(path_1.default.dirname(fileName), importedFilePath);
                }
                if (/\.css$/.test(importedFilePath)) {
                    transportCSS(importedFilePath, copyFile, writeOutputFile);
                }
                else {
                    const pathToCopy = path_1.default.join(options.sourcesRoot, importedFilePath);
                    if (fs_1.default.existsSync(pathToCopy) && !fs_1.default.statSync(pathToCopy).isDirectory()) {
                        copyFile(importedFilePath);
                    }
                }
            }
        }
    }
    delete tsConfig.compilerOptions.moduleResolution;
    writeOutputFile('tsconfig.json', JSON.stringify(tsConfig, null, '\t'));
    [
        'vs/loader.js'
    ].forEach(copyFile);
}
function transportCSS(module, enqueue, write) {
    if (!/\.css/.test(module)) {
        return false;
    }
    const filename = path_1.default.join(SRC_DIR, module);
    const fileContents = fs_1.default.readFileSync(filename).toString();
    const inlineResources = 'base64'; // see https://github.com/microsoft/monaco-editor/issues/148
    const newContents = _rewriteOrInlineUrls(fileContents, inlineResources === 'base64');
    write(module, newContents);
    return true;
    function _rewriteOrInlineUrls(contents, forceBase64) {
        return _replaceURL(contents, (url) => {
            const fontMatch = url.match(/^(.*).ttf\?(.*)$/);
            if (fontMatch) {
                const relativeFontPath = `${fontMatch[1]}.ttf`; // trim the query parameter
                const fontPath = path_1.default.join(path_1.default.dirname(module), relativeFontPath);
                enqueue(fontPath);
                return relativeFontPath;
            }
            const imagePath = path_1.default.join(path_1.default.dirname(module), url);
            const fileContents = fs_1.default.readFileSync(path_1.default.join(SRC_DIR, imagePath));
            const MIME = /\.svg$/.test(url) ? 'image/svg+xml' : 'image/png';
            let DATA = ';base64,' + fileContents.toString('base64');
            if (!forceBase64 && /\.svg$/.test(url)) {
                // .svg => url encode as explained at https://codepen.io/tigt/post/optimizing-svgs-in-data-uris
                const newText = fileContents.toString()
                    .replace(/"/g, '\'')
                    .replace(/</g, '%3C')
                    .replace(/>/g, '%3E')
                    .replace(/&/g, '%26')
                    .replace(/#/g, '%23')
                    .replace(/\s+/g, ' ');
                const encodedData = ',' + newText;
                if (encodedData.length < DATA.length) {
                    DATA = encodedData;
                }
            }
            return '"data:' + MIME + DATA + '"';
        });
    }
    function _replaceURL(contents, replacer) {
        // Use ")" as the terminator as quotes are oftentimes not used at all
        return contents.replace(/url\(\s*([^\)]+)\s*\)?/g, (_, ...matches) => {
            let url = matches[0];
            // Eliminate starting quotes (the initial whitespace is not captured)
            if (url.charAt(0) === '"' || url.charAt(0) === '\'') {
                url = url.substring(1);
            }
            // The ending whitespace is captured
            while (url.length > 0 && (url.charAt(url.length - 1) === ' ' || url.charAt(url.length - 1) === '\t')) {
                url = url.substring(0, url.length - 1);
            }
            // Eliminate ending quotes
            if (url.charAt(url.length - 1) === '"' || url.charAt(url.length - 1) === '\'') {
                url = url.substring(0, url.length - 1);
            }
            if (!_startsWith(url, 'data:') && !_startsWith(url, 'http://') && !_startsWith(url, 'https://')) {
                url = replacer(url);
            }
            return 'url(' + url + ')';
        });
    }
    function _startsWith(haystack, needle) {
        return haystack.length >= needle.length && haystack.substr(0, needle.length) === needle;
    }
}
//# sourceMappingURL=standalone.js.map