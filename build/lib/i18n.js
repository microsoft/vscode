/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
var path = require("path");
var fs = require("fs");
var event_stream_1 = require("event-stream");
var File = require("vinyl");
var Is = require("is");
var util = require('gulp-util');
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
;
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
