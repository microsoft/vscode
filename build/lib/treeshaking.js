/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var ts = require("typescript");
var TYPESCRIPT_LIB_FOLDER = path.dirname(require.resolve('typescript/lib/lib.d.ts'));
var ShakeLevel;
(function (ShakeLevel) {
    ShakeLevel[ShakeLevel["Files"] = 0] = "Files";
    ShakeLevel[ShakeLevel["InnerFile"] = 1] = "InnerFile";
    ShakeLevel[ShakeLevel["ClassMembers"] = 2] = "ClassMembers";
})(ShakeLevel = exports.ShakeLevel || (exports.ShakeLevel = {}));
function shake(options) {
    var languageService = createTypeScriptLanguageService(options);
    markNodes(languageService, options);
    return generateResult(languageService, options.shakeLevel);
}
exports.shake = shake;
//#region Discovery, LanguageService & Setup
function createTypeScriptLanguageService(options) {
    // Discover referenced files
    var FILES = discoverAndReadFiles(options);
    // Add fake usage files
    options.inlineEntryPoints.forEach(function (inlineEntryPoint, index) {
        FILES["inlineEntryPoint:" + index + ".ts"] = inlineEntryPoint;
    });
    // Resolve libs
    var RESOLVED_LIBS = {};
    options.libs.forEach(function (filename) {
        var filepath = path.join(TYPESCRIPT_LIB_FOLDER, filename);
        RESOLVED_LIBS["defaultLib:" + filename] = fs.readFileSync(filepath).toString();
    });
    var host = new TypeScriptLanguageServiceHost(RESOLVED_LIBS, FILES, options.compilerOptions);
    return ts.createLanguageService(host);
}
/**
 * Read imports and follow them until all files have been handled
 */
function discoverAndReadFiles(options) {
    var FILES = {};
    var in_queue = Object.create(null);
    var queue = [];
    var enqueue = function (moduleId) {
        if (in_queue[moduleId]) {
            return;
        }
        in_queue[moduleId] = true;
        queue.push(moduleId);
    };
    options.entryPoints.forEach(function (entryPoint) { return enqueue(entryPoint); });
    while (queue.length > 0) {
        var moduleId = queue.shift();
        var dts_filename = path.join(options.sourcesRoot, moduleId + '.d.ts');
        if (fs.existsSync(dts_filename)) {
            var dts_filecontents = fs.readFileSync(dts_filename).toString();
            FILES[moduleId + '.d.ts'] = dts_filecontents;
            continue;
        }
        var ts_filename = void 0;
        if (options.redirects[moduleId]) {
            ts_filename = path.join(options.sourcesRoot, options.redirects[moduleId] + '.ts');
        }
        else {
            ts_filename = path.join(options.sourcesRoot, moduleId + '.ts');
        }
        var ts_filecontents = fs.readFileSync(ts_filename).toString();
        var info = ts.preProcessFile(ts_filecontents);
        for (var i = info.importedFiles.length - 1; i >= 0; i--) {
            var importedFileName = info.importedFiles[i].fileName;
            if (options.importIgnorePattern.test(importedFileName)) {
                // Ignore vs/css! imports
                continue;
            }
            var importedModuleId = importedFileName;
            if (/(^\.\/)|(^\.\.\/)/.test(importedModuleId)) {
                importedModuleId = path.join(path.dirname(moduleId), importedModuleId);
            }
            enqueue(importedModuleId);
        }
        FILES[moduleId + '.ts'] = ts_filecontents;
    }
    return FILES;
}
/**
 * A TypeScript language service host
 */
