"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.shake = exports.toStringShakeLevel = exports.ShakeLevel = void 0;
const fs = require("fs");
const path = require("path");
const TYPESCRIPT_LIB_FOLDER = path.dirname(require.resolve('typescript/lib/lib.d.ts'));
var ShakeLevel;
(function (ShakeLevel) {
    ShakeLevel[ShakeLevel["Files"] = 0] = "Files";
    ShakeLevel[ShakeLevel["InnerFile"] = 1] = "InnerFile";
    ShakeLevel[ShakeLevel["ClassMembers"] = 2] = "ClassMembers";
})(ShakeLevel = exports.ShakeLevel || (exports.ShakeLevel = {}));
function toStringShakeLevel(shakeLevel) {
    switch (shakeLevel) {
        case 0 /* ShakeLevel.Files */:
            return 'Files (0)';
        case 1 /* ShakeLevel.InnerFile */:
            return 'InnerFile (1)';
        case 2 /* ShakeLevel.ClassMembers */:
            return 'ClassMembers (2)';
    }
}
exports.toStringShakeLevel = toStringShakeLevel;
function printDiagnostics(options, diagnostics) {
    for (const diag of diagnostics) {
        let result = '';
        if (diag.file) {
            result += `${path.join(options.sourcesRoot, diag.file.fileName)}`;
        }
        if (diag.file && diag.start) {
            const location = diag.file.getLineAndCharacterOfPosition(diag.start);
            result += `:${location.line + 1}:${location.character}`;
        }
        result += ` - ` + JSON.stringify(diag.messageText);
        console.log(result);
    }
}
function shake(options) {
    const ts = require('typescript');
    const languageService = createTypeScriptLanguageService(ts, options);
    const program = languageService.getProgram();
    const globalDiagnostics = program.getGlobalDiagnostics();
    if (globalDiagnostics.length > 0) {
        printDiagnostics(options, globalDiagnostics);
        throw new Error(`Compilation Errors encountered.`);
    }
    const syntacticDiagnostics = program.getSyntacticDiagnostics();
    if (syntacticDiagnostics.length > 0) {
        printDiagnostics(options, syntacticDiagnostics);
        throw new Error(`Compilation Errors encountered.`);
    }
    const semanticDiagnostics = program.getSemanticDiagnostics();
    if (semanticDiagnostics.length > 0) {
        printDiagnostics(options, semanticDiagnostics);
        throw new Error(`Compilation Errors encountered.`);
    }
    markNodes(ts, languageService, options);
    return generateResult(ts, languageService, options.shakeLevel);
}
exports.shake = shake;
//#region Discovery, LanguageService & Setup
function createTypeScriptLanguageService(ts, options) {
    // Discover referenced files
    const FILES = discoverAndReadFiles(ts, options);
    // Add fake usage files
    options.inlineEntryPoints.forEach((inlineEntryPoint, index) => {
        FILES[`inlineEntryPoint.${index}.ts`] = inlineEntryPoint;
    });
    // Add additional typings
    options.typings.forEach((typing) => {
        const filePath = path.join(options.sourcesRoot, typing);
        FILES[typing] = fs.readFileSync(filePath).toString();
    });
    // Resolve libs
    const RESOLVED_LIBS = processLibFiles(ts, options);
    const compilerOptions = ts.convertCompilerOptionsFromJson(options.compilerOptions, options.sourcesRoot).options;
    const host = new TypeScriptLanguageServiceHost(ts, RESOLVED_LIBS, FILES, compilerOptions);
    return ts.createLanguageService(host);
}
/**
 * Read imports and follow them until all files have been handled
 */
