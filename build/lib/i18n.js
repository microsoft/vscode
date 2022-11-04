"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareIslFiles = exports.prepareI18nPackFiles = exports.createXlfFilesForIsl = exports.createXlfFilesForExtensions = exports.createXlfFilesForCoreBundle = exports.getResource = exports.processNlsFiles = exports.XLF = exports.Line = exports.extraLanguages = exports.defaultLanguages = void 0;
const path = require("path");
const fs = require("fs");
const event_stream_1 = require("event-stream");
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
function createL10nBundleForExtension(extensionFolderName) {
    const result = (0, event_stream_1.through)();
    gulp.src([
        `extensions/${extensionFolderName}/src/**/*.ts`,
    ]).pipe((0, event_stream_1.writeArray)((err, files) => {
        if (err) {
            result.emit('error', err);
            return;
        }
        const json = (0, l10n_dev_1.getL10nJson)(files.map(file => {
            return file.contents.toString('utf8');
        }));
        if (Object.keys(json).length > 0) {
            result.emit('data', new File({
                path: `extensions/${extensionFolderName}/bundle.l10n.json`,
                contents: Buffer.from(JSON.stringify(json), 'utf8')
            }));
        }
        result.emit('end');
    }));
    return result;
}
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
        (0, event_stream_1.merge)(gulp.src([`.build/extensions/${extensionFolderName}/package.nls.json`, `.build/extensions/${extensionFolderName}/**/nls.metadata.json`], { allowEmpty: true }), createL10nBundleForExtension(extensionFolderName)).pipe((0, event_stream_1.through)(function (file) {
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
        const project = path.basename(path.dirname(path.dirname(xlf.relative)));
        const resource = path.basename(xlf.relative, '.xlf');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaTE4bi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImkxOG4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUV6QiwrQ0FBeUU7QUFDekUsOEJBQThCO0FBQzlCLHlCQUF5QjtBQUN6QixpQ0FBaUM7QUFDakMsNkJBQTZCO0FBQzdCLHNDQUFzQztBQUN0QywwQ0FBMEM7QUFDMUMsZ0RBQWdEO0FBQ2hELCtDQUFpSDtBQUVqSCxTQUFTLEdBQUcsQ0FBQyxPQUFZLEVBQUUsR0FBRyxJQUFXO0lBQ3hDLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQ3hELENBQUM7QUFZWSxRQUFBLGdCQUFnQixHQUFlO0lBQzNDLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUU7SUFDNUQsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLFNBQVMsRUFBRTtJQUM1RCxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtJQUMvQixFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtJQUMvQixFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtJQUMvQixFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtJQUMvQixFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtJQUMvQixFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtJQUMvQixFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUss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