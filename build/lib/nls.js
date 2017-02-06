"use strict";
var ts = require("./typescript/typescriptServices");
var lazy = require("lazy.js");
var event_stream_1 = require("event-stream");
var File = require("vinyl");
var sm = require("source-map");
var assign = require("object-assign");
var path = require("path");
var CollectStepResult;
(function (CollectStepResult) {
    CollectStepResult[CollectStepResult["Yes"] = 0] = "Yes";
    CollectStepResult[CollectStepResult["YesAndRecurse"] = 1] = "YesAndRecurse";
    CollectStepResult[CollectStepResult["No"] = 2] = "No";
    CollectStepResult[CollectStepResult["NoAndRecurse"] = 3] = "NoAndRecurse";
})(CollectStepResult || (CollectStepResult = {}));
function collect(node, fn) {
    var result = [];
    function loop(node) {
        var stepResult = fn(node);
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
    var result = {};
    for (var id in object) {
        result[id] = object[id];
    }
    return result;
}
function template(lines) {
    var indent = '', wrap = '';
    if (lines.length > 1) {
        indent = '\t';
        wrap = '\n';
    }
    return "/*---------------------------------------------------------\n * Copyright (C) Microsoft Corporation. All rights reserved.\n *--------------------------------------------------------*/\ndefine([], [" + (wrap + lines.map(function (l) { return indent + l; }).join(',\n') + wrap) + "]);";
}
/**
 * Returns a stream containing the patched JavaScript and source maps.
 */
function nls() {
    var input = event_stream_1.through();
    var output = input.pipe(event_stream_1.through(function (f) {
        var _this = this;
        if (!f.sourceMap) {
            return this.emit('error', new Error("File " + f.relative + " does not have sourcemaps."));
        }
        var source = f.sourceMap.sources[0];
        if (!source) {
            return this.emit('error', new Error("File " + f.relative + " does not have a source in the source map."));
        }
        var root = f.sourceMap.sourceRoot;
        if (root) {
            source = path.join(root, source);
        }
        var typescript = f.sourceMap.sourcesContent[0];
        if (!typescript) {
            return this.emit('error', new Error("File " + f.relative + " does not have the original content in the source map."));
        }
        nls.patchFiles(f, typescript).forEach(function (f) { return _this.emit('data', f); });
    }));
    return event_stream_1.duplex(input, output);
}
function isImportNode(node) {
    return node.kind === 212 /* ImportDeclaration */ || node.kind === 211 /* ImportEqualsDeclaration */;
}
(function (nls_1) {
    function fileFrom(file, contents, path) {
        if (path === void 0) { path = file.path; }
        return new File({
            contents: new Buffer(contents),
            base: file.base,
            cwd: file.cwd,
            path: path
        });
    }
    nls_1.fileFrom = fileFrom;
    function mappedPositionFrom(source, lc) {
        return { source: source, line: lc.line + 1, column: lc.character };
    }
    nls_1.mappedPositionFrom = mappedPositionFrom;
    function lcFrom(position) {
        return { line: position.line - 1, character: position.column };
    }
    nls_1.lcFrom = lcFrom;
    var SingleFileServiceHost = (function () {
        function SingleFileServiceHost(options, filename, contents) {
            var _this = this;
            this.options = options;
            this.filename = filename;
            this.getCompilationSettings = function () { return _this.options; };
            this.getScriptFileNames = function () { return [_this.filename]; };
            this.getScriptVersion = function () { return '1'; };
            this.getScriptSnapshot = function (name) { return name === _this.filename ? _this.file : _this.lib; };
            this.getCurrentDirectory = function () { return ''; };
            this.getDefaultLibFileName = function () { return 'lib.d.ts'; };
            this.file = ts.ScriptSnapshot.fromString(contents);
            this.lib = ts.ScriptSnapshot.fromString('');
        }
        return SingleFileServiceHost;
    }());
    nls_1.SingleFileServiceHost = SingleFileServiceHost;
    function isCallExpressionWithinTextSpanCollectStep(textSpan, node) {
        if (!ts.textSpanContainsTextSpan({ start: node.pos, length: node.end - node.pos }, textSpan)) {
            return CollectStepResult.No;
        }
        return node.kind === 160 /* CallExpression */ ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse;
    }
    function analyze(contents, options) {
        if (options === void 0) { options = {}; }
        var filename = 'file.ts';
        var serviceHost = new SingleFileServiceHost(assign(clone(options), { noResolve: true }), filename, contents);
        var service = ts.createLanguageService(serviceHost);
        var sourceFile = service.getSourceFile(filename);
        // all imports
        var imports = lazy(collect(sourceFile, function (n) { return isImportNode(n) ? CollectStepResult.YesAndRecurse : CollectStepResult.NoAndRecurse; }));
        // import nls = require('vs/nls');
        var importEqualsDeclarations = imports
            .filter(function (n) { return n.kind === 211 /* ImportEqualsDeclaration */; })
            .map(function (n) { return n; })
            .filter(function (d) { return d.moduleReference.kind === 222 /* ExternalModuleReference */; })
            .filter(function (d) { return d.moduleReference.expression.getText() === '\'vs/nls\''; });
        // import ... from 'vs/nls';
        var importDeclarations = imports
            .filter(function (n) { return n.kind === 212 /* ImportDeclaration */; })
            .map(function (n) { return n; })
            .filter(function (d) { return d.moduleSpecifier.kind === 8 /* StringLiteral */; })
            .filter(function (d) { return d.moduleSpecifier.getText() === '\'vs/nls\''; })
            .filter(function (d) { return !!d.importClause && !!d.importClause.namedBindings; });
        var nlsExpressions = importEqualsDeclarations
            .map(function (d) { return d.moduleReference.expression; })
            .concat(importDeclarations.map(function (d) { return d.moduleSpecifier; }))
            .map(function (d) { return ({
            start: ts.getLineAndCharacterOfPosition(sourceFile, d.getStart()),
            end: ts.getLineAndCharacterOfPosition(sourceFile, d.getEnd())
        }); });
        // `nls.localize(...)` calls
        var nlsLocalizeCallExpressions = importDeclarations
            .filter(function (d) { return d.importClause.namedBindings.kind === 214 /* NamespaceImport */; })
            .map(function (d) { return d.importClause.namedBindings.name; })
            .concat(importEqualsDeclarations.map(function (d) { return d.name; }))
            .map(function (n) { return service.getReferencesAtPosition(filename, n.pos + 1); })
            .flatten()
            .filter(function (r) { return !r.isWriteAccess; })
            .map(function (r) { return collect(sourceFile, function (n) { return isCallExpressionWithinTextSpanCollectStep(r.textSpan, n); }); })
            .map(function (a) { return lazy(a).last(); })
            .filter(function (n) { return !!n; })
            .map(function (n) { return n; })
            .filter(function (n) { return n.expression.kind === 158 /* PropertyAccessExpression */ && n.expression.name.getText() === 'localize'; });
        // `localize` named imports
        var allLocalizeImportDeclarations = importDeclarations
            .filter(function (d) { return d.importClause.namedBindings.kind === 215 /* NamedImports */; })
            .map(function (d) { return d.importClause.namedBindings.elements; })
            .flatten();
        // `localize` read-only references
        var localizeReferences = allLocalizeImportDeclarations
            .filter(function (d) { return d.name.getText() === 'localize'; })
            .map(function (n) { return service.getReferencesAtPosition(filename, n.pos + 1); })
            .flatten()
            .filter(function (r) { return !r.isWriteAccess; });
        // custom named `localize` read-only references
        var namedLocalizeReferences = allLocalizeImportDeclarations
            .filter(function (d) { return d.propertyName && d.propertyName.getText() === 'localize'; })
            .map(function (n) { return service.getReferencesAtPosition(filename, n.name.pos + 1); })
            .flatten()
            .filter(function (r) { return !r.isWriteAccess; });
        // find the deepest call expressions AST nodes that contain those references
        var localizeCallExpressions = localizeReferences
            .concat(namedLocalizeReferences)
            .map(function (r) { return collect(sourceFile, function (n) { return isCallExpressionWithinTextSpanCollectStep(r.textSpan, n); }); })
            .map(function (a) { return lazy(a).last(); })
            .filter(function (n) { return !!n; })
            .map(function (n) { return n; });
        // collect everything
        var localizeCalls = nlsLocalizeCallExpressions
            .concat(localizeCallExpressions)
            .map(function (e) { return e.arguments; })
            .filter(function (a) { return a.length > 1; })
            .sort(function (a, b) { return a[0].getStart() - b[0].getStart(); })
            .map(function (a) { return ({
            keySpan: { start: ts.getLineAndCharacterOfPosition(sourceFile, a[0].getStart()), end: ts.getLineAndCharacterOfPosition(sourceFile, a[0].getEnd()) },
            key: a[0].getText(),
            valueSpan: { start: ts.getLineAndCharacterOfPosition(sourceFile, a[1].getStart()), end: ts.getLineAndCharacterOfPosition(sourceFile, a[1].getEnd()) },
            value: a[1].getText()
        }); });
        return {
            localizeCalls: localizeCalls.toArray(),
            nlsExpressions: nlsExpressions.toArray()
        };
    }
    nls_1.analyze = analyze;
    var TextModel = (function () {
        function TextModel(contents) {
            var regex = /\r\n|\r|\n/g;
            var index = 0;
            var match;
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
        TextModel.prototype.get = function (index) {
            return this.lines[index];
        };
        TextModel.prototype.set = function (index, line) {
            this.lines[index] = line;
        };
        Object.defineProperty(TextModel.prototype, "lineCount", {
            get: function () {
                return this.lines.length;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Applies patch(es) to the model.
         * Multiple patches must be ordered.
         * Does not support patches spanning multiple lines.
         */
        TextModel.prototype.apply = function (patch) {
            var startLineNumber = patch.span.start.line;
            var endLineNumber = patch.span.end.line;
            var startLine = this.lines[startLineNumber] || '';
            var endLine = this.lines[endLineNumber] || '';
            this.lines[startLineNumber] = [
                startLine.substring(0, patch.span.start.character),
                patch.content,
                endLine.substring(patch.span.end.character)
            ].join('');
            for (var i = startLineNumber + 1; i <= endLineNumber; i++) {
                this.lines[i] = '';
            }
        };
        TextModel.prototype.toString = function () {
            return lazy(this.lines).zip(this.lineEndings)
                .flatten().toArray().join('');
        };
        return TextModel;
    }());
    nls_1.TextModel = TextModel;
    function patchJavascript(patches, contents, moduleId) {
        var model = new nls.TextModel(contents);
        // patch the localize calls
        lazy(patches).reverse().each(function (p) { return model.apply(p); });
        // patch the 'vs/nls' imports
        var firstLine = model.get(0);
        var patchedFirstLine = firstLine.replace(/(['"])vs\/nls\1/g, "$1vs/nls!" + moduleId + "$1");
        model.set(0, patchedFirstLine);
        return model.toString();
    }
    nls_1.patchJavascript = patchJavascript;
    function patchSourcemap(patches, rsm, smc) {
        var smg = new sm.SourceMapGenerator({
            file: rsm.file,
            sourceRoot: rsm.sourceRoot
        });
        patches = patches.reverse();
        var currentLine = -1;
        var currentLineDiff = 0;
        var source = null;
        smc.eachMapping(function (m) {
            var patch = patches[patches.length - 1];
            var original = { line: m.originalLine, column: m.originalColumn };
            var generated = { line: m.generatedLine, column: m.generatedColumn };
            if (currentLine !== generated.line) {
                currentLineDiff = 0;
            }
            currentLine = generated.line;
            generated.column += currentLineDiff;
            if (patch && m.generatedLine - 1 === patch.span.end.line && m.generatedColumn === patch.span.end.character) {
                var originalLength = patch.span.end.character - patch.span.start.character;
                var modifiedLength = patch.content.length;
                var lengthDiff = modifiedLength - originalLength;
                currentLineDiff += lengthDiff;
                generated.column += lengthDiff;
                patches.pop();
            }
            source = rsm.sourceRoot ? path.relative(rsm.sourceRoot, m.source) : m.source;
            source = source.replace(/\\/g, '/');
            smg.addMapping({ source: source, name: m.name, original: original, generated: generated });
        }, null, sm.SourceMapConsumer.GENERATED_ORDER);
        if (source) {
            smg.setSourceContent(source, smc.sourceContentFor(source));
        }
        return JSON.parse(smg.toString());
    }
    nls_1.patchSourcemap = patchSourcemap;
    function patch(moduleId, typescript, javascript, sourcemap) {
        var _a = analyze(typescript), localizeCalls = _a.localizeCalls, nlsExpressions = _a.nlsExpressions;
        if (localizeCalls.length === 0) {
            return { javascript: javascript, sourcemap: sourcemap };
        }
        var nlsKeys = template(localizeCalls.map(function (lc) { return lc.key; }));
        var nls = template(localizeCalls.map(function (lc) { return lc.value; }));
        var smc = new sm.SourceMapConsumer(sourcemap);
        var positionFrom = mappedPositionFrom.bind(null, sourcemap.sources[0]);
        var i = 0;
        // build patches
        var patches = lazy(localizeCalls)
            .map(function (lc) { return ([
            { range: lc.keySpan, content: '' + (i++) },
            { range: lc.valueSpan, content: 'null' }
        ]); })
            .flatten()
            .map(function (c) {
            var start = lcFrom(smc.generatedPositionFor(positionFrom(c.range.start)));
            var end = lcFrom(smc.generatedPositionFor(positionFrom(c.range.end)));
            return { span: { start: start, end: end }, content: c.content };
        })
            .toArray();
        javascript = patchJavascript(patches, javascript, moduleId);
        // since imports are not within the sourcemap information,
        // we must do this MacGyver style
        if (nlsExpressions.length) {
            javascript = javascript.replace(/^define\(.*$/m, function (line) {
                return line.replace(/(['"])vs\/nls\1/g, "$1vs/nls!" + moduleId + "$1");
            });
        }
        sourcemap = patchSourcemap(patches, sourcemap, smc);
        return { javascript: javascript, sourcemap: sourcemap, nlsKeys: nlsKeys, nls: nls };
    }
    nls_1.patch = patch;
    function patchFiles(javascriptFile, typescript) {
        // hack?
        var moduleId = javascriptFile.relative
            .replace(/\.js$/, '')
            .replace(/\\/g, '/');
        var _a = patch(moduleId, typescript, javascriptFile.contents.toString(), javascriptFile.sourceMap), javascript = _a.javascript, sourcemap = _a.sourcemap, nlsKeys = _a.nlsKeys, nls = _a.nls;
        var result = [fileFrom(javascriptFile, javascript)];
        result[0].sourceMap = sourcemap;
        if (nlsKeys) {
            result.push(fileFrom(javascriptFile, nlsKeys, javascriptFile.path.replace(/\.js$/, '.nls.keys.js')));
        }
        if (nls) {
            result.push(fileFrom(javascriptFile, nls, javascriptFile.path.replace(/\.js$/, '.nls.js')));
        }
        return result;
    }
    nls_1.patchFiles = patchFiles;
})(nls || (nls = {}));
module.exports = nls;
