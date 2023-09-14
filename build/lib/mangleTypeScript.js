"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mangler = void 0;
const ts = require("typescript");
const path = require("path");
const fs = require("fs");
const process_1 = require("process");
const source_map_1 = require("source-map");
const url_1 = require("url");
class ShortIdent {
    static _keywords = new Set(['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
        'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
        'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw',
        'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield']);
    static _alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890$_'.split('');
    _value = 0;
    _isNameTaken;
    prefix;
    constructor(prefix, isNameTaken) {
        this.prefix = prefix;
        this._isNameTaken = name => ShortIdent._keywords.has(name) || /^[_0-9]/.test(name) || isNameTaken(name);
    }
    next(localIsNameTaken) {
        const candidate = this.prefix + ShortIdent.convert(this._value);
        this._value++;
        if (this._isNameTaken(candidate) || localIsNameTaken?.(candidate)) {
            // try again
            return this.next(localIsNameTaken);
        }
        return candidate;
    }
    static convert(n) {
        const base = this._alphabet.length;
        let result = '';
        do {
            const rest = n % base;
            result += this._alphabet[rest];
            n = (n / base) | 0;
        } while (n > 0);
        return result;
    }
}
var FieldType;
(function (FieldType) {
    FieldType[FieldType["Public"] = 0] = "Public";
    FieldType[FieldType["Protected"] = 1] = "Protected";
    FieldType[FieldType["Private"] = 2] = "Private";
})(FieldType || (FieldType = {}));
class ClassData {
    fileName;
    node;
    fields = new Map();
    replacements;
    parent;
    children;
    constructor(fileName, node) {
        // analyse all fields (properties and methods). Find usages of all protected and
        // private ones and keep track of all public ones (to prevent naming collisions)
        this.fileName = fileName;
        this.node = node;
        const candidates = [];
        for (const member of node.members) {
            if (ts.isMethodDeclaration(member)) {
                // method `foo() {}`
                candidates.push(member);
            }
            else if (ts.isPropertyDeclaration(member)) {
                // property `foo = 234`
                candidates.push(member);
            }
            else if (ts.isGetAccessor(member)) {
                // getter: `get foo() { ... }`
                candidates.push(member);
            }
            else if (ts.isSetAccessor(member)) {
                // setter: `set foo() { ... }`
                candidates.push(member);
            }
            else if (ts.isConstructorDeclaration(member)) {
                // constructor-prop:`constructor(private foo) {}`
                for (const param of member.parameters) {
                    if (hasModifier(param, ts.SyntaxKind.PrivateKeyword)
                        || hasModifier(param, ts.SyntaxKind.ProtectedKeyword)
                        || hasModifier(param, ts.SyntaxKind.PublicKeyword)
                        || hasModifier(param, ts.SyntaxKind.ReadonlyKeyword)) {
                        candidates.push(param);
                    }
                }
            }
        }
        for (const member of candidates) {
            const ident = ClassData._getMemberName(member);
            if (!ident) {
                continue;
            }
            const type = ClassData._getFieldType(member);
            this.fields.set(ident, { type, pos: member.name.getStart() });
        }
    }
    static _getMemberName(node) {
        if (!node.name) {
            return undefined;
        }
        const { name } = node;
        let ident = name.getText();
        if (name.kind === ts.SyntaxKind.ComputedPropertyName) {
            if (name.expression.kind !== ts.SyntaxKind.StringLiteral) {
                // unsupported: [Symbol.foo] or [abc + 'field']
                return;
            }
            // ['foo']
            ident = name.expression.getText().slice(1, -1);
        }
        return ident;
    }
    static _getFieldType(node) {
        if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) {
            return 2 /* FieldType.Private */;
        }
        else if (hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) {
            return 1 /* FieldType.Protected */;
        }
        else {
            return 0 /* FieldType.Public */;
        }
    }
    static _shouldMangle(type) {
        return type === 2 /* FieldType.Private */
            || type === 1 /* FieldType.Protected */;
    }
    static makeImplicitPublicActuallyPublic(data, reportViolation) {
        // TS-HACK
        // A subtype can make an inherited protected field public. To prevent accidential
        // mangling of public fields we mark the original (protected) fields as public...
        for (const [name, info] of data.fields) {
            if (info.type !== 0 /* FieldType.Public */) {
                continue;
            }
            let parent = data.parent;
            while (parent) {
                if (parent.fields.get(name)?.type === 1 /* FieldType.Protected */) {
                    const parentPos = parent.node.getSourceFile().getLineAndCharacterOfPosition(parent.fields.get(name).pos);
                    const infoPos = data.node.getSourceFile().getLineAndCharacterOfPosition(info.pos);
                    reportViolation(name, `'${name}' from ${parent.fileName}:${parentPos.line + 1}`, `${data.fileName}:${infoPos.line + 1}`);
                    parent.fields.get(name).type = 0 /* FieldType.Public */;
                }
                parent = parent.parent;
            }
        }
    }
    static fillInReplacement(data) {
        if (data.replacements) {
            // already done
            return;
        }
        // fill in parents first
        if (data.parent) {
            ClassData.fillInReplacement(data.parent);
        }
        data.replacements = new Map();
        const identPool = new ShortIdent('', name => {
            // locally taken
            if (data._isNameTaken(name)) {
                return true;
            }
            // parents
            let parent = data.parent;
            while (parent) {
                if (parent._isNameTaken(name)) {
                    return true;
                }
                parent = parent.parent;
            }
            // children
            if (data.children) {
                const stack = [...data.children];
                while (stack.length) {
                    const node = stack.pop();
                    if (node._isNameTaken(name)) {
                        return true;
                    }
                    if (node.children) {
                        stack.push(...node.children);
                    }
                }
            }
            return false;
        });
        for (const [name, info] of data.fields) {
            if (ClassData._shouldMangle(info.type)) {
                const shortName = identPool.next();
                data.replacements.set(name, shortName);
            }
        }
    }
    // a name is taken when a field that doesn't get mangled exists or
    // when the name is already in use for replacement
    _isNameTaken(name) {
        if (this.fields.has(name) && !ClassData._shouldMangle(this.fields.get(name).type)) {
            // public field
            return true;
        }
        if (this.replacements) {
            for (const shortName of this.replacements.values()) {
                if (shortName === name) {
                    // replaced already (happens wih super types)
                    return true;
                }
            }
        }
        if (isNameTakenInFile(this.node, name)) {
            return true;
        }
        return false;
    }
    lookupShortName(name) {
        let value = this.replacements.get(name);
        let parent = this.parent;
        while (parent) {
            if (parent.replacements.has(name) && parent.fields.get(name)?.type === 1 /* FieldType.Protected */) {
                value = parent.replacements.get(name) ?? value;
            }
            parent = parent.parent;
        }
        return value;
    }
    // --- parent chaining
    addChild(child) {
        this.children ??= [];
        this.children.push(child);
        child.parent = this;
    }
}
function isNameTakenInFile(node, name) {
    const identifiers = node.getSourceFile().identifiers;
    if (identifiers instanceof Map) {
        if (identifiers.has(name)) {
            return true;
        }
    }
    return false;
}
const fileIdents = new class {
    idents = new ShortIdent('$', () => false);
    next(file) {
        return this.idents.next(name => isNameTakenInFile(file, name));
    }
};
const skippedFiles = [
    // Build
    'css.build.ts',
    'nls.build.ts',
    // Monaco
    'editorCommon.ts',
    'editorOptions.ts',
    'editorZoom.ts',
    'standaloneEditor.ts',
    'standaloneLanguages.ts',
    // Generated
    'extensionsApiProposals.ts',
    // Module passed around as type
    'pfs.ts',
];
class DeclarationData {
    fileName;
    node;
    replacementName;
    constructor(fileName, node) {
        this.fileName = fileName;
        this.node = node;
        this.replacementName = fileIdents.next(node.getSourceFile());
    }
    get locations() {
        return [{
                fileName: this.fileName,
                offset: this.node.name.getStart()
            }];
    }
    shouldMangle(newName) {
        // New name is longer the existing one :'(
        if (newName.length >= this.node.name.getText().length) {
            return false;
        }
        // Don't mangle functions we've explicitly opted out
        if (this.node.getFullText().includes('@skipMangle')) {
            return false;
        }
        // Don't mangle functions in the monaco editor API.
        if (skippedFiles.some(file => this.node.getSourceFile().fileName.endsWith(file))) {
            return false;
        }
        return true;
    }
}
class ConstData {
    fileName;
    statement;
    decl;
    service;
    replacementName;
    constructor(fileName, statement, decl, service) {
        this.fileName = fileName;
        this.statement = statement;
        this.decl = decl;
        this.service = service;
        this.replacementName = fileIdents.next(statement.getSourceFile());
    }
    get locations() {
        // If the const aliases any types, we need to rename those too
        const definitionResult = this.service.getDefinitionAndBoundSpan(this.decl.getSourceFile().fileName, this.decl.name.getStart());
        if (definitionResult?.definitions && definitionResult.definitions.length > 1) {
            return definitionResult.definitions.map(x => ({ fileName: x.fileName, offset: x.textSpan.start }));
        }
        return [{ fileName: this.fileName, offset: this.decl.name.getStart() }];
    }
    shouldMangle(newName) {
        // New name is longer the existing one :'(
        if (newName.length >= this.decl.name.getText().length) {
            return false;
        }
        // Don't mangle functions we've explicitly opted out
        if (this.statement.getFullText().includes('@skipMangle')) {
            return false;
        }
        // Don't mangle functions in some files
        if (skippedFiles.some(file => this.decl.getSourceFile().fileName.endsWith(file))) {
            return false;
        }
        return true;
    }
}
class StaticLanguageServiceHost {
    projectPath;
    _cmdLine;
    _scriptSnapshots = new Map();
    constructor(projectPath) {
        this.projectPath = projectPath;
        const existingOptions = {};
        const parsed = ts.readConfigFile(projectPath, ts.sys.readFile);
        if (parsed.error) {
            throw parsed.error;
        }
        this._cmdLine = ts.parseJsonConfigFileContent(parsed.config, ts.sys, path.dirname(projectPath), existingOptions);
        if (this._cmdLine.errors.length > 0) {
            throw parsed.error;
        }
    }
    getCompilationSettings() {
        return this._cmdLine.options;
    }
    getScriptFileNames() {
        return this._cmdLine.fileNames;
    }
    getScriptVersion(_fileName) {
        return '1';
    }
    getProjectVersion() {
        return '1';
    }
    getScriptSnapshot(fileName) {
        let result = this._scriptSnapshots.get(fileName);
        if (result === undefined) {
            const content = ts.sys.readFile(fileName);
            if (content === undefined) {
                return undefined;
            }
            result = ts.ScriptSnapshot.fromString(content);
            this._scriptSnapshots.set(fileName, result);
        }
        return result;
    }
    getCurrentDirectory() {
        return path.dirname(this.projectPath);
    }
    getDefaultLibFileName(options) {
        return ts.getDefaultLibFilePath(options);
    }
    directoryExists = ts.sys.directoryExists;
    getDirectories = ts.sys.getDirectories;
    fileExists = ts.sys.fileExists;
    readFile = ts.sys.readFile;
    readDirectory = ts.sys.readDirectory;
    // this is necessary to make source references work.
    realpath = ts.sys.realpath;
}
/**
 * TypeScript2TypeScript transformer that mangles all private and protected fields
 *
 * 1. Collect all class fields (properties, methods)
 * 2. Collect all sub and super-type relations between classes
 * 3. Compute replacement names for each field
 * 4. Lookup rename locations for these fields
 * 5. Prepare and apply edits
 */
