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
        // For source code of extensions
        `extensions/${extensionFolderName}/src/**/*.{ts,tsx}`,
        // For any dependencies pulled in (think vscode-css-languageservice or @vscode/emmet-helper)
        `extensions/${extensionFolderName}/node_modules/**/*.{js,jsx}`,
        // For any dependencies pulled in that bundle @vscode/l10n. They needed to export the bundle
        `extensions/${extensionFolderName}/node_modules/**/bundle.l10n.json`,
    ]).pipe((0, event_stream_1.writeArray)((err, files) => {
        if (err) {
            result.emit('error', err);
            return;
        }
        const buffers = files.filter(file => file.isBuffer());
        const json = (0, l10n_dev_1.getL10nJson)(buffers
            .filter(file => path.extname(file.path) !== '.json')
            .map(file => ({
            contents: file.contents.toString('utf8'),
            extension: path.extname(file.path)
        })));
        buffers
            .filter(file => path.extname(file.path) === '.json')
            .forEach(file => {
            const bundleJson = JSON.parse(file.contents.toString('utf8'));
            for (const key in bundleJson) {
                if (
                // some validation of the bundle.l10n.json format
                typeof bundleJson[key] !== 'string' &&
                    (typeof bundleJson[key].message !== 'string' || !Array.isArray(bundleJson[key].comment))) {
                    console.error(`Invalid bundle.l10n.json file. The value for key ${key} is not in the expected format. Skipping key...`);
                    continue;
                }
                json[key] = bundleJson[key];
            }
        });
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