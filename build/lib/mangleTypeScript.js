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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuZ2xlVHlwZVNjcmlwdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1hbmdsZVR5cGVTY3JpcHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxpQ0FBaUM7QUFDakMseUNBQWtDO0FBQ2xDLCtCQUF5RDtBQUN6RCx5QkFBeUI7QUFFekIsTUFBTSxVQUFVO0lBRVAsTUFBTSxDQUFDLFNBQVMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxVQUFVO1FBQzlHLFNBQVMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJO1FBQ25HLFFBQVEsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTztRQUMxRyxNQUFNLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUVwRSxNQUFNLENBQUMsUUFBUSxHQUFhLEVBQUUsQ0FBQztJQUUvQjtRQUNDLEtBQUssSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDOUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQzNDO1FBQ0QsS0FBSyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFD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