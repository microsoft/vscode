"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = exports.run3 = exports.DeclarationResolver = exports.FSProvider = exports.RECIPE_PATH = void 0;
const fs = require("fs");
const path = require("path");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const dtsv = '3';
const tsfmt = require('../../tsfmt.json');
const SRC = path.join(__dirname, '../../src');
exports.RECIPE_PATH = path.join(__dirname, '../monaco/monaco.d.ts.recipe');
const DECLARATION_PATH = path.join(__dirname, '../../src/vs/monaco.d.ts');
function logErr(message, ...rest) {
    fancyLog(ansiColors.yellow(`[monaco.d.ts]`), message, ...rest);
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
    return hasModifier(member.modifiers, ts.SyntaxKind.StaticKeyword);
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
    const recipe = fs.readFileSync(exports.RECIPE_PATH).toString();
    const t = generateDeclarationFile(ts, recipe, sourceFileGetter);
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
exports.run3 = run3;
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
exports.execute = execute;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uYWNvLWFwaS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vbmFjby1hcGkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBRXpCLDZCQUE2QjtBQUM3QixzQ0FBc0M7QUFDdEMsMENBQTBDO0FBRTFDLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQztBQUVqQixNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUUxQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUNqQyxRQUFBLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO0FBQ2hGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztBQUUxRSxTQUFTLE1BQU0sQ0FBQyxPQUFZLEVBQUUsR0FBRyxJQUFXO0lBQzNDLFFBQVEsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQ2hFLENBQUM7QUFPRCxTQUFTLGFBQWEsQ0FBQyxFQUErQixFQUFFLENBQW9CO0lBQzNFLE9BQU8sQ0FDTixDQUFDLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsb0JBQW9CO1dBQzFDLENBQUMsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxlQUFlO1dBQ3hDLENBQUMsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0I7V0FDekMsQ0FBQyxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLG9CQUFvQjtXQUM3QyxDQUFDLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsbUJBQW1CO1dB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