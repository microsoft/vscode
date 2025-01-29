"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = create;
const vinyl_1 = __importDefault(require("vinyl"));
const through_1 = __importDefault(require("through"));
const builder = __importStar(require("./builder"));
const typescript_1 = __importDefault(require("typescript"));
const stream_1 = require("stream");
const path_1 = require("path");
const utils_1 = require("./utils");
const fs_1 = require("fs");
const fancy_log_1 = __importDefault(require("fancy-log"));
const transpiler_1 = require("./transpiler");
const colors = require("ansi-colors");
class EmptyDuplex extends stream_1.Duplex {
    _write(_chunk, _encoding, callback) { callback(); }
    _read() { this.push(null); }
}
function createNullCompiler() {
    const result = function () { return new EmptyDuplex(); };
    result.src = () => new EmptyDuplex();
    return result;
}
const _defaultOnError = (err) => console.log(JSON.stringify(err, null, 4));
function create(projectPath, existingOptions, config, onError = _defaultOnError) {
    function printDiagnostic(diag) {
        if (diag instanceof Error) {
            onError(diag.message);
        }
        else if (!diag.file || !diag.start) {
            onError(typescript_1.default.flattenDiagnosticMessageText(diag.messageText, '\n'));
        }
        else {
            const lineAndCh = diag.file.getLineAndCharacterOfPosition(diag.start);
            onError(utils_1.strings.format('{0}({1},{2}): {3}', diag.file.fileName, lineAndCh.line + 1, lineAndCh.character + 1, typescript_1.default.flattenDiagnosticMessageText(diag.messageText, '\n')));
        }
    }
    const parsed = typescript_1.default.readConfigFile(projectPath, typescript_1.default.sys.readFile);
    if (parsed.error) {
        printDiagnostic(parsed.error);
        return createNullCompiler();
    }
    const cmdLine = typescript_1.default.parseJsonConfigFileContent(parsed.config, typescript_1.default.sys, (0, path_1.dirname)(projectPath), existingOptions);
    if (cmdLine.errors.length > 0) {
        cmdLine.errors.forEach(printDiagnostic);
        return createNullCompiler();
    }
    function logFn(topic, message) {
        if (config.verbose) {
            (0, fancy_log_1.default)(colors.cyan(topic), message);
        }
    }
    // FULL COMPILE stream doing transpile, syntax and semantic diagnostics
    function createCompileStream(builder, token) {
        return (0, through_1.default)(function (file) {
            // give the file to the compiler
            if (file.isStream()) {
                this.emit('error', 'no support for streams');
                return;
            }
            builder.file(file);
        }, function () {
            // start the compilation process
            builder.build(file => this.queue(file), printDiagnostic, token).catch(e => console.error(e)).then(() => this.queue(null));
        });
    }
    // TRANSPILE ONLY stream doing just TS to JS conversion
    function createTranspileStream(transpiler) {
        return (0, through_1.default)(function (file) {
            // give the file to the compiler
            if (file.isStream()) {
                this.emit('error', 'no support for streams');
                return;
            }
            if (!file.contents) {
                return;
            }
            if (!config.transpileOnlyIncludesDts && file.path.endsWith('.d.ts')) {
                return;
            }
            if (!transpiler.onOutfile) {
                transpiler.onOutfile = file => this.queue(file);
            }
            transpiler.transpile(file);
        }, function () {
            transpiler.join().then(() => {
                this.queue(null);
                transpiler.onOutfile = undefined;
            });
        });
    }
    let result;
    if (config.transpileOnly) {
        const transpiler = !config.transpileWithSwc
            ? new transpiler_1.TscTranspiler(logFn, printDiagnostic, projectPath, cmdLine)
            : new transpiler_1.ESBuildTranspiler(logFn, printDiagnostic, projectPath, cmdLine);
        result = (() => createTranspileStream(transpiler));
    }
    else {
        const _builder = builder.createTypeScriptBuilder({ logFn }, projectPath, cmdLine);
        result = ((token) => createCompileStream(_builder, token));
    }
    result.src = (opts) => {
        let _pos = 0;
        const _fileNames = cmdLine.fileNames.slice(0);
        return new class extends stream_1.Readable {
            constructor() {
                super({ objectMode: true });
            }
            _read() {
                let more = true;
                let path;
                for (; more && _pos < _fileNames.length; _pos++) {
                    path = _fileNames[_pos];
                    more = this.push(new vinyl_1.default({
                        path,
                        contents: (0, fs_1.readFileSync)(path),
                        stat: (0, fs_1.statSync)(path),
                        cwd: opts && opts.cwd,
                        base: opts && opts.base || (0, path_1.dirname)(projectPath)
                    }));
                }
                if (_pos >= _fileNames.length) {
                    this.push(null);
                }
            }
        };
    };
    return result;
}
//# sourceMappingURL=index.js.map