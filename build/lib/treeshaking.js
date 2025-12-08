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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZXNoYWtpbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0cmVlc2hha2luZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBRzdCLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztBQUV2RixJQUFrQixVQUlqQjtBQUpELFdBQWtCLFVBQVU7SUFDM0IsNkNBQVMsQ0FBQTtJQUNULHFEQUFhLENBQUE7SUFDYiwyREFBZ0IsQ0FBQTtBQUNqQixDQUFDLEVBSmlCLFVBQVUsMEJBQVYsVUFBVSxRQUkzQjtBQUVELFNBQWdCLGtCQUFrQixDQUFDLFVBQXNCO0lBQ3hELFFBQVEsVUFBVSxFQUFFO1FBQ25CO1lBQ0MsT0FBTyxXQUFXLENBQUM7UUFDcEI7WUFDQyxPQUFPLGVBQWUsQ0FBQztRQUN4QjtZQUNDLE9BQU8sa0JBQWtCLENBQUM7S0FDM0I7QUFDRixDQUFDO0FBVEQsZ0RBU0M7QUF3Q0QsU0FBUyxnQkFBZ0IsQ0FBQyxPQUE0QixFQUFFLFdBQXlDO0lBQ2hHLEtBQUssTUFBTSxJQUFJLElBQUksV0FBVyxFQUFFO1FBQy9CLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDZCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1NBQ2xFO1FBQ0QsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDNUIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDckUsTUFBTSxJQUFJLElBQUksUUFBUSxDQUFDLElBQUksR0FBRyxDQUFDLElBQUksUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1NBQ3hEO1FBQ0QsTUFBTSxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBQ3BCO0FBQ0YsQ0FBQztBQUVELFNBQWdCLEtBQUssQ0FBQyxPQUE0QjtJQUNqRCxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFnQyxDQUFDO0lBQ2hFLE1BQU0sZUFBZSxHQUFHLCtCQUErQixDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNyRSxNQUFNLE9BQU8sR0FBRyxlQUFlLENBQUMsVUFBVSxFQUFHLENBQUM7SUFFOUMsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztJQUN6RCxJQUFJLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDakMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDN0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0tBQ25EO0lBRUQsTUFBTSxvQkFBb0IsR0FBRyxPQUFPLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztJQUMvRCxJQUFJLG9CQUFvQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDcEMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDaEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0tBQ25EO0lBRUQsTUFBTSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztJQUM3RCxJQUFJLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDbkMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFDL0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0tBQ25EO0lBRUQsU0FBUyxDQUFDLEVBQUUsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFFeEMsT0FBTyxjQUFjLENBQUMsRUFBRSxFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDaEUsQ0FBQztBQTFCRCxzQkEwQkM7QUFFRCw0Q0FBNEM7QUFDNUMsU0FBUywrQkFBK0IsQ0FBQyxFQUErQixFQUFFLE9BQTRCO0lBQ3JHLDRCQUE0QjtJQUM1QixNQUFNLEtBQUssR0FBRyxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFFaEQsdUJBQXVCO0lBQ3ZCLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUM3RCxLQUFLLENBQUMsb0JBQW9CLEtBQUssS0FBSyxDQUFDLEdBQUcsZ0JBQWdCLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCx5QkFBeUI7SUFDekIsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtRQUNsQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDeEQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDdEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxlQUFlO0lBQ2YsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUVuRCxNQUFNLGVBQWUsR0FBRyxFQUFFLENBQUMsOEJBQThCLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxDQUFDO0lBRWhILE1BQU0sSUFBSSxHQUFHLElBQUksNkJBQTZCLENBQUMsRUFBRSxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDMUYsT0FBTyxFQUFFLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDdkMsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxvQkFBb0IsQ0FBQyxFQUErQixFQUFFLE9BQTRCO0lBQzFGLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztJQUUzQixNQUFNLFFBQVEsR0FBa0MsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNwRSxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFFM0IsTUFBTSxPQUFPLEdBQUcsQ0FBQyxRQUFnQixFQUFFLEVBQUU7UUFDcEMsNENBQTRDO1FBQzVDLFFBQVEsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4QyxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUN2QixPQUFPO1NBQ1A7UUFDRCxRQUFRLENBQUMsUUFBUSxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQzFCLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdEIsQ0FBQyxDQUFDO0lBRUYsT0FBTyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBRWpFLE9BQU8sS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDeEIsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEtBQUssRUFBRyxDQUFDO1FBQ2hDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxRQUFRLEdBQUcsT0FBTyxDQUFDLENBQUM7UUFDeEUsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQ2hDLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsRSxLQUFLLENBQUMsR0FBRyxRQUFRLE9BQU8sQ0FBQyxHQUFHLGdCQUFnQixDQUFDO1lBQzdDLFNBQVM7U0FDVDtRQUVELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFDckUsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxFQUFFO1lBQy9CLG9EQUFvRDtZQUNwRCxTQUFTO1NBQ1Q7UUFFRCxJQUFJLFdBQW1CLENBQUM7UUFDeEIsSUFBSSxPQUFPLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQ2hDLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztTQUNsRjthQUFNO1lBQ04sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUM7U0FDL0Q7UUFDRCxNQUFNLGVBQWUsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2hFLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDaEQsS0FBSyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN4RCxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1lBRXhELElBQUksT0FBTyxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFO2dCQUN2RCx5QkFBeUI7Z0JBQ3pCLFNBQVM7YUFDVDtZQUVELElBQUksZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUM7WUFDeEMsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsRUFBRTtnQkFDL0MsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLENBQUM7YUFDdkU7WUFDRCxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztTQUMxQjtRQUVELEtBQUssQ0FBQyxHQUFHLFFBQVEsS0FBSyxDQUFDLEdBQUcsZUFBZSxDQUFDO0tBQzFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLGVBQWUsQ0FBQyxFQUErQixFQUFFLE9BQTRCO0lBRXJGLE1BQU0sS0FBSyxHQUFhLENBQUMsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3pELE1BQU0sTUFBTSxHQUFZLEVBQUUsQ0FBQztJQUUzQixPQUFPLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQ3hCLE1BQU0sUUFBUSxHQUFHLE9BQU8sS0FBSyxDQUFDLEtBQUssRUFBRyxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUM7UUFDNUQsTUFBTSxHQUFHLEdBQUcsY0FBYyxRQUFRLEVBQUUsQ0FBQztRQUNyQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ2pCLGdCQUFnQjtZQUNoQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzVELE1BQU0sVUFBVSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDeEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLFVBQVUsQ0FBQztZQUV6QixxQ0FBcUM7WUFDckMsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMzQyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksQ0FBQyxzQkFBc0IsRUFBRTtnQkFDOUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7YUFDekI7U0FDRDtLQUNEO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBS0Q7O0dBRUc7QUFDSCxNQUFNLDZCQUE2QjtJQUVqQixHQUFHLENBQThCO0lBQ2pDLEtBQUssQ0FBVTtJQUNmLE1BQU0sQ0FBVztJQUNqQixnQkFBZ0IsQ0FBcUI7SUFFdEQsWUFBWSxFQUErQixFQUFFLElBQWEsRUFBRSxLQUFlLEVBQUUsZUFBbUM7UUFDL0csSUFBSSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNsQixJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNwQixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxDQUFDO0lBQ3pDLENBQUM7SUFFRCw0Q0FBNEM7SUFFNUMsc0JBQXNCO1FBQ3JCLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDO0lBQzlCLENBQUM7SUFDRCxrQkFBa0I7UUFDakIsT0FBTyxDQUNMLEVBQWU7YUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDL0IsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQ2xDLENBQUM7SUFDSCxDQUFDO0lBQ0QsZ0JBQWdCLENBQUMsU0FBaUI7UUFDakMsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDO0lBQ0QsaUJBQWlCO1FBQ2hCLE9BQU8sR0FBRyxDQUFDO0lBQ1osQ0FBQztJQUNELGlCQUFpQixDQUFDLFFBQWdCO1FBQ2pDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDekMsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1NBQ2pFO2FBQU0sSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUMvQyxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7U0FDaEU7YUFBTTtZQUNOLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1NBQzlDO0lBQ0YsQ0FBQztJQUNELGFBQWEsQ0FBQyxTQUFpQjtRQUM5QixPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBQ0QsbUJBQW1CO1FBQ2xCLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUNELHFCQUFxQixDQUFDLFFBQTRCO1FBQ2pELE9BQU8scUJBQXFCLENBQUM7SUFDOUIsQ0FBQztJQUNELG9CQUFvQixDQUFDLFFBQWdCO1FBQ3BDLE9BQU8sUUFBUSxLQUFLLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBQ0QsUUFBUSxDQUFDLElBQVksRUFBRSxTQUFrQjtRQUN4QyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBQ0QsVUFBVSxDQUFDLElBQVk7UUFDdEIsT0FBTyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNsRCxDQUFDO0NBQ0Q7QUFDRCxZQUFZO0FBRVosc0JBQXNCO0FBRXRCLElBQVcsU0FJVjtBQUpELFdBQVcsU0FBUztJQUNuQiwyQ0FBUyxDQUFBO0lBQ1QseUNBQVEsQ0FBQTtJQUNSLDJDQUFTLENBQUE7QUFDVixDQUFDLEVBSlUsU0FBUyxLQUFULFNBQVMsUUFJbkI7QUFFRCxTQUFTLFFBQVEsQ0FBQyxJQUFhO0lBQzlCLE9BQWEsSUFBSyxDQUFDLFFBQVEsMkJBQW1CLENBQUM7QUFDaEQsQ0FBQztBQUNELFNBQVMsUUFBUSxDQUFDLElBQWEsRUFBRSxLQUFnQjtJQUMxQyxJQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztBQUM5QixDQUFDO0FBQ0QsU0FBUyxvQkFBb0IsQ0FBQyxJQUFtQjtJQUMxQyxJQUFLLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO0FBQ3hDLENBQUM7QUFDRCxTQUFTLGtCQUFrQixDQUFDLElBQW1CO0lBQzlDLE9BQU8sT0FBTyxDQUFPLElBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBQ2pELENBQUM7QUFDRCxTQUFTLG1CQUFtQixDQUFDLElBQWE7SUFDekMsT0FBTyxJQUFJLEVBQUU7UUFDWixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0IsSUFBSSxLQUFLLDRCQUFvQixFQUFFO1lBQzlCLE9BQU8sSUFBSSxDQUFDO1NBQ1o7UUFDRCxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztLQUNuQjtJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUNELFNBQVMsa0JBQWtCLENBQUMsSUFBYTtJQUN4QyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsNEJBQW9CLEVBQUU7UUFDdkMsT0FBTyxJQUFJLENBQUM7S0FDWjtJQUNELEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFO1FBQ3ZDLElBQUksa0JBQWtCLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDOUIsT0FBTyxJQUFJLENBQUM7U0FDWjtLQUNEO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxNQUFvQztJQUNyRSxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDMUMsQ0FBQztBQUVELFNBQVMsa0NBQWtDLENBQUMsRUFBK0IsRUFBRSxJQUFhO0lBQ3pGLElBQUksQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDbEMsT0FBTyxLQUFLLENBQUM7S0FDYjtJQUNELElBQUksY0FBYyxHQUFHLEtBQUssQ0FBQztJQUMzQixNQUFNLFNBQVMsR0FBRyxDQUFDLElBQWEsRUFBRSxFQUFFO1FBQ25DLElBQUksY0FBYyxFQUFFO1lBQ25CLG1CQUFtQjtZQUNuQixPQUFPO1NBQ1A7UUFDRCxJQUFJLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzFELDJGQUEyRjtZQUMzRixNQUFNLGdCQUFnQixHQUFHLDBDQUEwQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDcEcsSUFBSSxDQUFDLGdCQUFnQixFQUFFO2dCQUN0QixjQUFjLEdBQUcsSUFBSSxDQUFDO2FBQ3RCO1NBQ0Q7UUFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzlCLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDN0IsT0FBTyxjQUFjLENBQUM7QUFDdkIsQ0FBQztBQUVELFNBQVMsNkJBQTZCLENBQUMsRUFBK0IsRUFBRSxJQUFzQztJQUM3RyxJQUFJLENBQUMsRUFBRSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ3BDLE9BQU8sS0FBSyxDQUFDO0tBQ2I7SUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtRQUNwQixPQUFPLEtBQUssQ0FBQztLQUNiO0lBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFO1FBQzFFLE9BQU8sS0FBSyxDQUFDO0tBQ2I7SUFDRCxJQUFJLGNBQWMsR0FBRyxLQUFLLENBQUM7SUFDM0IsTUFBTSxTQUFTLEdBQUcsQ0FBQyxJQUFhLEVBQUUsRUFBRTtRQUNuQyxJQUFJLGNBQWMsRUFBRTtZQUNuQixtQkFBbUI7WUFDbkIsT0FBTztTQUNQO1FBQ0QsSUFBSSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUMxRCxjQUFjLEdBQUcsSUFBSSxDQUFDO1NBQ3RCO1FBQ0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM5QixDQUFDLENBQUM7SUFDRixJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzdCLE9BQU8sY0FBYyxDQUFDO0FBQ3ZCLENBQUM7QUFFRCxTQUFTLFNBQVMsQ0FBQyxFQUErQixFQUFFLGVBQW1DLEVBQUUsT0FBNEI7SUFDcEgsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQzdDLElBQUksQ0FBQyxPQUFPLEVBQUU7UUFDYixNQUFNLElBQUksS0FBSyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7S0FDL0Q7SUFFRCxJQUFJLE9BQU8sQ0FBQyxVQUFVLDZCQUFxQixFQUFFO1FBQzVDLDhCQUE4QjtRQUM5QixPQUFPLENBQUMsY0FBYyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUU7WUFDL0MsUUFBUSxDQUFDLFVBQVUsMEJBQWtCLENBQUM7UUFDdkMsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPO0tBQ1A7SUFFRCxNQUFNLFdBQVcsR0FBYyxFQUFFLENBQUM7SUFDbEMsTUFBTSxVQUFVLEdBQWMsRUFBRSxDQUFDO0lBQ2pDLE1BQU0sbUJBQW1CLEdBQWMsRUFBRSxDQUFDO0lBQzFDLE1BQU0saUJBQWlCLEdBQW9DLEVBQUUsQ0FBQztJQUU5RCxTQUFTLCtCQUErQixDQUFDLFVBQXlCO1FBRWpFLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFhLEVBQUUsRUFBRTtZQUV6QyxJQUFJLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUU7b0JBQ25FLFFBQVEsQ0FBQyxJQUFJLDBCQUFrQixDQUFDO29CQUNoQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQy9DO2dCQUNELE9BQU87YUFDUDtZQUVELElBQUksRUFBRSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNqQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsZUFBZSxJQUFJLEVBQUUsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFO29CQUMzRix1QkFBdUI7b0JBQ3ZCLFFBQVEsQ0FBQyxJQUFJLDBCQUFrQixDQUFDO29CQUNoQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQy9DO2dCQUNELElBQUksSUFBSSxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRTtvQkFDOUQsS0FBSyxNQUFNLGVBQWUsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRTt3QkFDekQsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO3FCQUMxQztpQkFDRDtnQkFDRCxPQUFPO2FBQ1A7WUFFRCxJQUFJLGtDQUFrQyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRTtnQkFDakQsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ3BCO1lBRUQsSUFDQyxFQUFFLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDO21CQUMzQixFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQzttQkFDdEIsRUFBRSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7bUJBQ25DLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFDN0I7Z0JBQ0QsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ3BCO1lBRUQsSUFBSSxFQUFFLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQ3ZDLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUU7b0JBQ2hELGdEQUFnRDtvQkFDaEQsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO2lCQUNwQjthQUNEO1FBRUYsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTLDJCQUEyQixDQUFDLElBQW9CO1FBQ3hELElBQUksS0FBSyxHQUFZLElBQUksQ0FBQztRQUMxQixHQUFHO1lBQ0YsSUFBSSxFQUFFLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQ2xDLE9BQU8sS0FBSyxDQUFDO2FBQ2I7WUFDRCxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztTQUNyQixRQUFRLEtBQUssRUFBRTtRQUNoQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxTQUFTLFlBQVksQ0FBQyxJQUFhO1FBQ2xDLElBQUksbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQywyQkFBbUIsRUFBRTtZQUNuRSxPQUFPO1NBQ1A7UUFDRCxRQUFRLENBQUMsSUFBSSx5QkFBaUIsQ0FBQztRQUMvQixVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxTQUFTLGFBQWEsQ0FBQyxJQUFhO1FBQ25DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVyQyxJQUFJLGFBQWEsNEJBQW9CLEVBQUU7WUFDdEMsT0FBTztTQUNQO1FBRUQsSUFBSSxhQUFhLDJCQUFtQixFQUFFO1lBQ3JDLHlCQUF5QjtZQUN6QixVQUFVLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0MsUUFBUSxDQUFDLElBQUksMEJBQWtCLENBQUM7WUFFaEMscUJBQXFCO1lBQ3JCLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVwQixtQ0FBbUM7WUFDbkMsMEJBQTBCO1lBQzFCLG1DQUFtQztZQUNuQyxPQUFPO1NBQ1A7UUFFRCxJQUFJLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzlCLE9BQU87U0FDUDtRQUVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxRQUFRLENBQUM7UUFDL0MsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDL0QsUUFBUSxDQUFDLElBQUksMEJBQWtCLENBQUM7WUFDaEMsT0FBTztTQUNQO1FBRUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3hDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDNUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxHQUFHLElBQUksQ0FBQztZQUM5QywrQkFBK0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztTQUM1QztRQUVELElBQUksRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUMxQixPQUFPO1NBQ1A7UUFFRCxRQUFRLENBQUMsSUFBSSwwQkFBa0IsQ0FBQztRQUNoQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXZCLElBQUksT0FBTyxDQUFDLFVBQVUsb0NBQTRCLElBQUksQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUU7WUFDek8sTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUM7WUFDN0ksSUFBSSxVQUFVLEVBQUU7Z0JBQ2YsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDdEQsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNoQyxNQUFNLG1CQUFtQixHQUFHLE9BQVEsQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUN2RSxJQUFJLENBQUMsbUJBQW1CLEVBQUU7d0JBQ3pCLFNBQVM7cUJBQ1Q7b0JBRUQsTUFBTSxhQUFhLEdBQUcsa0JBQWtCLENBQUMsRUFBRSxFQUFFLG1CQUFtQixFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDMUcsSUFDQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQzsyQkFDekMsRUFBRSxDQUFDLHFCQUFxQixDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUM7MkJBQzlDLEVBQUUsQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQzsyQkFDdEMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEVBQ3hDO3dCQUNELFlBQVksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7cUJBQ25DO2lCQUNEO2FBQ0Q7U0FDRDtJQUNGLENBQUM7SUFFRCxTQUFTLFdBQVcsQ0FBQyxRQUFnQjtRQUNwQyxNQUFNLFVBQVUsR0FBRyxPQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDaEIsT0FBTyxDQUFDLElBQUksQ0FBQywyQkFBMkIsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUNwRCxPQUFPO1NBQ1A7UUFDRCxzREFBc0Q7UUFDdEQsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDakMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxTQUFTLGFBQWEsQ0FBQyxJQUFhLEVBQUUsVUFBa0I7UUFDdkQsSUFBSSxPQUFPLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQ2pELGdDQUFnQztZQUNoQyxPQUFPO1NBQ1A7UUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDNUMsSUFBSSxRQUFnQixDQUFDO1FBQ3JCLElBQUksbUJBQW1CLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQ3pDLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxHQUFHLEtBQUssQ0FBQztTQUNoRjthQUFNO1lBQ04sUUFBUSxHQUFHLFVBQVUsR0FBRyxLQUFLLENBQUM7U0FDOUI7UUFDRCxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUVELE9BQU8sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3ZFLHVCQUF1QjtJQUN2QixPQUFPLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLG9CQUFvQixLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFFN0YsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBRWIsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3pDLE9BQU8sV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDdkQsRUFBRSxJQUFJLENBQUM7UUFDUCxJQUFJLElBQWEsQ0FBQztRQUVsQixJQUFJLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxFQUFFO1lBQ3JCLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksR0FBRyxXQUFXLENBQUMsTUFBTSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLElBQUksSUFBSSxJQUFJLEdBQUcsV0FBVyxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsTUFBTSxLQUFLLFdBQVcsQ0FBQyxNQUFNLEtBQUssVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7U0FDbk47UUFFRCxJQUFJLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQzdCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUMzQyxNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7Z0JBQy9CLElBQUksQ0FBQyxFQUFFLENBQUMsa0JBQWtCLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLHNCQUFzQixDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksa0JBQWtCLENBQUMsVUFBVSxDQUFDLEVBQUU7b0JBQ25ILFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUN4QixXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN2QixRQUFRLENBQUMsSUFBSSwwQkFBa0IsQ0FBQztvQkFDaEMsQ0FBQyxFQUFFLENBQUM7aUJBQ0o7YUFDRDtTQUNEO1FBRUQsSUFBSSxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUMzQixJQUFJLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRyxDQUFDO1NBQzVCO2FBQU07WUFDTiwrQkFBK0I7WUFDL0IsTUFBTTtTQUNOO1FBQ0QsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRTVDLE1BQU0sSUFBSSxHQUFHLENBQUMsSUFBYSxFQUFFLEVBQUU7WUFDOUIsTUFBTSxPQUFPLEdBQUcsaUJBQWlCLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNyRCxLQUFLLE1BQU0sRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxPQUFPLEVBQUU7Z0JBQ25ELElBQUksZ0JBQWdCLEVBQUU7b0JBQ3JCLFFBQVEsQ0FBQyxnQkFBZ0IsMEJBQWtCLENBQUM7b0JBQzVDLE1BQU0scUJBQXFCLEdBQUcsMkJBQTJCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztvQkFDNUUsSUFBSSxxQkFBcUIsSUFBSSxFQUFFLENBQUMsZUFBZSxDQUFDLHFCQUFxQixDQUFDLGVBQWUsQ0FBQyxFQUFFO3dCQUN2RixhQUFhLENBQUMscUJBQXFCLEVBQUUscUJBQXFCLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO3FCQUNqRjtpQkFDRDtnQkFFRCxJQUFJLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsY0FBYyxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRTtvQkFDakcsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7d0JBQy9ELE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzNDLElBQUksRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsRUFBRTs0QkFDakMsbUNBQW1DOzRCQUNuQyxtREFBbUQ7NEJBQ25ELFNBQVM7eUJBQ1Q7d0JBRUQsSUFBSSxPQUFPLENBQUMsVUFBVSxvQ0FBNEIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLG9EQUFvRCxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsQ0FBQyxFQUFFOzRCQUNqTyxhQUFhLENBQUMsV0FBVyxDQUFDLElBQUssQ0FBQyxDQUFDOzRCQUVqQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0NBQ3BELE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0NBQ3RDLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztnQ0FDOUQsSUFDQyxFQUFFLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDO3VDQUNoQyxFQUFFLENBQUMsK0JBQStCLENBQUMsTUFBTSxDQUFDO3VDQUMxQyxFQUFFLENBQUMsMkJBQTJCLENBQUMsTUFBTSxDQUFDO3VDQUN0QyxFQUFFLENBQUMsMEJBQTBCLENBQUMsTUFBTSxDQUFDO3VDQUNyQyxVQUFVLEtBQUssbUJBQW1CO3VDQUNsQyxVQUFVLEtBQUssc0JBQXNCO3VDQUNyQyxVQUFVLEtBQUssUUFBUTt1Q0FDdkIsVUFBVSxLQUFLLFVBQVU7dUNBQ3pCLFVBQVUsS0FBSyxTQUFTLENBQUEsc0NBQXNDO3VDQUM5RCxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUMsQ0FBQyxtREFBbUQ7a0NBQzNGO29DQUNELGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztpQ0FDdEI7Z0NBRUQsSUFBSSw2QkFBNkIsQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLEVBQUU7b0NBQzlDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztpQ0FDdEI7NkJBQ0Q7NEJBRUQsNkJBQTZCOzRCQUM3QixJQUFJLFdBQVcsQ0FBQyxlQUFlLEVBQUU7Z0NBQ2hDLEtBQUssTUFBTSxjQUFjLElBQUksV0FBVyxDQUFDLGVBQWUsRUFBRTtvQ0FDekQsYUFBYSxDQUFDLGNBQWMsQ0FBQyxDQUFDO2lDQUM5Qjs2QkFDRDt5QkFDRDs2QkFBTTs0QkFDTixhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7eUJBQzNCO3FCQUNEO2lCQUNEO2FBQ0Q7WUFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pCLENBQUMsQ0FBQztRQUNGLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDeEI7SUFFRCxPQUFPLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDdEMsTUFBTSxJQUFJLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxFQUFHLENBQUM7UUFDMUMsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUM5QixTQUFTO1NBQ1Q7UUFDRCxNQUFNLE1BQU0sR0FBZ0MsSUFBSyxDQUFDLE1BQU0sQ0FBQztRQUN6RCxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ1osU0FBUztTQUNUO1FBQ0QsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pELElBQUksT0FBTyxDQUFDLFlBQVksSUFBSSxPQUFPLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDNUQsSUFBSSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksa0JBQWtCLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUNoRyxRQUFRLENBQUMsSUFBSSwwQkFBa0IsQ0FBQzthQUNoQztTQUNEO0tBQ0Q7QUFDRixDQUFDO0FBRUQsU0FBUyx5QkFBeUIsQ0FBQyxjQUE2QixFQUFFLElBQWEsRUFBRSxNQUFzRDtJQUN0SSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUMvRCxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0scUJBQXFCLEdBQUcsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBRTFELElBQUksY0FBYyxLQUFLLHFCQUFxQixFQUFFO1lBQzdDLElBQUksV0FBVyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLElBQUksV0FBVyxDQUFDLEdBQUcsRUFBRTtnQkFDL0QsT0FBTyxJQUFJLENBQUM7YUFDWjtTQUNEO0tBQ0Q7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxFQUErQixFQUFFLGVBQW1DLEVBQUUsVUFBc0I7SUFDbkgsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQzdDLElBQUksQ0FBQyxPQUFPLEVBQUU7UUFDYixNQUFNLElBQUksS0FBSyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7S0FDL0Q7SUFFRCxNQUFNLE1BQU0sR0FBdUIsRUFBRSxDQUFDO0lBQ3RDLE1BQU0sU0FBUyxHQUFHLENBQUMsUUFBZ0IsRUFBRSxRQUFnQixFQUFRLEVBQUU7UUFDOUQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLFFBQVEsQ0FBQztJQUM3QixDQUFDLENBQUM7SUFFRixPQUFPLENBQUMsY0FBYyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUU7UUFDL0MsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQztRQUNyQyxJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDbEMsT0FBTztTQUNQO1FBQ0QsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDO1FBQzdCLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUM5QixJQUFJLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxFQUFFO2dCQUNuQyxTQUFTLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUN4QztZQUNELE9BQU87U0FDUDtRQUVELE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUM7UUFDN0IsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBRWhCLFNBQVMsSUFBSSxDQUFDLElBQWE7WUFDMUIsTUFBTSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUNELFNBQVMsS0FBSyxDQUFDLElBQVk7WUFDMUIsTUFBTSxJQUFJLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxJQUFhO1lBQ3RDLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyw0QkFBb0IsRUFBRTtnQkFDdkMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDbEI7WUFFRCwyQ0FBMkM7WUFDM0MsSUFBSSxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDakMsSUFBSSxFQUFFLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFO29CQUNuSCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDbEI7Z0JBRUQsSUFBSSxFQUFFLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUU7b0JBQzdELE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2lCQUNsQjthQUNEO1lBRUQsZ0RBQWdEO1lBQ2hELElBQUksRUFBRSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNqQyxJQUFJLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUU7b0JBQ3pELElBQUksRUFBRSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLEVBQUU7d0JBQzFELElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLDRCQUFvQixFQUFFOzRCQUNsRSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzt5QkFDbEI7cUJBQ0Q7eUJBQU07d0JBQ04sTUFBTSxnQkFBZ0IsR0FBYSxFQUFFLENBQUM7d0JBQ3RDLEtBQUssTUFBTSxVQUFVLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFOzRCQUNsRSxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsNEJBQW9CLEVBQUU7Z0NBQzdDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7NkJBQzFEO3lCQUNEO3dCQUNELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7d0JBQ3hELE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsQ0FBQzt3QkFDM0UsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFOzRCQUNoQyxJQUFJLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsNEJBQW9CLEVBQUU7Z0NBQ25HLE9BQU8sS0FBSyxDQUFDLEdBQUcsYUFBYSxVQUFVLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksTUFBTSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDOzZCQUM3Sjs0QkFDRCxPQUFPLEtBQUssQ0FBQyxHQUFHLGFBQWEsV0FBVyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO3lCQUM3SDs2QkFBTTs0QkFDTixJQUFJLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsNEJBQW9CLEVBQUU7Z0NBQ25HLE9BQU8sS0FBSyxDQUFDLEdBQUcsYUFBYSxVQUFVLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksUUFBUSxJQUFJLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7NkJBQzNIO3lCQUNEO3FCQUNEO2lCQUNEO3FCQUFNO29CQUNOLElBQUksSUFBSSxDQUFDLFlBQVksSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyw0QkFBb0IsRUFBRTt3QkFDekUsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7cUJBQ2xCO2lCQUNEO2FBQ0Q7WUFFRCxJQUFJLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDakMsSUFBSSxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxlQUFlLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUU7b0JBQ3RGLE1BQU0sZ0JBQWdCLEdBQWEsRUFBRSxDQUFDO29CQUN0QyxLQUFLLE1BQU0sZUFBZSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFO3dCQUN6RCxJQUFJLFFBQVEsQ0FBQyxlQUFlLENBQUMsNEJBQW9CLEVBQUU7NEJBQ2xELGdCQUFnQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7eUJBQy9EO3FCQUNEO29CQUNELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7b0JBQ3hELE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztvQkFDM0UsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO3dCQUNoQyxPQUFPLEtBQUssQ0FBQyxHQUFHLGFBQWEsV0FBVyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO3FCQUM3SDtpQkFDRDthQUNEO1lBRUQsSUFBSSxVQUFVLG9DQUE0QixJQUFJLENBQUMsRUFBRSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUMzSSxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2pDLEtBQUssSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQ2xELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQy9CLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyw0QkFBb0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUU7d0JBQ3pELGNBQWM7d0JBQ2QsU0FBUztxQkFDVDtvQkFFRCxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7b0JBQ2xDLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztvQkFDbEMsT0FBTyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQzdEO2dCQUNELE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2FBQ3RCO1lBRUQsSUFBSSxFQUFFLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQ25DLHlEQUF5RDtnQkFDekQsT0FBTzthQUNQO1lBRUQsSUFBSSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFFRCxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsNEJBQW9CLEVBQUU7WUFDN0MsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxFQUFFO2dCQUNwQyxxQ0FBcUM7Z0JBQ3JDLElBQUksa0JBQWtCLENBQUMsVUFBVSxDQUFDLEVBQUU7b0JBQ25DLG9FQUFvRTtvQkFDcEUsK0NBQStDO29CQUMvQyw2RUFBNkU7b0JBQzdFLHFDQUFxQztvQkFDckMsTUFBTSxHQUFHLDJCQUEyQixDQUFDO2lCQUNyQztxQkFBTTtvQkFDTixnQ0FBZ0M7b0JBQ2hDLE9BQU87aUJBQ1A7YUFDRDtpQkFBTTtnQkFDTixVQUFVLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQzFDLE1BQU0sSUFBSSxVQUFVLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQzthQUM1RDtTQUNEO2FBQU07WUFDTixNQUFNLEdBQUcsSUFBSSxDQUFDO1NBQ2Q7UUFFRCxTQUFTLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ2hDLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsWUFBWTtBQUVaLGVBQWU7QUFFZixTQUFTLG9EQUFvRCxDQUFDLEVBQStCLEVBQUUsT0FBbUIsRUFBRSxPQUF1QixFQUFFLFdBQTBEO0lBQ3RNLElBQUksQ0FBQyxPQUFPLENBQUMsMEJBQTBCLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDLElBQUksV0FBVyxDQUFDLGVBQWUsRUFBRTtRQUNwRyxLQUFLLE1BQU0sY0FBYyxJQUFJLFdBQVcsQ0FBQyxlQUFlLEVBQUU7WUFDekQsS0FBSyxNQUFNLElBQUksSUFBSSxjQUFjLENBQUMsS0FBSyxFQUFFO2dCQUN4QyxNQUFNLE1BQU0sR0FBRywwQkFBMEIsQ0FBQyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUM3RCxJQUFJLE1BQU0sRUFBRTtvQkFDWCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsZ0JBQWdCLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDeEYsSUFBSSxJQUFJLElBQUksT0FBTyxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxFQUFFO3dCQUNyRSxPQUFPLElBQUksQ0FBQztxQkFDWjtpQkFDRDthQUNEO1NBQ0Q7S0FDRDtJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQVMsMEJBQTBCLENBQUMsRUFBK0IsRUFBRSxPQUF1QixFQUFFLElBQTJFO0lBQ3hLLElBQUksRUFBRSxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxFQUFFO1FBQzNDLE9BQU8sMEJBQTBCLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7S0FDaEU7SUFDRCxJQUFJLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDMUIsTUFBTSxHQUFHLEdBQUcsaUJBQWlCLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNqRCxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQy9DO0lBQ0QsSUFBSSxFQUFFLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDeEMsT0FBTywwQkFBMEIsQ0FBQyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUMxRDtJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUVELE1BQU0saUJBQWlCO0lBRUw7SUFDQTtJQUZqQixZQUNpQixNQUF3QixFQUN4QixnQkFBdUM7UUFEdkMsV0FBTSxHQUFOLE1BQU0sQ0FBa0I7UUFDeEIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUF1QjtJQUNwRCxDQUFDO0NBQ0w7QUFFRDs7R0FFRztBQUNILFNBQVMsaUJBQWlCLENBQUMsRUFBK0IsRUFBRSxPQUF1QixFQUFFLElBQWE7SUFJakcsTUFBTSxvQ0FBb0MsR0FBcUosRUFBRyxDQUFDLG9DQUFvQyxDQUFDO0lBQ3hPLE1BQU0saUNBQWlDLEdBQXNFLEVBQUcsQ0FBQyxpQ0FBaUMsQ0FBQztJQUNuSixNQUFNLHVCQUF1QixHQUF3RCxFQUFHLENBQUMsdUJBQXVCLENBQUM7SUFFakgsNENBQTRDO0lBQzVDLEVBQUU7SUFDRixzRUFBc0U7SUFDdEUsK0RBQStEO0lBQy9ELEVBQUU7SUFDRixTQUFTLGVBQWUsQ0FBQyxJQUFhLEVBQUUsV0FBb0I7UUFDM0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFO1lBQ3RGLE9BQU8sS0FBSyxDQUFDO1NBQ2I7UUFDRCxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssV0FBVyxFQUFFO1lBQ2hDLE9BQU8sSUFBSSxDQUFDO1NBQ1o7UUFDRCxRQUFRLFdBQVcsQ0FBQyxJQUFJLEVBQUU7WUFDekIsS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQztZQUNoQyxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsdUJBQXVCO2dCQUN6QyxPQUFPLElBQUksQ0FBQztZQUNiLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxlQUFlO2dCQUNqQyxPQUFPLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDO1lBQy9EO2dCQUNDLE9BQU8sS0FBSyxDQUFDO1NBQ2Q7SUFDRixDQUFDO0lBRUQsSUFBSSxDQUFDLEVBQUUsQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUM1QyxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLEVBQUU7WUFDL0IsT0FBTyxFQUFFLENBQUM7U0FDVjtLQUNEO0lBRUQsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQztJQUV4QixJQUFJLE1BQU0sR0FBRyxDQUNaLEVBQUUsQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUM7UUFDckMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxpQ0FBaUMsQ0FBQyxJQUFJLENBQUM7UUFDakQsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FDcEMsQ0FBQztJQUVGLElBQUksVUFBVSxHQUEwQixJQUFJLENBQUM7SUFDN0Msd0VBQXdFO0lBQ3hFLDZFQUE2RTtJQUM3RSw4QkFBOEI7SUFDOUIsMENBQTBDO0lBQzFDLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLFlBQVksSUFBSSxlQUFlLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUMxSCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakQsSUFBSSxPQUFPLENBQUMsWUFBWSxFQUFFO1lBQ3pCLHVDQUF1QztZQUN2QyxVQUFVLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQyxNQUFNLEdBQUcsT0FBTyxDQUFDO1NBQ2pCO0tBQ0Q7SUFFRCxJQUFJLE1BQU0sRUFBRTtRQUNYLCtHQUErRztRQUMvRyxrSEFBa0g7UUFDbEgsb0hBQW9IO1FBQ3BILHVIQUF1SDtRQUN2SCxzRUFBc0U7UUFDdEUsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLDJCQUEyQixFQUFFO1lBQ25FLE1BQU0sR0FBRyxPQUFPLENBQUMsaUNBQWlDLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUM7U0FDNUU7UUFFRCwyR0FBMkc7UUFDM0csa0hBQWtIO1FBQ2xILG1FQUFtRTtRQUNuRSxlQUFlO1FBQ2Ysa0hBQWtIO1FBQ2xILEVBQUU7UUFDRixrRUFBa0U7UUFDbEUsd0JBQXdCO1FBQ3hCLHdDQUF3QztRQUN4QyxTQUFTO1FBQ1QseUNBQXlDO1FBQ3pDLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7WUFDckcsQ0FBQyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFO1lBQ2pELE1BQU0sSUFBSSxHQUFHLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEQsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO2dCQUNqQixJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRTtvQkFDbkIsT0FBTyx1QkFBdUIsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO2lCQUN2RDtxQkFBTTtvQkFDTixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNwQyxJQUFJLElBQUksRUFBRTt3QkFDVCxNQUFNLEdBQUcsSUFBSSxDQUFDO3FCQUNkO2lCQUNEO2FBQ0Q7U0FDRDtRQUVELHlIQUF5SDtRQUN6SCx1R0FBdUc7UUFDdkcsY0FBYztRQUNkLHdCQUF3QjtRQUN4QixrQ0FBa0M7UUFDbEMsMEJBQTBCO1FBQzFCLFNBQVM7UUFDVCxtQ0FBbUM7UUFDbkMsOENBQThDO1FBQzlDLE1BQU0sT0FBTyxHQUFHLGlDQUFpQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hELElBQUksT0FBTyxFQUFFO1lBQ1osTUFBTSxjQUFjLEdBQUcsT0FBTyxJQUFJLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDNUUsSUFBSSxjQUFjLEVBQUU7Z0JBQ25CLE1BQU0sZUFBZSxHQUFHLG9DQUFvQyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN4SCxJQUFJLGVBQWUsRUFBRTtvQkFDcEIsTUFBTSxHQUFHLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztpQkFDNUI7YUFDRDtTQUNEO0tBQ0Q7SUFFRCxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsWUFBWSxFQUFFO1FBQ2xDLE9BQU8sQ0FBQyxJQUFJLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO0tBQ25EO0lBRUQsT0FBTyxFQUFFLENBQUM7SUFFVixTQUFTLHVCQUF1QixDQUFDLElBQWtCLEVBQUUsSUFBWSxFQUFFLFVBQWlDO1FBQ25HLE1BQU0sTUFBTSxHQUF3QixFQUFFLENBQUM7UUFDdkMsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQzNCLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakMsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRTtnQkFDOUIsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLGlCQUFpQixDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO2FBQ3JEO1NBQ0Q7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7QUFDRixDQUFDO0FBRUQscURBQXFEO0FBQ3JELFNBQVMsa0JBQWtCLENBQUMsRUFBK0IsRUFBRSxVQUF5QixFQUFFLFFBQWdCLEVBQUUsNEJBQXFDLEVBQUUsa0JBQTJCO0lBQzNLLElBQUksT0FBTyxHQUFZLFVBQVUsQ0FBQztJQUNsQyxLQUFLLEVBQUUsT0FBTyxJQUFJLEVBQUU7UUFDbkIsMENBQTBDO1FBQzFDLEtBQUssTUFBTSxLQUFLLElBQUksT0FBTyxDQUFDLFdBQVcsRUFBRSxFQUFFO1lBQzFDLE1BQU0sS0FBSyxHQUFHLDRCQUE0QixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3RILElBQUksS0FBSyxHQUFHLFFBQVEsRUFBRTtnQkFDckIsa0ZBQWtGO2dCQUNsRixNQUFNO2FBQ047WUFFRCxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDM0IsSUFBSSxRQUFRLEdBQUcsR0FBRyxJQUFJLENBQUMsUUFBUSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLElBQUksa0JBQWtCLENBQUMsQ0FBQyxFQUFFO2dCQUNoSCxPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUNoQixTQUFTLEtBQUssQ0FBQzthQUNmO1NBQ0Q7UUFFRCxPQUFPLE9BQU8sQ0FBQztLQUNmO0FBQ0YsQ0FBQztBQUVELFlBQVkifQ==