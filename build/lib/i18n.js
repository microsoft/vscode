/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var fs = require("fs");
var event_stream_1 = require("event-stream");
var File = require("vinyl");
var Is = require("is");
var xml2js = require("xml2js");
var glob = require("glob");
var http = require("http");
var util = require('gulp-util');
var iconv = require('iconv-lite');
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
var Line = (function () {
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
var TextModel = (function () {
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
var XLF = (function () {
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
            throw new Error('No item ID or value specified.');
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
    return XLF;
}());
XLF.parse = function (xlfString) {
    return new Promise(function (resolve, reject) {
        var parser = new xml2js.Parser();
        var files = [];
        parser.parseString(xlfString, function (err, result) {
            if (err) {
                reject("Failed to parse XLIFF string. " + err);
            }
            var fileNodes = result['xliff']['file'];
            if (!fileNodes) {
                reject('XLIFF file does not contain "xliff" or "file" node(s) required for parsing.');
            }
            fileNodes.forEach(function (file) {
                var originalFilePath = file.$.original;
                if (!originalFilePath) {
                    reject('XLIFF file node does not contain original attribute to determine the original location of the resource file.');
                }
                var language = file.$['target-language'].toLowerCase();
                if (!language) {
                    reject('XLIFF file node does not contain target-language attribute to determine translated language.');
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
                        reject('XLIFF file does not contain full localization data. ID or target translation for one of the trans-unit nodes is not present.');
                    }
                });
                files.push({ messages: messages, originalFilePath: originalFilePath, language: language });
            });
            resolve(files);
        });
    });
};
exports.XLF = XLF;
var vscodeLanguages = [
    'chs',
    'cht',
    'jpn',
    'kor',
    'deu',
    'fra',
    'esn',
    'rus',
    'ita'
];
var iso639_3_to_2 = {
    'chs': 'zh-cn',
    'cht': 'zh-tw',
    'csy': 'cs-cz',
    'deu': 'de',
    'enu': 'en',
    'esn': 'es',
    'fra': 'fr',
    'hun': 'hu',
    'ita': 'it',
    'jpn': 'ja',
    'kor': 'ko',
    'nld': 'nl',
    'plk': 'pl',
    'ptb': 'pt-br',
    'ptg': 'pt',
    'rus': 'ru',
    'sve': 'sv-se',
    'trk': 'tr'
};
/**
 * Used to map Transifex to VS Code language code representation.
 */
var iso639_2_to_3 = {
    'zh-hans': 'chs',
    'zh-hant': 'cht',
    'cs-cz': 'csy',
    'de': 'deu',
    'en': 'enu',
    'es': 'esn',
    'fr': 'fra',
    'hu': 'hun',
    'it': 'ita',
    'ja': 'jpn',
    'ko': 'kor',
    'nl': 'nld',
    'pl': 'plk',
    'pt-br': 'ptb',
    'pt': 'ptg',
    'ru': 'rus',
    'sv-se': 'sve',
    'tr': 'trk'
};
function sortLanguages(directoryNames) {
    return directoryNames.map(function (dirName) {
        var lower = dirName.toLowerCase();
        return {
            name: lower,
            iso639_2: iso639_3_to_2[lower]
        };
    }).sort(function (a, b) {
        if (!a.iso639_2 && !b.iso639_2) {
            return 0;
        }
        if (!a.iso639_2) {
            return -1;
        }
        if (!b.iso639_2) {
            return 1;
        }
        return a.iso639_2 < b.iso639_2 ? -1 : (a.iso639_2 > b.iso639_2 ? 1 : 0);
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
function processCoreBundleFormat(fileHeader, json, emitter) {
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
    var languages = sortLanguages(fs.readdirSync(languageDirectory).filter(function (item) { return fs.statSync(path.join(languageDirectory, item)).isDirectory(); }));
    languages.forEach(function (language) {
        if (!language.iso639_2) {
            return;
        }
        if (process.env['VSCODE_BUILD_VERBOSE']) {
            log("Generating nls bundles for: " + language.iso639_2);
        }
        statistics[language.iso639_2] = 0;
        var localizedModules = Object.create(null);
        var cwd = path.join(languageDirectory, language.name, 'src');
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
                statistics[language.iso639_2] = statistics[language.iso639_2] + Object.keys(messages).length;
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
                    statistics[language.iso639_2] = statistics[language.iso639_2] + 1;
                }
                localizedMessages.push(message);
            });
            localizedModules[module] = localizedMessages;
        });
        Object.keys(bundleSection).forEach(function (bundle) {
            var modules = bundleSection[bundle];
            var contents = [
                fileHeader,
                "define(\"" + bundle + ".nls." + language.iso639_2 + "\", {"
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
            emitter.emit('data', new File({ path: bundle + '.nls.' + language.iso639_2 + '.js', contents: new Buffer(contents.join('\n'), 'utf-8') }));
        });
    });
    Object.keys(statistics).forEach(function (key) {
        var value = statistics[key];
        log(key + " has " + value + " untranslated strings.");
    });
    vscodeLanguages.forEach(function (language) {
        var iso639_2 = iso639_3_to_2[language];
        if (!iso639_2) {
            log("\tCouldn't find iso639 2 mapping for language " + language + ". Using default language instead.");
        }
        else {
            var stats = statistics[iso639_2];
            if (Is.undef(stats)) {
                log("\tNo translations found for language " + language + ". Using default language instead.");
            }
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
                processCoreBundleFormat(opts.fileHeader, json, this);
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
/**
 * Ensure to update those arrays when new resources are pushed to Transifex.
 * Used because Transifex does not have API method to pull all project resources.
 */
var editorResources = [
    { name: 'vs/platform', project: editorProject },
    { name: 'vs/editor/contrib', project: editorProject },
    { name: 'vs/editor', project: editorProject },
    { name: 'vs/base', project: editorProject },
    { name: 'vs/code', project: workbenchProject }
];
var workbenchResources = [
    { name: 'vs/workbench', project: workbenchProject },
    { name: 'vs/workbench/parts/cli', project: workbenchProject },
    { name: 'vs/workbench/parts/codeEditor', project: workbenchProject },
    { name: 'vs/workbench/parts/debug', project: workbenchProject },
    { name: 'vs/workbench/parts/emmet', project: workbenchProject },
    { name: 'vs/workbench/parts/execution', project: workbenchProject },
    { name: 'vs/workbench/parts/explorers', project: workbenchProject },
    { name: 'vs/workbench/parts/extensions', project: workbenchProject },
    { name: 'vs/workbench/parts/feedback', project: workbenchProject },
    { name: 'vs/workbench/parts/files', project: workbenchProject },
    { name: 'vs/workbench/parts/git', project: workbenchProject },
    { name: 'vs/workbench/parts/html', project: workbenchProject },
    { name: 'vs/workbench/parts/markers', project: workbenchProject },
    { name: 'vs/workbench/parts/nps', project: workbenchProject },
    { name: 'vs/workbench/parts/output', project: workbenchProject },
    { name: 'vs/workbench/parts/performance', project: workbenchProject },
    { name: 'vs/workbench/parts/preferences', project: workbenchProject },
    { name: 'vs/workbench/parts/quickopen', project: workbenchProject },
    { name: 'vs/workbench/parts/scm', project: workbenchProject },
    { name: 'vs/workbench/parts/search', project: workbenchProject },
    { name: 'vs/workbench/parts/snippets', project: workbenchProject },
    { name: 'vs/workbench/parts/tasks', project: workbenchProject },
    { name: 'vs/workbench/parts/terminal', project: workbenchProject },
    { name: 'vs/workbench/parts/themes', project: workbenchProject },
    { name: 'vs/workbench/parts/trust', project: workbenchProject },
    { name: 'vs/workbench/parts/update', project: workbenchProject },
    { name: 'vs/workbench/parts/watermark', project: workbenchProject },
    { name: 'vs/workbench/parts/welcome', project: workbenchProject },
    { name: 'vs/workbench/services/configuration', project: workbenchProject },
    { name: 'vs/workbench/services/editor', project: workbenchProject },
    { name: 'vs/workbench/services/files', project: workbenchProject },
    { name: 'vs/workbench/services/keybinding', project: workbenchProject },
    { name: 'vs/workbench/services/message', project: workbenchProject },
    { name: 'vs/workbench/services/mode', project: workbenchProject },
    { name: 'vs/workbench/services/textfile', project: workbenchProject },
    { name: 'vs/workbench/services/themes', project: workbenchProject },
    { name: 'setup_messages', project: workbenchProject }
];
function getResource(sourceFile) {
    var resource;
    if (sourceFile.startsWith('vs/platform')) {
        return { name: 'vs/platform', project: editorProject };
    }
    else if (sourceFile.startsWith('vs/editor/contrib')) {
        return { name: 'vs/editor/contrib', project: editorProject };
    }
    else if (sourceFile.startsWith('vs/editor')) {
        return { name: 'vs/editor', project: editorProject };
    }
    else if (sourceFile.startsWith('vs/base')) {
        return { name: 'vs/base', project: editorProject };
    }
    else if (sourceFile.startsWith('vs/code')) {
        return { name: 'vs/code', project: workbenchProject };
    }
    else if (sourceFile.startsWith('vs/workbench/parts')) {
        resource = sourceFile.split('/', 4).join('/');
        return { name: resource, project: workbenchProject };
    }
    else if (sourceFile.startsWith('vs/workbench/services')) {
        resource = sourceFile.split('/', 4).join('/');
        return { name: resource, project: workbenchProject };
    }
    else if (sourceFile.startsWith('vs/workbench')) {
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
    if (ModuleJsonFormat.is(json)) {
        extension.xlf.addFile(originalFilePath, json['keys'], json['messages']);
    }
    else {
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
        var request = http.request(options, function (response) {
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
        var request = http.request(options, function (res) {
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
        var request = http.request(options, function (res) {
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
function obtainProjectResources(projectName) {
    var resources = [];
    if (projectName === editorProject) {
        resources = editorResources;
    }
    else if (projectName === workbenchProject) {
        resources = workbenchResources;
    }
    else if (projectName === extensionsProject) {
        var extensionsToLocalize = glob.sync('./extensions/**/*.nls.json').map(function (extension) { return extension.split('/')[2]; });
        var resourcesToPull_1 = [];
        extensionsToLocalize.forEach(function (extension) {
            if (resourcesToPull_1.indexOf(extension) === -1) {
                resourcesToPull_1.push(extension);
                resources.push({ name: extension, project: projectName });
            }
        });
    }
    else if (projectName === setupProject) {
        resources.push({ name: 'setup_default', project: setupProject });
    }
    return resources;
}
function pullXlfFiles(projectName, apiHostname, username, password, languages, resources) {
    if (!resources) {
        resources = obtainProjectResources(projectName);
    }
    if (!resources) {
        throw new Error('Transifex projects and resources must be defined to be able to pull translations from Transifex.');
    }
    var credentials = username + ":" + password;
    var expectedTranslationsCount = languages.length * resources.length;
    var translationsRetrieved = 0, called = false;
    return event_stream_1.readable(function (count, callback) {
        // Mark end of stream when all resources were retrieved
        if (translationsRetrieved === expectedTranslationsCount) {
            return this.emit('end');
        }
        if (!called) {
            called = true;
            var stream_1 = this;
            // Retrieve XLF files from main projects
            languages.map(function (language) {
                resources.map(function (resource) {
                    retrieveResource(language, resource, apiHostname, credentials).then(function (file) {
                        stream_1.emit('data', file);
                        translationsRetrieved++;
                    }).catch(function (error) { throw new Error(error); });
                });
            });
        }
        callback();
    });
}
exports.pullXlfFiles = pullXlfFiles;
function retrieveResource(language, resource, apiHostname, credentials) {
    return new Promise(function (resolve, reject) {
        var slug = resource.name.replace(/\//g, '_');
        var project = resource.project;
        var iso639 = language.toLowerCase();
        var options = {
            hostname: apiHostname,
            path: "/api/2/project/" + project + "/resource/" + slug + "/translation/" + iso639 + "?file&mode=onlyreviewed",
            auth: credentials,
            method: 'GET'
        };
        var request = http.request(options, function (res) {
            var xlfBuffer = '';
            res.on('data', function (data) { return xlfBuffer += data; });
            res.on('end', function () {
                if (res.statusCode === 200) {
                    resolve(new File({ contents: new Buffer(xlfBuffer), path: project + "/" + iso639_2_to_3[language] + "/" + slug + ".xlf" }));
                }
                reject(slug + " in " + project + " returned no data. Response code: " + res.statusCode + ".");
            });
        });
        request.on('error', function (err) {
            reject("Failed to query resource " + slug + " with the following error: " + err);
        });
        request.end();
    });
}
function prepareJsonFiles() {
    return event_stream_1.through(function (xlf) {
        var stream = this;
        XLF.parse(xlf.contents.toString()).then(function (resolvedFiles) {
            resolvedFiles.forEach(function (file) {
                var messages = file.messages, translatedFile;
                // ISL file path always starts with 'build/'
                if (file.originalFilePath.startsWith('build/')) {
                    var defaultLanguages = { 'zh-hans': true, 'zh-hant': true, 'ko': true };
                    if (path.basename(file.originalFilePath) === 'Default' && !defaultLanguages[file.language]) {
                        return;
                    }
                    translatedFile = createIslFile('..', file.originalFilePath, messages, iso639_2_to_3[file.language]);
                }
                else {
                    translatedFile = createI18nFile(iso639_2_to_3[file.language], file.originalFilePath, messages);
                }
                stream.emit('data', translatedFile);
            });
        }, function (rejectReason) {
            throw new Error("XLF parsing error: " + rejectReason);
        });
    });
}
exports.prepareJsonFiles = prepareJsonFiles;
function createI18nFile(base, originalFilePath, messages) {
    var content = [
        '/*---------------------------------------------------------------------------------------------',
        ' *  Copyright (c) Microsoft Corporation. All rights reserved.',
        ' *  Licensed under the MIT License. See License.txt in the project root for license information.',
        ' *--------------------------------------------------------------------------------------------*/',
        '// Do not edit this file. It is machine generated.'
    ].join('\n') + '\n' + JSON.stringify(messages, null, '\t').replace(/\r\n/g, '\n');
    return new File({
        path: path.join(base, originalFilePath + '.i18n.json'),
        contents: new Buffer(content, 'utf8')
    });
}
exports.createI18nFile = createI18nFile;
var languageNames = {
    'chs': 'Simplified Chinese',
    'cht': 'Traditional Chinese',
    'kor': 'Korean'
};
var languageIds = {
    'chs': '$0804',
    'cht': '$0404',
    'kor': '$0412'
};
var encodings = {
    'chs': 'CP936',
    'cht': 'CP950',
    'jpn': 'CP932',
    'kor': 'CP949',
    'deu': 'CP1252',
    'fra': 'CP1252',
    'esn': 'CP1252',
    'rus': 'CP1251',
    'ita': 'CP1252'
};
function createIslFile(base, originalFilePath, messages, language) {
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
                    content.push("; *** Inno Setup version 5.5.3+ " + languageNames[language] + " messages ***");
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
                        translated = key + "=" + languageNames[language];
                    }
                    else if (key === 'LanguageID') {
                        translated = key + "=" + languageIds[language];
                    }
                    else if (key === 'LanguageCodePage') {
                        translated = key + "=" + encodings[language].substr(2);
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
    var tag = iso639_3_to_2[language];
    var basename = path.basename(originalFilePath);
    var filePath = path.join(base, path.dirname(originalFilePath), basename) + "." + tag + ".isl";
    return new File({
        path: filePath,
        contents: iconv.encode(new Buffer(content.join('\r\n'), 'utf8'), encodings[language])
    });
}
exports.createIslFile = createIslFile;
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
exports.decodeEntities = decodeEntities;
