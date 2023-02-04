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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YW5kYWxvbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixxQ0FBcUM7QUFFckMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDakQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFFNUMsTUFBTSxRQUFRLEdBQStCLEVBQUUsQ0FBQztBQUVoRCxTQUFTLFNBQVMsQ0FBQyxRQUFnQixFQUFFLFFBQXlCO0lBQzdELFNBQVMsVUFBVSxDQUFDLE9BQWU7UUFDbEMsSUFBSSxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDdEIsT0FBTztTQUNQO1FBQ0QsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQztRQUV6QixVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUMzQixPQUFPO1NBQ1A7UUFDRCxFQUFFLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFDRCxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ25DLEVBQUUsQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQ3RDLENBQUM7QUFFRCxTQUFnQixhQUFhLENBQUMsT0FBdUQ7SUFDcEYsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBZ0MsQ0FBQztJQUVoRSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMs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