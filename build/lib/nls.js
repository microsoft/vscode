"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.nls = void 0;
const lazy = require("lazy.js");
const event_stream_1 = require("event-stream");
const File = require("vinyl");
const sm = require("source-map");
const path = require("path");
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
function template(lines) {
    let indent = '', wrap = '';
    if (lines.length > 1) {
        indent = '\t';
        wrap = '\n';
    }
    return `/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
define([], [${wrap + lines.map(l => indent + l).join(',\n') + wrap}]);`;
}
/**
 * Returns a stream containing the patched JavaScript and source maps.
 */
function nls() {
    const input = (0, event_stream_1.through)();
    const output = input.pipe((0, event_stream_1.through)(function (f) {
        if (!f.sourceMap) {
            return this.emit('error', new Error(`File ${f.relative} does not have sourcemaps.`));
        }
        let source = f.sourceMap.sources[0];
        if (!source) {
            return this.emit('error', new Error(`File ${f.relative} does not have a source in the source map.`));
        }
        const root = f.sourceMap.sourceRoot;
        if (root) {
            source = path.join(root, source);
        }
        const typescript = f.sourceMap.sourcesContent[0];
        if (!typescript) {
            return this.emit('error', new Error(`File ${f.relative} does not have the original content in the source map.`));
        }
        _nls.patchFiles(f, typescript).forEach(f => this.emit('data', f));
    }));
    return (0, event_stream_1.duplex)(input, output);
}
exports.nls = nls;
function isImportNode(ts, node) {
    return node.kind === ts.SyntaxKind.ImportDeclaration || node.kind === ts.SyntaxKind.ImportEqualsDeclaration;
}
var _nls;
(function (_nls) {
    function fileFrom(file, contents, path = file.path) {
        return new File({
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
        const imports = lazy(collect(ts, sourceFile, n => isImportNode(ts, n) ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse));
        // import nls = require('vs/nls');
        const importEqualsDeclarations = imports
            .filter(n => n.kind === ts.SyntaxKind.ImportEqualsDeclaration)
            .map(n => n)
            .filter(d => d.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference)
            .filter(d => d.moduleReference.expression.getText() === '\'vs/nls\'');
        // import ... from 'vs/nls';
        const importDeclarations = imports
            .filter(n => n.kind === ts.SyntaxKind.ImportDeclaration)
            .map(n => n)
            .filter(d => d.moduleSpecifier.kind === ts.SyntaxKind.StringLiteral)
            .filter(d => d.moduleSpecifier.getText() === '\'vs/nls\'')
            .filter(d => !!d.importClause && !!d.importClause.namedBindings);
        const nlsExpressions = importEqualsDeclarations
            .map(d => d.moduleReference.expression)
            .concat(importDeclarations.map(d => d.moduleSpecifier))
            .map(d => ({
            start: ts.getLineAndCharacterOfPosition(sourceFile, d.getStart()),
            end: ts.getLineAndCharacterOfPosition(sourceFile, d.getEnd())
        }));
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
            .map(a => lazy(a).last())
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
            .map(a => lazy(a).last())
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
            localizeCalls: localizeCalls.toArray(),
            nlsExpressions: nlsExpressions.toArray()
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
            return lazy(this.lines).zip(this.lineEndings)
                .flatten().toArray().join('');
        }
    }
    function patchJavascript(patches, contents, moduleId) {
        const model = new TextModel(contents);
        // patch the localize calls
        lazy(patches).reverse().each(p => model.apply(p));
        // patch the 'vs/nls' imports
        const firstLine = model.get(0);
        const patchedFirstLine = firstLine.replace(/(['"])vs\/nls\1/g, `$1vs/nls!${moduleId}$1`);
        model.set(0, patchedFirstLine);
        return model.toString();
    }
    function patchSourcemap(patches, rsm, smc) {
        const smg = new sm.SourceMapGenerator({
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
            source = rsm.sourceRoot ? path.relative(rsm.sourceRoot, m.source) : m.source;
            source = source.replace(/\\/g, '/');
            smg.addMapping({ source, name: m.name, original, generated });
        }, null, sm.SourceMapConsumer.GENERATED_ORDER);
        if (source) {
            smg.setSourceContent(source, smc.sourceContentFor(source));
        }
        return JSON.parse(smg.toString());
    }
    function patch(ts, moduleId, typescript, javascript, sourcemap) {
        const { localizeCalls, nlsExpressions } = analyze(ts, typescript, 'localize');
        const { localizeCalls: localize2Calls, nlsExpressions: nls2Expressions } = analyze(ts, typescript, 'localize2');
        if (localizeCalls.length === 0) {
            return { javascript, sourcemap };
        }
        const nlsKeys = template(localizeCalls.map(lc => lc.key).concat(localize2Calls.map(lc => lc.key)));
        const nls = template(localizeCalls.map(lc => lc.value).concat(localize2Calls.map(lc => lc.value)));
        const smc = new sm.SourceMapConsumer(sourcemap);
        const positionFrom = mappedPositionFrom.bind(null, sourcemap.sources[0]);
        let i = 0;
        // build patches
        const localizePatches = lazy(localizeCalls)
            .map(lc => ([
            { range: lc.keySpan, content: '' + (i++) },
            { range: lc.valueSpan, content: 'null' }
        ]))
            .flatten()
            .map(c => {
            const start = lcFrom(smc.generatedPositionFor(positionFrom(c.range.start)));
            const end = lcFrom(smc.generatedPositionFor(positionFrom(c.range.end)));
            return { span: { start, end }, content: c.content };
        });
        const localize2Patches = lazy(localize2Calls)
            .map(lc => ([
            { range: lc.keySpan, content: '' + (i++) }
        ])).flatten()
            .map(c => {
            const start = lcFrom(smc.generatedPositionFor(positionFrom(c.range.start)));
            const end = lcFrom(smc.generatedPositionFor(positionFrom(c.range.end)));
            return { span: { start, end }, content: c.content };
        });
        const patches = localizePatches.concat(localize2Patches).toArray();
        javascript = patchJavascript(patches, javascript, moduleId);
        // since imports are not within the sourcemap information,
        // we must do this MacGyver style
        if (nlsExpressions.length || nls2Expressions.length) {
            javascript = javascript.replace(/^define\(.*$/m, line => {
                return line.replace(/(['"])vs\/nls\1/g, `$1vs/nls!${moduleId}$1`);
            });
        }
        sourcemap = patchSourcemap(patches, sourcemap, smc);
        return { javascript, sourcemap, nlsKeys, nls };
    }
    function patchFiles(javascriptFile, typescript) {
        const ts = require('typescript');
        // hack?
        const moduleId = javascriptFile.relative
            .replace(/\.js$/, '')
            .replace(/\\/g, '/');
        const { javascript, sourcemap, nlsKeys, nls } = patch(ts, moduleId, typescript, javascriptFile.contents.toString(), javascriptFile.sourceMap);
        const result = [fileFrom(javascriptFile, javascript)];
        result[0].sourceMap = sourcemap;
        if (nlsKeys) {
            result.push(fileFrom(javascriptFile, nlsKeys, javascriptFile.path.replace(/\.js$/, '.nls.keys.js')));
        }
        if (nls) {
            result.push(fileFrom(javascriptFile, nls, javascriptFile.path.replace(/\.js$/, '.nls.js')));
        }
        return result;
    }
    _nls.patchFiles = patchFiles;
})(_nls || (_nls = {}));
<<<<<<< HEAD
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibmxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBR2hHLGdDQUFnQztBQUNoQywrQ0FBK0M7QUFDL0MsOEJBQThCO0FBQzlCLGlDQUFpQztBQUNqQyw2QkFBOEI7QUFNOUIsSUFBSyxpQkFLSjtBQUxELFdBQUssaUJBQWlCO0lBQ3JCLHVEQUFHLENBQUE7SUFDSCwyRUFBYSxDQUFBO0lBQ2IscURBQUUsQ0FBQTtJQUNGLHlFQUFZLENBQUE7QUFDYixDQUFDLEVBTEksaUJBQWlCLEtBQWpCLGlCQUFpQixRQUtyQjtBQUVELFNBQVMsT0FBTyxDQUFDLEVBQStCLEVBQUUsSUFBYSxFQUFFLEVBQXdDO0lBQ3hHLE1BQU0sTUFBTSxHQUFjLEVBQUUsQ0FBQztJQUU3QixTQUFTLElBQUksQ0FBQyxJQUFhO1FBQzFCLE1BQU0sVUFBVSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU1QixJQUFJLFVBQVUsS0FBSyxpQkFBaUIsQ0FBQyxHQUFHLElBQUksVUFBVSxLQUFLLGlCQUFpQixDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQzVGLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkIsQ0FBQztRQUVELElBQUksVUFBVSxLQUFLLGlCQUFpQixDQUFDLGFBQWEsSUFBSSxVQUFVLEtBQUssaUJBQWlCLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDckcsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0IsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDWCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxTQUFTLEtBQUssQ0FBbUIsTUFBUztJQUN6QyxNQUFNLE1BQU0sR0FBTSxFQUFFLENBQUM7SUFDckIsS0FBSyxNQUFNLEVBQUUsSUFBSSxNQUFNLEVBQUUsQ0FB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
=======
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibmxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBR2hHLGdDQUFnQztBQUNoQywrQ0FBK0M7QUFDL0MsOEJBQThCO0FBQzlCLGlDQUFpQztBQUNqQyw2QkFBOEI7QUFNOUIsSUFBSyxpQkFLSjtBQUxELFdBQUssaUJBQWlCO0lBQ3JCLHVEQUFHLENBQUE7SUFDSCwyRUFBYSxDQUFBO0lBQ2IscURBQUUsQ0FBQTtJQUNGLHlFQUFZLENBQUE7QUFDYixDQUFDLEVBTEksaUJBQWlCLEtBQWpCLGlCQUFpQixRQUtyQjtBQUVELFNBQVMsT0FBTyxDQUFDLEVBQStCLEVBQUUsSUFBYSxFQUFFLEVBQXdDO0lBQ3hHLE1BQU0sTUFBTSxHQUFjLEVBQUUsQ0FBQztJQUU3QixTQUFTLElBQUksQ0FBQyxJQUFhO1FBQzFCLE1BQU0sVUFBVSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU1QixJQUFJLFVBQVUsS0FBSyxpQkFBaUIsQ0FBQyxHQUFHLElBQUksVUFBVSxLQUFLLGlCQUFpQixDQUFDLGFBQWEsRUFBRTtZQUMzRixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ2xCO1FBRUQsSUFBSSxVQUFVLEtBQUssaUJBQWlCLENBQUMsYUFBYSxJQUFJLFVBQVUsS0FBSyxpQkFBaUIsQ0FBQyxZQUFZLEVBQUU7WUFDcEcsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDNUI7SUFDRixDQUFDO0lBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ1gsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxLQUFLLENBQW1CLE1BQVM7SUFDekMsTUFBTSxNQUFNLEdBQU0sRUFBRSxDQUFDO0lBQ3JCLEtBQUssTUFBTSxFQUFFLElBQUksTUFBTSxFQUFFO1FBQ3hCLE1BQU0sQ0FBQyxFQUFFLENB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
>>>>>>> e4134fedcf8 (Introduce `localize2` function)