function discoverAndReadFiles(ts, options) {
    const FILES = {};
    const in_queue = Object.create(null);
    const queue = [];
    const enqueue = (moduleId) => {
        // To make the treeshaker work on windows...
        moduleId = moduleId.replace(/\\/g, '/');
        if (in_queue[moduleId]) {
            return;
        }
        in_queue[moduleId] = true;
        queue.push(moduleId);
    };
    options.entryPoints.forEach((entryPoint) => enqueue(entryPoint));
    while (queue.length > 0) {
        const moduleId = queue.shift();
        const dts_filename = path.join(options.sourcesRoot, moduleId + '.d.ts');
        if (fs.existsSync(dts_filename)) {
            const dts_filecontents = fs.readFileSync(dts_filename).toString();
            FILES[`${moduleId}.d.ts`] = dts_filecontents;
            continue;
        }
        const js_filename = path.join(options.sourcesRoot, moduleId + '.js');
        if (fs.existsSync(js_filename)) {
            // This is an import for a .js file, so ignore it...
            continue;
        }
        let ts_filename;
        if (options.redirects[moduleId]) {
            ts_filename = path.join(options.sourcesRoot, options.redirects[moduleId] + '.ts');
        }
        else {
            ts_filename = path.join(options.sourcesRoot, moduleId + '.ts');
        }
        const ts_filecontents = fs.readFileSync(ts_filename).toString();
        const info = ts.preProcessFile(ts_filecontents);
        for (let i = info.importedFiles.length - 1; i >= 0; i--) {
            const importedFileName = info.importedFiles[i].fileName;
            if (options.importIgnorePattern.test(importedFileName)) {
                // Ignore vs/css! imports
                continue;
            }
            let importedModuleId = importedFileName;
            if (/(^\.\/)|(^\.\.\/)/.test(importedModuleId)) {
                importedModuleId = path.join(path.dirname(moduleId), importedModuleId);
            }
            enqueue(importedModuleId);
        }
        FILES[`${moduleId}.ts`] = ts_filecontents;
    }
    return FILES;
}
/**
 * Read lib files and follow lib references
 */
function processLibFiles(ts, options) {
    const stack = [...options.compilerOptions.lib];
    const result = {};
    while (stack.length > 0) {
        const filename = `lib.${stack.shift().toLowerCase()}.d.ts`;
        const key = `defaultLib:${filename}`;
        if (!result[key]) {
            // add this file
            const filepath = path.join(TYPESCRIPT_LIB_FOLDER, filename);
            const sourceText = fs.readFileSync(filepath).toString();
            result[key] = sourceText;
            // precess dependencies and "recurse"
            const info = ts.preProcessFile(sourceText);
            for (const ref of info.libReferenceDirectives) {
                stack.push(ref.fileName);
            }
        }
    }
    return result;
}
/**
 * A TypeScript language service host
 */
