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
    static _alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    _value = 0;
    _isNameTaken;
    constructor(isNameTaken) {
        this._isNameTaken = name => ShortIdent._keywords.has(name) || isNameTaken(name);
    }
    next() {
        const candidate = ShortIdent.convert(this._value);
        this._value++;
        if (this._isNameTaken(candidate)) {
            // try again
            return this.next();
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
                    reportViolation(`'${name}' from ${parent.fileName}:${parentPos.line + 1}`, `${data.fileName}:${infoPos.line + 1}`);
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
        const identPool = new ShortIdent(name => {
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
        if (this.node.getSourceFile().identifiers instanceof Map) {
            // taken by any other usage
            if (this.node.getSourceFile().identifiers.has(name)) {
                return true;
            }
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
    service;
    constructor(projectPath, log = () => { }) {
        this.projectPath = projectPath;
        this.log = log;
        this.service = ts.createLanguageService(new StaticLanguageServiceHost(projectPath));
    }
    computeNewFileContents() {
        // STEP: find all classes and their field info
        const visit = (node) => {
            if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
                const anchor = node.name ?? node;
                const key = `${node.getSourceFile().fileName}|${anchor.getStart()}`;
                if (this.allClassDataByKey.has(key)) {
                    throw new Error('DUPE?');
                }
                this.allClassDataByKey.set(key, new ClassData(node.getSourceFile().fileName, node));
            }
            ts.forEachChild(node, visit);
        };
        for (const file of this.service.getProgram().getSourceFiles()) {
            if (!file.isDeclarationFile) {
                ts.forEachChild(file, visit);
            }
        }
        this.log(`Done collecting classes: ${this.allClassDataByKey.size}`);
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
        for (const data of this.allClassDataByKey.values()) {
            ClassData.makeImplicitPublicActuallyPublic(data, (what, why) => {
                const arr = violations.get(what);
                if (arr) {
                    arr.push(why);
                }
                else {
                    violations.set(what, [why]);
                }
            });
        }
        for (const [why, whys] of violations) {
            this.log(`WARN: ${why} became PUBLIC because of: ${whys.join(' , ')}`);
        }
        // STEP: compute replacement names for each class
        for (const data of this.allClassDataByKey.values()) {
            ClassData.fillInReplacement(data);
        }
        this.log(`Done creating replacements`);
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
                    appendEdit(loc.fileName, {
                        newText: (loc.prefixText || '') + newText + (loc.suffixText || ''),
                        offset: loc.textSpan.start,
                        length: loc.textSpan.length
                    });
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
    for await (const [fileName, contents] of new Mangler(projectPath, console.log).computeNewFileContents()) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuZ2xlVHlwZVNjcmlwdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1hbmdsZVR5cGVTY3JpcHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsaUNBQWlDO0FBQ2pDLDZCQUE2QjtBQUM3Qix5QkFBeUI7QUFDekIscUNBQStCO0FBQy9CLDJDQUF5RDtBQUN6RCw2QkFBb0M7QUFFcEMsTUFBTSxVQUFVO0lBRVAsTUFBTSxDQUFDLFNBQVMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxVQUFVO1FBQzlHLFNBQVMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJO1FBQ25HLFFBQVEsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTztRQUMxRyxNQUFNLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUU1RCxNQUFNLENBQUMsU0FBUyxHQUFHLHNEQUFzRCxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVwRixNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ0YsWUFBWSxDQUE0QjtJQUV6RCxZQUFZLFdBQXNDO1FBQ2pELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxXQUFXLENBQUMsSUFB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