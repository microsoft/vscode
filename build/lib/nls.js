"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nls = nls;
const lazy_js_1 = __importDefault(require("lazy.js"));
const event_stream_1 = require("event-stream");
const vinyl_1 = __importDefault(require("vinyl"));
const source_map_1 = __importDefault(require("source-map"));
const path_1 = __importDefault(require("path"));
const gulp_sort_1 = __importDefault(require("gulp-sort"));
var CollectStepResult;
(function (CollectStepResult) {
    CollectStepResult[CollectStepResult["Yes"] = 0] = "Yes";
    CollectStepResult[CollectStepResult["YesAndRecurse"] = 1] = "YesAndRecurse";
    CollectStepResult[CollectStepResult["No"] = 2] = "No";
    CollectStepResult[CollectStepResult["NoAndRecurse"] = 3] = "NoAndRecurse";
})(CollectStepResult || (CollectStepResult = {}));
function collect(ts, node, fn) {
    const result = [];
    function loop(node) {
        const stepResult = fn(node);
        if (stepResult === CollectStepResult.Yes || stepResult === CollectStepResult.YesAndRecurse) {
            result.push(node);
        }
        if (stepResult === CollectStepResult.YesAndRecurse || stepResult === CollectStepResult.NoAndRecurse) {
            ts.forEachChild(node, loop);
        }
    }
    loop(node);
    return result;
}
function clone(object) {
    const result = {};
    for (const id in object) {
        result[id] = object[id];
    }
    return result;
}
/**
 * Returns a stream containing the patched JavaScript and source maps.
 */
