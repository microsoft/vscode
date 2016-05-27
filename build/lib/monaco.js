/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
// PREREQUISITE:
// SET VSCODE_BUILD_DECLARATION_FILES=1
// run gulp watch once
var fs = require('fs');
var ts = require('typescript');
var path = require('path');
var SRC = path.join(__dirname, '../../src');
var OUT = path.join(__dirname, '../../out');
function moduleIdToPath(moduleId) {
    if (/\.d\.ts/.test(moduleId)) {
        return path.join(SRC, moduleId);
    }
    return path.join(OUT, moduleId) + '.d.ts';
}
var SOURCE_FILE_MAP = {};
function getSourceFile(moduleId) {
    if (!SOURCE_FILE_MAP[moduleId]) {
        var filePath = moduleIdToPath(moduleId);
        var fileContents = fs.readFileSync(filePath).toString();
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
        || a.kind === ts.SyntaxKind.FunctionDeclaration);
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
                stop = visitor(node);
        }
        // if (node.kind !== ts.SyntaxKind.SourceFile) {
        // 	if (getNodeText(sourceFile, node).indexOf('Handler') >= 0) {
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
        if (node.kind === ts.SyntaxKind.InterfaceDeclaration) {
            var interfaceDeclaration = node;
            var triviaStart = interfaceDeclaration.pos;
            var triviaEnd = interfaceDeclaration.name.pos;
            var triviaText = getNodeText(sourceFile, { pos: triviaStart, end: triviaEnd });
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
    if (result === null) {
        console.log('COULD NOT FIND ' + typeName + '!');
    }
    return result;
}
function getNodeText(sourceFile, node) {
    return sourceFile.getFullText().substring(node.pos, node.end);
}
function getMassagedTopLevelDeclarationText(sourceFile, declaration) {
    var result = getNodeText(sourceFile, declaration);
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
            IndentSize: 4,
            TabSize: 4,
            NewLineCharacter: '\r\n',
            ConvertTabsToSpaces: true,
            IndentStyle: ts.IndentStyle.Block,
            InsertSpaceAfterCommaDelimiter: true,
            InsertSpaceAfterSemicolonInForStatements: true,
            InsertSpaceBeforeAndAfterBinaryOperators: true,
            InsertSpaceAfterKeywordsInControlFlowStatements: true,
            InsertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
            InsertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
            InsertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
            InsertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: true,
            PlaceOpenBraceOnNewLineForFunctions: false,
            PlaceOpenBraceOnNewLineForControlBlocks: false,
        };
    }
}
var recipe = fs.readFileSync(path.join(__dirname, './monaco-editor.d.ts.recipe')).toString();
var lines = recipe.split(/\r\n|\n|\r/);
var result = [];
lines.forEach(function (line) {
    var m1 = line.match(/^\s*#include\(([^\)]*)\)\:(.*)$/);
    if (m1) {
        console.log('HANDLING META: ' + line);
        var moduleId = m1[1];
        var sourceFile_1 = getSourceFile(moduleId);
        var typeNames = m1[2].split(/,/);
        typeNames.forEach(function (typeName) {
            typeName = typeName.trim();
            if (typeName.length === 0) {
                return;
            }
            var declaration = getTopLevelDeclaration(sourceFile_1, typeName);
            result.push(getMassagedTopLevelDeclarationText(sourceFile_1, declaration));
        });
        return;
    }
    var m2 = line.match(/^\s*#includeAll\(([^\)]*)\)\:(.*)$/);
    if (m2) {
        console.log('HANDLING META: ' + line);
        var moduleId = m2[1];
        var sourceFile_2 = getSourceFile(moduleId);
        var typeNames = m2[2].split(/,/);
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
            result.push(getMassagedTopLevelDeclarationText(sourceFile_2, declaration));
        });
        return;
    }
    result.push(line);
});
var resultTxt = result.join('\n');
resultTxt = resultTxt.replace(/\beditorCommon\./g, '');
resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');
resultTxt = format(resultTxt);
resultTxt = resultTxt.replace(/\r\n/g, '\n');
fs.writeFileSync(path.join(__dirname, './monaco-editor.d.ts'), resultTxt);
