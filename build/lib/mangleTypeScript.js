"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const fancy_log_1 = require("fancy-log");
const path_1 = require("path");
const fs = require("fs");
class ShortIdent {
    static _keywords = new Set(['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
        'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
        'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw',
        'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield']);
    static alphabet = [];
    static {
        for (let i = 97; i < 122; i++) {
            this.alphabet.push(String.fromCharCode(i));
        }
        for (let i = 65; i < 90; i++) {
            this.alphabet.push(String.fromCharCode(i));
        }
    }
    _value = 0;
    _isNameTaken;
    constructor(isNameTaken) {
        this._isNameTaken = name => {
            return ShortIdent._keywords.has(name) || isNameTaken(name);
        };
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
        const base = this.alphabet.length;
        let result = '';
        do {
            const rest = n % 50;
            result += this.alphabet[rest];
            n = (n / base) | 0;
        } while (n > 0);
        return result;
    }
}
const projectPath = 1
    ? (0, path_1.join)(__dirname, '../../src/tsconfig.json')
    : '/Users/jrieken/Code/_samples/3wm/mangePrivate/tsconfig.json';
const existingOptions = {};
const parsed = ts.readConfigFile(projectPath, ts.sys.readFile);
if (parsed.error) {
    console.log(fancy_log_1.error);
    throw parsed.error;
}
const cmdLine = ts.parseJsonConfigFileContent(parsed.config, ts.sys, (0, path_1.dirname)(projectPath), existingOptions);
if (cmdLine.errors.length > 0) {
    console.log(fancy_log_1.error);
    throw parsed.error;
}
const host = new class {
    _scriptSnapshots = new Map();
    getCompilationSettings() {
        return cmdLine.options;
    }
    getScriptFileNames() {
        return cmdLine.fileNames;
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
        return (0, path_1.dirname)(projectPath);
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
};
const allClassDataByKey = new Map();
const service = ts.createLanguageService(host);
const program = service.getProgram();
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
    static makeImplicitPublicActuallyPublic(data) {
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
                    console.warn(`WARN: protected became PUBLIC: '${name}' defined ${parent.fileName}@${info.pos}, PUBLIC via ${data.fileName}@${info.pos}`);
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
    _addChild(child) {
        this.children ??= [];
        this.children.push(child);
        child.parent = this;
    }
    static setupParents(data) {
        const extendsClause = data.node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
        if (!extendsClause) {
            // no EXTENDS-clause
            return;
        }
        const info = service.getDefinitionAtPosition(data.fileName, extendsClause.types[0].expression.getEnd());
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
        const parent = allClassDataByKey.get(key);
        if (!parent) {
            // throw new Error(`SUPER type not found: ${key}`);
            return;
        }
        parent._addChild(data);
    }
}
function visit(node) {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        const anchor = node.name ?? node;
        const key = `${node.getSourceFile().fileName}|${anchor.getStart()}`;
        if (allClassDataByKey.has(key)) {
            throw new Error('DUPE?');
        }
        allClassDataByKey.set(key, new ClassData(node.getSourceFile().fileName, node));
    }
    ts.forEachChild(node, visit);
}
// --- ast utils
function hasModifier(node, kind) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return Boolean(modifiers?.find(mode => mode.kind === kind));
}
// step 1: collect all class data and store it by symbols
// step 2: hook up extends-chaines and populate field replacement maps
// step 3: generate and apply rewrites
async function mangle() {
    // (1) find all classes and field info
    for (const file of program.getSourceFiles()) {
        if (!file.isDeclarationFile) {
            ts.forEachChild(file, visit);
        }
    }
    console.log(`done COLLECTING ${allClassDataByKey.size} classes`);
    // (1.1) connect all class info
    for (const data of allClassDataByKey.values()) {
        ClassData.setupParents(data);
    }
    // (1.2) TS-HACK: mark implicit-public protected field as public
    for (const data of allClassDataByKey.values()) {
        ClassData.makeImplicitPublicActuallyPublic(data);
    }
    // (2) fill in replacement strings
    for (const data of allClassDataByKey.values()) {
        ClassData.fillInReplacement(data);
    }
    console.log(`done creating REPLACEMENTS`);
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
    for (const data of allClassDataByKey.values()) {
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
            const locations = service.findRenameLocations(data.fileName, info.pos, false, false, true) ?? [];
            for (const loc of locations) {
                appendEdit(loc.fileName, {
                    newText: (loc.prefixText || '') + newText + (loc.suffixText || ''),
                    offset: loc.textSpan.start,
                    length: loc.textSpan.length
                });
            }
        }
    }
    console.log(`done preparing EDITS for ${editsByFile.size} files`);
    // (4) apply renames
    let savedBytes = 0;
    for (const item of program.getSourceFiles()) {
        let newFullText;
        const edits = editsByFile.get(item.fileName);
        if (!edits) {
            // just copy
            newFullText = item.getFullText();
        }
        else {
            // apply renames
            edits.sort((a, b) => b.offset - a.offset);
            const characters = item.getFullText().split('');
            let lastEdit;
            for (const edit of edits) {
                if (lastEdit) {
                    if (lastEdit.offset === edit.offset) {
                        //
                        if (lastEdit.length !== edit.length || lastEdit.newText !== edit.newText) {
                            console.log('OVERLAPPING edit', item.fileName, edit.offset, edits);
                            throw new Error('OVERLAPPING edit');
                        }
                        else {
                            continue;
                        }
                    }
                }
                lastEdit = edit;
                const removed = characters.splice(edit.offset, edit.length, edit.newText);
                savedBytes += removed.length - edit.newText.length;
            }
            newFullText = characters.join('');
        }
        const projectBase = (0, path_1.dirname)(projectPath);
        const newProjectBase = (0, path_1.join)((0, path_1.dirname)(projectBase), (0, path_1.basename)(projectBase) + '-mangle');
        const newFilePath = (0, path_1.join)(newProjectBase, (0, path_1.relative)(projectBase, item.fileName));
        await fs.promises.mkdir((0, path_1.dirname)(newFilePath), { recursive: true });
        await fs.promises.writeFile(newFilePath, newFullText);
    }
    console.log(`DONE saved ${savedBytes / 1000}kb`);
}
mangle();
