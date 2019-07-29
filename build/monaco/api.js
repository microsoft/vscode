"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const ts = require("typescript");
const path = require("path");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const dtsv = '2';
const tsfmt = require('../../tsfmt.json');
const SRC = path.join(__dirname, '../../src');
exports.RECIPE_PATH = path.join(__dirname, './monaco.d.ts.recipe');
const DECLARATION_PATH = path.join(__dirname, '../../src/vs/monaco.d.ts');
function logErr(message, ...rest) {
    fancyLog(ansiColors.yellow(`[monaco.d.ts]`), message, ...rest);
}
function isDeclaration(a) {
    return (a.kind === ts.SyntaxKind.InterfaceDeclaration
        || a.kind === ts.SyntaxKind.EnumDeclaration
        || a.kind === ts.SyntaxKind.ClassDeclaration
        || a.kind === ts.SyntaxKind.TypeAliasDeclaration
        || a.kind === ts.SyntaxKind.FunctionDeclaration
        || a.kind === ts.SyntaxKind.ModuleDeclaration);
}
function visitTopLevelDeclarations(sourceFile, visitor) {
    let stop = false;
    let visit = (node) => {
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
function getAllTopLevelDeclarations(sourceFile) {
    let all = [];
    visitTopLevelDeclarations(sourceFile, (node) => {
        if (node.kind === ts.SyntaxKind.InterfaceDeclaration || node.kind === ts.SyntaxKind.ClassDeclaration || node.kind === ts.SyntaxKind.ModuleDeclaration) {
            let interfaceDeclaration = node;
            let triviaStart = interfaceDeclaration.pos;
            let triviaEnd = interfaceDeclaration.name.pos;
            let triviaText = getNodeText(sourceFile, { pos: triviaStart, end: triviaEnd });
            if (triviaText.indexOf('@internal') === -1) {
                all.push(node);
            }
        }
        else {
            let nodeText = getNodeText(sourceFile, node);
            if (nodeText.indexOf('@internal') === -1) {
                all.push(node);
            }
        }
        return false /*continue*/;
    });
    return all;
}
function getTopLevelDeclaration(sourceFile, typeName) {
    let result = null;
    visitTopLevelDeclarations(sourceFile, (node) => {
        if (isDeclaration(node) && node.name) {
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
            let mod = modifiers[i];
            if (mod.kind === kind) {
                return true;
            }
        }
    }
    return false;
}
function isStatic(member) {
    return hasModifier(member.modifiers, ts.SyntaxKind.StaticKeyword);
}
function isDefaultExport(declaration) {
    return (hasModifier(declaration.modifiers, ts.SyntaxKind.DefaultKeyword)
        && hasModifier(declaration.modifiers, ts.SyntaxKind.ExportKeyword));
}
function getMassagedTopLevelDeclarationText(sourceFile, declaration, importName, usage, enums) {
    let result = getNodeText(sourceFile, declaration);
    if (declaration.kind === ts.SyntaxKind.InterfaceDeclaration || declaration.kind === ts.SyntaxKind.ClassDeclaration) {
        let interfaceDeclaration = declaration;
        const staticTypeName = (isDefaultExport(interfaceDeclaration)
            ? `${importName}.default`
            : `${importName}.${declaration.name.text}`);
        let instanceTypeName = staticTypeName;
        const typeParametersCnt = (interfaceDeclaration.typeParameters ? interfaceDeclaration.typeParameters.length : 0);
        if (typeParametersCnt > 0) {
            let arr = [];
            for (let i = 0; i < typeParametersCnt; i++) {
                arr.push('any');
            }
            instanceTypeName = `${instanceTypeName}<${arr.join(',')}>`;
        }
        const members = interfaceDeclaration.members;
        members.forEach((member) => {
            try {
                let memberText = getNodeText(sourceFile, member);
                if (memberText.indexOf('@internal') >= 0 || memberText.indexOf('private') >= 0) {
                    result = result.replace(memberText, '');
                }
                else {
                    const memberName = member.name.text;
                    if (isStatic(member)) {
                        usage.push(`a = ${staticTypeName}.${memberName};`);
                    }
                    else {
                        usage.push(`a = (<${instanceTypeName}>b).${memberName};`);
                    }
                }
            }
            catch (err) {
                // life..
            }
        });
    }
    result = result.replace(/export default/g, 'export');
    result = result.replace(/export declare/g, 'export');
    if (declaration.kind === ts.SyntaxKind.EnumDeclaration) {
        result = result.replace(/const enum/, 'enum');
        enums.push(result);
    }
    return result;
}
function format(text, endl) {
    const REALLY_FORMAT = false;
    text = preformat(text, endl);
    if (!REALLY_FORMAT) {
        return text;
    }
    // Parse the source text
    let sourceFile = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, /*setParentPointers*/ true);
    // Get the formatting edits on the input sources
    let edits = ts.formatting.formatDocument(sourceFile, getRuleProvider(tsfmt), tsfmt);
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
        let lines = text.split(endl);
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
            let change = edits[i];
            let head = result.slice(0, change.span.start);
            let tail = result.slice(change.span.start + change.span.length);
            result = head + change.newText + tail;
        }
        return result;
    }
}
function createReplacer(data) {
    data = data || '';
    let rawDirectives = data.split(';');
    let directives = [];
    rawDirectives.forEach((rawDirective) => {
        if (rawDirective.length === 0) {
            return;
        }
        let pieces = rawDirective.split('=>');
        let findStr = pieces[0];
        let replaceStr = pieces[1];
        findStr = findStr.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
        findStr = '\\b' + findStr + '\\b';
        directives.push([new RegExp(findStr, 'g'), replaceStr]);
    });
    return (str) => {
        for (let i = 0; i < directives.length; i++) {
            str = str.replace(directives[i][0], directives[i][1]);
        }
        return str;
    };
}
function generateDeclarationFile(recipe, sourceFileGetter) {
    const endl = /\r\n/.test(recipe) ? '\r\n' : '\n';
    let lines = recipe.split(endl);
    let result = [];
    let usageCounter = 0;
    let usageImports = [];
    let usage = [];
    let failed = false;
    usage.push(`var a: any;`);
    usage.push(`var b: any;`);
    const generateUsageImport = (moduleId) => {
        let importName = 'm' + (++usageCounter);
        usageImports.push(`import * as ${importName} from './${moduleId.replace(/\.d\.ts$/, '')}';`);
        return importName;
    };
    let enums = [];
    let version = null;
    lines.forEach(line => {
        if (failed) {
            return;
        }
        let m0 = line.match(/^\/\/dtsv=(\d+)$/);
        if (m0) {
            version = m0[1];
        }
        let m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m1) {
            let moduleId = m1[1];
            const sourceFile = sourceFileGetter(moduleId);
            if (!sourceFile) {
                logErr(`While handling ${line}`);
                logErr(`Cannot find ${moduleId}`);
                failed = true;
                return;
            }
            const importName = generateUsageImport(moduleId);
            let replacer = createReplacer(m1[2]);
            let typeNames = m1[3].split(/,/);
            typeNames.forEach((typeName) => {
                typeName = typeName.trim();
                if (typeName.length === 0) {
                    return;
                }
                let declaration = getTopLevelDeclaration(sourceFile, typeName);
                if (!declaration) {
                    logErr(`While handling ${line}`);
                    logErr(`Cannot find ${typeName}`);
                    failed = true;
                    return;
                }
                result.push(replacer(getMassagedTopLevelDeclarationText(sourceFile, declaration, importName, usage, enums)));
            });
            return;
        }
        let m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m2) {
            let moduleId = m2[1];
            const sourceFile = sourceFileGetter(moduleId);
            if (!sourceFile) {
                logErr(`While handling ${line}`);
                logErr(`Cannot find ${moduleId}`);
                failed = true;
                return;
            }
            const importName = generateUsageImport(moduleId);
            let replacer = createReplacer(m2[2]);
            let typeNames = m2[3].split(/,/);
            let typesToExcludeMap = {};
            let typesToExcludeArr = [];
            typeNames.forEach((typeName) => {
                typeName = typeName.trim();
                if (typeName.length === 0) {
                    return;
                }
                typesToExcludeMap[typeName] = true;
                typesToExcludeArr.push(typeName);
            });
            getAllTopLevelDeclarations(sourceFile).forEach((declaration) => {
                if (isDeclaration(declaration) && declaration.name) {
                    if (typesToExcludeMap[declaration.name.text]) {
                        return;
                    }
                }
                else {
                    // node is ts.VariableStatement
                    let nodeText = getNodeText(sourceFile, declaration);
                    for (let i = 0; i < typesToExcludeArr.length; i++) {
                        if (nodeText.indexOf(typesToExcludeArr[i]) >= 0) {
                            return;
                        }
                    }
                }
                result.push(replacer(getMassagedTopLevelDeclarationText(sourceFile, declaration, importName, usage, enums)));
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
    resultTxt = format(resultTxt, endl);
    resultTxt = resultTxt.split(/\r\n|\n|\r/).join(endl);
    let resultEnums = [
        '/*---------------------------------------------------------------------------------------------',
        ' *  Copyright (c) Microsoft Corporation. All rights reserved.',
        ' *  Licensed under the MIT License. See License.txt in the project root for license information.',
        ' *--------------------------------------------------------------------------------------------*/',
        '',
        '// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
        ''
    ].concat(enums).join(endl);
    resultEnums = resultEnums.split(/\r\n|\n|\r/).join(endl);
    resultEnums = format(resultEnums, endl);
    resultEnums = resultEnums.split(/\r\n|\n|\r/).join(endl);
    return {
        result: resultTxt,
        usageContent: `${usageImports.join('\n')}\n\n${usage.join('\n')}`,
        enums: resultEnums
    };
}
function _run(sourceFileGetter) {
    const recipe = fs.readFileSync(exports.RECIPE_PATH).toString();
    const t = generateDeclarationFile(recipe, sourceFileGetter);
    if (!t) {
        return null;
    }
    const result = t.result;
    const usageContent = t.usageContent;
    const enums = t.enums;
    const currentContent = fs.readFileSync(DECLARATION_PATH).toString();
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
        return fs.existsSync(filePath);
    }
    statSync(filePath) {
        return fs.statSync(filePath);
    }
    readFileSync(_moduleId, filePath) {
        return fs.readFileSync(filePath);
    }
}
exports.FSProvider = FSProvider;
class CacheEntry {
    constructor(sourceFile, mtime) {
        this.sourceFile = sourceFile;
        this.mtime = mtime;
    }
}
class DeclarationResolver {
    constructor(_fsProvider) {
        this._fsProvider = _fsProvider;
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
            return path.join(SRC, moduleId);
        }
        return path.join(SRC, `${moduleId}.ts`);
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
            return new CacheEntry(ts.createSourceFile(fileName, fileContents, ts.ScriptTarget.ES5), mtime);
        }
        const fileContents = this._fsProvider.readFileSync(moduleId, fileName).toString();
        const fileMap = {
            'file.ts': fileContents
        };
        const service = ts.createLanguageService(new TypeScriptLanguageServiceHost({}, fileMap, {}));
        const text = service.getEmitOutput('file.ts', true).outputFiles[0].text;
        return new CacheEntry(ts.createSourceFile(fileName, text, ts.ScriptTarget.ES5), mtime);
    }
}
exports.DeclarationResolver = DeclarationResolver;
function run3(resolver) {
    const sourceFileGetter = (moduleId) => resolver.getDeclarationSourceFile(moduleId);
    return _run(sourceFileGetter);
}
exports.run3 = run3;
class TypeScriptLanguageServiceHost {
    constructor(libs, files, compilerOptions) {
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
            return ts.ScriptSnapshot.fromString(this._files[fileName]);
        }
        else if (this._libs.hasOwnProperty(fileName)) {
            return ts.ScriptSnapshot.fromString(this._libs[fileName]);
        }
        else {
            return ts.ScriptSnapshot.fromString('');
        }
    }
    getScriptKind(_fileName) {
        return ts.ScriptKind.TS;
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
}
function execute() {
    let r = run3(new DeclarationResolver(new FSProvider()));
    if (!r) {
        throw new Error(`monaco.d.ts generation error - Cannot continue`);
    }
    return r;
}
exports.execute = execute;
