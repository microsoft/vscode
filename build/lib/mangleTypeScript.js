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
const allClassDataBySymbol = new Map();
const service = ts.createLanguageService(host);
const program = service.getProgram();
const checker = program.getTypeChecker();
var FieldType;
(function (FieldType) {
    FieldType[FieldType["Public"] = 0] = "Public";
    FieldType[FieldType["Protected"] = 1] = "Protected";
    FieldType[FieldType["Private"] = 2] = "Private";
})(FieldType || (FieldType = {}));
class ClassData {
    fileName;
    node;
    symbol;
    fields = new Map();
    replacements;
    parent;
    children;
    constructor(fileName, node, symbol) {
        // analyse all fields (properties and methods). Find usages of all protected and
        // private ones and keep track of all public ones (to prevent naming collisions)
        this.fileName = fileName;
        this.node = node;
        this.symbol = symbol;
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
            const symbol = checker.getSymbolAtLocation(member.name);
            if (!symbol) {
                throw new Error(`NO SYMBOL for ${node.getText()}`);
            }
            const type = ClassData._getFieldType(member);
            this.fields.set(ident, { type, symbol, pos: member.name.pos });
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
        return type === 2 /* FieldType.Private */;
    }
    static fillInReplacement(data) {
        if (data.replacements) {
            // already done
            return;
        }
        // check with parent
        if (data.parent) {
            ClassData.fillInReplacement(data.parent);
        }
        // full chain
        const classAndAllParents = [];
        let node = data;
        while (node) {
            classAndAllParents.push(node);
            node = node.parent;
        }
        const identPool = new ShortIdent(name => {
            // parents
            let node = data.parent;
            while (node) {
                if (node.isNameTaken(name)) {
                    return true;
                }
                node = node.parent;
            }
            // children
            if (data.children) {
                const stack = [...data.children];
                while (stack.length) {
                    const node = stack.pop();
                    if (node.isNameTaken(name)) {
                        return true;
                    }
                    if (node.children) {
                        stack.push(...node.children);
                    }
                }
            }
            // self
            return data.isNameTaken(name);
        });
        data.replacements = new Map();
        for (const [name, info] of data.fields) {
            if (ClassData._shouldMangle(info.type)) {
                const shortName = identPool.next();
                data.replacements.set(name, shortName);
            }
        }
    }
    // a name is taken when a field that doesn't get mangled exists or
    // when the name is already in use for replacement
    isNameTaken(name) {
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
            // taken by any other
            if (this.node.getSourceFile().identifiers.has(name)) {
                return true;
            }
        }
        return false;
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
        const extendsSymbol = getSuperType(extendsClause.types[0].expression);
        if (!extendsSymbol) {
            // IGNORE: failed to find super-class
            return;
        }
        const parent = allClassDataBySymbol.get(extendsSymbol);
        parent?._addChild(data);
    }
}
function visit(node) {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        if (node.members.length === 0) {
            // IGNORE: no members
            return;
        }
        const classSymbol = checker.getTypeAtLocation(node.name ?? node).symbol;
        if (!classSymbol) {
            throw new Error('MISSING');
        }
        if (allClassDataBySymbol.has(classSymbol)) {
            throw new Error('DUPE?');
        }
        allClassDataBySymbol.set(classSymbol, new ClassData(node.getSourceFile().fileName, node, classSymbol));
    }
    ts.forEachChild(node, visit);
}
// --- ast utils
function hasModifier(node, kind) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return Boolean(modifiers?.find(mode => mode.kind === kind));
}
function getSuperType(node) {
    const type = checker.getTypeAtLocation(node);
    if (!type.symbol) {
        return;
    }
    if (!type.symbol.declarations || type.symbol.declarations.length !== 1) {
        return;
    }
    const dec = type.symbol.declarations[0];
    if (dec.kind === ts.SyntaxKind.ClassDeclaration) {
        return type.symbol;
    }
    return undefined;
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
    console.log(`done COLLECTING ${allClassDataBySymbol.size} classes`);
    // (1.1) connect all class info
    for (const data of allClassDataBySymbol.values()) {
        ClassData.setupParents(data);
    }
    // (2) fill in replacement strings
    for (const data of allClassDataBySymbol.values()) {
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
    for (const data of allClassDataBySymbol.values()) {
        if (hasModifier(data.node, ts.SyntaxKind.DeclareKeyword)) {
            continue;
        }
        for (const [name, info] of data.fields) {
            if (!ClassData._shouldMangle(info.type)) {
                continue;
            }
            const newText = data.replacements.get(name);
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