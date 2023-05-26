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
const log = require("fancy-log");
const colors = require("ansi-colors");
const transpiler_1 = require("./transpiler");
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
    function logFn(topic, message) {
        if (config.verbose) {
            log(colors.cyan(topic), message);
        }
    }
    // FULL COMPILE stream doing transpile, syntax and semantic diagnostics
    function createCompileStream(builder, token) {
        return through(function (file) {
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
        return through(function (file) {
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
            : new transpiler_1.SwcTranspiler(logFn, printDiagnostic, projectPath, cmdLine);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRywrQkFBK0I7QUFDL0IsbUNBQW1DO0FBQ25DLHFDQUFxQztBQUNyQyxpQ0FBaUM7QUFDakMsbUNBQW9EO0FBQ3BELCtCQUErQjtBQUMvQixtQ0FBa0M7QUFDbEMsMkJBQTRDO0FBQzVDLGlDQUFpQztBQUNqQyxzQ0FBdUM7QUFDdkMsNkNBQXlFO0FBT3pFLE1BQU0sV0FBWSxTQUFRLGVBQU07SUFDL0IsTUFBTSxDQUFDLE1BQVcsRUFBRSxTQUFpQixFQUFFLFFBQStCLElBQVUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdGLEtBQUssS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUM1QjtBQUVELFNBQVMsa0JBQWtCO0lBQzFCLE1BQU0sTUFBTSxHQUF3QixjQUFjLE9BQU8sSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5RSxNQUFNLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDLElBQUksV0FBVyxFQUFFLENBQUM7SUFDckMsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxlQUFlLEdBQUcsQ0FBQyxHQUFXLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFFbkYsU0FBZ0IsTUFBTSxDQUNyQixXQUFtQixFQUNuQixlQUE0QyxFQUM1QyxNQUFzSCxFQUN0SCxVQUFxQyxlQUFlO0lBR3BELFNBQVMsZUFBZSxDQUFDLElBQTJCO1FBRW5ELElBQUksSUFBSSxZQUFZLEtBQUssRUFBRTtZQUMxQixPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1NBQ3RCO2FBQU0s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