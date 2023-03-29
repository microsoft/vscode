"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareIslFiles = exports.prepareI18nPackFiles = exports.createXlfFilesForIsl = exports.createXlfFilesForExtensions = exports.EXTERNAL_EXTENSIONS = exports.createXlfFilesForCoreBundle = exports.getResource = exports.processNlsFiles = exports.XLF = exports.Line = exports.extraLanguages = exports.defaultLanguages = void 0;
const path = require("path");
const fs = require("fs");
const event_stream_1 = require("event-stream");
const jsonMerge = require("gulp-merge-json");
const File = require("vinyl");
const Is = require("is");
const xml2js = require("xml2js");
const gulp = require("gulp");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const iconv = require("@vscode/iconv-lite-umd");
const l10n_dev_1 = require("@vscode/l10n-dev");
function log(message, ...rest) {
    fancyLog(ansiColors.green('[i18n]'), message, ...rest);
}
exports.defaultLanguages = [
    { id: 'zh-tw', folderName: 'cht', translationId: 'zh-hant' },
    { id: 'zh-cn', folderName: 'chs', translationId: 'zh-hans' },
    { id: 'ja', folderName: 'jpn' },
    { id: 'ko', folderName: 'kor' },
    { id: 'de', folderName: 'deu' },
    { id: 'fr', folderName: 'fra' },
    { id: 'es', folderName: 'esn' },
    { id: 'ru', folderName: 'rus' },
    { id: 'it', folderName: 'ita' }
];
// languages requested by the community to non-stable builds
exports.extraLanguages = [
    { id: 'pt-br', folderName: 'ptb' },
    { id: 'hu', folderName: 'hun' },
    { id: 'tr', folderName: 'trk' }
];
var LocalizeInfo;
(function (LocalizeInfo) {
    function is(value) {
        const candidate = value;
        return Is.defined(candidate) && Is.string(candidate.key) && (Is.undef(candidate.comment) || (Is.array(candidate.comment) && candidate.comment.every(element => Is.string(element))));
    }
    LocalizeInfo.is = is;
})(LocalizeInfo || (LocalizeInfo = {}));
var BundledFormat;
(function (BundledFormat) {
    function is(value) {
        if (Is.undef(value)) {
            return false;
        }
        const candidate = value;
        const length = Object.keys(value).length;
        return length === 3 && Is.defined(candidate.keys) && Is.defined(candidate.messages) && Is.defined(candidate.bundles);
    }
    BundledFormat.is = is;
})(BundledFormat || (BundledFormat = {}));
class Line {
    buffer = [];
    constructor(indent = 0) {
        if (indent > 0) {
            this.buffer.push(new Array(indent + 1).join(' '));
        }
    }
    append(value) {
        this.buffer.push(value);
        return this;
    }
    toString() {
        return this.buffer.join('');
    }
}
exports.Line = Line;
class TextModel {
    _lines;
    constructor(contents) {
        this._lines = contents.split(/\r\n|\r|\n/);
    }
    get lines() {
        return this._lines;
    }
}
class XLF {
    project;
    buffer;
    files;
    numberOfMessages;
    constructor(project) {
        this.project = project;
        this.buffer = [];
        this.files = Object.create(null);
        this.numberOfMessages = 0;
    }
    toString() {
        this.appendHeader();
        const files = Object.keys(this.files).sort();
        for (const file of files) {
            this.appendNewLine(`<file original="${file}" source-language="en" datatype="plaintext"><body>`, 2);
            const items = this.files[file].sort((a, b) => {
                return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
            });
            for (const item of items) {
                this.addStringItem(file, item);
            }
            this.appendNewLine('</body></file>');
        }
        this.appendFooter();
        return this.buffer.join('\r\n');
    }
    addFile(original, keys, messages) {
        if (keys.length === 0) {
            console.log('No keys in ' + original);
            return;
        }
        if (keys.length !== messages.length) {
            throw new Error(`Unmatching keys(${keys.length}) and messages(${messages.length}).`);
        }
        this.numberOfMessages += keys.length;
        this.files[original] = [];
        const existingKeys = new Set();
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            let realKey;
            let comment;
            if (Is.string(key)) {
                realKey = key;
                comment = undefined;
            }
            else if (LocalizeInfo.is(key)) {
                realKey = key.key;
                if (key.comment && key.comment.length > 0) {
                    comment = key.comment.map(comment => encodeEntities(comment)).join('\r\n');
                }
            }
            if (!realKey || existingKeys.has(realKey)) {
                continue;
            }
            existingKeys.add(realKey);
            const message = encodeEntities(messages[i]);
            this.files[original].push({ id: realKey, message: message, comment: comment });
        }
    }
    addStringItem(file, item) {
        if (!item.id || item.message === undefined || item.message === null) {
            throw new Error(`No item ID or value specified: ${JSON.stringify(item)}. File: ${file}`);
        }
        if (item.message.length === 0) {
            log(`Item with id ${item.id} in file ${file} has an empty message.`);
        }
        this.appendNewLine(`<trans-unit id="${item.id}">`, 4);
        this.appendNewLine(`<source xml:lang="en">${item.message}</source>`, 6);
        if (item.comment) {
            this.appendNewLine(`<note>${item.comment}</note>`, 6);
        }
        this.appendNewLine('</trans-unit>', 4);
    }
    appendHeader() {
        this.appendNewLine('<?xml version="1.0" encoding="utf-8"?>', 0);
        this.appendNewLine('<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">', 0);
    }
    appendFooter() {
        this.appendNewLine('</xliff>', 0);
    }
    appendNewLine(content, indent) {
        const line = new Line(indent);
        line.append(content);
        this.buffer.push(line.toString());
    }
    static parse = function (xlfString) {
        return new Promise((resolve, reject) => {
            const parser = new xml2js.Parser();
            const files = [];
            parser.parseString(xlfString, function (err, result) {
                if (err) {
                    reject(new Error(`XLF parsing error: Failed to parse XLIFF string. ${err}`));
                }
                const fileNodes = result['xliff']['file'];
                if (!fileNodes) {
                    reject(new Error(`XLF parsing error: XLIFF file does not contain "xliff" or "file" node(s) required for parsing.`));
                }
                fileNodes.forEach((file) => {
                    const name = file.$.original;
                    if (!name) {
                        reject(new Error(`XLF parsing error: XLIFF file node does not contain original attribute to determine the original location of the resource file.`));
                    }
                    const language = file.$['target-language'];
                    if (!language) {
                        reject(new Error(`XLF parsing error: XLIFF file node does not contain target-language attribute to determine translated language.`));
                    }
                    const messages = {};
                    const transUnits = file.body[0]['trans-unit'];
                    if (transUnits) {
                        transUnits.forEach((unit) => {
                            const key = unit.$.id;
                            if (!unit.target) {
                                return; // No translation available
                            }
                            let val = unit.target[0];
                            if (typeof val !== 'string') {
                                // We allow empty source values so support them for translations as well.
                                val = val._ ? val._ : '';
                            }
                            if (!key) {
                                reject(new Error(`XLF parsing error: trans-unit ${JSON.stringify(unit, undefined, 0)} defined in file ${name} is missing the ID attribute.`));
                                return;
                            }
                            messages[key] = decodeEntities(val);
                        });
                        files.push({ messages, name, language: language.toLowerCase() });
                    }
                });
                resolve(files);
            });
        });
    };
}
exports.XLF = XLF;
function sortLanguages(languages) {
    return languages.sort((a, b) => {
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
}
function stripComments(content) {
    // Copied from stripComments.js
    //
    // First group matches a double quoted string
    // Second group matches a single quoted string
    // Third group matches a multi line comment
    // Forth group matches a single line comment
    // Fifth group matches a trailing comma
    const regexp = /("[^"\\]*(?:\\.[^"\\]*)*")|('[^'\\]*(?:\\.[^'\\]*)*')|(\/\*[^\/\*]*(?:(?:\*|\/)[^\/\*]*)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))|(,\s*[}\]])/g;
    const result = content.replace(regexp, (match, _m1, _m2, m3, m4, m5) => {
        // Only one of m1, m2, m3, m4, m5 matches
        if (m3) {
            // A block comment. Replace with nothing
            return '';
        }
        else if (m4) {
            // Since m4 is a single line comment is is at least of length 2 (e.g. //)
            // If it ends in \r?\n then keep it.
            const length = m4.length;
            if (m4[length - 1] === '\n') {
                return m4[length - 2] === '\r' ? '\r\n' : '\n';
            }
            else {
                return '';
            }
        }
        else if (m5) {
            // Remove the trailing comma
            return match.substring(1);
        }
        else {
            // We match a string
            return match;
        }
    });
    return result;
}
function escapeCharacters(value) {
    const result = [];
    for (let i = 0; i < value.length; i++) {
        const ch = value.charAt(i);
        switch (ch) {
            case '\'':
                result.push('\\\'');
                break;
            case '"':
                result.push('\\"');
                break;
            case '\\':
                result.push('\\\\');
                break;
            case '\n':
                result.push('\\n');
                break;
            case '\r':
                result.push('\\r');
                break;
            case '\t':
                result.push('\\t');
                break;
            case '\b':
                result.push('\\b');
                break;
            case '\f':
                result.push('\\f');
                break;
            default:
                result.push(ch);
        }
    }
    return result.join('');
}
function processCoreBundleFormat(fileHeader, languages, json, emitter) {
    const keysSection = json.keys;
    const messageSection = json.messages;
    const bundleSection = json.bundles;
    const statistics = Object.create(null);
    const defaultMessages = Object.create(null);
    const modules = Object.keys(keysSection);
    modules.forEach((module) => {
        const keys = keysSection[module];
        const messages = messageSection[module];
        if (!messages || keys.length !== messages.length) {
            emitter.emit('error', `Message for module ${module} corrupted. Mismatch in number of keys and messages.`);
            return;
        }
        const messageMap = Object.create(null);
        defaultMessages[module] = messageMap;
        keys.map((key, i) => {
            if (typeof key === 'string') {
                messageMap[key] = messages[i];
            }
            else {
                messageMap[key.key] = messages[i];
            }
        });
    });
    const languageDirectory = path.join(__dirname, '..', '..', '..', 'vscode-loc', 'i18n');
    if (!fs.existsSync(languageDirectory)) {
        log(`No VS Code localization repository found. Looking at ${languageDirectory}`);
        log(`To bundle translations please check out the vscode-loc repository as a sibling of the vscode repository.`);
    }
    const sortedLanguages = sortLanguages(languages);
    sortedLanguages.forEach((language) => {
        if (process.env['VSCODE_BUILD_VERBOSE']) {
            log(`Generating nls bundles for: ${language.id}`);
        }
        statistics[language.id] = 0;
        const localizedModules = Object.create(null);
        const languageFolderName = language.translationId || language.id;
        const i18nFile = path.join(languageDirectory, `vscode-language-pack-${languageFolderName}`, 'translations', 'main.i18n.json');
        let allMessages;
        if (fs.existsSync(i18nFile)) {
            const content = stripComments(fs.readFileSync(i18nFile, 'utf8'));
            allMessages = JSON.parse(content);
        }
        modules.forEach((module) => {
            const order = keysSection[module];
            let moduleMessage;
            if (allMessages) {
                moduleMessage = allMessages.contents[module];
            }
            if (!moduleMessage) {
                if (process.env['VSCODE_BUILD_VERBOSE']) {
                    log(`No localized messages found for module ${module}. Using default messages.`);
                }
                moduleMessage = defaultMessages[module];
                statistics[language.id] = statistics[language.id] + Object.keys(moduleMessage).length;
            }
            const localizedMessages = [];
            order.forEach((keyInfo) => {
                let key = null;
                if (typeof keyInfo === 'string') {
                    key = keyInfo;
                }
                else {
                    key = keyInfo.key;
                }
                let message = moduleMessage[key];
                if (!message) {
                    if (process.env['VSCODE_BUILD_VERBOSE']) {
                        log(`No localized message found for key ${key} in module ${module}. Using default message.`);
                    }
                    message = defaultMessages[module][key];
                    statistics[language.id] = statistics[language.id] + 1;
                }
                localizedMessages.push(message);
            });
            localizedModules[module] = localizedMessages;
        });
        Object.keys(bundleSection).forEach((bundle) => {
            const modules = bundleSection[bundle];
            const contents = [
                fileHeader,
                `define("${bundle}.nls.${language.id}", {`
            ];
            modules.forEach((module, index) => {
                contents.push(`\t"${module}": [`);
                const messages = localizedModules[module];
                if (!messages) {
                    emitter.emit('error', `Didn't find messages for module ${module}.`);
                    return;
                }
                messages.forEach((message, index) => {
                    contents.push(`\t\t"${escapeCharacters(message)}${index < messages.length ? '",' : '"'}`);
                });
                contents.push(index < modules.length - 1 ? '\t],' : '\t]');
            });
            contents.push('});');
            emitter.queue(new File({ path: bundle + '.nls.' + language.id + '.js', contents: Buffer.from(contents.join('\n'), 'utf-8') }));
        });
    });
    Object.keys(statistics).forEach(key => {
        const value = statistics[key];
        log(`${key} has ${value} untranslated strings.`);
    });
    sortedLanguages.forEach(language => {
        const stats = statistics[language.id];
        if (Is.undef(stats)) {
            log(`\tNo translations found for language ${language.id}. Using default language instead.`);
        }
    });
}
function processNlsFiles(opts) {
    return (0, event_stream_1.through)(function (file) {
        const fileName = path.basename(file.path);
        if (fileName === 'nls.metadata.json') {
            let json = null;
            if (file.isBuffer()) {
                json = JSON.parse(file.contents.toString('utf8'));
            }
            else {
                this.emit('error', `Failed to read component file: ${file.relative}`);
                return;
            }
            if (BundledFormat.is(json)) {
                processCoreBundleFormat(opts.fileHeader, opts.languages, json, this);
            }
        }
        this.queue(file);
    });
}
exports.processNlsFiles = processNlsFiles;
const editorProject = 'vscode-editor', workbenchProject = 'vscode-workbench', extensionsProject = 'vscode-extensions', setupProject = 'vscode-setup', serverProject = 'vscode-server';
function getResource(sourceFile) {
    let resource;
    if (/^vs\/platform/.test(sourceFile)) {
        return { name: 'vs/platform', project: editorProject };
    }
    else if (/^vs\/editor\/contrib/.test(sourceFile)) {
        return { name: 'vs/editor/contrib', project: editorProject };
    }
    else if (/^vs\/editor/.test(sourceFile)) {
        return { name: 'vs/editor', project: editorProject };
    }
    else if (/^vs\/base/.test(sourceFile)) {
        return { name: 'vs/base', project: editorProject };
    }
    else if (/^vs\/code/.test(sourceFile)) {
        return { name: 'vs/code', project: workbenchProject };
    }
    else if (/^vs\/server/.test(sourceFile)) {
        return { name: 'vs/server', project: serverProject };
    }
    else if (/^vs\/workbench\/contrib/.test(sourceFile)) {
        resource = sourceFile.split('/', 4).join('/');
        return { name: resource, project: workbenchProject };
    }
    else if (/^vs\/workbench\/services/.test(sourceFile)) {
        resource = sourceFile.split('/', 4).join('/');
        return { name: resource, project: workbenchProject };
    }
    else if (/^vs\/workbench/.test(sourceFile)) {
        return { name: 'vs/workbench', project: workbenchProject };
    }
    throw new Error(`Could not identify the XLF bundle for ${sourceFile}`);
}
exports.getResource = getResource;
function createXlfFilesForCoreBundle() {
    return (0, event_stream_1.through)(function (file) {
        const basename = path.basename(file.path);
        if (basename === 'nls.metadata.json') {
            if (file.isBuffer()) {
                const xlfs = Object.create(null);
                const json = JSON.parse(file.contents.toString('utf8'));
                for (const coreModule in json.keys) {
                    const projectResource = getResource(coreModule);
                    const resource = projectResource.name;
                    const project = projectResource.project;
                    const keys = json.keys[coreModule];
                    const messages = json.messages[coreModule];
                    if (keys.length !== messages.length) {
                        this.emit('error', `There is a mismatch between keys and messages in ${file.relative} for module ${coreModule}`);
                        return;
                    }
                    else {
                        let xlf = xlfs[resource];
                        if (!xlf) {
                            xlf = new XLF(project);
                            xlfs[resource] = xlf;
                        }
                        xlf.addFile(`src/${coreModule}`, keys, messages);
                    }
                }
                for (const resource in xlfs) {
                    const xlf = xlfs[resource];
                    const filePath = `${xlf.project}/${resource.replace(/\//g, '_')}.xlf`;
                    const xlfFile = new File({
                        path: filePath,
                        contents: Buffer.from(xlf.toString(), 'utf8')
                    });
                    this.queue(xlfFile);
                }
            }
            else {
                this.emit('error', new Error(`File ${file.relative} is not using a buffer content`));
                return;
            }
        }
        else {
            this.emit('error', new Error(`File ${file.relative} is not a core meta data file.`));
            return;
        }
    });
}
exports.createXlfFilesForCoreBundle = createXlfFilesForCoreBundle;
function createL10nBundleForExtension(extensionFolderName, prefixWithBuildFolder) {
    const prefix = prefixWithBuildFolder ? '.build/' : '';
    return gulp
        .src([
        // For source code of extensions
        `${prefix}extensions/${extensionFolderName}/{src,client,server}/**/*.{ts,tsx}`,
        // // For any dependencies pulled in (think vscode-css-languageservice or @vscode/emmet-helper)
        `${prefix}extensions/${extensionFolderName}/**/node_modules/{@vscode,vscode-*}/**/*.{js,jsx}`,
        // // For any dependencies pulled in that bundle @vscode/l10n. They needed to export the bundle
        `${prefix}extensions/${extensionFolderName}/**/bundle.l10n.json`,
    ])
        .pipe((0, event_stream_1.map)(function (data, callback) {
        const file = data;
        if (!file.isBuffer()) {
            // Not a buffer so we drop it
            callback();
            return;
        }
        const extension = path.extname(file.relative);
        if (extension !== '.json') {
            const contents = file.contents.toString('utf8');
            (0, l10n_dev_1.getL10nJson)([{ contents, extension }])
                .then((json) => {
                callback(undefined, new File({
                    path: `extensions/${extensionFolderName}/bundle.l10n.json`,
                    contents: Buffer.from(JSON.stringify(json), 'utf8')
                }));
            })
                .catch((err) => {
                callback(new Error(`File ${file.relative} threw an error when parsing: ${err}`));
            });
            // signal pause?
            return false;
        }
        // for bundle.l10n.jsons
        let bundleJson;
        try {
            bundleJson = JSON.parse(file.contents.toString('utf8'));
        }
        catch (err) {
            callback(new Error(`File ${file.relative} threw an error when parsing: ${err}`));
            return;
        }
        // some validation of the bundle.l10n.json format
        for (const key in bundleJson) {
            if (typeof bundleJson[key] !== 'string' &&
                (typeof bundleJson[key].message !== 'string' || !Array.isArray(bundleJson[key].comment))) {
                callback(new Error(`Invalid bundle.l10n.json file. The value for key ${key} is not in the expected format.`));
                return;
            }
        }
        callback(undefined, file);
    }))
        .pipe(jsonMerge({
        fileName: `extensions/${extensionFolderName}/bundle.l10n.json`,
        jsonSpace: '',
        concatArrays: true
    }));
}
exports.EXTERNAL_EXTENSIONS = [
    'ms-vscode.js-debug',
    'ms-vscode.js-debug-companion',
    'ms-vscode.vscode-js-profile-table',
];
function createXlfFilesForExtensions() {
    let counter = 0;
    let folderStreamEnded = false;
    let folderStreamEndEmitted = false;
    return (0, event_stream_1.through)(function (extensionFolder) {
        const folderStream = this;
        const stat = fs.statSync(extensionFolder.path);
        if (!stat.isDirectory()) {
            return;
        }
        const extensionFolderName = path.basename(extensionFolder.path);
        if (extensionFolderName === 'node_modules') {
            return;
        }
        // Get extension id and use that as the id
        const manifest = fs.readFileSync(path.join(extensionFolder.path, 'package.json'), 'utf-8');
        const manifestJson = JSON.parse(manifest);
        const extensionId = manifestJson.publisher + '.' + manifestJson.name;
        counter++;
        let _l10nMap;
        function getL10nMap() {
            if (!_l10nMap) {
                _l10nMap = new Map();
            }
            return _l10nMap;
        }
        (0, event_stream_1.merge)(gulp.src([`.build/extensions/${extensionFolderName}/package.nls.json`, `.build/extensions/${extensionFolderName}/**/nls.metadata.json`], { allowEmpty: true }), createL10nBundleForExtension(extensionFolderName, exports.EXTERNAL_EXTENSIONS.includes(extensionId))).pipe((0, event_stream_1.through)(function (file) {
            if (file.isBuffer()) {
                const buffer = file.contents;
                const basename = path.basename(file.path);
                if (basename === 'package.nls.json') {
                    const json = JSON.parse(buffer.toString('utf8'));
                    getL10nMap().set(`extensions/${extensionId}/package`, json);
                }
                else if (basename === 'nls.metadata.json') {
                    const json = JSON.parse(buffer.toString('utf8'));
                    const relPath = path.relative(`.build/extensions/${extensionFolderName}`, path.dirname(file.path));
                    for (const file in json) {
                        const fileContent = json[file];
                        const info = Object.create(null);
                        for (let i = 0; i < fileContent.messages.length; i++) {
                            const message = fileContent.messages[i];
                            const { key, comment } = LocalizeInfo.is(fileContent.keys[i])
                                ? fileContent.keys[i]
                                : { key: fileContent.keys[i], comment: undefined };
                            info[key] = comment ? { message, comment } : message;
                        }
                        getL10nMap().set(`extensions/${extensionId}/${relPath}/${file}`, info);
                    }
                }
                else if (basename === 'bundle.l10n.json') {
                    const json = JSON.parse(buffer.toString('utf8'));
                    getL10nMap().set(`extensions/${extensionId}/bundle`, json);
                }
                else {
                    this.emit('error', new Error(`${file.path} is not a valid extension nls file`));
                    return;
                }
            }
        }, function () {
            if (_l10nMap?.size > 0) {
                const xlfFile = new File({
                    path: path.join(extensionsProject, extensionId + '.xlf'),
                    contents: Buffer.from((0, l10n_dev_1.getL10nXlf)(_l10nMap), 'utf8')
                });
                folderStream.queue(xlfFile);
            }
            this.queue(null);
            counter--;
            if (counter === 0 && folderStreamEnded && !folderStreamEndEmitted) {
                folderStreamEndEmitted = true;
                folderStream.queue(null);
            }
        }));
    }, function () {
        folderStreamEnded = true;
        if (counter === 0) {
            folderStreamEndEmitted = true;
            this.queue(null);
        }
    });
}
exports.createXlfFilesForExtensions = createXlfFilesForExtensions;
function createXlfFilesForIsl() {
    return (0, event_stream_1.through)(function (file) {
        let projectName, resourceFile;
        if (path.basename(file.path) === 'messages.en.isl') {
            projectName = setupProject;
            resourceFile = 'messages.xlf';
        }
        else {
            throw new Error(`Unknown input file ${file.path}`);
        }
        const xlf = new XLF(projectName), keys = [], messages = [];
        const model = new TextModel(file.contents.toString());
        let inMessageSection = false;
        model.lines.forEach(line => {
            if (line.length === 0) {
                return;
            }
            const firstChar = line.charAt(0);
            switch (firstChar) {
                case ';':
                    // Comment line;
                    return;
                case '[':
                    inMessageSection = '[Messages]' === line || '[CustomMessages]' === line;
                    return;
            }
            if (!inMessageSection) {
                return;
            }
            const sections = line.split('=');
            if (sections.length !== 2) {
                throw new Error(`Badly formatted message found: ${line}`);
            }
            else {
                const key = sections[0];
                const value = sections[1];
                if (key.length > 0 && value.length > 0) {
                    keys.push(key);
                    messages.push(value);
                }
            }
        });
        const originalPath = file.path.substring(file.cwd.length + 1, file.path.split('.')[0].length).replace(/\\/g, '/');
        xlf.addFile(originalPath, keys, messages);
        // Emit only upon all ISL files combined into single XLF instance
        const newFilePath = path.join(projectName, resourceFile);
        const xlfFile = new File({ path: newFilePath, contents: Buffer.from(xlf.toString(), 'utf-8') });
        this.queue(xlfFile);
    });
}
exports.createXlfFilesForIsl = createXlfFilesForIsl;
function createI18nFile(name, messages) {
    const result = Object.create(null);
    result[''] = [
        '--------------------------------------------------------------------------------------------',
        'Copyright (c) Microsoft Corporation. All rights reserved.',
        'Licensed under the MIT License. See License.txt in the project root for license information.',
        '--------------------------------------------------------------------------------------------',
        'Do not edit this file. It is machine generated.'
    ];
    for (const key of Object.keys(messages)) {
        result[key] = messages[key];
    }
    let content = JSON.stringify(result, null, '\t');
    if (process.platform === 'win32') {
        content = content.replace(/\n/g, '\r\n');
    }
    return new File({
        path: path.join(name + '.i18n.json'),
        contents: Buffer.from(content, 'utf8')
    });
}
const i18nPackVersion = '1.0.0';
function getRecordFromL10nJsonFormat(l10nJsonFormat) {
    const record = {};
    for (const key of Object.keys(l10nJsonFormat).sort()) {
        const value = l10nJsonFormat[key];
        record[key] = typeof value === 'string' ? value : value.message;
    }
    return record;
}
function prepareI18nPackFiles(resultingTranslationPaths) {
    const parsePromises = [];
    const mainPack = { version: i18nPackVersion, contents: {} };
    const extensionsPacks = {};
    const errors = [];
    return (0, event_stream_1.through)(function (xlf) {
        let project = path.basename(path.dirname(path.dirname(xlf.relative)));
        // strip `-new` since vscode-extensions-loc uses the `-new` suffix to indicate that it's from the new loc pipeline
        const resource = path.basename(path.basename(xlf.relative, '.xlf'), '-new');
        if (exports.EXTERNAL_EXTENSIONS.find(e => e === resource)) {
            project = extensionsProject;
        }
        const contents = xlf.contents.toString();
        log(`Found ${project}: ${resource}`);
        const parsePromise = (0, l10n_dev_1.getL10nFilesFromXlf)(contents);
        parsePromises.push(parsePromise);
        parsePromise.then(resolvedFiles => {
            resolvedFiles.forEach(file => {
                const path = file.name;
                const firstSlash = path.indexOf('/');
                if (project === extensionsProject) {
                    // resource will be the extension id
                    let extPack = extensionsPacks[resource];
                    if (!extPack) {
                        extPack = extensionsPacks[resource] = { version: i18nPackVersion, contents: {} };
                    }
                    // remove 'extensions/extensionId/' segment
                    const secondSlash = path.indexOf('/', firstSlash + 1);
                    extPack.contents[path.substring(secondSlash + 1)] = getRecordFromL10nJsonFormat(file.messages);
                }
                else {
                    mainPack.contents[path.substring(firstSlash + 1)] = getRecordFromL10nJsonFormat(file.messages);
                }
            });
        }).catch(reason => {
            errors.push(reason);
        });
    }, function () {
        Promise.all(parsePromises)
            .then(() => {
            if (errors.length > 0) {
                throw errors;
            }
            const translatedMainFile = createI18nFile('./main', mainPack);
            resultingTranslationPaths.push({ id: 'vscode', resourceName: 'main.i18n.json' });
            this.queue(translatedMainFile);
            for (const extensionId in extensionsPacks) {
                const translatedExtFile = createI18nFile(`extensions/${extensionId}`, extensionsPacks[extensionId]);
                this.queue(translatedExtFile);
                resultingTranslationPaths.push({ id: extensionId, resourceName: `extensions/${extensionId}.i18n.json` });
            }
            this.queue(null);
        })
            .catch((reason) => {
            this.emit('error', reason);
        });
    });
}
exports.prepareI18nPackFiles = prepareI18nPackFiles;
function prepareIslFiles(language, innoSetupConfig) {
    const parsePromises = [];
    return (0, event_stream_1.through)(function (xlf) {
        const stream = this;
        const parsePromise = XLF.parse(xlf.contents.toString());
        parsePromises.push(parsePromise);
        parsePromise.then(resolvedFiles => {
            resolvedFiles.forEach(file => {
                const translatedFile = createIslFile(file.name, file.messages, language, innoSetupConfig);
                stream.queue(translatedFile);
            });
        }).catch(reason => {
            this.emit('error', reason);
        });
    }, function () {
        Promise.all(parsePromises)
            .then(() => { this.queue(null); })
            .catch(reason => {
            this.emit('error', reason);
        });
    });
}
exports.prepareIslFiles = prepareIslFiles;
function createIslFile(name, messages, language, innoSetup) {
    const content = [];
    let originalContent;
    if (path.basename(name) === 'Default') {
        originalContent = new TextModel(fs.readFileSync(name + '.isl', 'utf8'));
    }
    else {
        originalContent = new TextModel(fs.readFileSync(name + '.en.isl', 'utf8'));
    }
    originalContent.lines.forEach(line => {
        if (line.length > 0) {
            const firstChar = line.charAt(0);
            if (firstChar === '[' || firstChar === ';') {
                content.push(line);
            }
            else {
                const sections = line.split('=');
                const key = sections[0];
                let translated = line;
                if (key) {
                    const translatedMessage = messages[key];
                    if (translatedMessage) {
                        translated = `${key}=${translatedMessage}`;
                    }
                }
                content.push(translated);
            }
        }
    });
    const basename = path.basename(name);
    const filePath = `${basename}.${language.id}.isl`;
    const encoded = iconv.encode(Buffer.from(content.join('\r\n'), 'utf8').toString(), innoSetup.codePage);
    return new File({
        path: filePath,
        contents: Buffer.from(encoded),
    });
}
function encodeEntities(value) {
    const result = [];
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        switch (ch) {
            case '<':
                result.push('&lt;');
                break;
            case '>':
                result.push('&gt;');
                break;
            case '&':
                result.push('&amp;');
                break;
            default:
                result.push(ch);
        }
    }
    return result.join('');
}
function decodeEntities(value) {
    return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaTE4bi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImkxOG4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUV6QiwrQ0FBa0U7QUFDbEUsNkNBQTZDO0FBQzdDLDhCQUE4QjtBQUM5Qix5QkFBeUI7QUFDekIsaUNBQWlDO0FBQ2pDLDZCQUE2QjtBQUM3QixzQ0FBc0M7QUFDdEMsMENBQTBDO0FBQzFDLGdEQUFnRDtBQUNoRCwrQ0FBaUg7QUFFakgsU0FBUyxHQUFHLENBQUMsT0FBWSxFQUFFLEdBQUcsSUFBVztJQUN4QyxRQUFRLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUN4RCxDQUFDO0FBWVksUUFBQSxnQkFBZ0IsR0FBZTtJQUMzQyxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFFO0lBQzVELEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUU7SUFDNUQsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7Q0FDL0IsQ0FBQztBQUVGLDREQUE0RDtBQUMvQyxRQUFBLGNBQWMsR0FBZTtJQUN6QyxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtJQUNsQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtJQUMvQixFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtDQUMvQixDQUFDO0FBa0JGLElBQU8sWUFBWSxDQUtsQjtBQUxELFdBQU8sWUFBWTtJQUNsQixTQUFnQixFQUFFLENBQUMsS0FBVTtRQUM1QixNQUFNLFNBQVMsR0FBRyxLQUFxQixDQUFDO1FBQ3hDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLElBQUksU0FBUyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RMLENBQUM7SUFIZSxlQUFFLEtBR2pCLENBQUE7QUFDRixDQUFDLEVBTE0sWUFBWSxLQUFaLFlBQVksUUFLbEI7QUFRRCxJQUFPLGFBQWEsQ0FXbkI7QUFYRCxXQUFPLGFBQWE7SUFDbkIsU0FBZ0IsRUFBRSxDQUFDLEtBQVU7UUFDNUIsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3BCLE9BQU8sS0FBSyxDQUFDO1NBQ2I7UUFFRCxNQUFNLFNBQVMsR0FBRyxLQUFzQixDQUFDO1FBQ3pDLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBRXpDLE9BQU8sTUFBTSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0SCxDQUFDO0lBVGUsZ0JBQUUsS0FTakIsQ0FBQTtBQUNGLENBQUMsRUFYTSxhQUFhLEtBQWIsYUFBYSxRQVduQjtBQWtCRCxNQUFhLElBQUk7SUFDUixNQUFNLEdBQWEsRUFBRSxDQUFDO0lBRTlCLFlBQVksU0FBaUIsQ0FBQztRQUM3QixJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDZixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7U0FDbEQ7SUFDRixDQUFDO0lBRU0sTUFBTSxDQUFDLEtBQWE7UUFDMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRU0sUUFBUTtRQUNkLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDN0IsQ0FBQztDQUNEO0FBakJELG9CQWlCQztBQUVELE1BQU0sU0FBUztJQUNOLE1BQU0sQ0FBVztJQUV6QixZQUFZLFFBQWdCO1FBQzNCLElBQUksQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsSUFBVyxLQUFLO1FBQ2YsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7Q0FDRDtBQUVELE1BQWEsR0FBRztJQUtJO0lBSlgsTUFBTSxDQUFXO0lBQ2pCLEtBQUssQ0FBeUI7SUFDL0IsZ0JBQWdCLENBQVM7SUFFaEMsWUFBbUIsT0FBZTtRQUFmLFlBQU8sR0FBUCxPQUFPLENBQVE7UUFDakMsSUFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVNLFFBQVE7UUFDZCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFcEIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDN0MsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUU7WUFDekIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsSUFBSSxvREFBb0QsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNuRyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQU8sRUFBRSxDQUFPLEVBQUUsRUFBRTtnQkFDeEQsT0FBTyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9DLENBQUMsQ0FBQyxDQUFDO1lBQ0gsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUU7Z0JBQ3pCLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO2FBQy9CO1lBQ0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1NBQ3JDO1FBQ0QsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVNLE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQStCLEVBQUUsUUFBa0I7UUFDbkYsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtZQUN0QixPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsR0FBRyxRQUFRLENBQUMsQ0FBQztZQUN0QyxPQUFPO1NBQ1A7UUFDRCxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLE1BQU0sRUFBRTtZQUNwQyxNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixJQUFJLENBQUMsTUFBTSxrQkFBa0IsUUFBUSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUM7U0FDckY7UUFDRCxJQUFJLENBQUMsZ0JBQWdCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUNyQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMxQixNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQ3ZDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ3JDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQixJQUFJLE9BQTJCLENBQUM7WUFDaEMsSUFBSSxPQUEyQixDQUFDO1lBQ2hDLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRTtnQkFDbkIsT0FBTyxHQUFHLEdBQUcsQ0FBQztnQkFDZCxPQUFPLEdBQUcsU0FBUyxDQUFDO2FBQ3BCO2lCQUFNLElBQUksWUFBWSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRTtnQkFDaEMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUM7Z0JBQ2xCLElBQUksR0FBRyxDQUFDLE9BQU8sSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7b0JBQzFDLE9BQU8sR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztpQkFDM0U7YUFDRDtZQUNELElBQUksQ0FBQyxPQUFPLElBQUksWUFBWSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRTtnQkFDMUMsU0FBUzthQUNUO1lBQ0QsWUFBWSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMxQixNQUFNLE9BQU8sR0FBVyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7U0FDL0U7SUFDRixDQUFDO0lBRU8sYUFBYSxDQUFDLElBQVksRUFBRSxJQUFVO1FBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFO1lBQ3BFLE1BQU0sSUFBSSxLQUFLLENBQUMsa0NBQWtDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSSxFQUFFLENBQUMsQ0FBQztTQUN6RjtRQUNELElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQzlCLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLEVBQUUsWUFBWSxJQUFJLHdCQUF3QixDQUFDLENBQUM7U0FDckU7UUFFRCxJQUFJLENBQUMsYUFBYSxDQUFDLG1CQUFtQixJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLGFBQWEsQ0FBQyx5QkFBeUIsSUFBSSxDQUFDLE9BQU8sV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXhFLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNqQixJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsSUFBSSxDQUFDLE9BQU8sU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1NBQ3REO1FBRUQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVPLFlBQVk7UUFDbkIsSUFBSSxDQUFDLGFBQWEsQ0FBQyx3Q0FBd0MsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUMsYUFBYSxDQUFDLHFFQUFxRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzlGLENBQUM7SUFFTyxZQUFZO1FBQ25CLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFTyxhQUFhLENBQUMsT0FBZSxFQUFFLE1BQWU7UUFDckQsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDOUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyQixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQUssR0FBRyxVQUFVLFNBQWlCO1FBQ3pDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDdEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFFbkMsTUFBTSxLQUFLLEdBQTJFLEVBQUUsQ0FBQztZQUV6RixNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxVQUFVLEdBQVEsRUFBRSxNQUFXO2dCQUM1RCxJQUFJLEdBQUcsRUFBRTtvQkFDUixNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsb0RBQW9ELEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztpQkFDN0U7Z0JBRUQsTUFBTSxTQUFTLEdBQVUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNqRCxJQUFJLENBQUMsU0FBUyxFQUFFO29CQUNmLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxnR0FBZ0csQ0FBQyxDQUFDLENBQUM7aUJBQ3BIO2dCQUVELFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTtvQkFDMUIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7b0JBQzdCLElBQUksQ0FBQyxJQUFJLEVBQUU7d0JBQ1YsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLGlJQUFpSSxDQUFDLENBQUMsQ0FBQztxQkFDcko7b0JBQ0QsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO29CQUMzQyxJQUFJLENBQUMsUUFBUSxFQUFFO3dCQUNkLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxpSEFBaUgsQ0FBQyxDQUFDLENBQUM7cUJBQ3JJO29CQUNELE1BQU0sUUFBUSxHQUEyQixFQUFFLENBQUM7b0JBRTVDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUM7b0JBQzlDLElBQUksVUFBVSxFQUFFO3dCQUNmLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRTs0QkFDaEMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7NEJBQ3RCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFO2dDQUNqQixPQUFPLENBQUMsMkJBQTJCOzZCQUNuQzs0QkFFRCxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUN6QixJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRTtnQ0FDNUIseUVBQXlFO2dDQUN6RSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDOzZCQUN6Qjs0QkFDRCxJQUFJLENBQUMsR0FBRyxFQUFFO2dDQUNULE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxvQkFBb0IsSUFBSSwrQkFBK0IsQ0FBQyxDQUFDLENBQUM7Z0NBQzlJLE9BQU87NkJBQ1A7NEJBQ0QsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDckMsQ0FBQyxDQUFDLENBQUM7d0JBQ0gsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7cUJBQ2pFO2dCQUNGLENBQUMsQ0FBQyxDQUFDO2dCQUVILE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNoQixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDOztBQXBKVSxrQkFBRztBQXVKaEIsU0FBUyxhQUFhLENBQUMsU0FBcUI7SUFDM0MsT0FBTyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBVyxFQUFFLENBQVcsRUFBVSxFQUFFO1FBQzFELE9BQU8sQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakQsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsT0FBZTtJQUNyQywrQkFBK0I7SUFDL0IsRUFBRTtJQUNGLDZDQUE2QztJQUM3Qyw4Q0FBOEM7SUFDOUMsMkNBQTJDO0lBQzNDLDRDQUE0QztJQUM1Qyx1Q0FBdUM7SUFDdkMsTUFBTSxNQUFNLEdBQUcseUlBQXlJLENBQUM7SUFDekosTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBVyxFQUFFLEdBQVcsRUFBRSxFQUFVLEVBQUUsRUFBVSxFQUFFLEVBQVUsRUFBRSxFQUFFO1FBQzlHLHlDQUF5QztRQUN6QyxJQUFJLEVBQUUsRUFBRTtZQUNQLHdDQUF3QztZQUN4QyxPQUFPLEVBQUUsQ0FBQztTQUNWO2FBQU0sSUFBSSxFQUFFLEVBQUU7WUFDZCx5RUFBeUU7WUFDekUsb0NBQW9DO1lBQ3BDLE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUM7WUFDekIsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRTtnQkFDNUIsT0FBTyxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7YUFDL0M7aUJBQU07Z0JBQ04sT0FBTyxFQUFFLENBQUM7YUFDVjtTQUNEO2FBQU0sSUFBSSxFQUFFLEVBQUU7WUFDZCw0QkFBNEI7WUFDNUIsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQzFCO2FBQU07WUFDTixvQkFBb0I7WUFDcEIsT0FBTyxLQUFLLENBQUM7U0FDYjtJQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0gsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxLQUFhO0lBQ3RDLE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQztJQUM1QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUN0QyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNCLFFBQVEsRUFBRSxFQUFFO1lBQ1gsS0FBSyxJQUFJO2dCQUNSLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3BCLE1BQU07WUFDUCxLQUFLLEdBQUc7Z0JBQ1AsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDbkIsTUFBTTtZQUNQLEtBQUssSUFBSTtnQkFDUixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNwQixNQUFNO1lBQ1AsS0FBSyxJQUFJO2dCQUNSLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ25CLE1BQU07WUFDUCxLQUFLLElBQUk7Z0JBQ1IsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDbkIsTUFBTTtZQUNQLEtBQUssSUFBSTtnQkFDUixNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNuQixNQUFNO1lBQ1AsS0FBSyxJQUFJO2dCQUNSLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ25CLE1BQU07WUFDUCxLQUFLLElBQUk7Z0JBQ1IsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDbkIsTUFBTTtZQUNQO2dCQUNDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDakI7S0FDRDtJQUNELE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN4QixDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxVQUFrQixFQUFFLFNBQXFCLEVBQUUsSUFBbUIsRUFBRSxPQUFzQjtJQUN0SCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO0lBQzlCLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDckMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUVuQyxNQUFNLFVBQVUsR0FBMkIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUUvRCxNQUFNLGVBQWUsR0FBMkMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNwRixNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3pDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtRQUMxQixNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakMsTUFBTSxRQUFRLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsTUFBTSxFQUFFO1lBQ2pELE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLHNCQUFzQixNQUFNLHNEQUFzRCxDQUFDLENBQUM7WUFDMUcsT0FBTztTQUNQO1FBQ0QsTUFBTSxVQUFVLEdBQTJCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0QsZUFBZSxDQUFDLE1BQU0sQ0FBQyxHQUFHLFVBQVUsQ0FBQztRQUNyQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ25CLElBQUksT0FBTyxHQUFHLEtBQUssUUFBUSxFQUFFO2dCQUM1QixVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzlCO2lCQUFNO2dCQUNOLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ2xDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZGLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLEVBQUU7UUFDdEMsR0FBRyxDQUFDLHdEQUF3RCxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDakYsR0FBRyxDQUFDLDBHQUEwRyxDQUFDLENBQUM7S0FDaEg7SUFDRCxNQUFNLGVBQWUsR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDakQsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFO1FBQ3BDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFO1lBQ3hDLEdBQUcsQ0FBQywrQkFBK0IsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDbEQ7UUFFRCxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1QixNQUFNLGdCQUFnQixHQUE2QixNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sa0JBQWtCLEdBQUcsUUFBUSxDQUFDLGFBQWEsSUFBSSxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQ2pFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsd0JBQXdCLGtCQUFrQixFQUFFLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDOUgsSUFBSSxXQUFtQyxDQUFDO1FBQ3hDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUM1QixNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNqRSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztTQUNsQztRQUNELE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUMxQixNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbEMsSUFBSSxhQUEyRCxDQUFDO1lBQ2hFLElBQUksV0FBVyxFQUFFO2dCQUNoQixhQUFhLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUM3QztZQUNELElBQUksQ0FBQyxhQUFhLEVBQUU7Z0JBQ25CLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFO29CQUN4QyxHQUFHLENBQUMsMENBQTBDLE1BQU0sMkJBQTJCLENBQUMsQ0FBQztpQkFDakY7Z0JBQ0QsYUFBYSxHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDeEMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsTUFBTSxDQUFDO2FBQ3RGO1lBQ0QsTUFBTSxpQkFBaUIsR0FBYSxFQUFFLENBQUM7WUFDdkMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO2dCQUN6QixJQUFJLEdBQUcsR0FBa0IsSUFBSSxDQUFDO2dCQUM5QixJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsRUFBRTtvQkFDaEMsR0FBRyxHQUFHLE9BQU8sQ0FBQztpQkFDZDtxQkFBTTtvQkFDTixHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQztpQkFDbEI7Z0JBQ0QsSUFBSSxPQUFPLEdBQVcsYUFBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUMxQyxJQUFJLENBQUMsT0FBTyxFQUFFO29CQUNiLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFO3dCQUN4QyxHQUFHLENBQUMsc0NBQXNDLEdBQUcsY0FBYyxNQUFNLDBCQUEwQixDQUFDLENBQUM7cUJBQzdGO29CQUNELE9BQU8sR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3ZDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQ3REO2dCQUNELGlCQUFpQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNqQyxDQUFDLENBQUMsQ0FBQztZQUNILGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxHQUFHLGlCQUFpQixDQUFDO1FBQzlDLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUM3QyxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEMsTUFBTSxRQUFRLEdBQWE7Z0JBQzFCLFVBQVU7Z0JBQ1YsV0FBVyxNQUFNLFFBQVEsUUFBUSxDQUFDLEVBQUUsTUFBTTthQUMxQyxDQUFDO1lBQ0YsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtnQkFDakMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLE1BQU0sTUFBTSxDQUFDLENBQUM7Z0JBQ2xDLE1BQU0sUUFBUSxHQUFHLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMxQyxJQUFJLENBQUMsUUFBUSxFQUFFO29CQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLG1DQUFtQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO29CQUNwRSxPQUFPO2lCQUNQO2dCQUNELFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUU7b0JBQ25DLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxLQUFLLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO2dCQUMzRixDQUFDLENBQUMsQ0FBQztnQkFDSCxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM1RCxDQUFDLENBQUMsQ0FBQztZQUNILFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDckIsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEdBQUcsT0FBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFLEdBQUcsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEksQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ3JDLE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5QixHQUFHLENBQUMsR0FBRyxHQUFHLFFBQVEsS0FBSyx3QkFBd0IsQ0FBQyxDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0lBQ0gsZUFBZSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUNsQyxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3RDLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNwQixHQUFHLENBQUMsd0NBQXdDLFFBQVEsQ0FBQyxFQUFFLG1DQUFtQyxDQUFDLENBQUM7U0FDNUY7SUFDRixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFnQixlQUFlLENBQUMsSUFBbUQ7SUFDbEYsT0FBTyxJQUFBLHNCQUFPLEVBQUMsVUFBK0IsSUFBVTtRQUN2RCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQyxJQUFJLFFBQVEsS0FBSyxtQkFBbUIsRUFBRTtZQUNyQyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUM7WUFDaEIsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUU7Z0JBQ3BCLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFVLElBQUksQ0FBQyxRQUFTLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7YUFDNUQ7aUJBQU07Z0JBQ04sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsa0NBQWtDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUN0RSxPQUFPO2FBQ1A7WUFDRCxJQUFJLGFBQWEsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQzNCLHVCQUF1QixDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFDckU7U0FDRDtRQUNELElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBakJELDBDQWlCQztBQUVELE1BQU0sYUFBYSxHQUFXLGVBQWUsRUFDNUMsZ0JBQWdCLEdBQVcsa0JBQWtCLEVBQzdDLGlCQUFpQixHQUFXLG1CQUFtQixFQUMvQyxZQUFZLEdBQVcsY0FBYyxFQUNyQyxhQUFhLEdBQVcsZUFBZSxDQUFDO0FBRXpDLFNBQWdCLFdBQVcsQ0FBQyxVQUFrQjtJQUM3QyxJQUFJLFFBQWdCLENBQUM7SUFFckIsSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQ3JDLE9BQU8sRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsQ0FBQztLQUN2RDtTQUFNLElBQUksc0JBQXNCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQ25ELE9BQU8sRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxDQUFDO0tBQzdEO1NBQU0sSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQzFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsQ0FBQztLQUNyRDtTQUFNLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUN4QyxPQUFPLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLENBQUM7S0FDbkQ7U0FBTSxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDeEMsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLENBQUM7S0FDdEQ7U0FBTSxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDMUMsT0FBTyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxDQUFDO0tBQ3JEO1NBQU0sSUFBSSx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDdEQsUUFBUSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5QyxPQUFPLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztLQUNyRDtTQUFNLElBQUksMEJBQTBCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQ3ZELFFBQVEsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUMsT0FBTyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLENBQUM7S0FDckQ7U0FBTSxJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUM3QyxPQUFPLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztLQUMzRDtJQUVELE1BQU0sSUFBSSxLQUFLLENBQUMseUNBQXlDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFDeEUsQ0FBQztBQTFCRCxrQ0EwQkM7QUFHRCxTQUFnQiwyQkFBMkI7SUFDMUMsT0FBTyxJQUFBLHNCQUFPLEVBQUMsVUFBK0IsSUFBVTtRQUN2RCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQyxJQUFJLFFBQVEsS0FBSyxtQkFBbUIsRUFBRTtZQUNyQyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRTtnQkFDcEIsTUFBTSxJQUFJLEdBQXdCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3RELE1BQU0sSUFBSSxHQUFrQixJQUFJLENBQUMsS0FBSyxDQUFFLElBQUksQ0FBQyxRQUFtQixDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNuRixLQUFLLE1BQU0sVUFBVSxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUU7b0JBQ25DLE1BQU0sZUFBZSxHQUFHLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFDaEQsTUFBTSxRQUFRLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQztvQkFDdEMsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQztvQkFFeEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFDbkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFDM0MsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxNQUFNLEVBQUU7d0JBQ3BDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLG9EQUFvRCxJQUFJLENBQUMsUUFBUSxlQUFlLFVBQVUsRUFBRSxDQUFDLENBQUM7d0JBQ2pILE9BQU87cUJBQ1A7eUJBQU07d0JBQ04sSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO3dCQUN6QixJQUFJLENBQUMsR0FBRyxFQUFFOzRCQUNULEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQzs0QkFDdkIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEdBQUcsQ0FBQzt5QkFDckI7d0JBQ0QsR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztxQkFDakQ7aUJBQ0Q7Z0JBQ0QsS0FBSyxNQUFNLFFBQVEsSUFBSSxJQUFJLEVBQUU7b0JBQzVCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDM0IsTUFBTSxRQUFRLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxJQUFJLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUM7b0JBQ3RFLE1BQU0sT0FBTyxHQUFHLElBQUksSUFBSSxDQUFDO3dCQUN4QixJQUFJLEVBQUUsUUFBUTt3QkFDZCxRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsTUFBTSxDQUFDO3FCQUM3QyxDQUFDLENBQUM7b0JBQ0gsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztpQkFDcEI7YUFDRDtpQkFBTTtnQkFDTixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLEtBQUssQ0FBQyxRQUFRLElBQUksQ0FBQyxRQUFRLGdDQUFnQyxDQUFDLENBQUMsQ0FBQztnQkFDckYsT0FBTzthQUNQO1NBQ0Q7YUFBTTtZQUNOLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksS0FBSyxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDO1lBQ3JGLE9BQU87U0FDUDtJQUNGLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQTVDRCxrRUE0Q0M7QUFFRCxTQUFTLDRCQUE0QixDQUFDLG1CQUEyQixFQUFFLHFCQUE4QjtJQUNoRyxNQUFNLE1BQU0sR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDdEQsT0FBTyxJQUFJO1NBQ1QsR0FBRyxDQUFDO1FBQ0osZ0NBQWdDO1FBQ2hDLEdBQUcsTUFBTSxjQUFjLG1CQUFtQixvQ0FBb0M7UUFDOUUsK0ZBQStGO1FBQy9GLEdBQUcsTUFBTSxjQUFjLG1CQUFtQixtREFBbUQ7UUFDN0YsK0ZBQStGO1FBQy9GLEdBQUcsTUFBTSxjQUFjLG1CQUFtQixzQkFBc0I7S0FDaEUsQ0FBQztTQUNELElBQUksQ0FBQyxJQUFBLGtCQUFHLEVBQUMsVUFBVSxJQUFJLEVBQUUsUUFBUTtRQUNqQyxNQUFNLElBQUksR0FBRyxJQUFZLENBQUM7UUFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUNyQiw2QkFBNkI7WUFDN0IsUUFBUSxFQUFFLENBQUM7WUFDWCxPQUFPO1NBQ1A7UUFDRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5QyxJQUFJLFNBQVMsS0FBSyxPQUFPLEVBQUU7WUFDMUIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDaEQsSUFBQSxzQkFBVyxFQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztpQkFDcEMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7Z0JBQ2QsUUFBUSxDQUFDLFNBQVMsRUFBRSxJQUFJLElBQUksQ0FBQztvQkFDNUIsSUFBSSxFQUFFLGNBQWMsbUJBQW1CLG1CQUFtQjtvQkFDMUQsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLENBQUM7aUJBQ25ELENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQyxDQUFDO2lCQUNELEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUNkLFFBQVEsQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLElBQUksQ0FBQyxRQUFRLGlDQUFpQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEYsQ0FBQyxDQUFDLENBQUM7WUFDSixnQkFBZ0I7WUFDaEIsT0FBTyxLQUFLLENBQUM7U0FDYjtRQUVELHdCQUF3QjtRQUN4QixJQUFJLFVBQVUsQ0FBQztRQUNmLElBQUk7WUFDSCxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1NBQ3hEO1FBQUMsT0FBTyxHQUFHLEVBQUU7WUFDYixRQUFRLENBQUMsSUFBSSxLQUFLLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxpQ0FBaUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pGLE9BQU87U0FDUDtRQUVELGlEQUFpRDtRQUNqRCxLQUFLLE1BQU0sR0FBRyxJQUFJLFVBQVUsRUFBRTtZQUM3QixJQUNDLE9BQU8sVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLFFBQVE7Z0JBQ25DLENBQUMsT0FBTyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQ3ZGO2dCQUNELFFBQVEsQ0FBQyxJQUFJLEtBQUssQ0FBQyxvREFBb0QsR0FBRyxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlHLE9BQU87YUFDUDtTQUNEO1FBRUQsUUFBUSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMzQixDQUFDLENBQUMsQ0FBQztTQUNGLElBQUksQ0FBQyxTQUFTLENBQUM7UUFDZixRQUFRLEVBQUUsY0FBYyxtQkFBbUIsbUJBQW1CO1FBQzlELFNBQVMsRUFBRSxFQUFFO1FBQ2IsWUFBWSxFQUFFLElBQUk7S0FDbEIsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDO0FBRVksUUFBQSxtQkFBbUIsR0FBRztJQUNsQyxvQkFBb0I7SUFDcEIsOEJBQThCO0lBQzlCLG1DQUFtQztDQUNuQyxDQUFDO0FBRUYsU0FBZ0IsMkJBQTJCO0lBQzFDLElBQUksT0FBTyxHQUFXLENBQUMsQ0FBQztJQUN4QixJQUFJLGlCQUFpQixHQUFZLEtBQUssQ0FBQztJQUN2QyxJQUFJLHNCQUFzQixHQUFZLEtBQUssQ0FBQztJQUM1QyxPQUFPLElBQUEsc0JBQU8sRUFBQyxVQUErQixlQUFxQjtRQUNsRSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDMUIsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRTtZQUN4QixPQUFPO1NBQ1A7UUFDRCxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hFLElBQUksbUJBQW1CLEtBQUssY0FBYyxFQUFFO1lBQzNDLE9BQU87U0FDUDtRQUNELDBDQUEwQztRQUMxQyxNQUFNLFFBQVEsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMzRixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFDLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxTQUFTLEdBQUcsR0FBRyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7UUFFckUsT0FBTyxFQUFFLENBQUM7UUFDVixJQUFJLFFBQXFDLENBQUM7UUFDMUMsU0FBUyxVQUFVO1lBQ2xCLElBQUksQ0FBQyxRQUFRLEVBQUU7Z0JBQ2QsUUFBUSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7YUFDckI7WUFDRCxPQUFPLFFBQVEsQ0FBQztRQUNqQixDQUFDO1FBQ0QsSUFBQSxvQkFBSyxFQUNKLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxxQkFBcUIsbUJBQW1CLG1CQUFtQixFQUFFLHFCQUFxQixtQkFBbUIsdUJBQXVCLENBQUMsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUM5Siw0QkFBNEIsQ0FBQyxtQkFBbUIsRUFBRSwyQkFBbUIsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FDNUYsQ0FBQyxJQUFJLENBQUMsSUFBQSxzQkFBTyxFQUFDLFVBQVUsSUFBVTtZQUNsQyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRTtnQkFDcEIsTUFBTSxNQUFNLEdBQVcsSUFBSSxDQUFDLFFBQWtCLENBQUM7Z0JBQy9DLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMxQyxJQUFJLFFBQVEsS0FBSyxrQkFBa0IsRUFBRTtvQkFDcEMsTUFBTSxJQUFJLEdBQW1CLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUNqRSxVQUFVLEVBQUUsQ0FBQyxHQUFHLENBQUMsY0FBYyxXQUFXLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztpQkFDNUQ7cUJBQU0sSUFBSSxRQUFRLEtBQUssbUJBQW1CLEVBQUU7b0JBQzVDLE1BQU0sSUFBSSxHQUEyQixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDekUsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsbUJBQW1CLEVBQUUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNuRyxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksRUFBRTt3QkFDeEIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUMvQixNQUFNLElBQUksR0FBbUIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDakQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFOzRCQUNyRCxNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUN4QyxNQUFNLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxHQUFHLFlBQVksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQ0FDNUQsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFpQjtnQ0FDckMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFXLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxDQUFDOzRCQUU5RCxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO3lCQUNyRDt3QkFDRCxVQUFVLEVBQUUsQ0FBQyxHQUFHLENBQUMsY0FBYyxXQUFXLElBQUksT0FBTyxJQUFJLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO3FCQUN2RTtpQkFDRDtxQkFBTSxJQUFJLFFBQVEsS0FBSyxrQkFBa0IsRUFBRTtvQkFDM0MsTUFBTSxJQUFJLEdBQW1CLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUNqRSxVQUFVLEVBQUUsQ0FBQyxHQUFHLENBQUMsY0FBYyxXQUFXLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztpQkFDM0Q7cUJBQU07b0JBQ04sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxvQ0FBb0MsQ0FBQyxDQUFDLENBQUM7b0JBQ2hGLE9BQU87aUJBQ1A7YUFDRDtRQUNGLENBQUMsRUFBRTtZQUNGLElBQUksUUFBUSxFQUFFLElBQUksR0FBRyxDQUFDLEVBQUU7Z0JBQ3ZCLE1BQU0sT0FBTyxHQUFHLElBQUksSUFBSSxDQUFDO29CQUN4QixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLEdBQUcsTUFBTSxDQUFDO29CQUN4RCxRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFBLHFCQUFVLEVBQUMsUUFBUSxDQUFDLEVBQUUsTUFBTSxDQUFDO2lCQUNuRCxDQUFDLENBQUM7Z0JBQ0gsWUFBWSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUM1QjtZQUNELElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakIsT0FBTyxFQUFFLENBQUM7WUFDVixJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksaUJBQWlCLElBQUksQ0FBQyxzQkFBc0IsRUFBRTtnQkFDbEUsc0JBQXNCLEdBQUcsSUFBSSxDQUFDO2dCQUM5QixZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ3pCO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsRUFBRTtRQUNGLGlCQUFpQixHQUFHLElBQUksQ0FBQztRQUN6QixJQUFJLE9BQU8sS0FBSyxDQUFDLEVBQUU7WUFDbEIsc0JBQXNCLEdBQUcsSUFBSSxDQUFDO1lBQzlCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDakI7SUFDRixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFuRkQsa0VBbUZDO0FBRUQsU0FBZ0Isb0JBQW9CO0lBQ25DLE9BQU8sSUFBQSxzQkFBTyxFQUFDLFVBQStCLElBQVU7UUFDdkQsSUFBSSxXQUFtQixFQUN0QixZQUFvQixDQUFDO1FBQ3RCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssaUJBQWlCLEVBQUU7WUFDbkQsV0FBVyxHQUFHLFlBQVksQ0FBQztZQUMzQixZQUFZLEdBQUcsY0FBYyxDQUFDO1NBQzlCO2FBQU07WUFDTixNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztTQUNuRDtRQUVELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUMvQixJQUFJLEdBQWEsRUFBRSxFQUNuQixRQUFRLEdBQWEsRUFBRSxDQUFDO1FBRXpCLE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUN0RCxJQUFJLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUM3QixLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUMxQixJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO2dCQUN0QixPQUFPO2FBQ1A7WUFDRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLFFBQVEsU0FBUyxFQUFFO2dCQUNsQixLQUFLLEdBQUc7b0JBQ1AsZ0JBQWdCO29CQUNoQixPQUFPO2dCQUNSLEtBQUssR0FBRztvQkFDUCxnQkFBZ0IsR0FBRyxZQUFZLEtBQUssSUFBSSxJQUFJLGtCQUFrQixLQUFLLElBQUksQ0FBQztvQkFDeEUsT0FBTzthQUNSO1lBQ0QsSUFBSSxDQUFDLGdCQUFnQixFQUFFO2dCQUN0QixPQUFPO2FBQ1A7WUFDRCxNQUFNLFFBQVEsR0FBYSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzNDLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7Z0JBQzFCLE1BQU0sSUFBSSxLQUFLLENBQUMsa0NBQWtDLElBQUksRUFBRSxDQUFDLENBQUM7YUFDMUQ7aUJBQU07Z0JBQ04sTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN4QixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7b0JBQ3ZDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ2YsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztpQkFDckI7YUFDRDtRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEgsR0FBRyxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTFDLGlFQUFpRTtRQUNqRSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN6RCxNQUFNLE9BQU8sR0FBRyxJQUFJLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3JCLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQXRERCxvREFzREM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxJQUFZLEVBQUUsUUFBYTtJQUNsRCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ25DLE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRztRQUNaLDhGQUE4RjtRQUM5RiwyREFBMkQ7UUFDM0QsOEZBQThGO1FBQzlGLDhGQUE4RjtRQUM5RixpREFBaUQ7S0FDakQsQ0FBQztJQUNGLEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUN4QyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0tBQzVCO0lBRUQsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2pELElBQUksT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLEVBQUU7UUFDakMsT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0tBQ3pDO0lBQ0QsT0FBTyxJQUFJLElBQUksQ0FBQztRQUNmLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxZQUFZLENBQUM7UUFDcEMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQztLQUN0QyxDQUFDLENBQUM7QUFDSixDQUFDO0FBU0QsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDO0FBT2hDLFNBQVMsMkJBQTJCLENBQUMsY0FBOEI7SUFDbEUsTUFBTSxNQUFNLEdBQTJCLEVBQUUsQ0FBQztJQUMxQyxLQUFLLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDckQsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQztLQUNoRTtJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQWdCLG9CQUFvQixDQUFDLHlCQUE0QztJQUNoRixNQUFNLGFBQWEsR0FBaUMsRUFBRSxDQUFDO0lBQ3ZELE1BQU0sUUFBUSxHQUFhLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDdEUsTUFBTSxlQUFlLEdBQTZCLEVBQUUsQ0FBQztJQUNyRCxNQUFNLE1BQU0sR0FBVSxFQUFFLENBQUM7SUFDekIsT0FBTyxJQUFBLHNCQUFPLEVBQUMsVUFBK0IsR0FBUztRQUN0RCxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLGtIQUFrSDtRQUNsSCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1RSxJQUFJLDJCQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxRQUFRLENBQUMsRUFBRTtZQUNsRCxPQUFPLEdBQUcsaUJBQWlCLENBQUM7U0FDNUI7UUFDRCxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3pDLEdBQUcsQ0FBQyxTQUFTLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sWUFBWSxHQUFHLElBQUEsOEJBQW1CLEVBQUMsUUFBUSxDQUFDLENBQUM7UUFDbkQsYUFBYSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNqQyxZQUFZLENBQUMsSUFBSSxDQUNoQixhQUFhLENBQUMsRUFBRTtZQUNmLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQzVCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7Z0JBQ3ZCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBRXJDLElBQUksT0FBTyxLQUFLLGlCQUFpQixFQUFFO29CQUNsQyxvQ0FBb0M7b0JBQ3BDLElBQUksT0FBTyxHQUFHLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDeEMsSUFBSSxDQUFDLE9BQU8sRUFBRTt3QkFDYixPQUFPLEdBQUcsZUFBZSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUM7cUJBQ2pGO29CQUNELDJDQUEyQztvQkFDM0MsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUN0RCxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsMkJBQTJCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2lCQUMvRjtxQkFBTTtvQkFDTixRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsMkJBQTJCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2lCQUMvRjtZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUNELENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLEVBQUU7UUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQzthQUN4QixJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ1YsSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtnQkFDdEIsTUFBTSxNQUFNLENBQUM7YUFDYjtZQUNELE1BQU0sa0JBQWtCLEdBQUcsY0FBYyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUM5RCx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7WUFFakYsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQy9CLEtBQUssTUFBTSxXQUFXLElBQUksZUFBZSxFQUFFO2dCQUMxQyxNQUFNLGlCQUFpQixHQUFHLGNBQWMsQ0FBQyxjQUFjLFdBQVcsRUFBRSxFQUFFLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO2dCQUNwRyxJQUFJLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBRTlCLHlCQUF5QixDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLGNBQWMsV0FBVyxZQUFZLEVBQUUsQ0FBQyxDQUFDO2FBQ3pHO1lBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsQixDQUFDLENBQUM7YUFDRCxLQUFLLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUNqQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQTdERCxvREE2REM7QUFFRCxTQUFnQixlQUFlLENBQUMsUUFBa0IsRUFBRSxlQUEwQjtJQUM3RSxNQUFNLGFBQWEsR0FBaUMsRUFBRSxDQUFDO0lBRXZELE9BQU8sSUFBQSxzQkFBTyxFQUFDLFVBQStCLEdBQVM7UUFDdEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3hELGFBQWEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDakMsWUFBWSxDQUFDLElBQUksQ0FDaEIsYUFBYSxDQUFDLEVBQUU7WUFDZixhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUM1QixNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxlQUFlLENBQUMsQ0FBQztnQkFDMUYsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUM5QixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FDRCxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNoQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsRUFBRTtRQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDO2FBQ3hCLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ2pDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNmLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzVCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBeEJELDBDQXdCQztBQUVELFNBQVMsYUFBYSxDQUFDLElBQVksRUFBRSxRQUF3QixFQUFFLFFBQWtCLEVBQUUsU0FBb0I7SUFDdEcsTUFBTSxPQUFPLEdBQWEsRUFBRSxDQUFDO0lBQzdCLElBQUksZUFBMEIsQ0FBQztJQUMvQixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssU0FBUyxFQUFFO1FBQ3RDLGVBQWUsR0FBRyxJQUFJLFNBQVMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksR0FBRyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztLQUN4RTtTQUFNO1FBQ04sZUFBZSxHQUFHLElBQUksU0FBUyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxHQUFHLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO0tBQzNFO0lBQ0QsZUFBZSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDcEMsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUNwQixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLElBQUksU0FBUyxLQUFLLEdBQUcsSUFBSSxTQUFTLEtBQUssR0FBRyxFQUFFO2dCQUMzQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ25CO2lCQUFNO2dCQUNOLE1BQU0sUUFBUSxHQUFhLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzNDLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDeEIsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDO2dCQUN0QixJQUFJLEdBQUcsRUFBRTtvQkFDUixNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDeEMsSUFBSSxpQkFBaUIsRUFBRTt3QkFDdEIsVUFBVSxHQUFHLEdBQUcsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7cUJBQzNDO2lCQUNEO2dCQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7YUFDekI7U0FDRDtJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNyQyxNQUFNLFFBQVEsR0FBRyxHQUFHLFFBQVEsSUFBSSxRQUFRLENBQUMsRUFBRSxNQUFNLENBQUM7SUFDbEQsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXZHLE9BQU8sSUFBSSxJQUFJLENBQUM7UUFDZixJQUFJLEVBQUUsUUFBUTtRQUNkLFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQztLQUM5QixDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsS0FBYTtJQUNwQyxNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUM7SUFDNUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDdEMsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BCLFFBQVEsRUFBRSxFQUFFO1lBQ1gsS0FBSyxHQUFHO2dCQUNQLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3BCLE1BQU07WUFDUCxLQUFLLEdBQUc7Z0JBQ1AsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEIsTUFBTTtZQUNQLEtBQUssR0FBRztnQkFDUCxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNyQixNQUFNO1lBQ1A7Z0JBQ0MsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUNqQjtLQUNEO0lBQ0QsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3hCLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxLQUFhO0lBQ3BDLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQ2pGLENBQUMifQ==