class TypeScriptLanguageServiceHost {
    _ts;
    _libs;
    _files;
    _compilerOptions;
    constructor(ts, libs, files, compilerOptions) {
        this._ts = ts;
        this._libs = libs;
        this._files = files;
        this._compilerOptions = compilerOptions;
    }
    // --- language service host ---------------
    getCompilationSettings() {
        return this._compilerOptions;
    }
    getScriptFileNames() {
        return ([]
            .concat(Object.keys(this._libs))
            .concat(Object.keys(this._files)));
    }
    getScriptVersion(_fileName) {
        return '1';
    }
    getProjectVersion() {
        return '1';
    }
    getScriptSnapshot(fileName) {
        if (this._files.hasOwnProperty(fileName)) {
            return this._ts.ScriptSnapshot.fromString(this._files[fileName]);
        }
        else if (this._libs.hasOwnProperty(fileName)) {
            return this._ts.ScriptSnapshot.fromString(this._libs[fileName]);
        }
        else {
            return this._ts.ScriptSnapshot.fromString('');
        }
    }
    getScriptKind(_fileName) {
        return this._ts.ScriptKind.TS;
    }
    getCurrentDirectory() {
        return '';
    }
    getDefaultLibFileName(_options) {
        return 'defaultLib:lib.d.ts';
    }
    isDefaultLibFileName(fileName) {
        return fileName === this.getDefaultLibFileName(this._compilerOptions);
    }
    readFile(path, _encoding) {
        return this._files[path] || this._libs[path];
    }
    fileExists(path) {
        return path in this._files || path in this._libs;
    }
}
//#endregion
//#region Tree Shaking
var NodeColor;
(function (NodeColor) {
    NodeColor[NodeColor["White"] = 0] = "White";
    NodeColor[NodeColor["Gray"] = 1] = "Gray";
    NodeColor[NodeColor["Black"] = 2] = "Black";
})(NodeColor || (NodeColor = {}));
function getColor(node) {
    return node.$$$color || 0 /* NodeColor.White */;
}
function setColor(node, color) {
    node.$$$color = color;
}
function markNeededSourceFile(node) {
    node.$$$neededSourceFile = true;
}
function isNeededSourceFile(node) {
    return Boolean(node.$$$neededSourceFile);
}
function nodeOrParentIsBlack(node) {
    while (node) {
        const color = getColor(node);
        if (color === 2 /* NodeColor.Black */) {
            return true;
        }
        node = node.parent;
    }
    return false;
}
function nodeOrChildIsBlack(node) {
    if (getColor(node) === 2 /* NodeColor.Black */) {
        return true;
    }
    for (const child of node.getChildren()) {
        if (nodeOrChildIsBlack(child)) {
            return true;
        }
    }
    return false;
}
function isSymbolWithDeclarations(symbol) {
    return !!(symbol && symbol.declarations);
}
function isVariableStatementWithSideEffects(ts, node) {
    if (!ts.isVariableStatement(node)) {
        return false;
    }
    let hasSideEffects = false;
    const visitNode = (node) => {
        if (hasSideEffects) {
            // no need to go on
            return;
        }
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            // TODO: assuming `createDecorator` and `refineServiceDecorator` calls are side-effect free
            const isSideEffectFree = /(createDecorator|refineServiceDecorator)/.test(node.expression.getText());
            if (!isSideEffectFree) {
                hasSideEffects = true;
            }
        }
        node.forEachChild(visitNode);
    };
    node.forEachChild(visitNode);
    return hasSideEffects;
}
function isStaticMemberWithSideEffects(ts, node) {
    if (!ts.isPropertyDeclaration(node)) {
        return false;
    }
    if (!node.modifiers) {
        return false;
    }
    if (!node.modifiers.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword)) {
        return false;
    }
    let hasSideEffects = false;
    const visitNode = (node) => {
        if (hasSideEffects) {
            // no need to go on
            return;
        }
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            hasSideEffects = true;
        }
        node.forEachChild(visitNode);
    };
    node.forEachChild(visitNode);
    return hasSideEffects;
}
function markNodes(ts, languageService, options) {
    const program = languageService.getProgram();
    if (!program) {
        throw new Error('Could not get program from language service');
    }
    if (options.shakeLevel === 0 /* ShakeLevel.Files */) {
        // Mark all source files Black
        program.getSourceFiles().forEach((sourceFile) => {
            setColor(sourceFile, 2 /* NodeColor.Black */);
        });
        return;
    }
    const black_queue = [];
    const gray_queue = [];
    const export_import_queue = [];
    const sourceFilesLoaded = {};
    function enqueueTopLevelModuleStatements(sourceFile) {
        sourceFile.forEachChild((node) => {
            if (ts.isImportDeclaration(node)) {
                if (!node.importClause && ts.isStringLiteral(node.moduleSpecifier)) {
                    setColor(node, 2 /* NodeColor.Black */);
                    enqueueImport(node, node.moduleSpecifier.text);
                }
                return;
            }
            if (ts.isExportDeclaration(node)) {
                if (!node.exportClause && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                    // export * from "foo";
                    setColor(node, 2 /* NodeColor.Black */);
                    enqueueImport(node, node.moduleSpecifier.text);
                }
                if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                    for (const exportSpecifier of node.exportClause.elements) {
                        export_import_queue.push(exportSpecifier);
                    }
                }
                return;
            }
            if (isVariableStatementWithSideEffects(ts, node)) {
                enqueue_black(node);
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
    /**
     * Return the parent of `node` which is an ImportDeclaration
     */
    function findParentImportDeclaration(node) {
        let _node = node;
        do {
            if (ts.isImportDeclaration(_node)) {
                return _node;
            }
            _node = _node.parent;
        } while (_node);
        return null;
    }
    function enqueue_gray(node) {
        if (nodeOrParentIsBlack(node) || getColor(node) === 1 /* NodeColor.Gray */) {
            return;
        }
        setColor(node, 1 /* NodeColor.Gray */);
        gray_queue.push(node);
    }
    function enqueue_black(node) {
        const previousColor = getColor(node);
        if (previousColor === 2 /* NodeColor.Black */) {
            return;
        }
        if (previousColor === 1 /* NodeColor.Gray */) {
            // remove from gray queue
            gray_queue.splice(gray_queue.indexOf(node), 1);
            setColor(node, 0 /* NodeColor.White */);
            // add to black queue
            enqueue_black(node);
            // move from one queue to the other
            // black_queue.push(node);
            // setColor(node, NodeColor.Black);
            return;
        }
        if (nodeOrParentIsBlack(node)) {
            return;
        }
        const fileName = node.getSourceFile().fileName;
        if (/^defaultLib:/.test(fileName) || /\.d\.ts$/.test(fileName)) {
            setColor(node, 2 /* NodeColor.Black */);
            return;
        }
        const sourceFile = node.getSourceFile();
        if (!sourceFilesLoaded[sourceFile.fileName]) {
            sourceFilesLoaded[sourceFile.fileName] = true;
            enqueueTopLevelModuleStatements(sourceFile);
        }
        if (ts.isSourceFile(node)) {
            return;
        }
        setColor(node, 2 /* NodeColor.Black */);
        black_queue.push(node);
        if (options.shakeLevel === 2 /* ShakeLevel.ClassMembers */ && (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node))) {
            const references = languageService.getReferencesAtPosition(node.getSourceFile().fileName, node.name.pos + node.name.getLeadingTriviaWidth());
            if (references) {
                for (let i = 0, len = references.length; i < len; i++) {
                    const reference = references[i];
                    const referenceSourceFile = program.getSourceFile(reference.fileName);
                    if (!referenceSourceFile) {
                        continue;
                    }
                    const referenceNode = getTokenAtPosition(ts, referenceSourceFile, reference.textSpan.start, false, false);
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
        const sourceFile = program.getSourceFile(filename);
        if (!sourceFile) {
            console.warn(`Cannot find source file ${filename}`);
            return;
        }
        // This source file should survive even if it is empty
        markNeededSourceFile(sourceFile);
        enqueue_black(sourceFile);
    }
    function enqueueImport(node, importText) {
        if (options.importIgnorePattern.test(importText)) {
            // this import should be ignored
            return;
        }
        const nodeSourceFile = node.getSourceFile();
        let fullPath;
        if (/(^\.\/)|(^\.\.\/)/.test(importText)) {
            fullPath = path.join(path.dirname(nodeSourceFile.fileName), importText) + '.ts';
        }
        else {
            fullPath = importText + '.ts';
        }
        enqueueFile(fullPath);
    }
    options.entryPoints.forEach(moduleId => enqueueFile(moduleId + '.ts'));
    // Add fake usage files
    options.inlineEntryPoints.forEach((_, index) => enqueueFile(`inlineEntryPoint.${index}.ts`));
    let step = 0;
    const checker = program.getTypeChecker();
    while (black_queue.length > 0 || gray_queue.length > 0) {
        ++step;
        let node;
        if (step % 100 === 0) {
            console.log(`Treeshaking - ${Math.floor(100 * step / (step + black_queue.length + gray_queue.length))}% - ${step}/${step + black_queue.length + gray_queue.length} (${black_queue.length}, ${gray_queue.length})`);
        }
        if (black_queue.length === 0) {
            for (let i = 0; i < gray_queue.length; i++) {
                const node = gray_queue[i];
                const nodeParent = node.parent;
                if ((ts.isClassDeclaration(nodeParent) || ts.isInterfaceDeclaration(nodeParent)) && nodeOrChildIsBlack(nodeParent)) {
                    gray_queue.splice(i, 1);
                    black_queue.push(node);
                    setColor(node, 2 /* NodeColor.Black */);
                    i--;
                }
            }
        }
        if (black_queue.length > 0) {
            node = black_queue.shift();
        }
        else {
            // only gray nodes remaining...
            break;
        }
        const nodeSourceFile = node.getSourceFile();
        const loop = (node) => {
            const symbols = getRealNodeSymbol(ts, checker, node);
            for (const { symbol, symbolImportNode } of symbols) {
                if (symbolImportNode) {
                    setColor(symbolImportNode, 2 /* NodeColor.Black */);
                    const importDeclarationNode = findParentImportDeclaration(symbolImportNode);
                    if (importDeclarationNode && ts.isStringLiteral(importDeclarationNode.moduleSpecifier)) {
                        enqueueImport(importDeclarationNode, importDeclarationNode.moduleSpecifier.text);
                    }
                }
                if (isSymbolWithDeclarations(symbol) && !nodeIsInItsOwnDeclaration(nodeSourceFile, node, symbol)) {
                    for (let i = 0, len = symbol.declarations.length; i < len; i++) {
                        const declaration = symbol.declarations[i];
                        if (ts.isSourceFile(declaration)) {
                            // Do not enqueue full source files
                            // (they can be the declaration of a module import)
                            continue;
                        }
                        if (options.shakeLevel === 2 /* ShakeLevel.ClassMembers */ && (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) && !isLocalCodeExtendingOrInheritingFromDefaultLibSymbol(ts, program, checker, declaration)) {
                            enqueue_black(declaration.name);
                            for (let j = 0; j < declaration.members.length; j++) {
                                const member = declaration.members[j];
                                const memberName = member.name ? member.name.getText() : null;
                                if (ts.isConstructorDeclaration(member)
                                    || ts.isConstructSignatureDeclaration(member)
                                    || ts.isIndexSignatureDeclaration(member)
                                    || ts.isCallSignatureDeclaration(member)
                                    || memberName === '[Symbol.iterator]'
                                    || memberName === '[Symbol.toStringTag]'
                                    || memberName === 'toJSON'
                                    || memberName === 'toString'
                                    || memberName === 'dispose' // TODO: keeping all `dispose` methods
                                    || /^_(.*)Brand$/.test(memberName || '') // TODO: keeping all members ending with `Brand`...
                                ) {
                                    enqueue_black(member);
                                }
                                if (isStaticMemberWithSideEffects(ts, member)) {
                                    enqueue_black(member);
                                }
                            }
                            // queue the heritage clauses
                            if (declaration.heritageClauses) {
                                for (const heritageClause of declaration.heritageClauses) {
                                    enqueue_black(heritageClause);
                                }
                            }
                        }
                        else {
                            enqueue_black(declaration);
                        }
                    }
                }
            }
            node.forEachChild(loop);
        };
        node.forEachChild(loop);
    }
    while (export_import_queue.length > 0) {
        const node = export_import_queue.shift();
        if (nodeOrParentIsBlack(node)) {
            continue;
        }
        const symbol = node.symbol;
        if (!symbol) {
            continue;
        }
        const aliased = checker.getAliasedSymbol(symbol);
        if (aliased.declarations && aliased.declarations.length > 0) {
            if (nodeOrParentIsBlack(aliased.declarations[0]) || nodeOrChildIsBlack(aliased.declarations[0])) {
                setColor(node, 2 /* NodeColor.Black */);
            }
        }
    }
}
function nodeIsInItsOwnDeclaration(nodeSourceFile, node, symbol) {
    for (let i = 0, len = symbol.declarations.length; i < len; i++) {
        const declaration = symbol.declarations[i];
        const declarationSourceFile = declaration.getSourceFile();
        if (nodeSourceFile === declarationSourceFile) {
            if (declaration.pos <= node.pos && node.end <= declaration.end) {
                return true;
            }
        }
    }
    return false;
}
function generateResult(ts, languageService, shakeLevel) {
    const program = languageService.getProgram();
    if (!program) {
        throw new Error('Could not get program from language service');
    }
    const result = {};
    const writeFile = (filePath, contents) => {
        result[filePath] = contents;
    };
    program.getSourceFiles().forEach((sourceFile) => {
        const fileName = sourceFile.fileName;
        if (/^defaultLib:/.test(fileName)) {
            return;
        }
        const destination = fileName;
        if (/\.d\.ts$/.test(fileName)) {
            if (nodeOrChildIsBlack(sourceFile)) {
                writeFile(destination, sourceFile.text);
            }
            return;
        }
        const text = sourceFile.text;
        let result = '';
        function keep(node) {
            result += text.substring(node.pos, node.end);
        }
        function write(data) {
            result += data;
        }
        function writeMarkedNodes(node) {
            if (getColor(node) === 2 /* NodeColor.Black */) {
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
                        if (getColor(node.importClause.namedBindings) === 2 /* NodeColor.Black */) {
                            return keep(node);
                        }
                    }
                    else {
                        const survivingImports = [];
                        for (const importNode of node.importClause.namedBindings.elements) {
                            if (getColor(importNode) === 2 /* NodeColor.Black */) {
                                survivingImports.push(importNode.getFullText(sourceFile));
                            }
                        }
                        const leadingTriviaWidth = node.getLeadingTriviaWidth();
                        const leadingTrivia = sourceFile.text.substr(node.pos, leadingTriviaWidth);
                        if (survivingImports.length > 0) {
                            if (node.importClause && node.importClause.name && getColor(node.importClause) === 2 /* NodeColor.Black */) {
                                return write(`${leadingTrivia}import ${node.importClause.name.text}, {${survivingImports.join(',')} } from${node.moduleSpecifier.getFullText(sourceFile)};`);
                            }
                            return write(`${leadingTrivia}import {${survivingImports.join(',')} } from${node.moduleSpecifier.getFullText(sourceFile)};`);
                        }
                        else {
                            if (node.importClause && node.importClause.name && getColor(node.importClause) === 2 /* NodeColor.Black */) {
                                return write(`${leadingTrivia}import ${node.importClause.name.text} from${node.moduleSpecifier.getFullText(sourceFile)};`);
                            }
                        }
                    }
                }
                else {
                    if (node.importClause && getColor(node.importClause) === 2 /* NodeColor.Black */) {
                        return keep(node);
                    }
                }
            }
            if (ts.isExportDeclaration(node)) {
                if (node.exportClause && node.moduleSpecifier && ts.isNamedExports(node.exportClause)) {
                    const survivingExports = [];
                    for (const exportSpecifier of node.exportClause.elements) {
                        if (getColor(exportSpecifier) === 2 /* NodeColor.Black */) {
                            survivingExports.push(exportSpecifier.getFullText(sourceFile));
                        }
                    }
                    const leadingTriviaWidth = node.getLeadingTriviaWidth();
                    const leadingTrivia = sourceFile.text.substr(node.pos, leadingTriviaWidth);
                    if (survivingExports.length > 0) {
                        return write(`${leadingTrivia}export {${survivingExports.join(',')} } from${node.moduleSpecifier.getFullText(sourceFile)};`);
                    }
                }
            }
            if (shakeLevel === 2 /* ShakeLevel.ClassMembers */ && (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) && nodeOrChildIsBlack(node)) {
                let toWrite = node.getFullText();
                for (let i = node.members.length - 1; i >= 0; i--) {
                    const member = node.members[i];
                    if (getColor(member) === 2 /* NodeColor.Black */ || !member.name) {
                        // keep method
                        continue;
                    }
                    const pos = member.pos - node.pos;
                    const end = member.end - node.pos;
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
        if (getColor(sourceFile) !== 2 /* NodeColor.Black */) {
            if (!nodeOrChildIsBlack(sourceFile)) {
                // none of the elements are reachable
                if (isNeededSourceFile(sourceFile)) {
                    // this source file must be written, even if nothing is used from it
                    // because there is an import somewhere for it.
                    // However, TS complains with empty files with the error "x" is not a module,
                    // so we will export a dummy variable
                    result = 'export const __dummy = 0;';
                }
                else {
                    // don't write this file at all!
                    return;
                }
            }
            else {
                sourceFile.forEachChild(writeMarkedNodes);
                result += sourceFile.endOfFileToken.getFullText(sourceFile);
            }
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
function isLocalCodeExtendingOrInheritingFromDefaultLibSymbol(ts, program, checker, declaration) {
    if (!program.isSourceFileDefaultLibrary(declaration.getSourceFile()) && declaration.heritageClauses) {
        for (const heritageClause of declaration.heritageClauses) {
            for (const type of heritageClause.types) {
                const symbol = findSymbolFromHeritageType(ts, checker, type);
                if (symbol) {
                    const decl = symbol.valueDeclaration || (symbol.declarations && symbol.declarations[0]);
                    if (decl && program.isSourceFileDefaultLibrary(decl.getSourceFile())) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}
function findSymbolFromHeritageType(ts, checker, type) {
    if (ts.isExpressionWithTypeArguments(type)) {
        return findSymbolFromHeritageType(ts, checker, type.expression);
    }
    if (ts.isIdentifier(type)) {
        const tmp = getRealNodeSymbol(ts, checker, type);
        return (tmp.length > 0 ? tmp[0].symbol : null);
    }
    if (ts.isPropertyAccessExpression(type)) {
        return findSymbolFromHeritageType(ts, checker, type.name);
    }
    return null;
}
class SymbolImportTuple {
    symbol;
    symbolImportNode;
    constructor(symbol, symbolImportNode) {
        this.symbol = symbol;
        this.symbolImportNode = symbolImportNode;
    }
}
/**
 * Returns the node's symbol and the `import` node (if the symbol resolved from a different module)
 */
function getRealNodeSymbol(ts, checker, node) {
    const getPropertySymbolsFromContextualType = ts.getPropertySymbolsFromContextualType;
    const getContainingObjectLiteralElement = ts.getContainingObjectLiteralElement;
    const getNameFromPropertyName = ts.getNameFromPropertyName;
    // Go to the original declaration for cases:
    //
    //   (1) when the aliased symbol was declared in the location(parent).
    //   (2) when the aliased symbol is originating from an import.
    //
    function shouldSkipAlias(node, declaration) {
        if (!ts.isShorthandPropertyAssignment(node) && node.kind !== ts.SyntaxKind.Identifier) {
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
            return [];
        }
    }
    const { parent } = node;
    let symbol = (ts.isShorthandPropertyAssignment(node)
        ? checker.getShorthandAssignmentValueSymbol(node)
        : checker.getSymbolAtLocation(node));
    let importNode = null;
    // If this is an alias, and the request came at the declaration location
    // get the aliased symbol instead. This allows for goto def on an import e.g.
    //   import {A, B} from "mod";
    // to jump to the implementation directly.
    if (symbol && symbol.flags & ts.SymbolFlags.Alias && symbol.declarations && shouldSkipAlias(node, symbol.declarations[0])) {
        const aliased = checker.getAliasedSymbol(symbol);
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
        if (ts.isPropertyName(node) && ts.isBindingElement(parent) && ts.isObjectBindingPattern(parent.parent) &&
            (node === (parent.propertyName || parent.name))) {
            const name = getNameFromPropertyName(node);
            const type = checker.getTypeAtLocation(parent.parent);
            if (name && type) {
                if (type.isUnion()) {
                    return generateMultipleSymbols(type, name, importNode);
                }
                else {
                    const prop = type.getProperty(name);
                    if (prop) {
                        symbol = prop;
                    }
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
        const element = getContainingObjectLiteralElement(node);
        if (element) {
            const contextualType = element && checker.getContextualType(element.parent);
            if (contextualType) {
                const propertySymbols = getPropertySymbolsFromContextualType(element, checker, contextualType, /*unionSymbolOk*/ false);
                if (propertySymbols) {
                    symbol = propertySymbols[0];
                }
            }
        }
    }
    if (symbol && symbol.declarations) {
        return [new SymbolImportTuple(symbol, importNode)];
    }
    return [];
    function generateMultipleSymbols(type, name, importNode) {
        const result = [];
        for (const t of type.types) {
            const prop = t.getProperty(name);
            if (prop && prop.declarations) {
                result.push(new SymbolImportTuple(prop, importNode));
            }
        }
        return result;
    }
}
/** Get the token whose text contains the position */
function getTokenAtPosition(ts, sourceFile, position, allowPositionInLeadingTrivia, includeEndPosition) {
    let current = sourceFile;
    outer: while (true) {
        // find the child that contains 'position'
        for (const child of current.getChildren()) {
            const start = allowPositionInLeadingTrivia ? child.getFullStart() : child.getStart(sourceFile, /*includeJsDoc*/ true);
            if (start > position) {
                // If this child begins after position, then all subsequent children will as well.
                break;
            }
            const end = child.getEnd();
            if (position < end || (position === end && (child.kind === ts.SyntaxKind.EndOfFileToken || includeEndPosition))) {
                current = child;
                continue outer;
            }
        }
        return current;
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZXNoYWtpbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0cmVlc2hha2luZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBRzdCLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztBQUV2RixJQUFrQixVQUlqQjtBQUpELFdBQWtCLFVBQVU7SUFDM0IsNkNBQVMsQ0FBQTtJQUNULHFEQUFhLENBQUE7SUFDYiwyREFBZ0IsQ0FBQTtBQUNqQixDQUFDLEVBSmlCLFVBQVUsR0FBVixrQkFBVSxLQUFWLGtCQUFVLFFBSTNCO0FBRUQsU0FBZ0Isa0JBQWtCLENBQUMsVUFBc0I7SUFDeEQsUUFBUSxVQUFVLEVBQUU7UUFDbkI7WUFDQyxPQUFPLFdBQVcsQ0FBQztRQUNwQjtZQUNDLE9BQU8sZUFBZSxDQUFDO1FBQ3hCO1lBQ0MsT0FBTyxrQkFBa0IsQ0FBQztLQUMzQjtBQUNGLENBQUM7QUFURCxnREFTQztBQXdDRCxTQUFTLGdCQUFnQixDQUFDLE9BQTRCLEVBQUUsV0FBeUM7SUFDaEcsS0FBSyxNQUFNLElBQUksSUFBSSxXQUFXLEVBQUU7UUFDL0IsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtZQUNkLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7U0FDbEU7UUFDRCxJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUM1QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNy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