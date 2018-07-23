"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var ts = require("typescript");
var path = require("path");
var tsfmt = require('../../tsfmt.json');
var util = require('gulp-util');
function log(message) {
    var rest = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        rest[_i - 1] = arguments[_i];
    }
    util.log.apply(util, [util.colors.cyan('[monaco.d.ts]'), message].concat(rest));
}
var SRC = path.join(__dirname, '../../src');
var OUT_ROOT = path.join(__dirname, '../../');
var RECIPE_PATH = path.join(__dirname, './monaco.d.ts.recipe');
var DECLARATION_PATH = path.join(__dirname, '../../src/vs/monaco.d.ts');
var CURRENT_PROCESSING_RULE = '';
function logErr(message) {
    var rest = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        rest[_i - 1] = arguments[_i];
    }
    util.log(util.colors.red('[monaco.d.ts]'), 'WHILE HANDLING RULE: ', CURRENT_PROCESSING_RULE);
    util.log.apply(util, [util.colors.red('[monaco.d.ts]'), message].concat(rest));
}
function moduleIdToPath(out, moduleId) {
    if (/\.d\.ts/.test(moduleId)) {
        return path.join(SRC, moduleId);
    }
    return path.join(OUT_ROOT, out, moduleId) + '.d.ts';
}
var SOURCE_FILE_MAP = {};
function getSourceFile(out, inputFiles, moduleId) {
    if (!SOURCE_FILE_MAP[moduleId]) {
        var filePath = path.normalize(moduleIdToPath(out, moduleId));
        if (!inputFiles.hasOwnProperty(filePath)) {
            logErr('CANNOT FIND FILE ' + filePath + '. YOU MIGHT NEED TO RESTART gulp');
            return null;
        }
        var fileContents = inputFiles[filePath];
        var sourceFile = ts.createSourceFile(filePath, fileContents, ts.ScriptTarget.ES5);
        SOURCE_FILE_MAP[moduleId] = sourceFile;
    }
    return SOURCE_FILE_MAP[moduleId];
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
    var stop = false;
    var visit = function (node) {
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
        // if (node.kind !== ts.SyntaxKind.SourceFile) {
        // 	if (getNodeText(sourceFile, node).indexOf('SymbolKind') >= 0) {
        // 		console.log('FOUND TEXT IN NODE: ' + ts.SyntaxKind[node.kind]);
        // 		console.log(getNodeText(sourceFile, node));
        // 	}
        // }
        if (stop) {
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}
function getAllTopLevelDeclarations(sourceFile) {
    var all = [];
    visitTopLevelDeclarations(sourceFile, function (node) {
        if (node.kind === ts.SyntaxKind.InterfaceDeclaration || node.kind === ts.SyntaxKind.ClassDeclaration || node.kind === ts.SyntaxKind.ModuleDeclaration) {
            var interfaceDeclaration = node;
            var triviaStart = interfaceDeclaration.pos;
            var triviaEnd = interfaceDeclaration.name.pos;
            var triviaText = getNodeText(sourceFile, { pos: triviaStart, end: triviaEnd });
            // // let nodeText = getNodeText(sourceFile, node);
            // if (getNodeText(sourceFile, node).indexOf('SymbolKind') >= 0) {
            // 	console.log('TRIVIA: ', triviaText);
            // }
            if (triviaText.indexOf('@internal') === -1) {
                all.push(node);
            }
        }
        else {
            var nodeText = getNodeText(sourceFile, node);
            if (nodeText.indexOf('@internal') === -1) {
                all.push(node);
            }
        }
        return false /*continue*/;
    });
    return all;
}
function getTopLevelDeclaration(sourceFile, typeName) {
    var result = null;
    visitTopLevelDeclarations(sourceFile, function (node) {
        if (isDeclaration(node)) {
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
        for (var i = 0; i < modifiers.length; i++) {
            var mod = modifiers[i];
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
function getMassagedTopLevelDeclarationText(sourceFile, declaration, importName, usage) {
    var result = getNodeText(sourceFile, declaration);
    // if (result.indexOf('MonacoWorker') >= 0) {
    // 	console.log('here!');
    // 	// console.log(ts.SyntaxKind[declaration.kind]);
    // }
    if (declaration.kind === ts.SyntaxKind.InterfaceDeclaration || declaration.kind === ts.SyntaxKind.ClassDeclaration) {
        var interfaceDeclaration = declaration;
        var staticTypeName_1 = (isDefaultExport(interfaceDeclaration)
            ? importName + ".default"
            : importName + "." + declaration.name.text);
        var instanceTypeName_1 = staticTypeName_1;
        var typeParametersCnt = (interfaceDeclaration.typeParameters ? interfaceDeclaration.typeParameters.length : 0);
        if (typeParametersCnt > 0) {
            var arr = [];
            for (var i = 0; i < typeParametersCnt; i++) {
                arr.push('any');
            }
            instanceTypeName_1 = instanceTypeName_1 + "<" + arr.join(',') + ">";
        }
        var members = interfaceDeclaration.members;
        members.forEach(function (member) {
            try {
                var memberText = getNodeText(sourceFile, member);
                if (memberText.indexOf('@internal') >= 0 || memberText.indexOf('private') >= 0) {
                    // console.log('BEFORE: ', result);
                    result = result.replace(memberText, '');
                    // console.log('AFTER: ', result);
                }
                else {
                    var memberName = member.name.text;
                    if (isStatic(member)) {
                        usage.push("a = " + staticTypeName_1 + "." + memberName + ";");
                    }
                    else {
                        usage.push("a = (<" + instanceTypeName_1 + ">b)." + memberName + ";");
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
    return result;
}
function format(text) {
    // Parse the source text
    var sourceFile = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, /*setParentPointers*/ true);
    // Get the formatting edits on the input sources
    var edits = ts.formatting.formatDocument(sourceFile, getRuleProvider(tsfmt), tsfmt);
    // Apply the edits on the input code
    return applyEdits(text, edits);
    function getRuleProvider(options) {
        // Share this between multiple formatters using the same options.
        // This represents the bulk of the space the formatter uses.
        return ts.formatting.getFormatContext(options);
    }
    function applyEdits(text, edits) {
        // Apply edits in reverse on the existing text
        var result = text;
        for (var i = edits.length - 1; i >= 0; i--) {
            var change = edits[i];
            var head = result.slice(0, change.span.start);
            var tail = result.slice(change.span.start + change.span.length);
            result = head + change.newText + tail;
        }
        return result;
    }
}
function createReplacer(data) {
    data = data || '';
    var rawDirectives = data.split(';');
    var directives = [];
    rawDirectives.forEach(function (rawDirective) {
        if (rawDirective.length === 0) {
            return;
        }
        var pieces = rawDirective.split('=>');
        var findStr = pieces[0];
        var replaceStr = pieces[1];
        findStr = findStr.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
        findStr = '\\b' + findStr + '\\b';
        directives.push([new RegExp(findStr, 'g'), replaceStr]);
    });
    return function (str) {
        for (var i = 0; i < directives.length; i++) {
            str = str.replace(directives[i][0], directives[i][1]);
        }
        return str;
    };
}
function generateDeclarationFile(out, inputFiles, recipe) {
    var endl = /\r\n/.test(recipe) ? '\r\n' : '\n';
    var lines = recipe.split(endl);
    var result = [];
    var usageCounter = 0;
    var usageImports = [];
    var usage = [];
    usage.push("var a;");
    usage.push("var b;");
    var generateUsageImport = function (moduleId) {
        var importName = 'm' + (++usageCounter);
        usageImports.push("import * as " + importName + " from '" + moduleId.replace(/\.d\.ts$/, '') + "';");
        return importName;
    };
    lines.forEach(function (line) {
        var m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m1) {
            CURRENT_PROCESSING_RULE = line;
            var moduleId = m1[1];
            var sourceFile_1 = getSourceFile(out, inputFiles, moduleId);
            if (!sourceFile_1) {
                return;
            }
            var importName_1 = generateUsageImport(moduleId);
            var replacer_1 = createReplacer(m1[2]);
            var typeNames = m1[3].split(/,/);
            typeNames.forEach(function (typeName) {
                typeName = typeName.trim();
                if (typeName.length === 0) {
                    return;
                }
                var declaration = getTopLevelDeclaration(sourceFile_1, typeName);
                if (!declaration) {
                    logErr('Cannot find type ' + typeName);
                    return;
                }
                result.push(replacer_1(getMassagedTopLevelDeclarationText(sourceFile_1, declaration, importName_1, usage)));
            });
            return;
        }
        var m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m2) {
            CURRENT_PROCESSING_RULE = line;
            var moduleId = m2[1];
            var sourceFile_2 = getSourceFile(out, inputFiles, moduleId);
            if (!sourceFile_2) {
                return;
            }
            var importName_2 = generateUsageImport(moduleId);
            var replacer_2 = createReplacer(m2[2]);
            var typeNames = m2[3].split(/,/);
            var typesToExcludeMap_1 = {};
            var typesToExcludeArr_1 = [];
            typeNames.forEach(function (typeName) {
                typeName = typeName.trim();
                if (typeName.length === 0) {
                    return;
                }
                typesToExcludeMap_1[typeName] = true;
                typesToExcludeArr_1.push(typeName);
            });
            getAllTopLevelDeclarations(sourceFile_2).forEach(function (declaration) {
                if (isDeclaration(declaration)) {
                    if (typesToExcludeMap_1[declaration.name.text]) {
                        return;
                    }
                }
                else {
                    // node is ts.VariableStatement
                    var nodeText = getNodeText(sourceFile_2, declaration);
                    for (var i = 0; i < typesToExcludeArr_1.length; i++) {
                        if (nodeText.indexOf(typesToExcludeArr_1[i]) >= 0) {
                            return;
                        }
                    }
                }
                result.push(replacer_2(getMassagedTopLevelDeclarationText(sourceFile_2, declaration, importName_2, usage)));
            });
            return;
        }
        result.push(line);
    });
    var resultTxt = result.join(endl);
    resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');
    resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
    resultTxt = resultTxt.replace(/\bTPromise</g, 'Promise<');
    resultTxt = format(resultTxt);
    return [
        resultTxt,
        usageImports.join('\n') + "\n\n" + usage.join('\n')
    ];
}
function getIncludesInRecipe() {
    var recipe = fs.readFileSync(RECIPE_PATH).toString();
    var lines = recipe.split(/\r\n|\n|\r/);
    var result = [];
    lines.forEach(function (line) {
        var m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m1) {
            var moduleId = m1[1];
            result.push(moduleId);
            return;
        }
        var m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m2) {
            var moduleId = m2[1];
            result.push(moduleId);
            return;
        }
    });
    return result;
}
function getFilesToWatch(out) {
    return getIncludesInRecipe().map(function (moduleId) { return moduleIdToPath(out, moduleId); });
}
exports.getFilesToWatch = getFilesToWatch;
function run(out, inputFiles) {
    log('Starting monaco.d.ts generation');
    SOURCE_FILE_MAP = {};
    var recipe = fs.readFileSync(RECIPE_PATH).toString();
    var _a = generateDeclarationFile(out, inputFiles, recipe), result = _a[0], usageContent = _a[1];
    var currentContent = fs.readFileSync(DECLARATION_PATH).toString();
    log('Finished monaco.d.ts generation');
    var one = currentContent.replace(/\r\n/gm, '\n');
    var other = result.replace(/\r\n/gm, '\n');
    var isTheSame = one === other;
    return {
        content: result,
        usageContent: usageContent,
        filePath: DECLARATION_PATH,
        isTheSame: isTheSame
    };
}
exports.run = run;
function complainErrors() {
    logErr('Not running monaco.d.ts generation due to compile errors');
}
exports.complainErrors = complainErrors;
var TypeScriptLanguageServiceHost = /** @class */ (function () {
    function TypeScriptLanguageServiceHost(libs, files, compilerOptions) {
        this._libs = libs;
        this._files = files;
        this._compilerOptions = compilerOptions;
    }
    // --- language service host ---------------
    TypeScriptLanguageServiceHost.prototype.getCompilationSettings = function () {
        return this._compilerOptions;
    };
    TypeScriptLanguageServiceHost.prototype.getScriptFileNames = function () {
        return ([]
            .concat(Object.keys(this._libs))
            .concat(Object.keys(this._files)));
    };
    TypeScriptLanguageServiceHost.prototype.getScriptVersion = function (fileName) {
        return '1';
    };
    TypeScriptLanguageServiceHost.prototype.getProjectVersion = function () {
        return '1';
    };
    TypeScriptLanguageServiceHost.prototype.getScriptSnapshot = function (fileName) {
        if (this._files.hasOwnProperty(fileName)) {
            return ts.ScriptSnapshot.fromString(this._files[fileName]);
        }
        else if (this._libs.hasOwnProperty(fileName)) {
            return ts.ScriptSnapshot.fromString(this._libs[fileName]);
        }
        else {
            return ts.ScriptSnapshot.fromString('');
        }
    };
    TypeScriptLanguageServiceHost.prototype.getScriptKind = function (fileName) {
        return ts.ScriptKind.TS;
    };
    TypeScriptLanguageServiceHost.prototype.getCurrentDirectory = function () {
        return '';
    };
    TypeScriptLanguageServiceHost.prototype.getDefaultLibFileName = function (options) {
        return 'defaultLib:es5';
    };
    TypeScriptLanguageServiceHost.prototype.isDefaultLibFileName = function (fileName) {
        return fileName === this.getDefaultLibFileName(this._compilerOptions);
    };
    return TypeScriptLanguageServiceHost;
}());
function execute() {
    var OUTPUT_FILES = {};
    var SRC_FILES = {};
    var SRC_FILE_TO_EXPECTED_NAME = {};
    getIncludesInRecipe().forEach(function (moduleId) {
        if (/\.d\.ts$/.test(moduleId)) {
            var fileName_1 = path.join(SRC, moduleId);
            OUTPUT_FILES[moduleIdToPath('src', moduleId)] = fs.readFileSync(fileName_1).toString();
            return;
        }
        var fileName = path.join(SRC, moduleId) + '.ts';
        SRC_FILES[fileName] = fs.readFileSync(fileName).toString();
        SRC_FILE_TO_EXPECTED_NAME[fileName] = moduleIdToPath('src', moduleId);
    });
    var languageService = ts.createLanguageService(new TypeScriptLanguageServiceHost({}, SRC_FILES, {}));
    var t1 = Date.now();
    Object.keys(SRC_FILES).forEach(function (fileName) {
        var t = Date.now();
        var emitOutput = languageService.getEmitOutput(fileName, true);
        OUTPUT_FILES[SRC_FILE_TO_EXPECTED_NAME[fileName]] = emitOutput.outputFiles[0].text;
        // console.log(`Generating .d.ts for ${fileName} took ${Date.now() - t} ms`);
    });
    console.log("Generating .d.ts took " + (Date.now() - t1) + " ms");
    // console.log(result.filePath);
    // fs.writeFileSync(result.filePath, result.content.replace(/\r\n/gm, '\n'));
    // fs.writeFileSync(path.join(SRC, 'user.ts'), result.usageContent.replace(/\r\n/gm, '\n'));
    return run('src', OUTPUT_FILES);
}
exports.execute = execute;
