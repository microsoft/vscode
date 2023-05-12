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