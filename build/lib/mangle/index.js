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
const staticLanguageServiceHost_1 = require("./staticLanguageServiceHost");
const workerpool = require("workerpool");
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
    renameWorkerPool;
    constructor(projectPath, log = () => { }) {
        this.projectPath = projectPath;
        this.log = log;
        this.service = ts.createLanguageService(new staticLanguageServiceHost_1.StaticLanguageServiceHost(projectPath));
        this.renameWorkerPool = workerpool.pool(path.join(__dirname, 'renameWorker.js'), {
            minWorkers: 'max'
        });
    }
    async computeNewFileContents(strictImplicitPublicHandling) {
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
        // STEP: prepare rename edits
        this.log(`Starting prepare rename edits`);
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
        const renameResults = [];
        const queueRename = (fileName, pos, newName) => {
            renameResults.push(Promise.resolve(this.renameWorkerPool.exec('findRenameLocations', [this.projectPath, fileName, pos]))
                .then((locations) => ({ newName, locations })));
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
                const newName = data.lookupShortName(name);
                queueRename(data.fileName, info.pos, newName);
            }
        }
        for (const data of this.allExportedDeclarationsByKey.values()) {
            if (!data.shouldMangle(data.replacementName)) {
                continue;
            }
            const newText = data.replacementName;
            for (const { fileName, offset } of data.locations) {
                queueRename(fileName, offset, newText);
            }
        }
        await Promise.all(renameResults).then((result) => {
            for (const { newName, locations } of result) {
                for (const loc of locations) {
                    appendRename(newName, loc);
                }
            }
        });
        await this.renameWorkerPool.terminate();
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
    const projectPath = path.join(__dirname, '../../../src/tsconfig.json');
    const projectBase = path.dirname(projectPath);
    const newProjectBase = path.join(path.dirname(projectBase), path.basename(projectBase) + '2');
    fs.cpSync(projectBase, newProjectBase, { recursive: true });
    const mangler = new Mangler(projectPath, console.log);
    for (const [fileName, contents] of await mangler.computeNewFileContents(new Set(['saveState']))) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxpQ0FBaUM7QUFDakMsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUN6QixxQ0FBK0I7QUFDL0IsMkNBQXlEO0FBQ3pELDZCQUFvQztBQUNwQywyRUFBd0U7QUFDeEUseUNBQXlDO0FBRXpDLE1BQU0sVUFBVTtJQUVQLE1BQU0sQ0FBQyxTQUFTLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVTtRQUM5RyxTQUFTLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsSUFBSTtRQUNuRyxRQUFRLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU87UUFDMUcsTUFBTSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFFNUQsTUFBTSxDQUFDLFNBQVMsR0FBRyxrRUFBa0UsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7SUFFaEcsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUNGLFlBQVksQ0FBNEI7SUFDeEMsTUFBTSxDQUFTO0lBRWhDLFlBQVksTUFBYyxFQUFFLFdBQXNDO1FBQ2pFLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLEVB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