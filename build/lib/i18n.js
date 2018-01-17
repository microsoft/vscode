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
var util = require('gulp-util');
var iconv = require('iconv-lite');
var NUMBER_OF_CONCURRENT_DOWNLOADS = 1;
function log(message) {
    var rest = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        rest[_i - 1] = arguments[_i];
    }
    util.log.apply(util, [util.colors.green('[i18n]'), message].concat(rest));
}
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
        this.files[original] = [];
        var existingKeys = [];
        for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
            var key = keys_1[_i];
            // Ignore duplicate keys because Transifex does not populate those with translated values.
            if (existingKeys.indexOf(key) !== -1) {
                continue;
            }
            existingKeys.push(key);
            var message = encodeEntities(messages[keys.indexOf(key)]);
            var comment = undefined;
            // Check if the message contains description (if so, it becomes an object type in JSON)
            if (Is.string(key)) {
                this.files[original].push({ id: key, message: message, comment: comment });
            }
            else {
                if (key['comment'] && key['comment'].length > 0) {
                    comment = key['comment'].map(function (comment) { return encodeEntities(comment); }).join('\r\n');
                }
                this.files[original].push({ id: key['key'], message: message, comment: comment });
            }
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
                    var language = file.$['target-language'].toLowerCase();
                    if (!language) {
                        reject(new Error("XLF parsing error: XLIFF file node does not contain target-language attribute to determine translated language."));
                    }
                    var messages = {};
                    var transUnits = file.body[0]['trans-unit'];
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
                    files.push({ messages: messages, originalFilePath: originalFilePath, language: language });
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
            if (Is.string(key)) {
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
        var cwd = path.join(languageDirectory, language.iso639_3, 'src');
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
                if (Is.string(keyInfo)) {
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
            emitter.emit('data', new File({ path: bundle + '.nls.' + language.id + '.js', contents: new Buffer(contents.join('\n'), 'utf-8') }));
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
            }
            if (BundledFormat.is(json)) {
                processCoreBundleFormat(opts.fileHeader, opts.languages, json, this);
            }
        }
        this.emit('data', file);
    });
}
exports.processNlsFiles = processNlsFiles;
function prepareXlfFiles(projectName, extensionName) {
    return event_stream_1.through(function (file) {
        if (!file.isBuffer()) {
            throw new Error("Failed to read component file: " + file.relative);
        }
        var extension = path.extname(file.path);
        if (extension === '.json') {
            var json = JSON.parse(file.contents.toString('utf8'));
            if (BundledFormat.is(json)) {
                importBundleJson(file, json, this);
            }
            else if (PackageJsonFormat.is(json) || ModuleJsonFormat.is(json)) {
                importModuleOrPackageJson(file, json, projectName, this, extensionName);
            }
            else {
                throw new Error("JSON format cannot be deduced for " + file.relative + ".");
            }
        }
        else if (extension === '.isl') {
            importIsl(file, this);
        }
    });
}
exports.prepareXlfFiles = prepareXlfFiles;
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
function importBundleJson(file, json, stream) {
    var bundleXlfs = Object.create(null);
    for (var source in json.keys) {
        var projectResource = getResource(source);
        var resource = projectResource.name;
        var project = projectResource.project;
        var keys = json.keys[source];
        var messages = json.messages[source];
        if (keys.length !== messages.length) {
            throw new Error("There is a mismatch between keys and messages in " + file.relative);
        }
        var xlf = bundleXlfs[resource] ? bundleXlfs[resource] : bundleXlfs[resource] = new XLF(project);
        xlf.addFile('src/' + source, keys, messages);
    }
    for (var resource in bundleXlfs) {
        var newFilePath = bundleXlfs[resource].project + "/" + resource.replace(/\//g, '_') + ".xlf";
        var xlfFile = new File({ path: newFilePath, contents: new Buffer(bundleXlfs[resource].toString(), 'utf-8') });
        stream.emit('data', xlfFile);
    }
}
// Keeps existing XLF instances and a state of how many files were already processed for faster file emission
var extensions = Object.create(null);
function importModuleOrPackageJson(file, json, projectName, stream, extensionName) {
    if (ModuleJsonFormat.is(json) && json['keys'].length !== json['messages'].length) {
        throw new Error("There is a mismatch between keys and messages in " + file.relative);
    }
    // Prepare the source path for <original/> attribute in XLF & extract messages from JSON
    var formattedSourcePath = file.relative.replace(/\\/g, '/');
    var messages = Object.keys(json).map(function (key) { return json[key].toString(); });
    // Stores the amount of localization files to be transformed to XLF before the emission
    var localizationFilesCount, originalFilePath;
    // If preparing XLF for external extension, then use different glob pattern and source path
    if (extensionName) {
        localizationFilesCount = glob.sync('**/*.nls.json').length;
        originalFilePath = "" + formattedSourcePath.substr(0, formattedSourcePath.length - '.nls.json'.length);
    }
    else {
        // Used for vscode/extensions folder
        extensionName = formattedSourcePath.split('/')[0];
        localizationFilesCount = glob.sync("./extensions/" + extensionName + "/**/*.nls.json").length;
        originalFilePath = "extensions/" + formattedSourcePath.substr(0, formattedSourcePath.length - '.nls.json'.length);
    }
    var extension = extensions[extensionName] ?
        extensions[extensionName] : extensions[extensionName] = { xlf: new XLF(projectName), processed: 0 };
    // .nls.json can come with empty array of keys and messages, check for it
    if (ModuleJsonFormat.is(json) && json.keys.length !== 0) {
        extension.xlf.addFile(originalFilePath, json.keys, json.messages);
    }
    else if (PackageJsonFormat.is(json) && Object.keys(json).length !== 0) {
        extension.xlf.addFile(originalFilePath, Object.keys(json), messages);
    }
    // Check if XLF is populated with file nodes to emit it
    if (++extensions[extensionName].processed === localizationFilesCount) {
        var newFilePath = path.join(projectName, extensionName + '.xlf');
        var xlfFile = new File({ path: newFilePath, contents: new Buffer(extension.xlf.toString(), 'utf-8') });
        stream.emit('data', xlfFile);
    }
}
function importIsl(file, stream) {
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
    var xlfFile = new File({ path: newFilePath, contents: new Buffer(xlf.toString(), 'utf-8') });
    stream.emit('data', xlfFile);
}
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
                _this.emit('end');
            }).catch(function (reason) { throw new Error(reason); });
        }).catch(function (reason) { throw new Error(reason); });
    });
}
exports.pushXlfFiles = pushXlfFiles;
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
var _buildResources;
function pullBuildXlfFiles(apiHostname, username, password, language) {
    if (!_buildResources) {
        _buildResources = [];
        // editor and workbench
        var json = JSON.parse(fs.readFileSync('./build/lib/i18n.resources.json', 'utf8'));
        _buildResources.push.apply(_buildResources, json.editor);
        _buildResources.push.apply(_buildResources, json.workbench);
        // extensions
        var extensionsToLocalize = glob.sync('./extensions/**/*.nls.json').map(function (extension) { return extension.split('/')[2]; });
        var resourcesToPull_1 = [];
        extensionsToLocalize.forEach(function (extension) {
            if (resourcesToPull_1.indexOf(extension) === -1) {
                resourcesToPull_1.push(extension);
                _buildResources.push({ name: extension, project: 'vscode-extensions' });
            }
        });
    }
    return pullXlfFiles(apiHostname, username, password, language, _buildResources);
}
exports.pullBuildXlfFiles = pullBuildXlfFiles;
function pullSetupXlfFiles(apiHostname, username, password, language, includeDefault) {
    var setupResources = [{ name: 'setup_messages', project: 'vscode-workbench' }];
    if (includeDefault) {
        setupResources.push({ name: 'setup_default', project: 'vscode-setup' });
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
                    stream_1.emit('data', file);
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
        var iso639 = language.transifexId || language.id;
        var options = {
            hostname: apiHostname,
            path: "/api/2/project/" + project + "/resource/" + slug + "/translation/" + iso639 + "?file&mode=onlyreviewed",
            auth: credentials,
            port: 443,
            method: 'GET'
        };
        var request = https.request(options, function (res) {
            var xlfBuffer = [];
            res.on('data', function (chunk) { return xlfBuffer.push(chunk); });
            res.on('end', function () {
                if (res.statusCode === 200) {
                    console.log('success: ' + options.path);
                    resolve(new File({ contents: Buffer.concat(xlfBuffer), path: project + "/" + slug + ".xlf" }));
                }
                reject(slug + " in " + project + " returned no data. Response code: " + res.statusCode + ".");
            });
        });
        request.on('error', function (err) {
            reject("Failed to query resource " + slug + " with the following error: " + err + ". " + options.path);
        });
        request.end();
        console.log('started: ' + options.path);
    }); });
}
function prepareI18nFiles(language) {
    var parsePromises = [];
    return event_stream_1.through(function (xlf) {
        var stream = this;
        var parsePromise = XLF.parse(xlf.contents.toString());
        parsePromises.push(parsePromise);
        parsePromise.then(function (resolvedFiles) {
            resolvedFiles.forEach(function (file) {
                var translatedFile = createI18nFile(language, file.originalFilePath, file.messages);
                stream.emit('data', translatedFile);
            });
        });
    }, function () {
        var _this = this;
        Promise.all(parsePromises)
            .then(function () { _this.emit('end'); })
            .catch(function (reason) { throw new Error(reason); });
    });
}
exports.prepareI18nFiles = prepareI18nFiles;
function createI18nFile(language, originalFilePath, messages) {
    var content = [
        '/*---------------------------------------------------------------------------------------------',
        ' *  Copyright (c) Microsoft Corporation. All rights reserved.',
        ' *  Licensed under the MIT License. See License.txt in the project root for license information.',
        ' *--------------------------------------------------------------------------------------------*/',
        '// Do not edit this file. It is machine generated.'
    ].join('\n') + '\n' + JSON.stringify(messages, null, '\t').replace(/\r\n/g, '\n');
    return new File({
        path: path.join(originalFilePath + '.i18n.json'),
        contents: new Buffer(content, 'utf8')
    });
}
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
                stream.emit('data', translatedFile);
            });
        });
    }, function () {
        var _this = this;
        Promise.all(parsePromises)
            .then(function () { _this.emit('end'); })
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
        contents: iconv.encode(new Buffer(content.join('\r\n'), 'utf8'), innoSetup.codePage)
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
