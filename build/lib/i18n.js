"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var fs = require("fs");
var event_stream_1 = require("event-stream");
var File = require("vinyl");
var Is = require("is");
var xml2js = require("xml2js");
var glob = require("glob");
var https = require("https");
var gulp = require("gulp");
var util = require('gulp-util');
var iconv = require('iconv-lite');
var NUMBER_OF_CONCURRENT_DOWNLOADS = 4;
function log(message) {
    var rest = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        rest[_i - 1] = arguments[_i];
    }
    util.log.apply(util, [util.colors.green('[i18n]'), message].concat(rest));
}
exports.defaultLanguages = [
    { id: 'zh-tw', folderName: 'cht', transifexId: 'zh-hant' },
    { id: 'zh-cn', folderName: 'chs', transifexId: 'zh-hans' },
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
// non built-in extensions also that are transifex and need to be part of the language packs
var externalExtensionsWithTranslations = {
    'vscode-chrome-debug': 'msjsdiag.debugger-for-chrome',
    'vscode-node-debug': 'ms-vscode.node-debug',
    'vscode-node-debug2': 'ms-vscode.node-debug2'
};
var LocalizeInfo;
(function (LocalizeInfo) {
    function is(value) {
        var candidate = value;
        return Is.defined(candidate) && Is.string(candidate.key) && (Is.undef(candidate.comment) || (Is.array(candidate.comment) && candidate.comment.every(function (element) { return Is.string(element); })));
    }
    LocalizeInfo.is = is;
})(LocalizeInfo || (LocalizeInfo = {}));
var BundledFormat;
(function (BundledFormat) {
    function is(value) {
        if (Is.undef(value)) {
            return false;
        }
        var candidate = value;
        var length = Object.keys(value).length;
        return length === 3 && Is.defined(candidate.keys) && Is.defined(candidate.messages) && Is.defined(candidate.bundles);
    }
    BundledFormat.is = is;
})(BundledFormat || (BundledFormat = {}));
var PackageJsonFormat;
(function (PackageJsonFormat) {
    function is(value) {
        if (Is.undef(value) || !Is.object(value)) {
            return false;
        }
        return Object.keys(value).every(function (key) {
            var element = value[key];
            return Is.string(element) || (Is.object(element) && Is.defined(element.message) && Is.defined(element.comment));
        });
    }
    PackageJsonFormat.is = is;
})(PackageJsonFormat || (PackageJsonFormat = {}));
var ModuleJsonFormat;
(function (ModuleJsonFormat) {
    function is(value) {
        var candidate = value;
        return Is.defined(candidate)
            && Is.array(candidate.messages) && candidate.messages.every(function (message) { return Is.string(message); })
            && Is.array(candidate.keys) && candidate.keys.every(function (key) { return Is.string(key) || LocalizeInfo.is(key); });
    }
    ModuleJsonFormat.is = is;
})(ModuleJsonFormat || (ModuleJsonFormat = {}));
var Line = /** @class */ (function () {
    function Line(indent) {
        if (indent === void 0) { indent = 0; }
        this.indent = indent;
        this.buffer = [];
        if (indent > 0) {
            this.buffer.push(new Array(indent + 1).join(' '));
        }
    }
    Line.prototype.append = function (value) {
        this.buffer.push(value);
        return this;
    };
    Line.prototype.toString = function () {
        return this.buffer.join('');
    };
    return Line;
}());
exports.Line = Line;
var TextModel = /** @class */ (function () {
    function TextModel(contents) {
        this._lines = contents.split(/\r\n|\r|\n/);
    }
    Object.defineProperty(TextModel.prototype, "lines", {
        get: function () {
            return this._lines;
        },
        enumerable: true,
        configurable: true
    });
    return TextModel;
}());
var XLF = /** @class */ (function () {
    function XLF(project) {
        this.project = project;
        this.buffer = [];
        this.files = Object.create(null);
        this.numberOfMessages = 0;
    }
    XLF.prototype.toString = function () {
        this.appendHeader();
        for (var file in this.files) {
            this.appendNewLine("<file original=\"" + file + "\" source-language=\"en\" datatype=\"plaintext\"><body>", 2);
            for (var _i = 0, _a = this.files[file]; _i < _a.length; _i++) {
                var item = _a[_i];
                this.addStringItem(item);
            }
            this.appendNewLine('</body></file>', 2);
        }
        this.appendFooter();
        return this.buffer.join('\r\n');
    };
    XLF.prototype.addFile = function (original, keys, messages) {
        if (keys.length === 0) {
            console.log('No keys in ' + original);
            return;
        }
        if (keys.length !== messages.length) {
            throw new Error("Unmatching keys(" + keys.length + ") and messages(" + messages.length + ").");
        }
        this.numberOfMessages += keys.length;
        this.files[original] = [];
        var existingKeys = new Set();
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var realKey = void 0;
            var comment = void 0;
            if (Is.string(key)) {
                realKey = key;
                comment = undefined;
            }
            else if (LocalizeInfo.is(key)) {
                realKey = key.key;
                if (key.comment && key.comment.length > 0) {
                    comment = key.comment.map(function (comment) { return encodeEntities(comment); }).join('\r\n');
                }
            }
            if (!realKey || existingKeys.has(realKey)) {
                continue;
            }
            existingKeys.add(realKey);
            var message = encodeEntities(messages[i]);
            this.files[original].push({ id: realKey, message: message, comment: comment });
        }
    };
    XLF.prototype.addStringItem = function (item) {
        if (!item.id || !item.message) {
            throw new Error("No item ID or value specified: " + JSON.stringify(item));
        }
        this.appendNewLine("<trans-unit id=\"" + item.id + "\">", 4);
        this.appendNewLine("<source xml:lang=\"en\">" + item.message + "</source>", 6);
        if (item.comment) {
            this.appendNewLine("<note>" + item.comment + "</note>", 6);
        }
        this.appendNewLine('</trans-unit>', 4);
    };
    XLF.prototype.appendHeader = function () {
        this.appendNewLine('<?xml version="1.0" encoding="utf-8"?>', 0);
        this.appendNewLine('<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">', 0);
    };
    XLF.prototype.appendFooter = function () {
        this.appendNewLine('</xliff>', 0);
    };
    XLF.prototype.appendNewLine = function (content, indent) {
        var line = new Line(indent);
        line.append(content);
        this.buffer.push(line.toString());
    };
    XLF.parsePseudo = function (xlfString) {
        return new Promise(function (resolve, reject) {
            var parser = new xml2js.Parser();
            var files = [];
            parser.parseString(xlfString, function (err, result) {
                var fileNodes = result['xliff']['file'];
                fileNodes.forEach(function (file) {
                    var originalFilePath = file.$.original;
                    var messages = {};
                    var transUnits = file.body[0]['trans-unit'];
                    if (transUnits) {
                        transUnits.forEach(function (unit) {
                            var key = unit.$.id;
                            var val = pseudify(unit.source[0]['_'].toString());
                            if (key && val) {
                                messages[key] = decodeEntities(val);
                            }
                        });
                        files.push({ messages: messages, originalFilePath: originalFilePath, language: 'ps' });
                    }
                });
                resolve(files);
            });
        });
    };
    XLF.parse = function (xlfString) {
        return new Promise(function (resolve, reject) {
            var parser = new xml2js.Parser();
            var files = [];
            parser.parseString(xlfString, function (err, result) {
                if (err) {
                    reject(new Error("XLF parsing error: Failed to parse XLIFF string. " + err));
                }
                var fileNodes = result['xliff']['file'];
                if (!fileNodes) {
                    reject(new Error("XLF parsing error: XLIFF file does not contain \"xliff\" or \"file\" node(s) required for parsing."));
                }
                fileNodes.forEach(function (file) {
                    var originalFilePath = file.$.original;
                    if (!originalFilePath) {
                        reject(new Error("XLF parsing error: XLIFF file node does not contain original attribute to determine the original location of the resource file."));
                    }
                    var language = file.$['target-language'];
                    if (!language) {
                        reject(new Error("XLF parsing error: XLIFF file node does not contain target-language attribute to determine translated language."));
                    }
                    var messages = {};
                    var transUnits = file.body[0]['trans-unit'];
                    if (transUnits) {
                        transUnits.forEach(function (unit) {
                            var key = unit.$.id;
                            if (!unit.target) {
                                return; // No translation available
                            }
                            var val = unit.target.toString();
                            if (key && val) {
                                messages[key] = decodeEntities(val);
                            }
                            else {
                                reject(new Error("XLF parsing error: XLIFF file does not contain full localization data. ID or target translation for one of the trans-unit nodes is not present."));
                            }
                        });
                        files.push({ messages: messages, originalFilePath: originalFilePath, language: language.toLowerCase() });
                    }
                });
                resolve(files);
            });
        });
    };
    return XLF;
}());
exports.XLF = XLF;
var Limiter = /** @class */ (function () {
    function Limiter(maxDegreeOfParalellism) {
        this.maxDegreeOfParalellism = maxDegreeOfParalellism;
        this.outstandingPromises = [];
        this.runningPromises = 0;
    }
    Limiter.prototype.queue = function (factory) {
        var _this = this;
        return new Promise(function (c, e) {
            _this.outstandingPromises.push({ factory: factory, c: c, e: e });
            _this.consume();
        });
    };
    Limiter.prototype.consume = function () {
        var _this = this;
        while (this.outstandingPromises.length && this.runningPromises < this.maxDegreeOfParalellism) {
            var iLimitedTask = this.outstandingPromises.shift();
            this.runningPromises++;
            var promise = iLimitedTask.factory();
            promise.then(iLimitedTask.c).catch(iLimitedTask.e);
            promise.then(function () { return _this.consumed(); }).catch(function () { return _this.consumed(); });
        }
    };
    Limiter.prototype.consumed = function () {
        this.runningPromises--;
        this.consume();
    };
    return Limiter;
}());
exports.Limiter = Limiter;
function sortLanguages(languages) {
    return languages.sort(function (a, b) {
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
}
function stripComments(content) {
    /**
    * First capturing group matches double quoted string
    * Second matches single quotes string
    * Third matches block comments
    * Fourth matches line comments
    */
    var regexp = /("(?:[^\\\"]*(?:\\.)?)*")|('(?:[^\\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;
    var result = content.replace(regexp, function (match, m1, m2, m3, m4) {
        // Only one of m1, m2, m3, m4 matches
        if (m3) {
            // A block comment. Replace with nothing
            return '';
        }
        else if (m4) {
            // A line comment. If it ends in \r?\n then keep it.
            var length_1 = m4.length;
            if (length_1 > 2 && m4[length_1 - 1] === '\n') {
                return m4[length_1 - 2] === '\r' ? '\r\n' : '\n';
            }
            else {
                return '';
            }
        }
        else {
            // We match a string
            return match;
        }
    });
    return result;
}
function escapeCharacters(value) {
    var result = [];
    for (var i = 0; i < value.length; i++) {
        var ch = value.charAt(i);
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
    var keysSection = json.keys;
    var messageSection = json.messages;
    var bundleSection = json.bundles;
    var statistics = Object.create(null);
    var total = 0;
    var defaultMessages = Object.create(null);
    var modules = Object.keys(keysSection);
    modules.forEach(function (module) {
        var keys = keysSection[module];
        var messages = messageSection[module];
        if (!messages || keys.length !== messages.length) {
            emitter.emit('error', "Message for module " + module + " corrupted. Mismatch in number of keys and messages.");
            return;
        }
        var messageMap = Object.create(null);
        defaultMessages[module] = messageMap;
        keys.map(function (key, i) {
            total++;
            if (typeof key === 'string') {
                messageMap[key] = messages[i];
            }
            else {
                messageMap[key.key] = messages[i];
            }
        });
    });
    var languageDirectory = path.join(__dirname, '..', '..', 'i18n');
    var sortedLanguages = sortLanguages(languages);
    sortedLanguages.forEach(function (language) {
        if (process.env['VSCODE_BUILD_VERBOSE']) {
            log("Generating nls bundles for: " + language.id);
        }
        statistics[language.id] = 0;
        var localizedModules = Object.create(null);
        var languageFolderName = language.folderName || language.id;
        var cwd = path.join(languageDirectory, languageFolderName, 'src');
        modules.forEach(function (module) {
            var order = keysSection[module];
            var i18nFile = path.join(cwd, module) + '.i18n.json';
            var messages = null;
            if (fs.existsSync(i18nFile)) {
                var content = stripComments(fs.readFileSync(i18nFile, 'utf8'));
                messages = JSON.parse(content);
            }
            else {
                if (process.env['VSCODE_BUILD_VERBOSE']) {
                    log("No localized messages found for module " + module + ". Using default messages.");
                }
                messages = defaultMessages[module];
                statistics[language.id] = statistics[language.id] + Object.keys(messages).length;
            }
            var localizedMessages = [];
            order.forEach(function (keyInfo) {
                var key = null;
                if (typeof keyInfo === 'string') {
                    key = keyInfo;
                }
                else {
                    key = keyInfo.key;
                }
                var message = messages[key];
                if (!message) {
                    if (process.env['VSCODE_BUILD_VERBOSE']) {
                        log("No localized message found for key " + key + " in module " + module + ". Using default message.");
                    }
                    message = defaultMessages[module][key];
                    statistics[language.id] = statistics[language.id] + 1;
                }
                localizedMessages.push(message);
            });
            localizedModules[module] = localizedMessages;
        });
        Object.keys(bundleSection).forEach(function (bundle) {
            var modules = bundleSection[bundle];
            var contents = [
                fileHeader,
                "define(\"" + bundle + ".nls." + language.id + "\", {"
            ];
            modules.forEach(function (module, index) {
                contents.push("\t\"" + module + "\": [");
                var messages = localizedModules[module];
                if (!messages) {
                    emitter.emit('error', "Didn't find messages for module " + module + ".");
                    return;
                }
                messages.forEach(function (message, index) {
                    contents.push("\t\t\"" + escapeCharacters(message) + (index < messages.length ? '",' : '"'));
                });
                contents.push(index < modules.length - 1 ? '\t],' : '\t]');
            });
            contents.push('});');
            emitter.queue(new File({ path: bundle + '.nls.' + language.id + '.js', contents: Buffer.from(contents.join('\n'), 'utf-8') }));
        });
    });
    Object.keys(statistics).forEach(function (key) {
        var value = statistics[key];
        log(key + " has " + value + " untranslated strings.");
    });
    sortedLanguages.forEach(function (language) {
        var stats = statistics[language.id];
        if (Is.undef(stats)) {
            log("\tNo translations found for language " + language.id + ". Using default language instead.");
        }
    });
}
function processNlsFiles(opts) {
    return event_stream_1.through(function (file) {
        var fileName = path.basename(file.path);
        if (fileName === 'nls.metadata.json') {
            var json = null;
            if (file.isBuffer()) {
                json = JSON.parse(file.contents.toString('utf8'));
            }
            else {
                this.emit('error', "Failed to read component file: " + file.relative);
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
var editorProject = 'vscode-editor', workbenchProject = 'vscode-workbench', extensionsProject = 'vscode-extensions', setupProject = 'vscode-setup';
function getResource(sourceFile) {
    var resource;
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
    else if (/^vs\/workbench\/parts/.test(sourceFile)) {
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
    throw new Error("Could not identify the XLF bundle for " + sourceFile);
}
exports.getResource = getResource;
function createXlfFilesForCoreBundle() {
    return event_stream_1.through(function (file) {
        var basename = path.basename(file.path);
        if (basename === 'nls.metadata.json') {
            if (file.isBuffer()) {
                var xlfs = Object.create(null);
                var json = JSON.parse(file.contents.toString('utf8'));
                for (var coreModule in json.keys) {
                    var projectResource = getResource(coreModule);
                    var resource = projectResource.name;
                    var project = projectResource.project;
                    var keys = json.keys[coreModule];
                    var messages = json.messages[coreModule];
                    if (keys.length !== messages.length) {
                        this.emit('error', "There is a mismatch between keys and messages in " + file.relative + " for module " + coreModule);
                        return;
                    }
                    else {
                        var xlf = xlfs[resource];
                        if (!xlf) {
                            xlf = new XLF(project);
                            xlfs[resource] = xlf;
                        }
                        xlf.addFile("src/" + coreModule, keys, messages);
                    }
                }
                for (var resource in xlfs) {
                    var xlf = xlfs[resource];
                    var filePath = xlf.project + "/" + resource.replace(/\//g, '_') + ".xlf";
                    var xlfFile = new File({
                        path: filePath,
                        contents: Buffer.from(xlf.toString(), 'utf8')
                    });
                    this.queue(xlfFile);
                }
            }
            else {
                this.emit('error', new Error("File " + file.relative + " is not using a buffer content"));
                return;
            }
        }
        else {
            this.emit('error', new Error("File " + file.relative + " is not a core meta data file."));
            return;
        }
    });
}
exports.createXlfFilesForCoreBundle = createXlfFilesForCoreBundle;
function createXlfFilesForExtensions() {
    var counter = 0;
    var folderStreamEnded = false;
    var folderStreamEndEmitted = false;
    return event_stream_1.through(function (extensionFolder) {
        var folderStream = this;
        var stat = fs.statSync(extensionFolder.path);
        if (!stat.isDirectory()) {
            return;
        }
        var extensionName = path.basename(extensionFolder.path);
        if (extensionName === 'node_modules') {
            return;
        }
        counter++;
        var _xlf;
        function getXlf() {
            if (!_xlf) {
                _xlf = new XLF(extensionsProject);
            }
            return _xlf;
        }
        gulp.src(["./extensions/" + extensionName + "/package.nls.json", "./extensions/" + extensionName + "/**/nls.metadata.json"]).pipe(event_stream_1.through(function (file) {
            if (file.isBuffer()) {
                var buffer = file.contents;
                var basename = path.basename(file.path);
                if (basename === 'package.nls.json') {
                    var json_1 = JSON.parse(buffer.toString('utf8'));
                    var keys = Object.keys(json_1);
                    var messages = keys.map(function (key) {
                        var value = json_1[key];
                        if (Is.string(value)) {
                            return value;
                        }
                        else if (value) {
                            return value.message;
                        }
                        else {
                            return "Unknown message for key: " + key;
                        }
                    });
                    getXlf().addFile("extensions/" + extensionName + "/package", keys, messages);
                }
                else if (basename === 'nls.metadata.json') {
                    var json = JSON.parse(buffer.toString('utf8'));
                    var relPath = path.relative("./extensions/" + extensionName, path.dirname(file.path));
                    for (var file_1 in json) {
                        var fileContent = json[file_1];
                        getXlf().addFile("extensions/" + extensionName + "/" + relPath + "/" + file_1, fileContent.keys, fileContent.messages);
                    }
                }
                else {
                    this.emit('error', new Error(file.path + " is not a valid extension nls file"));
                    return;
                }
            }
        }, function () {
            if (_xlf) {
                var xlfFile = new File({
                    path: path.join(extensionsProject, extensionName + '.xlf'),
                    contents: Buffer.from(_xlf.toString(), 'utf8')
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
    return event_stream_1.through(function (file) {
        var projectName, resourceFile;
        if (path.basename(file.path) === 'Default.isl') {
            projectName = setupProject;
            resourceFile = 'setup_default.xlf';
        }
        else {
            projectName = workbenchProject;
            resourceFile = 'setup_messages.xlf';
        }
        var xlf = new XLF(projectName), keys = [], messages = [];
        var model = new TextModel(file.contents.toString());
        var inMessageSection = false;
        model.lines.forEach(function (line) {
            if (line.length === 0) {
                return;
            }
            var firstChar = line.charAt(0);
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
            var sections = line.split('=');
            if (sections.length !== 2) {
                throw new Error("Badly formatted message found: " + line);
            }
            else {
                var key = sections[0];
                var value = sections[1];
                if (key.length > 0 && value.length > 0) {
                    keys.push(key);
                    messages.push(value);
                }
            }
        });
        var originalPath = file.path.substring(file.cwd.length + 1, file.path.split('.')[0].length).replace(/\\/g, '/');
        xlf.addFile(originalPath, keys, messages);
        // Emit only upon all ISL files combined into single XLF instance
        var newFilePath = path.join(projectName, resourceFile);
        var xlfFile = new File({ path: newFilePath, contents: Buffer.from(xlf.toString(), 'utf-8') });
        this.queue(xlfFile);
    });
}
exports.createXlfFilesForIsl = createXlfFilesForIsl;
function pushXlfFiles(apiHostname, username, password) {
    var tryGetPromises = [];
    var updateCreatePromises = [];
    return event_stream_1.through(function (file) {
        var project = path.dirname(file.relative);
        var fileName = path.basename(file.path);
        var slug = fileName.substr(0, fileName.length - '.xlf'.length);
        var credentials = username + ":" + password;
        // Check if resource already exists, if not, then create it.
        var promise = tryGetResource(project, slug, apiHostname, credentials);
        tryGetPromises.push(promise);
        promise.then(function (exists) {
            if (exists) {
                promise = updateResource(project, slug, file, apiHostname, credentials);
            }
            else {
                promise = createResource(project, slug, file, apiHostname, credentials);
            }
            updateCreatePromises.push(promise);
        });
    }, function () {
        var _this = this;
        // End the pipe only after all the communication with Transifex API happened
        Promise.all(tryGetPromises).then(function () {
            Promise.all(updateCreatePromises).then(function () {
                _this.queue(null);
            }).catch(function (reason) { throw new Error(reason); });
        }).catch(function (reason) { throw new Error(reason); });
    });
}
exports.pushXlfFiles = pushXlfFiles;
function getAllResources(project, apiHostname, username, password) {
    return new Promise(function (resolve, reject) {
        var credentials = username + ":" + password;
        var options = {
            hostname: apiHostname,
            path: "/api/2/project/" + project + "/resources",
            auth: credentials,
            method: 'GET'
        };
        var request = https.request(options, function (res) {
            var buffer = [];
            res.on('data', function (chunk) { return buffer.push(chunk); });
            res.on('end', function () {
                if (res.statusCode === 200) {
                    var json = JSON.parse(Buffer.concat(buffer).toString());
                    if (Array.isArray(json)) {
                        resolve(json.map(function (o) { return o.slug; }));
                        return;
                    }
                    reject("Unexpected data format. Response code: " + res.statusCode + ".");
                }
                else {
                    reject("No resources in " + project + " returned no data. Response code: " + res.statusCode + ".");
                }
            });
        });
        request.on('error', function (err) {
            reject("Failed to query resources in " + project + " with the following error: " + err + ". " + options.path);
        });
        request.end();
    });
}
function findObsoleteResources(apiHostname, username, password) {
    var resourcesByProject = Object.create(null);
    resourcesByProject[extensionsProject] = [].concat(externalExtensionsWithTranslations); // clone
    return event_stream_1.through(function (file) {
        var project = path.dirname(file.relative);
        var fileName = path.basename(file.path);
        var slug = fileName.substr(0, fileName.length - '.xlf'.length);
        var slugs = resourcesByProject[project];
        if (!slugs) {
            resourcesByProject[project] = slugs = [];
        }
        slugs.push(slug);
        this.push(file);
    }, function () {
        var _this = this;
        var json = JSON.parse(fs.readFileSync('./build/lib/i18n.resources.json', 'utf8'));
        var i18Resources = json.editor.concat(json.workbench).map(function (r) { return r.project + '/' + r.name.replace(/\//g, '_'); });
        var extractedResources = [];
        for (var _i = 0, _a = [workbenchProject, editorProject]; _i < _a.length; _i++) {
            var project = _a[_i];
            for (var _b = 0, _c = resourcesByProject[project]; _b < _c.length; _b++) {
                var resource = _c[_b];
                if (resource !== 'setup_messages') {
                    extractedResources.push(project + '/' + resource);
                }
            }
        }
        if (i18Resources.length !== extractedResources.length) {
            console.log("[i18n] Obsolete resources in file 'build/lib/i18n.resources.json': JSON.stringify(" + i18Resources.filter(function (p) { return extractedResources.indexOf(p) === -1; }) + ")");
            console.log("[i18n] Missing resources in file 'build/lib/i18n.resources.json': JSON.stringify(" + extractedResources.filter(function (p) { return i18Resources.indexOf(p) === -1; }) + ")");
        }
        var promises = [];
        var _loop_1 = function (project) {
            promises.push(getAllResources(project, apiHostname, username, password).then(function (resources) {
                var expectedResources = resourcesByProject[project];
                var unusedResources = resources.filter(function (resource) { return resource && expectedResources.indexOf(resource) === -1; });
                if (unusedResources.length) {
                    console.log("[transifex] Obsolete resources in project '" + project + "': " + unusedResources.join(', '));
                }
            }));
        };
        for (var project in resourcesByProject) {
            _loop_1(project);
        }
        return Promise.all(promises).then(function (_) {
            _this.push(null);
        }).catch(function (reason) { throw new Error(reason); });
    });
}
exports.findObsoleteResources = findObsoleteResources;
function tryGetResource(project, slug, apiHostname, credentials) {
    return new Promise(function (resolve, reject) {
        var options = {
            hostname: apiHostname,
            path: "/api/2/project/" + project + "/resource/" + slug + "/?details",
            auth: credentials,
            method: 'GET'
        };
        var request = https.request(options, function (response) {
            if (response.statusCode === 404) {
                resolve(false);
            }
            else if (response.statusCode === 200) {
                resolve(true);
            }
            else {
                reject("Failed to query resource " + project + "/" + slug + ". Response: " + response.statusCode + " " + response.statusMessage);
            }
        });
        request.on('error', function (err) {
            reject("Failed to get " + project + "/" + slug + " on Transifex: " + err);
        });
        request.end();
    });
}
function createResource(project, slug, xlfFile, apiHostname, credentials) {
    return new Promise(function (resolve, reject) {
        var data = JSON.stringify({
            'content': xlfFile.contents.toString(),
            'name': slug,
            'slug': slug,
            'i18n_type': 'XLIFF'
        });
        var options = {
            hostname: apiHostname,
            path: "/api/2/project/" + project + "/resources",
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            auth: credentials,
            method: 'POST'
        };
        var request = https.request(options, function (res) {
            if (res.statusCode === 201) {
                log("Resource " + project + "/" + slug + " successfully created on Transifex.");
            }
            else {
                reject("Something went wrong in the request creating " + slug + " in " + project + ". " + res.statusCode);
            }
        });
        request.on('error', function (err) {
            reject("Failed to create " + project + "/" + slug + " on Transifex: " + err);
        });
        request.write(data);
        request.end();
    });
}
/**
 * The following link provides information about how Transifex handles updates of a resource file:
 * https://dev.befoolish.co/tx-docs/public/projects/updating-content#what-happens-when-you-update-files
 */
function updateResource(project, slug, xlfFile, apiHostname, credentials) {
    return new Promise(function (resolve, reject) {
        var data = JSON.stringify({ content: xlfFile.contents.toString() });
        var options = {
            hostname: apiHostname,
            path: "/api/2/project/" + project + "/resource/" + slug + "/content",
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            auth: credentials,
            method: 'PUT'
        };
        var request = https.request(options, function (res) {
            if (res.statusCode === 200) {
                res.setEncoding('utf8');
                var responseBuffer_1 = '';
                res.on('data', function (chunk) {
                    responseBuffer_1 += chunk;
                });
                res.on('end', function () {
                    var response = JSON.parse(responseBuffer_1);
                    log("Resource " + project + "/" + slug + " successfully updated on Transifex. Strings added: " + response.strings_added + ", updated: " + response.strings_added + ", deleted: " + response.strings_added);
                    resolve();
                });
            }
            else {
                reject("Something went wrong in the request updating " + slug + " in " + project + ". " + res.statusCode);
            }
        });
        request.on('error', function (err) {
            reject("Failed to update " + project + "/" + slug + " on Transifex: " + err);
        });
        request.write(data);
        request.end();
    });
}
// cache resources
var _coreAndExtensionResources;
function pullCoreAndExtensionsXlfFiles(apiHostname, username, password, language, externalExtensions) {
    if (!_coreAndExtensionResources) {
        _coreAndExtensionResources = [];
        // editor and workbench
        var json = JSON.parse(fs.readFileSync('./build/lib/i18n.resources.json', 'utf8'));
        _coreAndExtensionResources.push.apply(_coreAndExtensionResources, json.editor);
        _coreAndExtensionResources.push.apply(_coreAndExtensionResources, json.workbench);
        // extensions
        var extensionsToLocalize_1 = Object.create(null);
        glob.sync('./extensions/**/*.nls.json').forEach(function (extension) { return extensionsToLocalize_1[extension.split('/')[2]] = true; });
        glob.sync('./extensions/*/node_modules/vscode-nls').forEach(function (extension) { return extensionsToLocalize_1[extension.split('/')[2]] = true; });
        Object.keys(extensionsToLocalize_1).forEach(function (extension) {
            _coreAndExtensionResources.push({ name: extension, project: extensionsProject });
        });
        if (externalExtensions) {
            for (var resourceName in externalExtensions) {
                _coreAndExtensionResources.push({ name: resourceName, project: extensionsProject });
            }
        }
    }
    return pullXlfFiles(apiHostname, username, password, language, _coreAndExtensionResources);
}
exports.pullCoreAndExtensionsXlfFiles = pullCoreAndExtensionsXlfFiles;
function pullSetupXlfFiles(apiHostname, username, password, language, includeDefault) {
    var setupResources = [{ name: 'setup_messages', project: workbenchProject }];
    if (includeDefault) {
        setupResources.push({ name: 'setup_default', project: setupProject });
    }
    return pullXlfFiles(apiHostname, username, password, language, setupResources);
}
exports.pullSetupXlfFiles = pullSetupXlfFiles;
function pullXlfFiles(apiHostname, username, password, language, resources) {
    var credentials = username + ":" + password;
    var expectedTranslationsCount = resources.length;
    var translationsRetrieved = 0, called = false;
    return event_stream_1.readable(function (count, callback) {
        // Mark end of stream when all resources were retrieved
        if (translationsRetrieved === expectedTranslationsCount) {
            return this.emit('end');
        }
        if (!called) {
            called = true;
            var stream_1 = this;
            resources.map(function (resource) {
                retrieveResource(language, resource, apiHostname, credentials).then(function (file) {
                    if (file) {
                        stream_1.emit('data', file);
                    }
                    translationsRetrieved++;
                }).catch(function (error) { throw new Error(error); });
            });
        }
        callback();
    });
}
var limiter = new Limiter(NUMBER_OF_CONCURRENT_DOWNLOADS);
function retrieveResource(language, resource, apiHostname, credentials) {
    return limiter.queue(function () { return new Promise(function (resolve, reject) {
        var slug = resource.name.replace(/\//g, '_');
        var project = resource.project;
        var transifexLanguageId = language.id === 'ps' ? 'en' : language.transifexId || language.id;
        var options = {
            hostname: apiHostname,
            path: "/api/2/project/" + project + "/resource/" + slug + "/translation/" + transifexLanguageId + "?file&mode=onlyreviewed",
            auth: credentials,
            port: 443,
            method: 'GET'
        };
        console.log('[transifex] Fetching ' + options.path);
        var request = https.request(options, function (res) {
            var xlfBuffer = [];
            res.on('data', function (chunk) { return xlfBuffer.push(chunk); });
            res.on('end', function () {
                if (res.statusCode === 200) {
                    resolve(new File({ contents: Buffer.concat(xlfBuffer), path: project + "/" + slug + ".xlf" }));
                }
                else if (res.statusCode === 404) {
                    console.log("[transifex] " + slug + " in " + project + " returned no data.");
                    resolve(null);
                }
                else {
                    reject(slug + " in " + project + " returned no data. Response code: " + res.statusCode + ".");
                }
            });
        });
        request.on('error', function (err) {
            reject("Failed to query resource " + slug + " with the following error: " + err + ". " + options.path);
        });
        request.end();
    }); });
}
function prepareI18nFiles() {
    var parsePromises = [];
    return event_stream_1.through(function (xlf) {
        var stream = this;
        var parsePromise = XLF.parse(xlf.contents.toString());
        parsePromises.push(parsePromise);
        parsePromise.then(function (resolvedFiles) {
            resolvedFiles.forEach(function (file) {
                var translatedFile = createI18nFile(file.originalFilePath, file.messages);
                stream.queue(translatedFile);
            });
        });
    }, function () {
        var _this = this;
        Promise.all(parsePromises)
            .then(function () { _this.queue(null); })
            .catch(function (reason) { throw new Error(reason); });
    });
}
exports.prepareI18nFiles = prepareI18nFiles;
function createI18nFile(originalFilePath, messages) {
    var result = Object.create(null);
    result[''] = [
        '--------------------------------------------------------------------------------------------',
        'Copyright (c) Microsoft Corporation. All rights reserved.',
        'Licensed under the MIT License. See License.txt in the project root for license information.',
        '--------------------------------------------------------------------------------------------',
        'Do not edit this file. It is machine generated.'
    ];
    for (var _i = 0, _a = Object.keys(messages); _i < _a.length; _i++) {
        var key = _a[_i];
        result[key] = messages[key];
    }
    var content = JSON.stringify(result, null, '\t');
    if (process.platform === 'win32') {
        content = content.replace(/\n/g, '/r/n');
    }
    return new File({
        path: path.join(originalFilePath + '.i18n.json'),
        contents: Buffer.from(content, 'utf8')
    });
}
var i18nPackVersion = "1.0.0";
function pullI18nPackFiles(apiHostname, username, password, language, resultingTranslationPaths) {
    return pullCoreAndExtensionsXlfFiles(apiHostname, username, password, language, externalExtensionsWithTranslations)
        .pipe(prepareI18nPackFiles(externalExtensionsWithTranslations, resultingTranslationPaths, language.id === 'ps'));
}
exports.pullI18nPackFiles = pullI18nPackFiles;
function prepareI18nPackFiles(externalExtensions, resultingTranslationPaths, pseudo) {
    if (pseudo === void 0) { pseudo = false; }
    var parsePromises = [];
    var mainPack = { version: i18nPackVersion, contents: {} };
    var extensionsPacks = {};
    return event_stream_1.through(function (xlf) {
        var stream = this;
        var project = path.dirname(xlf.path);
        var resource = path.basename(xlf.path, '.xlf');
        var contents = xlf.contents.toString();
        var parsePromise = pseudo ? XLF.parsePseudo(contents) : XLF.parse(contents);
        parsePromises.push(parsePromise);
        parsePromise.then(function (resolvedFiles) {
            resolvedFiles.forEach(function (file) {
                var path = file.originalFilePath;
                var firstSlash = path.indexOf('/');
                if (project === extensionsProject) {
                    var extPack = extensionsPacks[resource];
                    if (!extPack) {
                        extPack = extensionsPacks[resource] = { version: i18nPackVersion, contents: {} };
                    }
                    var externalId = externalExtensions[resource];
                    if (!externalId) {
                        var secondSlash = path.indexOf('/', firstSlash + 1);
                        extPack.contents[path.substr(secondSlash + 1)] = file.messages;
                    }
                    else {
                        extPack.contents[path] = file.messages;
                    }
                }
                else {
                    mainPack.contents[path.substr(firstSlash + 1)] = file.messages;
                }
            });
        });
    }, function () {
        var _this = this;
        Promise.all(parsePromises)
            .then(function () {
            var translatedMainFile = createI18nFile('./main', mainPack);
            resultingTranslationPaths.push({ id: 'vscode', resourceName: 'main.i18n.json' });
            _this.queue(translatedMainFile);
            for (var extension in extensionsPacks) {
                var translatedExtFile = createI18nFile("./extensions/" + extension, extensionsPacks[extension]);
                _this.queue(translatedExtFile);
                var externalExtensionId = externalExtensions[extension];
                if (externalExtensionId) {
                    resultingTranslationPaths.push({ id: externalExtensionId, resourceName: "extensions/" + extension + ".i18n.json" });
                }
                else {
                    resultingTranslationPaths.push({ id: "vscode." + extension, resourceName: "extensions/" + extension + ".i18n.json" });
                }
            }
            _this.queue(null);
        })
            .catch(function (reason) { throw new Error(reason); });
    });
}
exports.prepareI18nPackFiles = prepareI18nPackFiles;
function prepareIslFiles(language, innoSetupConfig) {
    var parsePromises = [];
    return event_stream_1.through(function (xlf) {
        var stream = this;
        var parsePromise = XLF.parse(xlf.contents.toString());
        parsePromises.push(parsePromise);
        parsePromise.then(function (resolvedFiles) {
            resolvedFiles.forEach(function (file) {
                if (path.basename(file.originalFilePath) === 'Default' && !innoSetupConfig.defaultInfo) {
                    return;
                }
                var translatedFile = createIslFile(file.originalFilePath, file.messages, language, innoSetupConfig);
                stream.queue(translatedFile);
            });
        });
    }, function () {
        var _this = this;
        Promise.all(parsePromises)
            .then(function () { _this.queue(null); })
            .catch(function (reason) { throw new Error(reason); });
    });
}
exports.prepareIslFiles = prepareIslFiles;
function createIslFile(originalFilePath, messages, language, innoSetup) {
    var content = [];
    var originalContent;
    if (path.basename(originalFilePath) === 'Default') {
        originalContent = new TextModel(fs.readFileSync(originalFilePath + '.isl', 'utf8'));
    }
    else {
        originalContent = new TextModel(fs.readFileSync(originalFilePath + '.en.isl', 'utf8'));
    }
    originalContent.lines.forEach(function (line) {
        if (line.length > 0) {
            var firstChar = line.charAt(0);
            if (firstChar === '[' || firstChar === ';') {
                if (line === '; *** Inno Setup version 5.5.3+ English messages ***') {
                    content.push("; *** Inno Setup version 5.5.3+ " + innoSetup.defaultInfo.name + " messages ***");
                }
                else {
                    content.push(line);
                }
            }
            else {
                var sections = line.split('=');
                var key = sections[0];
                var translated = line;
                if (key) {
                    if (key === 'LanguageName') {
                        translated = key + "=" + innoSetup.defaultInfo.name;
                    }
                    else if (key === 'LanguageID') {
                        translated = key + "=" + innoSetup.defaultInfo.id;
                    }
                    else if (key === 'LanguageCodePage') {
                        translated = key + "=" + innoSetup.codePage.substr(2);
                    }
                    else {
                        var translatedMessage = messages[key];
                        if (translatedMessage) {
                            translated = key + "=" + translatedMessage;
                        }
                    }
                }
                content.push(translated);
            }
        }
    });
    var basename = path.basename(originalFilePath);
    var filePath = basename + "." + language.id + ".isl";
    return new File({
        path: filePath,
        contents: iconv.encode(Buffer.from(content.join('\r\n'), 'utf8'), innoSetup.codePage)
    });
}
function encodeEntities(value) {
    var result = [];
    for (var i = 0; i < value.length; i++) {
        var ch = value[i];
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
function pseudify(message) {
    return '\uFF3B' + message.replace(/[aouei]/g, '$&$&') + '\uFF3D';
}