var TypeScriptLanguageServiceHost = /** @class */ (function () {
    function TypeScriptLanguageServiceHost(libs, files, compilerOptions) {
        this._libs = libs;
        this._files = files;
        this._compilerOptions = compilerOptions;
    }
    // --- language service host ---------------
    TypeScriptLanguageServiceHost.prototype.getCompilationSettings = function () {
        return this._compilerOptions;
    };
    TypeScriptLanguageServiceHost.prototype.getScriptFileNames = function () {
        return ([]
            .concat(Object.keys(this._libs))
            .concat(Object.keys(this._files)));
    };
    TypeScriptLanguageServiceHost.prototype.getScriptVersion = function (fileName) {
        return '1';
    };
    TypeScriptLanguageServiceHost.prototype.getProjectVersion = function () {
        return '1';
    };
    TypeScriptLanguageServiceHost.prototype.getScriptSnapshot = function (fileName) {
        if (this._files.hasOwnProperty(fileName)) {
            return ts.ScriptSnapshot.fromString(this._files[fileName]);
        }
        else if (this._libs.hasOwnProperty(fileName)) {
            return ts.ScriptSnapshot.fromString(this._libs[fileName]);
        }
        else {
            return ts.ScriptSnapshot.fromString('');
        }
    };
    TypeScriptLanguageServiceHost.prototype.getScriptKind = function (fileName) {
        return ts.ScriptKind.TS;
    };
    TypeScriptLanguageServiceHost.prototype.getCurrentDirectory = function () {
        return '';
    };
    TypeScriptLanguageServiceHost.prototype.getDefaultLibFileName = function (options) {
        return 'defaultLib:lib.d.ts';
    };
    TypeScriptLanguageServiceHost.prototype.isDefaultLibFileName = function (fileName) {
        return fileName === this.getDefaultLibFileName(this._compilerOptions);
    };
    return TypeScriptLanguageServiceHost;
}());
//#endregion
//#region Tree Shaking
var NodeColor;
(function (NodeColor) {
    NodeColor[NodeColor["White"] = 0] = "White";
    NodeColor[NodeColor["Gray"] = 1] = "Gray";
    NodeColor[NodeColor["Black"] = 2] = "Black";
})(NodeColor || (NodeColor = {}));
function getColor(node) {
    return node.$$$color || 0 /* White */;
}
function setColor(node, color) {
    node.$$$color = color;
}
function nodeOrParentIsBlack(node) {
    while (node) {
        var color = getColor(node);
        if (color === 2 /* Black */) {
            return true;
        }
        node = node.parent;
    }
    return false;
}
function nodeOrChildIsBlack(node) {
    if (getColor(node) === 2 /* Black */) {
        return true;
    }
    for (var _i = 0, _a = node.getChildren(); _i < _a.length; _i++) {
        var child = _a[_i];
        if (nodeOrChildIsBlack(child)) {
            return true;
        }
    }
    return false;
}
function markNodes(languageService, options) {
    var program = languageService.getProgram();
    if (options.shakeLevel === 0 /* Files */) {
        // Mark all source files Black
        program.getSourceFiles().forEach(function (sourceFile) {
            setColor(sourceFile, 2 /* Black */);
        });
        return;
    }
    var black_queue = [];
    var gray_queue = [];
    var sourceFilesLoaded = {};
    function enqueueTopLevelModuleStatements(sourceFile) {
        sourceFile.forEachChild(function (node) {
            if (ts.isImportDeclaration(node)) {
                if (!node.importClause && ts.isStringLiteral(node.moduleSpecifier)) {
                    setColor(node, 2 /* Black */);
                    enqueueImport(node, node.moduleSpecifier.text);
                }
                return;
            }
            if (ts.isExportDeclaration(node)) {
                if (ts.isStringLiteral(node.moduleSpecifier)) {
                    setColor(node, 2 /* Black */);
                    enqueueImport(node, node.moduleSpecifier.text);
                }
                return;
            }
            if (ts.isExpressionStatement(node)
                || ts.isIfStatement(node)
                || ts.isIterationStatement(node, true)
                || ts.isExportAssignment(node)) {
                enqueue_black(node);
            }
            if (ts.isImportEqualsDeclaration(node)) {
                if (/export/.test(node.getFullText(sourceFile))) {
                    // e.g. "export import Severity = BaseSeverity;"
                    enqueue_black(node);
                }
            }
        });
    }
    function enqueue_gray(node) {
        if (nodeOrParentIsBlack(node) || getColor(node) === 1 /* Gray */) {
            return;
        }
        setColor(node, 1 /* Gray */);
        gray_queue.push(node);
    }
    function enqueue_black(node) {
        var previousColor = getColor(node);
        if (previousColor === 2 /* Black */) {
            return;
        }
        if (previousColor === 1 /* Gray */) {
            // remove from gray queue
            gray_queue.splice(gray_queue.indexOf(node), 1);
            setColor(node, 0 /* White */);
            // add to black queue
            enqueue_black(node);
            // // move from one queue to the other
            // black_queue.push(node);
            // setColor(node, NodeColor.Black);
            return;
        }
        if (nodeOrParentIsBlack(node)) {
            return;
        }
        var fileName = node.getSourceFile().fileName;
        if (/^defaultLib:/.test(fileName) || /\.d\.ts$/.test(fileName)) {
            setColor(node, 2 /* Black */);
            return;
        }
        var sourceFile = node.getSourceFile();
        if (!sourceFilesLoaded[sourceFile.fileName]) {
            sourceFilesLoaded[sourceFile.fileName] = true;
            enqueueTopLevelModuleStatements(sourceFile);
        }
        if (ts.isSourceFile(node)) {
            return;
        }
        setColor(node, 2 /* Black */);
        black_queue.push(node);
        if (options.shakeLevel === 2 /* ClassMembers */ && (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertySignature(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node))) {
            var references = languageService.getReferencesAtPosition(node.getSourceFile().fileName, node.name.pos + node.name.getLeadingTriviaWidth());
            if (references) {
                for (var i = 0, len = references.length; i < len; i++) {
                    var reference = references[i];
                    var referenceSourceFile = program.getSourceFile(reference.fileName);
                    var referenceNode = getTokenAtPosition(referenceSourceFile, reference.textSpan.start, false, false);
                    if (ts.isMethodDeclaration(referenceNode.parent)
                        || ts.isPropertyDeclaration(referenceNode.parent)
                        || ts.isGetAccessor(referenceNode.parent)
                        || ts.isSetAccessor(referenceNode.parent)) {
                        enqueue_gray(referenceNode.parent);
                    }
                }
            }
        }
    }
    function enqueueFile(filename) {
        var sourceFile = program.getSourceFile(filename);
        if (!sourceFile) {
            console.warn("Cannot find source file " + filename);
            return;
        }
        enqueue_black(sourceFile);
    }
    function enqueueImport(node, importText) {
        if (options.importIgnorePattern.test(importText)) {
            // this import should be ignored
            return;
        }
        var nodeSourceFile = node.getSourceFile();
        var fullPath;
        if (/(^\.\/)|(^\.\.\/)/.test(importText)) {
            fullPath = path.join(path.dirname(nodeSourceFile.fileName), importText) + '.ts';
        }
        else {
            fullPath = importText + '.ts';
        }
        enqueueFile(fullPath);
    }
    options.entryPoints.forEach(function (moduleId) { return enqueueFile(moduleId + '.ts'); });
    // Add fake usage files
    options.inlineEntryPoints.forEach(function (_, index) { return enqueueFile("inlineEntryPoint:" + index + ".ts"); });
    var step = 0;
    var checker = program.getTypeChecker();
    var _loop_1 = function () {
        ++step;
        var node = void 0;
        if (step % 100 === 0) {
            console.log(step + "/" + (step + black_queue.length + gray_queue.length) + " (" + black_queue.length + ", " + gray_queue.length + ")");
        }
        if (black_queue.length === 0) {
            for (var i = 0; i < gray_queue.length; i++) {
                var node_1 = gray_queue[i];
                var nodeParent = node_1.parent;
                if ((ts.isClassDeclaration(nodeParent) || ts.isInterfaceDeclaration(nodeParent)) && nodeOrChildIsBlack(nodeParent)) {
                    gray_queue.splice(i, 1);
                    black_queue.push(node_1);
                    setColor(node_1, 2 /* Black */);
                    i--;
                }
            }
        }
        if (black_queue.length > 0) {
            node = black_queue.shift();
        }
        else {
            return "break";
        }
        var nodeSourceFile = node.getSourceFile();
        var loop = function (node) {
            var _a = getRealNodeSymbol(checker, node), symbol = _a[0], symbolImportNode = _a[1];
            if (symbolImportNode) {
                setColor(symbolImportNode, 2 /* Black */);
            }
            if (symbol && !nodeIsInItsOwnDeclaration(nodeSourceFile, node, symbol)) {
                for (var i = 0, len = symbol.declarations.length; i < len; i++) {
                    var declaration = symbol.declarations[i];
                    if (ts.isSourceFile(declaration)) {
                        // Do not enqueue full source files
                        // (they can be the declaration of a module import)
                        continue;
                    }
                    if (options.shakeLevel === 2 /* ClassMembers */ && (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration))) {
                        enqueue_black(declaration.name);
                        for (var j = 0; j < declaration.members.length; j++) {
                            var member = declaration.members[j];
                            var memberName = member.name ? member.name.getText() : null;
                            if (ts.isConstructorDeclaration(member)
                                || ts.isConstructSignatureDeclaration(member)
                                || ts.isIndexSignatureDeclaration(member)
                                || ts.isCallSignatureDeclaration(member)
                                || memberName === 'toJSON'
                                || memberName === 'toString'
                                || memberName === 'dispose' // TODO: keeping all `dispose` methods
                            ) {
                                enqueue_black(member);
                            }
                        }
                        // queue the heritage clauses
                        if (declaration.heritageClauses) {
                            for (var _i = 0, _b = declaration.heritageClauses; _i < _b.length; _i++) {
                                var heritageClause = _b[_i];
                                enqueue_black(heritageClause);
                            }
                        }
                    }
                    else {
                        enqueue_black(declaration);
                    }
                }
            }
            node.forEachChild(loop);
        };
        node.forEachChild(loop);
    };
    while (black_queue.length > 0 || gray_queue.length > 0) {
        var state_1 = _loop_1();
        if (state_1 === "break")
            break;
    }
}
function nodeIsInItsOwnDeclaration(nodeSourceFile, node, symbol) {
    for (var i = 0, len = symbol.declarations.length; i < len; i++) {
        var declaration = symbol.declarations[i];
        var declarationSourceFile = declaration.getSourceFile();
        if (nodeSourceFile === declarationSourceFile) {
            if (declaration.pos <= node.pos && node.end <= declaration.end) {
                return true;
            }
        }
    }
    return false;
}
function generateResult(languageService, shakeLevel) {
    var program = languageService.getProgram();
    var result = {};
    var writeFile = function (filePath, contents) {
        result[filePath] = contents;
    };
    program.getSourceFiles().forEach(function (sourceFile) {
        var fileName = sourceFile.fileName;
        if (/^defaultLib:/.test(fileName)) {
            return;
        }
        var destination = fileName;
        if (/\.d\.ts$/.test(fileName)) {
            if (nodeOrChildIsBlack(sourceFile)) {
                writeFile(destination, sourceFile.text);
            }
            return;
        }
        var text = sourceFile.text;
        var result = '';
        function keep(node) {
            result += text.substring(node.pos, node.end);
        }
        function write(data) {
            result += data;
        }
        function writeMarkedNodes(node) {
            if (getColor(node) === 2 /* Black */) {
                return keep(node);
            }
            // Always keep certain top-level statements
            if (ts.isSourceFile(node.parent)) {
                if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'use strict') {
                    return keep(node);
                }
                if (ts.isVariableStatement(node) && nodeOrChildIsBlack(node)) {
                    return keep(node);
                }
            }
            // Keep the entire import in import * as X cases
            if (ts.isImportDeclaration(node)) {
                if (node.importClause && node.importClause.namedBindings) {
                    if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                        if (getColor(node.importClause.namedBindings) === 2 /* Black */) {
                            return keep(node);
                        }
                    }
                    else {
                        var survivingImports = [];
                        for (var i = 0; i < node.importClause.namedBindings.elements.length; i++) {
                            var importNode = node.importClause.namedBindings.elements[i];
                            if (getColor(importNode) === 2 /* Black */) {
                                survivingImports.push(importNode.getFullText(sourceFile));
                            }
                        }
                        var leadingTriviaWidth = node.getLeadingTriviaWidth();
                        var leadingTrivia = sourceFile.text.substr(node.pos, leadingTriviaWidth);
                        if (survivingImports.length > 0) {
                            if (node.importClause && getColor(node.importClause) === 2 /* Black */) {
                                return write(leadingTrivia + "import " + node.importClause.name.text + ", {" + survivingImports.join(',') + " } from" + node.moduleSpecifier.getFullText(sourceFile) + ";");
                            }
                            return write(leadingTrivia + "import {" + survivingImports.join(',') + " } from" + node.moduleSpecifier.getFullText(sourceFile) + ";");
                        }
                        else {
                            if (node.importClause && getColor(node.importClause) === 2 /* Black */) {
                                return write(leadingTrivia + "import " + node.importClause.name.text + " from" + node.moduleSpecifier.getFullText(sourceFile) + ";");
                            }
                        }
                    }
                }
                else {
                    if (node.importClause && getColor(node.importClause) === 2 /* Black */) {
                        return keep(node);
                    }
                }
            }
            if (shakeLevel === 2 /* ClassMembers */ && (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) && nodeOrChildIsBlack(node)) {
                var toWrite = node.getFullText();
                for (var i = node.members.length - 1; i >= 0; i--) {
                    var member = node.members[i];
                    if (getColor(member) === 2 /* Black */) {
                        // keep method
                        continue;
                    }
                    if (/^_(.*)Brand$/.test(member.name.getText())) {
                        // TODO: keep all members ending with `Brand`...
                        continue;
                    }
                    var pos = member.pos - node.pos;
                    var end = member.end - node.pos;
                    toWrite = toWrite.substring(0, pos) + toWrite.substring(end);
                }
                return write(toWrite);
            }
            if (ts.isFunctionDeclaration(node)) {
                // Do not go inside functions if they haven't been marked
                return;
            }
            node.forEachChild(writeMarkedNodes);
        }
        if (getColor(sourceFile) !== 2 /* Black */) {
            if (!nodeOrChildIsBlack(sourceFile)) {
                // none of the elements are reachable => don't write this file at all!
                return;
            }
            sourceFile.forEachChild(writeMarkedNodes);
            result += sourceFile.endOfFileToken.getFullText(sourceFile);
        }
        else {
            result = text;
        }
        writeFile(destination, result);
    });
    return result;
}
//#endregion
//#region Utils
/**
 * Returns the node's symbol and the `import` node (if the symbol resolved from a different module)
 */
