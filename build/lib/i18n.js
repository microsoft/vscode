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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaTE4bi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImkxOG4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUV6QiwrQ0FBa0U7QUFDbEUsNkNBQTZDO0FBQzdDLDhCQUE4QjtBQUM5Qix5QkFBeUI7QUFDekIsaUNBQWlDO0FBQ2pDLDZCQUE2QjtBQUM3QixzQ0FBc0M7QUFDdEMsMENBQTBDO0FBQzFDLGdEQUFnRDtBQUNoRCwrQ0FBaUg7QUFFakgsU0FBUyxHQUFHLENBQUMsT0FBWSxFQUFFLEdBQUcsSUFBVztJQUN4QyxRQUFRLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUN4RCxDQUFDO0FBWVksUUFBQSxnQkFBZ0IsR0FBZTtJQUMzQyxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFFO0lBQzVELEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUU7SUFDNUQsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7SUFDL0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVB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