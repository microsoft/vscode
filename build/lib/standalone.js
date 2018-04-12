"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
var fs = require("fs");
var path = require("path");
var REPO_ROOT = path.join(__dirname, '../../');
var SRC_DIR = path.join(REPO_ROOT, 'src');
var OUT_EDITOR = path.join(REPO_ROOT, 'out-editor');
function createESMSourcesAndResources(options) {
    var OUT_FOLDER = path.join(REPO_ROOT, options.outFolder);
    var OUT_RESOURCES_FOLDER = path.join(REPO_ROOT, options.outResourcesFolder);
    var in_queue = Object.create(null);
    var queue = [];
    var enqueue = function (module) {
        if (in_queue[module]) {
            return;
        }
        in_queue[module] = true;
        queue.push(module);
    };
    var seenDir = {};
    var createDirectoryRecursive = function (dir) {
        if (seenDir[dir]) {
            return;
        }
        var lastSlash = dir.lastIndexOf('/');
        if (lastSlash === -1) {
            lastSlash = dir.lastIndexOf('\\');
        }
        if (lastSlash !== -1) {
            createDirectoryRecursive(dir.substring(0, lastSlash));
        }
        seenDir[dir] = true;
        try {
            fs.mkdirSync(dir);
        }
        catch (err) { }
    };
    seenDir[REPO_ROOT] = true;
    var toggleComments = function (fileContents) {
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
    };
    var write = function (filePath, contents) {
        var absoluteFilePath;
        if (/\.ts$/.test(filePath)) {
            absoluteFilePath = path.join(OUT_FOLDER, filePath);
        }
        else {
            absoluteFilePath = path.join(OUT_RESOURCES_FOLDER, filePath);
        }
        createDirectoryRecursive(path.dirname(absoluteFilePath));
        if (/(\.ts$)|(\.js$)/.test(filePath)) {
            contents = toggleComments(contents.toString());
        }
        fs.writeFileSync(absoluteFilePath, contents);
    };
    options.entryPoints.forEach(function (entryPoint) { return enqueue(entryPoint); });
    while (queue.length > 0) {
        var module_1 = queue.shift();
        if (transportCSS(options, module_1, enqueue, write)) {
            continue;
        }
        if (transportResource(options, module_1, enqueue, write)) {
            continue;
        }
        if (transportDTS(options, module_1, enqueue, write)) {
            continue;
        }
        var filename = void 0;
        if (options.redirects[module_1]) {
            filename = path.join(SRC_DIR, options.redirects[module_1] + '.ts');
        }
        else {
            filename = path.join(SRC_DIR, module_1 + '.ts');
        }
        var fileContents = fs.readFileSync(filename).toString();
        var info = ts.preProcessFile(fileContents);
        for (var i = info.importedFiles.length - 1; i >= 0; i--) {
            var importedFilename = info.importedFiles[i].fileName;
            var pos = info.importedFiles[i].pos;
            var end = info.importedFiles[i].end;
            var importedFilepath = void 0;
            if (/^vs\/css!/.test(importedFilename)) {
                importedFilepath = importedFilename.substr('vs/css!'.length) + '.css';
            }
            else {
                importedFilepath = importedFilename;
            }
            if (/(^\.\/)|(^\.\.\/)/.test(importedFilepath)) {
                importedFilepath = path.join(path.dirname(module_1), importedFilepath);
            }
            enqueue(importedFilepath);
            var relativePath = void 0;
            if (importedFilepath === path.dirname(module_1)) {
                relativePath = '../' + path.basename(path.dirname(module_1));
            }
            else if (importedFilepath === path.dirname(path.dirname(module_1))) {
                relativePath = '../../' + path.basename(path.dirname(path.dirname(module_1)));
            }
            else {
                relativePath = path.relative(path.dirname(module_1), importedFilepath);
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
        fileContents = fileContents.replace(/Thenable/g, 'PromiseLike');
        write(module_1 + '.ts', fileContents);
    }
    var esm_opts = {
        "compilerOptions": {
            "outDir": path.relative(path.dirname(OUT_FOLDER), OUT_RESOURCES_FOLDER),
            "rootDir": "src",
            "module": "es6",
            "target": "es5",
            "experimentalDecorators": true,
            "lib": [
                "dom",
                "es5",
                "es2015.collection",
                "es2015.promise"
            ],
            "types": []
        }
    };
    fs.writeFileSync(path.join(path.dirname(OUT_FOLDER), 'tsconfig.json'), JSON.stringify(esm_opts, null, '\t'));
    var monacodts = fs.readFileSync(path.join(SRC_DIR, 'vs/monaco.d.ts')).toString();
    fs.writeFileSync(path.join(OUT_FOLDER, 'vs/monaco.d.ts'), monacodts);
}
exports.createESMSourcesAndResources = createESMSourcesAndResources;
function transportCSS(options, module, enqueue, write) {
    if (!/\.css/.test(module)) {
        return false;
    }
    var filename = path.join(SRC_DIR, module);
    var fileContents = fs.readFileSync(filename).toString();
    var inlineResources = 'base64'; // see https://github.com/Microsoft/monaco-editor/issues/148
    var inlineResourcesLimit = 300000; //3000; // see https://github.com/Microsoft/monaco-editor/issues/336
    var newContents = _rewriteOrInlineUrls(filename, fileContents, inlineResources === 'base64', inlineResourcesLimit);
    write(module, newContents);
    return true;
    function _rewriteOrInlineUrls(originalFileFSPath, contents, forceBase64, inlineByteLimit) {
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
function transportResource(options, module, enqueue, write) {
    if (!/\.svg/.test(module)) {
        return false;
    }
    write(module, fs.readFileSync(path.join(SRC_DIR, module)));
    return true;
}
function transportDTS(options, module, enqueue, write) {
    if (options.redirects[module] && fs.existsSync(path.join(SRC_DIR, options.redirects[module] + '.ts'))) {
        return false;
    }
    if (!fs.existsSync(path.join(SRC_DIR, module + '.d.ts'))) {
        return false;
    }
    write(module + '.d.ts', fs.readFileSync(path.join(SRC_DIR, module + '.d.ts')));
    var filename;
    if (options.redirects[module]) {
        write(module + '.js', fs.readFileSync(path.join(SRC_DIR, options.redirects[module] + '.js')));
    }
    else {
        write(module + '.js', fs.readFileSync(path.join(SRC_DIR, module + '.js')));
    }
    return true;
}
