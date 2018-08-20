"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
var fs = require("fs");
var path = require("path");
var tss = require("./treeshaking");
var REPO_ROOT = path.join(__dirname, '../../');
var SRC_DIR = path.join(REPO_ROOT, 'src');
var dirCache = {};
function writeFile(filePath, contents) {
    function ensureDirs(dirPath) {
        if (dirCache[dirPath]) {
            return;
        }
        dirCache[dirPath] = true;
        ensureDirs(path.dirname(dirPath));
        if (fs.existsSync(dirPath)) {
            return;
        }
        fs.mkdirSync(dirPath);
    }
    ensureDirs(path.dirname(filePath));
    fs.writeFileSync(filePath, contents);
}
function extractEditor(options) {
    var result = tss.shake(options);
    for (var fileName in result) {
        if (result.hasOwnProperty(fileName)) {
            writeFile(path.join(options.destRoot, fileName), result[fileName]);
        }
    }
    var copied = {};
    var copyFile = function (fileName) {
        if (copied[fileName]) {
            return;
        }
        copied[fileName] = true;
        var srcPath = path.join(options.sourcesRoot, fileName);
        var dstPath = path.join(options.destRoot, fileName);
        writeFile(dstPath, fs.readFileSync(srcPath));
    };
    var writeOutputFile = function (fileName, contents) {
        writeFile(path.join(options.destRoot, fileName), contents);
    };
    for (var fileName in result) {
        if (result.hasOwnProperty(fileName)) {
            var fileContents = result[fileName];
            var info = ts.preProcessFile(fileContents);
            for (var i = info.importedFiles.length - 1; i >= 0; i--) {
                var importedFileName = info.importedFiles[i].fileName;
                var importedFilePath = void 0;
                if (/^vs\/css!/.test(importedFileName)) {
                    importedFilePath = importedFileName.substr('vs/css!'.length) + '.css';
                }
                else {
                    importedFilePath = importedFileName;
                }
                if (/(^\.\/)|(^\.\.\/)/.test(importedFilePath)) {
                    importedFilePath = path.join(path.dirname(fileName), importedFilePath);
                }
                if (/\.css$/.test(importedFilePath)) {
                    transportCSS(importedFilePath, copyFile, writeOutputFile);
                }
                else {
                    if (fs.existsSync(path.join(options.sourcesRoot, importedFilePath + '.js'))) {
                        copyFile(importedFilePath + '.js');
                    }
                }
            }
        }
    }
    var tsConfig = JSON.parse(fs.readFileSync(path.join(options.sourcesRoot, 'tsconfig.json')).toString());
    tsConfig.compilerOptions.noUnusedLocals = false;
    tsConfig.compilerOptions.preserveConstEnums = false;
    tsConfig.compilerOptions.declaration = false;
    writeOutputFile('tsconfig.json', JSON.stringify(tsConfig, null, '\t'));
    [
        'vs/css.build.js',
        'vs/css.d.ts',
        'vs/css.js',
        'vs/loader.js',
        'vs/monaco.d.ts',
        'vs/nls.build.js',
        'vs/nls.d.ts',
        'vs/nls.js',
        'vs/nls.mock.ts',
        'typings/lib.ie11_safe_es6.d.ts',
        'typings/thenable.d.ts',
        'typings/es6-promise.d.ts',
        'typings/require.d.ts',
    ].forEach(copyFile);
}
exports.extractEditor = extractEditor;
function createESMSourcesAndResources2(options) {
    var SRC_FOLDER = path.join(REPO_ROOT, options.srcFolder);
    var OUT_FOLDER = path.join(REPO_ROOT, options.outFolder);
    var OUT_RESOURCES_FOLDER = path.join(REPO_ROOT, options.outResourcesFolder);
    var getDestAbsoluteFilePath = function (file) {
        var dest = options.renames[file.replace(/\\/g, '/')] || file;
        if (dest === 'tsconfig.json') {
            return path.join(OUT_FOLDER, "../tsconfig.json");
        }
        if (/\.ts$/.test(dest)) {
            return path.join(OUT_FOLDER, dest);
        }
        return path.join(OUT_RESOURCES_FOLDER, dest);
    };
    var allFiles = walkDirRecursive(SRC_FOLDER);
    for (var i = 0; i < allFiles.length; i++) {
        var file = allFiles[i];
        if (options.ignores.indexOf(file.replace(/\\/g, '/')) >= 0) {
            continue;
        }
        if (file === 'tsconfig.json') {
            var tsConfig = JSON.parse(fs.readFileSync(path.join(SRC_FOLDER, file)).toString());
            tsConfig.compilerOptions.moduleResolution = undefined;
            tsConfig.compilerOptions.baseUrl = undefined;
            tsConfig.compilerOptions.module = 'es6';
            tsConfig.compilerOptions.rootDir = 'src';
            tsConfig.compilerOptions.outDir = path.relative(path.dirname(OUT_FOLDER), OUT_RESOURCES_FOLDER);
            write(getDestAbsoluteFilePath(file), JSON.stringify(tsConfig, null, '\t'));
            continue;
        }
        if (/\.d\.ts$/.test(file) || /\.css$/.test(file) || /\.js$/.test(file)) {
            // Transport the files directly
            write(getDestAbsoluteFilePath(file), fs.readFileSync(path.join(SRC_FOLDER, file)));
            continue;
        }
        if (/\.ts$/.test(file)) {
            // Transform the .ts file
            var fileContents = fs.readFileSync(path.join(SRC_FOLDER, file)).toString();
            var info = ts.preProcessFile(fileContents);
            for (var i_1 = info.importedFiles.length - 1; i_1 >= 0; i_1--) {
                var importedFilename = info.importedFiles[i_1].fileName;
                var pos = info.importedFiles[i_1].pos;
                var end = info.importedFiles[i_1].end;
                var importedFilepath = void 0;
                if (/^vs\/css!/.test(importedFilename)) {
                    importedFilepath = importedFilename.substr('vs/css!'.length) + '.css';
                }
                else {
                    importedFilepath = importedFilename;
                }
                if (/(^\.\/)|(^\.\.\/)/.test(importedFilepath)) {
                    importedFilepath = path.join(path.dirname(file), importedFilepath);
                }
                var relativePath = void 0;
                if (importedFilepath === path.dirname(file)) {
                    relativePath = '../' + path.basename(path.dirname(file));
                }
                else if (importedFilepath === path.dirname(path.dirname(file))) {
                    relativePath = '../../' + path.basename(path.dirname(path.dirname(file)));
                }
                else {
                    relativePath = path.relative(path.dirname(file), importedFilepath);
                }
                if (!/(^\.\/)|(^\.\.\/)/.test(relativePath)) {
                    relativePath = './' + relativePath;
                }
                fileContents = (fileContents.substring(0, pos + 1)
                    + relativePath
                    + fileContents.substring(end + 1));
            }
            fileContents = fileContents.replace(/import ([a-zA-z0-9]+) = require\(('[^']+')\);/g, function (_, m1, m2) {
                return "import * as " + m1 + " from " + m2 + ";";
            });
            write(getDestAbsoluteFilePath(file), fileContents);
            continue;
        }
        console.log("UNKNOWN FILE: " + file);
    }
    function walkDirRecursive(dir) {
        if (dir.charAt(dir.length - 1) !== '/' || dir.charAt(dir.length - 1) !== '\\') {
            dir += '/';
        }
        var result = [];
        _walkDirRecursive(dir, result, dir.length);
        return result;
    }
    function _walkDirRecursive(dir, result, trimPos) {
        var files = fs.readdirSync(dir);
        for (var i = 0; i < files.length; i++) {
            var file = path.join(dir, files[i]);
            if (fs.statSync(file).isDirectory()) {
                _walkDirRecursive(file, result, trimPos);
            }
            else {
                result.push(file.substr(trimPos));
            }
        }
    }
    function write(absoluteFilePath, contents) {
        if (/(\.ts$)|(\.js$)/.test(absoluteFilePath)) {
            contents = toggleComments(contents.toString());
        }
        writeFile(absoluteFilePath, contents);
        function toggleComments(fileContents) {
            var lines = fileContents.split(/\r\n|\r|\n/);
            var mode = 0;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (mode === 0) {
                    if (/\/\/ ESM-comment-begin/.test(line)) {
                        mode = 1;
                        continue;
                    }
                    if (/\/\/ ESM-uncomment-begin/.test(line)) {
                        mode = 2;
                        continue;
                    }
                    continue;
                }
                if (mode === 1) {
                    if (/\/\/ ESM-comment-end/.test(line)) {
                        mode = 0;
                        continue;
                    }
                    lines[i] = '// ' + line;
                    continue;
                }
                if (mode === 2) {
                    if (/\/\/ ESM-uncomment-end/.test(line)) {
                        mode = 0;
                        continue;
                    }
                    lines[i] = line.replace(/^(\s*)\/\/ ?/, function (_, indent) {
                        return indent;
                    });
                }
            }
            return lines.join('\n');
        }
    }
}
exports.createESMSourcesAndResources2 = createESMSourcesAndResources2;
function transportCSS(module, enqueue, write) {
    if (!/\.css/.test(module)) {
        return false;
    }
    var filename = path.join(SRC_DIR, module);
    var fileContents = fs.readFileSync(filename).toString();
    var inlineResources = 'base64'; // see https://github.com/Microsoft/monaco-editor/issues/148
    var inlineResourcesLimit = 300000; //3000; // see https://github.com/Microsoft/monaco-editor/issues/336
    var newContents = _rewriteOrInlineUrls(fileContents, inlineResources === 'base64', inlineResourcesLimit);
    write(module, newContents);
    return true;
    function _rewriteOrInlineUrls(contents, forceBase64, inlineByteLimit) {
        return _replaceURL(contents, function (url) {
            var imagePath = path.join(path.dirname(module), url);
            var fileContents = fs.readFileSync(path.join(SRC_DIR, imagePath));
            if (fileContents.length < inlineByteLimit) {
                var MIME = /\.svg$/.test(url) ? 'image/svg+xml' : 'image/png';
                var DATA = ';base64,' + fileContents.toString('base64');
                if (!forceBase64 && /\.svg$/.test(url)) {
                    // .svg => url encode as explained at https://codepen.io/tigt/post/optimizing-svgs-in-data-uris
                    var newText = fileContents.toString()
                        .replace(/"/g, '\'')
                        .replace(/</g, '%3C')
                        .replace(/>/g, '%3E')
                        .replace(/&/g, '%26')
                        .replace(/#/g, '%23')
                        .replace(/\s+/g, ' ');
                    var encodedData = ',' + newText;
                    if (encodedData.length < DATA.length) {
                        DATA = encodedData;
                    }
                }
                return '"data:' + MIME + DATA + '"';
            }
            enqueue(imagePath);
            return url;
        });
    }
    function _replaceURL(contents, replacer) {
        // Use ")" as the terminator as quotes are oftentimes not used at all
        return contents.replace(/url\(\s*([^\)]+)\s*\)?/g, function (_) {
            var matches = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                matches[_i - 1] = arguments[_i];
            }
            var url = matches[0];
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
