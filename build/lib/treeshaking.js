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
})(ShakeLevel || (exports.ShakeLevel = ShakeLevel = {}));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZXNoYWtpbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0cmVlc2hha2luZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBRzdCLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztBQUV2RixJQUFrQixVQUlqQjtBQUpELFdBQWtCLFVBQVU7SUFDM0IsNkNBQVMsQ0FBQTtJQUNULHFEQUFhLENBQUE7SUFDYiwyREFBZ0IsQ0FBQTtBQUNqQixDQUFDLEVBSmlCLFVBQVUsMEJBQVYsVUFBVSxRQUkzQjtBQUVELFNBQWdCLGtCQUFrQixDQUFDLFVBQXNCO0lBQ3hELFFBQVEsVUFBVSxFQUFFLENBQUM7UUFDcEI7WUFDQyxPQUFPLFdBQVcsQ0FBQztRQUNwQjtZQUNDLE9BQU8sZUFBZSxDQUFDO1FBQ3hCO1lBQ0MsT0FBTyxrQkFBa0IsQ0FBQztJQUM1QixDQUFDO0FBQ0YsQ0FBQztBQVRELGdEQVNDO0FBd0NELFNBQVMsZ0JBQWdCLENBQUMsT0FBNEIsRUFBRSxXQUF5QztJQUNoRyxLQUFLLE1BQU0sSUFBSSxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2hDLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDbkUsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDN0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMs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