function nls(options) {
    let base;
    const input = (0, event_stream_1.through)();
    const output = input
        .pipe((0, gulp_sort_1.default)()) // IMPORTANT: to ensure stable NLS metadata generation, we must sort the files because NLS messages are globally extracted and indexed across all files
        .pipe((0, event_stream_1.through)(function (f) {
        if (!f.sourceMap) {
            return this.emit('error', new Error(`File ${f.relative} does not have sourcemaps.`));
        }
        let source = f.sourceMap.sources[0];
        if (!source) {
            return this.emit('error', new Error(`File ${f.relative} does not have a source in the source map.`));
        }
        const root = f.sourceMap.sourceRoot;
        if (root) {
            source = path_1.default.join(root, source);
        }
        const typescript = f.sourceMap.sourcesContent[0];
        if (!typescript) {
            return this.emit('error', new Error(`File ${f.relative} does not have the original content in the source map.`));
        }
        base = f.base;
        this.emit('data', _nls.patchFile(f, typescript, options));
    }, function () {
        for (const file of [
            new vinyl_1.default({
                contents: Buffer.from(JSON.stringify({
                    keys: _nls.moduleToNLSKeys,
                    messages: _nls.moduleToNLSMessages,
                }, null, '\t')),
                base,
                path: `${base}/nls.metadata.json`
            }),
            new vinyl_1.default({
                contents: Buffer.from(JSON.stringify(_nls.allNLSMessages)),
                base,
                path: `${base}/nls.messages.json`
            }),
            new vinyl_1.default({
                contents: Buffer.from(JSON.stringify(_nls.allNLSModulesAndKeys)),
                base,
                path: `${base}/nls.keys.json`
            }),
            new vinyl_1.default({
                contents: Buffer.from(`/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
globalThis._VSCODE_NLS_MESSAGES=${JSON.stringify(_nls.allNLSMessages)};`),
                base,
                path: `${base}/nls.messages.js`
            })
        ]) {
            this.emit('data', file);
        }
        this.emit('end');
    }));
    return (0, event_stream_1.duplex)(input, output);
}
function isImportNode(ts, node) {
    return node.kind === ts.SyntaxKind.ImportDeclaration || node.kind === ts.SyntaxKind.ImportEqualsDeclaration;
}
var _nls;
(function (_nls) {
    _nls.moduleToNLSKeys = {};
    _nls.moduleToNLSMessages = {};
    _nls.allNLSMessages = [];
    _nls.allNLSModulesAndKeys = [];
    let allNLSMessagesIndex = 0;
    function fileFrom(file, contents, path = file.path) {
        return new vinyl_1.default({
            contents: Buffer.from(contents),
            base: file.base,
            cwd: file.cwd,
            path: path
        });
    }
    function mappedPositionFrom(source, lc) {
        return { source, line: lc.line + 1, column: lc.character };
    }
    function lcFrom(position) {
        return { line: position.line - 1, character: position.column };
    }
    class SingleFileServiceHost {
        options;
        filename;
        file;
        lib;
        constructor(ts, options, filename, contents) {
            this.options = options;
            this.filename = filename;
            this.file = ts.ScriptSnapshot.fromString(contents);
            this.lib = ts.ScriptSnapshot.fromString('');
        }
        getCompilationSettings = () => this.options;
        getScriptFileNames = () => [this.filename];
        getScriptVersion = () => '1';
        getScriptSnapshot = (name) => name === this.filename ? this.file : this.lib;
        getCurrentDirectory = () => '';
        getDefaultLibFileName = () => 'lib.d.ts';
        readFile(path, _encoding) {
            if (path === this.filename) {
                return this.file.getText(0, this.file.getLength());
            }
            return undefined;
        }
        fileExists(path) {
            return path === this.filename;
        }
    }
    function isCallExpressionWithinTextSpanCollectStep(ts, textSpan, node) {
        if (!ts.textSpanContainsTextSpan({ start: node.pos, length: node.end - node.pos }, textSpan)) {
            return CollectStepResult.No;
        }
        return node.kind === ts.SyntaxKind.CallExpression ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse;
    }
    function analyze(ts, contents, functionName, options = {}) {
        const filename = 'file.ts';
        const serviceHost = new SingleFileServiceHost(ts, Object.assign(clone(options), { noResolve: true }), filename, contents);
        const service = ts.createLanguageService(serviceHost);
        const sourceFile = ts.createSourceFile(filename, contents, ts.ScriptTarget.ES5, true);
        // all imports
        const imports = (0, lazy_js_1.default)(collect(ts, sourceFile, n => isImportNode(ts, n) ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse));
        // import nls = require('vs/nls');
        const importEqualsDeclarations = imports
            .filter(n => n.kind === ts.SyntaxKind.ImportEqualsDeclaration)
            .map(n => n)
            .filter(d => d.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference)
            .filter(d => d.moduleReference.expression.getText().endsWith(`/nls.js'`));
        // import ... from 'vs/nls';
        const importDeclarations = imports
            .filter(n => n.kind === ts.SyntaxKind.ImportDeclaration)
            .map(n => n)
            .filter(d => d.moduleSpecifier.kind === ts.SyntaxKind.StringLiteral)
            .filter(d => d.moduleSpecifier.getText().endsWith(`/nls.js'`))
            .filter(d => !!d.importClause && !!d.importClause.namedBindings);
        // `nls.localize(...)` calls
        const nlsLocalizeCallExpressions = importDeclarations
            .filter(d => !!(d.importClause && d.importClause.namedBindings && d.importClause.namedBindings.kind === ts.SyntaxKind.NamespaceImport))
            .map(d => d.importClause.namedBindings.name)
            .concat(importEqualsDeclarations.map(d => d.name))
            // find read-only references to `nls`
            .map(n => service.getReferencesAtPosition(filename, n.pos + 1))
            .flatten()
            .filter(r => !r.isWriteAccess)
            // find the deepest call expressions AST nodes that contain those references
            .map(r => collect(ts, sourceFile, n => isCallExpressionWithinTextSpanCollectStep(ts, r.textSpan, n)))
            .map(a => (0, lazy_js_1.default)(a).last())
            .filter(n => !!n)
            .map(n => n)
            // only `localize` calls
            .filter(n => n.expression.kind === ts.SyntaxKind.PropertyAccessExpression && n.expression.name.getText() === functionName);
        // `localize` named imports
        const allLocalizeImportDeclarations = importDeclarations
            .filter(d => !!(d.importClause && d.importClause.namedBindings && d.importClause.namedBindings.kind === ts.SyntaxKind.NamedImports))
            .map(d => [].concat(d.importClause.namedBindings.elements))
            .flatten();
        // `localize` read-only references
        const localizeReferences = allLocalizeImportDeclarations
            .filter(d => d.name.getText() === functionName)
            .map(n => service.getReferencesAtPosition(filename, n.pos + 1))
            .flatten()
            .filter(r => !r.isWriteAccess);
        // custom named `localize` read-only references
        const namedLocalizeReferences = allLocalizeImportDeclarations
            .filter(d => d.propertyName && d.propertyName.getText() === functionName)
            .map(n => service.getReferencesAtPosition(filename, n.name.pos + 1))
            .flatten()
            .filter(r => !r.isWriteAccess);
        // find the deepest call expressions AST nodes that contain those references
        const localizeCallExpressions = localizeReferences
            .concat(namedLocalizeReferences)
            .map(r => collect(ts, sourceFile, n => isCallExpressionWithinTextSpanCollectStep(ts, r.textSpan, n)))
            .map(a => (0, lazy_js_1.default)(a).last())
            .filter(n => !!n)
            .map(n => n);
        // collect everything
        const localizeCalls = nlsLocalizeCallExpressions
            .concat(localizeCallExpressions)
            .map(e => e.arguments)
            .filter(a => a.length > 1)
            .sort((a, b) => a[0].getStart() - b[0].getStart())
            .map(a => ({
            keySpan: { start: ts.getLineAndCharacterOfPosition(sourceFile, a[0].getStart()), end: ts.getLineAndCharacterOfPosition(sourceFile, a[0].getEnd()) },
            key: a[0].getText(),
            valueSpan: { start: ts.getLineAndCharacterOfPosition(sourceFile, a[1].getStart()), end: ts.getLineAndCharacterOfPosition(sourceFile, a[1].getEnd()) },
            value: a[1].getText()
        }));
        return {
            localizeCalls: localizeCalls.toArray()
        };
    }
    class TextModel {
        lines;
        lineEndings;
        constructor(contents) {
            const regex = /\r\n|\r|\n/g;
            let index = 0;
            let match;
            this.lines = [];
            this.lineEndings = [];
            while (match = regex.exec(contents)) {
                this.lines.push(contents.substring(index, match.index));
                this.lineEndings.push(match[0]);
                index = regex.lastIndex;
            }
            if (contents.length > 0) {
                this.lines.push(contents.substring(index, contents.length));
                this.lineEndings.push('');
            }
        }
        get(index) {
            return this.lines[index];
        }
        set(index, line) {
            this.lines[index] = line;
        }
        get lineCount() {
            return this.lines.length;
        }
        /**
         * Applies patch(es) to the model.
         * Multiple patches must be ordered.
         * Does not support patches spanning multiple lines.
         */
        apply(patch) {
            const startLineNumber = patch.span.start.line;
            const endLineNumber = patch.span.end.line;
            const startLine = this.lines[startLineNumber] || '';
            const endLine = this.lines[endLineNumber] || '';
            this.lines[startLineNumber] = [
                startLine.substring(0, patch.span.start.character),
                patch.content,
                endLine.substring(patch.span.end.character)
            ].join('');
            for (let i = startLineNumber + 1; i <= endLineNumber; i++) {
                this.lines[i] = '';
            }
        }
        toString() {
            return (0, lazy_js_1.default)(this.lines).zip(this.lineEndings)
                .flatten().toArray().join('');
        }
    }
    function patchJavascript(patches, contents) {
        const model = new TextModel(contents);
        // patch the localize calls
        (0, lazy_js_1.default)(patches).reverse().each(p => model.apply(p));
        return model.toString();
    }
    function patchSourcemap(patches, rsm, smc) {
        const smg = new source_map_1.default.SourceMapGenerator({
            file: rsm.file,
            sourceRoot: rsm.sourceRoot
        });
        patches = patches.reverse();
        let currentLine = -1;
        let currentLineDiff = 0;
        let source = null;
        smc.eachMapping(m => {
            const patch = patches[patches.length - 1];
            const original = { line: m.originalLine, column: m.originalColumn };
            const generated = { line: m.generatedLine, column: m.generatedColumn };
            if (currentLine !== generated.line) {
                currentLineDiff = 0;
            }
            currentLine = generated.line;
            generated.column += currentLineDiff;
            if (patch && m.generatedLine - 1 === patch.span.end.line && m.generatedColumn === patch.span.end.character) {
                const originalLength = patch.span.end.character - patch.span.start.character;
                const modifiedLength = patch.content.length;
                const lengthDiff = modifiedLength - originalLength;
                currentLineDiff += lengthDiff;
                generated.column += lengthDiff;
                patches.pop();
            }
            source = rsm.sourceRoot ? path_1.default.relative(rsm.sourceRoot, m.source) : m.source;
            source = source.replace(/\\/g, '/');
            smg.addMapping({ source, name: m.name, original, generated });
        }, null, source_map_1.default.SourceMapConsumer.GENERATED_ORDER);
        if (source) {
            smg.setSourceContent(source, smc.sourceContentFor(source));
        }
        return JSON.parse(smg.toString());
    }
    function parseLocalizeKeyOrValue(sourceExpression) {
        // sourceValue can be "foo", 'foo', `foo` or { .... }
        // in its evalulated form
        // we want to return either the string or the object
        // eslint-disable-next-line no-eval
        return eval(`(${sourceExpression})`);
    }
    function patch(ts, typescript, javascript, sourcemap, options) {
        const { localizeCalls } = analyze(ts, typescript, 'localize');
        const { localizeCalls: localize2Calls } = analyze(ts, typescript, 'localize2');
        if (localizeCalls.length === 0 && localize2Calls.length === 0) {
            return { javascript, sourcemap };
        }
        const nlsKeys = localizeCalls.map(lc => parseLocalizeKeyOrValue(lc.key)).concat(localize2Calls.map(lc => parseLocalizeKeyOrValue(lc.key)));
        const nlsMessages = localizeCalls.map(lc => parseLocalizeKeyOrValue(lc.value)).concat(localize2Calls.map(lc => parseLocalizeKeyOrValue(lc.value)));
        const smc = new source_map_1.default.SourceMapConsumer(sourcemap);
        const positionFrom = mappedPositionFrom.bind(null, sourcemap.sources[0]);
        // build patches
        const toPatch = (c) => {
            const start = lcFrom(smc.generatedPositionFor(positionFrom(c.range.start)));
            const end = lcFrom(smc.generatedPositionFor(positionFrom(c.range.end)));
            return { span: { start, end }, content: c.content };
        };
        const localizePatches = (0, lazy_js_1.default)(localizeCalls)
            .map(lc => (options.preserveEnglish ? [
            { range: lc.keySpan, content: `${allNLSMessagesIndex++}` } // localize('key', "message") => localize(<index>, "message")
        ] : [
            { range: lc.keySpan, content: `${allNLSMessagesIndex++}` }, // localize('key', "message") => localize(<index>, null)
            { range: lc.valueSpan, content: 'null' }
        ]))
            .flatten()
            .map(toPatch);
        const localize2Patches = (0, lazy_js_1.default)(localize2Calls)
            .map(lc => ({ range: lc.keySpan, content: `${allNLSMessagesIndex++}` } // localize2('key', "message") => localize(<index>, "message")
        ))
            .map(toPatch);
        // Sort patches by their start position
        const patches = localizePatches.concat(localize2Patches).toArray().sort((a, b) => {
            if (a.span.start.line < b.span.start.line) {
                return -1;
            }
            else if (a.span.start.line > b.span.start.line) {
                return 1;
            }
            else if (a.span.start.character < b.span.start.character) {
                return -1;
            }
            else if (a.span.start.character > b.span.start.character) {
                return 1;
            }
            else {
                return 0;
            }
        });
        javascript = patchJavascript(patches, javascript);
        sourcemap = patchSourcemap(patches, sourcemap, smc);
        return { javascript, sourcemap, nlsKeys, nlsMessages };
    }
    function patchFile(javascriptFile, typescript, options) {
        const ts = require('typescript');
        // hack?
        const moduleId = javascriptFile.relative
            .replace(/\.js$/, '')
            .replace(/\\/g, '/');
        const { javascript, sourcemap, nlsKeys, nlsMessages } = patch(ts, typescript, javascriptFile.contents.toString(), javascriptFile.sourceMap, options);
        const result = fileFrom(javascriptFile, javascript);
        result.sourceMap = sourcemap;
        if (nlsKeys) {
            _nls.moduleToNLSKeys[moduleId] = nlsKeys;
            _nls.allNLSModulesAndKeys.push([moduleId, nlsKeys.map(nlsKey => typeof nlsKey === 'string' ? nlsKey : nlsKey.key)]);
        }
        if (nlsMessages) {
            _nls.moduleToNLSMessages[moduleId] = nlsMessages;
            _nls.allNLSMessages.push(...nlsMessages);
        }
        return result;
    }
    _nls.patchFile = patchFile;
})(_nls || (_nls = {}));
//# sourceMappingURL=nls.js.map