"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createESMSourcesAndResources2 = exports.extractEditor = void 0;
const fs = require("fs");
const path = require("path");
const tss = require("./treeshaking");
const REPO_ROOT = path.join(__dirname, '../../');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const dirCache = {};
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
    const ts = require('typescript');
    const tsConfig = JSON.parse(fs.readFileSync(path.join(options.sourcesRoot, 'tsconfig.monaco.json')).toString());
    let compilerOptions;
    if (tsConfig.extends) {
        compilerOptions = Object.assign({}, require(path.join(options.sourcesRoot, tsConfig.extends)).compilerOptions, tsConfig.compilerOptions);
        delete tsConfig.extends;
    }
    else {
        compilerOptions = tsConfig.compilerOptions;
    }
    tsConfig.compilerOptions = compilerOptions;
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
            options.typings.push(`../node_modules/@types/${type}/index.d.ts`);
        });
    }
    const result = tss.shake(options);
    for (const fileName in result) {
        if (result.hasOwnProperty(fileName)) {
            writeFile(path.join(options.destRoot, fileName), result[fileName]);
        }
    }
    const copied = {};
    const copyFile = (fileName) => {
        if (copied[fileName]) {
            return;
        }
        copied[fileName] = true;
        const srcPath = path.join(options.sourcesRoot, fileName);
        const dstPath = path.join(options.destRoot, fileName);
        writeFile(dstPath, fs.readFileSync(srcPath));
    };
    const writeOutputFile = (fileName, contents) => {
        writeFile(path.join(options.destRoot, fileName), contents);
    };
    for (const fileName in result) {
        if (result.hasOwnProperty(fileName)) {
            const fileContents = result[fileName];
            const info = ts.preProcessFile(fileContents);
            for (let i = info.importedFiles.length - 1; i >= 0; i--) {
                const importedFileName = info.importedFiles[i].fileName;
                let importedFilePath;
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
    delete tsConfig.compilerOptions.moduleResolution;
    writeOutputFile('tsconfig.json', JSON.stringify(tsConfig, null, '\t'));
    [
        'vs/css.build.ts',
        'vs/css.ts',
        'vs/loader.js',
        'vs/loader.d.ts',
        'vs/nls.build.ts',
        'vs/nls.ts',
        'vs/nls.mock.ts',
    ].forEach(copyFile);
}
exports.extractEditor = extractEditor;
function createESMSourcesAndResources2(options) {
    const ts = require('typescript');
    const SRC_FOLDER = path.join(REPO_ROOT, options.srcFolder);
    const OUT_FOLDER = path.join(REPO_ROOT, options.outFolder);
    const OUT_RESOURCES_FOLDER = path.join(REPO_ROOT, options.outResourcesFolder);
    const getDestAbsoluteFilePath = (file) => {
        const dest = options.renames[file.replace(/\\/g, '/')] || file;
        if (dest === 'tsconfig.json') {
            return path.join(OUT_FOLDER, `tsconfig.json`);
        }
        if (/\.ts$/.test(dest)) {
            return path.join(OUT_FOLDER, dest);
        }
        return path.join(OUT_RESOURCES_FOLDER, dest);
    };
    const allFiles = walkDirRecursive(SRC_FOLDER);
    for (const file of allFiles) {
        if (options.ignores.indexOf(file.replace(/\\/g, '/')) >= 0) {
            continue;
        }
        if (file === 'tsconfig.json') {
            const tsConfig = JSON.parse(fs.readFileSync(path.join(SRC_FOLDER, file)).toString());
            tsConfig.compilerOptions.module = 'es6';
            tsConfig.compilerOptions.outDir = path.join(path.relative(OUT_FOLDER, OUT_RESOURCES_FOLDER), 'vs').replace(/\\/g, '/');
            write(getDestAbsoluteFilePath(file), JSON.stringify(tsConfig, null, '\t'));
            continue;
        }
        if (/\.d\.ts$/.test(file) || /\.css$/.test(file) || /\.js$/.test(file) || /\.ttf$/.test(file)) {
            // Transport the files directly
            write(getDestAbsoluteFilePath(file), fs.readFileSync(path.join(SRC_FOLDER, file)));
            continue;
        }
        if (/\.ts$/.test(file)) {
            // Transform the .ts file
            let fileContents = fs.readFileSync(path.join(SRC_FOLDER, file)).toString();
            const info = ts.preProcessFile(fileContents);
            for (let i = info.importedFiles.length - 1; i >= 0; i--) {
                const importedFilename = info.importedFiles[i].fileName;
                const pos = info.importedFiles[i].pos;
                const end = info.importedFiles[i].end;
                let importedFilepath;
                if (/^vs\/css!/.test(importedFilename)) {
                    importedFilepath = importedFilename.substr('vs/css!'.length) + '.css';
                }
                else {
                    importedFilepath = importedFilename;
                }
                if (/(^\.\/)|(^\.\.\/)/.test(importedFilepath)) {
                    importedFilepath = path.join(path.dirname(file), importedFilepath);
                }
                let relativePath;
                if (importedFilepath === path.dirname(file).replace(/\\/g, '/')) {
                    relativePath = '../' + path.basename(path.dirname(file));
                }
                else if (importedFilepath === path.dirname(path.dirname(file)).replace(/\\/g, '/')) {
                    relativePath = '../../' + path.basename(path.dirname(path.dirname(file)));
                }
                else {
                    relativePath = path.relative(path.dirname(file), importedFilepath);
                }
                relativePath = relativePath.replace(/\\/g, '/');
                if (!/(^\.\/)|(^\.\.\/)/.test(relativePath)) {
                    relativePath = './' + relativePath;
                }
                fileContents = (fileContents.substring(0, pos + 1)
                    + relativePath
                    + fileContents.substring(end + 1));
            }
            fileContents = fileContents.replace(/import ([a-zA-Z0-9]+) = require\(('[^']+')\);/g, function (_, m1, m2) {
                return `import * as ${m1} from ${m2};`;
            });
            write(getDestAbsoluteFilePath(file), fileContents);
            continue;
        }
        console.log(`UNKNOWN FILE: ${file}`);
    }
    function walkDirRecursive(dir) {
        if (dir.charAt(dir.length - 1) !== '/' || dir.charAt(dir.length - 1) !== '\\') {
            dir += '/';
        }
        const result = [];
        _walkDirRecursive(dir, result, dir.length);
        return result;
    }
    function _walkDirRecursive(dir, result, trimPos) {
        const files = fs.readdirSync(dir);
        for (let i = 0; i < files.length; i++) {
            const file = path.join(dir, files[i]);
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
            const lines = fileContents.split(/\r\n|\r|\n/);
            let mode = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
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
    const filename = path.join(SRC_DIR, module);
    const fileContents = fs.readFileSync(filename).toString();
    const inlineResources = 'base64'; // see https://github.com/microsoft/monaco-editor/issues/148
    const newContents = _rewriteOrInlineUrls(fileContents, inlineResources === 'base64');
    write(module, newContents);
    return true;
    function _rewriteOrInlineUrls(contents, forceBase64) {
        return _replaceURL(contents, (url) => {
            const fontMatch = url.match(/^(.*).ttf\?(.*)$/);
            if (fontMatch) {
                const relativeFontPath = `${fontMatch[1]}.ttf`; // trim the query parameter
                const fontPath = path.join(path.dirname(module), relativeFontPath);
                enqueue(fontPath);
                return relativeFontPath;
            }
            const imagePath = path.join(path.dirname(module), url);
            const fileContents = fs.readFileSync(path.join(SRC_DIR, imagePath));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YW5kYWxvbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixxQ0FBcUM7QUFFckMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDakQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFFNUMsTUFBTSxRQUFRLEdBQStCLEVBQUUsQ0FBQztBQUVoRCxTQUFTLFNBQVMsQ0FBQyxRQUFnQixFQUFFLFFBQXlCO0lBQzdELFNBQVMsVUFBVSxDQUFDLE9BQWU7UUFDbEMsSUFBSSxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN2QixPQUFPO1FBQ1IsQ0FBQztRQUNELFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7UUFFekIsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNsQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM1QixPQUFPO1FBQ1IsQ0FBQztRQUNELEVBQUUsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUNELFVBQVUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDbkMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDdEMsQ0FBQztBQUVELFNBQWdCLGFBQWEsQ0FBQyxPQUF1RDtJQUNwRixNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFnQyxDQUFDO0lBRWhFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMs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