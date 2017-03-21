/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
var fs = require("fs");
var ts = require("typescript");
var path = require("path");
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
function getMassagedTopLevelDeclarationText(sourceFile, declaration) {
    var result = getNodeText(sourceFile, declaration);
    // if (result.indexOf('MonacoWorker') >= 0) {
    // 	console.log('here!');
    // 	// console.log(ts.SyntaxKind[declaration.kind]);
    // }
    if (declaration.kind === ts.SyntaxKind.InterfaceDeclaration || declaration.kind === ts.SyntaxKind.ClassDeclaration) {
        var interfaceDeclaration = declaration;
        var members = interfaceDeclaration.members;
        members.forEach(function (member) {
            try {
                var memberText = getNodeText(sourceFile, member);
                if (memberText.indexOf('@internal') >= 0 || memberText.indexOf('private') >= 0) {
                    // console.log('BEFORE: ', result);
                    result = result.replace(memberText, '');
                }
            }
            catch (err) {
            }
        });
    }
    result = result.replace(/export default/g, 'export');
    result = result.replace(/export declare/g, 'export');
    return result;
}
function format(text) {
    var options = getDefaultOptions();
    // Parse the source text
    var sourceFile = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, /*setParentPointers*/ true);
    // Get the formatting edits on the input sources
    var edits = ts.formatting.formatDocument(sourceFile, getRuleProvider(options), options);
    // Apply the edits on the input code
    return applyEdits(text, edits);
    function getRuleProvider(options) {
        // Share this between multiple formatters using the same options.
        // This represents the bulk of the space the formatter uses.
        var ruleProvider = new ts.formatting.RulesProvider();
        ruleProvider.ensureUpToDate(options);
        return ruleProvider;
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
    function getDefaultOptions() {
        return {
            indentSize: 4,
            tabSize: 4,
            newLineCharacter: '\r\n',
            convertTabsToSpaces: true,
            indentStyle: ts.IndentStyle.Block,
            insertSpaceAfterCommaDelimiter: true,
            insertSpaceAfterSemicolonInForStatements: true,
            insertSpaceBeforeAndAfterBinaryOperators: true,
            insertSpaceAfterKeywordsInControlFlowStatements: true,
            insertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
            insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
            insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
            insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: true,
            placeOpenBraceOnNewLineForFunctions: false,
            placeOpenBraceOnNewLineForControlBlocks: false,
        };
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
    var lines = recipe.split(/\r\n|\n|\r/);
    var result = [];
    lines.forEach(function (line) {
        var m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m1) {
            CURRENT_PROCESSING_RULE = line;
            var moduleId = m1[1];
            var sourceFile_1 = getSourceFile(out, inputFiles, moduleId);
            if (!sourceFile_1) {
                return;
            }
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
                result.push(replacer_1(getMassagedTopLevelDeclarationText(sourceFile_1, declaration)));
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
                result.push(replacer_2(getMassagedTopLevelDeclarationText(sourceFile_2, declaration)));
            });
            return;
        }
        result.push(line);
    });
    var resultTxt = result.join('\n');
    resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');
    resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
    resultTxt = resultTxt.replace(/\bTPromise</g, 'Promise<');
    resultTxt = format(resultTxt);
    resultTxt = resultTxt.replace(/\r\n/g, '\n');
    return resultTxt;
}
function getFilesToWatch(out) {
    var recipe = fs.readFileSync(RECIPE_PATH).toString();
    var lines = recipe.split(/\r\n|\n|\r/);
    var result = [];
    lines.forEach(function (line) {
        var m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m1) {
            var moduleId = m1[1];
            result.push(moduleIdToPath(out, moduleId));
            return;
        }
        var m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m2) {
            var moduleId = m2[1];
            result.push(moduleIdToPath(out, moduleId));
            return;
        }
    });
    return result;
}
exports.getFilesToWatch = getFilesToWatch;
function run(out, inputFiles) {
    log('Starting monaco.d.ts generation');
    SOURCE_FILE_MAP = {};
    var recipe = fs.readFileSync(RECIPE_PATH).toString();
    var result = generateDeclarationFile(out, inputFiles, recipe);
    var currentContent = fs.readFileSync(DECLARATION_PATH).toString();
    log('Finished monaco.d.ts generation');
    return {
        content: result,
        filePath: DECLARATION_PATH,
        isTheSame: currentContent === result
    };
}
exports.run = run;
function complainErrors() {
    logErr('Not running monaco.d.ts generation due to compile errors');
}
exports.complainErrors = complainErrors;