class Mangler {
    projectPath;
    log;
    allClassDataByKey = new Map();
    allExportedDeclarationsByKey = new Map();
    service;
    constructor(projectPath, log = () => { }) {
        this.projectPath = projectPath;
        this.log = log;
        this.service = ts.createLanguageService(new StaticLanguageServiceHost(projectPath));
    }
    computeNewFileContents(strictImplicitPublicHandling) {
        // STEP find all classes and their field info. Find all exported consts and functions.
        const visit = (node) => {
            if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
                const anchor = node.name ?? node;
                const key = `${node.getSourceFile().fileName}|${anchor.getStart()}`;
                if (this.allClassDataByKey.has(key)) {
                    throw new Error('DUPE?');
                }
                this.allClassDataByKey.set(key, new ClassData(node.getSourceFile().fileName, node));
            }
            if (ts.isClassDeclaration(node) && hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
                if (node.name) {
                    const anchor = node.name;
                    const key = `${node.getSourceFile().fileName}|${anchor.getStart()}`;
                    if (this.allExportedDeclarationsByKey.has(key)) {
                        throw new Error('DUPE?');
                    }
                    this.allExportedDeclarationsByKey.set(key, new DeclarationData(node.getSourceFile().fileName, node));
                }
            }
            if (ts.isFunctionDeclaration(node)
                && ts.isSourceFile(node.parent)
                && hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
                if (node.name && node.body) { // On named function and not on the overload
                    const anchor = node.name;
                    const key = `${node.getSourceFile().fileName}|${anchor.getStart()}`;
                    if (this.allExportedDeclarationsByKey.has(key)) {
                        throw new Error('DUPE?');
                    }
                    this.allExportedDeclarationsByKey.set(key, new DeclarationData(node.getSourceFile().fileName, node));
                }
            }
            if (ts.isVariableStatement(node)
                && ts.isSourceFile(node.parent)
                && hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
                for (const decl of node.declarationList.declarations) {
                    const key = `${decl.getSourceFile().fileName}|${decl.name.getStart()}`;
                    if (this.allExportedDeclarationsByKey.has(key)) {
                        throw new Error('DUPE?');
                    }
                    this.allExportedDeclarationsByKey.set(key, new ConstData(node.getSourceFile().fileName, node, decl, this.service));
                }
            }
            ts.forEachChild(node, visit);
        };
        for (const file of this.service.getProgram().getSourceFiles()) {
            if (!file.isDeclarationFile) {
                ts.forEachChild(file, visit);
            }
        }
        this.log(`Done collecting. Classes: ${this.allClassDataByKey.size}. Exported const/fn: ${this.allExportedDeclarationsByKey.size}`);
        //  STEP: connect sub and super-types
        const setupParents = (data) => {
            const extendsClause = data.node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
            if (!extendsClause) {
                // no EXTENDS-clause
                return;
            }
            const info = this.service.getDefinitionAtPosition(data.fileName, extendsClause.types[0].expression.getEnd());
            if (!info || info.length === 0) {
                // throw new Error('SUPER type not found');
                return;
            }
            if (info.length !== 1) {
                // inherits from declared/library type
                return;
            }
            const [definition] = info;
            const key = `${definition.fileName}|${definition.textSpan.start}`;
            const parent = this.allClassDataByKey.get(key);
            if (!parent) {
                // throw new Error(`SUPER type not found: ${key}`);
                return;
            }
            parent.addChild(data);
        };
        for (const data of this.allClassDataByKey.values()) {
            setupParents(data);
        }
        //  STEP: make implicit public (actually protected) field really public
        const violations = new Map();
        let violationsCauseFailure = false;
        for (const data of this.allClassDataByKey.values()) {
            ClassData.makeImplicitPublicActuallyPublic(data, (name, what, why) => {
                const arr = violations.get(what);
                if (arr) {
                    arr.push(why);
                }
                else {
                    violations.set(what, [why]);
                }
                if (strictImplicitPublicHandling && !strictImplicitPublicHandling.has(name)) {
                    violationsCauseFailure = true;
                }
            });
        }
        for (const [why, whys] of violations) {
            this.log(`WARN: ${why} became PUBLIC because of: ${whys.join(' , ')}`);
        }
        if (violationsCauseFailure) {
            const message = 'Protected fields have been made PUBLIC. This hurts minification and is therefore not allowed. Review the WARN messages further above';
            this.log(`ERROR: ${message}`);
            throw new Error(message);
        }
        // STEP: compute replacement names for each class
        for (const data of this.allClassDataByKey.values()) {
            ClassData.fillInReplacement(data);
        }
        this.log(`Done creating class replacements`);
        const editsByFile = new Map();
        const appendEdit = (fileName, edit) => {
            const edits = editsByFile.get(fileName);
            if (!edits) {
                editsByFile.set(fileName, [edit]);
            }
            else {
                edits.push(edit);
            }
        };
        const appendRename = (newText, loc) => {
            appendEdit(loc.fileName, {
                newText: (loc.prefixText || '') + newText + (loc.suffixText || ''),
                offset: loc.textSpan.start,
                length: loc.textSpan.length
            });
        };
        for (const data of this.allClassDataByKey.values()) {
            if (hasModifier(data.node, ts.SyntaxKind.DeclareKeyword)) {
                continue;
            }
            fields: for (const [name, info] of data.fields) {
                if (!ClassData._shouldMangle(info.type)) {
                    continue fields;
                }
                // TS-HACK: protected became public via 'some' child
                // and because of that we might need to ignore this now
                let parent = data.parent;
                while (parent) {
                    if (parent.fields.get(name)?.type === 0 /* FieldType.Public */) {
                        continue fields;
                    }
                    parent = parent.parent;
                }
                const newText = data.lookupShortName(name);
                const locations = this.service.findRenameLocations(data.fileName, info.pos, false, false, true) ?? [];
                for (const loc of locations) {
                    appendRename(newText, loc);
                }
            }
        }
        for (const data of this.allExportedDeclarationsByKey.values()) {
            if (!data.shouldMangle(data.replacementName)) {
                continue;
            }
            const newText = data.replacementName;
            for (const { fileName, offset } of data.locations) {
                const locations = this.service.findRenameLocations(fileName, offset, false, false, true) ?? [];
                for (const loc of locations) {
                    appendRename(newText, loc);
                }
            }
        }
        this.log(`Done preparing edits: ${editsByFile.size} files`);
        // STEP: apply all rename edits (per file)
        const result = new Map();
        let savedBytes = 0;
        for (const item of this.service.getProgram().getSourceFiles()) {
            const { mapRoot, sourceRoot } = this.service.getProgram().getCompilerOptions();
            const projectDir = path.dirname(this.projectPath);
            const sourceMapRoot = mapRoot ?? (0, url_1.pathToFileURL)(sourceRoot ?? projectDir).toString();
            // source maps
            let generator;
            let newFullText;
            const edits = editsByFile.get(item.fileName);
            if (!edits) {
                // just copy
                newFullText = item.getFullText();
            }
            else {
                // source map generator
                const relativeFileName = normalize(path.relative(projectDir, item.fileName));
                const mappingsByLine = new Map();
                // apply renames
                edits.sort((a, b) => b.offset - a.offset);
                const characters = item.getFullText().split('');
                let lastEdit;
                for (const edit of edits) {
                    if (lastEdit && lastEdit.offset === edit.offset) {
                        //
                        if (lastEdit.length !== edit.length || lastEdit.newText !== edit.newText) {
                            this.log('ERROR: Overlapping edit', item.fileName, edit.offset, edits);
                            throw new Error('OVERLAPPING edit');
                        }
                        else {
                            continue;
                        }
                    }
                    lastEdit = edit;
                    const mangledName = characters.splice(edit.offset, edit.length, edit.newText).join('');
                    savedBytes += mangledName.length - edit.newText.length;
                    // source maps
                    const pos = item.getLineAndCharacterOfPosition(edit.offset);
                    let mappings = mappingsByLine.get(pos.line);
                    if (!mappings) {
                        mappings = [];
                        mappingsByLine.set(pos.line, mappings);
                    }
                    mappings.unshift({
                        source: relativeFileName,
                        original: { line: pos.line + 1, column: pos.character },
                        generated: { line: pos.line + 1, column: pos.character },
                        name: mangledName
                    }, {
                        source: relativeFileName,
                        original: { line: pos.line + 1, column: pos.character + edit.length },
                        generated: { line: pos.line + 1, column: pos.character + edit.newText.length },
                    });
                }
                // source map generation, make sure to get mappings per line correct
                generator = new source_map_1.SourceMapGenerator({ file: path.basename(item.fileName), sourceRoot: sourceMapRoot });
                generator.setSourceContent(relativeFileName, item.getFullText());
                for (const [, mappings] of mappingsByLine) {
                    let lineDelta = 0;
                    for (const mapping of mappings) {
                        generator.addMapping({
                            ...mapping,
                            generated: { line: mapping.generated.line, column: mapping.generated.column - lineDelta }
                        });
                        lineDelta += mapping.original.column - mapping.generated.column;
                    }
                }
                newFullText = characters.join('');
            }
            result.set(item.fileName, { out: newFullText, sourceMap: generator?.toString() });
        }
        this.log(`Done: ${savedBytes / 1000}kb saved`);
        return result;
    }
}
exports.Mangler = Mangler;
// --- ast utils
function hasModifier(node, kind) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return Boolean(modifiers?.find(mode => mode.kind === kind));
}
function normalize(path) {
    return path.replace(/\\/g, '/');
}
async function _run() {
    const projectPath = path.join(__dirname, '../../src/tsconfig.json');
    const projectBase = path.dirname(projectPath);
    const newProjectBase = path.join(path.dirname(projectBase), path.basename(projectBase) + '2');
    fs.cpSync(projectBase, newProjectBase, { recursive: true });
    for await (const [fileName, contents] of new Mangler(projectPath, console.log).computeNewFileContents(new Set(['saveState']))) {
        const newFilePath = path.join(newProjectBase, path.relative(projectBase, fileName));
        await fs.promises.mkdir(path.dirname(newFilePath), { recursive: true });
        await fs.promises.writeFile(newFilePath, contents.out);
        if (contents.sourceMap) {
            await fs.promises.writeFile(newFilePath + '.map', contents.sourceMap);
        }
    }
}
if (__filename === process_1.argv[1]) {
    _run();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuZ2xlVHlwZVNjcmlwdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1hbmdsZVR5cGVTY3JpcHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsaUNBQWlDO0FBQ2pDLDZCQUE2QjtBQUM3Qix5QkFBeUI7QUFDekIscUNBQStCO0FBQy9CLDJDQUF5RDtBQUN6RCw2QkFBb0M7QUFFcEMsTUFBTSxVQUFVO0lBRVAsTUFBTSxDQUFDLFNBQVMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxVQUFVO1FBQzlHLFNBQVMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJO1FBQ25HLFFBQVEsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTztRQUMxRyxNQUFNLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUU1RCxNQUFNLENBQUMsU0FBUyxHQUFHLGtFQUFrRSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVoRyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ0YsWUFBWSxDQUE0QjtJQUN4QyxNQUFNLENBQVM7SUFFaEMsWUFBWSxNQUFjLEVBQUUsV0FBc0M7UUFDakUsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsRUFBRSxD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