function getRealNodeSymbol(checker, node) {
    /**
     * Returns the containing object literal property declaration given a possible name node, e.g. "a" in x = { "a": 1 }
     */
    /* @internal */
    function getContainingObjectLiteralElement(node) {
        switch (node.kind) {
            case ts.SyntaxKind.StringLiteral:
            case ts.SyntaxKind.NumericLiteral:
                if (node.parent.kind === ts.SyntaxKind.ComputedPropertyName) {
                    return ts.isObjectLiteralElement(node.parent.parent) ? node.parent.parent : undefined;
                }
            // falls through
            case ts.SyntaxKind.Identifier:
                return ts.isObjectLiteralElement(node.parent) &&
                    (node.parent.parent.kind === ts.SyntaxKind.ObjectLiteralExpression || node.parent.parent.kind === ts.SyntaxKind.JsxAttributes) &&
                    node.parent.name === node ? node.parent : undefined;
        }
        return undefined;
    }
    function getPropertySymbolsFromType(type, propName) {
        function getTextOfPropertyName(name) {
            function isStringOrNumericLiteral(node) {
                var kind = node.kind;
                return kind === ts.SyntaxKind.StringLiteral
                    || kind === ts.SyntaxKind.NumericLiteral;
            }
            switch (name.kind) {
                case ts.SyntaxKind.Identifier:
                    return name.text;
                case ts.SyntaxKind.StringLiteral:
                case ts.SyntaxKind.NumericLiteral:
                    return name.text;
                case ts.SyntaxKind.ComputedPropertyName:
                    return isStringOrNumericLiteral(name.expression) ? name.expression.text : undefined;
            }
        }
        var name = getTextOfPropertyName(propName);
        if (name && type) {
            var result = [];
            var symbol_1 = type.getProperty(name);
            if (type.flags & ts.TypeFlags.Union) {
                for (var _i = 0, _a = type.types; _i < _a.length; _i++) {
                    var t = _a[_i];
                    var symbol_2 = t.getProperty(name);
                    if (symbol_2) {
                        result.push(symbol_2);
                    }
                }
                return result;
            }
            if (symbol_1) {
                result.push(symbol_1);
                return result;
            }
        }
        return undefined;
    }
    function getPropertySymbolsFromContextualType(typeChecker, node) {
        var objectLiteral = node.parent;
        var contextualType = typeChecker.getContextualType(objectLiteral);
        return getPropertySymbolsFromType(contextualType, node.name);
    }
    // Go to the original declaration for cases:
    //
    //   (1) when the aliased symbol was declared in the location(parent).
    //   (2) when the aliased symbol is originating from an import.
    //
    function shouldSkipAlias(node, declaration) {
        if (node.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        if (node.parent === declaration) {
            return true;
        }
        switch (declaration.kind) {
            case ts.SyntaxKind.ImportClause:
            case ts.SyntaxKind.ImportEqualsDeclaration:
                return true;
            case ts.SyntaxKind.ImportSpecifier:
                return declaration.parent.kind === ts.SyntaxKind.NamedImports;
            default:
                return false;
        }
    }
    if (!ts.isShorthandPropertyAssignment(node)) {
        if (node.getChildCount() !== 0) {
            return [null, null];
        }
    }
    var symbol = checker.getSymbolAtLocation(node);
    var importNode = null;
    if (symbol && symbol.flags & ts.SymbolFlags.Alias && shouldSkipAlias(node, symbol.declarations[0])) {
        var aliased = checker.getAliasedSymbol(symbol);
        if (aliased.declarations) {
            // We should mark the import as visited
            importNode = symbol.declarations[0];
            symbol = aliased;
        }
    }
    if (symbol) {
        // Because name in short-hand property assignment has two different meanings: property name and property value,
        // using go-to-definition at such position should go to the variable declaration of the property value rather than
        // go to the declaration of the property name (in this case stay at the same position). However, if go-to-definition
        // is performed at the location of property access, we would like to go to definition of the property in the short-hand
        // assignment. This case and others are handled by the following code.
        if (node.parent.kind === ts.SyntaxKind.ShorthandPropertyAssignment) {
            symbol = checker.getShorthandAssignmentValueSymbol(symbol.valueDeclaration);
        }
        // If the node is the name of a BindingElement within an ObjectBindingPattern instead of just returning the
        // declaration the symbol (which is itself), we should try to get to the original type of the ObjectBindingPattern
        // and return the property declaration for the referenced property.
        // For example:
        //      import('./foo').then(({ b/*goto*/ar }) => undefined); => should get use to the declaration in file "./foo"
        //
        //      function bar<T>(onfulfilled: (value: T) => void) { //....}
        //      interface Test {
        //          pr/*destination*/op1: number
        //      }
        //      bar<Test>(({pr/*goto*/op1})=>{});
        if (ts.isPropertyName(node) && ts.isBindingElement(node.parent) && ts.isObjectBindingPattern(node.parent.parent) &&
            (node === (node.parent.propertyName || node.parent.name))) {
            var type = checker.getTypeAtLocation(node.parent.parent);
            if (type) {
                var propSymbols = getPropertySymbolsFromType(type, node);
                if (propSymbols) {
                    symbol = propSymbols[0];
                }
            }
        }
        // If the current location we want to find its definition is in an object literal, try to get the contextual type for the
        // object literal, lookup the property symbol in the contextual type, and use this for goto-definition.
        // For example
        //      interface Props{
        //          /*first*/prop1: number
        //          prop2: boolean
        //      }
        //      function Foo(arg: Props) {}
        //      Foo( { pr/*1*/op1: 10, prop2: false })
        var element = getContainingObjectLiteralElement(node);
        if (element && checker.getContextualType(element.parent)) {
            var propertySymbols = getPropertySymbolsFromContextualType(checker, element);
            if (propertySymbols) {
                symbol = propertySymbols[0];
            }
        }
    }
    if (symbol && symbol.declarations) {
        return [symbol, importNode];
    }
    return [null, null];
}
/** Get the token whose text contains the position */
function getTokenAtPosition(sourceFile, position, allowPositionInLeadingTrivia, includeEndPosition) {
    var current = sourceFile;
    outer: while (true) {
        // find the child that contains 'position'
        for (var _i = 0, _a = current.getChildren(); _i < _a.length; _i++) {
            var child = _a[_i];
            var start = allowPositionInLeadingTrivia ? child.getFullStart() : child.getStart(sourceFile, /*includeJsDoc*/ true);
            if (start > position) {
                // If this child begins after position, then all subsequent children will as well.
                break;
            }
            var end = child.getEnd();
            if (position < end || (position === end && (child.kind === ts.SyntaxKind.EndOfFileToken || includeEndPosition))) {
                current = child;
                continue outer;
            }
        }
        return current;
    }
}
