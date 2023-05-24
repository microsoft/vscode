"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mangler = void 0;
const fs = require("fs");
const path = require("path");
const process_1 = require("process");
const source_map_1 = require("source-map");
const ts = require("typescript");
const url_1 = require("url");
const workerpool = require("workerpool");
const staticLanguageServiceHost_1 = require("./staticLanguageServiceHost");
const buildfile = require('../../../src/buildfile');
class ShortIdent {
    prefix;
    static _keywords = new Set(['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
        'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
        'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw',
        'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield']);
    static _alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890$_'.split('');
    _value = 0;
    constructor(prefix) {
        this.prefix = prefix;
    }
    next(isNameTaken) {
        const candidate = this.prefix + ShortIdent.convert(this._value);
        this._value++;
        if (ShortIdent._keywords.has(candidate) || /^[_0-9]/.test(candidate) || isNameTaken?.(candidate)) {
            // try again
            return this.next(isNameTaken);
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
        const isNameTaken = (name) => {
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
        };
        const identPool = new ShortIdent('');
        for (const [name, info] of data.fields) {
            if (ClassData._shouldMangle(info.type)) {
                const shortName = identPool.next(isNameTaken);
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
    idents = new ShortIdent('$');
    next() {
        return this.idents.next();
    }
};
const skippedExportMangledFiles = [
    // Build
    'css.build',
    'nls.build',
    // Monaco
    'editorCommon',
    'editorOptions',
    'editorZoom',
    'standaloneEditor',
    'standaloneEnums',
    'standaloneLanguages',
    // Generated
    'extensionsApiProposals',
    // Module passed around as type
    'pfs',
    // entry points
    ...[
        buildfile.entrypoint('vs/server/node/server.main.ts', []),
        buildfile.entrypoint('vs/workbench/workbench.desktop.main', []),
        buildfile.base,
        buildfile.workerExtensionHost,
        buildfile.workerNotebook,
        buildfile.workerLanguageDetection,
        buildfile.workerLocalFileSearch,
        buildfile.workerProfileAnalysis,
        buildfile.workbenchDesktop,
        buildfile.workbenchWeb,
        buildfile.code
    ].flat().map(x => x.name),
];
const skippedExportMangledProjects = [
    // Test projects
    'vscode-api-tests',
    // These projects use webpack to dynamically rewrite imports, which messes up our mangling
    'configuration-editing',
    'microsoft-authentication',
    'github-authentication',
    'html-language-features/server',
];
const skippedExportMangledSymbols = [
    // Don't mangle extension entry points
    'activate',
    'deactivate',
];
class DeclarationData {
    fileName;
    node;
    service;
    replacementName;
    constructor(fileName, node, service) {
        this.fileName = fileName;
        this.node = node;
        this.service = service;
        // Todo: generate replacement names based on usage count, with more used names getting shorter identifiers
        this.replacementName = fileIdents.next();
    }
    get locations() {
        if (ts.isVariableDeclaration(this.node)) {
            // If the const aliases any types, we need to rename those too
            const definitionResult = this.service.getDefinitionAndBoundSpan(this.fileName, this.node.name.getStart());
            if (definitionResult?.definitions && definitionResult.definitions.length > 1) {
                return definitionResult.definitions.map(x => ({ fileName: x.fileName, offset: x.textSpan.start }));
            }
        }
        return [{
                fileName: this.fileName,
                offset: this.node.name.getStart()
            }];
    }
    shouldMangle(newName) {
        const currentName = this.node.name.getText();
        if (currentName.startsWith('$') || skippedExportMangledSymbols.includes(currentName)) {
            return false;
        }
        // New name is longer the existing one :'(
        if (newName.length >= currentName.length) {
            return false;
        }
        // Don't mangle functions we've explicitly opted out
        if (this.node.getFullText().includes('@skipMangle')) {
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
    allExportedSymbols = new Set();
    service;
    renameWorkerPool;
    constructor(projectPath, log = () => { }) {
        this.projectPath = projectPath;
        this.log = log;
        this.service = ts.createLanguageService(new staticLanguageServiceHost_1.StaticLanguageServiceHost(projectPath));
        this.renameWorkerPool = workerpool.pool(path.join(__dirname, 'renameWorker.js'), {
            maxWorkers: 2,
            minWorkers: 'max'
        });
    }
    async computeNewFileContents(strictImplicitPublicHandling) {
        // STEP:
        // - Find all classes and their field info.
        // - Find exported symbols.
        const visit = (node) => {
            if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
                const anchor = node.name ?? node;
                const key = `${node.getSourceFile().fileName}|${anchor.getStart()}`;
                if (this.allClassDataByKey.has(key)) {
                    throw new Error('DUPE?');
                }
                this.allClassDataByKey.set(key, new ClassData(node.getSourceFile().fileName, node));
            }
            // Find exported classes, functions, and vars
            if ((
            // Exported class
            ts.isClassDeclaration(node)
                && hasModifier(node, ts.SyntaxKind.ExportKeyword)
                && node.name) || (
            // Exported function
            ts.isFunctionDeclaration(node)
                && ts.isSourceFile(node.parent)
                && hasModifier(node, ts.SyntaxKind.ExportKeyword)
                && node.name && node.body // On named function and not on the overload
            ) || (
            // Exported variable
            ts.isVariableDeclaration(node)
                && hasModifier(node.parent.parent, ts.SyntaxKind.ExportKeyword) // Variable statement is exported
                && ts.isSourceFile(node.parent.parent.parent))
            // Disabled for now because we need to figure out how to handle
            // enums that are used in monaco or extHost interfaces.
            /* || (
                // Exported enum
                ts.isEnumDeclaration(node)
                && ts.isSourceFile(node.parent)
                && hasModifier(node, ts.SyntaxKind.ExportKeyword)
                && !hasModifier(node, ts.SyntaxKind.ConstKeyword) // Don't bother mangling const enums because these are inlined
                && node.name
            */
            ) {
                if (isInAmbientContext(node)) {
                    return;
                }
                this.allExportedSymbols.add(new DeclarationData(node.getSourceFile().fileName, node, this.service));
            }
            ts.forEachChild(node, visit);
        };
        for (const file of this.service.getProgram().getSourceFiles()) {
            if (!file.isDeclarationFile) {
                ts.forEachChild(file, visit);
            }
        }
        this.log(`Done collecting. Classes: ${this.allClassDataByKey.size}. Exported symbols: ${this.allExportedSymbols.size}`);
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
        for (const data of this.allExportedSymbols.values()) {
            if (data.fileName.endsWith('.d.ts')
                || skippedExportMangledProjects.some(proj => data.fileName.includes(proj))
                || skippedExportMangledFiles.some(file => data.fileName.endsWith(file + '.ts'))) {
                continue;
            }
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
function isInAmbientContext(node) {
    for (let p = node.parent; p; p = p.parent) {
        if (ts.isModuleDeclaration(p)) {
            return true;
        }
    }
    return false;
}
function normalize(path) {
    return path.replace(/\\/g, '/');
}
async function _run() {
    const root = path.join(__dirname, '..', '..', '..');
    const projectBase = path.join(root, 'src');
    const projectPath = path.join(projectBase, 'tsconfig.json');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLHFDQUErQjtBQUMvQiwyQ0FBeUQ7QUFDekQsaUNBQWlDO0FBQ2pDLDZCQUFvQztBQUNwQyx5Q0FBeUM7QUFDekMsMkVBQXdFO0FBQ3hFLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBRXBELE1BQU0sVUFBVTtJQVlHO0lBVlYsTUFBTSxDQUFDLFNBQVMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxVQUFVO1FBQzlHLFNBQVMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJO1FBQ25HLFFBQVEsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTztRQUMxRyxNQUFNLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUU1RCxNQUFNLENBQUMsU0FBUyxHQUFHLGtFQUFrRSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVoRyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBRW5CLFlBQ2tCLE1BQWM7UUFBZCxXQUFNLEdBQU4sTUFBTSxDQUFRO0lBQzVCLENBQUM7SUFFTCxJQUFJLENBQUMsV0FBdUM7UUFDM0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDZCxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksV0FBVyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDakcsWUFBWTtZQUNaLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztTQUM5QjtRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQVM7UUFDL0IsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7UUFDbkMsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLEdBQUc7WUFDRixNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDO1lBQ3RCLE1BQU0sSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQy9CLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDbkIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ2hCLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQzs7QUFHRixJQUFXLFNBSVY7QUFKRCxXQUFXLFNBQVM7SUFDbkIsNkNBQU0sQ0FBQTtJQUNOLG1EQUFTLENBQUE7SUFDVCwrQ0FBTyxDQUFBO0FBQ1IsQ0FBQyxFQUpVLFNBQVMsS0FBVCxTQUFTLFFBSW5CO0FBRUQsTUFBTSxTQUFTO0lBVUo7SUFDQTtJQVRWLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBNEMsQ0FBQztJQUVyRCxZQUFZLENBQWtDO0lBRXRELE1BQU0sQ0FBd0I7SUFDOUIsUUFBUSxDQUEwQjtJQUVsQyxZQUNVLFFBQWdCLEVBQ2hCLElBQThDO1FBRXZELGdGQUFnRjtRQUNoRixnRkFBZ0Y7UUFKdkUsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUNoQixTQUFJLEdBQUosSUFBSSxDQUEwQztRQUt2RCxNQUFNLFVBQVUsR0FBNEIsRUFBRSxDQUFDO1FBQy9DLEtBQUssTUFBTSxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNsQyxJQUFJLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDbkMsb0JBQW9CO2dCQUNwQixVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2FBRXhCO2lCQUFNLElBQUksRUFBRSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUM1Qyx1QkFBdUI7Z0JBQ3ZCLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7YUFFeEI7aUJBQU0sSUFBSSxFQUFFLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUNwQyw4QkFBOEI7Z0JBQzlCLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7YUFFeEI7aUJBQU0sSUFBSSxFQUFFLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUNwQyw4QkFBOEI7Z0JBQzlCLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7YUFFeEI7aUJBQU0sSUFBSSxFQUFFLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQy9DLGlEQUFpRDtnQkFDakQsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLENBQUMsVUFBVSxFQUFFO29CQUN0QyxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUM7MkJBQ2hELFdBQVcsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQzsyQkFDbEQsV0FBVyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQzsyQkFDL0MsV0FBVyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FBQyxFQUNuRDt3QkFDRCxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO3FCQUN2QjtpQkFDRDthQUNEO1NBQ0Q7UUFDRCxLQUFLLE1BQU0sTUFBTSxJQUFJLFVBQVUsRUFBRTtZQUNoQyxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxLQUFLLEVBQUU7Z0JBQ1gsU0FBUzthQUNUO1lBQ0QsTUFBTSxJQUFJLEdBQUcsU0FBUyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM3QyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLE1BQU0sQ0FBQyxJQUFLLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1NBQy9EO0lBQ0YsQ0FBQztJQUVPLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBeUI7UUFDdEQsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDZixPQUFPLFNBQVMsQ0FBQztTQUNqQjtRQUNELE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDdEIsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzNCLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLG9CQUFvQixFQUFFO1lBQ3JELElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLEVBQUU7Z0JBQ3pELCtDQUErQztnQkFDL0MsT0FBTzthQUNQO1lBQ0QsVUFBVTtZQUNWLEtBQUssR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUMvQztRQUVELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVPLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBYTtRQUN6QyxJQUFJLFdBQVcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRTtZQUNwRCxpQ0FBeUI7U0FDekI7YUFBTSxJQUFJLFdBQVcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFO1lBQzdELG1DQUEyQjtTQUMzQjthQUFNO1lBQ04sZ0NBQXdCO1NBQ3hCO0lBQ0YsQ0FBQztJQUVELE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBZTtRQUNuQyxPQUFPLElBQUksOEJBQXNCO2VBQzdCLElBQUksZ0NBQXdCLENBQzlCO0lBQ0gsQ0FBQztJQUVELE1BQU0sQ0FBQyxnQ0FBZ0MsQ0FBQyxJQUFlLEVBQUUsZUFBa0U7UUFDMUgsVUFBVTtRQUNWLGlGQUFpRjtRQUNqRixpRkFBaUY7UUFDakYsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDdkMsSUFBSSxJQUFJLENBQUMsSUFBSSw2QkFBcUIsRUFBRTtnQkFDbkMsU0FBUzthQUNUO1lBQ0QsSUFBSSxNQUFNLEdBQTBCLElBQUksQ0FBQyxNQUFNLENBQUM7WUFDaEQsT0FBTyxNQUFNLEVBQUU7Z0JBQ2QsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLGdDQUF3QixFQUFFO29CQUMxRCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLDZCQUE2QixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUMxRyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDbEYsZUFBZSxDQUFDLElBQUksRUFBRSxJQUFJLElBQUksVUFBVSxNQUFNLENBQUMsUUFBUSxJQUFJLFNBQVMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLEVBQUUsR0FBRyxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFFekgsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFFLENBQUMsSUFBSSwyQkFBbUIsQ0FBQztpQkFDakQ7Z0JBQ0QsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7YUFDdkI7U0FDRDtJQUNGLENBQUM7SUFFRCxNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBZTtRQUV2QyxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDdEIsZUFBZTtZQUNmLE9BQU87U0FDUDtRQUVELHdCQUF3QjtRQUN4QixJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDaEIsU0FBUyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUN6QztRQUVELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUU5QixNQUFNLFdBQVcsR0FBRyxDQUFDLElBQVksRUFBRSxFQUFFO1lBQ3BDLGdCQUFnQjtZQUNoQixJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQzVCLE9BQU8sSUFBSSxDQUFDO2FBQ1o7WUFFRCxVQUFVO1lBQ1YsSUFBSSxNQUFNLEdBQTBCLElBQUksQ0FBQyxNQUFNLENBQUM7WUFDaEQsT0FBTyxNQUFNLEVBQUU7Z0JBQ2QsSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUM5QixPQUFPLElBQUksQ0FBQztpQkFDWjtnQkFDRCxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQzthQUN2QjtZQUVELFdBQVc7WUFDWCxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7Z0JBQ2xCLE1BQU0sS0FBSyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ2pDLE9BQU8sS0FBSyxDQUFDLE1BQU0sRUFBRTtvQkFDcEIsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsRUFBRyxDQUFDO29CQUMxQixJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUU7d0JBQzVCLE9BQU8sSUFBSSxDQUFDO3FCQUNaO29CQUNELElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTt3QkFDbEIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztxQkFDN0I7aUJBQ0Q7YUFDRDtZQUVELE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQyxDQUFDO1FBQ0YsTUFBTSxTQUFTLEdBQUcsSUFBSSxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFckMsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDdkMsSUFBSSxTQUFTLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDdkMsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztnQkFDOUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2FBQ3ZDO1NBQ0Q7SUFDRixDQUFDO0lBRUQsa0VBQWtFO0lBQ2xFLGtEQUFrRDtJQUMxQyxZQUFZLENBQUMsSUFBWTtRQUNoQyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNuRixlQUFlO1lBQ2YsT0FBTyxJQUFJLENBQUM7U0FDWjtRQUNELElBQUksSUFBSSxDQUFDLFlBQVksRUFBRTtZQUN0QixLQUFLLE1BQU0sU0FBUyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLEVBQUU7Z0JBQ25ELElBQUksU0FBUyxLQUFLLElBQUksRUFBRTtvQkFDdkIsNkNBQTZDO29CQUM3QyxPQUFPLElBQUksQ0FBQztpQkFDWjthQUNEO1NBQ0Q7UUFFRCxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUU7WUFDdkMsT0FBTyxJQUFJLENBQUM7U0FDWjtRQUVELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELGVBQWUsQ0FBQyxJQUFZO1FBQzNCLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBRSxDQUFDO1FBQzFDLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDekIsT0FBTyxNQUFNLEVBQUU7WUFDZCxJQUFJLE1BQU0sQ0FBQyxZQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksZ0NBQXdCLEVBQUU7Z0JBQzVGLEtBQUssR0FBRyxNQUFNLENBQUMsWUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUUsSUFBSSxLQUFLLENBQUM7YUFDakQ7WUFDRCxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztTQUN2QjtRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELHNCQUFzQjtJQUV0QixRQUFRLENBQUMsS0FBZ0I7UUFDeEIsSUFBSSxDQUFDLFFBQVEsS0FBSyxFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUIsS0FBSyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7SUFDckIsQ0FBQztDQUNEO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxJQUFhLEVBQUUsSUFBWTtJQUNyRCxNQUFNLFdBQVcsR0FBUyxJQUFJLENBQUMsYUFBYSxFQUFHLENBQUMsV0FBVyxDQUFDO0lBQzVELElBQUksV0FBVyxZQUFZLEdBQUcsRUFBRTtRQUMvQixJQUFJLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDMUIsT0FBTyxJQUFJLENBQUM7U0FDWjtLQUNEO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsTUFBTSxVQUFVLEdBQUcsSUFBSTtJQUNMLE1BQU0sR0FBRyxJQUFJLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUU5QyxJQUFJO1FBQ0gsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzNCLENBQUM7Q0FDRCxDQUFDO0FBRUYsTUFBTSx5QkFBeUIsR0FBRztJQUNqQyxRQUFRO0lBQ1IsV0FBVztJQUNYLFdBQVc7SUFFWCxTQUFTO0lBQ1QsY0FBYztJQUNkLGVBQWU7SUFDZixZQUFZO0lBQ1osa0JBQWtCO0lBQ2xCLGlCQUFpQjtJQUNqQixxQkFBcUI7SUFFckIsWUFBWTtJQUNaLHdCQUF3QjtJQUV4QiwrQkFBK0I7SUFDL0IsS0FBSztJQUVMLGVBQWU7SUFDZixHQUFHO1FBQ0YsU0FBUyxDQUFDLFVBQVUsQ0FBQywrQkFBK0IsRUFBRSxFQUFFLENBQUM7UUFDekQsU0FBUyxDQUFDLFVBQVUsQ0FBQyxxQ0FBcUMsRUFBRSxFQUFFLENBQUM7UUFDL0QsU0FBUyxDQUFDLElBQUk7UUFDZCxTQUFTLENBQUMsbUJBQW1CO1FBQzdCLFNBQVMsQ0FBQyxjQUFjO1FBQ3hCLFNBQVMsQ0FBQyx1QkFBdUI7UUFDakMsU0FBUyxDQUFDLHFCQUFxQjtRQUMvQixTQUFTLENBQUMscUJBQXFCO1FBQy9CLFNBQVMsQ0FBQyxnQkFBZ0I7UUFDMUIsU0FBUyxDQUFDLFlBQVk7UUFDdEIsU0FBUyxDQUFDLElBQUk7S0FDZCxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7Q0FDekIsQ0FBQztBQUVGLE1BQU0sNEJBQTRCLEdBQUc7SUFDcEMsZ0JBQWdCO0lBQ2hCLGtCQUFrQjtJQUVsQiwwRkFBMEY7SUFDMUYsdUJBQXVCO0lBQ3ZCLDBCQUEwQjtJQUMxQix1QkFBdUI7SUFDdkIsK0JBQStCO0NBQy9CLENBQUM7QUFFRixNQUFNLDJCQUEyQixHQUFHO0lBQ25DLHNDQUFzQztJQUN0QyxVQUFVO0lBQ1YsWUFBWTtDQUNaLENBQUM7QUFFRixNQUFNLGVBQWU7SUFLVjtJQUNBO0lBQ1E7SUFMVCxlQUFlLENBQVM7SUFFakMsWUFDVSxRQUFnQixFQUNoQixJQUFnRyxFQUN4RixPQUEyQjtRQUZuQyxhQUFRLEdBQVIsUUFBUSxDQUFRO1FBQ2hCLFNBQUksR0FBSixJQUFJLENBQTRGO1FBQ3hGLFlBQU8sR0FBUCxPQUFPLENBQW9CO1FBRTVDLDBHQUEwRztRQUMxRyxJQUFJLENBQUMsZUFBZSxHQUFHLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRUQsSUFBSSxTQUFTO1FBQ1osSUFBSSxFQUFFLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ3hDLDhEQUE4RDtZQUM5RCxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQzFHLElBQUksZ0JBQWdCLEVBQUUsV0FBVyxJQUFJLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO2dCQUM3RSxPQUFPLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO2FBQ25HO1NBQ0Q7UUFFRCxPQUFPLENBQUM7Z0JBQ1AsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO2dCQUN2QixNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFLLENBQUMsUUFBUSxFQUFFO2FBQ2xDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxZQUFZLENBQUMsT0FBZTtRQUMzQixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUM5QyxJQUFJLFdBQVcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksMkJBQTJCLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxFQUFFO1lBQ3JGLE9BQU8sS0FBSyxDQUFDO1NBQ2I7UUFFRCwwQ0FBMEM7UUFDMUMsSUFBSSxPQUFPLENBQUMsTUFBTSxJQUFJLFdBQVcsQ0FBQyxNQUFNLEVBQUU7WUFDekMsT0FBTyxLQUFLLENBQUM7U0FDYjtRQUVELG9EQUFvRDtRQUNwRCxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxFQUFFO1lBQ3BELE9BQU8sS0FBSyxDQUFDO1NBQ2I7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7Q0FDRDtBQU9EOzs7Ozs7OztHQVFHO0FBQ0gsTUFBYSxPQUFPO0lBU0Q7SUFDQTtJQVJELGlCQUFpQixHQUFHLElBQUksR0FBRyxFQUFxQixDQUFDO0lBQ2pELGtCQUFrQixHQUFHLElBQUksR0FBRyxFQUFtQixDQUFDO0lBRWhELE9BQU8sQ0FBcUI7SUFDNUIsZ0JBQWdCLENBQXdCO0lBRXpELFlBQ2tCLFdBQW1CLEVBQ25CLE1BQTBCLEdBQUcsRUFBRSxHQUFHLENBQUM7UUFEbkMsZ0JBQVcsR0FBWCxXQUFXLENBQVE7UUFDbkIsUUFBRyxHQUFILEdBQUcsQ0FBZ0M7UUFFcEQsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUMscUJBQXFCLENBQUMsSUFBSSxxREFBeUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBRXBGLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLEVBQUU7WUFDaEYsVUFBVSxFQUFFLENBQUM7WUFDYixVQUFVLEVBQUUsS0FBSztTQUNqQixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLHNCQUFzQixDQUFDLDRCQUEwQztRQUV0RSxRQUFRO1FBQ1IsMkNBQTJDO1FBQzNDLDJCQUEyQjtRQUUzQixNQUFNLEtBQUssR0FBRyxDQUFDLElBQWEsRUFBUSxFQUFFO1lBQ3JDLElBQUksRUFBRSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDOUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUM7Z0JBQ2pDLE1BQU0sR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztnQkFDcEUsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFO29CQUNwQyxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2lCQUN6QjtnQkFDRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDcEY7WUFFRCw2Q0FBNkM7WUFDN0MsSUFDQztZQUNDLGlCQUFpQjtZQUNqQixFQUFFLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDO21CQUN4QixXQUFXLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDO21CQUM5QyxJQUFJLENBQUMsSUFBSSxDQUNaLElBQUk7WUFDSixvQkFBb0I7WUFDcEIsRUFBRSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQzttQkFDM0IsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO21CQUM1QixXQUFXLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDO21CQUM5QyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsNENBQTRDO2FBQ3RFLElBQUk7WUFDSixvQkFBb0I7WUFDcEIsRUFBRSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQzttQkFDM0IsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsaUNBQWlDO21CQUM5RixFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUM3QztZQUVELCtEQUErRDtZQUMvRCx1REFBdUQ7WUFDdkQ7Ozs7Ozs7Y0FPRTtjQUNEO2dCQUNELElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUU7b0JBQzdCLE9BQU87aUJBQ1A7Z0JBRUQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzthQUNwRztZQUVELEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlCLENBQUMsQ0FBQztRQUVGLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUcsQ0FBQyxjQUFjLEVBQUUsRUFBRTtZQUMvRCxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFO2dCQUM1QixFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQzthQUM3QjtTQUNEO1FBQ0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksdUJBQXVCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBR3hILHFDQUFxQztRQUVyQyxNQUFNLFlBQVksR0FBRyxDQUFDLElBQWUsRUFBRSxFQUFFO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNyRyxJQUFJLENBQUMsYUFBYSxFQUFFO2dCQUNuQixvQkFBb0I7Z0JBQ3BCLE9BQU87YUFDUDtZQUVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQzdHLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7Z0JBQy9CLDJDQUEyQztnQkFDM0MsT0FBTzthQUNQO1lBRUQsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtnQkFDdEIsc0NBQXNDO2dCQUN0QyxPQUFPO2FBQ1A7WUFFRCxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsSUFBSSxDQUFDO1lBQzFCLE1BQU0sR0FBRyxHQUFHLEdBQUcsVUFBVSxDQUFDLFFBQVEsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2xFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDL0MsSUFBSSxDQUFDLE1BQU0sRUFBRTtnQkFDWixtREFBbUQ7Z0JBQ25ELE9BQU87YUFDUDtZQUNELE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsQ0FBQyxDQUFDO1FBQ0YsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDbkQsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ25CO1FBRUQsdUVBQXVFO1FBQ3ZFLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxFQUFvQixDQUFDO1FBQy9DLElBQUksc0JBQXNCLEdBQUcsS0FBSyxDQUFDO1FBQ25DLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ25ELFNBQVMsQ0FBQyxnQ0FBZ0MsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFZLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFO2dCQUM1RSxNQUFNLEdBQUcsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNqQyxJQUFJLEdBQUcsRUFBRTtvQkFDUixHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2lCQUNkO3FCQUFNO29CQUNOLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztpQkFDNUI7Z0JBRUQsSUFBSSw0QkFBNEIsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDNUUsc0JBQXNCLEdBQUcsSUFBSSxDQUFDO2lCQUM5QjtZQUNGLENBQUMsQ0FBQyxDQUFDO1NBQ0g7UUFDRCxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksVUFBVSxFQUFFO1lBQ3JDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxHQUFHLDhCQUE4QixJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUN2RTtRQUNELElBQUksc0JBQXNCLEVBQUU7WUFDM0IsTUFBTSxPQUFPLEdBQUcsc0lBQXNJLENBQUM7WUFDdkosSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDOUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztTQUN6QjtRQUVELGlEQUFpRDtRQUNqRCxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUNuRCxTQUFTLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDbEM7UUFDRCxJQUFJLENBQUMsR0FBRyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFFN0MsNkJBQTZCO1FBQzdCLElBQUksQ0FBQyxHQUFHLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUcxQyxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQUU5QyxNQUFNLFVBQVUsR0FBRyxDQUFDLFFBQWdCLEVBQUUsSUFBVSxFQUFFLEVBQUU7WUFDbkQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN4QyxJQUFJLENBQUMsS0FBSyxFQUFFO2dCQUNYLFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzthQUNsQztpQkFBTTtnQkFDTixLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ2pCO1FBQ0YsQ0FBQyxDQUFDO1FBQ0YsTUFBTSxZQUFZLEdBQUcsQ0FBQyxPQUFlLEVBQUUsR0FBc0IsRUFBRSxFQUFFO1lBQ2hFLFVBQVUsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFO2dCQUN4QixPQUFPLEVBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQyxHQUFHLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO2dCQUNsRSxNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLO2dCQUMxQixNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNO2FBQzNCLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQztRQUlGLE1BQU0sYUFBYSxHQUFtRyxFQUFFLENBQUM7UUFFekgsTUFBTSxXQUFXLEdBQUcsQ0FBQyxRQUFnQixFQUFFLEdBQVcsRUFBRSxPQUFlLEVBQUUsRUFBRTtZQUN0RSxhQUFhLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBVyxxQkFBcUIsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7aUJBQ2hJLElBQUksQ0FBQyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUM7UUFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUNuRCxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLEVBQUU7Z0JBQ3pELFNBQVM7YUFDVDtZQUVELE1BQU0sRUFBRSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtnQkFDL0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUN4QyxTQUFTLE1BQU0sQ0FBQztpQkFDaEI7Z0JBRUQsb0RBQW9EO2dCQUNwRCx1REFBdUQ7Z0JBQ3ZELElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7Z0JBQ3pCLE9BQU8sTUFBTSxFQUFFO29CQUNkLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSw2QkFBcUIsRUFBRTt3QkFDdkQsU0FBUyxNQUFNLENBQUM7cUJBQ2hCO29CQUNELE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO2lCQUN2QjtnQkFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMzQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2FBQzlDO1NBQ0Q7UUFFRCxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUNwRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQzttQkFDL0IsNEJBQTRCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7bUJBQ3ZFLHlCQUF5QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUM5RTtnQkFDRCxTQUFTO2FBQ1Q7WUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUU7Z0JBQzdDLFNBQVM7YUFDVDtZQUVELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUM7WUFDckMsS0FBSyxNQUFNLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUU7Z0JBQ2xELFdBQVcsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2FBQ3ZDO1NBQ0Q7UUFFRCxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDaEQsS0FBSyxNQUFNLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxJQUFJLE1BQU0sRUFBRTtnQkFDNUMsS0FBSyxNQUFNLEdBQUcsSUFBSSxTQUFTLEVBQUU7b0JBQzVCLFlBQVksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7aUJBQzNCO2FBQ0Q7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRXhDLElBQUksQ0FBQyxHQUFHLENBQUMseUJBQXlCLFdBQVcsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDO1FBRTVELDBDQUEwQztRQUMxQyxNQUFNLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBd0IsQ0FBQztRQUMvQyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFFbkIsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRyxDQUFDLGNBQWMsRUFBRSxFQUFFO1lBRS9ELE1BQU0sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUcsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ2hGLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2xELE1BQU0sYUFBYSxHQUFHLE9BQU8sSUFBSSxJQUFBLG1CQUFhLEVBQUMsVUFBVSxJQUFJLFVBQVUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBRXBGLGNBQWM7WUFDZCxJQUFJLFNBQXlDLENBQUM7WUFFOUMsSUFBSSxXQUFtQixDQUFDO1lBQ3hCLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzdDLElBQUksQ0FBQyxLQUFLLEVBQUU7Z0JBQ1gsWUFBWTtnQkFDWixXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2FBRWpDO2lCQUFNO2dCQUNOLHVCQUF1QjtnQkFDdkIsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQzdFLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxFQUFxQixDQUFDO2dCQUVwRCxnQkFBZ0I7Z0JBQ2hCLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFFaEQsSUFBSSxRQUEwQixDQUFDO2dCQUUvQixLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRTtvQkFDekIsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFO3dCQUNoRCxFQUFFO3dCQUNGLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDLE9BQU8sRUFBRTs0QkFDekUsSUFBSSxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7NEJBQ3ZFLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQzt5QkFDcEM7NkJBQU07NEJBQ04sU0FBUzt5QkFDVDtxQkFDRDtvQkFDRCxRQUFRLEdBQUcsSUFBSSxDQUFDO29CQUNoQixNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUN2RixVQUFVLElBQUksV0FBVyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQztvQkFFdkQsY0FBYztvQkFDZCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUc1RCxJQUFJLFFBQVEsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDNUMsSUFBSSxDQUFDLFFBQVEsRUFBRTt3QkFDZCxRQUFRLEdBQUcsRUFBRSxDQUFDO3dCQUNkLGNBQWMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztxQkFDdkM7b0JBQ0QsUUFBUSxDQUFDLE9BQU8sQ0FBQzt3QkFDaEIsTUFBTSxFQUFFLGdCQUFnQjt3QkFDeEIsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLE1BQU0sRUFBRSxHQUFHLENBQUMsU0FBUyxFQUFFO3dCQUN2RCxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxTQUFTLEVBQUU7d0JBQ3hELElBQUksRUFBRSxXQUFXO3FCQUNqQixFQUFFO3dCQUNGLE1BQU0sRUFBRSxnQkFBZ0I7d0JBQ3hCLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFO3dCQUNyRSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUU7cUJBQzlFLENBQUMsQ0FBQztpQkFDSDtnQkFFRCxvRUFBb0U7Z0JBQ3BFLFNBQVMsR0FBRyxJQUFJLCtCQUFrQixDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO2dCQUN0RyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBQ2pFLEtBQUssTUFBTSxDQUFDLEVBQUUsUUFBUSxDQUFDLElBQUksY0FBYyxFQUFFO29CQUMxQyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7b0JBQ2xCLEtBQUssTUFBTSxPQUFPLElBQUksUUFBUSxFQUFFO3dCQUMvQixTQUFTLENBQUMsVUFBVSxDQUFDOzRCQUNwQixHQUFHLE9BQU87NEJBQ1YsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxTQUFTLEVBQUU7eUJBQ3pGLENBQUMsQ0FBQzt3QkFDSCxTQUFTLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7cUJBQ2hFO2lCQUNEO2dCQUVELFdBQVcsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ2xDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNsRjtRQUVELElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxVQUFVLEdBQUcsSUFBSSxVQUFVLENBQUMsQ0FBQztRQUMvQyxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7Q0FDRDtBQW5VRCwwQkFtVUM7QUFFRCxnQkFBZ0I7QUFFaEIsU0FBUyxXQUFXLENBQUMsSUFBYSxFQUFFLElBQW1CO0lBQ3RELE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ2hGLE9BQU8sT0FBTyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDN0QsQ0FBQztBQUVELFNBQVMsa0JBQWtCLENBQUMsSUFBYTtJQUN4QyxLQUFLLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFO1FBQzFDLElBQUksRUFBRSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzlCLE9BQU8sSUFBSSxDQUFDO1NBQ1o7S0FDRDtJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQVMsU0FBUyxDQUFDLElBQVk7SUFDOUIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBRUQsS0FBSyxVQUFVLElBQUk7SUFDbEIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNwRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMzQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUM1RCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztJQUU5RixFQUFFLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxjQUFjLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUU1RCxNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3RELEtBQUssTUFBTSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsSUFBSSxNQUFNLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNoRyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN2RCxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUU7WUFDdkIsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEdBQUcsTUFBTSxFQUFFLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztTQUN0RTtLQUNEO0FBQ0YsQ0FBQztBQUVELElBQUksVUFBVSxLQUFLLGNBQUksQ0FBQyxDQUFDLENBQUMsRUFBRTtJQUMzQixJQUFJLEVBQUUsQ0FBQztDQUNQIn0=