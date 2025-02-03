"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeclarationResolver = exports.FSProvider = exports.RECIPE_PATH = void 0;
exports.run3 = run3;
exports.execute = execute;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fancy_log_1 = __importDefault(require("fancy-log"));
const ansi_colors_1 = __importDefault(require("ansi-colors"));
const dtsv = '3';
const tsfmt = require('../../tsfmt.json');
const SRC = path_1.default.join(__dirname, '../../src');
exports.RECIPE_PATH = path_1.default.join(__dirname, '../monaco/monaco.d.ts.recipe');
const DECLARATION_PATH = path_1.default.join(__dirname, '../../src/vs/monaco.d.ts');
function logErr(message, ...rest) {
    (0, fancy_log_1.default)(ansi_colors_1.default.yellow(`[monaco.d.ts]`), message, ...rest);
}
function isDeclaration(ts, a) {
    return (a.kind === ts.SyntaxKind.InterfaceDeclaration
        || a.kind === ts.SyntaxKind.EnumDeclaration
        || a.kind === ts.SyntaxKind.ClassDeclaration
        || a.kind === ts.SyntaxKind.TypeAliasDeclaration
        || a.kind === ts.SyntaxKind.FunctionDeclaration
        || a.kind === ts.SyntaxKind.ModuleDeclaration);
}
function visitTopLevelDeclarations(ts, sourceFile, visitor) {
    let stop = false;
    const visit = (node) => {
        if (stop) {
            return;
        }
        switch (node.kind) {
            case ts.SyntaxKind.InterfaceDeclaration:
            case ts.SyntaxKind.EnumDeclaration:
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.VariableStatement:
            case ts.SyntaxKind.TypeAliasDeclaration:
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.ModuleDeclaration:
                stop = visitor(node);
        }
        if (stop) {
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}
function getAllTopLevelDeclarations(ts, sourceFile) {
    const all = [];
    visitTopLevelDeclarations(ts, sourceFile, (node) => {
        if (node.kind === ts.SyntaxKind.InterfaceDeclaration || node.kind === ts.SyntaxKind.ClassDeclaration || node.kind === ts.SyntaxKind.ModuleDeclaration) {
            const interfaceDeclaration = node;
            const triviaStart = interfaceDeclaration.pos;
            const triviaEnd = interfaceDeclaration.name.pos;
            const triviaText = getNodeText(sourceFile, { pos: triviaStart, end: triviaEnd });
            if (triviaText.indexOf('@internal') === -1) {
                all.push(node);
            }
        }
        else {
            const nodeText = getNodeText(sourceFile, node);
            if (nodeText.indexOf('@internal') === -1) {
                all.push(node);
            }
        }
        return false /*continue*/;
    });
    return all;
}
function getTopLevelDeclaration(ts, sourceFile, typeName) {
    let result = null;
    visitTopLevelDeclarations(ts, sourceFile, (node) => {
        if (isDeclaration(ts, node) && node.name) {
            if (node.name.text === typeName) {
                result = node;
                return true /*stop*/;
            }
            return false /*continue*/;
        }
        // node is ts.VariableStatement
        if (getNodeText(sourceFile, node).indexOf(typeName) >= 0) {
            result = node;
            return true /*stop*/;
        }
        return false /*continue*/;
    });
    return result;
}
function getNodeText(sourceFile, node) {
    return sourceFile.getFullText().substring(node.pos, node.end);
}
function hasModifier(modifiers, kind) {
    if (modifiers) {
        for (let i = 0; i < modifiers.length; i++) {
            const mod = modifiers[i];
            if (mod.kind === kind) {
                return true;
            }
        }
    }
    return false;
}
function isStatic(ts, member) {
    if (ts.canHaveModifiers(member)) {
        return hasModifier(ts.getModifiers(member), ts.SyntaxKind.StaticKeyword);
    }
    return false;
}
function isDefaultExport(ts, declaration) {
    return (hasModifier(declaration.modifiers, ts.SyntaxKind.DefaultKeyword)
        && hasModifier(declaration.modifiers, ts.SyntaxKind.ExportKeyword));
}
function getMassagedTopLevelDeclarationText(ts, sourceFile, declaration, importName, usage, enums) {
    let result = getNodeText(sourceFile, declaration);
    if (declaration.kind === ts.SyntaxKind.InterfaceDeclaration || declaration.kind === ts.SyntaxKind.ClassDeclaration) {
        const interfaceDeclaration = declaration;
        const staticTypeName = (isDefaultExport(ts, interfaceDeclaration)
            ? `${importName}.default`
            : `${importName}.${declaration.name.text}`);
        let instanceTypeName = staticTypeName;
        const typeParametersCnt = (interfaceDeclaration.typeParameters ? interfaceDeclaration.typeParameters.length : 0);
        if (typeParametersCnt > 0) {
            const arr = [];
            for (let i = 0; i < typeParametersCnt; i++) {
                arr.push('any');
            }
            instanceTypeName = `${instanceTypeName}<${arr.join(',')}>`;
        }
        const members = interfaceDeclaration.members;
        members.forEach((member) => {
            try {
                const memberText = getNodeText(sourceFile, member);
                if (memberText.indexOf('@internal') >= 0 || memberText.indexOf('private') >= 0) {
                    result = result.replace(memberText, '');
                }
                else {
                    const memberName = member.name.text;
                    const memberAccess = (memberName.indexOf('.') >= 0 ? `['${memberName}']` : `.${memberName}`);
                    if (isStatic(ts, member)) {
                        usage.push(`a = ${staticTypeName}${memberAccess};`);
                    }
                    else {
                        usage.push(`a = (<${instanceTypeName}>b)${memberAccess};`);
                    }
                }
            }
            catch (err) {
                // life..
            }
        });
    }
    result = result.replace(/export default /g, 'export ');
    result = result.replace(/export declare /g, 'export ');
    result = result.replace(/declare /g, '');
    const lines = result.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
        if (/\s*\*/.test(lines[i])) {
            // very likely a comment
            continue;
        }
        lines[i] = lines[i].replace(/"/g, '\'');
    }
    result = lines.join('\n');
    if (declaration.kind === ts.SyntaxKind.EnumDeclaration) {
        result = result.replace(/const enum/, 'enum');
        enums.push({
            enumName: declaration.name.getText(sourceFile),
            text: result
        });
    }
    return result;
}
function format(ts, text, endl) {
    const REALLY_FORMAT = false;
    text = preformat(text, endl);
    if (!REALLY_FORMAT) {
        return text;
    }
    // Parse the source text
    const sourceFile = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, /*setParentPointers*/ true);
    // Get the formatting edits on the input sources
    const edits = ts.formatting.formatDocument(sourceFile, getRuleProvider(tsfmt), tsfmt);
    // Apply the edits on the input code
    return applyEdits(text, edits);
    function countParensCurly(text) {
        let cnt = 0;
        for (let i = 0; i < text.length; i++) {
            if (text.charAt(i) === '(' || text.charAt(i) === '{') {
                cnt++;
            }
            if (text.charAt(i) === ')' || text.charAt(i) === '}') {
                cnt--;
            }
        }
        return cnt;
    }
    function repeatStr(s, cnt) {
        let r = '';
        for (let i = 0; i < cnt; i++) {
            r += s;
        }
        return r;
    }
    function preformat(text, endl) {
        const lines = text.split(endl);
        let inComment = false;
        let inCommentDeltaIndent = 0;
        let indent = 0;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].replace(/\s$/, '');
            let repeat = false;
            let lineIndent = 0;
            do {
                repeat = false;
                if (line.substring(0, 4) === '    ') {
                    line = line.substring(4);
                    lineIndent++;
                    repeat = true;
                }
                if (line.charAt(0) === '\t') {
                    line = line.substring(1);
                    lineIndent++;
                    repeat = true;
                }
            } while (repeat);
            if (line.length === 0) {
                continue;
            }
            if (inComment) {
                if (/\*\//.test(line)) {
                    inComment = false;
                }
                lines[i] = repeatStr('\t', lineIndent + inCommentDeltaIndent) + line;
                continue;
            }
            if (/\/\*/.test(line)) {
                inComment = true;
                inCommentDeltaIndent = indent - lineIndent;
                lines[i] = repeatStr('\t', indent) + line;
                continue;
            }
            const cnt = countParensCurly(line);
            let shouldUnindentAfter = false;
            let shouldUnindentBefore = false;
            if (cnt < 0) {
                if (/[({]/.test(line)) {
                    shouldUnindentAfter = true;
                }
                else {
                    shouldUnindentBefore = true;
                }
            }
            else if (cnt === 0) {
                shouldUnindentBefore = /^\}/.test(line);
            }
            let shouldIndentAfter = false;
            if (cnt > 0) {
                shouldIndentAfter = true;
            }
            else if (cnt === 0) {
                shouldIndentAfter = /{$/.test(line);
            }
            if (shouldUnindentBefore) {
                indent--;
            }
            lines[i] = repeatStr('\t', indent) + line;
            if (shouldUnindentAfter) {
                indent--;
            }
            if (shouldIndentAfter) {
                indent++;
            }
        }
        return lines.join(endl);
    }
    function getRuleProvider(options) {
        // Share this between multiple formatters using the same options.
        // This represents the bulk of the space the formatter uses.
        return ts.formatting.getFormatContext(options);
    }
    function applyEdits(text, edits) {
        // Apply edits in reverse on the existing text
        let result = text;
        for (let i = edits.length - 1; i >= 0; i--) {
            const change = edits[i];
            const head = result.slice(0, change.span.start);
            const tail = result.slice(change.span.start + change.span.length);
            result = head + change.newText + tail;
        }
        return result;
    }
}
function createReplacerFromDirectives(directives) {
    return (str) => {
        for (let i = 0; i < directives.length; i++) {
            str = str.replace(directives[i][0], directives[i][1]);
        }
        return str;
    };
}
function createReplacer(data) {
    data = data || '';
    const rawDirectives = data.split(';');
    const directives = [];
    rawDirectives.forEach((rawDirective) => {
        if (rawDirective.length === 0) {
            return;
        }
        const pieces = rawDirective.split('=>');
        let findStr = pieces[0];
        const replaceStr = pieces[1];
        findStr = findStr.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
        findStr = '\\b' + findStr + '\\b';
        directives.push([new RegExp(findStr, 'g'), replaceStr]);
    });
    return createReplacerFromDirectives(directives);
}
function generateDeclarationFile(ts, recipe, sourceFileGetter) {
    const endl = /\r\n/.test(recipe) ? '\r\n' : '\n';
    const lines = recipe.split(endl);
    const result = [];
    let usageCounter = 0;
    const usageImports = [];
    const usage = [];
    let failed = false;
    usage.push(`var a: any;`);
    usage.push(`var b: any;`);
    const generateUsageImport = (moduleId) => {
        const importName = 'm' + (++usageCounter);
        usageImports.push(`import * as ${importName} from './${moduleId.replace(/\.d\.ts$/, '')}';`);
        return importName;
    };
    const enums = [];
    let version = null;
    lines.forEach(line => {
        if (failed) {
            return;
        }
        const m0 = line.match(/^\/\/dtsv=(\d+)$/);
        if (m0) {
            version = m0[1];
        }
        const m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m1) {
            const moduleId = m1[1];
            const sourceFile = sourceFileGetter(moduleId);
            if (!sourceFile) {
                logErr(`While handling ${line}`);
                logErr(`Cannot find ${moduleId}`);
                failed = true;
                return;
            }
            const importName = generateUsageImport(moduleId);
            const replacer = createReplacer(m1[2]);
            const typeNames = m1[3].split(/,/);
            typeNames.forEach((typeName) => {
                typeName = typeName.trim();
                if (typeName.length === 0) {
                    return;
                }
                const declaration = getTopLevelDeclaration(ts, sourceFile, typeName);
                if (!declaration) {
                    logErr(`While handling ${line}`);
                    logErr(`Cannot find ${typeName}`);
                    failed = true;
                    return;
                }
                result.push(replacer(getMassagedTopLevelDeclarationText(ts, sourceFile, declaration, importName, usage, enums)));
            });
            return;
        }
        const m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m2) {
            const moduleId = m2[1];
            const sourceFile = sourceFileGetter(moduleId);
            if (!sourceFile) {
                logErr(`While handling ${line}`);
                logErr(`Cannot find ${moduleId}`);
                failed = true;
                return;
            }
            const importName = generateUsageImport(moduleId);
            const replacer = createReplacer(m2[2]);
            const typeNames = m2[3].split(/,/);
            const typesToExcludeMap = {};
            const typesToExcludeArr = [];
            typeNames.forEach((typeName) => {
                typeName = typeName.trim();
                if (typeName.length === 0) {
                    return;
                }
                typesToExcludeMap[typeName] = true;
                typesToExcludeArr.push(typeName);
            });
            getAllTopLevelDeclarations(ts, sourceFile).forEach((declaration) => {
                if (isDeclaration(ts, declaration) && declaration.name) {
                    if (typesToExcludeMap[declaration.name.text]) {
                        return;
                    }
                }
                else {
                    // node is ts.VariableStatement
                    const nodeText = getNodeText(sourceFile, declaration);
                    for (let i = 0; i < typesToExcludeArr.length; i++) {
                        if (nodeText.indexOf(typesToExcludeArr[i]) >= 0) {
                            return;
                        }
                    }
                }
                result.push(replacer(getMassagedTopLevelDeclarationText(ts, sourceFile, declaration, importName, usage, enums)));
            });
            return;
        }
        result.push(line);
    });
    if (failed) {
        return null;
    }
    if (version !== dtsv) {
        if (!version) {
            logErr(`gulp watch restart required. 'monaco.d.ts.recipe' is written before versioning was introduced.`);
        }
        else {
            logErr(`gulp watch restart required. 'monaco.d.ts.recipe' v${version} does not match runtime v${dtsv}.`);
        }
        return null;
    }
    let resultTxt = result.join(endl);
    resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');
    resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
    resultTxt = resultTxt.split(/\r\n|\n|\r/).join(endl);
    resultTxt = format(ts, resultTxt, endl);
    resultTxt = resultTxt.split(/\r\n|\n|\r/).join(endl);
    enums.sort((e1, e2) => {
        if (e1.enumName < e2.enumName) {
            return -1;
        }
        if (e1.enumName > e2.enumName) {
            return 1;
        }
        return 0;
    });
    let resultEnums = [
        '/*---------------------------------------------------------------------------------------------',
        ' *  Copyright (c) Microsoft Corporation. All rights reserved.',
        ' *  Licensed under the MIT License. See License.txt in the project root for license information.',
        ' *--------------------------------------------------------------------------------------------*/',
        '',
        '// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
        ''
    ].concat(enums.map(e => e.text)).join(endl);
    resultEnums = resultEnums.split(/\r\n|\n|\r/).join(endl);
    resultEnums = format(ts, resultEnums, endl);
    resultEnums = resultEnums.split(/\r\n|\n|\r/).join(endl);
    return {
        result: resultTxt,
        usageContent: `${usageImports.join('\n')}\n\n${usage.join('\n')}`,
        enums: resultEnums
    };
}
function _run(ts, sourceFileGetter) {
    const recipe = fs_1.default.readFileSync(exports.RECIPE_PATH).toString();
    const t = generateDeclarationFile(ts, recipe, sourceFileGetter);
    if (!t) {
        return null;
    }
    const result = t.result;
    const usageContent = t.usageContent;
    const enums = t.enums;
    const currentContent = fs_1.default.readFileSync(DECLARATION_PATH).toString();
    const one = currentContent.replace(/\r\n/gm, '\n');
    const other = result.replace(/\r\n/gm, '\n');
    const isTheSame = (one === other);
    return {
        content: result,
        usageContent: usageContent,
        enums: enums,
        filePath: DECLARATION_PATH,
        isTheSame
    };
}
class FSProvider {
    existsSync(filePath) {
        return fs_1.default.existsSync(filePath);
    }
    statSync(filePath) {
        return fs_1.default.statSync(filePath);
    }
    readFileSync(_moduleId, filePath) {
        return fs_1.default.readFileSync(filePath);
    }
}
exports.FSProvider = FSProvider;
class CacheEntry {
    sourceFile;
    mtime;
    constructor(sourceFile, mtime) {
        this.sourceFile = sourceFile;
        this.mtime = mtime;
    }
}
class DeclarationResolver {
    _fsProvider;
    ts;
    _sourceFileCache;
    constructor(_fsProvider) {
        this._fsProvider = _fsProvider;
        this.ts = require('typescript');
        this._sourceFileCache = Object.create(null);
    }
    invalidateCache(moduleId) {
        this._sourceFileCache[moduleId] = null;
    }
    getDeclarationSourceFile(moduleId) {
        if (this._sourceFileCache[moduleId]) {
            // Since we cannot trust file watching to invalidate the cache, check also the mtime
            const fileName = this._getFileName(moduleId);
            const mtime = this._fsProvider.statSync(fileName).mtime.getTime();
            if (this._sourceFileCache[moduleId].mtime !== mtime) {
                this._sourceFileCache[moduleId] = null;
            }
        }
        if (!this._sourceFileCache[moduleId]) {
            this._sourceFileCache[moduleId] = this._getDeclarationSourceFile(moduleId);
        }
        return this._sourceFileCache[moduleId] ? this._sourceFileCache[moduleId].sourceFile : null;
    }
    _getFileName(moduleId) {
        if (/\.d\.ts$/.test(moduleId)) {
            return path_1.default.join(SRC, moduleId);
        }
        return path_1.default.join(SRC, `${moduleId}.ts`);
    }
    _getDeclarationSourceFile(moduleId) {
        const fileName = this._getFileName(moduleId);
        if (!this._fsProvider.existsSync(fileName)) {
            return null;
        }
        const mtime = this._fsProvider.statSync(fileName).mtime.getTime();
        if (/\.d\.ts$/.test(moduleId)) {
            // const mtime = this._fsProvider.statFileSync()
            const fileContents = this._fsProvider.readFileSync(moduleId, fileName).toString();
            return new CacheEntry(this.ts.createSourceFile(fileName, fileContents, this.ts.ScriptTarget.ES5), mtime);
        }
        const fileContents = this._fsProvider.readFileSync(moduleId, fileName).toString();
        const fileMap = {
            'file.ts': fileContents
        };
        const service = this.ts.createLanguageService(new TypeScriptLanguageServiceHost(this.ts, {}, fileMap, {}));
        const text = service.getEmitOutput('file.ts', true, true).outputFiles[0].text;
        return new CacheEntry(this.ts.createSourceFile(fileName, text, this.ts.ScriptTarget.ES5), mtime);
    }
}
exports.DeclarationResolver = DeclarationResolver;
function run3(resolver) {
    const sourceFileGetter = (moduleId) => resolver.getDeclarationSourceFile(moduleId);
    return _run(resolver.ts, sourceFileGetter);
}
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
        return 'defaultLib:es5';
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
function execute() {
    const r = run3(new DeclarationResolver(new FSProvider()));
    if (!r) {
        throw new Error(`monaco.d.ts generation error - Cannot continue`);
    }
    return r;
}
//# sourceMappingURL=monaco-api.js.map