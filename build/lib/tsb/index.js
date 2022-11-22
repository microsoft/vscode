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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRywrQkFBK0I7QUFDL0IsbUNBQW1DO0FBQ25DLHFDQUFxQztBQUNyQyxpQ0FBaUM7QUFDakMsbUNBQW9EO0FBQ3BELCtCQUErQjtBQUMvQixtQ0FBa0M7QUFDbEMsMkJBQTRDO0FBQzVDLGlDQUFpQztBQUNqQyxzQ0FBdUM7QUFDdkMsNkNBQXlFO0FBT3pFLE1BQU0sV0FBWSxTQUFRLGVBQU07SUFDL0IsTUFBTSxDQUFDLE1BQVcsRUFBRSxTQUFpQixFQUFFLFFBQStCLElBQVUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdGLEtBQUssS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUM1QjtBQUVELFNBQVMsa0JBQWtCO0lBQzFCLE1BQU0sTUFBTSxHQUF3QixjQUFjLE9BQU8sSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5RSxNQUFNLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDLElBQUksV0FBVyxFQUFFLENBQUM7SUFDckMsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxlQUFlLEdBQUcsQ0FBQyxHQUFXLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFFbkYsU0FBZ0IsTUFBTSxDQUNyQixXQUFtQixFQUNuQixlQUE0QyxFQUM1QyxNQUFzSCxFQUN0SCxVQUFxQyxlQUFlO0lBR3BELFNBQVMsZUFBZSxDQUFDLElBQW1CO1FBRTNDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRTtZQUM5QixPQUFPLENBQUMsRUFBRSxD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