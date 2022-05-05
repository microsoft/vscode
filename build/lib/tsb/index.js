"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = void 0;
const Vinyl = require("vinyl");
const through = require("through");
const builder = require("./builder");
const ts = require("typescript");
const stream_1 = require("stream");
const path_1 = require("path");
const utils_1 = require("./utils");
const fs_1 = require("fs");
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
function create(projectPath, existingOptions, verbose = false, onError = _defaultOnError) {
    function printDiagnostic(diag) {
        if (!diag.file || !diag.start) {
            onError(ts.flattenDiagnosticMessageText(diag.messageText, '\n'));
        }
        else {
            const lineAndCh = diag.file.getLineAndCharacterOfPosition(diag.start);
            onError(utils_1.strings.format('{0}({1},{2}): {3}', diag.file.fileName, lineAndCh.line + 1, lineAndCh.character + 1, ts.flattenDiagnosticMessageText(diag.messageText, '\n')));
        }
    }
    const parsed = ts.readConfigFile(projectPath, ts.sys.readFile);
    if (parsed.error) {
        printDiagnostic(parsed.error);
        return createNullCompiler();
    }
    const cmdLine = ts.parseJsonConfigFileContent(parsed.config, ts.sys, (0, path_1.dirname)(projectPath), existingOptions);
    if (cmdLine.errors.length > 0) {
        cmdLine.errors.forEach(printDiagnostic);
        return createNullCompiler();
    }
    const _builder = builder.createTypeScriptBuilder({ verbose }, projectPath, cmdLine);
    function createStream(token) {
        return through(function (file) {
            // give the file to the compiler
            if (file.isStream()) {
                this.emit('error', 'no support for streams');
                return;
            }
            _builder.file(file);
        }, function () {
            // start the compilation process
            _builder.build(file => this.queue(file), printDiagnostic, token).catch(e => console.error(e)).then(() => this.queue(null));
        });
    }
    const result = (token) => createStream(token);
    result.src = (opts) => {
        let _pos = 0;
        let _fileNames = cmdLine.fileNames.slice(0);
        return new class extends stream_1.Readable {
            constructor() {
                super({ objectMode: true });
            }
            _read() {
                let more = true;
                let path;
                for (; more && _pos < _fileNames.length; _pos++) {
                    path = _fileNames[_pos];
                    more = this.push(new Vinyl({
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
exports.create = create;
